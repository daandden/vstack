import { mkdir, open, readFile, rename, readdir, link, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { Ticket } from "./publisher.ts";
import { mcpTracker } from "./mcp.ts";

export type Issue = { id: string; title: string; body: string; labels: string[]; parent?: string; blockedBy: string[]; author: string; createdAt: string };
export type Connection = { listTools(server: string): Promise<Tool[]>; callTool(server: string, name: string, arguments_: Record<string, unknown>): Promise<unknown> };
export type Tool = { name: string; description: string; inputSchema: { type?: string; properties?: Record<string, { type?: string; description?: string; enum?: unknown[] }>; required?: string[] } };
export class KnownFailure extends Error {
  constructor(message: string, public category = "known-failure") { super(message); }
}
export type Tracker = { idempotentCreate?: boolean; check(): Promise<void>; owner(): Promise<string>; search(ticket: Ticket): Promise<Issue[]>; create(ticket: Ticket, key: string): Promise<{ id: string }>; read(id: string): Promise<Issue>; parent(id: string, parent: string): Promise<unknown>; block(id: string, blocker: string): Promise<unknown>; activate(id: string, readiness: string): Promise<unknown> };
function local(directory: string, readiness: string): Tracker {
  const root = resolve(directory);
  const path = (id: string) => {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new KnownFailure("Invalid local ticket identity");
    return join(root, `${id}.md`);
  };
  const parentExists = async (parent: string) => {
    const target = parent.includes("/") || parent.endsWith(".md") ? resolve(root, parent) : path(parent);
    if (!(await stat(target)).isFile()) throw new KnownFailure(`Local parent is not a regular file: ${parent}`);
  };
  type LocalIssue = Issue & { status: string };
  const read = async (id: string): Promise<LocalIssue> => {
    const content = await readFile(path(id), "utf8");
    const match = content.match(/^```json\n([\s\S]*?)\n```\nStatus: ([^\n]+)\nBlocked by: ([^\n]+)\n\n/);
    if (!match) throw new KnownFailure(`Invalid local ticket metadata: ${id}`);
    const metadata = JSON.parse(match[1]);
    if (metadata.id !== id) throw new KnownFailure(`Local ticket identity differs from its filename: ${id}`, "local-identity-conflict");
    const status = match[2], blockedBy = match[3] === "None" ? [] : match[3].split(", ");
    if (metadata.parent) await parentExists(metadata.parent);
    for (const target of blockedBy) await readFile(path(target), "utf8");
    const labels = metadata.labels.filter((label: string) => label !== readiness);
    if ([readiness, "claimed", "resolved"].includes(status)) labels.push(readiness);
    return { ...metadata, status, labels, blockedBy, body: content.slice(match[0].length) };
  };
  const write = async (issue: LocalIssue, create = false) => {
    const { body, status, blockedBy, ...metadata } = issue;
    metadata.labels = metadata.labels.filter(label => label !== readiness);
    const contents = `\`\`\`json\n${JSON.stringify(metadata, null, 2)}\n\`\`\`\nStatus: ${status}\nBlocked by: ${blockedBy.length ? blockedBy.join(", ") : "None"}\n\n${body}`;
    const temporary = join(root, `.${randomUUID()}.tmp`);
    const file = await open(temporary, "wx", 0o600);
    try {
      try { await file.writeFile(contents); await file.sync(); } finally { await file.close(); }
      if (create) {
        try { await link(temporary, path(issue.id)); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new KnownFailure(`Local ticket already exists: ${issue.id}`, "local-identity-conflict");
          throw error;
        }
      } else await rename(temporary, path(issue.id));
    } finally { await rm(temporary, { force: true }); }
    const directory = await open(root, "r");
    try { await directory.sync(); } finally { await directory.close(); }
  };
  return {
    async check() { await mkdir(root, { recursive: true }); },
    async owner() { return "local-publisher"; },
    async search(ticket) {
      const issues: Issue[] = [];
      for (const name of (await readdir(root)).filter(name => name.endsWith(".md"))) {
        const content = await readFile(join(root, name), "utf8");
        const fence = content.match(/^```json\n([\s\S]*?)\n```\n/);
        let metadata;
        try { metadata = fence && JSON.parse(fence[1]); }
        catch {
          if (name === `${ticket.key}.md` || /"author"\s*:\s*"local-publisher"/.test(fence![1])) throw new KnownFailure(`Invalid local ticket metadata: ${name}`, "local-identity-conflict");
        }
        if (metadata?.author === "local-publisher") issues.push(await read(name.slice(0, -3)));
        else if (name === `${ticket.key}.md`) throw new KnownFailure(`Local ticket already exists: ${ticket.key}`, "local-identity-conflict");
      }
      return issues;
    },
    async create(ticket) { const issue = { id: ticket.key, title: ticket.title, body: ticket.body, labels: ticket.labels, blockedBy: [], status: "draft", author: "local-publisher", createdAt: new Date().toISOString() }; await write(issue, true); return issue; },
    read,
    async parent(id, parent) { await parentExists(parent); const issue = await read(id); issue.parent = parent; await write(issue); },
    async block(id, blocker) { await read(blocker); const issue = await read(id); issue.blockedBy = [...new Set([...issue.blockedBy, blocker])]; await write(issue); },
    async activate(id) { const issue = await read(id); issue.status = readiness; await write(issue); },
  };
}
async function command(argv: string[], input?: unknown, knownFailure: (exit: number, stderr: string) => boolean = () => false): Promise<unknown> {
  const proc = Bun.spawn(argv, { stdin: input === undefined ? "ignore" : new Blob([JSON.stringify(input)]), stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exit] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (exit !== 0) {
    if (knownFailure(exit, stderr)) throw new KnownFailure(stderr);
    throw new Error(stderr || `Command exited ${exit}`);
  }
  return stdout.trim() ? JSON.parse(stdout) : null;
}
function github(config: Record<string, unknown>): Tracker {
  if (typeof config.repo !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(config.repo)) throw new KnownFailure("GitHub publication requires its configured owner/repo");
  const executable = config.command ?? ["gh"];
  if (!Array.isArray(executable) || !executable.length || executable.some(p => typeof p !== "string")) throw new KnownFailure("Configured CLI command must be an argv array");
  const base = `repos/${config.repo}/issues`;
  const api = async (path: string, method = "GET", input?: unknown, paged = false): Promise<any> => {
    const result = await command([...executable, "api", path, "--method", method, ...(input === undefined ? [] : ["--input", "-"]), ...(paged ? ["--paginate", "--slurp"] : [])], input, (_, stderr) => {
      const status = stderr.match(/(?:^HTTP|\(HTTP) (\d{3})\b/m)?.[1];
      return status !== undefined && ["400", "401", "403", "404", "405", "409", "410", "422"].includes(status);
    });
    return paged && Array.isArray(result) ? result.flat() : result;
  };
  const fields = (raw: any): Issue => {
    if (!raw || !Number.isInteger(raw.number) || typeof raw.title !== "string" || typeof raw.body !== "string" || !Array.isArray(raw.labels) || typeof raw.user?.login !== "string" || typeof raw.created_at !== "string") throw new Error("GitHub issue readback is incomplete");
    return { id: String(raw.number), title: raw.title, body: raw.body, labels: raw.labels.map((l: any) => typeof l === "string" ? l : l.name), author: raw.user.login, createdAt: raw.created_at, blockedBy: [] };
  };
  const issuePath = (id: string) => {
    if (!/^\d+$/.test(id)) throw new KnownFailure("GitHub ticket identities must be issue numbers");
    return `${base}/${id}`;
  };
  return {
    async check() { await api(`${base}?state=all&per_page=1`); },
    async owner() { const user = await api("user"); if (typeof user?.login !== "string") throw new KnownFailure("Authenticated GitHub identity unavailable"); return user.login; },
    async search(ticket) { return (await api(`${base}?state=all&per_page=100`, "GET", undefined, true)).filter((raw: any) => !raw.pull_request && raw.title === ticket.title && raw.body === ticket.body).map(fields); },
    async create(ticket) {
      const raw = await api(base, "POST", { title: ticket.title, body: ticket.body, labels: ticket.labels });
      if (!Number.isInteger(raw?.number)) throw new Error("GitHub create returned no issue identity; outcome uncertain");
      return { id: String(raw.number) };
    },
    async read(id) {
      const path = issuePath(id), issue = fields(await api(path));
      let parent;
      try { parent = await api(`${path}/parent`); }
      catch (error) { if (!(error instanceof KnownFailure && /\b404\b/.test(error.message))) throw error; }
      if (parent) issue.parent = String(parent.number);
      const blockers = await api(`${path}/dependencies/blocked_by?per_page=100`, "GET", undefined, true);
      if (!Array.isArray(blockers)) throw new Error("GitHub dependency readback unavailable");
      issue.blockedBy = blockers.map((raw: any) => fields(raw).id);
      return issue;
    },
    async parent(id, parent) {
      const child = await api(issuePath(id));
      return api(`${issuePath(parent)}/sub_issues`, "POST", { sub_issue_id: child.id });
    },
    async block(id, blocker) {
      const dependency = await api(issuePath(blocker));
      return api(`${issuePath(id)}/dependencies/blocked_by`, "POST", { issue_id: dependency.id });
    },
    async activate(id, readiness) { return api(`${issuePath(id)}/labels`, "POST", { labels: [readiness] }); },
  };
}
function cli(config: Record<string, unknown>): Tracker {
  const routes = config.routes as Record<string, string[]> | undefined;
  for (const action of ["owner", "search", "create", "read", "parent", "block", "activate"]) if (!routes || !Array.isArray(routes[action]) || !routes[action].length || routes[action].some(arg => typeof arg !== "string")) throw new KnownFailure(`Configured CLI ${action} route unavailable`, "capability-gap");
  const call = (action: string, values: Record<string, unknown> = {}) => {
    const input = { ...(config.facts as Record<string, unknown> ?? {}), ...values };
    const argv = routes![action].map(arg => arg.replace(/\{(\w+)\}/g, (_, name: string) => {
      if (input[name] === undefined) throw new KnownFailure(`Configured CLI ${action} placeholder ${name} is unavailable`, "capability-gap");
      return typeof input[name] === "string" ? input[name] as string : JSON.stringify(input[name]);
    }));
    return command(argv, input, exit => Array.isArray(config.knownFailureExitCodes) && config.knownFailureExitCodes.includes(exit));
  };
  const issue = (raw: any): Issue => {
    if (!raw || typeof raw.id !== "string" || typeof raw.title !== "string" || typeof raw.body !== "string" || !Array.isArray(raw.labels) || !Array.isArray(raw.blockedBy) || typeof raw.author !== "string" || typeof raw.createdAt !== "string") throw new Error("Configured CLI returned incomplete issue readback");
    return raw;
  };
  return {
    idempotentCreate: config.idempotentCreate === true,
    async check() { await call("search", { title: "" }); },
    async owner() { const raw = await call("owner") as any; const id = typeof raw === "string" ? raw : raw?.id; if (typeof id !== "string") throw new KnownFailure("Configured CLI ownership readback unavailable", "capability-gap"); return id; },
    async search(ticket) { const raw = await call("search", { title: ticket.title }); if (!Array.isArray(raw)) throw new KnownFailure("Configured CLI search readback unavailable", "capability-gap"); return raw.map(issue); },
    async create(ticket, idempotencyKey) {
      const raw = await call("create", { title: ticket.title, body: ticket.body, labels: ticket.labels, idempotencyKey }) as any;
      if (typeof raw?.id !== "string" || !raw.id) throw new Error("Configured CLI create returned no identity; outcome uncertain");
      return { id: raw.id };
    },
    async read(id) { return issue(await call("read", { issue: id })); },
    async parent(id, parent) { return call("parent", { issue: id, parent }); },
    async block(id, blocker) { return call("block", { issue: id, blocker }); },
    async activate(id, readiness) { return call("activate", { issue: id, readiness }); },
  };
}
export async function trackerFor(config: Record<string, unknown>, connection?: Connection): Promise<Tracker> {
  if (config.mode === "local" && typeof config.directory === "string" && config.directory && typeof config.readiness === "string") return local(config.directory, config.readiness);
  if (config.mode === "github") return github(config);
  if (config.mode === "mcp") return mcpTracker(config, connection);
  if (config.mode === "cli") return cli(config);
  throw new KnownFailure(`Tracker capability unavailable for mode ${config.mode}`, "capability-gap");
}

import { KnownFailure, type Connection, type Issue, type Tool, type Tracker } from "./trackers.ts";
import type { Ticket } from "./publisher.ts";

type Action = "owner" | "search" | "read" | "create" | "parent" | "block" | "activate";
const meanings: Record<Action, RegExp> = {
  owner: /(?:authenticated|current) user|who am i/i,
  search: /search.*(?:issues?|tickets?)/i,
  read: /(?:read|get|fetch).*(?:full issue|issue details|issue including|full ticket)/i,
  create: /create (?:an? |new )?(?:issue|ticket)/i,
  parent: /(?:set|add|link|assign).*parent|parent.*(?:child|membership)/i,
  block: /(?:add|create|link).*blocking relationship|blocker.*dependent/i,
  activate: /add labels? (?:to|on) (?:an? )?(?:issue|ticket)/i,
};
const normalized = (name: string) => name.toLowerCase().replace(/[_\s-]/g, "");
function valueFor(name: string, action: Action, values: Record<string, unknown>, facts: Record<string, unknown>): unknown {
  const key = normalized(name);
  if (/^(?:issue|ticket)(?:key|id)?$/.test(key) || key === "id") return values.issue;
  if (/^parent(?:key|id)?$/.test(key)) return values.parent;
  if (/^blocker(?:key|id)?$/.test(key)) return values.blocker;
  if (/^dependent(?:key|id)?$/.test(key)) return values.dependent;
  if (["title", "summary"].includes(key)) return values.title;
  if (["body", "description"].includes(key)) return values.body;
  if (key === "labels") return values.labels;
  if (["idempotencykey", "requestid"].includes(key)) return values.idempotencyKey;
  if (action === "search" && ["query", "jql"].includes(key)) {
    const project = facts.project ?? facts.projectKey;
    if (typeof project !== "string") return undefined;
    return `project = ${JSON.stringify(project)} AND summary ~ ${JSON.stringify(values.title)}`;
  }
  const aliases: Record<string, string[]> = { project: ["project", "projectKey", "projectId"], projectkey: ["projectKey", "project"], projectid: ["projectId"], issuetype: ["issueType"], issuetypeid: ["issueTypeId"], linktype: ["linkType", "blockingLinkType"] };
  for (const alias of aliases[key] ?? [name]) if (facts[alias] !== undefined) return facts[alias];
}
function argumentsFor(tool: Tool, action: Action, values: Record<string, unknown>, facts: Record<string, unknown>) {
  const args: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(tool.inputSchema.properties ?? {})) {
    const value = valueFor(name, action, values, facts);
    if (value === undefined) {
      if (tool.inputSchema.required?.includes(name)) throw new KnownFailure(`MCP capability ${action}: cannot bind required parameter ${name} of ${tool.name}`, "capability-gap");
      continue;
    }
    const valid = schema.type === "array" ? Array.isArray(value) : schema.type === "string" ? typeof value === "string" : schema.type === "number" || schema.type === "integer" ? typeof value === "number" : schema.type === "boolean" ? typeof value === "boolean" : schema.type === undefined;
    if (!valid || schema.enum && !schema.enum.includes(value)) throw new KnownFailure(`MCP capability ${action}: incompatible schema for ${name} of ${tool.name}`, "capability-gap");
    args[name] = value;
  }
  const roles: Record<Action, string[]> = { owner: [], search: [], read: ["issue"], create: ["title", "body", "labels"], parent: ["issue", "parent"], block: ["dependent", "blocker"], activate: ["issue", "labels"] };
  const bound = Object.values(args);
  for (const role of roles[action]) if (values[role] === undefined || !bound.includes(values[role])) throw new KnownFailure(`MCP capability ${action}: schema cannot carry approved ${role}`, "capability-gap");
  if (action === "search" && !bound.includes(values.title) && !Object.keys(args).some(name => ["query", "jql"].includes(normalized(name)))) throw new KnownFailure("MCP search schema cannot constrain approved title", "capability-gap");
  const requiredFacts = action === "create" ? [facts.project ?? facts.projectKey ?? facts.projectId, facts.issueType ?? facts.issueTypeId] : action === "block" ? [facts.linkType ?? facts.blockingLinkType] : [];
  if (requiredFacts.some(value => value === undefined || !bound.includes(value))) throw new KnownFailure(`MCP capability ${action}: schema cannot carry configured project facts`, "capability-gap");
  return args;
}
function unpack(result: any): any {
  if (result?.isError) throw new Error(`MCP tool returned an error: ${JSON.stringify(result.content)}`);
  if (result?.structuredContent !== undefined) return result.structuredContent;
  if (Array.isArray(result?.content)) {
    const text = result.content.filter((entry: any) => entry.type === "text").map((entry: any) => entry.text).join("\n");
    return JSON.parse(text);
  }
  return result;
}
export async function mcpTracker(config: Record<string, unknown>, connection?: Connection): Promise<Tracker> {
  const server = config.server;
  if (typeof server !== "string" || !server || !connection) throw new KnownFailure(`MCP server ${server ?? "(not configured)"}: live discovery connection unavailable`, "capability-gap");
  const tools = await connection.listTools(server), facts = (config.facts ?? {}) as Record<string, unknown>;
  const bindings = {} as Record<Action, Tool>;
  const example = { issue: "TICKET-1", parent: "PARENT-1", blocker: "BLOCKER-1", dependent: "DEPENDENT-1", title: "Approved title", body: "Approved body", labels: ["label"], idempotencyKey: "publication-key" };
  for (const action of Object.keys(meanings) as Action[]) {
    const candidates = tools.filter(tool => meanings[action].test(tool.description));
    const compatible = candidates.filter(tool => { try { argumentsFor(tool, action, example, facts); return true; } catch { return false; } });
    if (compatible.length !== 1) throw new KnownFailure(`MCP server ${server}: ${action} capability has ${compatible.length} unambiguous compatible tools`, "capability-gap");
    bindings[action] = compatible[0];
  }
  const call = async (action: Action, values: Record<string, unknown> = {}) => unpack(await connection.callTool(server, bindings[action].name, argumentsFor(bindings[action], action, values, facts)));
  const issue = (raw: any, relationships = false): Issue => {
    if (raw?.fields) {
      const fields = raw.fields;
      let blockers = raw.blockedBy;
      if (blockers === undefined && Array.isArray(fields.issuelinks) && ["inwardIssue", "outwardIssue"].includes(String(facts.blockingSide))) {
        blockers = fields.issuelinks.filter((link: any) => link.type?.name === (facts.linkType ?? facts.blockingLinkType) && link[String(facts.blockingSide)]).map((link: any) => link[String(facts.blockingSide)].key);
      }
      raw = { id: raw.key, title: fields.summary, body: fields.description, labels: fields.labels, author: fields.creator?.accountId ?? fields.creator?.name, createdAt: fields.created, parent: fields.parent?.key, blockedBy: blockers, project: facts.projectId !== undefined ? fields.project?.id : fields.project?.key, issueType: facts.issueTypeId !== undefined ? fields.issuetype?.id : fields.issuetype?.name };
    }
    if (!raw || typeof raw.id !== "string" || typeof raw.title !== "string" || typeof raw.body !== "string" || !Array.isArray(raw.labels) || raw.labels.some((label: unknown) => typeof label !== "string") || typeof raw.author !== "string" || typeof raw.createdAt !== "string" || relationships && !Array.isArray(raw.blockedBy)) throw new KnownFailure(`MCP server ${server}: full issue field or relationship readback unavailable`, "capability-gap");
    if (relationships && (raw.project !== (facts.project ?? facts.projectKey ?? facts.projectId) || raw.issueType !== (facts.issueType ?? facts.issueTypeId))) throw new KnownFailure(`MCP server ${server}: configured project or ticket issue type does not match readback`, "readback");
    return { ...raw, blockedBy: raw.blockedBy ?? [] };
  };
  return {
    idempotentCreate: /idempotenc/i.test(bindings.create.description) && Object.keys(bindings.create.inputSchema.properties ?? {}).some(name => normalized(name) === "idempotencykey"),
    async check() {
      if (typeof (facts.project ?? facts.projectKey ?? facts.projectId) !== "string" || typeof (facts.issueType ?? facts.issueTypeId) !== "string" || typeof (facts.linkType ?? facts.blockingLinkType) !== "string") throw new KnownFailure(`MCP server ${server}: configured project, ticket issue type, or blocking link type unavailable`, "capability-gap");
    },
    async owner() { const raw = await call("owner"); const id = raw?.id ?? raw?.accountId ?? raw?.login; if (typeof id !== "string") throw new KnownFailure(`MCP server ${server}: ownership identity unavailable`, "capability-gap"); return id; },
    async search(ticket: Ticket) {
      const raw = await call("search", { title: ticket.title }), results = Array.isArray(raw) ? raw : raw?.issues;
      if (!Array.isArray(results)) throw new KnownFailure(`MCP server ${server}: search readback unavailable`, "capability-gap");
      return results.map(entry => issue(entry)).filter((entry: any) => entry.project === (facts.project ?? facts.projectKey ?? facts.projectId) && entry.issueType === (facts.issueType ?? facts.issueTypeId));
    },
    async create(ticket, idempotencyKey) {
      const raw = await call("create", { title: ticket.title, body: ticket.body, labels: ticket.labels, idempotencyKey });
      const id = raw?.key ?? raw?.id;
      if (typeof id !== "string" || !id) throw new Error(`MCP server ${server}: create returned no identity; outcome uncertain`);
      return { id };
    },
    async read(id) { return issue(await call("read", { issue: id }), true); },
    async parent(id, parent) { return call("parent", { issue: id, parent }); },
    async block(id, blocker) { return call("block", { dependent: id, blocker }); },
    async activate(id, readiness) { return call("activate", { issue: id, labels: [readiness] }); },
  };
}

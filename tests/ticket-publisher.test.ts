import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fakeTicketGitHub, fakeGhProgram } from "./support/fake-github.ts";
import { publish, resume } from "../plugin/skills/to-tickets/scripts/publisher.ts";
import type { Connection, Issue, Tool } from "../plugin/skills/to-tickets/scripts/trackers.ts";

const command = resolve("plugin/skills/to-tickets/scripts/publish.ts");
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "ticket-publication-"));
  roots.push(root);
  return { root, record: join(root, "publication.json"), input: join(root, "approved.json") };
}
async function run(args: string[], env: Record<string, string> = {}) {
  const proc = Bun.spawn([process.execPath, command, ...args], { stdout: "pipe", stderr: "pipe", env: { ...process.env, ...env } });
  const [stdout, stderr, exit] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, exit };
}
function metadata(content: string) {
  return JSON.parse(content.match(/^```json\n([\s\S]*?)\n```\n/)![1]);
}
const tickets = [
  { key: "foundation", title: "Create the foundation", body: "Approved foundation. Reference dependent for context only.", labels: ["task"] },
  { key: "dependent", title: "Use the foundation", body: "Approved dependent.", labels: ["task"], parent: { external: "100" }, blockedBy: ["foundation"] },
];

test("local publish saves the approved graph before declaring tickets ready and resume preserves content", async () => {
  const f = await fixture();
  await writeFile(f.input, JSON.stringify({ version: 1, tracker: { mode: "local", directory: join(f.root, "issues"), readiness: "available" }, tickets: [tickets[0], { ...tickets[1], parent: { local: "foundation" } }] }));
  const result = await run(["publish", "--input", f.input, "--record", f.record]);
  expect(result.exit).toBe(0);
  const receipt = JSON.parse(result.stdout);
  expect(receipt.status).toBe("complete");
  const files = await readdir(join(f.root, "issues"));
  expect(files.sort()).toEqual(["dependent.md", "foundation.md"]);
  const foundation = await readFile(join(f.root, "issues/foundation.md"), "utf8");
  const dependent = await readFile(join(f.root, "issues/dependent.md"), "utf8");
  expect(foundation).toContain("Approved foundation. Reference dependent for context only.");
  expect(metadata(foundation).blockedBy).toEqual([]);
  expect(metadata(dependent).blockedBy).toEqual(["foundation"]);
  expect(metadata(dependent).parent).toBe("foundation");
  expect(metadata(dependent).labels).toContain("available");
  await writeFile(f.input, "not approved anymore");
  expect((await run(["resume", "--record", f.record])).exit).toBe(0);
  expect(await readFile(join(f.root, "issues/dependent.md"), "utf8")).toBe(dependent);
  expect(await readFile(join(f.root, "issues/foundation.md"), "utf8")).toBe(foundation);
});

test("GitHub publication reads back the approved directed graph before mapped readiness and leaves the parent unchanged", async () => {
  const f = await fixture(), github = fakeTicketGitHub(f.record);
  try {
    const gh = join(f.root, "gh.ts");
    await writeFile(gh, fakeGhProgram);
    await writeFile(f.input, JSON.stringify({ version: 1, tracker: { mode: "github", repo: "fixture/tickets", command: [process.execPath, gh], readiness: "available" }, tickets }));
    const parent = structuredClone(github.issues.get(100));
    const result = await run(["publish", "--input", f.input, "--record", f.record], { FAKE_GITHUB: github.server.url.origin });
    expect(result.exit).toBe(0);
    expect(JSON.parse(result.stdout).status).toBe("complete");
    expect(github.issues.get(100)).toEqual(parent);
    const created = [...github.issues.values()].filter(issue => issue.number !== 100);
    expect(created.map(issue => issue.body)).toEqual(tickets.map(ticket => ticket.body));
    expect(created[0].blockers).toEqual([]);
    expect(created[1].blockers).toEqual([created[0].number]);
    expect(created[1].parent).toBe(100);
    expect(created[0].state).toBe("open");
    expect(created.every(issue => issue.labels.some(label => label.name === "available"))).toBe(true);
    for (const snapshot of github.snapshots) {
      const ready = snapshot.filter(issue => issue.number !== 100 && issue.labels.some(label => label.name === "available"));
      if (ready.length) {
        const dependent = snapshot.find(issue => issue.title === tickets[1].title)!;
        expect(dependent.parent).toBe(100);
        expect(dependent.blockers).toEqual([created[0].number]);
      }
    }
  } finally { github.server.stop(true); }
});

test("resume recovers a killed publisher after tracker creation without duplicating its pending ticket", async () => {
  const f = await fixture(), github = fakeTicketGitHub(f.record);
  const gh = join(f.root, "gh.ts");
  await writeFile(gh, fakeGhProgram);
  await writeFile(f.input, JSON.stringify({ version: 1, tracker: { mode: "github", repo: "fixture/tickets", command: [process.execPath, gh], readiness: "available" }, tickets }));
  const pause = github.pause("create");
  const proc = Bun.spawn([process.execPath, command, "publish", "--input", f.input, "--record", f.record], { stdout: "ignore", stderr: "ignore", env: { ...process.env, FAKE_GITHUB: github.server.url.origin } });
  try {
    await pause.reached;
    proc.kill("SIGKILL");
    await proc.exited;
    pause.release();
    expect([...github.issues.values()].filter(i => i.number !== 100)).toHaveLength(1);
    const result = await run(["resume", "--record", f.record], { FAKE_GITHUB: github.server.url.origin });
    expect(result.exit).toBe(0);
    expect([...github.issues.values()].filter(i => i.number !== 100)).toHaveLength(2);
    expect([...github.issues.values()].filter(i => i.number !== 100).every(i => i.labels.some(l => l.name === "available"))).toBe(true);
  } finally { pause.release(); proc.kill(); github.server.stop(true); }
});

function mcpFixture() {
  const state = new Map<string, Issue & { project?: string; issueType?: string }>();
  state.set("100", { id: "100", title: "Parent", body: "Unchanged parent", labels: ["spec"], author: "human", createdAt: "2025-01-01T00:00:00Z", blockedBy: [] });
  const schema = (fields: Record<string, string>) => ({ type: "object", properties: Object.fromEntries(Object.entries(fields).map(([name, type]) => [name, { type }])), required: Object.keys(fields) });
  const tools: Tool[] = [
    { name: "identity-v2", description: "Read the authenticated current user identity", inputSchema: schema({}) },
    { name: "locate-v3", description: "Search issues in a project by title", inputSchema: schema({ project: "string", title: "string" }) },
    { name: "inspect-v4", description: "Read a full issue including labels, parent and blocking relationships", inputSchema: schema({ issue: "string" }) },
    { name: "draft-v5", description: "Create an issue", inputSchema: schema({ project: "string", issueType: "string", title: "string", body: "string", labels: "array" }) },
    { name: "membership-v6", description: "Set the parent of a child issue", inputSchema: schema({ issue: "string", parent: "string" }) },
    { name: "dependency-v7", description: "Add a blocking relationship from blocker to dependent", inputSchema: schema({ dependent: "string", blocker: "string", linkType: "string" }) },
    { name: "label-v8", description: "Add labels to an issue", inputSchema: schema({ issue: "string", labels: "array" }) },
  ];
  let loseCreate = false;
  const idempotency = new Map<string, string>();
  const connection: Connection = {
    async listTools(server) { if (server !== "owned-tracker") throw new Error("Wrong server"); return tools; },
    async callTool(server, name, args) {
      if (server !== "owned-tracker") throw new Error("Wrong server");
      if (name === "identity-v2") return { id: "publisher" };
      if (name === "locate-v3") return structuredClone([...state.values()].filter(i => i.title === args.title));
      if (name === "inspect-v4") return structuredClone(state.get(String(args.issue)));
      if (name === "draft-v5") {
        if (typeof args.idempotency_key === "string" && idempotency.has(args.idempotency_key)) return structuredClone(state.get(idempotency.get(args.idempotency_key)!));
        if (args.project !== "DEMO" || args.issueType !== "Task") throw new Error("Wrong project facts");
        const issue: Issue = { id: `DEMO-${state.size}`, title: String(args.title), body: String(args.body), labels: [...args.labels as string[]], author: "publisher", createdAt: new Date().toISOString(), blockedBy: [] };
        state.set(issue.id, { ...issue, project: String(args.project), issueType: String(args.issueType) });
        if (typeof args.idempotency_key === "string") idempotency.set(args.idempotency_key, issue.id);
        if (loseCreate) { loseCreate = false; throw new Error("Successful create response lost"); }
        return structuredClone(issue);
      }
      if (name === "membership-v6") state.get(String(args.issue))!.parent = String(args.parent);
      else if (name === "dependency-v7") {
        if (args.linkType !== "Blocks") throw new Error("Wrong configured link type");
        state.get(String(args.dependent))!.blockedBy.push(String(args.blocker));
      } else if (name === "label-v8") state.get(String(args.issue))!.labels.push(...args.labels as string[]);
      else throw new Error("Undiscovered operation");
      return { ok: true };
    },
  };
  return { state, tools, connection, loseNextCreate() { loseCreate = true; } };
}

test("MCP discovers current tool schemas, uses configured facts, and uniquely resumes a lost create", async () => {
  const f = await fixture(), mcp = mcpFixture();
  const intent = { version: 1, tracker: { mode: "mcp", server: "owned-tracker", facts: { project: "DEMO", issueType: "Task", linkType: "Blocks" }, readiness: "available" }, tickets };
  const parent = structuredClone(mcp.state.get("100"));
  mcp.loseNextCreate();
  const interrupted = await publish(intent, f.record, mcp.connection);
  expect(interrupted.status).toBe("blocked");
  expect([...mcp.state.values()].filter(i => i.id !== "100")).toHaveLength(1);
  expect([...mcp.state.values()].every(i => !i.labels.includes("available"))).toBe(true);
  const result = await resume(f.record, mcp.connection);
  expect(result.status).toBe("complete");
  const created = [...mcp.state.values()].filter(i => i.id !== "100");
  expect(created).toHaveLength(2);
  expect(created[1].blockedBy).toEqual([created[0].id]);
  expect(created[1].parent).toBe("100");
  expect(created.every(i => i.labels.includes("available"))).toBe(true);
  expect(created.map(i => i.body)).toEqual(tickets.map(t => t.body));
  expect(mcp.state.get("100")).toEqual(parent);
});

test("MCP refuses a discovered creation schema that cannot carry the approved fields before writing", async () => {
  const f = await fixture(), mcp = mcpFixture();
  mcp.tools.find(tool => tool.name === "draft-v5")!.inputSchema = { type: "object", properties: { project: { type: "string" }, issueType: { type: "string" } }, required: ["project", "issueType"] };
  const parent = structuredClone(mcp.state.get("100"));
  const result = await publish({ version: 1, tracker: { mode: "mcp", server: "owned-tracker", facts: { project: "DEMO", issueType: "Task", linkType: "Blocks" }, readiness: "available" }, tickets }, f.record, mcp.connection);
  expect(result.status).toBe("blocked");
  expect(result.problem).toMatchObject({ category: "capability-gap" });
  expect([...mcp.state.values()]).toEqual([parent!]);
});

for (const [phase, kind] of [
  ["search", "before"], ["create", "before"], ["create", "after"], ["parent", "before"], ["parent", "after"],
  ["relationships", "before"], ["relationships", "after"], ["read", "before"], ["activate", "before"], ["activate", "after"],
] as const) {
  test(`GitHub resumes ${kind} ${phase} without premature readiness or changed approved content`, async () => {
    const f = await fixture(), github = fakeTicketGitHub(f.record);
    try {
      const gh = join(f.root, "gh.ts");
      await writeFile(gh, fakeGhProgram);
      await writeFile(f.input, JSON.stringify({ version: 1, tracker: { mode: "github", repo: "fixture/tickets", command: [process.execPath, gh], readiness: "available" }, tickets }));
      const parent = structuredClone(github.issues.get(100));
      github.fail(phase, kind);
      const env = { FAKE_GITHUB: github.server.url.origin };
      const interrupted = await run(["publish", "--input", f.input, "--record", f.record], env);
      expect(interrupted.exit).toBe(1);
      const receipt = JSON.parse(interrupted.stdout);
      expect(receipt.status).toBe("blocked");
      for (const issue of github.issues.values()) {
        if (issue.number === 100 || !issue.labels.some(l => l.name === "available")) continue;
        const dependent = [...github.issues.values()].find(i => i.title === tickets[1].title)!;
        const blocker = [...github.issues.values()].find(i => i.title === tickets[0].title)!;
        expect(dependent.parent).toBe(100);
        expect(dependent.blockers).toEqual([blocker.number]);
      }
      const saved = JSON.parse(await readFile(f.record, "utf8"));
      expect(saved.intent.tickets).toEqual(tickets);
      if (phase === "create") expect(saved.operations.findLast((op: any) => op.kind === "create").state).toBe(kind === "before" ? "failed" : "uncertain");
      expect((await run(["resume", "--record", f.record], env)).exit).toBe(0);
      const created = [...github.issues.values()].filter(i => i.number !== 100);
      expect(created).toHaveLength(2);
      expect(created.map(i => i.body)).toEqual(tickets.map(t => t.body));
      expect(created[0].blockers).toEqual([]);
      expect(created[1].blockers).toEqual([created[0].number]);
      expect(created[1].parent).toBe(100);
      expect(created.every(i => i.labels.some(l => l.name === "available"))).toBe(true);
      expect(github.issues.get(100)).toEqual(parent);
    } finally { github.server.stop(true); }
  });
}

test("ambiguous creation candidates block resume without blind retry or adoption", async () => {
  const f = await fixture(), github = fakeTicketGitHub(f.record);
  try {
    const gh = join(f.root, "gh.ts");
    await writeFile(gh, fakeGhProgram);
    await writeFile(f.input, JSON.stringify({ version: 1, tracker: { mode: "github", repo: "fixture/tickets", command: [process.execPath, gh], readiness: "available" }, tickets }));
    github.fail("create", "duplicate");
    expect((await run(["publish", "--input", f.input, "--record", f.record], { FAKE_GITHUB: github.server.url.origin })).exit).toBe(1);
    const before = structuredClone([...github.issues.values()]);
    const result = await run(["resume", "--record", f.record], { FAKE_GITHUB: github.server.url.origin });
    expect(result.exit).toBe(1);
    const receipt = JSON.parse(result.stdout);
    expect(receipt.problem.category).toBe("reconciliation");
    expect(receipt.problem.detail.candidates).toHaveLength(2);
    expect([...github.issues.values()]).toEqual(before);
    expect(receipt.tickets.foundation.id).toBeUndefined();
  } finally { github.server.stop(true); }
});

test("an absent uncertain candidate is not permission to create again or adopt preexisting work", async () => {
  const f = await fixture(), mcp = mcpFixture();
  mcp.loseNextCreate();
  await publish({ version: 1, tracker: { mode: "mcp", server: "owned-tracker", facts: { project: "DEMO", issueType: "Task", linkType: "Blocks" }, readiness: "available" }, tickets }, f.record, mcp.connection);
  mcp.state.delete("DEMO-1");
  const result = await resume(f.record, mcp.connection);
  expect(result.status).toBe("blocked");
  expect(result.problem).toMatchObject({ category: "reconciliation", detail: { candidates: [] } });
  expect([...mcp.state.keys()]).toEqual(["100"]);
});

test("changed approved fields are refused on resume rather than rewritten", async () => {
  const f = await fixture(), mcp = mcpFixture();
  mcp.loseNextCreate();
  await publish({ version: 1, tracker: { mode: "mcp", server: "owned-tracker", facts: { project: "DEMO", issueType: "Task", linkType: "Blocks" }, readiness: "available" }, tickets }, f.record, mcp.connection);
  mcp.state.get("DEMO-1")!.body = "Independently edited content";
  const before = structuredClone([...mcp.state.values()]);
  const result = await resume(f.record, mcp.connection);
  expect(result.status).toBe("blocked");
  expect([...mcp.state.values()]).toEqual(before);
  expect([...mcp.state.values()].every(i => !i.labels.includes("available"))).toBe(true);
});

for (const missing of ["inspect-v4", "dependency-v7", "label-v8"]) {
  test(`MCP missing ${missing} is an explicit pre-write capability gap`, async () => {
    const f = await fixture(), mcp = mcpFixture();
    mcp.tools.splice(mcp.tools.findIndex(tool => tool.name === missing), 1);
    const result = await publish({ version: 1, tracker: { mode: "mcp", server: "owned-tracker", facts: { project: "DEMO", issueType: "Task", linkType: "Blocks" }, readiness: "available" }, tickets }, f.record, mcp.connection);
    expect(result.status).toBe("blocked");
    expect(result.problem).toMatchObject({ category: "capability-gap" });
    expect([...mcp.state.keys()]).toEqual(["100"]);
  });
}

test("no-tool publication retains approved intent without claiming readiness", async () => {
  const f = await fixture();
  const result = await publish({ version: 1, tracker: { mode: "none", readiness: "available" }, tickets }, f.record);
  expect(result.status).toBe("blocked");
  expect(Object.values(result.tickets).every(t => !t.ready && !t.id)).toBe(true);
  expect(JSON.parse(await readFile(f.record, "utf8")).intent.tickets).toEqual(tickets);
});

test("configured CLI argv routes publish and resume using their own tracker workflow", async () => {
  const f = await fixture(), driver = join(f.root, "configured-cli.ts"), statePath = join(f.root, "tracker.json");
  await writeFile(statePath, JSON.stringify({ issues: { "100": { id: "100", title: "Parent", body: "Parent stays unchanged", labels: ["spec"], author: "human", createdAt: "2025-01-01T00:00:00Z", blockedBy: [] } } }));
  await writeFile(driver, `
const [path, action, id, value] = process.argv.slice(2);
const state = await Bun.file(path).json();
const input = JSON.parse(await new Response(Bun.stdin.stream()).text());
let result;
if (action === "owner") result = { id: "publisher" };
else if (action === "search") result = Object.values(state.issues);
else if (action === "read") result = state.issues[id];
else if (action === "create") {
  const id = "custom-" + Object.keys(state.issues).length;
  result = state.issues[id] = { id, title: input.title, body: input.body, labels: input.labels, author: "publisher", createdAt: new Date().toISOString(), blockedBy: [] };
} else if (action === "parent") state.issues[id].parent = value;
else if (action === "block") state.issues[id].blockedBy.push(value);
else if (action === "activate") state.issues[id].labels.push(value);
await Bun.write(path, JSON.stringify(state));
console.log(JSON.stringify(result ?? { ok: true }));
`);
  const argv = (action: string, ...args: string[]) => [process.execPath, driver, statePath, action, ...args];
  const routes = { owner: argv("owner"), search: argv("search"), create: argv("create"), read: argv("read", "{issue}"), parent: argv("parent", "{issue}", "{parent}"), block: argv("block", "{issue}", "{blocker}"), activate: argv("activate", "{issue}", "{readiness}") };
  const parent = JSON.parse(await readFile(statePath, "utf8")).issues["100"];
  const result = await publish({ version: 1, tracker: { mode: "cli", readiness: "available", routes }, tickets }, f.record);
  expect(result.status).toBe("complete");
  const state = JSON.parse(await readFile(statePath, "utf8"));
  expect(state.issues["100"]).toEqual(parent);
  expect(state.issues["custom-1"].body).toBe(tickets[0].body);
  expect(state.issues["custom-2"].body).toBe(tickets[1].body);
  expect(state.issues["custom-2"].parent).toBe("100");
  expect(state.issues["custom-2"].blockedBy).toEqual(["custom-1"]);
  expect(state.issues["custom-1"].labels).toContain("available");
  expect(state.issues["custom-2"].labels).toContain("available");
  expect((await resume(f.record)).status).toBe("complete");
  expect(JSON.parse(await readFile(statePath, "utf8"))).toEqual(state);
});

test("a returned tracker identity is durable even when create does not return full fields", async () => {
  const f = await fixture(), mcp = mcpFixture();
  const connection: Connection = { ...mcp.connection, async callTool(server, name, args) {
    const result = await mcp.connection.callTool(server, name, args);
    return name === "draft-v5" ? { id: (result as Issue).id } : result;
  } };
  const result = await publish({ version: 1, tracker: { mode: "mcp", server: "owned-tracker", facts: { project: "DEMO", issueType: "Task", linkType: "Blocks" }, readiness: "available" }, tickets }, f.record, connection);
  expect(result.status).toBe("complete");
  expect(result.tickets.foundation.id).toBe("DEMO-1");
  expect(result.tickets.dependent.id).toBe("DEMO-2");
  expect(mcp.state.size).toBe(3);
});

test("a local parent must exist before any approved ticket becomes ready", async () => {
  const f = await fixture();
  const result = await publish({ version: 1, tracker: { mode: "local", directory: join(f.root, "issues"), readiness: "available" }, tickets }, f.record);
  expect(result.status).toBe("blocked");
  expect(metadata(await readFile(join(f.root, "issues/foundation.md"), "utf8")).labels).not.toContain("available");
  expect(metadata(await readFile(join(f.root, "issues/dependent.md"), "utf8")).labels).not.toContain("available");
});

test("MCP readback checks the configured project and ticket type before readiness", async () => {
  const f = await fixture(), mcp = mcpFixture();
  const connection: Connection = { ...mcp.connection, async callTool(server, name, args) {
    const result = await mcp.connection.callTool(server, name, args);
    if (name === "draft-v5") mcp.state.get((result as Issue).id)!.project = "OTHER";
    return result;
  } };
  const result = await publish({ version: 1, tracker: { mode: "mcp", server: "owned-tracker", facts: { project: "DEMO", issueType: "Task", linkType: "Blocks" }, readiness: "available" }, tickets }, f.record, connection);
  expect(result.status).toBe("blocked");
  expect([...mcp.state.values()].every(issue => !issue.labels.includes("available"))).toBe(true);
  expect(mcp.state.get("DEMO-1")!.project).toBe("OTHER");
});

test("provider idempotency resumes the original create even when identifying facts have another candidate", async () => {
  const f = await fixture(), mcp = mcpFixture();
  const create = mcp.tools.find(tool => tool.name === "draft-v5")!;
  create.description += " with a provider idempotency key";
  create.inputSchema.properties!.idempotency_key = { type: "string" };
  mcp.loseNextCreate();
  await publish({ version: 1, tracker: { mode: "mcp", server: "owned-tracker", facts: { project: "DEMO", issueType: "Task", linkType: "Blocks" }, readiness: "available" }, tickets }, f.record, mcp.connection);
  const unrelated = { ...structuredClone(mcp.state.get("DEMO-1")!), id: "UNRELATED" };
  mcp.state.set(unrelated.id, unrelated);
  const result = await resume(f.record, mcp.connection);
  expect(result.status).toBe("complete");
  expect(result.tickets.foundation.id).toBe("DEMO-1");
  expect(mcp.state.get("UNRELATED")).toEqual(unrelated);
  expect([...mcp.state.values()].filter(i => i.title === tickets[0].title)).toHaveLength(2);
  expect(mcp.state.get(result.tickets.dependent.id!)!.blockedBy).toEqual(["DEMO-1"]);
});

test("unsupported approved fields refuse input instead of silently losing ticket content", async () => {
  const f = await fixture();
  await writeFile(f.input, JSON.stringify({ version: 1, tracker: { mode: "local", directory: join(f.root, "issues"), readiness: "available" }, tickets: [{ ...tickets[0], assignees: ["human"] }] }));
  const result = await run(["publish", "--input", f.input, "--record", f.record]);
  expect(result.exit).toBe(1);
  expect(JSON.parse(result.stderr).category).toBe("invalid-intent");
  expect(await readdir(f.root)).toEqual(["approved.json"]);
});

test("preexisting matching work is not adopted when reconciling a new owned creation", async () => {
  const f = await fixture(), mcp = mcpFixture();
  const existing = { id: "EXISTING", title: tickets[0].title, body: tickets[0].body, labels: tickets[0].labels, author: "publisher", createdAt: new Date().toISOString(), blockedBy: [], project: "DEMO", issueType: "Task" };
  mcp.state.set(existing.id, structuredClone(existing));
  mcp.loseNextCreate();
  await publish({ version: 1, tracker: { mode: "mcp", server: "owned-tracker", facts: { project: "DEMO", issueType: "Task", linkType: "Blocks" }, readiness: "available" }, tickets }, f.record, mcp.connection);
  const result = await resume(f.record, mcp.connection);
  expect(result.status).toBe("complete");
  expect(result.tickets.foundation.id).not.toBe("EXISTING");
  expect(mcp.state.get("EXISTING")).toEqual(existing);
  expect(mcp.state.size).toBe(4);
});

test("unavailable relationship readback cannot activate created tickets", async () => {
  const f = await fixture(), mcp = mcpFixture();
  const connection: Connection = { ...mcp.connection, async callTool(server, name, args) {
    const result = await mcp.connection.callTool(server, name, args);
    if (name === "inspect-v4") delete (result as Partial<Issue>).blockedBy;
    return result;
  } };
  const result = await publish({ version: 1, tracker: { mode: "mcp", server: "owned-tracker", facts: { project: "DEMO", issueType: "Task", linkType: "Blocks" }, readiness: "available" }, tickets }, f.record, connection);
  expect(result.status).toBe("blocked");
  expect(result.problem).toMatchObject({ category: "capability-gap" });
  expect([...mcp.state.values()].filter(i => i.id !== "100")).toHaveLength(2);
  expect([...mcp.state.values()].every(i => !i.labels.includes("available"))).toBe(true);
});

test("local publication references an existing Markdown parent without rewriting its content", async () => {
  const f = await fixture(), parent = join(f.root, "approved-spec.md");
  await writeFile(parent, "# Approved specification\n\nKeep this content unchanged.\n");
  const result = await publish({ version: 1, tracker: { mode: "local", directory: join(f.root, "issues"), readiness: "available" }, tickets: [tickets[0], { ...tickets[1], parent: { external: parent } }] }, f.record);
  expect(result.status).toBe("complete");
  expect(await readFile(parent, "utf8")).toBe("# Approved specification\n\nKeep this content unchanged.\n");
  expect(metadata(await readFile(join(f.root, "issues/dependent.md"), "utf8")).parent).toBe(parent);
});

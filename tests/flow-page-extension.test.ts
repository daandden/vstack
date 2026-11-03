import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./support/extension-mocks.ts";
import { fakeHost, type FakeAgent } from "./support/extension-host.ts";
import { ENV, git } from "./support/fixture.ts";

const script = join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-extension-")));
const worlds: ReturnType<typeof world>[] = [];
afterAll(async () => {
  for (const w of worlds) await w.run(["host", "stop"]);
  rmSync(root, { recursive: true, force: true });
});

function world() {
  const home = join(root, String(worlds.length));
  const project = join(home, "project");
  mkdirSync(project, { recursive: true });
  git(project, "init", "-q", "-b", "main");
  const listener = Bun.serve({ port: 0, fetch: () => new Response("occupied") });
  const port = String(listener.port);
  listener.stop(true);
  const run = async (args: string[], input?: unknown) => {
    const p = Bun.spawn([process.execPath, script, ...args, "--home", home], {
      cwd: project, env: { ...ENV, HOME: home, VSTACK_FLOW_PORT: port },
      stdin: input === undefined ? "ignore" : new TextEncoder().encode(JSON.stringify(input)), stdout: "pipe", stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    return { stdout, stderr, code, killed: false };
  };
  const ok = async (args: string[], input?: unknown) => {
    const r = await run(args, input);
    expect(r.code).toBe(0);
    return JSON.parse(r.stdout);
  };
  const host = (sessionId: string, agent: FakeAgent = { kind: "main", id: "Main", name: "main", depth: 0 }) => {
    const h = fakeHost({ sessionId, agent, exec: async (_command, args) => run(args.slice(1)) });
    h.ctx.cwd = project;
    return h;
  };
  return { home, project, port, run, ok, host };
}
function setup() { const w = world(); worlds.push(w); return w; }
const completedReply = (text = "Done.") => ({
  isTerminal: true,
  messages: [{ role: "assistant", stopReason: "stop", content: [{ type: "text", text }] }],
});

test("completed replies add no unsolicited Flow message, including blockers and follow-ups", async () => {
  const w = setup();
  await w.ok(["open", "--title", "First ticket", "--skill", "implement", "--ticket", "284", "--session", "a"]);
  await w.ok(["open", "--title", "Other ticket", "--skill", "implement", "--ticket", "285", "--session", "b"]);
  const h = w.host("a");
  await h.emit("before_agent_start", { prompt: "Work on the ticket" });
  await h.emit("agent_end", { isTerminal: false });
  expect(h.sent).toHaveLength(0);
  for (const text of ["Implemented.", "Blocked on credentials.", "Here is why the blocker matters."]) {
    await h.emit("agent_end", completedReply(text));
  }
  expect(h.sent).toEqual([]);
  const resumed = w.host("a");
  await resumed.emit("before_agent_start", { prompt: "Continue" });
  await resumed.emit("agent_end", completedReply("Continued."));
  expect(resumed.sent).toEqual([]);
  const other = w.host("b");
  await other.emit("agent_end", completedReply("Other ticket complete."));
  expect(other.sent).toEqual([]);
  const unbound = w.host("unbound");
  await unbound.emit("agent_end", completedReply());
  expect(unbound.sent).toHaveLength(0);
});


test("historical Flow messages stay out of ordinary-turn model context", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Context isolation", "--skill", "implement", "--session", "context"]);
  const h = w.host("context");
  const start = await h.emit("before_agent_start") as any[];
  const { message: identity } = start.find(result => result?.message?.customType === "vstack-flow-context");
  const presentation = { customType: "vstack-flow", content: "Flow page: http://127.0.0.1:42000/f/historical/", display: true };
  const user = { role: "user", content: presentation.content };
  const assistant = { role: "assistant", content: [{ type: "text", text: "The work is blocked." }] };
  const authoring = { role: "custom", ...identity };
  const other = { role: "custom", customType: "another-extension", content: presentation.content, display: true };
  const kept = [user, assistant, authoring, other];
  const history = [
    user,
    { role: "custom", ...presentation },
    assistant,
    authoring,
    { role: "custom", customType: "vstack-flow", content: "Flow page unavailable: offline", display: true },
    other,
  ];
  const results = await h.emit("context", { messages: history });
  const modelMessages = results.reduce((messages: any, result: any) => result?.messages ?? messages, history);
  expect(modelMessages).toEqual(kept);
});

test("an occupied live endpoint adds no post-reply message or interference", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Offline ticket", "--skill", "implement", "--session", "a"]);
  await w.ok(["host", "stop"]);
  const listener = Bun.serve({ port: Number(w.port), fetch: () => new Response("another program") });
  try {
    const current = await w.ok(["bound", "--session", "a"]);
    expect(current.live.state).toBe("unavailable");
    expect(current).not.toHaveProperty("page");
    const h = w.host("a");
    await h.emit("agent_end", completedReply());
    expect(h.sent).toEqual([]);
    expect((await fetch(`http://127.0.0.1:${w.port}`)).status).toBe(200);
  } finally { listener.stop(true); }
});

test("session and agent bindings keep ticket contributions and hidden authoring context separate", async () => {
  const w = setup();
  const a = await w.ok(["open", "--title", "Shared work", "--skill", "wayfinder", "--ticket", "101", "--session", "a"]);
  const b = await w.ok(["open", "--flow", a.flow, "--skill", "wayfinder", "--ticket", "102", "--session", "b"]);
  const child = await w.ok(["open", "--flow", a.flow, "--skill", "research", "--session", "a", "--agent", "worker-1"]);
  const result = (ref: string) => ({ version: 1, items: [{ kind: "result", ref, shape: "table", title: ref, columns: ["Outcome"], rows: [{ cells: [ref] }] }] });
  const ar = await w.ok(["submit", "--session", "a"], result("first"));
  const br = await w.ok(["submit", "--session", "b"], result("second"));
  await w.ok(["submit", "--session", "a", "--agent", "worker-1"], result("child"));
  const wrong = await w.run(["submit", "--session", "b"], { version: 1, items: [{ ...result("wrong").items[0], revises: ar.refs.first }] });
  expect(wrong.code).toBe(1);
  const snapshot = await w.ok(["show", "--flow", a.flow]);
  expect(snapshot.stages.map((s: any) => [s.id, s.results.map((r: any) => r.id)])).toEqual([
    [a.stage, [ar.refs.first]], [b.stage, [br.refs.second]], [child.stage, expect.any(Array)],
  ]);
  expect(snapshot.stages[2].results).toHaveLength(1);
  const h = w.host("a");
  const context = async (host: ReturnType<typeof fakeHost>) => {
    const start = await host.emit("before_agent_start", { prompt: "Continue" }) as any[];
    return start.find(result => result?.message?.customType === "vstack-flow-context").message;
  };
  const first = await context(h);
  expect(first.display).toBe(false);
  expect(first.content).toContain('"--session" "a" "--agent" "main"');
  expect(first.content).toContain(`Your bound Flow is ${a.flow}, Stage ${a.stage}.`);
  h.ctx.sessionManager = { ...h.ctx.sessionManager, getSessionId: () => "b" };
  await h.emit("session_switch");
  const second = await context(h);
  expect(second.content).toContain('"--session" "b" "--agent" "main"');
  expect(second.content).toContain(`Your bound Flow is ${b.flow}, Stage ${b.stage}.`);
  const sub = w.host("a", { kind: "sub", id: "worker-1", name: "vstack-worker", depth: 1, parentId: "Main" });
  const worker = await context(sub);
  expect(worker.display).toBe(false);
  expect(worker.content).toContain('"--session" "a" "--agent" "worker-1"');
  expect(worker.content).toContain(`Your bound Flow is ${a.flow}, Stage ${child.stage}.`);
  expect((await w.ok(["bound", "--session", "a"])).stage).toBe(a.stage);
  expect((await w.ok(["bound", "--session", "a", "--agent", "worker-1"])).stage).toBe(child.stage);
});


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

function world(hostOff = false) {
  const home = join(root, String(worlds.length));
  const project = join(home, "project");
  mkdirSync(project, { recursive: true });
  git(project, "init", "-q", "-b", "main");
  const listener = Bun.serve({ port: 0, fetch: () => new Response("occupied") });
  const port = String(listener.port);
  listener.stop(true);
  const run = async (args: string[], input?: unknown) => {
    const p = Bun.spawn([process.execPath, script, ...args, "--home", home], {
      cwd: project, env: { ...ENV, HOME: home, VSTACK_FLOW_PORT: port, ...(hostOff ? { VSTACK_FLOW_HOST: "off" } : {}) },
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
function setup(hostOff = false) { const w = world(hostOff); worlds.push(w); return w; }
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

test("one bound ask waits for a dismissible UI-only Flow popup before the unchanged picker", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Question handoff", "--skill", "implement", "--session", "popup"]);
  const current = await w.ok(["bound", "--session", "popup"]);
  const h = w.host("popup");
  h.ctx.mode = "tui";
  h.ctx.hasUI = true;
  let popup: any;
  let dismiss!: () => void;
  h.ctx.ui.custom = async (factory: any, options: any) => {
    expect(options.overlay).toBe(true);
    return new Promise(resolve => {
      popup = factory({}, {}, {}, resolve);
      dismiss = () => popup.handleInput("\r");
    });
  };
  let picked = false;
  const input = { questions: [{ id: "a" }, { id: "b" }] };
  const pending = h.emit("tool_call", { toolName: "ask", toolCallId: "ask-1", input }).then(() => { picked = true; });
  await Bun.sleep(300);
  expect(popup).toBeDefined();
  expect(picked).toBe(false);
  expect(popup.render(120).join("\n")).toContain(current.live.url);
  expect(popup.describe({})).toBeDefined();
  dismiss();
  await pending;
  expect(picked).toBe(true);
  expect(input).toEqual({ questions: [{ id: "a" }, { id: "b" }] });
  expect(h.sent).toEqual([]);
  expect(h.saved).toEqual([]);
});

test("native host approval composes with another wrapper and follows session lifecycle", async () => {
  const w = setup();
  await w.ok(["open", "--title", "First approval", "--skill", "tune-llm-flow", "--session", "native-a"]);
  await w.ok(["open", "--title", "Second approval", "--skill", "tune-llm-flow", "--session", "native-b"]);
  const first = await w.ok(["bound", "--session", "native-a"]);
  const second = await w.ok(["bound", "--session", "native-b"]);
  const h = w.host("native-a");
  h.ctx.mode = "tui";
  h.ctx.hasUI = true;
  const order: string[] = [];
  let component: any;
  let close!: (value?: any) => void;
  h.ctx.ui.custom = async (factory: any) => new Promise(resolve => {
    order.push("popup");
    close = resolve;
    component = factory({}, {}, {}, resolve);
  });
  const answer = { kind: "submit", results: [] };
  h.ctx.ui.askDialog = async (...args: any[]) => { order.push("native"); return answer; };
  await h.emit("session_start");
  const native = h.ctx.ui.askDialog;
  h.ctx.ui.askDialog = async (...args: any[]) => { order.push("other-wrapper"); return native(...args); };
  await h.emit("before_agent_start");
  const questions = [{ id: "approval", question: "Approve?", options: [{ label: "Approve" }] }];
  const pending = h.ctx.ui.askDialog(questions);
  await Bun.sleep(200);
  expect(order).toEqual(["popup"]);
  expect(component.render(120).join("\n")).toContain(first.live.url);
  component.handleInput("\x1b");
  expect(await pending).toBe(answer);
  expect(order).toEqual(["popup", "other-wrapper", "native"]);
  h.ctx.sessionManager = { ...h.ctx.sessionManager, getSessionId: () => "native-b" };
  await h.emit("session_switch");
  const again = h.ctx.ui.askDialog(questions);
  await Bun.sleep(200);
  expect(component.render(120).join("\n")).toContain(second.live.url);
  close();
  expect(await again).toBe(answer);
  await h.emit("session_shutdown");
  const count = order.filter(item => item === "popup").length;
  expect(await h.ctx.ui.askDialog(questions)).toBe(answer);
  expect(order.filter(item => item === "popup")).toHaveLength(count);
});

test("turn cancellation aborts a pending native popup without opening its original dialog", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Cancelled approval", "--skill", "tune-llm-flow", "--session", "abort"]);
  const h = w.host("abort");
  h.ctx.mode = "tui";
  h.ctx.hasUI = true;
  let dismissed!: () => void;
  let shown = false;
  let picked = false;
  h.ctx.ui.custom = async (_factory: any, options: any) => new Promise((resolve, reject) => {
    shown = true;
    dismissed = () => resolve(undefined);
    options.signal.addEventListener("abort", () => reject(new Error("Turn cancelled")), { once: true });
  });
  h.ctx.ui.askDialog = async () => { picked = true; return {}; };
  await h.emit("session_start");
  const pending = h.ctx.ui.askDialog([]);
  await Bun.sleep(200);
  expect(shown).toBe(true);
  await h.emit("agent_end");
  dismissed();
  expect(await pending).toBeUndefined();
  expect(picked).toBe(false);
});

test("each retry gets a fresh popup and delegated ordinary ask opens no duplicate", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Repeated questions", "--skill", "implement", "--session", "retry"]);
  const h = w.host("retry");
  h.ctx.mode = "tui";
  h.ctx.hasUI = true;
  const popups: any[] = [];
  h.ctx.ui.custom = async (factory: any) => new Promise(resolve => {
    popups.push(factory({}, {}, {}, resolve));
  });
  let picks = 0;
  h.ctx.ui.askDialog = async () => { picks++; return undefined; };
  await h.emit("session_start");
  for (const [index, key] of ["\r", "\x1b", "\r"].entries()) {
    const call = { toolName: "ask", toolCallId: `retry-${index}`, input: { questions: [{ id: "same" }] } };
    const pending = h.emit("tool_call", call);
    await Bun.sleep(150);
    expect(popups).toHaveLength(index + 1);
    expect(picks).toBe(index);
    popups[index].handleInput("x");
    expect(picks).toBe(index);
    popups[index].handleInput(key);
    await pending;
    expect(await h.ctx.ui.askDialog(call.input.questions)).toBeUndefined();
    expect(popups).toHaveLength(index + 1);
    await h.emit("tool_result", { toolCallId: call.toolCallId });
  }
  expect(picks).toBe(3);
  expect(h.saved).toEqual([]);
  expect(h.sent).toEqual([]);
});

test("only this main agent's bound interactive TUI gets a popup", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Main binding", "--skill", "implement", "--session", "main"]);
  await w.ok(["open", "--title", "Child binding", "--skill", "research", "--session", "main", "--agent", "child"]);
  const child: FakeAgent = { kind: "sub", id: "child", name: "vstack-worker", depth: 0 };
  for (const [session, agent, mode, hasUI] of [
    ["unbound", undefined, "tui", true],
    ["main", child, "tui", true],
    ["main", undefined, "rpc", true],
    ["main", undefined, "print", true],
    ["main", undefined, "json", true],
    ["main", undefined, "tui", false],
  ] as const) {
    const h = w.host(session, agent);
    h.ctx.mode = mode;
    h.ctx.hasUI = hasUI;
    let shown = false;
    h.ctx.ui.custom = async () => { shown = true; };
    h.ctx.ui.askDialog = async () => "original";
    await h.emit("session_start");
    expect(await h.emit("tool_call", { toolName: "ask", toolCallId: "isolated", input: {} })).toEqual([undefined]);
    expect(await h.ctx.ui.askDialog([])).toBe("original");
    expect(shown).toBe(false);
    expect(h.sent).toEqual([]);
  }
});

test("an unavailable bound host warns in the popup and opens questions without host interference", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Offline handoff", "--skill", "implement", "--session", "offline"]);
  await w.ok(["host", "stop"]);
  const listener = Bun.serve({ port: Number(w.port), fetch: () => new Response("other listener") });
  try {
    const bound = await w.ok(["bound", "--session", "offline"]);
    const h = w.host("offline");
    h.ctx.mode = "tui";
    h.ctx.hasUI = true;
    let component: any;
    h.ctx.ui.custom = async (factory: any) => new Promise(resolve => { component = factory({}, {}, {}, resolve); });
    const pending = h.emit("tool_call", { toolName: "ask", toolCallId: "offline", input: {} });
    await Bun.sleep(150);
    expect(component.render(100).join("\n")).toContain(bound.live.error);
    component.handleInput("\x1b");
    expect(await pending).toEqual([undefined]);
    expect(await (await fetch(`http://127.0.0.1:${w.port}`)).text()).toBe("other listener");
    expect(h.sent).toEqual([]);
    expect(h.saved).toEqual([]);
  } finally { listener.stop(true); }
});

test("Ctrl+C cancels the turn while Enter and Escape remain popup dismissal", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Turn abort", "--skill", "implement", "--session", "ctrl-c"]);
  const h = w.host("ctrl-c");
  h.ctx.mode = "tui";
  h.ctx.hasUI = true;
  let component: any;
  let aborted = false;
  h.ctx.abort = () => { aborted = true; };
  h.ctx.ui.custom = async (factory: any, options: any) => new Promise((resolve, reject) => {
    component = factory({}, {}, {}, resolve);
    options.signal?.addEventListener("abort", () => reject(options.signal.reason), { once: true });
  });
  let picked = false;
  const pending = h.emit("tool_call", { toolName: "ask", toolCallId: "ctrl-c", input: {} });
  const outcome = pending.then(() => { picked = true; }, () => {});
  await Bun.sleep(150);
  component.handleInput("\x03");
  expect(aborted).toBe(true);
  await outcome;
  expect(picked).toBe(false);
});

test("a disabled host remains a dismissible warning with no model or session presentation", async () => {
  const w = setup(true);
  await w.ok(["open", "--title", "Host off", "--skill", "implement", "--session", "off"]);
  const h = w.host("off");
  h.ctx.mode = "tui";
  h.ctx.hasUI = true;
  h.ctx.ui.custom = async (factory: any) => {
    const component = factory({}, {}, {}, () => {});
    expect(component.render(100).join("\n")).toContain("off");
  };
  await h.emit("session_start");
  const entries = h.ctx.sessionManager.getEntries();
  await h.emit("before_agent_start");
  const input = { questions: [{ id: "host-off", question: "Continue?" }] };
  expect(await h.emit("tool_call", { toolName: "ask", toolCallId: "off", input })).toEqual([undefined]);
  expect(h.ctx.sessionManager.getEntries()).toEqual(entries);
  expect(input).toEqual({ questions: [{ id: "host-off", question: "Continue?" }] });
  expect(h.sent).toEqual([]);
  expect(h.saved).toEqual([]);
  const history = [{ role: "user", content: "Continue?" }];
  expect(await h.emit("context", { messages: history })).toEqual([{ messages: history }]);
});


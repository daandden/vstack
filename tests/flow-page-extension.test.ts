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


function panelUI(h: ReturnType<typeof fakeHost>) {
  h.ctx.mode = "tui";
  h.ctx.hasUI = true;
  const widgets: { key: string; content: any; options: any }[] = [];
  h.ctx.ui.setWidget = (key: string, content: any, options?: any) => { widgets.push({ key, content, options }); };
  h.ctx.ui.custom = async () => { throw new Error("The Flow panel opens no custom dialog"); };
  const panel = () => {
    const last = widgets.at(-1);
    return last?.content ? (last.content({}, {}).render(120) as string[]).join("\n") : undefined;
  };
  const shown = () => widgets.filter(widget => widget.content !== undefined).length;
  return { widgets, panel, shown };
}

function holdLookups(h: ReturnType<typeof fakeHost>) {
  const exec = h.pi.exec;
  const held: (() => void)[] = [];
  let finished = 0;
  h.pi.exec = async (...args: any[]) => {
    await new Promise<void>(resolve => held.push(resolve));
    try { return await exec(...args); } finally { finished++; }
  };
  return {
    release: (index?: number) => (index === undefined ? held : [held[index]!]).forEach(resolve => resolve()),
    held: () => held.length,
    finished: () => finished,
  };
}

async function until(condition: () => boolean, timeout = 10_000) {
  const end = Date.now() + timeout;
  while (!condition()) {
    if (Date.now() > end) throw new Error("Timed out waiting for the Flow panel");
    await Bun.sleep(20);
  }
}

const returnsBefore = (pending: Promise<unknown>, ms = 500) =>
  Promise.race([pending.then(() => "returned"), Bun.sleep(ms).then(() => "held")]);

async function publishQuestions(w: ReturnType<typeof world>, session: string, ...refs: string[]) {
  return w.ok(["submit", "--session", session], { version: 1, items: [{
    kind: "round",
    questions: refs.map(ref => ({
      ref, title: `Which ${ref}?`, description: `Choose the ${ref} approach.`,
      needs: [{ need: `Understand the ${ref} trade-offs.`, kind: "prose" }],
      options: ["Keep", "Change"].map(label => ({
        label, does: `${label} the ${ref} approach.`, gains: [`${label} benefits ${ref}.`], costs: [`${label} costs ${ref}.`],
      })),
    })),
  }] });
}

test("an ordinary ask links to its receipt question rather than the newest Stage", async () => {
  const w = setup();
  const opened = await w.ok(["open", "--title", "Asked ticket", "--skill", "implement", "--session", "asked"]);
  const receipt = await publishQuestions(w, "asked", "asked");
  await w.ok(["open", "--flow", opened.flow, "--skill", "implement", "--session", "parallel"]);
  await publishQuestions(w, "parallel", "other");
  const current = await w.ok(["bound", "--session", "asked"]);
  const h = w.host("asked");
  const ui = panelUI(h);
  const input = structuredClone(receipt.ask);
  await h.emit("tool_execution_start", { toolName: "ask", toolCallId: "targeted", args: input });
  await until(() => ui.panel() !== undefined);
  expect(ui.panel()).toContain(`<${current.live.url}#${receipt.ask.questions[0].id}>`);
  expect(input).toEqual(receipt.ask);
  expect(h.sent).toEqual([]);
  expect(h.saved).toEqual([]);
  await h.emit("tool_execution_end", { toolName: "ask", toolCallId: "targeted" });
  expect(ui.panel()).toBeUndefined();
});

test("a multi-question picker links to its first asked question, not the first or newest published question", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Ordered questions", "--skill", "implement", "--session", "ordered"]);
  await publishQuestions(w, "ordered", "earlier");
  const receipt = await publishQuestions(w, "ordered", "first", "second");
  const current = await w.ok(["bound", "--session", "ordered"]);
  const h = w.host("ordered");
  const ui = panelUI(h);
  for (const questions of [receipt.ask.questions, receipt.ask.questions.toReversed()]) {
    await h.emit("tool_execution_start", { toolName: "ask", toolCallId: "multi", args: { questions } });
    await until(() => ui.panel() !== undefined);
    expect(ui.panel()).toContain(`<${current.live.url}#${questions[0].id}>`);
    expect(ui.panel()).not.toContain(`#${questions[1].id}`);
    await h.emit("tool_execution_end", { toolName: "ask", toolCallId: "multi" });
    expect(ui.panel()).toBeUndefined();
  }
});

test("an ask with no question id in the bound Flow links to the bound Stage", async () => {
  const w = setup();
  const opened = await w.ok(["open", "--title", "Stage fallback", "--skill", "implement", "--session", "fallback"]);
  const receipt = await publishQuestions(w, "fallback", "local");
  await w.ok(["open", "--flow", opened.flow, "--skill", "implement", "--session", "newer"]);
  await w.ok(["open", "--title", "Unrelated Flow", "--skill", "implement", "--session", "foreign"]);
  const foreign = await publishQuestions(w, "foreign", "foreign-first", "foreign-second");
  const current = await w.ok(["bound", "--session", "fallback"]);
  const h = w.host("fallback");
  const ui = panelUI(h);
  for (const [index, args] of [
    {}, { questions: [{ question: "No id" }] }, { questions: [{ id: opened.stage }] },
    { questions: [{ id: "question-999" }] }, { questions: [foreign.ask.questions[1]] },
  ].entries()) {
    const toolCallId = `fallback-${index}`;
    await h.emit("tool_execution_start", { toolName: "ask", toolCallId, args });
    await until(() => ui.panel() !== undefined);
    expect(ui.panel()).toContain(`<${current.live.url}#${opened.stage}>`);
    expect(ui.panel()).not.toContain(`#${receipt.ask.questions[0].id}`);
    await h.emit("tool_execution_end", { toolName: "ask", toolCallId });
    expect(ui.panel()).toBeUndefined();
  }
});

test("a bound ask shows the Flow panel above the composer while it runs, without holding the picker", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Question handoff", "--skill", "implement", "--session", "panel"]);
  const current = await w.ok(["bound", "--session", "panel"]);
  const h = w.host("panel");
  const ui = panelUI(h);
  const lookups = holdLookups(h);
  const input = { questions: [{ id: "a" }, { id: "b" }] };
  expect(await h.emit("tool_call", { toolName: "ask", toolCallId: "ask-1", input })).toEqual([undefined]);
  lookups.release();
  await Bun.sleep(300);
  expect(ui.shown()).toBe(0);
  const start = { toolName: "ask", toolCallId: "ask-1", args: input };
  expect(await returnsBefore(h.emit("tool_execution_start", start))).toBe("returned");
  expect(ui.panel()).toBeUndefined();
  await until(() => lookups.held() === 1);
  lookups.release();
  await until(() => ui.panel() !== undefined);
  const panel = ui.panel()!;
  expect(panel).toContain("Flow page");
  expect(panel).toContain(current.live.url);
  expect(panel).not.toContain("Enter or Esc");
  expect(ui.widgets.filter(widget => widget.content).map(widget => widget.options)).toEqual([{ placement: "aboveEditor" }]);
  await h.emit("tool_execution_end", { toolName: "ask", toolCallId: "ask-1", isError: false });
  expect(ui.panel()).toBeUndefined();
  expect(new Set(ui.widgets.map(widget => widget.key)).size).toBe(1);
  expect(input).toEqual({ questions: [{ id: "a" }, { id: "b" }] });
  expect(h.sent).toEqual([]);
  expect(h.saved).toEqual([]);
});

test("a picker that closes before its link lookup finishes leaves no panel behind", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Fast answer", "--skill", "implement", "--session", "fast"]);
  const h = w.host("fast");
  const ui = panelUI(h);
  const lookups = holdLookups(h);
  await h.emit("tool_execution_start", { toolName: "ask", toolCallId: "fast", args: {} });
  await h.emit("tool_execution_end", { toolName: "ask", toolCallId: "fast", isError: true });
  lookups.release();
  await until(() => lookups.finished() === 1);
  await Bun.sleep(100);
  expect(ui.shown()).toBe(0);
  expect(ui.panel()).toBeUndefined();
});

test("a late lookup from a closed picker never replaces the panel of a call that reuses its id", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Old Flow", "--skill", "implement", "--session", "reuse-a"]);
  await w.ok(["open", "--title", "New Flow", "--skill", "implement", "--session", "reuse-b"]);
  const old = await w.ok(["bound", "--session", "reuse-a"]);
  const current = await w.ok(["bound", "--session", "reuse-b"]);
  const h = w.host("reuse-a");
  const ui = panelUI(h);
  const lookups = holdLookups(h);
  const call = { toolName: "ask", toolCallId: "same", args: {} };
  await h.emit("tool_execution_start", call);
  await h.emit("tool_execution_end", { ...call, isError: true });
  h.ctx.sessionManager = { ...h.ctx.sessionManager, getSessionId: () => "reuse-b" };
  await h.emit("session_switch");
  await h.emit("tool_execution_start", call);
  await until(() => lookups.held() === 2);
  lookups.release(1);
  await until(() => ui.panel()?.includes(current.live.url) ?? false);
  lookups.release(0);
  await until(() => lookups.finished() === 2);
  await Bun.sleep(100);
  expect(ui.panel()).toContain(current.live.url);
  expect(ui.panel()).not.toContain(old.live.url);
});

test("native host approval shows the panel while its dialog is open and follows session lifecycle", async () => {
  const w = setup();
  await w.ok(["open", "--title", "First approval", "--skill", "tune-llm-flow", "--session", "native-a"]);
  await w.ok(["open", "--title", "Second approval", "--skill", "tune-llm-flow", "--session", "native-b"]);
  const first = await w.ok(["bound", "--session", "native-a"]);
  const second = await w.ok(["bound", "--session", "native-b"]);
  const h = w.host("native-a");
  const ui = panelUI(h);
  const order: string[] = [];
  const answer = { kind: "submit", results: [] };
  let finish!: (value: unknown) => void;
  h.ctx.ui.askDialog = async () => { order.push("native"); return new Promise(resolve => { finish = resolve; }); };
  await h.emit("session_start");
  const native = h.ctx.ui.askDialog;
  h.ctx.ui.askDialog = async (...args: any[]) => { order.push("other-wrapper"); return native(...args); };
  await h.emit("before_agent_start");
  const questions = [{ id: "approval", question: "Approve?", options: [{ label: "Approve" }] }];
  const pending = h.ctx.ui.askDialog(questions);
  await until(() => order.includes("native"));
  await until(() => ui.panel()?.includes(`<${first.live.url}#${first.stage}>`) ?? false);
  finish(answer);
  expect(await pending).toBe(answer);
  expect(ui.panel()).toBeUndefined();
  expect(order).toEqual(["other-wrapper", "native"]);
  h.ctx.sessionManager = { ...h.ctx.sessionManager, getSessionId: () => "native-b" };
  await h.emit("session_switch");
  const again = h.ctx.ui.askDialog(questions);
  await until(() => ui.panel()?.includes(`<${second.live.url}#${second.stage}>`) ?? false);
  finish(answer);
  expect(await again).toBe(answer);
  expect(ui.panel()).toBeUndefined();
  await h.emit("session_shutdown");
  const shown = ui.shown();
  const late = h.ctx.ui.askDialog(questions);
  await Bun.sleep(300);
  finish(answer);
  expect(await late).toBe(answer);
  expect(ui.shown()).toBe(shown);
});

test("a failed, cancelled, or abandoned picker removes the panel", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Abandoned questions", "--skill", "implement", "--session", "gone"]);
  const h = w.host("gone");
  const ui = panelUI(h);
  let fail!: (error: Error) => void;
  h.ctx.ui.askDialog = async () => new Promise((_resolve, reject) => { fail = reject; });
  await h.emit("session_start");
  const failing = h.ctx.ui.askDialog([]);
  await until(() => ui.panel() !== undefined);
  fail(new Error("dialog broke"));
  await expect(failing).rejects.toThrow("dialog broke");
  expect(ui.panel()).toBeUndefined();
  for (const end of ["agent_end", "session_switch", "session_shutdown"]) {
    await h.emit("session_start");
    await h.emit("tool_execution_start", { toolName: "ask", toolCallId: end, args: {} });
    await until(() => ui.panel() !== undefined);
    await h.emit(end);
    expect(ui.panel()).toBeUndefined();
  }
});

test("each retry gets one fresh panel that leaves when its delegated dialog closes, before the tool ends", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Repeated questions", "--skill", "implement", "--session", "retry"]);
  const h = w.host("retry");
  const ui = panelUI(h);
  let picks = 0;
  let close!: () => void;
  h.ctx.ui.askDialog = async () => { picks++; return new Promise<undefined>(resolve => { close = () => resolve(undefined); }); };
  await h.emit("session_start");
  for (const index of [0, 1, 2]) {
    const call = { toolName: "ask", toolCallId: `retry-${index}`, args: { questions: [{ id: "same" }] } };
    await h.emit("tool_execution_start", call);
    const dialog = h.ctx.ui.askDialog(call.args.questions);
    await until(() => ui.panel() !== undefined);
    await Bun.sleep(300);
    expect(ui.shown()).toBe(index + 1);
    close();
    expect(await dialog).toBeUndefined();
    expect(ui.panel()).toBeUndefined();
    await h.emit("tool_execution_end", { toolName: call.toolName, toolCallId: call.toolCallId, isError: false });
    expect(ui.panel()).toBeUndefined();
  }
  expect(picks).toBe(3);
  expect(h.saved).toEqual([]);
  expect(h.sent).toEqual([]);
});

test("a lookup that finishes after the delegated dialog closed shows no panel while the tool still runs", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Slow answer images", "--skill", "implement", "--session", "images"]);
  const h = w.host("images");
  const ui = panelUI(h);
  h.ctx.ui.askDialog = async () => "answered";
  await h.emit("session_start");
  const lookups = holdLookups(h);
  await h.emit("tool_execution_start", { toolName: "ask", toolCallId: "images", args: {} });
  expect(await h.ctx.ui.askDialog([])).toBe("answered");
  lookups.release();
  await until(() => lookups.finished() === 1);
  await Bun.sleep(100);
  expect(ui.shown()).toBe(0);
  await h.emit("tool_execution_end", { toolName: "ask", toolCallId: "images", isError: false });
  expect(ui.shown()).toBe(0);
});

test("a dialog from an earlier ask never clears the panel of a newer ask", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Earlier ask", "--skill", "implement", "--session", "owner-a"]);
  await w.ok(["open", "--title", "Newer ask", "--skill", "implement", "--session", "owner-b"]);
  const newer = await w.ok(["bound", "--session", "owner-b"]);
  const h = w.host("owner-a");
  const ui = panelUI(h);
  let close!: () => void;
  h.ctx.ui.askDialog = async () => new Promise<undefined>(resolve => { close = () => resolve(undefined); });
  await h.emit("session_start");
  await h.emit("tool_execution_start", { toolName: "ask", toolCallId: "earlier", args: {} });
  const earlier = h.ctx.ui.askDialog([]);
  h.ctx.sessionManager = { ...h.ctx.sessionManager, getSessionId: () => "owner-b" };
  await h.emit("session_switch");
  await h.emit("tool_execution_start", { toolName: "ask", toolCallId: "newer", args: {} });
  await until(() => ui.panel()?.includes(newer.live.url) ?? false);
  close();
  await earlier;
  expect(ui.panel()).toContain(newer.live.url);
});

test("only this main agent's bound interactive TUI gets a panel", async () => {
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
    const ui = panelUI(h);
    h.ctx.mode = mode;
    h.ctx.hasUI = hasUI;
    h.ctx.ui.askDialog = async () => "original";
    await h.emit("session_start");
    expect(await h.emit("tool_execution_start", { toolName: "ask", toolCallId: "isolated", args: {} })).toEqual([undefined]);
    expect(await h.ctx.ui.askDialog([])).toBe("original");
    await Bun.sleep(300);
    expect(ui.shown()).toBe(0);
    expect(h.sent).toEqual([]);
  }
});

test("an unavailable bound host shows its error in the panel without host interference", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Offline handoff", "--skill", "implement", "--session", "offline"]);
  await w.ok(["host", "stop"]);
  const listener = Bun.serve({ port: Number(w.port), fetch: () => new Response("other listener") });
  try {
    const bound = await w.ok(["bound", "--session", "offline"]);
    const h = w.host("offline");
    const ui = panelUI(h);
    expect(await h.emit("tool_execution_start", { toolName: "ask", toolCallId: "offline", args: {} })).toEqual([undefined]);
    await until(() => ui.panel() !== undefined);
    expect(ui.panel()).toContain(bound.live.error);
    expect(await (await fetch(`http://127.0.0.1:${w.port}`)).text()).toBe("other listener");
    expect(h.sent).toEqual([]);
    expect(h.saved).toEqual([]);
  } finally { listener.stop(true); }
});

test("a disabled host shows its state in the panel with no model or session presentation", async () => {
  const w = setup(true);
  await w.ok(["open", "--title", "Host off", "--skill", "implement", "--session", "off"]);
  const h = w.host("off");
  const ui = panelUI(h);
  await h.emit("session_start");
  const entries = h.ctx.sessionManager.getEntries();
  await h.emit("before_agent_start");
  const input = { questions: [{ id: "host-off", question: "Continue?" }] };
  expect(await h.emit("tool_call", { toolName: "ask", toolCallId: "off", input })).toEqual([undefined]);
  expect(await h.emit("tool_execution_start", { toolName: "ask", toolCallId: "off", args: input })).toEqual([undefined]);
  await until(() => ui.panel() !== undefined);
  expect(ui.panel()).toContain("off");
  expect(h.ctx.sessionManager.getEntries()).toEqual(entries);
  expect(input).toEqual({ questions: [{ id: "host-off", question: "Continue?" }] });
  expect(h.sent).toEqual([]);
  expect(h.saved).toEqual([]);
  const history = [{ role: "user", content: "Continue?" }];
  expect(await h.emit("context", { messages: history })).toEqual([{ messages: history }]);
});

import { afterAll, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
const urls = (h: ReturnType<typeof fakeHost>) => h.sent.flatMap((m: any) => m.content.match(/http:\/\/127\.0\.0\.1:\d+\/f\/[^\s)]+/g) ?? []);
const completedReply = (text = "Done.") => ({
  isTerminal: true,
  messages: [{ role: "assistant", stopReason: "stop", content: [{ type: "text", text }] }],
});

test("a session's Flow returns after every completed reply, including a blocker and follow-up", async () => {
  const w = setup();
  const a = await w.ok(["open", "--title", "First ticket", "--skill", "implement", "--ticket", "284", "--session", "a"]);
  const b = await w.ok(["open", "--title", "Other ticket", "--skill", "implement", "--ticket", "285", "--session", "b"]);
  const h = w.host("a");
  await h.emit("before_agent_start", { prompt: "Work on the ticket" });
  await h.emit("agent_end", { isTerminal: false });
  expect(urls(h)).toHaveLength(0);
  for (const text of ["Implemented.", "Blocked on credentials.", "Here is why the blocker matters."]) {
    await h.emit("agent_end", completedReply(text));
  }
  expect(urls(h)).toEqual([a.live.url, a.live.url, a.live.url]);
  const resumed = w.host("a");
  await resumed.emit("before_agent_start", { prompt: "Continue" });
  await resumed.emit("agent_end", completedReply("Continued."));
  expect(urls(resumed)).toEqual([a.live.url]);
  const other = w.host("b");
  await other.emit("agent_end", completedReply("Other ticket complete."));
  expect(urls(other)).toEqual([b.live.url]);
  const unbound = w.host("unbound");
  await unbound.emit("agent_end", completedReply());
  expect(unbound.sent).toHaveLength(0);
});

test("cancelled retries do not present a Flow without a completed visible reply", async () => {
  const w = setup();
  const a = await w.ok(["open", "--title", "Cancelled retries", "--skill", "implement", "--session", "a"]);
  const h = w.host("a");
  await h.emit("agent_end", completedReply("The first reply is complete."));
  const aborted = { role: "assistant", stopReason: "aborted", content: [{ type: "text", text: "" }] };
  for (const messages of [
    [aborted],
    [aborted],
    [...completedReply("Earlier text in the cancelled run.").messages, aborted],
    [{ ...aborted, stopReason: "error", content: [{ type: "text", text: "Request failed." }] }],
    [{ ...aborted, stopReason: "toolUse" }, { role: "toolResult", isError: true }],
    completedReply("  ").messages,
    [],
  ]) {
    await h.emit("agent_end", { isTerminal: true, messages });
    expect(urls(h)).toEqual([a.live.url]);
  }
  const resumed = w.host("a");
  await resumed.emit("agent_end", { isTerminal: true, messages: [aborted] });
  expect(urls(resumed)).toEqual([]);
  await resumed.emit("agent_end", completedReply("A new reply after retrying."));
  expect(urls(resumed)).toEqual([a.live.url]);
});

test("Flow presentation stays in the transcript but not ordinary-turn model context", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Context isolation", "--skill", "implement", "--session", "context"]);
  const h = w.host("context");
  const start = await h.emit("before_agent_start") as any[];
  const { message: identity } = start.find(result => result?.message?.customType === "vstack-flow-context");
  await h.emit("agent_end", completedReply());
  const [presentation] = h.sent as any[];
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

test("an occupied live endpoint presents the static page and the observed failure, not an old URL", async () => {
  const w = setup();
  const a = await w.ok(["open", "--title", "Offline ticket", "--skill", "implement", "--session", "a"]);
  await w.ok(["host", "stop"]);
  const listener = Bun.serve({ port: Number(w.port), fetch: () => new Response("another program") });
  try {
    const current = await w.ok(["bound", "--session", "a"]);
    expect(current.live.state).toBe("unavailable");
    const h = w.host("a");
    await h.emit("agent_end", completedReply());
    expect(urls(h)).toHaveLength(0);
    const content = h.sent.map((m: any) => m.content).join("\n");
    expect(content).toContain(a.page);
    expect(content).toContain(current.live.error);
    expect((await fetch(`http://127.0.0.1:${w.port}`)).status).toBe(200);
  } finally { listener.stop(true); }
});

test("session and agent bindings keep ticket contributions and later presentation separate", async () => {
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
  await h.emit("agent_end", completedReply("First ticket complete."));
  h.ctx.sessionManager = { ...h.ctx.sessionManager, getSessionId: () => "b" };
  await h.emit("session_switch");
  await h.emit("agent_end", completedReply("Second ticket complete."));
  expect(urls(h)).toEqual([a.live.url, b.live.url]);
  const sub = w.host("a", { kind: "sub", id: "worker-1", name: "vstack-worker", depth: 1, parentId: "Main" });
  await sub.emit("agent_end", completedReply());
  expect(sub.sent).toHaveLength(0);
  expect((await w.ok(["bound", "--session", "a"])).stage).toBe(a.stage);
  expect((await w.ok(["bound", "--session", "a", "--agent", "worker-1"])).stage).toBe(child.stage);
});

const questionContribution = () => ({
  version: 1,
  items: [{
    kind: "round",
    questions: [{
      ref: "scope",
      title: "Keep the terminal picker?",
      description: "Keep the full context on the Flow page.",
      needs: [{ need: "Choose where to answer.", kind: "prose" }],
      options: [
        { label: "Keep", does: "Keeps terminal answers.", gains: ["Familiar input."], costs: ["Two views."], recommended: "Preserve the chosen interaction." },
        { label: "Change", does: "Moves answers.", gains: ["One view."], costs: ["Different input."] },
      ],
    }],
  }],
});

function routedPicker(h: ReturnType<typeof fakeHost>, dialog: (questions: any[], options: any) => Promise<any>) {
  h.ctx.mode = "tui";
  h.ctx.hasUI = true;
  Object.defineProperty(h.ctx.ui, Symbol.for("omp-tools.host-ask-dialog"), { value: { opens: [dialog] }, configurable: true });
  h.ctx.ui.askDialog = dialog;
}

test("one question call publishes full context and shows its link before the omp-tools picker", async () => {
  const w = setup();
  const opened = await w.ok(["open", "--title", "One-call questions", "--skill", "grill-me", "--session", "one-call"]);
  const h = w.host("one-call");
  const raw = {
    kind: "submit",
    results: [{
      id: "question-1", question: "Q1. Keep the terminal picker?", options: ["A. Keep", "B. Change"], multi: false,
      selectedOptions: [], customInput: "Keep it, with my exact words.\nNo invented pick.", note: "A. Keep: retain the full page.",
    }],
  };
  routedPicker(h, async (questions) => {
    expect(h.uiCalls).toContainEqual({ method: "notify", args: [`Flow page: ${opened.live.url}`, "info"] });
    expect(questions).toEqual([{
      id: "question-1", question: "Q1. Keep the terminal picker?",
      options: [{ label: "A. Keep" }, { label: "B. Change" }], recommended: 0,
    }]);
    return raw;
  });
  const result = await h.callTool("flow_ask", { contribution: questionContribution() } as any);
  expect(result.details.status).toBe("submitted");
  expect(result.details.response).toEqual(raw);
  const state = await w.ok(["show", "--flow", opened.flow]);
  expect(state.revision).toBe(opened.revision + 1);
  expect(state.stages[0].open_questions).toBe(1);
  expect(state.stages[0].questions.map((q: any) => q.id)).toEqual(["question-1"]);
});

test("an unavailable omp-tools route leaves the Flow unchanged instead of opening native ask", async () => {
  const w = setup();
  const opened = await w.ok(["open", "--title", "Picker required", "--skill", "grill-me", "--session", "missing-picker"]);
  const h = w.host("missing-picker");
  h.ctx.mode = "tui";
  h.ctx.hasUI = true;
  h.ctx.ui.askDialog = async () => { throw new Error("Native dialog must not open"); };
  const result = await h.callTool("flow_ask", { contribution: questionContribution() } as any);
  expect(result.details).toMatchObject({ status: "unavailable", error: expect.stringContaining("omp-tools") });
  expect(result.details.receipt).toBeUndefined();
  const state = await w.ok(["show", "--flow", opened.flow]);
  expect(state.revision).toBe(opened.revision);
  expect(state.stages[0].questions).toEqual([]);
});

test("repeating a committed question returns its receipt without asking the user twice", async () => {
  const w = setup();
  const opened = await w.ok(["open", "--title", "Do not ask twice", "--skill", "grill-me", "--session", "repeat"]);
  const h = w.host("repeat");
  routedPicker(h, async () => ({
    kind: "submit",
    results: [{ id: "question-1", question: "Q1. Keep the terminal picker?", options: ["A. Keep", "B. Change"], multi: false, selectedOptions: ["A. Keep"] }],
  }));
  const first = await h.callTool("flow_ask", { contribution: questionContribution() } as any);
  h.ctx.ui.askDialog = async () => { throw new Error("The user must not be asked twice"); };
  const repeated = await h.callTool("flow_ask", { contribution: questionContribution() } as any);
  expect(first.details.status).toBe("submitted");
  expect(repeated.details).toMatchObject({ status: "repeated", receipt: { flow: opened.flow, revision: first.details.receipt.revision, repeated: true } });
  expect(repeated.details.response).toBeUndefined();
  expect((await w.ok(["show", "--flow", opened.flow])).revision).toBe(first.details.receipt.revision);
});

test("a picker failure reports the committed question instead of losing its receipt", async () => {
  const w = setup();
  const opened = await w.ok(["open", "--title", "Committed before failure", "--skill", "grill-me", "--session", "picker-failure"]);
  const h = w.host("picker-failure");
  routedPicker(h, async () => { throw new Error("Picker disconnected after publication"); });
  const result = await h.callTool("flow_ask", { contribution: questionContribution() } as any);
  expect(result.details).toMatchObject({
    status: "failed", error: "Picker disconnected after publication",
    receipt: { flow: opened.flow, revision: opened.revision + 1, refs: { scope: "question-1" } },
  });
  const state = await w.ok(["show", "--flow", opened.flow]);
  expect(state.revision).toBe(opened.revision + 1);
  expect(state.stages[0].open_questions).toBe(1);
});

test("a committed stale page is reported without prompting on context the user cannot read", async () => {
  const w = setup();
  const opened = await w.ok(["open", "--title", "Read before answering", "--skill", "grill-me", "--session", "stale"]);
  const h = w.host("stale");
  routedPicker(h, async () => { throw new Error("A stale page must not prompt"); });
  chmodSync(dirname(opened.page), 0o555);
  try {
    const result = await h.callTool("flow_ask", { contribution: questionContribution() } as any);
    expect(result.details).toMatchObject({
      status: "unavailable",
      receipt: { revision: opened.revision + 1, presentation: { state: "stale" } },
      error: expect.stringContaining("committed"),
    });
    expect(h.uiCalls.some(call => call.method === "notify" && call.args[0].includes(opened.page))).toBe(true);
  } finally {
    chmodSync(dirname(opened.page), 0o755);
  }
  const state = await w.ok(["show", "--flow", opened.flow]);
  expect(state.revision).toBe(opened.revision + 1);
  expect(state.stages[0].open_questions).toBe(1);
});

test("picker image answers reach the model as images without base64 duplicated into answer text", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Image answer", "--skill", "grill-me", "--session", "image"]);
  const h = w.host("image");
  const image = { type: "image", mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=" };
  const raw = { kind: "submit", results: [{
    id: "question-1", question: "Q1. Keep the terminal picker?", options: ["A. Keep", "B. Change"], multi: false,
    selectedOptions: ["A. Keep"], timedOut: true, customInput: "See [Image #1].", note: "Keep my note verbatim.", customInputImages: [image],
  }] };
  routedPicker(h, async () => raw);
  const result = await h.callTool("flow_ask", { contribution: questionContribution() } as any);
  expect(result.details.response).toEqual(raw);
  expect(result.content).toContainEqual(image);
  expect(result.content.filter((block: any) => block.type === "text").map((block: any) => block.text).join("\n")).not.toContain(image.data);
});

test("a question call without a round refuses before committing unrelated content", async () => {
  const w = setup();
  const opened = await w.ok(["open", "--title", "Question call contract", "--skill", "grill-me", "--session", "no-round"]);
  const h = w.host("no-round");
  routedPicker(h, async () => { throw new Error("No round was provided"); });
  const result = await h.callTool("flow_ask", { contribution: { version: 1, items: [{
    kind: "topic", title: "Not a question", summary: "Must not commit.", body: "No question is present.", sources: ["fixture"],
  }] } } as any);
  expect(result.details).toMatchObject({ status: "failed", error: expect.stringContaining("exactly one round") });
  expect(result.details.receipt).toBeUndefined();
  expect((await w.ok(["show", "--flow", opened.flow])).revision).toBe(opened.revision);
});

test("losing the picker route during publication never falls back to the host dialog", async () => {
  const w = setup();
  const opened = await w.ok(["open", "--title", "Picker route changed", "--skill", "grill-me", "--session", "route-changed"]);
  const h = w.host("route-changed");
  routedPicker(h, async () => undefined);
  const exec = h.pi.exec;
  h.pi.exec = async (...args: any[]) => {
    const result = await exec(...args);
    delete h.ctx.ui[Symbol.for("omp-tools.host-ask-dialog")];
    h.ctx.ui.askDialog = async () => { throw new Error("Native fallback must not open"); };
    return result;
  };
  const result = await h.callTool("flow_ask", { contribution: questionContribution() } as any);
  expect(result.details).toMatchObject({
    status: "unavailable", error: expect.stringContaining("omp-tools"),
    receipt: { flow: opened.flow, revision: opened.revision + 1 },
  });
  expect((await w.ok(["show", "--flow", opened.flow])).stages[0].open_questions).toBe(1);
});

test("a cancelled call cannot publish a question or turn a default into consent", async () => {
  const w = setup();
  const opened = await w.ok(["open", "--title", "Cancelled before publication", "--skill", "grill-me", "--session", "abort"]);
  const h = w.host("abort");
  routedPicker(h, async () => { throw new Error("Cancelled calls must not open a picker"); });
  const controller = new AbortController();
  controller.abort();
  const result = await h.callTool("flow_ask", { contribution: questionContribution() } as any, controller.signal);
  expect(result.details.status).toBe("cancelled");
  expect(result.details.receipt).toBeUndefined();
  expect(result.details.response).toBeUndefined();
  expect((await w.ok(["show", "--flow", opened.flow])).revision).toBe(opened.revision);
});

test("Flow multi-select questions keep multiple explicit selections through the existing picker", async () => {
  const w = setup();
  const opened = await w.ok(["open", "--title", "Multi-select cleanup approval", "--skill", "clean-wt", "--session", "multi"]);
  const h = w.host("multi");
  const raw = { kind: "submit", results: [{
    id: "question-1", question: "Q1. Keep the terminal picker?", options: ["A. Keep", "B. Change"], multi: true,
    selectedOptions: ["A. Keep", "B. Change"],
  }] };
  routedPicker(h, async questions => {
    expect(questions[0].multi).toBe(true);
    return raw;
  });
  const question = questionContribution().items[0]!.questions[0]!;
  const result = await h.callTool("flow_ask", { contribution: { version: 1, items: [{ kind: "round", questions: [{ ...question, multi: true }] }] } } as any);
  expect(result.details.status).toBe("submitted");
  expect(result.details.response.results[0].selectedOptions).toEqual(["A. Keep", "B. Change"]);
  await w.ok(["submit", "--session", "multi"], { version: 1, items: [{ kind: "answer", question: "question-1", response: { status: "answered", picks: ["A", "B"] } }] });
  const state = await w.ok(["show", "--flow", opened.flow]);
  expect(state.stages[0].questions[0]).toMatchObject({ multi: true, answer: { response: { picks: ["A", "B"] } } });
});

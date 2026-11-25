import { afterAll, expect, test } from "bun:test";
import { parseHtmlForm } from "@oh-my-pi/pi-coding-agent/tools/html-form/parse";
import { decisionBrief } from "./support/decision-brief.ts";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withToolApprovalScope } from "./support/extension-mocks.ts";
import { fakeHost, type FakeAgent } from "./support/extension-host.ts";
import { ENV, git } from "./support/fixture.ts";

const script = join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-extension-")));
const worlds: ReturnType<typeof world>[] = [];
afterAll(async () => {
  for (const w of worlds) await w.shutdown();
  for (const w of worlds) await w.run(["host", "stop"]);
  rmSync(root, { recursive: true, force: true });
});

function world(hostOff = false) {
  const home = join(root, String(worlds.length));
  const project = join(home, "project");
  mkdirSync(project, { recursive: true });
  git(project, "init", "-q", "-b", "main");
  const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = String(listener.port);
  listener.stop(true);
  const hosts: ReturnType<typeof fakeHost>[] = [];
  let running = 0;
  const run = async (args: string[], input?: unknown) => {
    running++;
    try {
      const p = Bun.spawn([process.execPath, script, "--home", home, ...args], {
        cwd: project, env: { ...ENV, HOME: join(root, "default-home"), VSTACK_FLOW_PORT: port, ...(hostOff ? { VSTACK_FLOW_HOST: "off" } : {}) },
        stdin: input === undefined ? "ignore" : new TextEncoder().encode(JSON.stringify(input)), stdout: "pipe", stderr: "pipe",
      });
      const [stdout, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
      return { stdout, stderr, code, killed: false };
    } finally { running--; }
  };
  const ok = async (args: string[], input?: unknown) => {
    const r = await run(args, input);
    expect(r.code).toBe(0);
    return JSON.parse(r.stdout);
  };
  const host = (sessionId: string, agent: FakeAgent = { kind: "main", id: "Main", name: "main", depth: 0 }) => {
    const h = fakeHost({ sessionId, agent, exec: async (_command, args) => run(args.slice(1)) });
    h.ctx.cwd = project;
    hosts.push(h);
    return h;
  };
  const shutdown = async () => {
    for (const h of hosts) await h.emit("session_shutdown");
    await until(() => running === 0);
  };
  return { home, project, port, run, ok, host, shutdown };
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
  type Tree = { kind: string; role?: string; head?: string; text?: string; children: Tree[] };
  const describe = (node: any): Tree => ({ kind: node.kind, ...node.props(), children: node.children().map(describe) });
  const tree = () => {
    const last = widgets.at(-1);
    return last?.content ? describe(last.content({}, {})) : undefined;
  };
  const texts = (node: Tree): string[] => [node.head, node.text, ...node.children.flatMap(texts)].filter((text): text is string => text !== undefined);
  const panel = () => {
    const root = tree();
    return root && texts(root).join("\n");
  };
  const shown = () => widgets.filter(widget => widget.content !== undefined).length;
  return { widgets, tree, panel, shown };
}

function holdLookups(h: ReturnType<typeof fakeHost>) {
  const exec = h.pi.exec;
  const held: (() => void)[] = [];
  let finished = 0;
  h.pi.exec = async (...args: any[]) => {
    if (args[1]?.[1] !== "bound") return exec(...args);
    await new Promise<void>(resolve => held.push(resolve));
    try { return await exec(...args); } finally { finished++; }
  };
  return {
    release: (index?: number) => (index === undefined ? held : [held[index]!]).forEach(resolve => resolve()),
    held: () => held.length,
    finished: () => finished,
  };
}

async function until(condition: () => boolean | Promise<boolean>, timeout = 10_000) {
  const end = Date.now() + timeout;
  while (!(await condition())) {
    if (Date.now() > end) throw new Error("Timed out waiting for the Flow panel");
    await Bun.sleep(20);
  }
}

const returnsBefore = (pending: Promise<unknown>, ms = 500) =>
  Promise.race([pending.then(() => "returned"), Bun.sleep(ms).then(() => "held")]);

function flowQuestion(ref: string, again?: string, reason?: string) {
  return {
    ref, title: `Which ${ref}?`, description: `Choose the ${ref} approach.`,
    brief: decisionBrief(ref, { again: reason }),
    ...(again ? { again } : {}),
    needs: [{ need: `Understand the ${ref} trade-offs.`, kind: "prose" }],
    options: ["Keep", "Change"].map(label => ({
      label, does: `${label} the ${ref} approach.`, gains: [`${label} benefits ${ref}.`], costs: [`${label} costs ${ref}.`],
    })),
  };
}

async function publishQuestions(w: ReturnType<typeof world>, session: string, ...refs: string[]) {
  return w.ok(["submit", "--session", session], { version: 1, items: [{
    kind: "round",
    now: "The fixture offers choices for the picker.",
    questions: refs.map(ref => flowQuestion(ref)),
  }] });
}

function askForm(...ids: string[]) {
  const fields = ids.map(id => `<fieldset><legend>Choose for ${id}</legend>` +
    `<label><input type="radio" name="${id}" value="keep">Keep</label>` +
    `<label><input type="radio" name="${id}" value="change">Change</label></fieldset>`);
  return { html: `<form>${fields.join("")}</form>` };
}

function nativeForms(h: ReturnType<typeof fakeHost>) {
  let dialog!: ReturnType<typeof Promise.withResolvers<unknown>>;
  h.ctx.ui.formDialog = () => (dialog = Promise.withResolvers<unknown>()).promise;
  return async (id: string, input: { html: string }) => {
    const call = { toolName: "ask", toolCallId: id };
    expect(await h.emit("tool_call", { ...call, input })).toEqual([undefined]);
    await h.emit("tool_execution_start", { ...call, args: input });
    const settled = h.ctx.ui.formDialog(input.html);
    const { resolve, reject } = dialog;
    return { call, settled, fail: reject, close: (value?: unknown) => { resolve(value); return settled; } };
  };
}

test("overlapping native asks keep the Flow link and presence on the form omp presents", async () => {
  const w = setup();
  const opened = await w.ok(["open", "--title", "Overlapping asks", "--skill", "implement", "--session", "overlap"]);
  const receipt = await publishQuestions(w, "overlap", "first", "second");
  const h = w.host("overlap");
  const ui = panelUI(h);
  let presented: string | undefined;
  let tail = Promise.resolve();
  const forms = new Map<string, ReturnType<typeof Promise.withResolvers<void>>>();
  h.ctx.ui.formDialog = (html: string) => {
    const form = Promise.withResolvers<void>();
    forms.set(html, form);
    return tail = tail.then(() => {
      presented = html;
      return form.promise;
    });
  };
  await h.emit("session_start");
  const lookups = holdLookups(h);
  const start = async (ref: string) => {
    const input = askForm(receipt.refs[ref]);
    const call = { toolName: "ask", toolCallId: ref };
    expect(await h.emit("tool_call", { ...call, input })).toEqual([undefined]);
    await h.emit("tool_execution_start", { ...call, args: input });
    const settled = h.ctx.ui.formDialog(input.html);
    return { ...input, settled };
  };
  const first = await start("first");
  const firstUrl = `${opened.live.url}#${receipt.refs.first}`;
  const secondUrl = `${opened.live.url}#${receipt.refs.second}`;
  const target = () => w.ok(["target", "--session", "overlap"]);
  let second: Awaited<ReturnType<typeof start>> | undefined;
  try {
    await until(() => lookups.held() === 1);
    lookups.release(0);
    await until(() => ui.panel()?.includes(firstUrl) ?? false);
    await until(async () => (await target()).target === firstUrl);
    second = await start("second");
    expect(lookups.held()).toBe(1);
    expect(presented).toBe(first.html);
    expect(await target()).toMatchObject({ target: firstUrl, picker: expect.any(String) });
    expect(ui.panel()).toContain(firstUrl);
    forms.get(first.html)!.resolve();
    await first.settled;
    expect(presented).toBe(second.html);
    await until(() => lookups.held() === 2);
    lookups.release(1);
    await until(() => ui.panel()?.includes(secondUrl) ?? false);
    await until(async () => (await target()).target === secondUrl);
  } finally {
    for (const form of forms.values()) form.resolve();
    await Promise.all([first.settled, second?.settled]);
    lookups.release();
  }
  expect(ui.panel()).toBeUndefined();
  await until(async () => (await target()).picker === null);
});

test.each(["cancelled", "failed"])("a queued form takes over after a %s Ratchet dialog", async outcome => {
  const w = setup();
  const opened = await w.ok(["open", "--title", "Ratchet then ask", "--skill", "tune-llm-flow", "--session", "ratchet-overlap"]);
  const receipt = await publishQuestions(w, "ratchet-overlap", "next");
  const h = w.host("ratchet-overlap");
  const ui = panelUI(h);
  const approval = Promise.withResolvers<undefined>();
  const form = Promise.withResolvers<undefined>();
  let formPresented = false;
  h.ctx.ui.askDialog = () => approval.promise;
  h.ctx.ui.formDialog = async () => {
    await approval.promise.catch(() => {});
    formPresented = true;
    return form.promise;
  };
  await h.emit("session_start");
  const lookups = holdLookups(h);
  const approvalResult = h.ctx.ui.askDialog([{ id: "approval", question: "Approve?", options: [{ label: "Approve" }] }]);
  void approvalResult.catch(() => {});
  const stageUrl = `${opened.live.url}#${opened.stage}`;
  const questionUrl = `${opened.live.url}#${receipt.refs.next}`;
  const target = () => w.ok(["target", "--session", "ratchet-overlap"]);
  let formResult: Promise<unknown> | undefined;
  try {
    await until(() => lookups.held() === 1);
    lookups.release(0);
    await until(() => ui.panel()?.includes(stageUrl) ?? false);
    await until(async () => (await target()).picker !== null);
    const before = await target();
    expect(before.target).toBe(stageUrl);
    const call = { toolName: "ask", toolCallId: "queued", input: { html: receipt.ask.html } };
    expect(await h.emit("tool_call", call)).toEqual([undefined]);
    await h.emit("tool_execution_start", { ...call, args: call.input });
    formResult = h.ctx.ui.formDialog(call.input.html);
    expect(formPresented).toBe(false);
    expect(ui.panel()).toContain(stageUrl);
    expect(await target()).toMatchObject({ target: stageUrl, picker: before.picker });
    expect(lookups.held()).toBe(1);
    if (outcome === "failed") {
      approval.reject(new Error("Ratchet dialog failed"));
      await expect(approvalResult).rejects.toThrow("Ratchet dialog failed");
    } else {
      approval.resolve(undefined);
      expect(await approvalResult).toBeUndefined();
    }
    await until(() => formPresented && lookups.held() === 2);
    lookups.release(1);
    await until(() => ui.panel()?.includes(questionUrl) ?? false);
    await until(async () => (await target()).target === questionUrl);
    expect((await target()).picker).not.toBe(before.picker);
  } finally {
    approval.resolve(undefined);
    form.resolve(undefined);
    await Promise.allSettled([approvalResult, formResult]);
    lookups.release();
  }
  expect(ui.panel()).toBeUndefined();
  await until(async () => (await target()).picker === null);
});

test("a renamed Flow control is refused before omp's synthetic start can show a panel or presence", async () => {
  const w = setup();
  const opened = await w.ok(["open", "--title", "Guarded handoff", "--skill", "implement", "--session", "strict"]);
  const receipt = await publishQuestions(w, "strict", "first");
  const h = w.host("strict");
  const ui = panelUI(h);
  const openForm = nativeForms(h);
  await h.emit("session_start");
  const call = { toolName: "ask", toolCallId: "renamed" };
  const args = { html: receipt.ask.html.replaceAll(`name="${receipt.refs.first}"`, 'name="renamed"') };
  expect(await h.emit("tool_call", { ...call, input: args })).toEqual([{
    block: true, reason: expect.stringMatching(/"renamed".*not a published question.*publish the round.*ask\.html.*again/is),
  }]);
  const lookups = h.execCalls.length;
  await h.emit("tool_execution_start", { ...call, args });
  expect(ui.widgets).toEqual([]);
  expect(h.execCalls).toHaveLength(lookups);
  expect(await (await fetch(new URL("presence", opened.live.url))).json()).toEqual({ presences: [] });
  await h.emit("tool_execution_end", { ...call, isError: true });
  expect(ui.widgets).toEqual([]);

  const valid = { html: receipt.ask.html };
  const validForm = await openForm(call.toolCallId, valid);
  await until(() => ui.panel() !== undefined);
  expect(ui.panel()).toContain(`<${opened.live.url}#${receipt.refs.first}>`);
  await validForm.close();
  expect(ui.panel()).toBeUndefined();
});

test("the guard counts a published question's fields as omp's own ask parser does", async () => {
  const w = setup(true);
  await w.ok(["open", "--title", "Repeated controls", "--skill", "implement", "--session", "duplicates"]);
  const receipt = await publishQuestions(w, "duplicates", "first");
  const h = w.host("duplicates");
  panelUI(h);
  const name = receipt.refs.first;
  const call = (html: string) => h.emit("tool_call", { toolName: "ask", toolCallId: "duplicate", input: { html } });
  const append = (extra: string) => receipt.ask.html.replace("</form>", `${extra}</form>`);
  const forms = [
    receipt.ask.html,
    append(`<input type="text" name="${name}" value="extra">`),
    append(`<input type="checkbox" name="${name}" value="extra">`),
    receipt.ask.html.replace("</legend>", `<input type="text" name="${name}"></legend>`),
    append(`<fieldset><fieldset><legend><input type="text" name="${name}"></legend></fieldset></fieldset>`),
    append(`<pre><input type="text" name="${name}"></pre>`),
    append(`<input type="submit" name="${name}"><INPUT TYPE="RESET" name="${name}">`),
    append(`<template><input type="text" name="${name}"></template><noscript><select name="${name}"></select></noscript>`),
    append(`<table><tr><th>Header</th></tr><tr><td><input type="text" name="${name}"></td></tr></table>`),
    append(`<ul><li><input type="text" name="${name}"></li></ul>`),
    receipt.ask.html.replace("<form>", "").replace("</form>", "").replace("</legend>", `<input type="text" name="${name}"></legend>`),
    `<input type="text" name="${name}">`,
  ];
  const duplicates = forms.map(html => {
    const fields = parseHtmlForm(html).fields.map(field => field.name);
    return new Set(fields).size < fields.length;
  });
  expect(duplicates).toEqual([false, true, true, false, true, false, false, false, true, true, false, false]);
  for (const [index, html] of forms.entries()) {
    expect(await call(html)).toEqual([duplicates[index]
      ? { block: true, reason: expect.stringContaining(`"${name}": more than one field uses this name`) }
      : undefined]);
  }
});

test("hidden controls are refused even beside a visible askable question with the same name", async () => {
  const w = setup(true);
  await w.ok(["open", "--title", "Hidden controls", "--skill", "implement", "--session", "hidden"]);
  const receipt = await publishQuestions(w, "hidden", "visible");
  const h = w.host("hidden");
  panelUI(h);
  for (const name of ["hidden-extra", receipt.refs.visible]) {
    const html = receipt.ask.html.replace("</form>", `<input type="hidden" name="${name}" value="A. Keep"></form>`);
    const result = await h.emit("tool_call", { toolName: "ask", toolCallId: name, input: { html } });
    expect(result).toEqual([{
      block: true, reason: expect.stringContaining(`"${name}": hidden controls are not permitted`),
    }]);
  }
});

test("a nameless hidden input is refused beside a visible askable question", async () => {
  const w = setup(true);
  await w.ok(["open", "--title", "Nameless controls", "--skill", "implement", "--session", "hidden"]);
  const receipt = await publishQuestions(w, "hidden", "visible");
  const h = w.host("hidden");
  panelUI(h);
  const call = (extra: string) => h.emit("tool_call", { toolName: "ask", toolCallId: "nameless", input: {
    html: receipt.ask.html.replace("</form>", `${extra}</form>`),
  } });
  expect(await call("<!-- <input type=hidden> -->")).toEqual([undefined]);
  for (const input of ["<input type=hidden>", '<INPUT TyPe="HIDDEN" name="">']) {
    expect(await call(input)).toEqual([{
      block: true, reason: expect.stringContaining("unnamed input: hidden controls are not permitted"),
    }]);
  }
});

test.each([
  ["hidden", "<input type=hidden>", "hidden controls are not permitted"],
  ["duplicate", '<input type=text name="QUESTION">', "more than one field uses this name"],
  ["empty", "", "the form has no controls"],
])("a Flow read fault does not admit a %s form", async (kind, extra, reason) => {
  const w = setup(true);
  await w.ok(["open", "--title", "Malformed form", "--skill", "implement", "--session", "fault"]);
  const receipt = await publishQuestions(w, "fault", "first");
  const h = w.host("fault");
  const exec = h.pi.exec;
  h.pi.exec = async (...args: any[]) => args[1][1] === "ask-status"
    ? { code: 1, stdout: "", stderr: "fixture read failed", killed: false }
    : exec(...args);
  const ui = panelUI(h);
  await h.emit("session_start");
  const html = kind === "empty" ? "<form></form>" :
    receipt.ask.html.replace("</form>", `${extra.replace("QUESTION", receipt.refs.first)}</form>`);
  expect(await h.emit("tool_call", { toolName: "ask", toolCallId: kind, input: { html } })).toEqual([{
    block: true, reason: expect.stringContaining(reason),
  }]);
  expect(ui.widgets).toEqual([]);
});

test("a read fault on a current receipt shows the read error for the native form's lifetime", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Failed read", "--skill", "implement", "--session", "broken"]);
  const receipt = await publishQuestions(w, "broken", "recovery");
  const current = await w.ok(["ask-status", "--session", "broken", receipt.refs.recovery]);
  expect(current.refusals).toEqual([]);
  const h = w.host("broken");
  const ui = panelUI(h);
  const openForm = nativeForms(h);
  await h.emit("session_start");
  const exec = h.pi.exec;
  const error = "could not read the stored Flow for this question";
  h.pi.exec = async (...args: any[]) => args[1][1] === "ask-status"
    ? { code: 1, stdout: "", stderr: error, killed: false }
    : exec(...args);
  const form = await openForm("recovery", { html: receipt.ask.html });
  await until(() => ui.panel() !== undefined);
  expect(ui.panel()).toContain(error);
  await form.close();
  expect(ui.panel()).toBeUndefined();
});

test.each([false, true])("Eval links only the guarded native form and clears its panel on settlement (failed Flow read: %s)", async (failedRead) => {
  const w = setup();
  const opened = await w.ok(["open", "--title", "Eval question", "--skill", "implement", "--session", "eval-picker"]);
  const receipt = await publishQuestions(w, "eval-picker", "first");
  const h = w.host("eval-picker");
  const ui = panelUI(h);
  const error = "injected failure reading ask status";
  const exec = h.pi.exec;
  if (failedRead) {
    h.pi.exec = async (...args: any[]) => args[1][1] === "ask-status"
      ? { code: 1, stdout: "", stderr: error, killed: false }
      : exec(...args);
  }
  const displayed = Promise.withResolvers<void>();
  const picker = Promise.withResolvers<string>();
  let nativeFormCalls = 0;
  h.ctx.ui.custom = () => displayed.promise;
  h.ctx.ui.formDialog = () => ++nativeFormCalls === 1 ? Promise.resolve("unrelated") : picker.promise;
  await h.emit("session_start");
  await withToolApprovalScope(async () => {
    const input = { html: receipt.ask.html };
    const call = { toolName: "ask", toolCallId: "js-ask-bridged", input };
    expect(await h.emit("tool_call", call)).toEqual([undefined]);
    expect(await withToolApprovalScope(() => h.ctx.ui.formDialog(input.html))).toBe("unrelated");
    expect(ui.widgets).toEqual([]);
    const unrelated = h.ctx.ui.custom(() => undefined);
    try {
      expect(await until(() => ui.shown() > 0, 1000).then(() => "shown", () => "absent")).toBe("absent");
    } finally {
      displayed.resolve();
      await unrelated;
    }

    const result = h.ctx.ui.formDialog(input.html);
    const body = failedRead ? error : `<${opened.live.url}#${receipt.refs.first}>`;
    await until(() => ui.panel()?.includes(body) === true, 2000);
    picker.resolve("closed");
    expect(await result).toBe("closed");
    expect(ui.panel()).toBeUndefined();
    expect(ui.shown()).toBe(1);
  });
});

test("the bound Stage accepts only the latest unretired questions with no recorded answer", async () => {
  const w = setup(true);
  const opened = await w.ok(["open", "--title", "Strict Stage", "--skill", "implement", "--session", "strict"]);
  const first = await publishQuestions(w, "strict", "pending", "settled", "timed", "old");
  const parallel = await w.ok(["open", "--flow", opened.flow, "--skill", "implement", "--session", "parallel"]);
  const other = await publishQuestions(w, "parallel", "foreign");
  const submit = (...items: unknown[]) => w.ok(["submit", "--session", "strict"], { version: 1, items });
  await submit(
    { kind: "answer", question: first.refs.settled, response: { status: "answered", picks: ["A"] } },
    { kind: "answer", question: first.refs.timed, response: { status: "timed-out", picks: ["A"] } },
    { kind: "round", now: "The picker still needs an answer.", questions: [flowQuestion("newer", first.refs.old, "The earlier question has no recorded answer.")] },
  );
  const h = w.host("strict");
  panelUI(h);
  const call = (html: string) => h.emit("tool_call", { toolName: "ask", toolCallId: "case", input: { html } });
  const refuse = async (html: string, ...reasons: string[]) => {
    const [outcome] = await call(html) as [{ block?: boolean; reason?: string }];
    expect(outcome?.block).toBe(true);
    for (const reason of [...reasons, "Publish the round", "ask.html", "again"]) expect(outcome.reason).toContain(reason);
  };
  const { pending, settled, timed, old } = first.refs;
  await refuse(askForm(other.refs.foreign, settled, old).html,
    `"${other.refs.foreign}": belongs to Stage ${parallel.stage}, not the bound Stage ${opened.stage}`,
    `"${settled}": already has a recorded answer`, `"${old}": superseded by a re-ask`);
  await refuse(askForm(pending, "--extra", "extra-two").html,
    '"--extra": not a published question', '"extra-two": not a published question');
  await refuse("<form><p>Pick nothing</p></form>", "the form has no controls");
  await refuse(askForm(timed).html, `"${timed}": already has a recorded answer`);
  const reasked = await submit({ kind: "round", now: "The picker still needs an answer.", questions: [flowQuestion("after-timeout", timed, "The earlier picker timed out without an answer.")] });
  expect(await call(reasked.ask.html)).toEqual([undefined]);
  expect(await call(reasked.ask.html.replace("A. Keep", "Changed value"))).toEqual([undefined]);

  const last = await publishQuestions(w, "strict", "retiring");
  const current = await w.ok(["show", "--flow", opened.flow]);
  const questions = current.stages.find((stage: { id: string }) => stage.id === opened.stage).questions;
  await submit({ kind: "stage", state: "finished",
    retire: questions.filter((q: { open: boolean }) => q.open).map((q: { id: string }) => ({ question: q.id, reason: "Stopped work." })) });
  await refuse(last.ask.html, `"${last.refs.retiring}": question is retired`);
});

test("the guard checks receipt and unknown controls while the Local Flow host stays stopped", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Hostless read", "--skill", "implement", "--session", "hostless"]);
  const receipt = await publishQuestions(w, "hostless", "hostless");
  await w.ok(["host", "stop"]);
  const h = w.host("hostless");
  panelUI(h);
  const call = { toolName: "ask", toolCallId: "hostless" };
  expect(await h.emit("tool_call", { ...call, input: { html: receipt.ask.html } })).toEqual([undefined]);
  expect(await h.emit("tool_call", { ...call, input: askForm("unknown") })).toEqual([{
    block: true, reason: expect.stringContaining('"unknown": not a published question'),
  }]);
  const listener = Bun.listen({ hostname: "127.0.0.1", port: Number(w.port), socket: { data() {} } });
  listener.stop(true);
});

test("an eval refusal without execution events does not keep a stale denial across turns", async () => {
  const w = setup();
  const opened = await w.ok(["open", "--title", "Eval refusal", "--skill", "implement", "--session", "eval"]);
  const first = await publishQuestions(w, "eval", "first");
  const h = w.host("eval");
  const ui = panelUI(h);
  const openForm = nativeForms(h);
  await h.emit("session_start");
  const id = { toolName: "ask", toolCallId: "eval-id" };
  await withToolApprovalScope(async () => {
    expect(await h.emit("tool_call", { ...id, input: askForm("unpublished") })).toEqual([{
      block: true, reason: expect.stringContaining('"unpublished": not a published question'),
    }]);
  });
  await h.emit("agent_end");
  const args = { html: first.ask.html };
  const form = await openForm(id.toolCallId, args);
  await until(() => ui.panel() !== undefined);
  expect(ui.panel()).toContain(`<${opened.live.url}#${first.refs.first}>`);
  await form.close();
  expect(ui.panel()).toBeUndefined();

  const retry = { ...id, toolCallId: "lost-picker" };
  for (const isError of [true, false]) {
    const pending = await openForm(retry.toolCallId, args);
    await until(() => ui.panel() !== undefined);
    await h.emit("tool_execution_end", { ...retry, isError });
    await pending.close();
    expect(ui.panel()).toBeUndefined();
  }
});

test("an HTML ask links the Flow panel to the question named by its first control", async () => {
  const w = setup();
  const opened = await w.ok(["open", "--title", "HTML ask", "--skill", "implement", "--session", "html"]);
  const receipt = await publishQuestions(w, "html", "first");
  const h = w.host("html");
  const ui = panelUI(h);
  const openForm = nativeForms(h);
  await h.emit("session_start");
  const form = await openForm("html", askForm(receipt.refs.first));
  await until(() => ui.panel() !== undefined);
  expect(ui.panel()).toContain(`<${opened.live.url}#${receipt.refs.first}>`);
  await form.close();
});

test("an ordinary ask links to its receipt question rather than the newest Stage", async () => {
  const w = setup();
  const opened = await w.ok(["open", "--title", "Asked ticket", "--skill", "implement", "--session", "asked"]);
  const receipt = await publishQuestions(w, "asked", "asked");
  await w.ok(["open", "--flow", opened.flow, "--skill", "implement", "--session", "parallel"]);
  await publishQuestions(w, "parallel", "other");
  const current = await w.ok(["bound", "--session", "asked"]);
  expect(current.live).toMatchObject({ state: "serving" });
  const h = w.host("asked");
  const ui = panelUI(h);
  const openForm = nativeForms(h);
  await h.emit("session_start");
  const input = askForm(receipt.refs.asked);
  const form = await openForm("targeted", input);
  await until(() => ui.panel() !== undefined);
  expect(ui.panel()).toContain(`<${current.live.url}#${receipt.ask.questions[0].id}>`);
  expect(input).toEqual(askForm(receipt.refs.asked));
  expect(h.sent).toEqual([]);
  expect(h.saved).toEqual([]);
  await form.close();
  expect(ui.panel()).toBeUndefined();
});

test("a multi-question picker links to its first asked question, not the first or newest published question", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Ordered questions", "--skill", "implement", "--session", "ordered"]);
  await publishQuestions(w, "ordered", "earlier");
  const receipt = await publishQuestions(w, "ordered", "first", "second");
  const current = await w.ok(["bound", "--session", "ordered"]);
  expect(current.live).toMatchObject({ state: "serving" });
  const h = w.host("ordered");
  const ui = panelUI(h);
  const openForm = nativeForms(h);
  await h.emit("session_start");
  const ids = [receipt.refs.first, receipt.refs.second];
  for (const [first, second] of [ids, ids.toReversed()]) {
    const form = await openForm("multi", askForm(first, second));
    await until(() => ui.panel() !== undefined);
    expect(ui.panel()).toContain(`<${current.live.url}#${first}>`);
    expect(ui.panel()).not.toContain(`#${second}`);
    await form.close();
    expect(ui.panel()).toBeUndefined();
  }
});

test("a stray ask execution event shows no panel without a guarded native form", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Stray start", "--skill", "implement", "--session", "stray"]);
  const h = w.host("stray");
  const ui = panelUI(h);
  await h.emit("session_start");
  const before = h.execCalls.length;
  await h.emit("tool_execution_start", { toolName: "ask", toolCallId: "stray", args: askForm("unrelated") });
  expect(h.execCalls).toHaveLength(before);
  expect(ui.widgets).toEqual([]);
});

test("a bound ask shows the Flow panel above the composer while it runs, without holding the picker", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Question handoff", "--skill", "implement", "--session", "panel"]);
  const receipt = await publishQuestions(w, "panel", "first", "second");
  const current = await w.ok(["bound", "--session", "panel"]);
  expect(current.live).toMatchObject({ state: "serving" });
  const h = w.host("panel");
  const ui = panelUI(h);
  const openForm = nativeForms(h);
  await h.emit("session_start");
  const lookups = holdLookups(h);
  const input = { html: receipt.ask.html };
  const pending = openForm("ask-1", input);
  expect(await returnsBefore(pending)).toBe("returned");
  const form = await pending;
  expect(ui.panel()).toBeUndefined();
  await until(() => lookups.held() === 1);
  lookups.release();
  await until(() => ui.panel() !== undefined);
  expect(ui.tree()).toEqual({
    kind: "card", role: "vstack.flow-panel", head: "Flow page",
    children: [{ kind: "md", text: `<${current.live.url}#${receipt.refs.first}>`, children: [] }],
  });
  const panel = ui.panel()!;
  expect(panel).not.toContain("Enter or Esc");
  expect(ui.widgets.filter(widget => widget.content).map(widget => widget.options)).toEqual([{ placement: "aboveEditor" }]);
  await form.close();
  expect(ui.panel()).toBeUndefined();
  expect(new Set(ui.widgets.map(widget => widget.key)).size).toBe(1);
  expect(input).toEqual({ html: receipt.ask.html });
  expect(h.sent).toEqual([]);
  expect(h.saved).toEqual([]);
});

test("an ordinary native form owns the Flow panel and presence before tool completion", async () => {
  const w = setup();
  const opened = await w.ok(["open", "--title", "Native form", "--skill", "implement", "--session", "native"]);
  const receipt = await publishQuestions(w, "native", "first", "second");
  const h = w.host("native");
  const ui = panelUI(h);
  let submit!: () => void;
  h.ctx.ui.formDialog = () => new Promise<void>(resolve => { submit = resolve; });
  await h.emit("session_start");

  const target = () => w.ok(["target", "--session", "native"]);
  const stageUrl = `${opened.live.url}#${opened.stage}`;
  const questionUrl = `${opened.live.url}#${receipt.refs.first}`;
  const call = { toolName: "ask", toolCallId: "native-form" };
  const args = { html: receipt.ask.html };

  const history = h.ctx.ui.formDialog(args.html);
  expect(await target()).toMatchObject({ target: stageUrl, picker: null });
  expect(ui.panel()).toBeUndefined();
  submit();
  await history;

  expect(await h.emit("tool_call", { ...call, input: args })).toEqual([undefined]);
  await h.emit("tool_execution_start", { ...call, args });
  expect(await target()).toMatchObject({ target: stageUrl, picker: null });
  expect(ui.panel()).toBeUndefined();

  const pending = h.ctx.ui.formDialog(args.html);
  await until(() => ui.panel()?.includes(questionUrl) ?? false);
  const presenceUrl = new URL("presence", opened.live.url);
  const presence = async () => (await (await fetch(presenceUrl)).json() as { presences: unknown[] }).presences;
  const waitPresence = async (count: number) => {
    const deadline = Date.now() + 5000;
    let rows = await presence();
    while (rows.length !== count && Date.now() < deadline) {
      await Bun.sleep(20);
      rows = await presence();
    }
    return rows;
  };
  expect(await waitPresence(1)).toMatchObject([{ session: "native", questions: [receipt.refs.first, receipt.refs.second] }]);
  submit();
  await pending;
  expect(ui.panel()).toBeUndefined();
  expect(await waitPresence(0)).toEqual([]);
  expect(await target()).toMatchObject({ target: stageUrl, picker: null });
  await h.emit("tool_execution_end", call);
});

test("a picker that closes before its link lookup finishes leaves no panel behind", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Fast answer", "--skill", "implement", "--session", "fast"]);
  const receipt = await publishQuestions(w, "fast", "first");
  const h = w.host("fast");
  const ui = panelUI(h);
  const openForm = nativeForms(h);
  await h.emit("session_start");
  const lookups = holdLookups(h);
  const form = await openForm("fast", { html: receipt.ask.html });
  await form.close();
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
  const a = await publishQuestions(w, "reuse-a", "first");
  const b = await publishQuestions(w, "reuse-b", "first");
  const old = await w.ok(["bound", "--session", "reuse-a"]);
  const current = await w.ok(["bound", "--session", "reuse-b"]);
  expect(old.live).toMatchObject({ state: "serving" });
  expect(current.live).toMatchObject({ state: "serving" });
  const h = w.host("reuse-a");
  const ui = panelUI(h);
  const openForm = nativeForms(h);
  await h.emit("session_start");
  const lookups = holdLookups(h);
  const first = await openForm("same", { html: a.ask.html });
  await first.close();
  h.ctx.sessionManager = { ...h.ctx.sessionManager, getSessionId: () => "reuse-b" };
  await h.emit("session_switch");
  const second = await openForm("same", { html: b.ask.html });
  await until(() => lookups.held() === 2);
  lookups.release(1);
  await until(() => ui.panel()?.includes(current.live.url) ?? false);
  lookups.release(0);
  await until(() => lookups.finished() === 2);
  await Bun.sleep(100);
  expect(ui.panel()).toContain(current.live.url);
  expect(ui.panel()).not.toContain(old.live.url);
  await second.close();
});

test("native host approval shows the panel while its dialog is open and follows session lifecycle", async () => {
  const w = setup();
  await w.ok(["open", "--title", "First approval", "--skill", "tune-llm-flow", "--session", "native-a"]);
  await w.ok(["open", "--title", "Second approval", "--skill", "tune-llm-flow", "--session", "native-b"]);
  const first = await w.ok(["bound", "--session", "native-a"]);
  const second = await w.ok(["bound", "--session", "native-b"]);
  expect(first.live).toMatchObject({ state: "serving" });
  expect(second.live).toMatchObject({ state: "serving" });
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
  const receipt = await publishQuestions(w, "gone", "first");
  const h = w.host("gone");
  const ui = panelUI(h);
  let fail!: (error: Error) => void;
  h.ctx.ui.askDialog = async () => new Promise((_resolve, reject) => { fail = reject; });
  const openForm = nativeForms(h);
  await h.emit("session_start");
  const failing = h.ctx.ui.askDialog([]);
  await until(() => ui.panel() !== undefined);
  fail(new Error("dialog broke"));
  await expect(failing).rejects.toThrow("dialog broke");
  expect(ui.panel()).toBeUndefined();
  for (const end of ["agent_end", "session_switch", "session_shutdown"]) {
    await h.emit("session_start");
    const pending = await openForm(end, { html: receipt.ask.html });
    await until(() => ui.panel() !== undefined);
    await h.emit(end);
    expect(ui.panel()).toBeUndefined();
    await pending.close();
  }
});

test("each retry gets a fresh panel that closes with the native form, before the tool ends", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Repeated questions", "--skill", "implement", "--session", "retry"]);
  const receipt = await publishQuestions(w, "retry", "first");
  const h = w.host("retry");
  const ui = panelUI(h);
  const openForm = nativeForms(h);
  await h.emit("session_start");
  for (const index of [0, 1, 2]) {
    const form = await openForm(`retry-${index}`, { html: receipt.ask.html });
    await until(() => ui.panel() !== undefined);
    await Bun.sleep(300);
    expect(ui.shown()).toBe(index + 1);
    expect(await form.close()).toBeUndefined();
    expect(ui.panel()).toBeUndefined();
    await h.emit("tool_execution_end", { ...form.call, isError: false });
    expect(ui.panel()).toBeUndefined();
  }
  expect(h.saved).toEqual([]);
  expect(h.sent).toEqual([]);
});

test("a lookup that finishes after the native form closes shows no panel while the tool still runs", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Slow answer images", "--skill", "implement", "--session", "images"]);
  const receipt = await publishQuestions(w, "images", "first");
  const h = w.host("images");
  const ui = panelUI(h);
  const openForm = nativeForms(h);
  await h.emit("session_start");
  const lookups = holdLookups(h);
  const form = await openForm("images", { html: receipt.ask.html });
  expect(await form.close("answered")).toBe("answered");
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
  const first = await publishQuestions(w, "owner-a", "first");
  const second = await publishQuestions(w, "owner-b", "second");
  const newer = await w.ok(["bound", "--session", "owner-b"]);
  expect(newer.live).toMatchObject({ state: "serving" });
  const h = w.host("owner-a");
  const ui = panelUI(h);
  const openForm = nativeForms(h);
  await h.emit("session_start");
  const earlier = await openForm("earlier", { html: first.ask.html });
  h.ctx.sessionManager = { ...h.ctx.sessionManager, getSessionId: () => "owner-b" };
  await h.emit("session_switch");
  const current = await openForm("newer", { html: second.ask.html });
  await until(() => ui.panel()?.includes(newer.live.url) ?? false);
  await earlier.close();
  expect(ui.panel()).toContain(newer.live.url);
  await current.close();
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
    ["main", undefined, "acp", true],
    ["main", undefined, "print", true],
    ["main", undefined, "json", true],
    ["main", undefined, "tui", false],
  ] as const) {
    const h = w.host(session, agent);
    const ui = panelUI(h);
    h.ctx.mode = mode;
    h.ctx.hasUI = hasUI;
    h.ctx.ui.formDialog = async () => "original";
    await h.emit("session_start");
    expect(await h.emit("tool_call", { toolName: "ask", toolCallId: "isolated", input: askForm("unpublished") })).toEqual([undefined]);
    if (session !== "unbound") expect(h.execCalls).toEqual([]);
    expect(await h.emit("tool_execution_start", { toolName: "ask", toolCallId: "isolated", args: {} })).toEqual([undefined]);
    expect(await h.ctx.ui.formDialog(askForm("unpublished").html)).toBe("original");
    await Bun.sleep(300);
    expect(ui.shown()).toBe(0);
    expect(h.sent).toEqual([]);
  }
});

test("an unavailable bound host shows its error in the panel without host interference", async () => {
  const w = setup();
  await w.ok(["open", "--title", "Offline handoff", "--skill", "implement", "--session", "offline"]);
  const receipt = await publishQuestions(w, "offline", "first");
  await w.ok(["host", "stop"]);
  const listener = Bun.serve({ port: Number(w.port), fetch: () => new Response("other listener") });
  try {
    const bound = await w.ok(["bound", "--session", "offline"]);
    const h = w.host("offline");
    const ui = panelUI(h);
    const openForm = nativeForms(h);
    await h.emit("session_start");
    const pending = await openForm("offline", { html: receipt.ask.html });
    await until(() => ui.panel() !== undefined);
    expect(ui.panel()).toContain(bound.live.error);
    expect(await (await fetch(`http://127.0.0.1:${w.port}`)).text()).toBe("other listener");
    expect(h.sent).toEqual([]);
    expect(h.saved).toEqual([]);
    await pending.close();
  } finally { listener.stop(true); }
});

test("a disabled host shows its state in the panel with no model or session presentation", async () => {
  const w = setup(true);
  await w.ok(["open", "--title", "Host off", "--skill", "implement", "--session", "off"]);
  const receipt = await publishQuestions(w, "off", "host-off");
  const h = w.host("off");
  const openForm = nativeForms(h);
  const ui = panelUI(h);
  await h.emit("session_start");
  const entries = h.ctx.sessionManager.getEntries();
  await h.emit("before_agent_start");
  const input = { html: receipt.ask.html };
  const pending = await openForm("off", input);
  await until(() => ui.panel() !== undefined);
  expect(ui.panel()).toContain("off");
  expect(h.ctx.sessionManager.getEntries()).toEqual(entries);
  expect(input).toEqual({ html: receipt.ask.html });
  expect(h.sent).toEqual([]);
  expect(h.saved).toEqual([]);
  const history = [{ role: "user", content: "Continue?" }];
  expect(await h.emit("context", { messages: history })).toEqual([{ messages: history }]);
  await pending.close();
});

test("a main picker publishes presence and clears it on answer, cancellation, timeout, and failure", async () => {
  const w = setup();
  const opened = await w.ok(["open", "--title", "Picker presence", "--skill", "implement", "--session", "present"]);
  expect(opened.live).toMatchObject({ state: "serving" });
  const receipt = await publishQuestions(w, "present", "first", "second");
  const h = w.host("present");
  const ui = panelUI(h);
  let finish!: (value: unknown) => void;
  h.ctx.ui.askDialog = async () => new Promise(resolve => { finish = resolve; });
  const openForm = nativeForms(h);
  await h.emit("session_start");
  const read = async () => {
    const r = await fetch(new URL("presence", opened.live.url));
    expect(r.status).toBe(200);
    return (await r.json() as any).presences as any[];
  };
  const waitPresence = async (count: number) => {
    let records: any[] = [];
    const end = Date.now() + 10_000;
    do {
      records = await read();
      if (records.length === count) return records;
      await Bun.sleep(20);
    } while (Date.now() < end);
    expect(records).toHaveLength(count);
    return records;
  };
  const ids = [receipt.refs.second, receipt.refs.first];
  for (const outcome of ["answer", "cancel", "timeout", "failure", "ratchet"]) {
    const form = outcome === "ratchet" ? undefined : await openForm(outcome, askForm(...ids));
    const pending = form?.settled ?? h.ctx.ui.askDialog([]);
    const [presence] = await waitPresence(1);
    expect(presence).toMatchObject({
      session: "present", flow: opened.flow, stage: opened.stage,
      questions: outcome === "ratchet" ? [] : ids,
    });
    expect(presence.expires).toBeGreaterThan(Date.now());
    const target = await w.ok(["target", "--session", "present"]);
    expect(target.target).toBe(`${opened.live.url}#${outcome === "ratchet" ? opened.stage : ids[0]}`);
    await until(() => ui.panel() !== undefined);
    expect(ui.panel()).toContain(`<${target.target}>`);
    if (outcome === "failure") {
      void pending.catch(() => {});
      form!.fail(new Error("picker failed"));
      await expect(pending).rejects.toThrow("picker failed");
    } else {
      const value = outcome === "answer" ? { kind: "submit", results: [] } : outcome === "timeout" ? { kind: "timeout" } : undefined;
      if (form) await form.close(value);
      else {
        finish(value);
        await pending;
      }
    }
    expect(ui.panel()).toBeUndefined();
    await waitPresence(0);
    expect((await w.ok(["target", "--session", "present"])).target).toBe(`${opened.live.url}#${opened.stage}`);
  }
});

test("a failed presence write never holds the picker or the panel", async () => {
  const w = setup();
  const opened = await w.ok(["open", "--title", "Independent picker", "--skill", "implement", "--session", "independent"]);
  expect(opened.live).toMatchObject({ state: "serving" });
  const h = w.host("independent");
  const ui = panelUI(h);
  const exec = h.pi.exec;
  let reject!: (error: Error) => void;
  let attempted = false;
  h.pi.exec = async (...args: any[]) => {
    if (args[1][1] === "picker" && args[1][2] === "open") {
      attempted = true;
      return new Promise((_resolve, fail) => { reject = fail; });
    }
    return exec(...args);
  };
  let finish!: () => void;
  let openedPicker = false;
  h.ctx.ui.askDialog = async () => {
    openedPicker = true;
    return new Promise<undefined>(resolve => { finish = () => resolve(undefined); });
  };
  await h.emit("session_start");
  const pending = h.ctx.ui.askDialog([]);
  expect(openedPicker).toBe(true);
  await until(() => attempted && ui.panel() !== undefined);
  expect(ui.panel()).toContain(opened.live.url);
  finish();
  expect(await returnsBefore(pending)).toBe("returned");
  expect(ui.panel()).toBeUndefined();
  reject(new Error("presence write failed"));
});

test("a down host never holds the native picker, and subagents write no presence", async () => {
  const w = setup();
  const opened = await w.ok(["open", "--title", "Main only", "--skill", "implement", "--session", "main-only"]);
  expect(opened.live).toMatchObject({ state: "serving" });
  await w.ok(["open", "--flow", opened.flow, "--skill", "research", "--session", "main-only", "--agent", "child"]);
  const child = w.host("main-only", { kind: "sub", id: "child", name: "vstack-worker", depth: 1 });
  panelUI(child);
  child.ctx.ui.askDialog = async () => "child";
  await child.emit("session_start");
  await child.emit("tool_execution_start", { toolName: "ask", toolCallId: "child", args: {} });
  expect(await child.ctx.ui.askDialog([])).toBe("child");
  await Bun.sleep(100);
  expect(await (await fetch(new URL("presence", opened.live.url))).json()).toEqual({ presences: [] });
  await w.ok(["host", "stop"]);
  const listener = Bun.serve({ port: Number(w.port), fetch: () => new Response("foreign listener") });
  try {
    const h = w.host("main-only");
    const ui = panelUI(h);
    h.ctx.ui.askDialog = async () => "answered";
    await h.emit("session_start");
    expect(await returnsBefore(h.ctx.ui.askDialog([]))).toBe("returned");
    expect(ui.panel()).toBeUndefined();
    expect(await (await fetch(`http://127.0.0.1:${w.port}`)).text()).toBe("foreign listener");
  } finally { listener.stop(true); }
});

test("a delayed old presence write never replaces a newer picker's presence", async () => {
  const w = setup();
  const opened = await w.ok(["open", "--title", "Presence ownership", "--skill", "implement", "--session", "owner"]);
  expect(opened.live).toMatchObject({ state: "serving" });
  const receipt = await publishQuestions(w, "owner", "old", "new");
  const h = w.host("owner");
  const ui = panelUI(h);
  const openForm = nativeForms(h);
  await h.emit("session_start");
  const exec = h.pi.exec;
  let release!: () => void;
  let held = false;
  let inFlight = 0;
  h.pi.exec = async (...args: any[]) => {
    inFlight++;
    try {
      if (!held && args[1][1] === "picker" && args[1][2] === "open") {
        held = true;
        await new Promise<void>(resolve => { release = resolve; });
      }
      return await exec(...args);
    } finally { inFlight--; }
  };
  const first = await openForm("old", askForm(receipt.refs.old));
  await until(() => held && ui.panel() !== undefined);
  await first.close();
  const second = await openForm("new", askForm(receipt.refs.new));
  await until(() => ui.panel() !== undefined);
  await Bun.sleep(100);
  release();
  await until(() => inFlight === 0);
  const target = await w.ok(["target", "--session", "owner"]);
  expect(target.target).toBe(`${opened.live.url}#${receipt.refs.new}`);
  expect(target.picker).not.toBeNull();
  await second.close();
});

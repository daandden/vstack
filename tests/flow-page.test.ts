// flow-page's authoring script run as a process: a bound Stage takes typed contributions, code numbers and links them,
// and one renderer publishes the static Flow page (ADR 0040). Tests read receipts, refusals, the `show` snapshot, and
// page structure (ids and the links between them), never page wording or markup.

import { afterAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "flow-page", "scripts", "flow-page.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-page-test-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));

let home: string;
let cwd: string;
let n = 0;
beforeEach(() => {
  home = join(root, String(n), "home");
  cwd = join(root, String(n++), "work");
  Bun.spawnSync(["mkdir", "-p", home, cwd]);
});

type Run = { code: number; stdout: string; stderr: string; json: any };
function run(args: string[], opts: { session?: string; stdin?: unknown } = {}): Run {
  const env: Record<string, string> = { PATH: process.env.PATH!, HOME: home };
  if (opts.session) env.PI_SESSION_ID = opts.session;
  const stdin = opts.stdin === undefined ? "ignore" : new TextEncoder().encode(typeof opts.stdin === "string" ? opts.stdin : JSON.stringify(opts.stdin));
  const r = Bun.spawnSync(["bun", SCRIPT, ...args, "--home", home], { cwd, env, stdin, stdout: "pipe", stderr: "pipe" });
  const stdout = r.stdout.toString();
  let json: any;
  try {
    json = JSON.parse(stdout);
  } catch {
    json = undefined;
  }
  return { code: r.exitCode, stdout, stderr: r.stderr.toString(), json };
}

const option = (label: string, extra: object = {}) => ({ label, does: `${label} does`, gains: [`${label} gain`], costs: [`${label} cost`], ...extra });
const question = (ref: string, extra: object = {}) => ({
  ref,
  title: `Which ${ref}?`,
  description: `Why ${ref} matters.`,
  options: [option("First", { recommended: "it is first" }), option("Second")],
  ...extra,
});
const contribution = (...items: object[]) => ({ version: 1, items });
const round = (...questions: object[]) => ({ kind: "round", questions });

/** Opens a new Flow with one Stage bound to `session`, and returns the receipt. */
function openFlow(session = "s-1", skill = "grill-me"): any {
  const r = run(["open", "--title", "Checkout limits", "--skill", skill], { session });
  expect(r.stderr).toBe("");
  expect(r.code).toBe(0);
  return r.json;
}
const submit = (session: string | undefined, ...items: object[]) => run(["submit"], { session, stdin: contribution(...items) });
const show = (flow: string) => run(["show", "--flow", flow]).json;

test("a bound caller submits a round and gets assigned references, a numbered label-only ask, and the revision", () => {
  const opened = openFlow();
  const r = submit("s-1", round(question("scope"), question("limit")));
  expect(r.stderr).toBe("");
  expect(r.code).toBe(0);
  const receipt = r.json;
  expect(receipt.flow).toBe(opened.flow);
  expect(receipt.stage).toBe(opened.stage);
  expect(receipt.revision).toBeGreaterThan(opened.revision);
  const scope = receipt.refs.scope;
  const limit = receipt.refs.limit;
  expect(scope).toBeString();
  expect(limit).toBeString();
  expect(scope).not.toBe(limit);
  expect(receipt.ask.questions.map((q: any) => q.id)).toEqual([scope, limit]);
  expect(receipt.ask.questions[0].question).toStartWith("Q1. ");
  expect(receipt.ask.questions[1].question).toStartWith("Q2. ");
  expect(receipt.ask.questions[0].options).toEqual([{ label: "A. First" }, { label: "B. Second" }]);
  expect(statSync(receipt.page).isFile()).toBe(true);
  for (const content of ["Why scope matters.", "First does", "First gain", "it is first"]) expect(r.stdout).not.toContain(content);
});

/** Every file under the test home with its bytes, to prove a refusal wrote nothing. */
function tree(dir = home): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name !== ".lock") out[p] = readFileSync(p, "utf8");
    }
  };
  walk(dir);
  return out;
}

test("another session cannot write through a binding it does not hold, and nothing is written", () => {
  openFlow("s-1");
  const before = tree();
  for (const r of [submit("s-2", round(question("scope"))), submit(undefined, round(question("scope"))), run(["submit", "--agent", "worker"], { session: "s-1", stdin: contribution(round(question("scope"))) })]) {
    expect(r.code).toBe(1);
    expect(r.stderr).not.toBe("");
    expect(r.stdout).toBe("");
  }
  expect(tree()).toEqual(before);
});

test("a caller with no binding writes by naming the Flow and Stage explicitly", () => {
  const opened = openFlow("s-1");
  const r = run(["submit", "--flow", opened.flow, "--stage", opened.stage], { stdin: contribution(round(question("scope"))) });
  expect(r.code).toBe(0);
  expect(r.json.ask.questions[0].question).toStartWith("Q1. ");
  expect(show(opened.flow).stages[0].questions.map((q: any) => q.id)).toEqual([r.json.refs.scope]);
});

test("opening a second Flow moves only the opening session's binding", () => {
  const first = openFlow("s-1");
  const second = openFlow("s-2");
  expect(second.flow).not.toBe(first.flow);
  expect(submit("s-1", round(question("one"))).json.flow).toBe(first.flow);
  expect(submit("s-2", round(question("two"))).json.flow).toBe(second.flow);
  const third = openFlow("s-1");
  expect(submit("s-1", round(question("three"))).json.flow).toBe(third.flow);
  expect(submit("s-2", round(question("four"))).json.flow).toBe(second.flow);
});

test("a session joins an existing Stage with bind, and bind and show create no Stage and no revision", () => {
  const opened = openFlow("s-1");
  const before = show(opened.flow);
  const bound = run(["bind", "--flow", opened.flow, "--stage", opened.stage], { session: "s-2" });
  expect(bound.code).toBe(0);
  const after = show(opened.flow);
  expect(after.revision).toBe(before.revision);
  expect(after.stages.map((st: any) => st.id)).toEqual(before.stages.map((st: any) => st.id));
  expect(submit("s-2", round(question("joined"))).json.stage).toBe(opened.stage);
});

test("any skill opens a Stage; code assigns order and distinct tab labels, with the ticket when given", () => {
  const opened = openFlow("s-1", "made-up-skill");
  const flow = opened.flow;
  for (const [session, args] of [["s-2", ["--skill", "made-up-skill"]], ["s-3", ["--skill", "wayfinder", "--ticket", "270"]], ["s-4", ["--skill", "wayfinder", "--ticket", "271"]]] as const) {
    const r = run(["open", "--flow", flow, ...args], { session });
    expect(r.code).toBe(0);
  }
  const stages = show(flow).stages;
  expect(stages.map((st: any) => st.order)).toEqual([1, 2, 3, 4]);
  expect(new Set(stages.map((st: any) => st.label)).size).toBe(4);
  expect(stages[2].label).toContain("270");
  expect(stages[3].label).toContain("271");
});

test("Q numbers count within a Stage, a question asked again keeps its number, and a new Stage starts again at Q1", () => {
  const opened = openFlow("s-1");
  const first = submit("s-1", round(question("scope"), question("limit"))).json;
  const second = submit("s-1", round(question("scope-again", { again: first.refs.scope }), question("budget"))).json;
  expect(second.ask.questions.map((q: any) => q.question.split(".")[0])).toEqual(["Q1", "Q3"]);
  run(["open", "--flow", opened.flow, "--skill", "to-spec"], { session: "s-2" });
  const third = submit("s-2", round(question("format"))).json;
  expect(third.ask.questions[0].question).toStartWith("Q1. ");
  const snap = show(opened.flow);
  const q = (id: string) => snap.stages.flatMap((st: any) => st.questions).find((x: any) => x.id === id);
  expect(q(first.refs.scope).latest).toBe(false);
  expect(q(first.refs.scope).asked_again_by).toEqual([second.refs["scope-again"]]);
  expect(q(second.refs["scope-again"]).latest).toBe(true);
});

const card = (ref: string) => ({ ref, title: `Finding ${ref}`, label: "issue", blocking: true, impact: "Users see it.", action: "Fix it.", evidence: "a.ts:1" });
const cards = (ref: string, ...entries: object[]) => ({ kind: "result", ref, shape: "cards", title: "Findings", entries });
const topic = (ref: string, sources = ["GLOSSARY.md"]) => ({ kind: "topic", ref, title: `Topic ${ref}`, summary: "One line.", body: "Body.", sources });
const background = (sources = ["GLOSSARY.md"]) => ({ kind: "background", title: "Context", summary: "One line.", sections: [{ heading: "Now", body: "How it works." }], sources });

type PageFacts = { ids: Set<string>; within: Map<string, Set<string>>; scripts: number; handlers: number; outbound: string[]; meta: Record<string, string> };
/** Each element id in the page with the in-page link targets inside it, plus scripts, handlers, outbound links, and meta. */
async function links(page: string): Promise<PageFacts> {
  const f: PageFacts = { ids: new Set(), within: new Map(), scripts: 0, handlers: 0, outbound: [], meta: {} };
  const open: string[] = [];
  await new HTMLRewriter()
    .on("*", {
      element(el) {
        if (el.tagName === "script") f.scripts++;
        if (el.tagName === "meta" && el.getAttribute("name")) f.meta[el.getAttribute("name")!] = el.getAttribute("content") ?? "";
        for (const [name] of el.attributes) if (name.startsWith("on")) f.handlers++;
        const id = el.getAttribute("id");
        if (id) {
          f.ids.add(id);
          f.within.set(id, new Set());
          open.push(id);
          el.onEndTag(() => void open.splice(open.lastIndexOf(id), 1));
        }
        for (const attr of ["href", "src"]) {
          const v = el.getAttribute(attr);
          if (v?.startsWith("#")) for (const o of open) f.within.get(o)!.add(v.slice(1));
          else if (v !== null) f.outbound.push(v);
        }
      },
    })
    .transform(new Response(readFileSync(page, "utf8")))
    .text();
  return f;
}

test("code links questions and Result entries both ways, and every in-page link has a target", async () => {
  openFlow("s-1");
  const r = submit("s-1", cards("review", card("f1"), card("f2")), topic("money"), round(question("fix", { results: ["review/f1"], topics: ["money"] })));
  expect(r.stderr).toBe("");
  const { refs, page, flow } = r.json;
  const entry = refs["review/f1"];
  const anchor = entry.replace("/", "-");
  const l = await links(page);
  for (const targets of l.within.values()) for (const t of targets) expect(l.ids.has(t)).toBe(true);
  expect(l.within.get(refs.fix)!.has(anchor)).toBe(true);
  expect(l.within.get(anchor)!.has(refs.fix)).toBe(true);
  expect(l.within.get(refs.money)!.has(refs.fix)).toBe(true);
  const snap = show(flow);
  expect(snap.stages[0].results[0].entries.find((e: any) => e.id === entry).questions).toEqual([refs.fix]);
  expect(snap.topics[0].questions).toEqual([refs.fix]);
});

test("a source cited in several places is stored once and knows each place that cites it", () => {
  openFlow("s-1");
  const r = submit("s-1", background(["GLOSSARY.md", "docs/adr/0040.md"]), topic("money", ["GLOSSARY.md"]), round(question("fix", { today: [{ text: "Fact.", source: "GLOSSARY.md" }] })));
  expect(r.stderr).toBe("");
  const sources = show(r.json.flow).sources;
  expect(sources.length).toBe(2);
  expect(sources.find((x: any) => x.cited_by.length === 3).cited_by).toContain(r.json.refs.fix);
});

test("answers, the close, and the Overview summary record only what was answered", () => {
  openFlow("s-1");
  const { refs } = submit("s-1", round(question("picked"), question("timed-out"), question("other"))).json;
  const r = submit(
    "s-1",
    { kind: "answer", question: refs.picked, picks: ["B"] },
    { kind: "answer", question: refs["timed-out"], unanswered: "" },
    { kind: "answer", question: refs.other, other: "Neither; keep both." },
    { kind: "close", decisions: [{ question: refs.picked, text: "Second holds." }, { question: refs["timed-out"], text: "Still open." }, { question: refs.other, text: "Both stay." }] },
    { kind: "stage", state: "finished" },
  );
  expect(r.stderr).toBe("");
  const st = show(r.json.flow).stages[0];
  const q = (id: string) => st.questions.find((x: any) => x.id === id);
  expect(st.state).toBe("finished");
  expect(q(refs.picked).answer).toEqual({ state: "answered", picks: ["B. Second"] });
  expect(q(refs["timed-out"]).answer.state).toBe("unanswered");
  expect(q(refs["timed-out"]).answer.picks).toBeUndefined();
  expect(q(refs["timed-out"]).open).toBe(true);
  expect(q(refs.other).answer.picks).toBeUndefined();
  for (const id of Object.values(refs)) expect(q(id as string).decided_in).toBe(st.closes[0].id);
});

test.each([
  ["an unsupported version", { version: 2, items: [round(question("a"))] }, "version"],
  ["an unknown kind", contribution({ kind: "patch", path: "/stages/0", value: {} }), "item 1"],
  ["agent-supplied HTML", contribution(round(question("a", { html: "<b>x</b>" }))), "html"],
  ["agent-supplied CSS on a Result", contribution({ ...cards("r", card("e")), css: "b{}" }), "css"],
  ["a code-owned id", contribution(round(question("a", { id: "question-9" }))), "id"],
  ["a lettered option label", contribution(round(question("a", { options: [option("A. First")] }))), "option 1"],
  ["a missing topic", contribution(round(question("a", { topics: ["nope"] }))), "nope"],
  ["a missing Result entry", contribution(cards("r", card("e")), round(question("a", { results: ["r/missing"] }))), "r/missing"],
  ["a ref used twice", contribution(topic("t"), topic("t")), "item 2"],
  ["questions that ask each other again", contribution(round(question("a", { again: "b" }), question("b", { again: "a" }))), "cycle"],
  ["an answer to a missing question", contribution({ kind: "answer", question: "question-99", picks: ["A"] }), "question-99"],
  ["a second Background", contribution(background(), background()), "item 2"],
  ["a backwards Stage transition", contribution({ kind: "stage", state: "not-started" }), "item 1"],
  ["a table row with the wrong cell count", contribution({ kind: "result", shape: "table", title: "T", columns: ["a", "b"], rows: [{ cells: ["1"] }] }), "row 1"],
  ["a valid item before an invalid one", contribution(topic("ok"), { kind: "close", decisions: [] }), "item 2"],
])("%s is refused precisely with no partial write", (_, input, names) => {
  openFlow("s-1");
  const before = tree();
  const r = run(["submit"], { session: "s-1", stdin: input });
  expect(r.code).toBe(1);
  expect(r.stdout).toBe("");
  expect(r.stderr).toContain(names);
  expect(tree()).toEqual(before);
});

test("a close must decide every latest ask of its Stage", () => {
  openFlow("s-1");
  const { refs } = submit("s-1", round(question("a"), question("b"))).json;
  const before = tree();
  const r = submit("s-1", { kind: "close", decisions: [{ question: refs.a, text: "A holds." }] });
  expect(r.code).toBe(1);
  expect(r.stderr).toContain(refs.b);
  expect(tree()).toEqual(before);
});

test("a finished Stage takes no more content and cannot reopen, and an answer cannot reach into another Stage", () => {
  const opened = openFlow("s-1");
  const { refs } = submit("s-1", round(question("a"))).json;
  expect(submit("s-1", { kind: "answer", question: refs.a, picks: ["A"] }, { kind: "close", decisions: [{ question: refs.a, text: "A." }] }, { kind: "stage", state: "finished" }).code).toBe(0);
  const later = run(["open", "--flow", opened.flow, "--skill", "to-spec"], { session: "s-2" }).json;
  const before = tree();
  for (const r of [
    submit("s-1", round(question("late"))),
    submit("s-1", { kind: "stage", state: "in-progress" }),
    run(["bind", "--flow", opened.flow, "--stage", opened.stage], { session: "s-3" }),
    submit("s-2", { kind: "answer", question: refs.a, picks: ["A"] }),
  ]) {
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(new RegExp(`${opened.stage}|${refs.a}`));
  }
  expect(tree()).toEqual(before);
  expect(later.stage).not.toBe(opened.stage);
});

test("the published page carries no content markup or script and names its revision and renderer", async () => {
  openFlow("s-1");
  const hostile = `<script>alert(1)</script><img src=x onerror=alert(1)>[x](javascript:alert(1))`;
  const r = submit("s-1", topic("t"), round(question("a", { title: hostile, description: hostile, terms: [{ term: hostile, text: hostile }] })));
  expect(r.stderr).toBe("");
  const page = r.json.page;
  const l = await links(page);
  const template = await links(join(import.meta.dir, "..", "plugin", "skills", "flow-page", "templates", "flow-page.html"));
  expect(l.scripts).toBe(template.scripts);
  expect(l.handlers).toBe(0);
  expect(l.outbound).toEqual([]);
  expect(l.meta["flow-page-revision"]).toBe(String(r.json.revision));
  expect(l.meta["flow-page-renderer"]).toBe(String(show(r.json.flow).renderer));
  expect(readdirSync(join(page, "..")).filter((f) => f.endsWith(".tmp"))).toEqual([]);
});

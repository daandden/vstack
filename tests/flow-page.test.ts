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

const answer = (question: string, response: object, reading?: object) => ({ kind: "answer", question, response, ...(reading ? { reading } : {}) });
const picked = (question: string, ...picks: string[]) => answer(question, { status: "answered", picks });
const decide = (...questions: string[]) => ({ kind: "close", decisions: questions.map((question) => ({ question, text: `${question} holds.` })) });
const finish = (...retire: [string, string][]) => ({ kind: "stage", state: "finished", ...(retire.length ? { retire: retire.map(([question, reason]) => ({ question, reason })) } : {}) });
const stageOfQuestion = (snap: any, id: string) => snap.stages.find((st: any) => st.questions.some((q: any) => q.id === id));
const questionOf = (snap: any, id: string) => stageOfQuestion(snap, id).questions.find((q: any) => q.id === id);

test("the user's raw response is stored apart from the agent's reading, and an explicit pick stays a pick", () => {
  const opened = openFlow("s-1");
  const { refs } = submit("s-1", round(question("pick"), question("words"))).json;
  const pickResponse = { status: "answered", picks: ["B"], text: "B, but keep the old limit for admins." };
  const wordsResponse = { status: "answered", text: "Whatever keeps checkout fast; I don't mind which.", note_on: "A" };
  const reading = { outcome: "resolved", decision: "Checkout speed decides it, so the first option holds.", basis: "The user names speed as the only criterion, and only the first option keeps checkout fast.", maps_to: "A" };
  const r = submit("s-1", answer(refs.pick, pickResponse), answer(refs.words, wordsResponse, reading));
  expect(r.stderr).toBe("");
  const snap = show(opened.flow);
  const pick = questionOf(snap, refs.pick).answer;
  expect(pick.state).toBe("picked");
  expect(pick.picks).toEqual(["B. Second"]);
  expect(pick.response).toEqual(pickResponse);
  expect(pick.reading).toBeUndefined();
  const words = questionOf(snap, refs.words);
  expect(words.answer.state).toBe("resolved");
  expect(words.answer.response).toEqual(wordsResponse);
  expect(words.answer.reading).toEqual(reading);
  expect(words.answer.picks).toBeUndefined();
  expect(words.open).toBe(false);
  expect(questionOf(snap, refs.pick).open).toBe(false);
});

test.each([
  ["a reading that overrides an explicit pick", (q: string) => answer(q, { status: "answered", picks: ["A"], text: "Hmm." }, { outcome: "resolved", decision: "B holds.", basis: "The note.", maps_to: "B" })],
  ["words with no reading", (q: string) => answer(q, { status: "answered", text: "Maybe the second?" })],
  ["a timeout read as a decision", (q: string) => answer(q, { status: "timed-out", picks: ["A"] }, { outcome: "resolved", decision: "A holds.", basis: "It was recommended." })],
  ["a cancellation read as a decision", (q: string) => answer(q, { status: "cancelled" }, { outcome: "resolved", decision: "A holds.", basis: "Silence." })],
  ["a headless substitution read as a decision", (q: string) => answer(q, { status: "headless", picks: ["A"] }, { outcome: "resolved", decision: "A holds.", basis: "Recommended." })],
  ["a reading that maps to a missing option", (q: string) => answer(q, { status: "answered", text: "The third." }, { outcome: "resolved", decision: "C holds.", basis: "Named.", maps_to: "C" })],
  ["an empty answered response", (q: string) => answer(q, { status: "answered" })],
])("%s is refused with no write", (_, item) => {
  openFlow("s-1");
  const { refs } = submit("s-1", round(question("a"))).json;
  const before = tree();
  const r = submit("s-1", item(refs.a));
  expect(r.code).toBe(1);
  expect(r.stderr).toMatch(/response|reading/);
  expect(tree()).toEqual(before);
});

test.each([
  ["a note that only asks a question", { status: "answered", text: "What does the second one cost us?" }, { outcome: "question", unresolved: "Which option, once the cost of the second is known." }, "question"],
  ["a concern", { status: "answered", text: "I worry the first breaks admins.", note_on: "A" }, { outcome: "concern", unresolved: "Whether the first option is acceptable for admins." }, "concern"],
  ["an ambiguous note", { status: "answered", text: "Either, really, or neither." }, { outcome: "ambiguous", unresolved: "Which option." }, "ambiguous"],
  ["a timeout with an automatic selection", { status: "timed-out", picks: ["A"] }, undefined, "timed-out"],
  ["a cancellation", { status: "cancelled" }, undefined, "cancelled"],
  ["an empty response", { status: "empty" }, undefined, "empty"],
  ["a headless substitution", { status: "headless", picks: ["A"] }, undefined, "headless"],
])("%s is recorded as non-consent, keeps the raw response, and stays open to ask again", (_, response, reading, why) => {
  const opened = openFlow("s-1");
  const { refs } = submit("s-1", round(question("a"))).json;
  expect(submit("s-1", answer(refs.a, response, reading)).stderr).toBe("");
  const a = questionOf(show(opened.flow), refs.a);
  expect(a.answer.state).toBe("unresolved");
  expect(a.answer.why).toBe(why);
  expect(a.answer.picks).toBeUndefined();
  expect(a.answer.response).toEqual(response);
  if (reading) expect(a.answer.reading).toEqual(reading);
  expect(a.open).toBe(true);
  const again = submit("s-1", round(question("a2", { again: refs.a }))).json;
  const snap = show(opened.flow);
  expect(questionOf(snap, again.refs.a2).q).toBe(a.q);
  expect(questionOf(snap, refs.a).answer.response).toEqual(response);
  expect(questionOf(snap, refs.a).open).toBe(false);
});

test("finishing a Stage needs a reason for each unresolved question and retires it from current work", () => {
  const opened = openFlow("s-1");
  const { refs } = submit("s-1", round(question("done"), question("left"), question("skipped"))).json;
  submit("s-1", picked(refs.done, "A"), answer(refs.left, { status: "timed-out" }), decide(refs.done, refs.left, refs.skipped));
  const before = tree();
  for (const r of [submit("s-1", finish()), submit("s-1", finish([refs.left, "Out of scope now."])), submit("s-1", finish([refs.left, "x"], [refs.skipped, "y"], [refs.done, "z"]))]) {
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(new RegExp(`${refs.skipped}|${refs.done}`));
  }
  expect(tree()).toEqual(before);
  expect(submit("s-1", finish([refs.left, "The ticket breakdown made it moot."], [refs.skipped, "Never asked; the spec settles it."])).stderr).toBe("");
  const snap = show(opened.flow);
  const q = (id: string) => questionOf(snap, id);
  expect(q(refs.left).retired.reason).toBe("The ticket breakdown made it moot.");
  expect(q(refs.left).answer.state).toBe("unresolved");
  expect(q(refs.skipped).answer.state).toBe("open");
  for (const id of [refs.left, refs.skipped, refs.done]) expect(q(id).open).toBe(false);
  expect(q(refs.done).retired).toBeUndefined();
  expect(q(refs.done).answer.state).toBe("picked");
});

test("a still-relevant retired question is asked again in the current Stage, linked to its predecessor", () => {
  const opened = openFlow("s-1");
  const { refs } = submit("s-1", round(question("first"), question("left"))).json;
  submit("s-1", picked(refs.first, "A"), decide(refs.first, refs.left), finish([refs.left, "Deferred to the spec."]));
  const later = run(["open", "--flow", opened.flow, "--skill", "to-spec", "--parent", opened.stage], { session: "s-2" }).json;
  const r = submit("s-2", round(question("left-again", { again: refs.left })));
  expect(r.stderr).toBe("");
  expect(r.json.ask.questions[0].question).toStartWith("Q1. ");
  const snap = show(opened.flow);
  const fresh = questionOf(snap, r.json.refs["left-again"]);
  expect(stageOfQuestion(snap, fresh.id).id).toBe(later.stage);
  expect(fresh.again).toBe(refs.left);
  expect(fresh.open).toBe(true);
  const old = questionOf(snap, refs.left);
  expect(old.asked_again_by).toEqual([fresh.id]);
  expect(old.retired.reason).toBe("Deferred to the spec.");
  expect(old.open).toBe(false);
});

test("a question of another in-progress Stage cannot be asked again across Stages", () => {
  const opened = openFlow("s-1", "wayfinder");
  const { refs } = submit("s-1", round(question("mine"))).json;
  run(["open", "--flow", opened.flow, "--skill", "wayfinder", "--ticket", "272"], { session: "s-2" });
  const before = tree();
  const r = submit("s-2", round(question("stolen", { again: refs.mine })));
  expect(r.code).toBe(1);
  expect(r.stderr).toContain(refs.mine);
  expect(tree()).toEqual(before);
});

test("reopening a decision keeps its earlier answer, and returning to finished work opens a child Stage without rewriting the old one", () => {
  const opened = openFlow("s-1");
  const { refs } = submit("s-1", round(question("limit"))).json;
  submit("s-1", picked(refs.limit, "A"));
  const before = tree();
  const twice = submit("s-1", picked(refs.limit, "B"));
  expect(twice.code).toBe(1);
  expect(twice.stderr).toContain(refs.limit);
  expect(tree()).toEqual(before);
  const reopened = submit("s-1", round(question("limit-again", { again: refs.limit }))).json.refs["limit-again"];
  submit("s-1", picked(reopened, "B"), decide(reopened), finish());
  const snap = show(opened.flow);
  expect(questionOf(snap, refs.limit).answer.picks).toEqual(["A. First"]);
  expect(questionOf(snap, reopened).answer.picks).toEqual(["B. Second"]);
  const oldStage = snap.stages[0];

  const child = run(["open", "--flow", opened.flow, "--skill", "grill-me", "--parent", opened.stage], { session: "s-2" });
  expect(child.code).toBe(0);
  const back = submit("s-2", round(question("limit-third", { again: reopened })));
  expect(back.stderr).toBe("");
  const after = show(opened.flow);
  const childStage = after.stages.find((st: any) => st.id === child.json.stage);
  expect(childStage.parent).toBe(opened.stage);
  expect(after.stages[0].children).toEqual([child.json.stage]);
  const { children: _c, questions: oldQs, ...oldRest } = after.stages[0];
  const { children: _b, questions: beforeQs, ...beforeRest } = oldStage;
  expect(oldRest).toEqual(beforeRest);
  expect(oldQs.map((q: any) => [q.id, q.answer])).toEqual(beforeQs.map((q: any) => [q.id, q.answer]));
  expect(submit("s-2", { kind: "answer", question: refs.limit, response: { status: "answered", picks: ["B"] } }).code).toBe(1);
  expect(run(["open", "--flow", opened.flow, "--skill", "grill-me", "--parent", "stage-99"], { session: "s-3" }).code).toBe(1);
});

const assumed = (ref: string) => ({ kind: "assumed", ref, decision: `Decision ${ref}`, pick: `Pick ${ref}`, why: "README.md:12 says so." });

test("a close covers every recorded decision and every visible Assumed pick, with each decision's provenance", () => {
  const opened = openFlow("s-1");
  const first = submit("s-1", assumed("naming"), assumed("storage"), round(question("user"), question("note"), question("auto"))).json;
  const { refs } = first;
  const reopen = submit(
    "s-1",
    picked(refs.user, "B"),
    answer(refs.note, { status: "answered", text: "Second, obviously." }, { outcome: "resolved", decision: "Second holds.", basis: "The user named it." }),
    answer(refs.auto, { status: "headless", picks: ["A"] }),
    round(question("storage-reopened", { reopens: refs.storage })),
  ).json;
  const storageQ = reopen.refs["storage-reopened"];
  const missing = submit("s-1", decide(refs.user, refs.note, refs.auto));
  expect(missing.code).toBe(1);
  expect(missing.stderr).toContain(storageQ);
  const closed = submit("s-1", picked(storageQ, "A"), decide(refs.user, refs.note, refs.auto, storageQ), finish([refs.auto, "Headless run; not the user's."]));
  expect(closed.stderr).toBe("");
  const st = show(opened.flow).stages[0];
  const close = st.closes.at(-1);
  const from = Object.fromEntries(close.decisions.map((d: any) => [d.question, d.answer]));
  expect(from).toEqual({ [refs.user]: "picked", [refs.note]: "resolved", [refs.auto]: "unresolved", [storageQ]: "picked" });
  expect(close.assumed).toEqual([refs.naming]);
  expect(st.assumed.find((a: any) => a.id === refs.storage).reopened_by).toBe(storageQ);
  expect(st.assumed.find((a: any) => a.id === refs.naming).reopened_by).toBeUndefined();
});

test("finishing a Stage confirms nothing: a headless or timed-out answer is still not the user's after the close", () => {
  const opened = openFlow("s-1");
  const { refs } = submit("s-1", round(question("h"), question("t"))).json;
  const r = submit("s-1", answer(refs.h, { status: "headless", picks: ["A"] }), answer(refs.t, { status: "timed-out", picks: ["A"] }), decide(refs.h, refs.t), finish([refs.h, "Headless run."], [refs.t, "No reply."]));
  expect(r.stderr).toBe("");
  expect(JSON.stringify(r.json)).not.toMatch(/confirm|authori[sz]/i);
  const snap = show(opened.flow);
  for (const id of [refs.h, refs.t]) {
    const q = questionOf(snap, id);
    expect(q.answer.state).toBe("unresolved");
    expect(q.answer.picks).toBeUndefined();
  }
  expect(snap.stages[0].closes[0].decisions.map((d: any) => d.answer)).toEqual(["unresolved", "unresolved"]);
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
  ["an answer to a missing question", contribution({ kind: "answer", question: "question-99", response: { status: "answered", picks: ["A"] } }), "question-99"],
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
  expect(submit("s-1", picked(refs.a, "A"), decide(refs.a), finish()).code).toBe(0);
  const later = run(["open", "--flow", opened.flow, "--skill", "to-spec"], { session: "s-2" }).json;
  const before = tree();
  for (const r of [
    submit("s-1", round(question("late"))),
    submit("s-1", { kind: "stage", state: "in-progress" }),
    run(["bind", "--flow", opened.flow, "--stage", opened.stage], { session: "s-3" }),
    submit("s-2", picked(refs.a, "A")),
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

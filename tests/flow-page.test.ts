import { afterAll, beforeEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { storedFolder } from "./support/flow-store.ts";

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
  const env: Record<string, string> = { PATH: process.env.PATH!, HOME: home, VSTACK_FLOW_HOST: "off" };
  if (opts.session) env.PI_SESSION_ID = opts.session;
  const stdin = opts.stdin === undefined ? "ignore" : new TextEncoder().encode(typeof opts.stdin === "string" ? opts.stdin : JSON.stringify(opts.stdin));
  const r = Bun.spawnSync([process.execPath, SCRIPT, ...args, "--home", home], { cwd, env, stdin, stdout: "pipe", stderr: "pipe" });
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
  needs: [{ need: `Understand why ${ref} changes the decision.`, kind: "prose" }],
  options: [option("First", { recommended: "it is first" }), option("Second")],
  ...extra,
});
const contribution = (...items: object[]) => ({ version: 1, items });
const round = (...questions: object[]) => ({ kind: "round", questions });

function openFlow(session = "s-1", skill = "grill-me"): any {
  const r = run(["open", "--title", "Checkout limits", "--skill", skill], { session });
  expect(r.stderr).toBe("");
  expect(r.code).toBe(0);
  return r.json;
}
const submit = (session: string | undefined, ...items: object[]) => run(["submit"], { session, stdin: contribution(...items) });
const show = (flow: string) => run(["show", "--flow", flow]).json;


const finding = (axis = "standards", extra: object = {}) => ({
  ref: "lost-answer", axis, title: "An answer disappears", label: "issue", blocking: true,
  impact: "A returning reader loses the recorded answer.", location: "answers.ts:42",
  action: "Keep the answer when reconnecting.", evidence: "Reconnect reproduces the missing answer at answers.ts:42.", ...extra,
});
const review = (extra: object = {}) => ({
  kind: "result", ref: "review", shape: "review", title: "Review findings",
  axes: [
    { axis: "standards", status: "findings" },
    { axis: "spec", status: "clean", reason: "Every reviewed requirement is covered." },
    { axis: "blast-radius", status: "unavailable", reason: "The external caller could not be reached." },
  ],
  entries: [finding()], ...extra,
});

test("a review summary links authoritative findings and stays current after a focused correction", () => {
  const opened = openFlow("s-1", "code-review");
  const submitted = submit("s-1", review(), round(question("fix", { results: ["review/lost-answer"] })));
  expect(submitted.code).toBe(0);
  const result = show(opened.flow).stages[0].results[0];
  expect(result.review).toEqual([
    { axis: "standards", status: "findings", finding: "An answer disappears", impact: "A returning reader loses the recorded answer.", location: "answers.ts:42", blocking: true, target: `${result.id}-e1` },
    { axis: "spec", status: "clean", reason: "Every reviewed requirement is covered." },
    { axis: "blast-radius", status: "unavailable", reason: "The external caller could not be reached." },
  ]);
  const revised = submit("s-1", { kind: "revise", result: submitted.json.refs["review/lost-answer"], base: submitted.json.revision,
    set: { impact: "Only the stale browser loses an answer.", location: "answers.ts:51", blocking: false } });
  expect(revised.code).toBe(0);
  const current = show(opened.flow).stages[0].results[0];
  expect(current.review[0]).toMatchObject({ impact: "Only the stale browser loses an answer.", location: "answers.ts:51", blocking: false, target: result.review[0].target });
  expect(current.entries[0].questions).toEqual([submitted.json.refs.fix]);
});

test("a Stage has one authoritative review, and a second review cannot replace or duplicate it", () => {
  openFlow("s-1", "code-review");
  expect(submit("s-1", review()).code).toBe(0);
  const before = tree();
  const duplicate = submit("s-1", review({ ref: "another", title: "Another review" }));
  expect(duplicate.code).toBe(1);
  expect(duplicate.stderr).not.toBe("");
  expect(tree()).toEqual(before);
});

test("a review with no findings states clean, skipped, unavailable, and blocked axes without invented cards", () => {
  const opened = openFlow("s-1", "code-review");
  const axes = [
    { axis: "standards", status: "clean", reason: "No standards breach found." },
    { axis: "spec", status: "skipped", reason: "There is no originating spec." },
    { axis: "blast-radius", status: "blocked", reason: "The required runtime is missing." },
  ];
  const first = submit("s-1", review({ axes, entries: [] }));
  expect(first.code).toBe(0);
  let result = show(opened.flow).stages[0].results[0];
  expect(result.review).toEqual(axes);
  expect(result.entries).toEqual([]);
  axes[2] = { axis: "blast-radius", status: "unavailable", reason: "The provider is unreachable." };
  const next = submit("s-1", { kind: "revise", result: first.json.refs.review, base: first.json.revision, set: { axes } });
  expect(next.code).toBe(0);
  result = show(opened.flow).stages[0].results[0];
  expect(result.review).toEqual(axes);
  expect(result.entries).toEqual([]);
});

test.each([
  ["a missing axis", { axes: [{ axis: "standards", status: "findings" }] }],
  ["a repeated axis", { axes: [{ axis: "standards", status: "findings" }, { axis: "standards", status: "clean", reason: "No breach." }, { axis: "spec", status: "clean", reason: "No gap." }] }],
  ["a clean axis carrying an issue", { axes: [{ axis: "standards", status: "clean", reason: "No breach." }, { axis: "spec", status: "clean", reason: "No gap." }, { axis: "blast-radius", status: "skipped", reason: "Not triggered." }] }],
  ["findings status with no finding", { entries: [] }],
  ["an unavailable axis with no reason", { axes: [{ axis: "standards", status: "findings" }, { axis: "spec", status: "clean", reason: "No gap." }, { axis: "blast-radius", status: "unavailable" }] }],
  ["a finding with no location", { entries: [finding("standards", { location: "" })] }],
  ["a finding on an unknown axis", { entries: [finding("other")] }],
] as const)("a review refuses %s without losing previously published work", (_name, extra) => {
  openFlow("s-1", "code-review");
  const before = tree();
  const refused = submit("s-1", { kind: "topic", title: "Earlier item", summary: "Must not land", body: "No partial write.", sources: ["#285"] }, review(extra));
  expect(refused.code).toBe(1);
  expect(refused.stderr).not.toBe("");
  expect(tree()).toEqual(before);
});

test("a new question declares its reader needs before any part of its contribution is published", () => {
  const opened = openFlow();
  const before = tree();
  const { needs: _, ...bare } = question("scope");
  const refused = submit("s-1",
    { kind: "topic", title: "Unpublished context", summary: "Must remain atomic.", body: "The round is incomplete.", sources: ["fixture"] },
    round(bare));
  expect(refused.code).toBe(1);
  expect(refused.stderr).toContain("needs");
  expect(tree()).toEqual(before);
  expect(show(opened.flow).stages[0].questions).toEqual([]);
});

test("a declared visual need requires a visual with its declared kind on the question", () => {
  openFlow();
  const before = tree();
  const refused = submit("s-1", round(question("source", {
    needs: [{ need: "Read the exact changed configuration.", kind: "source-excerpt" }],
    example: "timeout: 30",
  })));
  expect(refused.code).toBe(1);
  expect(refused.stderr).toContain("source-excerpt");
  expect(tree()).toEqual(before);
});

test.each([
  ["empty needs", { needs: [] }],
  ["unknown need kind", { needs: [{ need: "Find the boundary.", kind: "unknown" }] }],
  ["missing visual kind", { figures: [{ text: "timeout: 30" }] }],
  ["unrequested visual kind", { figures: [{ text: "timeout: 30", kind: "source-excerpt" }] }],
  ["option preview outside an option", { needs: [{ need: "See the output.", kind: "option-preview" }], figures: [{ text: "Ready", kind: "option-preview" }] }],
] as const)("incomplete %s is refused atomically", (_name, extra) => {
  openFlow();
  const before = tree();
  expect(submit("s-1", round(question("source", extra))).code).toBe(1);
  expect(tree()).toEqual(before);
});

test("one complete question publishes source text and option usage with their reader needs in the same revision", () => {
  const opened = openFlow();
  const needs = [
    { need: "Read the current timeout at config.ts:4.", kind: "source-excerpt" },
    { need: "Compare the call a consumer writes.", kind: "option-preview" },
  ];
  const r = submit("s-1", round(question("source", {
    needs,
    figures: [{ text: "config.ts:4\n\ttimeout: 30 < 60", kind: "source-excerpt" }],
    options: [option("Explicit timeout", { preview: { text: "checkout({ timeout: 30 })", kind: "option-preview" } }), option("Default timeout", { preview: { text: "checkout()", kind: "option-preview" } })],
  })));
  expect(r.code).toBe(0);
  const snap = show(opened.flow);
  expect(snap.revision).toBe(r.json.revision);
  expect(snap.stages[0].questions[0].needs).toEqual(needs);
  expect(snap.stages[0].questions[0].figures[0]).toMatchObject({ text: "config.ts:4\n\ttimeout: 30 < 60", kind: "source-excerpt" });
  expect(snap.stages[0].questions[0].options[1].preview).toMatchObject({ text: "checkout()", kind: "option-preview" });
  const before = tree();
  const { needs: _, ...bare } = question("again", { again: r.json.refs.source });
  expect(submit("s-1", round(bare)).code).toBe(1);
  expect(tree()).toEqual(before);
});

test("a Background figure cannot fulfill a question need even when it has the same kind", () => {
  openFlow();
  const before = tree();
  expect(submit("s-1",
    { kind: "background", title: "Source", summary: "Current configuration", sections: [{ heading: "Scope", body: "One checkout." }], sources: ["config.ts:4"], figures: [{ text: "timeout: 30", kind: "source-excerpt" }] },
    round(question("source", { needs: [{ need: "Read the current timeout.", kind: "source-excerpt" }] }))).code).toBe(1);
  expect(tree()).toEqual(before);
});

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
  expect(receipt).not.toHaveProperty("page");
  for (const content of ["Why scope matters.", "First does", "First gain", "it is first"]) expect(r.stdout).not.toContain(content);
});

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

test("code links questions and Result entries both ways", () => {
  openFlow("s-1");
  const r = submit("s-1", cards("review", card("f1"), card("f2")), topic("money"), round(question("fix", { results: ["review/f1"], topics: ["money"] })));
  expect(r.stderr).toBe("");
  const { refs, flow } = r.json;
  const entry = refs["review/f1"];
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

test("a CLI multiselect round retains multiple explicit picks independently of picker delivery", () => {
  const opened = openFlow();
  const published = submit("s-1", round(question("paths", { multi: true }), question("single")));
  expect(published.code).toBe(0);
  const { refs, ask } = published.json;
  expect(ask.questions[0]).toMatchObject({ id: refs.paths, multi: true });
  expect(questionOf(show(opened.flow), refs.paths)).toMatchObject({ multi: true, open: true });
  const response = { status: "answered", picks: ["A", "B"], text: "Keep both explicit choices." };
  const recorded = submit("s-1", answer(refs.paths, response));
  expect(recorded.code).toBe(0);
  const snapshot = show(opened.flow);
  expect(questionOf(snapshot, refs.paths)).toMatchObject({
    multi: true, open: false,
    answer: { state: "picked", picks: ["A. First", "B. Second"], response },
  });
  expect(questionOf(snapshot, refs.single).open).toBe(true);
  const before = tree();
  expect(submit("s-1", round(question("invalid", { multi: "yes" }))).code).toBe(1);
  expect(tree()).toEqual(before);
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

test("hostile text is stored as submitted, and a publication leaves no temporary files", () => {
  openFlow("s-1");
  const hostile = `<script>alert(1)</script><img src=x onerror=alert(1)>[x](javascript:alert(1))`;
  const progress = [
    { kind: "task", ref: "h", title: hostile, state: "skipped", reason: hostile },
    { kind: "task", ref: "k", title: hostile, state: "active" },
    { kind: "blocker", text: hostile, tasks: ["k"] },
    { kind: "check", name: hostile, outcome: "failed", evidence: [hostile] },
  ];
  const r = submit("s-1", topic("t"), round(question("a", { title: hostile, description: hostile, terms: [{ term: hostile, text: hostile }] })), ...progress);
  expect(r.stderr).toBe("");
  const snap = show(r.json.flow);
  expect(snap.revision).toBe(r.json.revision);
  expect(snap.progress.tasks.map((t: any) => t.title)).toEqual([hostile, hostile]);
  const folder = storedFolder(home, r.json.flow);
  expect(readdirSync(folder).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  expect(readdirSync(join(folder, "data")).filter((f) => f.endsWith(".tmp"))).toEqual([]);
});

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const put = (rel: string, bytes: Uint8Array | string) => {
  mkdirSync(dirname(join(cwd, rel)), { recursive: true });
  writeFileSync(join(cwd, rel), bytes);
};
const attachment = (ref: string, type: string, extra: object = {}) => ({ kind: "attachment", ref, type, caption: `Caption of ${ref}`, origin: `Origin of ${ref}`, ...extra });
const CODE = "if (cart.size > limit) {\n\treturn  refuse();\n}\n";
const doc = (ref: string, extra: object = {}) => ({
  kind: "result",
  ref,
  shape: "document",
  title: "How checkout limits work",
  sections: [
    { heading: "Today", blocks: [{ prose: "Limits apply per cart [@adr].\n\n- one\n- two" }, { code: CODE, language: "ts", source: "src/cart.ts:10" }] },
    { heading: "Proof", blocks: [{ figure: "shot" }, { list: ["Measured once [@web].", "Checked by hand."], ordered: true }] },
  ],
  citations: [{ ref: "adr", source: "docs/adr/0040.md" }, { ref: "web", source: "[Spec](https://example.com/spec)" }],
  limitations: ["Measured on one machine."],
  sources: ["GLOSSARY.md"],
  ...extra,
});

const bytesOf = (flow: string, attachment: string) => readFileSync(join(storedFolder(home, flow), show(flow).attachments.find((a: any) => a.id === attachment).file));

test("a Document Result keeps ordered sections, citations, figures, limitations, and sources", () => {
  openFlow("s-1");
  put("shot.png", PNG);
  const r = submit("s-1", attachment("shot", "image", { path: "shot.png" }), doc("doc"));
  expect(r.stderr).toBe("");
  expect(r.code).toBe(0);
  const { refs, flow } = r.json;
  const res = show(flow).stages[0].results.find((x: any) => x.id === refs.doc);
  expect(res.shape).toBe("document");
  const d = res.document;
  expect(d.sections.length).toBe(2);
  expect(new Set(d.sections).size).toBe(2);
  expect(d.figures).toEqual([refs.shot]);
  expect(d.limitations).toBe(1);
  expect(d.limitations_anchor).toBeString();
  expect(d.citations.map((c: any) => c.cited_in)).toEqual([[d.sections[0]], [d.sections[1]]]);
  expect(bytesOf(flow, refs.shot)).toEqual(PNG);
  const sources = show(flow).sources;
  for (const src of res.document.sources) expect(sources.find((x: any) => x.id === src).cited_by).toContain(refs.doc);
});

const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(12)]);
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><style>rect{fill:#a6e3a1}</style><rect width="40" height="20"/></svg>`;

test("every attachment type keeps its caption, origin, captured revision, and availability, and survives moving the Flow", () => {
  openFlow("s-1");
  const files: Record<string, [string, string, Uint8Array | string]> = {
    shot: ["image", "media/shot.png", PNG],
    clip: ["video", "media/clip.mp4", MP4],
    fig: ["svg", "media/fig.svg", SVG],
    table: ["file", "out/report.csv", "a,b\n1,2\n"],
    spans: ["trace", "out/trace.json", '{"spans":[]}\n'],
    log: ["evidence", "out/run.log", "token <REDACTED> accepted\n"],
  };
  for (const [, rel, bytes] of Object.values(files)) put(rel, bytes);
  const items = [
    ...Object.entries(files).map(([ref, [type, path]]) => attachment(ref, type, { path })),
    attachment("app", "artifact", { launch: "Run `bun run dev`, then open the URL.", revision: "abc1234", url: "http://127.0.0.1:3000/" }),
    attachment("gone", "video", { unavailable: "No screen recorder in a headless run." }),
  ];
  const refsOf = [...Object.keys(files), "app", "gone"];
  const r = submit("s-1", ...items, { kind: "result", ref: "proof", shape: "table", title: "Proof", columns: ["Check"], rows: [{ cells: ["ok"] }], attachments: refsOf });
  expect(r.stderr).toBe("");
  const { refs, flow } = r.json;

  const check = () => {
    const snap = show(flow);
    const byId = new Map(snap.attachments.map((a: any) => [a.id, a]));
    const stored = new Map(JSON.parse(readFileSync(join(storedFolder(home, flow), "data", "state.json"), "utf8")).attachments.map((a: any) => [a.id, a]));
    expect(snap.stages[0].results[0].attachments).toEqual(refsOf.map((x) => refs[x]));
    for (const [ref, [type, , bytes]] of Object.entries(files)) {
      const a: any = byId.get(refs[ref]);
      const s: any = stored.get(refs[ref]);
      expect([a.type, a.availability, a.revision, s.caption, s.origin]).toEqual([type, "captured", sha(bytes), `Caption of ${ref}`, `Origin of ${ref}`]);
      expect(bytesOf(flow, refs[ref])).toEqual(Buffer.from(bytes));
    }
    const app: any = byId.get(refs.app);
    expect([app.availability, app.revision, app.file]).toEqual(["external", "abc1234", undefined]);
    const gone: any = byId.get(refs.gone);
    expect([gone.availability, gone.file]).toEqual(["unavailable", undefined]);
    return { snap, folder: storedFolder(home, flow) };
  };
  const before = check();
  const moved = join(dirname(home), "moved-home");
  renameSync(home, moved);
  home = moved;
  const after = check();
  expect(after.folder).not.toBe(before.folder);
  expect(after.snap.attachments).toEqual(before.snap.attachments);
});

const GIF = Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");

test("a Result keeps what it captured when its sources change, until a new revision is published from the same canonical file", () => {
  openFlow("s-1");
  put("docs/research.md", "first findings\n");
  put("shot.png", PNG);
  const first = submit("s-1", attachment("shot", "image", { path: "shot.png" }), doc("doc", { canonical: { file: "docs/research.md" } }));
  expect(first.stderr).toBe("");
  const { refs, flow } = first.json;
  const captured = show(flow).stages[0].results[0];
  expect(captured.canonical).toEqual({ file: "docs/research.md", root: "project", sha256: sha("first findings\n") });

  put("docs/research.md", "second findings\n");
  put("shot.png", GIF);
  const unchanged = show(flow);
  expect(unchanged.stages[0].results[0]).toEqual(captured);
  expect(bytesOf(flow, refs.shot)).toEqual(PNG);

  const sections = doc("doc").sections.map((sec: any, i: number) => (i === 1 ? { ...sec, blocks: [{ figure: "shot-2" }, ...sec.blocks.slice(1)] } : sec));
  const second = submit("s-1", attachment("shot-2", "image", { path: "shot.png" }), { ...doc("doc"), sections, revises: refs.doc });
  expect(second.stderr).toBe("");
  expect(second.json.refs.doc).toBe(refs.doc);
  const snap = show(flow);
  const res = snap.stages[0].results[0];
  expect(snap.stages[0].results.length).toBe(1);
  expect(res.revision).toBe(2);
  expect(res.canonical).toEqual({ file: "docs/research.md", root: "project", sha256: sha("second findings\n") });
  expect(res.revisions.map((x: any) => [x.revision, x.canonical.sha256, x.attachments])).toEqual([
    [1, sha("first findings\n"), [refs.shot]],
    [2, sha("second findings\n"), [second.json.refs["shot-2"]]],
  ]);
  expect(res.history.map((x: any) => [x.anchor, x.attachments])).toEqual([[`${refs.doc}-r1`, [refs.shot]]]);
  expect(bytesOf(flow, second.json.refs["shot-2"])).toEqual(GIF);
  expect(bytesOf(flow, refs.shot)).toEqual(PNG);
});

const shown = (...items: object[]) => [...items, { kind: "result", shape: "table", title: "Proof", columns: ["Check"], rows: [{ cells: ["ok"] }], attachments: items.map((i: any) => i.ref) }];
const prose = (p: string, extra: object = {}) => ({ ...doc("doc", { sections: [{ heading: "Only", blocks: [{ prose: p }] }], ...extra }) });
const unsafeSvg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

test.each([
  ["a path that climbs out of the project", () => shown(attachment("a", "image", { path: "../outside.png" })), "outside"],
  ["an absolute path outside the project and Scratch", () => shown(attachment("a", "image", { path: join(dirname(cwd), "outside.png") })), "outside"],
  ["a symlink that leads out of the project", () => shown(attachment("a", "image", { path: "link.png" })), "symlink"],
  ["a directory", () => shown(attachment("a", "file", { path: "media" })), "regular file"],
  ["a missing file", () => shown(attachment("a", "file", { path: "nope.txt" })), "nope.txt"],
  ["HTML posing as an image", () => shown(attachment("a", "image", { path: "media/page.png" })), "media/page.png"],
  ["an SVG with a script", () => shown(attachment("a", "svg", { path: "media/script.svg" })), "<script>"],
  ["an SVG with an event handler", () => shown(attachment("a", "svg", { path: "media/onload.svg" })), "onload"],
  ["an SVG with an entity-encoded javascript: link", () => shown(attachment("a", "svg", { path: "media/href.svg" })), "javascript"],
  ["an SVG that embeds HTML", () => shown(attachment("a", "svg", { path: "media/foreign.svg" })), "foreignobject"],
  ["a javascript: link in Document prose", () => [prose("See [this](javascript:alert(1)).")], "javascript:"],
  ["a data: link in a citation", () => [prose("Fact [@x].", { citations: [{ ref: "x", source: "[x](data:text/html,hi)" }] })], "citation 1"],
  ["a file: URL on a runnable artifact", () => shown(attachment("a", "artifact", { launch: "Open it.", revision: "1", url: "file:///etc/passwd" })), "url"],
  ["a citation marker with no citation", () => [prose("Fact [@missing].")], "@missing"],
  ["a figure that names no attachment", () => [doc("doc", { sections: [{ heading: "Only", blocks: [{ figure: "attachment-9" }] }] })], "attachment-9"],
  ["an attachment no Result shows", () => [attachment("a", "file", { unavailable: "none" })], "attached to no Result"],
  ["an attachment with both a path and a reason", () => shown(attachment("a", "file", { path: "media/page.png", unavailable: "none" })), "unavailable"],
  ["an unknown attachment type", () => shown(attachment("a", "hologram", { unavailable: "none" })), "hologram"],
  ["a revision of a Result that does not exist", () => [prose("Fact.", { revises: "result-9" })], "result-9"],
])("%s is refused precisely with no partial write", (_, items, names) => {
  openFlow("s-1");
  writeFileSync(join(dirname(cwd), "outside.png"), PNG);
  Bun.spawnSync(["ln", "-s", "../outside.png", join(cwd, "link.png")]);
  put("media/page.png", "<!doctype html><script>alert(1)</script>");
  put("media/script.svg", unsafeSvg("<script>alert(1)</script>"));
  put("media/onload.svg", unsafeSvg(`<rect onload="alert(1)"/>`));
  put("media/href.svg", unsafeSvg(`<a href="java&#x73;cript:alert(1)"><rect/></a>`));
  put("media/foreign.svg", unsafeSvg(`<foreignObject><div>x</div></foreignObject>`));
  const before = tree();
  const r = run(["submit"], { session: "s-1", stdin: contribution(...items()) });
  expect(r.stderr).toContain(names);
  expect(r.code).toBe(1);
  expect(r.stdout).toBe("");
  expect(tree()).toEqual(before);
});

test("a symlink that stays inside the project is captured as the file it points to", () => {
  openFlow("s-1");
  put("media/shot.png", PNG);
  Bun.spawnSync(["ln", "-s", "media/shot.png", join(cwd, "inside.png")]);
  const r = submit("s-1", ...shown(attachment("a", "image", { path: "inside.png" })));
  expect(r.stderr).toBe("");
  expect(show(r.json.flow).attachments[0].revision).toBe(sha(PNG));
});

test("a Result captured from a tracker or commit revision must name its new revision when it is published again", () => {
  openFlow("s-1");
  const first = submit("s-1", prose("Fact.", { canonical: { tracker: "daandden/vstack#267", revision: "2026-10-28T08:00:00Z" } })).json;
  const before = tree();
  const r = submit("s-1", prose("Fact, revised.", { revises: first.refs.doc }));
  expect(r.code).toBe(1);
  expect(r.stderr).toContain("daandden/vstack#267");
  expect(tree()).toEqual(before);
  const ok = submit("s-1", prose("Fact, revised.", { revises: first.refs.doc, canonical: { tracker: "daandden/vstack#267", revision: "2026-10-29T08:00:00Z" } }));
  expect(ok.stderr).toBe("");
  expect(show(first.flow).stages[0].results[0].revisions.map((x: any) => x.canonical.revision)).toEqual(["2026-10-28T08:00:00Z", "2026-10-29T08:00:00Z"]);
});

const task = (ref: string, extra: object = {}) => ({ kind: "task", ref, title: `Task ${ref}`, ...extra });
const progressOf = (flow: string) => show(flow).progress;

test("a task changes state through a focused update", () => {
  openFlow("s-1", "implement");
  const made = submit("s-1", task("build"), task("prove", { state: "active" }));
  expect(made.stderr).toBe("");
  const { refs, flow } = made.json;
  const done = submit("s-1", { kind: "task", task: refs.build, state: "done", evidence: ["bun test tests/flow-page.test.ts: 20 pass"] });
  expect(done.stderr).toBe("");
  const p = progressOf(flow);
  const t = (id: string) => p.tasks.find((x: any) => x.id === id);
  expect(t(refs.build)).toMatchObject({ title: "Task build", state: "done", evidence: 1 });
  expect(t(refs.prove)).toMatchObject({ title: "Task prove", state: "active", evidence: 0 });
  expect(p.remaining).toEqual([refs.prove]);
  expect(p.complete).toBe(false);
});

test("an open blocker blocks its task and keeps the Flow incomplete until it is resolved", () => {
  openFlow("s-1", "implement");
  const { refs, flow } = submit("s-1", task("deploy", { state: "active" }), { kind: "blocker", ref: "creds", text: "No deploy credentials.", tasks: ["deploy"] }, { kind: "end-state", requested: "none" }).json;
  let p = progressOf(flow);
  expect(p.tasks[0].blocked_by).toEqual([refs.creds]);
  expect(p.remaining).toEqual([refs.deploy, refs.creds]);
  submit("s-1", { kind: "task", task: refs.deploy, state: "done", evidence: ["deploy log"] });
  p = progressOf(flow);
  expect(p.tasks[0].blocked_by).toEqual([]);
  expect(p.remaining).toEqual([refs.creds]);
  expect(p.complete).toBe(false);
  submit("s-1", { kind: "blocker", blocker: refs.creds, resolved: "The user added the credentials." });
  p = progressOf(flow);
  expect(p.blockers).toEqual([{ id: refs.creds, state: "resolved", tasks: [refs.deploy] }]);
  expect(p.complete).toBe(true);
});

test("a delivery Flow is complete only when its tasks are settled and it reached the requested End state", () => {
  openFlow("s-1", "implement");
  const { flow } = submit("s-1", { kind: "end-state", requested: "shipped" }, task("code", { state: "done", evidence: ["commit abc123"] }), task("docs", { state: "inapplicable", reason: "No user-facing change." })).json;
  let p = progressOf(flow);
  expect(p.remaining).toEqual([]);
  expect(p.end_state).toEqual({ requested: "shipped", delivery: true, met: false });
  expect(p.complete).toBe(false);
  submit("s-1", { kind: "end-state", reached: "merge-ready", evidence: ["PR is mergeable"] });
  p = progressOf(flow);
  expect(p.end_state).toMatchObject({ requested: "shipped", reached: "merge-ready", met: false });
  expect(p.complete).toBe(false);
  const { refs } = submit("s-1", task("follow-up"), { kind: "end-state", reached: "shipped", evidence: ["merged into main"] }).json;
  p = progressOf(flow);
  expect(p.end_state.met).toBe(true);
  expect(p.remaining).toEqual([refs["follow-up"]]);
  expect(p.complete).toBe(false);
  submit("s-1", { kind: "task", task: refs["follow-up"], state: "skipped", reason: "The user dropped it." });
  expect(progressOf(flow).complete).toBe(true);
});

test("a non-delivery Flow completes without a commit or PR, and its skipped and inapplicable steps are not left work", () => {
  openFlow("s-1", "explain");
  const r = submit(
    "s-1",
    { kind: "end-state", requested: "none" },
    task("explain", { state: "done", evidence: ["Result on this page"] }),
    task("commit", { state: "inapplicable", reason: "An explanation changes no code." }),
    task("pr", { state: "skipped", reason: "Nothing to review." }),
  );
  expect(r.stderr).toBe("");
  const p = progressOf(r.json.flow);
  expect(p.end_state).toEqual({ requested: "none", delivery: false, met: true });
  expect(p.prs).toEqual([]);
  expect(p.remaining).toEqual([]);
  expect(p.tasks.map((t: any) => t.state)).toEqual(["done", "inapplicable", "skipped"]);
  expect(p.complete).toBe(true);
});

test("a finished Stage, done tasks, a merged PR, and a passed check do not reach an End state or each other", () => {
  const opened = openFlow("s-1", "implement");
  const { refs, flow } = submit(
    "s-1",
    { kind: "end-state", requested: "commit" },
    task("code", { state: "done", evidence: ["bun test: 30 pass"] }),
    { kind: "pr", ref: "pr", url: "https://example.com/acme/app/pull/7", state: "open" },
    { kind: "check", ref: "ci", name: "CI", outcome: "pending" },
  ).json;
  submit("s-1", { kind: "pr", pr: refs.pr, state: "merged" }, { kind: "check", check: refs.ci, outcome: "passed", evidence: ["run 42 green"] }, { kind: "stage", state: "finished" });
  const p = progressOf(flow);
  expect(p.stages).toEqual({ finished: 1, total: 1 });
  expect(p.remaining).toEqual([]);
  expect(p.prs).toEqual([{ id: refs.pr, state: "merged" }]);
  expect(p.checks).toEqual([{ id: refs.ci, outcome: "passed" }]);
  expect(p.end_state.reached).toBeUndefined();
  expect(p.complete).toBe(false);
  const later = run(["open", "--flow", flow, "--skill", "implement"], { session: "s-2" }).json;
  expect(submit("s-2", { kind: "end-state", reached: "commit", evidence: ["commit abc123"] }).code).toBe(0);
  const q = progressOf(flow);
  expect(q.complete).toBe(true);
  expect(q.stages).toEqual({ finished: 1, total: 2 });
  expect(show(flow).stages.find((st: any) => st.id === later.stage).state).toBe("in-progress");
  expect(show(flow).stages.find((st: any) => st.id === opened.stage).state).toBe("finished");
});

test("a task opened in one Stage takes a focused update from a later Stage of the same Flow", () => {
  const opened = openFlow("s-1", "to-tickets");
  const { refs, flow } = submit("s-1", task("ticket-1")).json;
  submit("s-1", { kind: "stage", state: "finished" });
  run(["open", "--flow", flow, "--skill", "implement"], { session: "s-2" });
  const r = submit("s-2", { kind: "task", task: refs["ticket-1"], state: "done", evidence: ["commit def456"] });
  expect(r.stderr).toBe("");
  const t = progressOf(flow).tasks[0];
  expect(t).toMatchObject({ id: refs["ticket-1"], stage: opened.stage, title: "Task ticket-1", state: "done", evidence: 1 });
});

test.each([
  ["a done task with no evidence", [task("t", { state: "done" })], "evidence"],
  ["a skipped task with no reason", [task("t", { state: "skipped" })], "reason"],
  ["an inapplicable task with no reason", [task("t", { state: "inapplicable" })], "reason"],
  ["an unknown task state", [task("t", { state: "finished" })], "state"],
  ["a task update that resends the title", [task("t"), { kind: "task", task: "t", title: "Again", state: "active" }], "title"],
  ["an update to a missing task", [{ kind: "task", task: "task-99", state: "active" }], "task-99"],
  ["a blocker on a missing task", [{ kind: "blocker", text: "x", tasks: ["task-99"] }], "task-99"],
  ["a reached End state with no evidence", [{ kind: "end-state", requested: "commit", reached: "commit" }], "evidence"],
  ["a reached End state with none requested", [{ kind: "end-state", reached: "commit", evidence: ["c"] }], "requested"],
  ["a reached End state on a non-delivery Flow", [{ kind: "end-state", requested: "none", reached: "commit", evidence: ["c"] }], "delivery"],
  ["an unknown End state", [{ kind: "end-state", requested: "released" }], "requested"],
  ["a passed check with no evidence", [{ kind: "check", name: "CI", outcome: "passed" }], "evidence"],
  ["a PR that is not a link", [{ kind: "pr", url: "javascript:alert(1)", state: "open" }], "url"],
  ["a task id used as a ref", [task("task-1")], "task-1"],
])("%s is refused precisely with no partial write", (_, items, names) => {
  openFlow("s-1");
  const before = tree();
  const r = run(["submit"], { session: "s-1", stdin: contribution(...items) });
  expect(r.code).toBe(1);
  expect(r.stdout).toBe("");
  expect(r.stderr).toStartWith("flow-page.ts: ");
  expect(r.stderr).toContain(names);
  expect(tree()).toEqual(before);
});

test("resolving a blocker twice is refused with no write", () => {
  openFlow("s-1");
  const { refs } = submit("s-1", { kind: "blocker", ref: "b", text: "Waiting." }).json;
  expect(submit("s-1", { kind: "blocker", blocker: refs.b, resolved: "Done." }).code).toBe(0);
  const before = tree();
  const again = submit("s-1", { kind: "blocker", blocker: refs.b, resolved: "Done again." });
  expect(again.code).toBe(1);
  expect(again.stderr).toContain(refs.b);
  expect(tree()).toEqual(before);
});

const demo = (body: object = {}, extra: object = {}) => ({
  kind: "result",
  ref: "demo",
  shape: "prototype",
  title: "Cart limit",
  demo: {
    values: [
      { name: "items", label: "Items in cart", initial: 0 },
      { name: "coupon", label: "Coupon applied", initial: false },
      { name: "notice", label: "Notice", initial: "none" },
    ],
    states: [{ name: "browsing", label: "Browsing", description: "Add items up to the limit." }, { name: "full", label: "Cart full" }, { name: "paid", label: "Paid" }],
    start: "browsing",
    actions: [
      {
        name: "add",
        label: "Add item",
        transitions: [
          { from: ["browsing"], when: { value: "items", lt: 2 }, set: { items: { add: 1 } } },
          { from: ["browsing"], when: { value: "items", eq: 2 }, to: "full", set: { items: { add: 1 }, notice: "limit reached" } },
        ],
      },
      { name: "coupon", label: "Toggle coupon", transitions: [{ from: ["browsing", "full"], set: { coupon: { toggle: true } } }] },
      { name: "pay", label: "Pay", transitions: [{ from: ["browsing", "full"], when: { all: [{ value: "items", gt: 0 }, { not: { value: "notice", eq: "blocked" } }] }, to: "paid" }] },
    ],
    ...body,
  },
  ...extra,
});

test("a demo beside a real decision does not answer it, and reading the Flow writes no revision", () => {
  const opened = openFlow("s-1", "prototype");
  const r = submit("s-1", demo(), round(question("real")));
  expect(r.stderr).toBe("");
  expect(r.code).toBe(0);
  const { refs, flow, revision } = r.json;
  expect(questionOf(show(flow), refs.real).answer.state).toBe("open");
  expect(show(opened.flow).revision).toBe(revision);
});

const transitions = (...ts: object[]) => ({ actions: [{ name: "go", label: "Go", transitions: ts }] });
const states2 = { states: [{ name: "browsing", label: "Browsing" }, { name: "paid", label: "Paid" }] };

test.each([
  ["a condition written as source code", () => demo(transitions({ when: "items < 3 && fetch('/x')", to: "paid" }, { to: "browsing" })), "when"],
  ["an effect written as an expression", () => demo(transitions({ set: { items: "items + 1" } })), "items"],
  ["a script field on an action", () => demo({ actions: [{ name: "go", label: "Go", onclick: "alert(1)", transitions: [{ to: "browsing" }] }] }), "onclick"],
  ["an unsupported operator", () => demo(transitions({ when: { value: "items", matches: "^1" } })), "matches"],
  ["a numeric comparison on a boolean", () => demo(transitions({ when: { value: "coupon", lt: 1 } })), "coupon"],
  ["a literal of the wrong type", () => demo(transitions({ set: { coupon: "yes" } })), "coupon"],
  ["adding to a text value", () => demo(transitions({ set: { notice: { add: 1 } } })), "notice"],
  ["a condition on an unknown value", () => demo(transitions({ when: { value: "total", gt: 0 } })), "total"],
  ["a transition to an unknown state", () => demo(transitions({ to: "shipped" })), "shipped"],
  ["a transition from an unknown state", () => demo(transitions({ from: ["lost"], to: "browsing" })), "lost"],
  ["a start that is not a state", () => demo({ start: "checkout" }), "checkout"],
  ["a state no action can reach", () => demo({ ...states2, actions: [{ name: "stay", label: "Stay", transitions: [{ from: ["browsing"] }] }] }), "paid"],
  ["two states with one name", () => demo({ states: [{ name: "browsing", label: "A" }, { name: "browsing", label: "B" }] }), "browsing"],
  ["a condition nested past the bound", () => demo(transitions({ when: { not: { not: { not: { not: { not: { value: "items", gt: 0 } } } } } } })), "deep"],
  ["an action with no transition", () => demo({ actions: [{ name: "go", label: "Go", transitions: [] }] }), "transitions"],
])("a demo with %s is refused precisely with no partial write", (_, item, names) => {
  openFlow("s-1", "prototype");
  const before = tree();
  const r = submit("s-1", item());
  expect(r.stderr).toContain(names);
  expect(r.stderr).toContain("item 1");
  expect(r.code).toBe(1);
  expect(r.stdout).toBe("");
  expect(tree()).toEqual(before);
});

test("a demo Result is revised like any Result: its header changes, it takes no entries, and a republication keeps the earlier demo", () => {
  openFlow("s-1", "prototype");
  const first = submit("s-1", demo()).json;
  const id = first.refs.demo;
  const renamed = submit("s-1", { kind: "revise", result: id, base: first.revision, set: { title: "Cart limit, renamed" } });
  expect(renamed.stderr).toBe("");
  const before = tree();
  const add = submit("s-1", { kind: "revise", result: id, add: [{ cells: ["x"] }] });
  expect(add.code).toBe(1);
  expect(add.stderr).toContain(id);
  expect(tree()).toEqual(before);
  const again = submit("s-1", demo({ states: [{ name: "browsing", label: "Shopping" }, { name: "full", label: "Cart full" }, { name: "paid", label: "Paid" }] }, { revises: id }));
  expect(again.stderr).toBe("");
  const res = show(first.flow).stages[0].results[0];
  expect(res.revisions.map((x: any) => x.revision)).toEqual([1, 2]);
  expect(res.history.map((x: any) => x.anchor)).toContain(`${id}-r1`);
});

const comparison = (ref: string, extra: object = {}) => ({
  kind: "result",
  ref,
  shape: "comparison",
  title: "Cache or queue",
  alternatives: [
    { ref: "cache", name: "Redis cache", summary: "Keep counts in Redis.", attachments: ["cache-shot"] },
    { ref: "queue", name: "Write queue" },
  ],
  criteria: [
    { ref: "latency", name: "Checkout latency", description: "p50 of the checkout call." },
    { ref: "ops", name: "Operations cost" },
  ],
  assessments: [
    { alternative: "cache", criterion: "latency", finding: "Cache adds 1 ms.", evidence: "bench/cache.txt:4" },
    { alternative: "queue", criterion: "latency", finding: "Queue adds 9 ms.", evidence: "bench/queue.txt:7" },
    { alternative: "cache", criterion: "ops", finding: "One more service to run." },
  ],
  verdict: { outcome: "chosen", alternative: "cache", reason: "Latency decides it, and the cache wins there." },
  ...extra,
});

test("a Comparison keeps named alternatives, shared criteria, per-side evidence, gaps, and the recorded verdict", () => {
  openFlow("s-1");
  put("cache.png", PNG);
  const r = submit("s-1", attachment("cache-shot", "image", { path: "cache.png" }), comparison("cmp"));
  expect(r.stderr).toBe("");
  expect(r.code).toBe(0);
  const { refs, flow } = r.json;
  const res = show(flow).stages[0].results.find((x: any) => x.id === refs.cmp);
  expect(res.shape).toBe("comparison");
  const c = res.comparison;
  expect(c.alternatives.map((a: any) => a.ref)).toEqual(["cache", "queue"]);
  expect(c.criteria.map((k: any) => k.ref)).toEqual(["latency", "ops"]);
  expect(c.alternatives[0].attachments).toEqual([refs["cache-shot"]]);
  expect(c.verdict.outcome).toBe("chosen");
  expect(c.verdict.alternative).toBe("cache");
  expect(c.cells.filter((x: any) => !x.assessed).map((x: any) => [x.alternative, x.criterion])).toEqual([["queue", "ops"]]);
  const cell = (alt: string, crit: string) => c.cells.find((x: any) => x.alternative === alt && x.criterion === crit);
  expect([cell("cache", "latency").assessed, cell("queue", "latency").assessed, cell("cache", "ops").assessed]).toEqual([true, true, true]);
  expect(new Set(c.cells.map((x: any) => x.anchor)).size).toBe(4);
  expect(c.verdict.anchor).toBeString();
  expect(bytesOf(flow, refs["cache-shot"])).toEqual(PNG);
});

test("a Comparison with no single winner records that verdict and names no alternative", () => {
  openFlow("s-1");
  const r = submit("s-1", comparison("cmp", { alternatives: comparison("cmp").alternatives.map(({ attachments: _, ...a }: any) => a), verdict: { outcome: "inconclusive", reason: "Neither was measured under load." } }));
  expect(r.stderr).toBe("");
  const c = show(r.json.flow).stages[0].results[0].comparison;
  expect(c.verdict.outcome).toBe("inconclusive");
  expect(c.verdict.alternative).toBeUndefined();
});

const series = [
  { ref: "main", label: "main branch", baseline: true },
  { ref: "branch", label: "feature branch" },
  { ref: "fork", label: "contributor fork" },
];
const metrics = (ref: string, extra: object = {}) => ({
  kind: "result",
  ref,
  shape: "metrics",
  title: "Checkout under load",
  workload: "500 checkouts of 3 items, 8 workers",
  environment: "M3 laptop, Bun 1.3",
  outcome: "The branch is slower; the fork did not finish.",
  series,
  measurements: [
    {
      ref: "p50",
      name: "p50 latency",
      unit: "ms",
      better: "lower",
      verdict: "worse",
      values: [
        { series: "main", value: 10.1, samples: 30, uncertainty: { low: 9.8, high: 10.6, of: "min to max" } },
        { series: "branch", value: 12.6, samples: 30, uncertainty: { plusminus: 0.4, of: "95% CI" } },
        { series: "fork", missing: "The run crashed before measuring." },
      ],
    },
    { ref: "errors", name: "Errors", unit: "count", values: [{ series: "main", value: 0 }, { series: "branch", value: 3 }] },
    { ref: "rss", name: "Peak memory", unit: "MB", values: [{ series: "main", missing: "Not captured on main." }, { series: "branch", value: 210 }] },
  ],
  ...extra,
});

test("Metrics keeps numeric values with units, samples, workload, baselines, uncertainty, and outcome, and computes deltas only from what was measured", () => {
  openFlow("s-1");
  const r = submit("s-1", metrics("m"));
  expect(r.stderr).toBe("");
  expect(r.code).toBe(0);
  const { refs, flow } = r.json;
  const res = show(flow).stages[0].results.find((x: any) => x.id === refs.m);
  expect(res.shape).toBe("metrics");
  const m = res.metrics;
  expect(m.baseline).toBe("main");
  const at = (ref: string) => m.measurements.find((x: any) => x.ref === ref);
  const val = (ref: string, s: string) => at(ref).values.find((x: any) => x.series === s);
  expect(at("p50").unit).toBe("ms");
  expect(val("p50", "main")).toMatchObject({ value: 10.1, samples: 30, uncertainty: { low: 9.8, high: 10.6, of: "min to max" } });
  expect(val("p50", "branch").delta).toBeCloseTo(2.5, 10);
  expect(val("p50", "branch").relative).toBeCloseTo(24.75, 1);
  expect(val("p50", "main").delta).toBeUndefined();
  expect(val("p50", "fork").value).toBeUndefined();
  expect(val("p50", "fork").missing).toBe(true);
  expect(val("p50", "fork").delta).toBeUndefined();
  expect(val("errors", "main").value).toBe(0);
  expect(val("errors", "main").missing).toBeUndefined();
  expect(val("errors", "branch").delta).toBe(3);
  expect(val("errors", "branch").relative).toBeUndefined();
  expect(val("errors", "fork").missing).toBe(true);
  expect(val("rss", "branch").delta).toBeUndefined();
  expect(val("errors", "branch").samples).toBeUndefined();
  expect(val("errors", "branch").uncertainty).toBeUndefined();
  expect(at("errors").verdict).toBeUndefined();
  expect(at("p50").verdict).toBe("worse");
});

test("negative measured values keep their numeric data and signed baseline change", () => {
  openFlow("s-1");
  const r = submit("s-1", metrics("m", { measurements: [{ ref: "drift", name: "Clock drift", unit: "ms", values: [{ series: "main", value: -2 }, { series: "branch", value: 3 }] }] }));
  expect(r.stderr).toBe("");
  const m = show(r.json.flow).stages[0].results[0].metrics.measurements[0];
  expect(m.values.find((x: any) => x.series === "branch").delta).toBe(5);
  expect(m.values[0].value).toBe(-2);
});

const cmpWith = (patch: (c: any) => void) => () => {
  const c: any = comparison("cmp");
  c.alternatives = c.alternatives.map(({ attachments: _, ...a }: any) => a);
  patch(c);
  return [c];
};
const metWith = (patch: (m: any) => void) => () => {
  const m: any = structuredClone(metrics("m"));
  patch(m);
  return [m];
};

test.each([
  ["a Comparison with one alternative", cmpWith((c) => { c.alternatives = c.alternatives.slice(0, 1); c.assessments = c.assessments.filter((a: any) => a.alternative === "cache"); }), "alternatives"],
  ["an assessment of an alternative that does not exist", cmpWith((c) => c.assessments.push({ alternative: "kafka", criterion: "ops", finding: "x" })), "kafka"],
  ["an assessment of a criterion that does not exist", cmpWith((c) => c.assessments.push({ alternative: "queue", criterion: "cost", finding: "x" })), "cost"],
  ["two assessments of one pair", cmpWith((c) => c.assessments.push({ alternative: "cache", criterion: "latency", finding: "again" })), "latency"],
  ["a chosen verdict that names no alternative", cmpWith((c) => (c.verdict = { outcome: "chosen", reason: "x" })), "verdict"],
  ["a verdict that chooses an unknown alternative", cmpWith((c) => (c.verdict = { outcome: "chosen", alternative: "kafka", reason: "x" })), "kafka"],
  ["a tie that names a winner", cmpWith((c) => (c.verdict = { outcome: "tie", alternative: "cache", reason: "x" })), "verdict"],
  ["a Comparison with no verdict", cmpWith((c) => delete c.verdict), "verdict"],
  ["a value written as a string", metWith((m) => (m.measurements[0].values[0].value = "10.1ms")), "value"],
  ["a value with a missing reason as well", metWith((m) => (m.measurements[0].values[0].missing = "no")), "missing"],
  ["a value of a series that does not exist", metWith((m) => m.measurements[1].values.push({ series: "nightly", value: 1 })), "nightly"],
  ["two values of one series", metWith((m) => m.measurements[1].values.push({ series: "main", value: 1 })), "main"],
  ["two baselines", metWith((m) => (m.series[1].baseline = true)), "baseline"],
  ["a sample count that is not a positive whole number", metWith((m) => (m.measurements[0].values[0].samples = 2.5)), "samples"],
  ["an uncertainty range whose low is above its high", metWith((m) => (m.measurements[0].values[0].uncertainty = { low: 11, high: 9, of: "min to max" })), "uncertainty"],
  ["an uncertainty that does not say what it is", metWith((m) => delete m.measurements[0].values[0].uncertainty.of), "of"],
  ["a measurement with no unit", metWith((m) => delete m.measurements[0].unit), "unit"],
  ["Metrics with no workload", metWith((m) => delete m.workload), "workload"],
  ["Metrics with no outcome", metWith((m) => delete m.outcome), "outcome"],
  ["a verdict outside the reported verdicts", metWith((m) => (m.measurements[0].verdict = "amazing")), "verdict"],
])("%s is refused precisely with no partial write", (_, items, names) => {
  openFlow("s-1");
  const before = tree();
  const r = run(["submit"], { session: "s-1", stdin: contribution(...items()) });
  expect(r.stderr).toContain(names);
  expect(r.code).toBe(1);
  expect(r.stdout).toBe("");
  expect(tree()).toEqual(before);
});

test("a Comparison or Metrics Result takes a new revision with revises, and earlier revisions stay readable", () => {
  openFlow("s-1");
  const first = submit("s-1", metrics("m"), cmpWith(() => {})()[0]).json;
  const before = tree();
  expect(submit("s-1", { kind: "revise", result: first.refs.m, add: [{ cells: ["x"] }] }).code).toBe(1);
  expect(tree()).toEqual(before);
  const next = metrics("m", { revises: first.refs.m, outcome: "Rerun: no measurable difference." });
  const r = submit("s-1", next);
  expect(r.stderr).toBe("");
  const res = show(first.flow).stages[0].results.find((x: any) => x.id === first.refs.m);
  expect(res.revision).toBe(2);
  expect(res.history.map((x: any) => [x.anchor, x.revision])).toEqual([[`${first.refs.m}-r1`, 1]]);
});

test("Metrics retains sub-microsecond deltas instead of rounding a measured change to zero", () => {
  openFlow("s-1");
  const r = submit("s-1", metrics("m", {
    measurements: [{ ref: "tiny", name: "Timer overhead", unit: "s", values: [{ series: "main", value: 1e-7 }, { series: "branch", value: 2e-7 }] }],
  }));
  expect(r.code).toBe(0);
  const m = show(r.json.flow).stages[0].results[0].metrics.measurements[0];
  expect(m.values[1].delta).toBe(1e-7);
  expect(m.values[1].relative).toBe(100);
});

test("Metrics does not publish non-finite deltas as numeric data", () => {
  openFlow("s-1");
  const r = submit("s-1", metrics("m", {
    measurements: [{ ref: "extreme", name: "Signed magnitude", unit: "units", values: [{ series: "main", value: -1e308 }, { series: "branch", value: 1e308 }] }],
  }));
  expect(r.code).toBe(0);
  const me = show(r.json.flow).stages[0].results[0].metrics.measurements[0];
  expect(me.values[1].value).toBe(1e308);
  expect(me.values[1].delta).toBeUndefined();
  expect(me.values[1].relative).toBeUndefined();
  expect(me.values[1].delta_unavailable).toBe(true);
});

test("Metrics subtracts decimal measurements without displaying floating-point noise", () => {
  openFlow("s-1");
  const r = submit("s-1", metrics("m", {
    measurements: [{ ref: "time", name: "Wall time", unit: "ms", values: [{ series: "main", value: 50.8 }, { series: "branch", value: 49.2 }] }],
  }));
  expect(r.code).toBe(0);
  expect(show(r.json.flow).stages[0].results[0].metrics.measurements[0].values[1].delta).toBe(-1.6);
});

const DIFF = [
  "diff --git a/src/cart.ts b/src/cart.ts",
  "--- a/src/cart.ts",
  "+++ b/src/cart.ts",
  "@@ -10,4 +10,5 @@ export function check(cart) {",
  " if (cart.size > limit) {",
  "-\treturn refuse();",
  "+\treturn  refuse();  ",
  "+\tlog(cart);",
  " }",
  " ",
  "@@ -20 +21 @@",
  "-const limit = 3;",
  "+const limit = 5;",
  "\\ No newline at end of file",
].join("\n") + "\n";
const codeResult = (ref: string, ...entries: object[]) => ({ kind: "result", ref, shape: "code", title: "The change", entries });

test("a Code/diff Result keeps code and a diff at their source lines, with every space and line break", () => {
  openFlow("s-1");
  const r = submit(
    "s-1",
    codeResult(
      "change",
      { ref: "now", file: "src/cart.ts", line: 10, language: "ts", code: CODE },
      { ref: "fix", file: "src/cart.ts", revision: "abc1234", language: "ts", diff: DIFF },
      { ref: "sketch", file: "notes/sketch.txt", code: "a\n  b\n" },
    ),
  );
  expect(r.stderr).toBe("");
  expect(r.code).toBe(0);
  const { refs, flow } = r.json;
  const [now, fix, sketch] = ["change/now", "change/fix", "change/sketch"].map((k) => refs[k]);
  const entries = show(flow).stages[0].results[0].entries;
  expect(entries.map((e: any) => e.id)).toEqual([now, fix, sketch]);
  expect(entries[0].location).toEqual({ file: "src/cart.ts", lines: { first: 10, last: 12 } });
  expect(entries[1].location).toMatchObject({ file: "src/cart.ts", revision: "abc1234", hunks: [{ old: { start: 10, count: 4 }, new: { start: 10, count: 5 } }, { old: { start: 20, count: 1 }, new: { start: 21, count: 1 } }] });
  expect(entries[2].location).toEqual({ file: "notes/sketch.txt" });
  expect(entries.map((e: any) => e.code ?? e.diff)).toEqual([CODE, DIFF, "a\n  b\n"]);
  expect(entries[1].location.hunks.every((h: any) => typeof h.anchor === "string")).toBe(true);
});

test("submitted code is stored verbatim, markup included", () => {
  openFlow("s-1");
  const hostile = `</code></pre><script>alert(1)</script><img src=x onerror=alert(1)> "q" 'r' &amp; /* x */ // y\n`;
  const hostileDiff = `@@ -1 +1 @@\n-${hostile}+${hostile}`;
  const r = submit("s-1", codeResult("c", { ref: "a", file: "a.js", line: 1, language: "js", code: hostile }, { ref: "b", file: "a.js", language: "js", diff: hostileDiff }));
  expect(r.stderr).toBe("");
  const entries = show(r.json.flow).stages[0].results[0].entries;
  expect(entries.map((e: any) => e.code ?? e.diff)).toEqual([hostile, hostileDiff]);
});

const event = (ref: string, extra: object = {}) => ({ ref, title: `Event ${ref}`, outcome: "succeeded", ...extra });
const timeline = (ref: string, ...entries: object[]) => ({ kind: "result", ref, shape: "timeline", title: "The run", entries });

test("a Timeline keeps its events in the given order, with times only where known, outcomes, and evidence", () => {
  openFlow("s-1");
  put("out/run.log", "1 failed\n");
  const events = [
    event("start", { time: "2026-10-28T10:05:00+07:00", outcome: "noted", detail: "Started the suite." }),
    event("red", { time: "2026-10-28T10:01:30+07:00", outcome: "failed", evidence: "tests/cart.test.ts:12", attachments: ["log"] }),
    event("later", { outcome: "unknown" }),
  ];
  const r = submit("s-1", attachment("log", "evidence", { path: "out/run.log" }), timeline("run", ...events), round(question("why", { results: ["run/red"] })));
  expect(r.stderr).toBe("");
  expect(r.code).toBe(0);
  const { refs, flow } = r.json;
  const ids = ["run/start", "run/red", "run/later"].map((k) => refs[k]);
  const snap = show(flow);
  const res = snap.stages[0].results[0];
  expect(res.shape).toBe("timeline");
  expect(res.entries.map((e: any) => [e.id, e.title, e.outcome, e.time])).toEqual([
    [ids[0], "Event start", "noted", "2026-10-28T10:05:00+07:00"],
    [ids[1], "Event red", "failed", "2026-10-28T10:01:30+07:00"],
    [ids[2], "Event later", "unknown", undefined],
  ]);
  expect(res.entries[1].evidence).toBe("tests/cart.test.ts:12");
  expect(res.attachments).toEqual([refs.log]);
  expect(snap.attachments[0].used_by).toEqual([res.id]);
  expect(res.entries[1].attachments).toEqual([refs.log]);
  expect(bytesOf(flow, refs.log).toString()).toBe("1 failed\n");
  expect(questionOf(snap, refs.why).results).toEqual([ids[1]]);
  expect(res.entries[1].questions).toEqual([refs.why]);
});

test("a Timeline grows by focused revisions: add appends later events, and set records a known outcome against its base", () => {
  openFlow("s-1");
  const first = submit("s-1", timeline("run", event("build", { outcome: "unknown" }))).json;
  const id = first.refs.run;
  const added = submit("s-1", { kind: "revise", result: id, add: [event("test", { time: "2026-10-28T11:00:00Z", outcome: "failed" }), event("retry", { outcome: "succeeded" })] });
  expect(added.stderr).toBe("");
  const set = submit("s-1", { kind: "revise", result: `${id}/e1`, base: first.revision, set: { outcome: "succeeded", time: "2026-10-28T10:59:00Z" } });
  expect(set.stderr).toBe("");
  const before = tree();
  const stale = submit("s-1", { kind: "revise", result: `${id}/e1`, base: first.revision, set: { outcome: "failed" } });
  expect(stale.code).toBe(1);
  expect(stale.stderr).toContain("conflict");
  expect(tree()).toEqual(before);
  const entries = show(first.flow).stages[0].results[0].entries;
  expect(entries.map((e: any) => [e.title, e.outcome, e.time])).toEqual([
    ["Event build", "succeeded", "2026-10-28T10:59:00Z"],
    ["Event test", "failed", "2026-10-28T11:00:00Z"],
    ["Event retry", "succeeded", undefined],
  ]);
});

test.each([
  ["a diff hunk that ends before the lines it counts", { diff: "@@ -1,3 +1,3 @@\n a\n-b\n+c\n" }, "hunk 1"],
  ["a diff hunk with more lines than it counts", { diff: "@@ -1 +1 @@\n-a\n+b\n c\n" }, "hunk 1"],
  ["two files in one entry", { diff: `${DIFF}diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n` }, "one file"],
  ["text that is not a diff", { diff: "just words\n" }, "unified diff"],
  ["both code and a diff", { code: "a\n", diff: "@@ -1 +1 @@\n-a\n+b\n" }, "code or diff"],
  ["a start line that is not a positive whole number", { code: "a\n", line: 0 }, "line"],
  ["a file with a line break", { file: "a.ts\nb.ts", code: "a\n" }, "file"],
])("a Code/diff entry with %s is refused precisely with no partial write", (_, extra, names) => {
  openFlow("s-1");
  const before = tree();
  const r = submit("s-1", codeResult("c", { file: "src/a.ts", ...extra }));
  expect(r.code).toBe(1);
  expect(r.stdout).toBe("");
  expect(r.stderr).toContain("entry 1");
  expect(r.stderr).toContain(names);
  expect(tree()).toEqual(before);
});

test.each([
  ["a time that is not a date", { time: "yesterday" }, "time must"],
  ["an impossible date", { time: "2026-02-30T10:00:00Z" }, "time must"],
  ["an impossible offset", { time: "2026-10-28T10:00:00+30:90" }, "time must"],
  ["an unknown outcome", { outcome: "mostly" }, "outcome"],
  ["evidence that names no attachment", { attachments: ["attachment-9"] }, "attachment-9"],
])("a Timeline event with %s is refused precisely with no partial write", (_, extra, names) => {
  openFlow("s-1");
  const before = tree();
  const r = submit("s-1", timeline("t", event("e", extra)));
  expect(r.code).toBe(1);
  expect(r.stdout).toBe("");
  expect(r.stderr).toContain(names);
  expect(tree()).toEqual(before);
});

function busyFlow() {
  const grill = openFlow("s-1", "grill-me");
  const flow = grill.flow;
  const g = submit("s-1", round(question("old"), question("answered"), question("stale"))).json.refs;
  const g2 = submit("s-1", picked(g.answered, "A"), round(question("stale-again", { again: g.stale }))).json.refs;
  const done = run(["open", "--flow", flow, "--skill", "grill-me"], { session: "s-2" }).json;
  const d = submit("s-2", round(question("left"))).json.refs;
  expect(submit("s-2", decide(d.left), finish([d.left, "The spec settles it."])).code).toBe(0);
  const w1 = run(["open", "--flow", flow, "--skill", "wayfinder", "--ticket", "277"], { session: "s-3" }).json;
  const a = submit("s-3", round(question("route"))).json.refs;
  const w2 = run(["open", "--flow", flow, "--skill", "wayfinder", "--ticket", "278"], { session: "s-4" }).json;
  const b = submit("s-4", round(question("store"), question("cache"))).json.refs;
  expect(submit("s-4", picked(b.store, "B")).code).toBe(0);
  return { flow, stages: { grill: grill.stage, done: done.stage, w1: w1.stage, w2: w2.stage }, q: { ...g, ...g2, left: d.left, route: a.route, ...b } };
}

test("next visits actionable questions newest in-progress Stage first, excluding historical asks", () => {
  const { flow, q } = busyFlow();
  expect(show(flow).next).toEqual([q.cache, q.route, q.old, q["stale-again"]]);
});

test("the Stage tree data carries every Stage with its actionable question count, and keeps Topics", () => {
  const { flow, stages, q } = busyFlow();
  const child = run(["open", "--flow", flow, "--skill", "to-spec", "--parent", stages.done], { session: "s-5" }).json;
  const r = submit("s-5", topic("money"), round(question("left-again", { again: q.left, topics: ["money"] })));
  expect(r.code).toBe(0);
  const snap = show(flow);
  expect(Object.fromEntries(snap.stages.map((st: any) => [st.id, st.open_questions]))).toEqual({
    [stages.grill]: 2, [stages.done]: 0, [stages.w1]: 1, [stages.w2]: 1, [child.stage]: 1,
  });
  expect(snap.topics.map((t: any) => [t.id, t.questions])).toEqual([[r.json.refs.money, [r.json.refs["left-again"]]]]);
  expect(questionOf(snap, r.json.refs["left-again"]).again).toBe(q.left);
  expect(questionOf(snap, q.left).asked_again_by).toEqual([r.json.refs["left-again"]]);
});

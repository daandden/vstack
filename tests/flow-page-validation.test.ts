import { afterAll, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { flowContent } from "./support/flow-client.ts";
import { editStoredFlow } from "./support/flow-store.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin/skills/flow-page/scripts/flow-page.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-validation-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let home: string;
let cwd: string;
let n = 0;
beforeEach(() => {
  home = join(root, String(n), "home");
  cwd = join(root, String(n++), "project");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
});
function run(args: string[], input?: unknown) {
  const r = Bun.spawnSync([process.execPath, SCRIPT, ...args, "--home", home, "--session", "validation", "--agent", "impl-435"], {
    cwd, env: { PATH: process.env.PATH!, HOME: join(root, "default-home"), VSTACK_FLOW_HOST: "off" },
    stdin: input === undefined ? "ignore" : new TextEncoder().encode(typeof input === "string" ? input : JSON.stringify(input)),
    stdout: "pipe", stderr: "pipe",
  });
  let json: any;
  try { json = JSON.parse(r.stdout.toString()); } catch {}
  return { code: r.exitCode, json, stderr: r.stderr.toString(), stdout: r.stdout.toString() };
}
const open = () => {
  const r = run(["open", "--skill", "implement", "--title", "Contribution validation"]);
  expect(r.code).toBe(0);
  return r.json;
};
const envelope = (...items: unknown[]) => ({ version: 1, items });
const option = (label: string) => ({ label, does: `${label} changes ownership`, gains: [`${label} benefit`], costs: [`${label} cost`] });
const needs = [{ need: "Compare the ownership tradeoff.", kind: "prose" }];
const now = "Both implementations passed the contract tests.";
const brief = { unblocks: "Assign ownership of the configuration.", undo: "Move the setting back before the next deploy." };
const askReasons = [
  "taste", "irreversible", "undecided-by-evidence", "spending", "not-user-owned",
  "waiver-or-reversal", "user-only-fact", "explicit-decision-required",
];
const selection = {
  ask_reason: "undecided-by-evidence",
  evidence_checked: "Both teams met the release checklist. Neither the ownership ADR nor the service map assigns the configuration.",
};

test("describe round exposes the required Settle-or-ask fields and their allowed values", () => {
  const described = run(["describe", "round"]);
  expect(described.code).toBe(0);
  const brief = described.json.contract.fields.questions.items.fields.brief;
  expect(brief.required).toContain("ask_reason");
  expect(brief.required).toContain("evidence_checked");
  expect(brief.fields.ask_reason.values).toEqual(askReasons);
  expect(brief.fields.evidence_checked.expected).toBe("non-empty string");
});

test("the Settle-or-ask test refuses malformed new questions and re-asks without committing", () => {
  open();
  const question = {
    ref: "owner", title: "Which owner?", description: "Both teams can own the release.", needs,
    options: [{ ...option("Local"), recommended: "Owns the release pipeline." }, option("Shared")],
  };
  const contribution = (questionBrief: object, again?: string) => envelope(
    { kind: "assumed", decision: "Keep the release checklist", pick: "Retain it", why: "Both teams already use it." },
    { kind: "round", now, questions: [{ ...question, brief: questionBrief, ...(again ? { again } : {}) }] },
  );
  const refuse = (input: unknown, field: string, code: string, allowed: string | string[]) => {
    const before = run(["show"]).json;
    const checked = run(["validate"], input);
    const submitted = run(["submit"], input);
    expect(checked.code).toBe(1);
    expect(submitted.code).toBe(1);
    expect(submitted.json).toEqual(checked.json);
    expect(checked.json).toEqual({ ok: false, diagnostics: [expect.objectContaining({
      path: `$.items[1].questions[0].brief.${field}`, code, allowed,
      message: expect.stringContaining("Settle-or-ask test"),
    })] });
    expect(submitted.stderr).toContain(field);
    expect(run(["show"]).json).toEqual(before);
  };
  refuse(contribution({ ...brief, evidence_checked: selection.evidence_checked }), "ask_reason", "required_field", askReasons);
  refuse(contribution({ ...brief, ...selection, ask_reason: "somehow" }), "ask_reason", "invalid_enum", askReasons);
  refuse(contribution({ ...brief, ...selection, evidence_checked: " \n " }), "evidence_checked", "invalid_value", "non-empty string");
  const current = contribution({ ...brief, ...selection });
  expect(run(["validate"], current)).toMatchObject({ code: 0, json: { ok: true, diagnostics: [] } });
  const first = run(["submit"], current);
  expect(first.code).toBe(0);
  expect(first.json.ask.html).not.toContain(selection.evidence_checked);
  expect(run(["show"]).json.stages[0].questions[0].brief).toEqual({ ...brief, ...selection });
  const retry = { ...brief, asked_again_because: "The earlier picker expired without an answer." };
  refuse(contribution({ ...retry, ask_reason: selection.ask_reason }, first.json.refs.owner), "evidence_checked", "required_field", "non-empty string");
  const reasked = run(["submit"], contribution({ ...retry, ...selection }, first.json.refs.owner));
  expect(reasked.code).toBe(0);
  expect(reasked.json.ask.questions[0].question).toBe("Q1. Which owner?");
});

test("a stored Decision brief without Settle-or-ask fields stays readable and answerable", () => {
  const opened = open();
  editStoredFlow(home, opened.flow, state => {
    state.rounds.push({ id: "round-1", stage: opened.stage, n: 1, seq: 1, time: state.flow.created, now });
    state.questions.push({
      id: "question-1", round: "round-1", stage: opened.stage, q: 1,
      title: "Which owner?", description: "This choice predates the Settle-or-ask test.", brief,
      options: [{ ...option("Local"), label: "A. Local", recommended: "Owns the release pipeline." }],
    });
    state.next.round = state.next.question = state.seq = 1;
    state.reading = { historical: [], publications: [{ id: "question-1", kind: "question", stage: opened.stage, position: 1, publication: ++state.revision }] };
  });
  const read = () => run(["show"]).json.stages[0].questions[0];
  expect(read().brief).toEqual(brief);
  expect(read().open).toBe(true);
  const answer = { kind: "answer", question: "question-1", response: { status: "answered", picks: ["A"] } };
  expect(run(["validate"], envelope(answer)).code).toBe(0);
  expect(run(["submit"], envelope(answer)).code).toBe(0);
  expect(read()).toMatchObject({ brief, open: false, answer: { picks: ["A. Local"] } });
});

test("Decision brief diagnostics identify the fields and refuse the entire contribution", () => {
  const opened = open();
  const before = run(["show"]).json;
  const input = envelope(
    { kind: "assumed", decision: "Preserve other work", pick: "Keep the branch", why: "The branch has one active ticket." },
    { kind: "round", questions: [
      { title: "Which owner?", description: "Local and shared are both possible.", needs, brief: { ...selection, undo: brief.undo, typo: true }, options: [option("Local"), option("Shared")] },
      { title: "Who deploys?", description: "Two teams can deploy.", needs: [{ need: "Compare the teams.", kind: "prose" }], brief: { ...brief, ...selection, no_recommendation: "The teams have not given estimates." }, options: [{ ...option("First"), recommended: "Maintains the pipeline." }, { ...option("Second"), recommended: "Operates the service." }] },
    ] },
  );
  const validate = run(["validate"], input);
  const submit = run(["submit"], input);
  expect(submit.code).toBe(1);
  expect(validate.code).toBe(1);
  expect(submit.json).toEqual(validate.json);
  expect(submit.json).not.toHaveProperty("ask");
  expect(submit.json.diagnostics.map((d: any) => d.path)).toEqual(expect.arrayContaining([
    "$.items[1].now",
    "$.items[1].questions[0].brief.unblocks",
    "$.items[1].questions[0].brief.typo",
    "$.items[1].questions[0].brief.no_recommendation",
    "$.items[1].questions[1].brief.no_recommendation",
    "$.items[1].questions[1].options[1].recommended",
  ]));
  expect(run(["show", "--flow", opened.flow]).json).toEqual(before);
});

test("a re-ask needs a reason even before the previous attempt gets an answer", () => {
  const opened = open();
  const question = { title: "Which owner?", description: "Both implementations are available.", needs, brief: { ...brief, ...selection }, options: [{ ...option("Local"), recommended: "Owns the release." }, option("Shared")] };
  const first = run(["submit"], envelope({ kind: "round", now, questions: [{ ...question, ref: "first" }] }));
  expect(first.code).toBe(0);
  const before = run(["show"]).json;
  const missing = envelope({ kind: "round", now, questions: [{ ...question, again: first.json.refs.first }] });
  const refused = run(["submit"], missing);
  expect(refused).toMatchObject({ code: 1, json: { diagnostics: [{ path: "$.items[0].questions[0].brief.asked_again_because" }] } });
  expect(run(["validate"], missing).json).toEqual(refused.json);
  expect(run(["show"]).json).toEqual(before);
  const reason = "The shared team has now confirmed coverage. The earlier attempt has no answer.";
  const retry = run(["submit"], envelope({ kind: "round", now, questions: [{ ...question, again: first.json.refs.first, brief: { ...question.brief, asked_again_because: reason } }] }));
  expect(retry.code).toBe(0);
  expect(retry.json.ask.questions[0]).toMatchObject({ recommended: 0, question: "Q1. Which owner?" });
  const stored = flowContent(home, cwd, opened.flow);
  expect(stored.questions.find(q => q.id === retry.json.ask.questions[0].id)).toMatchObject({ brief: { ...question.brief, asked_again_because: reason }, answer: { state: "open" } });
  expect(stored.questions.find(q => q.id === first.json.refs.first)?.answer).toMatchObject({ state: "open" });
});

test("repeated Decision brief text is refused within a round", () => {
  open();
  const question = (which: string, id: number) => ({
    title: `Which owner for ${which}?`, description: `The ${which} service is ready.`,
    needs: [{ need: `Compare ownership of ${which}.`, kind: "prose" }],
    brief: { ...selection, evidence_checked: `The service catalog does not name the ${which} owner.`, unblocks: `Assign the team for Q${id}.`, undo: `Revert the ${which} configuration.` },
    options: [{ ...option(which), recommended: "Owns the release." }],
  });
  const input = envelope({ kind: "round", now, questions: [question("search", 1), question("catalog", 2)] });
  const refused = run(["validate"], input);
  expect(refused.code).toBe(1);
  expect(refused.stderr).toContain("brief.unblocks");
  expect(refused.stderr).toContain("option 1 recommended");
  expect(run(["submit"], input).json).toEqual(refused.json);
});

test("the committed brief round-trips and only a recommendation preselects a picker option", () => {
  const opened = open();
  const ownerBrief = { ...brief, ...selection };
  const noRecommendation = { unblocks: "Set a rollout window.", undo: "Change the scheduled job before it starts.", no_recommendation: "Neither window has user-traffic measurements.", ask_reason: "undecided-by-evidence", evidence_checked: "The job scheduler has both slots free, and there is no traffic history for either slot." };
  const input = envelope({ kind: "round", now, questions: [
    { ref: "owner", title: "Which owner?", description: "Both owners are available.", needs, brief: ownerBrief, options: [option("Shared"), { ...option("Local"), recommended: "Owns the release." }] },
    { ref: "window", title: "Which window?", description: "Choose a time for the rollout.", needs: [{ need: "Compare the rollout times.", kind: "prose" }], brief: noRecommendation, options: [option("Morning"), option("Afternoon")] },
  ] });
  expect(run(["validate"], input)).toMatchObject({ code: 0, json: { ok: true, diagnostics: [] } });
  const receipt = run(["submit"], input);
  expect(receipt.code).toBe(0);
  const ask = receipt.json.ask;
  expect(ask.questions[0].recommended).toBe(1);
  expect(ask.questions[1]).not.toHaveProperty("recommended");
  expect(ask.html.match(/<input[^>]* checked>/g)).toHaveLength(1);
  expect(ask.html).toMatch(/value="B\. Local" checked>/);
  expect(run(["submit"], input).json).toMatchObject({ revision: receipt.json.revision, repeated: true, ask });
  const shown = run(["show"]).json.stages[0];
  expect(shown.rounds[0]).toMatchObject({ now, questions: [receipt.json.refs.owner, receipt.json.refs.window] });
  expect(shown.questions[0]).toMatchObject({ brief: ownerBrief, options: [{ label: "A. Shared" }, { label: "B. Local", recommended: "Owns the release." }] });
  expect(shown.questions[1]).toMatchObject({ brief: noRecommendation });
  const content = flowContent(home, cwd, opened.flow);
  expect(content.stages[0]?.items[0]).toMatchObject({ type: "round", round: { now } });
  expect(content.questions[0]).toMatchObject({ brief: ownerBrief, answer: { state: "open" } });
  expect(content.questions[1]).toMatchObject({ brief: noRecommendation, answer: { state: "open" } });
});

test("validate reports independent nested errors and submit refuses identically without changing stored content or the file", () => {
  const opened = open();
  const before = run(["show", "--flow", opened.flow]).json;
  const input = envelope(
    { kind: "round", now, questions: [{ title: "Which owner?", description: "Choose the owner.", needs: [{ need: "Compare ownership", kind: "prose" }], brief: { ...brief, ...selection, no_recommendation: "Neither owner has confirmed support." }, options: [{ ...option("Local"), gains: 42 }, { ...option("Shared"), costs: [] }] }] },
    { kind: "result", shape: "ledger", title: "Claims", entries: [{ claim: "The change works", status: "maybe", evidence: "No check", missing_proof: "A check", consequence: "Do not ship" }] },
  );
  const file = join(cwd, "contribution.json");
  const raw = JSON.stringify(input, null, 2) + "\n";
  writeFileSync(file, raw);
  const checked = run(["validate", file]);
  expect(checked.code).toBe(1);
  expect(checked.json).toMatchObject({ ok: false, diagnostics: [
    { code: "invalid_type", path: "$.items[0].questions[0].options[0].gains", allowed: "array of non-empty strings" },
    { code: "too_few_items", path: "$.items[0].questions[0].options[1].costs", allowed: "one or more items" },
    { code: "invalid_enum", path: "$.items[1].entries[0].status", allowed: ["confirmed", "cleared", "unproven"] },
  ] });
  expect(checked.json.diagnostics.every((d: any) => typeof d.message === "string" && d.message.length)).toBe(true);
  const refused = run(["submit", file]);
  expect(refused.code).toBe(1);
  expect(refused.json).toEqual(checked.json);
  expect(run(["show", "--flow", opened.flow]).json).toEqual(before);
  expect(readFileSync(file, "utf8")).toBe(raw);
});

test("valid stdin validates without mutation then submits the exact contribution", () => {
  const opened = open();
  const before = run(["show", "--flow", opened.flow]).json;
  const input = envelope({ kind: "result", shape: "table", title: "Counts", columns: ["Name", "Count"], rows: [{ ref: "one", cells: ["One", "1"] }] });
  const checked = run(["validate", "-"], input);
  expect(checked).toMatchObject({ code: 0, json: { ok: true, diagnostics: [] }, stderr: "" });
  expect(run(["show", "--flow", opened.flow]).json).toEqual(before);
  const submitted = run(["submit"], input);
  expect(submitted.code).toBe(0);
  expect(submitted.json.revision).toBe(opened.revision + 1);
  const shown = run(["show"]).json;
  expect(shown.stages).toHaveLength(1);
  expect(shown.stages[0].results[0]).toMatchObject({ shape: "table", entries: [{ ref: "one", cells: ["One", "1"] }] });
  expect(flowContent(home, cwd, opened.flow).stages[0].results[0]).toMatchObject({ title: "Counts", columns: ["Name", "Count"] });
});

test("validation collects independent table row and reference errors with their exact input paths", () => {
  open();
  const input = envelope(
    { kind: "result", shape: "table", title: "Counts", columns: ["Name", "Count"], rows: [{ cells: ["One"] }, { cells: ["Two", "2", "extra"] }] },
    { kind: "round", now, questions: [
      { title: "Which owner?", description: "Choose the owner.", needs: [{ need: "Compare ownership", kind: "prose" }], brief: { ...brief, ...selection, no_recommendation: "Neither owner has confirmed support." }, options: [option("Local"), option("Shared")], topics: ["absent-one", "absent-two"] },
    ] },
  );
  const checked = run(["validate"], input);
  expect(checked.code).toBe(1);
  expect(checked.json.diagnostics.map((d: any) => d.path)).toEqual([
    "$.items[0].rows[0].cells", "$.items[0].rows[1].cells",
    "$.items[1].questions[0].topics[0]", "$.items[1].questions[0].topics[1]",
  ]);
  expect(run(["submit"], input).json).toEqual(checked.json);
});

test("validation reports missing, unknown, and invalid fields together, and malformed JSON is a coded refusal", () => {
  open();
  const checked = run(["validate"], envelope(
    { kind: "topic", title: "", body: 4, sources: ["ok", null], unexpected: true },
    { kind: "stage", state: "pending" },
  ));
  expect(checked.code).toBe(1);
  expect(checked.json.diagnostics.map((d: any) => [d.code, d.path])).toEqual([
    ["unknown_field", "$.items[0].unexpected"], ["required_field", "$.items[0].summary"],
    ["invalid_value", "$.items[0].title"], ["invalid_type", "$.items[0].body"], ["invalid_type", "$.items[0].sources[1]"],
    ["invalid_enum", "$.items[1].state"],
  ]);
  for (const command of ["validate", "submit"]) {
    const bad = run([command], "{\"version\":");
    expect(bad.code).toBe(1);
    expect(bad.json).toMatchObject({ ok: false, diagnostics: [{ code: "invalid_json", path: "$", allowed: "JSON object" }] });
  }
  expect(run(["validate", "a.json", "b.json"]).code).toBe(2);
});

test("semantic validation collects independent errors inside one Result instead of stopping at the first", () => {
  open();
  const checked = run(["validate"], envelope({
    kind: "result", shape: "metrics", title: "Latency", workload: "One request", outcome: "No claim",
    series: [{ ref: "main", label: "Main", baseline: true }, { ref: "branch", label: "Branch", baseline: true }],
    measurements: [{ ref: "latency", name: "Latency", unit: "ms", values: [
      { series: "main", value: 3, uncertainty: { low: 4, high: 2, of: "range" } },
      { series: "absent", value: 4 },
    ] }],
  }));
  expect(checked.code).toBe(1);
  expect(checked.json.diagnostics).toHaveLength(3);
  expect(checked.json.diagnostics.map((d: any) => d.path)).toEqual([
    "$.items[0]", "$.items[0].measurements[0].values[0].uncertainty", "$.items[0].measurements[0].values[1].series",
  ]);
  expect(checked.json.diagnostics[2].allowed).toEqual(["main", "branch"]);
});

test("structural errors do not hide independent Metrics references and malformed siblings are safe", () => {
  const opened = open();
  const before = run(["show", "--flow", opened.flow]).json;
  const input = envelope({
    kind: "result", shape: "metrics", title: "Latency", workload: "", outcome: "No claim",
    series: [{ ref: "main", label: "Main" }],
    measurements: [null, { ref: "latency", name: "Latency", unit: "ms", values: [
      null, { series: "absent", value: 4 },
    ] }],
  });
  const checked = run(["validate"], input);
  expect(checked.code).toBe(1);
  expect(checked.json.diagnostics.map((d: any) => d.path)).toEqual([
    "$.items[0].workload", "$.items[0].measurements[0]", "$.items[0].measurements[1].values[0]",
    "$.items[0].measurements[1].values[1].series",
  ]);
  expect(checked.json.diagnostics[3].allowed).toEqual(["main"]);
  expect(run(["submit"], input)).toMatchObject({ code: 1, json: checked.json });
  expect(run(["show", "--flow", opened.flow]).json).toEqual(before);
});

test("Metrics reference diagnostics use valid identities rather than malformed presentation fields", () => {
  open();
  const checked = run(["validate"], envelope({
    kind: "result", shape: "metrics", title: "Latency", workload: "One request", outcome: "No claim",
    series: [{ ref: "main", label: null }],
    measurements: [{ ref: "latency", name: "Latency", unit: "ms", better: "sideways", values: [
      { series: "main", value: 3 }, { series: "absent", value: 4 },
    ] }],
  }));
  expect(checked.code).toBe(1);
  expect(checked.json.diagnostics.map((d: any) => d.path)).toEqual([
    "$.items[0].series[0].label", "$.items[0].measurements[0].better", "$.items[0].measurements[0].values[1].series",
  ]);
  expect(checked.json.diagnostics[2].allowed).toEqual(["main"]);
});

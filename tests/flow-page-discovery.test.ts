import { afterAll, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Contract, Diagnostic } from "../plugin/skills/flow-page/scripts/contracts.ts";
import type { Answer, Decision, Question, Reading } from "../plugin/skills/flow-page/scripts/model.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin/skills/flow-page/scripts/flow-page.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-discovery-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let home: string;
let cwd: string;
let n = 0;
beforeEach(() => {
  home = join(root, String(n), "home");
  cwd = join(root, String(n++), "project");
  mkdirSync(cwd, { recursive: true });
});
function run(args: string[], input?: unknown, script = SCRIPT) {
  const r = Bun.spawnSync([process.execPath, script, ...args, "--home", home, "--session", "01a1c221-74dd-757c-98ec-2e142684c638", "--agent", "impl-436"], {
    cwd, env: { PATH: process.env.PATH!, HOME: join(root, "default-home"), VSTACK_FLOW_HOST: "off" },
    stdin: input === undefined ? "ignore" : new TextEncoder().encode(JSON.stringify(input)),
    stdout: "pipe", stderr: "pipe",
  });
  let json: any;
  try { json = JSON.parse(r.stdout.toString()); } catch {}
  return { code: r.exitCode, json, stderr: r.stderr.toString(), stdout: r.stdout.toString() };
}
const shapes = ["cards", "ledger", "table", "document", "prototype", "comparison", "metrics", "code", "timeline", "quiz", "review"];

test("catalog lists every Result shape and its purpose without a binding or host", () => {
  const catalog = run(["catalog"]);
  expect(catalog.code).toBe(0);
  expect(catalog.stderr).toBe("");
  expect(catalog.json.shapes.map((entry: any) => entry.shape)).toEqual(shapes);
  for (const entry of catalog.json.shapes) {
    expect(entry.purpose).toMatch(/\S/);
    expect(entry.purpose).not.toContain("\n");
  }
  expect(existsSync(join(home, ".vstack"))).toBe(false);
});

test("describe exposes nested field contracts and compact lines without needing a Flow", () => {
  const described = run(["describe", "ledger"]);
  expect(described.code).toBe(0);
  expect(described.json).toMatchObject({
    shape: "ledger",
    purpose: "Track claims, evidence, missing proof, and consequences.",
    contract: {
      type: "object", required: ["kind", "shape", "title", "entries"],
      fields: {
        shape: { type: "literal", values: ["ledger"] },
        entries: { type: "array", min: 1, items: {
          type: "object", required: ["claim", "status", "evidence", "missing_proof", "consequence"],
          fields: { status: { type: "literal", values: ["confirmed", "cleared", "unproven"] } },
        } },
      },
    },
  });
  const compact = run(["describe", "ledger", "--compact"]);
  expect(compact.code).toBe(0);
  expect(compact.stderr).toBe("");
  expect(compact.stdout.split("\n")).toContain('$.entries[].status type=string required=true enum=["confirmed","cleared","unproven"]');
  expect(compact.stdout.split("\n")).toContain("$.entries[].ref type=string required=false");
  expect(existsSync(join(home, ".vstack"))).toBe(false);
});

test("discovery rejects unknown shapes, missing arguments, and misplaced flags as usage errors", () => {
  for (const args of [["describe"], ["describe", "absent"], ["describe", "ledger", "extra"], ["catalog", "--compact"], ["describe", "ledger", "--flow", "unused"]]) {
    const result = run(args);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("usage:");
    expect(result.stdout).toBe("");
  }
});

const examples: Record<string, any> = {
  cards: { entries: [{ title: "Finding", label: "issue", blocking: false, impact: "A reader loses context.", action: "Keep the heading.", evidence: "reader.ts:1" }] },
  ledger: { entries: [{ claim: "The CLI accepts the example.", status: "unproven", evidence: "No receipt yet.", missing_proof: "Run validate.", consequence: "Do not claim success yet." }] },
  table: { columns: ["Name"], rows: [{ cells: ["Example"] }] },
  document: { sections: [{ heading: "Procedure", blocks: [{ prose: "Run the command." }] }] },
  prototype: { demo: { states: [{ name: "ready", label: "Ready" }], start: "ready", actions: [{ name: "stay", label: "Stay", transitions: [{ to: "ready" }] }] } },
  comparison: { alternatives: [{ ref: "one", name: "One" }, { ref: "two", name: "Two" }], criteria: [{ ref: "cost", name: "Cost" }], assessments: [{ alternative: "one", criterion: "cost", finding: "No extra cost." }], verdict: { outcome: "inconclusive", reason: "Only one assessed." } },
  metrics: { workload: "One request", outcome: "One millisecond", series: [{ ref: "base", label: "Baseline" }], measurements: [{ ref: "time", name: "Time", unit: "ms", values: [{ series: "base", value: 1 }] }] },
  code: { entries: [{ file: "example.ts", code: "const count = 1;" }] },
  timeline: { entries: [{ title: "Validated", outcome: "succeeded" }] },
  quiz: { questions: [{ ref: "count", prompt: "How many?", explanation: "There is one.", answer: { number: 1 } }] },
  review: { axes: ["standards", "spec", "blast-radius"].map(axis => ({ axis, status: "clean", reason: "No findings in this example." })), entries: [] },
};

function requiredPaths(contract: any, value: any, path: (string | number)[] = []): (string | number)[][] {
  const paths: (string | number)[][] = [];
  for (const name of contract.required ?? []) paths.push([...path, name]);
  for (const [name, child] of Object.entries(contract.fields ?? {})) {
    if (value[name] !== undefined) paths.push(...requiredPaths(child, value[name], [...path, name]));
  }
  if (contract.items && Array.isArray(value)) value.forEach((item, i) => paths.push(...requiredPaths(contract.items, item, [...path, i])));
  for (const [name, variant] of Object.entries(contract.variants ?? {})) {
    if (value[name] !== undefined) paths.push(...requiredPaths(variant, value, path));
  }
  return paths;
}

for (const shape of shapes) test(`describe ${shape} provides required fields accepted by validate and submit`, () => {
  expect(run(["open", "--skill", "implement", "--title", "Discovery examples"]).code).toBe(0);
  const described = run(["describe", shape]);
  expect(described.code).toBe(0);
  const item = { kind: "result", shape, title: "Example", ...examples[shape] };
  const envelope = (result: any) => ({ version: 1, items: [result] });
  expect(run(["validate"], envelope(item))).toMatchObject({ code: 0, json: { ok: true, diagnostics: [] } });
  for (const path of requiredPaths(described.json.contract, item)) {
    const missing = structuredClone(item);
    let parent = missing;
    for (const key of path.slice(0, -1)) parent = parent[key];
    delete parent[path.at(-1)!];
    const refused = run(["validate"], envelope(missing));
    const jsonPath = "$.items[0]" + path.map(key => typeof key === "number" ? `[${key}]` : `.${key}`).join("");
    expect(refused.code).toBe(1);
    const diagnostic = refused.json.diagnostics.find((d: any) => d.path === jsonPath || (d.code === "invalid_union" && d.path === jsonPath.slice(0, jsonPath.lastIndexOf(".")) && d.allowed.includes(path.at(-1))));
    expect(diagnostic).toBeDefined();
  }
  expect(run(["submit"], envelope(item)).code).toBe(0);
});

test("describe follows changes to validator fields without a separate field list", () => {
  const wrapper = join(cwd, "changed-contract.ts");
  const metadata = join(import.meta.dir, "..", "plugin/skills/flow-page/scripts/contracts.ts");
  writeFileSync(wrapper, `import { resultContracts } from ${JSON.stringify(metadata)};\nresultContracts.ledger.fields.entries.items.fields.status.values = [\"pending\"];\nawait import(${JSON.stringify(SCRIPT)});\n`);
  const changed = run(["describe", "ledger", "--compact"], undefined, wrapper);
  expect(changed.code).toBe(0);
  expect(changed.stdout.split("\n")).toContain('$.entries[].status type=string required=true enum=["pending"]');
  expect(run(["open", "--skill", "implement", "--title", "Changed contract"]).code).toBe(0);
  const refused = run(["validate"], { version: 1, items: [{ kind: "result", shape: "ledger", title: "Claims", ...examples.ledger }] }, wrapper);
  expect(refused.code).toBe(1);
  expect(refused.json.diagnostics).toContainEqual(expect.objectContaining({ code: "invalid_enum", path: "$.items[0].entries[0].status", allowed: ["pending"] }));
});

test("prototype discovery includes conditional fields and recursive condition contracts", () => {
  const result = run(["describe", "prototype"]);
  expect(result.code).toBe(0);
  expect(result.json.contract.oneOf).toEqual(["demo", "artifact"]);
  const condition = result.json.contract.fields.demo.fields.actions.items.fields.transitions.items.fields.when;
  expect(condition.variants.value.required).toContain("value");
  expect(condition.variants.all.fields.all.items.$ref).toBe("$.fields.demo.fields.actions.items.fields.transitions.items.fields.when");
  expect(condition.variants.value.fields.eq).toMatchObject({ type: "union", variants: { number: { type: "number" } } });
  const compact = run(["describe", "prototype", "--compact"]);
  expect(compact.code).toBe(0);
  expect(compact.stdout).toContain("$.demo.actions[].transitions[].when<value>.value type=string required=true");
});

test("describe exposes exclusive required content and validate diagnoses its omission", () => {
  expect(run(["open", "--skill", "implement", "--title", "Exclusive fields"]).code).toBe(0);
  expect(run(["describe", "code"]).json.contract.fields.entries.items.oneOf).toEqual(["code", "diff"]);
  expect(run(["describe", "table", "--compact"]).stdout).toContain("$.columns type=array<union> required=true");
  for (const item of [
    { kind: "result", shape: "prototype", title: "Missing runnable content" },
    { kind: "result", shape: "code", title: "Missing excerpt", entries: [{ file: "example.ts" }] },
  ]) {
    const refused = run(["validate"], { version: 1, items: [item] });
    expect(refused.code).toBe(1);
    expect(refused.json.diagnostics).toContainEqual(expect.objectContaining({
      code: "invalid_union",
      path: item.shape === "prototype" ? "$.items[0]" : "$.items[0].entries[0]",
      allowed: item.shape === "prototype" ? ["demo", "artifact"] : ["code", "diff"],
    }));
  }
});

const kinds = ["background", "topic", "attachment", "result", "revise", "corrects", "assumed", "round", "answer", "reading", "close", "stage", "wayfinder", "task", "blocker", "end-state", "pr", "check"];
const envelope = (...items: unknown[]) => ({ version: 1, items });
const describeKind = (kind: string) => {
  const described = run(["describe", kind]);
  expect(described.code).toBe(0);
  expect(described.json.kind).toBe(kind);
  return described.json.contract;
};

function fromRequired(contract: Contract, path = "$"): unknown {
  if (contract.type === "literal") return contract.values!.includes("prose") ? "prose" : contract.values![0];
  if (contract.type === "string") return path.endsWith(".title") ? "Which owner?" : `Value for ${path}`;
  if (contract.type === "array") return Array.from({ length: path.endsWith(".options") ? 2 : contract.min! }, (_, i) => fromRequired(contract.items!, `${path}[${i}]`));
  if (contract.type === "object") return Object.fromEntries(contract.required!.map(name => [name, fromRequired(contract.fields![name], `${path}.${name}`)]));
  throw new Error(`Choose a variant before constructing ${path}`);
}

test("contribution discovery covers nested questions, readings, closes, Stage state, and every progress variant", () => {
  expect(run(["catalog"]).json.kinds).toEqual(kinds);
  for (const kind of kinds) {
    const contract = describeKind(kind);
    expect(contract.type).toMatch(/object|union/);
    const compact = run(["describe", kind, "--compact"]);
    expect(compact.code).toBe(0);
    expect(compact.stdout).toContain('kind type=string required=true enum=');
  }
  const round = describeKind("round");
  const question = round.fields.questions.items;
  expect(question.required).toEqual(["title", "description", "needs", "options"]);
  const option = question.fields.options.items;
  expect(option.required).toEqual(["label", "does", "gains", "costs"]);
  for (const name of ["gains", "costs"]) {
    expect(option.fields[name]).toMatchObject({ type: "array", min: 1, items: { type: "string", expected: "non-empty string" } });
  }
  const answer = describeKind("answer");
  expect(answer.fields.response.fields.status.values).toEqual(["answered", "empty", "cancelled", "timed-out", "headless"]);
  expect(answer.fields.reading.variants.resolved.required).toEqual(["outcome", "decision", "basis"]);
  expect(answer.fields.reading.variants.unresolved.fields.outcome.values).toEqual(["question", "concern", "ambiguous"]);
  expect(describeKind("reading").fields.reading).toEqual(answer.fields.reading);
  expect(describeKind("reading").required).toEqual(["kind", "question", "reading"]);
  expect(describeKind("close").fields.decisions.items.required).toEqual(["question", "text"]);
  expect(describeKind("stage").fields.state.values).toEqual(["finished"]);
  for (const kind of ["task", "blocker", "pr", "check"]) {
    const contract = describeKind(kind);
    expect(Object.keys(contract.variants)).toEqual(["create", "update"]);
    expect(contract.selection).toContain(kind);
    expect(contract.variants.update.required).toContain(kind);
  }
  expect(describeKind("task").variants.create.fields.state.values).toEqual(["pending", "active", "done", "skipped", "inapplicable"]);
  expect(describeKind("pr").variants.create.fields.state.values).toEqual(["open", "merged", "closed"]);
  expect(describeKind("check").variants.create.fields.outcome.values).toEqual(["passed", "failed", "pending"]);
  expect(describeKind("end-state").fields.requested.values).toEqual(["commit", "merge-ready", "shipped", "none"]);
  expect(existsSync(join(home, ".vstack"))).toBe(false);
});

test("discovered required non-Result fields validate, diagnose omissions and bad option elements atomically, and replay unchanged", () => {
  const contract = describeKind("round");
  const round = fromRequired(contract) as { questions: Pick<Question, "title" | "description" | "needs" | "options">[] };
  expect(run(["open", "--skill", "implement", "--title", "Non-Result discovery"]).code).toBe(0);
  const before = run(["show"]).json;
  expect(run(["validate"], envelope(round))).toMatchObject({ code: 0, json: { ok: true, diagnostics: [] } });
  for (const path of requiredPaths(contract, round)) {
    const missing = structuredClone(round);
    let parent: unknown = missing;
    for (const key of path.slice(0, -1)) parent = (parent as Record<string | number, unknown>)[key];
    delete (parent as Record<string | number, unknown>)[path.at(-1)!];
    const refused = run(["validate"], envelope(missing));
    const jsonPath = "$.items[0]" + path.map(key => typeof key === "number" ? `[${key}]` : `.${key}`).join("");
    expect(refused.code).toBe(1);
    expect(refused.json.diagnostics).toContainEqual(expect.objectContaining({ path: jsonPath }));
  }
  const invalid = structuredClone(round) as { questions: { description?: string; options: Record<string, unknown>[] }[] };
  delete invalid.questions[0].description;
  invalid.questions[0].options[0].gains = "scalar";
  invalid.questions[0].options[0].costs = [];
  invalid.questions[0].options[1].gains = [""];
  invalid.questions[0].options[1].costs = ["   ", 42];
  const checked = run(["validate"], envelope(invalid));
  expect(checked.code).toBe(1);
  expect(checked.json.diagnostics.map((d: Diagnostic) => [d.code, d.path])).toEqual(expect.arrayContaining([
    ["required_field", "$.items[0].questions[0].description"],
    ["invalid_type", "$.items[0].questions[0].options[0].gains"],
    ["too_few_items", "$.items[0].questions[0].options[0].costs"],
    ["invalid_value", "$.items[0].questions[0].options[1].gains[0]"],
    ["invalid_value", "$.items[0].questions[0].options[1].costs[0]"],
    ["invalid_type", "$.items[0].questions[0].options[1].costs[1]"],
  ]));
  expect(run(["submit"], envelope(invalid))).toMatchObject({ code: 1, json: checked.json });
  expect(run(["show"]).json).toEqual(before);
  const submitted = run(["submit"], envelope(round));
  expect(submitted.code).toBe(0);
  const published = run(["show"]).json;
  expect(published.stages[0].rounds[0].questions).toEqual([submitted.json.ask.questions[0].id]);
  expect(run(["submit"], envelope(round)).json).toMatchObject({ revision: submitted.json.revision, repeated: true });
  expect(run(["show"]).json).toEqual(published);

  const answerContract = describeKind("answer");
  const answer = fromRequired(answerContract) as Required<Pick<Answer, "question" | "response">> & { reading: Extract<Reading, { outcome: "resolved" }> };
  answer.question = submitted.json.ask.questions[0].id;
  answer.response.text = "Use the local owner.";
  answer.reading = fromRequired(answerContract.fields.reading.variants.resolved) as typeof answer.reading;
  answer.reading.decision = "Use the local owner.";
  answer.reading.basis = "The response explicitly names the local owner.";
  expect(run(["validate"], envelope(answer)).code).toBe(0);
  expect(run(["submit"], envelope(answer)).code).toBe(0);
  const close = fromRequired(describeKind("close")) as { decisions: Pick<Decision, "question" | "text">[] };
  close.decisions.push({ question: answer.question, text: "Use the local owner." });
  const stage = fromRequired(describeKind("stage"));
  expect(run(["validate"], envelope(close, stage)).code).toBe(0);
  expect(run(["submit"], envelope(close, stage)).code).toBe(0);
  expect(run(["show"]).json.stages[0].state).toBe("finished");
});

test("discovered progress creation and update contracts support a complete workflow", () => {
  expect(run(["open", "--skill", "implement", "--title", "Progress discovery"]).code).toBe(0);
  const taskContract = describeKind("task");
  const blockerContract = describeKind("blocker");
  const prContract = describeKind("pr");
  const checkContract = describeKind("check");
  const task = { ...fromRequired(taskContract.variants.create) as Record<string, unknown>, ref: "work" };
  const blocker = { ...fromRequired(blockerContract.variants.create) as Record<string, unknown>, ref: "blocked", tasks: ["work"] };
  const pr = { ...fromRequired(prContract.variants.create) as Record<string, unknown>, ref: "review", url: "https://example.com/pr/1" };
  const check = { ...fromRequired(checkContract.variants.create) as Record<string, unknown>, ref: "proof", outcome: "pending" };
  const requested = { ...fromRequired(describeKind("end-state")) as Record<string, unknown>, requested: "commit" };
  expect(run(["validate"], envelope(task, blocker, pr, check, requested)).code).toBe(0);
  const created = run(["submit"], envelope(task, blocker, pr, check, requested));
  expect(created.code).toBe(0);
  const updates = [
    { ...fromRequired(taskContract.variants.update) as Record<string, unknown>, task: created.json.refs.work, state: "done", evidence: ["Focused proof passed."] },
    { ...fromRequired(blockerContract.variants.update) as Record<string, unknown>, blocker: created.json.refs.blocked, resolved: "The prerequisite is available." },
    { ...fromRequired(prContract.variants.update) as Record<string, unknown>, pr: created.json.refs.review, state: "merged" },
    { ...fromRequired(checkContract.variants.update) as Record<string, unknown>, check: created.json.refs.proof, outcome: "passed", evidence: ["CLI accepted the discovered fields."] },
    { ...fromRequired(describeKind("end-state")) as Record<string, unknown>, reached: "commit", evidence: ["The requested revision is committed."] },
  ];
  expect(run(["validate"], envelope(...updates)).code).toBe(0);
  expect(run(["submit"], envelope(...updates)).code).toBe(0);
  const shown = run(["show"]).json;
  expect(shown.progress.complete).toBe(true);
  expect(shown.progress.tasks[0].state).toBe("done");
  expect(shown.progress.checks[0].outcome).toBe("passed");
});

test("non-Result discovery and validation follow the same changed option constraint", () => {
  const wrapper = join(cwd, "changed-option-contract.ts");
  const metadata = join(import.meta.dir, "..", "plugin/skills/flow-page/scripts/contracts.ts");
  writeFileSync(wrapper, `import { contributionKinds } from ${JSON.stringify(metadata)};\ncontributionKinds.round.fields.questions.items.fields.options.items.fields.gains.min = 2;\nawait import(${JSON.stringify(SCRIPT)});\n`);
  const described = run(["describe", "round"], undefined, wrapper);
  expect(described.code).toBe(0);
  expect(described.json.contract.fields.questions.items.fields.options.items.fields.gains.min).toBe(2);
  expect(run(["open", "--skill", "implement", "--title", "Changed option constraint"]).code).toBe(0);
  const round = fromRequired(describeKind("round"));
  const refused = run(["validate"], envelope(round), wrapper);
  expect(refused.code).toBe(1);
  expect(refused.json.diagnostics).toContainEqual(expect.objectContaining({
    code: "too_few_items", path: "$.items[0].questions[0].options[0].gains", allowed: "at least 2 items",
  }));
});

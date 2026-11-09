import { afterAll, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
    cwd, env: { PATH: process.env.PATH!, HOME: home, VSTACK_FLOW_HOST: "off" },
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

import { afterAll, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { statePathOf } from "./support/flow-store.ts";

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
    cwd, env: { PATH: process.env.PATH!, HOME: home, VSTACK_FLOW_HOST: "off" },
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

test("validate reports independent nested errors and submit refuses identically without changing stored content or the file", () => {
  const opened = open();
  const state = statePathOf(home, opened.flow);
  const before = readFileSync(state, "utf8");
  const input = envelope(
    { kind: "round", questions: [{ title: "Which owner?", description: "Choose the owner.", needs: [{ need: "Compare ownership", kind: "prose" }], options: [{ ...option("Local"), gains: 42 }, { ...option("Shared"), costs: [] }] }] },
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
  expect(readFileSync(state, "utf8")).toBe(before);
  expect(readFileSync(file, "utf8")).toBe(raw);
});

test("valid stdin validates without mutation then submits the exact contribution", () => {
  const opened = open();
  const state = statePathOf(home, opened.flow);
  const before = readFileSync(state, "utf8");
  const input = envelope({ kind: "result", shape: "table", title: "Counts", columns: ["Name", "Count"], rows: [{ ref: "one", cells: ["One", "1"] }] });
  const checked = run(["validate", "-"], input);
  expect(checked).toMatchObject({ code: 0, json: { ok: true, diagnostics: [] }, stderr: "" });
  expect(readFileSync(state, "utf8")).toBe(before);
  const submitted = run(["submit"], input);
  expect(submitted.code).toBe(0);
  expect(submitted.json.revision).toBe(opened.revision + 1);
  const shown = run(["show"]).json;
  expect(shown.stages).toHaveLength(1);
  expect(shown.stages[0].results[0]).toMatchObject({ shape: "table", entries: [{ ref: "one", cells: ["One", "1"] }] });
  expect(JSON.parse(readFileSync(state, "utf8")).results[0]).toMatchObject({ title: "Counts", columns: ["Name", "Count"] });
});

test("validation collects independent table row and reference errors with their exact input paths", () => {
  open();
  const input = envelope(
    { kind: "result", shape: "table", title: "Counts", columns: ["Name", "Count"], rows: [{ cells: ["One"] }, { cells: ["Two", "2", "extra"] }] },
    { kind: "round", questions: [
      { title: "Which owner?", description: "Choose the owner.", needs: [{ need: "Compare ownership", kind: "prose" }], options: [option("Local"), option("Shared")], topics: ["absent-one", "absent-two"] },
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
  const state = statePathOf(home, opened.flow);
  const before = readFileSync(state, "utf8");
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
  expect(readFileSync(state, "utf8")).toBe(before);
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

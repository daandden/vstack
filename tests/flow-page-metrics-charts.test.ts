import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-metrics-charts-")));
const home = join(root, "home");
mkdirSync(home);
afterAll(() => rmSync(root, { recursive: true, force: true }));
const script = join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts");
function cli(args: string[], items?: unknown[]) {
  const p = Bun.spawnSync([process.execPath, script, ...args, "--home", home, "--session", "01a1c256-24ed-7201-9841-ae02a7a0e4a2", "--agent", "impl-438"], {
    cwd: root, env: { PATH: process.env.PATH!, HOME: home, VSTACK_FLOW_HOST: "off" },
    stdin: items ? new TextEncoder().encode(JSON.stringify({ version: 1, items })) : "ignore", stdout: "pipe", stderr: "pipe",
  });
  const stdout = p.stdout.toString();
  return { code: p.exitCode, json: args[0] === "describe" ? stdout : JSON.parse(stdout), stderr: p.stderr.toString() };
}
const point = (x: number, y: number) => ({ x, y });
const contribution = () => ({
  kind: "result", shape: "metrics", title: "Measured charts", workload: "Three local runs", outcome: "Reported measurements only",
  series: [{ ref: "main", label: "Main", baseline: true }, { ref: "branch", label: "Branch" }],
  measurements: [
    { ref: "trend", name: "Trend", unit: "ms", chart: "line", better: "lower", verdict: "better", values: [{ series: "main", points: [point(1, 10), point(2, 12)], uncertainty: { plusminus: 1, of: "95% CI" } }, { series: "branch", value: 8, points: [point(1, 8), point(2, 9)] }] },
    { ref: "relation", name: "Relation", unit: "MB", chart: "scatter", values: [{ series: "main", points: [point(-2, 3)] }] },
    { ref: "distribution", name: "Distribution", unit: "ms", chart: "histogram", values: [{ series: "main", samples: [1, 1, 2, 3] }, { series: "branch", value: 2, samples: [2, 3, 4] }] },
    { ref: "scalar", name: "Scalar", unit: "ms", values: [{ series: "main", value: 10, samples: 30 }, { series: "branch", value: 8, samples: 30 }] },
  ],
});

test("charted Metrics validate and persist points or raw samples without requiring a scalar, preserving scalar deltas", () => {
  expect(cli(["open", "--skill", "implement", "--title", "Metrics charts"]).code).toBe(0);
  const input = contribution();
  expect(cli(["validate"], [input])).toMatchObject({ code: 0, json: { ok: true, diagnostics: [] } });
  expect(cli(["submit"], [input]).code).toBe(0);
  const measurements = cli(["show"]).json.stages[0].results[0].metrics.measurements;
  expect(measurements[0]).toMatchObject({ chart: "line", better: "lower", verdict: "better", values: [{ points: [{ x: 1, y: 10 }, { x: 2, y: 12 }], uncertainty: { plusminus: 1, of: "95% CI" } }, { value: 8, points: [{ x: 1, y: 8 }, { x: 2, y: 9 }] }] });
  expect(measurements[0].values[0].value).toBeUndefined();
  expect(measurements[1]).toMatchObject({ chart: "scatter", values: [{ points: [{ x: -2, y: 3 }] }, { missing: true }] });
  expect(measurements[2]).toMatchObject({ chart: "histogram", values: [{ samples: [1, 1, 2, 3] }, { value: 2, samples: [2, 3, 4] }] });
  expect(measurements[3].values[1]).toMatchObject({ value: 8, samples: 30, delta: -2, relative: -20 });
  const description = cli(["describe", "metrics", "--compact"]).json;
  expect(JSON.stringify(description)).toContain("points");
});

test("chart kinds refuse missing, empty, incompatible and malformed data with stable coded paths", () => {
  const input: any = contribution();
  input.measurements = [
    { ref: "missing", name: "Missing", unit: "ms", chart: "line", values: [{ series: "main", value: 2 }] },
    { ref: "empty", name: "Empty", unit: "ms", chart: "histogram", values: [{ series: "main", samples: [] }] },
    { ref: "wrong", name: "Wrong", unit: "ms", chart: "scatter", values: [{ series: "main", points: [{ x: "Monday", y: 2 }] }] },
    { ref: "count", name: "Count", unit: "ms", chart: "histogram", values: [{ series: "main", value: 2, samples: 30 }] },
    { ref: "kind", name: "Kind", unit: "ms", chart: "pie", values: [{ series: "main", value: 2 }] },
  ];
  const checked = cli(["validate"], [input]);
  expect(checked.code).toBe(1);
  expect(checked.json.diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: "required_field", path: "$.items[0].measurements[0].values[0].points" }),
    expect.objectContaining({ code: "too_few_items", path: "$.items[0].measurements[1].values[0].samples" }),
    expect.objectContaining({ code: "invalid_type", path: "$.items[0].measurements[2].values[0].points[0].x" }),
    expect.objectContaining({ code: "invalid_type", path: "$.items[0].measurements[3].values[0].samples" }),
    expect.objectContaining({ code: "invalid_enum", path: "$.items[0].measurements[4].chart", allowed: ["line", "scatter", "histogram"] }),
  ]));
  expect(cli(["submit"], [input]).json).toEqual(checked.json);
});

test("a chart with only missing series is refused instead of publishing an empty drawing", () => {
  const input = contribution();
  input.measurements = [{ ref: "absent", name: "Not measured", unit: "ms", chart: "line", values: [{ series: "main", missing: "Run failed" }] }] as any;
  const checked = cli(["validate"], [input]);
  expect(checked.code).toBe(1);
  expect(checked.json.diagnostics).toContainEqual(expect.objectContaining({ code: "invalid_chart_data", path: "$.items[0].measurements[0].values" }));
});

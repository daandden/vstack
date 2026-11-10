import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts");
test("typed table columns validate, persist, and describe their types without changing legacy columns", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-table-")));
  const home = join(root, "home");
  mkdirSync(home);
  function run(args: string[], items?: object[]) {
    const p = Bun.spawnSync([process.execPath, SCRIPT, ...args, "--home", home, "--session", "01a1c256-243a-73a5-9de5-66b7edb80d21", "--agent", "impl-437"], {
      cwd: root, env: { PATH: process.env.PATH!, HOME: home, VSTACK_FLOW_HOST: "off" },
      stdin: items ? new TextEncoder().encode(JSON.stringify({ version: 1, items })) : "ignore", stdout: "pipe", stderr: "pipe",
    });
    return { code: p.exitCode, json: JSON.parse(p.stdout.toString()), stderr: p.stderr.toString() };
  }
  try {
    expect(run(["open", "--skill", "implement", "--title", "Typed tables"]).code).toBe(0);
    const typed = { kind: "result", ref: "typed", shape: "table", title: "Measurements", columns: ["Target", { label: "Latency", type: "number" }, { label: "Status", type: "status" }, { label: "Owner", type: "text" }, { label: "Notes" }], rows: [{ ref: "nine", cells: ["Reader", "9", "Passed", "Alice", ""] }, { ref: "ten", cells: ["Host", "10", "Failed", "Bob", "Not measured twice"] }] };
    expect(run(["validate"], [typed])).toMatchObject({ code: 0, json: { ok: true, diagnostics: [] } });
    const published = run(["submit"], [typed, { kind: "result", ref: "legacy", shape: "table", title: "Legacy", columns: ["Label"], rows: [{ ref: "row", cells: ["Still text"] }] }]);
    expect(published.code).toBe(0);
    const shown = run(["show"]).json;
    const result = shown.stages[0].results.find((r: any) => r.id === published.json.refs.typed);
    expect(result.columns).toEqual(typed.columns);
    expect(result.entries.map((r: any) => [r.ref, r.cells])).toEqual(typed.rows.map(r => [r.ref, r.cells]));
    expect(shown.stages[0].results.find((r: any) => r.id === published.json.refs.legacy).columns).toEqual(["Label"]);
    const invalid = { ...typed, columns: ["Target", { label: "Latency", type: "date" }, { label: "Status", type: "status" }, { label: "Owner", type: "text" }, { label: "Notes" }] };
    const checked = run(["validate"], [invalid]);
    expect(checked.code).toBe(1);
    expect(checked.json.diagnostics).toContainEqual({ code: "invalid_enum", path: "$.items[0].columns[1].type", message: 'must be one of "text", "number", "status", got "date"', allowed: ["text", "number", "status"] });
    expect(run(["submit"], [invalid]).json.diagnostics).toEqual(checked.json.diagnostics);
    expect(run(["show"]).json.revision).toBe(shown.revision);
    const described = run(["describe", "table"]).json.contract.fields.columns.items;
    expect(described.variants.column.fields.type.values).toEqual(["text", "number", "status"]);
    expect(described.variants.column.required).toEqual(["label"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

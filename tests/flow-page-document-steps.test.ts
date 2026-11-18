import { afterAll, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Block } from "../plugin/skills/flow-page/scripts/model.ts";
import { flowContent } from "./support/flow-client.ts";

const SCRIPT = join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-document-steps-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let home: string;
let n = 0;
beforeEach(() => {
  home = join(root, String(n++));
  mkdirSync(home);
});
function cli(args: string[], input?: unknown) {
  const p = Bun.spawnSync([process.execPath, SCRIPT, ...args, "--home", home, "--session", "01a1c256-2555-72b4-9563-1c0a2b7552ad", "--agent", "impl-439"], {
    cwd: root, env: { PATH: process.env.PATH!, HOME: join(root, "default-home"), VSTACK_FLOW_HOST: "off" },
    stdin: input === undefined ? "ignore" : new TextEncoder().encode(JSON.stringify(input)), stdout: "pipe", stderr: "pipe",
  });
  return { code: p.exitCode, json: JSON.parse(p.stdout.toString()), stderr: p.stderr.toString() };
}
const envelope = <T>(blocks: T[]) => ({ version: 1, items: [{ kind: "result", shape: "document", title: "Recovery runbook", sections: [{ heading: "Restore service", blocks }] }] });

test("Document steps validate, persist in order, and appear in the generated field description", () => {
  const opened = cli(["open", "--skill", "implement", "--title", "Document steps"]);
  expect(opened.code).toBe(0);
  const steps = [
    { title: "Inspect `service`", text: "Run `service status` and read [the runbook](https://example.com/runbook)." },
    { title: "Restore service", text: "Restart the worker.\n\nConfirm that requests succeed." },
  ];
  const input = envelope([{ prose: "Existing introduction." }, { steps }, { list: ["Existing list"], ordered: true }] satisfies Block[]);
  expect(cli(["validate", "-"], input)).toMatchObject({ code: 0, json: { ok: true, diagnostics: [] } });
  expect(cli(["show"]).json.revision).toBe(opened.json.revision);
  expect(cli(["submit"], input).code).toBe(0);
  const content = flowContent(home, root, opened.json.flow);
  expect(content.stages[0].results[0].doc!.sections[0].blocks).toEqual(input.items[0].sections[0].blocks);
  const described = cli(["describe", "document"]).json;
  expect(described.contract.fields.sections.items.fields.blocks.items.variants.steps).toEqual({
    type: "object", fields: { steps: { type: "array", min: 1, items: {
      type: "object", fields: { title: { type: "string" }, text: { type: "string" } }, required: ["title", "text"],
    } } }, required: ["steps"],
  });
});

test("malformed steps have coded paths and neither validate nor submit changes the Flow", () => {
  expect(cli(["open", "--skill", "implement", "--title", "Invalid steps"]).code).toBe(0);
  const before = cli(["show"]).json;
  const prefix = "$.items[0].sections[0].blocks[0]";
  const cases = [
    { block: { steps: [{ text: "Run the check." }] }, code: "required_field", path: `${prefix}.steps[0].title` },
    { block: { steps: [{ title: "Check" }] }, code: "required_field", path: `${prefix}.steps[0].text` },
    { block: { steps: [{ title: " ", text: "Run the check." }] }, code: "invalid_value", path: `${prefix}.steps[0].title` },
    { block: { steps: [{ title: "Check", text: 42 }] }, code: "invalid_type", path: `${prefix}.steps[0].text` },
    { block: { steps: [] }, code: "too_few_items", path: `${prefix}.steps` },
    { block: { steps: [{ title: "Check", text: "Run the check." }], prose: "Two forms" }, code: "invalid_union", path: prefix },
    { block: { steps: [{ title: "Check", text: "[Unsafe](javascript:alert)" }] }, code: "invalid_value", path: `${prefix}.steps[0].text` },
    { block: { steps: [{ title: "Check", text: "Read [@missing]." }] }, code: "invalid_value", path: `${prefix}.steps[0].text` },
  ];
  for (const { block, code, path } of cases) {
    const input = envelope([block]);
    const validated = cli(["validate", "-"], input);
    expect(validated.code).toBe(1);
    expect(validated.json).toMatchObject({ ok: false, diagnostics: [{ code, path }] });
    expect(cli(["submit"], input).json).toEqual(validated.json);
    expect(cli(["show"]).json).toEqual(before);
  }
});

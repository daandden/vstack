import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { snapshot } from "../plugin/skills/flow-page/scripts/model.ts";
import { ENV } from "./support/fixture.ts";
import { linkedQuestion, linkedResults, mixedTargets } from "./support/result-links.ts";

const script = join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-result-links-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let serial = 0;
function world() {
  const home = join(root, String(serial++));
  mkdirSync(home);
  return (args: string[], items?: object[]) => {
    const process = Bun.spawnSync(["bun", script, ...args, "--home", home, "--session", "01a1cad3-9dc5-7149-8e55-3ee9a2317ac5", "--agent", "Impl464"], {
      cwd: home, env: { ...ENV, HOME: join(root, "default-home"), VSTACK_FLOW_HOST: "off" },
      stdin: items ? new TextEncoder().encode(JSON.stringify({ version: 1, items })) : "ignore", stdout: "pipe", stderr: "pipe",
    });
    return { code: process.exitCode, stdout: process.stdout.toString(), stderr: process.stderr.toString(), home };
  };
}
function ok<T>(run: { code: number; stdout: string; stderr: string }): T {
  expect(run.stderr).toBe("");
  expect(run.code).toBe(0);
  return JSON.parse(run.stdout) as T;
}
type Receipt = { flow: string; refs: Record<string, string> };
type Snapshot = ReturnType<typeof snapshot>;

test("questions cite all whole entryless Results and precise entries together using refs or stored ids", () => {
  const cli = world();
  const opened = ok<{ flow: string }>(cli(["open", "--title", "Mixed Result links", "--skill", "grill-me"]));
  const sent = ok<Receipt>(cli(["submit"], [...linkedResults(), { kind: "round", questions: [linkedQuestion()] }]));
  let shown = ok<Snapshot>(cli(["show", "--flow", opened.flow]));
  const q = shown.stages[0].questions[0];
  expect(q.results).toEqual(mixedTargets.map((ref) => sent.refs[ref]));
  expect(q.result_links.map((link) => [link.kind, link.anchor, link.entry])).toEqual([
    ...["document", "comparison", "metrics", "prototype", "quiz", "cards"].map((ref) => ["result", sent.refs[ref], undefined]),
    ["entry", `${sent.refs.cards}-e1`, "e1"],
  ]);
  for (const result of shown.stages[0].results) expect(result.questions).toEqual([sent.refs.decision]);
  expect(shown.stages[0].results[5].entries.map((e) => e.questions)).toEqual([[sent.refs.decision], []]);
  const stored = mixedTargets.map((ref) => sent.refs[ref]);
  const next = ok<Receipt>(cli(["submit"], [{ kind: "round", questions: [{ ...linkedQuestion(stored), ref: "later" }] }]));
  shown = ok<Snapshot>(cli(["show", "--flow", opened.flow]));
  expect(shown.stages[0].questions[1].results).toEqual(stored);
  expect(shown.stages[0].results[0].questions).toEqual([sent.refs.decision, next.refs.later]);
  const document = linkedResults()[0];
  ok(cli(["submit"], [{ ...document, revises: sent.refs.document, title: "Revised reconnect evidence" }]));
  shown = ok<Snapshot>(cli(["show", "--flow", opened.flow]));
  expect(shown.stages[0].results[0].revision).toBe(2);
  expect(shown.stages[0].questions[0].result_links[0]).toMatchObject({ title: "Revised reconnect evidence", anchor: sent.refs.document });
  expect(shown.stages[0].results[0].history).toHaveLength(1);
});

test.each(["missing-result", "cards/missing", "topic"])("unknown or wrong-kind target %s refuses the entire contribution", (target) => {
  const cli = world();
  const opened = cli(["open", "--title", "Atomic link refusal", "--skill", "grill-me"]);
  const { flow } = ok<{ flow: string }>(opened);
  const before = ok<Snapshot>(cli(["show", "--flow", flow]));
  const refused = cli(["submit"], [
    ...linkedResults(), { kind: "topic", ref: "topic", title: "Not a Result", summary: "Wrong kind.", body: "Must not publish.", sources: ["Fixture"] },
    { kind: "round", questions: [linkedQuestion(["document", "cards/saved", target])] },
  ]);
  expect(refused.code).toBe(1);
  expect(refused.stderr).toContain("Result or Result entry");
  if (target !== "topic") {
    expect(refused.stderr).toContain("<result ref or id>");
    expect(refused.stderr).toContain("<result ref or id>/<entry ref or id>");
  }
  expect(ok<Snapshot>(cli(["show", "--flow", flow]))).toEqual(before);
  expect(ok<Snapshot>(cli(["show", "--flow", flow])).stages[0].results).toEqual([]);
});

test("previously stored entry-only links retain precise backlinks without inventing whole-Result relationships", () => {
  const cli = world();
  ok(cli(["open", "--title", "Existing entry link", "--skill", "grill-me"]));
  const sent = ok<Receipt>(cli(["submit"], [linkedResults()[5], { kind: "round", questions: [linkedQuestion(["cards/saved"])] }]));
  const shown = ok<Snapshot>(cli(["show", "--flow", sent.flow]));
  expect(shown.stages[0].questions[0].results).toEqual([sent.refs["cards/saved"]]);
  expect(shown.stages[0].questions[0].result_links).toEqual([{ id: sent.refs["cards/saved"], kind: "entry", result: sent.refs.cards, title: "Findings", anchor: `${sent.refs.cards}-e1`, entry: "e1" }]);
  expect(shown.stages[0].results[0].questions).toEqual([]);
  expect(shown.stages[0].results[0].entries[0].questions).toEqual([sent.refs.decision]);
});

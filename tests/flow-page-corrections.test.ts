import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ResultView, snapshot } from "../plugin/skills/flow-page/scripts/model.ts";
import { ENV } from "./support/fixture.ts";
import { flowContent } from "./support/flow-client.ts";

const script = join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-corrections-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let serial = 0;
type Receipt = { flow: string; stage: string; refs: Record<string, string>; revision: number; repeated?: boolean };
type Snapshot = ReturnType<typeof snapshot>;
const document = (ref: string, title = ref) => ({ kind: "result", shape: "document", ref, title, sections: [{ heading: "Evidence", blocks: [{ prose: `Recorded bytes for ${title}.` }] }] });
const cards = { kind: "result", shape: "cards", ref: "findings", title: "Original findings", entries: [{ ref: "claim", title: "Unsafe claim", label: "Finding", blocking: false, impact: "Claimed permission", action: "Proceed", evidence: "Raw evidence must stay." }] };
function world() {
  const home = join(root, String(serial++));
  mkdirSync(home);
  const cli = (args: string[], items?: object[]) => {
    const p = Bun.spawnSync(["bun", script, ...args, "--home", home, "--session", "01a1cb0a-6de6-7226-b03b-92a07bf9e558", "--agent", "Impl465"], {
      cwd: home, env: { ...ENV, HOME: join(home, "default-home"), VSTACK_FLOW_HOST: "off" },
      stdin: items ? new TextEncoder().encode(JSON.stringify({ version: 1, items })) : "ignore", stdout: "pipe", stderr: "pipe",
    });
    return { code: p.exitCode, stdout: p.stdout.toString(), stderr: p.stderr.toString() };
  };
  const ok = <T = Receipt>(args: string[], items?: object[]): T => {
    const run = cli(args, items);
    expect(run.stderr).toBe("");
    expect(run.code).toBe(0);
    return JSON.parse(run.stdout) as T;
  };
  const opened = ok(["open", "--title", "Correction fixture", "--skill", "research"]);
  const content = () => flowContent(home, home, opened.flow);
  const shown = () => ok<Snapshot>(["show", "--flow", opened.flow]);
  const next = () => ok(["open", "--flow", opened.flow, "--skill", "implement"]);
  return { cli, ok, opened, content, shown, next, home };
}
const payload = ({ correction: _, corrects: __, entries, ...result }: ResultView) => ({
  ...result, entries: entries.map(({ correction: _, corrects: __, ...entry }) => entry),
});

test("later Stages correct whole Results and entries atomically while retaining payloads, positions, and one effective head", () => {
  const w = world();
  const first = w.ok(["submit"], [document("report", "Original report"), cards, { kind: "stage", state: "finished" }]);
  const before = w.content();
  const original = before.stages[0].results.map(payload);
  const positions = before.reading.publications;
  w.next();
  const items = [
    document("replacement", "Corrected report"), document("withdrawal", "Claim withdrawn"),
    { kind: "corrects", target: first.refs.report, replacement: "replacement", reason: "The earlier report used the wrong sample." },
    { kind: "corrects", target: first.refs["findings/claim"], replacement: "withdrawal", reason: "The evidence did not establish permission." },
  ];
  const sent = w.ok(["submit"], items);
  expect(w.ok(["submit"], items)).toMatchObject({ revision: sent.revision, repeated: true });
  const after = w.content();
  expect(after.stages[0].results.map(payload)).toEqual(original);
  expect(after.reading.publications.slice(0, 2)).toEqual(positions);
  expect(after.reading.publications[2].position).toBeGreaterThan(positions[1].position);
  expect(after.stages[0]).toMatchObject({ state: before.stages[0].state, opened: before.stages[0].opened, finished: before.stages[0].finished });
  let shown = w.shown();
  expect(shown.stages[0].results[0].correction?.head.id).toBe(sent.refs.replacement);
  expect(shown.stages[0].results[1].entries[0].correction?.head.id).toBe(sent.refs.withdrawal);
  expect(shown.stages[1].results[0].corrects[0].target.id).toBe(first.refs.report);
  expect(shown.corrections).toHaveLength(2);
  w.ok(["submit"], [{ kind: "stage", state: "finished" }]);
  w.next();
  const last = w.ok(["submit"], [document("final", "Corrected sample and conclusion"), { kind: "corrects", target: sent.refs.replacement, replacement: "final", reason: "A later measurement changes the conclusion." }]);
  shown = w.shown();
  expect(shown.stages[0].results[0].correction?.head.id).toBe(last.refs.final);
  expect(shown.stages[0].results[0].correction?.replacement.id).toBe(sent.refs.replacement);
  expect(shown.stages[1].results[0].correction?.head.id).toBe(last.refs.final);
  expect(shown.corrections).toHaveLength(3);
  const stored = w.shown();
  const stale = w.cli(["submit"], [document("stale"), { kind: "corrects", target: first.refs.report, replacement: "stale", reason: "Competing successor" }]);
  expect(stale.code).toBe(1);
  expect(stale.stderr).toContain("successor");
  expect(w.shown()).toEqual(stored);
});

test.each(["missing", "missing/e1", "same-stage", "cycle", "old-replacement", "duplicate"])("invalid correction %s publishes neither replacement nor relation", (failure) => {
  const w = world();
  const first = w.ok(["submit"], [document("report"), { kind: "stage", state: "finished" }]);
  w.next();
  const target = failure === "same-stage" || failure === "cycle" ? "replacement" : failure.startsWith("missing") ? failure : first.refs.report;
  const replacement = failure === "old-replacement" ? first.refs.report : "replacement";
  const relation = { kind: "corrects", target, replacement, reason: "The sample was wrong." };
  const before = w.shown();
  const run = w.cli(["submit"], [document("replacement"), relation, ...(failure === "duplicate" ? [relation] : [])]);
  expect(run.code).toBe(1);
  expect(w.shown()).toEqual(before);
});

test("correction endpoints keep exact snapshots when a replacement is revised, and closed Flows require reopening", () => {
  const w = world();
  const first = w.ok(["submit"], [cards, { kind: "stage", state: "finished" }]);
  w.ok(["close", "--flow", first.flow]);
  const closed = w.shown();
  expect(w.cli(["submit"], [document("forbidden"), { kind: "corrects", target: first.refs["findings/claim"], replacement: "forbidden", reason: "Closed" }]).code).toBe(1);
  expect(w.shown()).toEqual(closed);
  w.ok(["reopen", "--flow", first.flow, "--skill", "implement"]);
  const sent = w.ok(["submit"], [document("replacement", "Published correction"), { kind: "corrects", target: first.refs["findings/claim"], replacement: "replacement", reason: "Withdraw permission." }]);
  w.ok(["submit"], [{ ...document("revised", "Edited correction"), revises: sent.refs.replacement }]);
  let shown = w.shown();
  const correction = shown.stages[0].results[0].entries[0].correction;
  expect(correction?.target).toMatchObject({ id: first.refs["findings/claim"], revision: 1, anchor: `${first.refs.findings}-e1` });
  expect(correction?.replacement).toMatchObject({ id: sent.refs.replacement, revision: 1, anchor: `${sent.refs.replacement}-r1` });
  expect(shown.stages[1].results[0].history[0].anchor).toBe(`${sent.refs.replacement}-r1`);
  expect(w.content().stages[1].results[0].history[0].title).toBe("Published correction");
  w.ok(["submit"], [{ kind: "stage", state: "finished" }]);
  w.ok(["close", "--flow", first.flow]);
  shown = w.shown();
  expect(shown.open).toBe(false);
  expect(shown.corrections).toHaveLength(1);
});

test("ordinary historical Results do not acquire inferred correction links", () => {
  const w = world();
  w.ok(["submit"], [document("report", "Correction in the title only")]);
  expect(w.shown().corrections).toEqual([]);
  expect(w.shown().stages[0].results[0].correction).toBeUndefined();
  expect(w.shown().stages[0].results[0].corrects).toEqual([]);
});

test("non-Result Correction targets carry their title, with the question's attempt label when the Stage asked it again", () => {
  const w = world();
  const option = { label: "Proceed", does: "Starts work", gains: ["Progress"], costs: ["Premature action"] };
  const ask = (ref: string, title: string, again?: string) => ({ ref, title, description: "Evidence is incomplete.", needs: [{ need: "Review uncertainty", kind: "prose" }], options: [option], ...(again ? { again } : {}) });
  const first = w.ok(["submit"], [{ kind: "round", questions: [ask("go", "May work proceed?")] }]);
  const q = first.refs.go;
  w.ok(["submit"], [{ kind: "answer", question: q, response: { status: "answered", text: "probably fine" }, reading: { outcome: "resolved", decision: "Proceed", basis: "Read as consent" } }]);
  const again = w.ok(["submit"], [{ kind: "round", questions: [ask("again", "May work proceed now?", q)] }]);
  w.ok(["submit"], [{ kind: "answer", question: again.refs.again, response: { status: "answered", picks: ["A"] } }, { kind: "stage", state: "finished" }]);
  w.next();
  w.ok(["submit"], [
    { kind: "reading", ref: "withdrawal", question: q, reading: { outcome: "ambiguous", unresolved: "Uncertainty is not permission." } },
    { kind: "topic", ref: "new-context", title: "Corrected context", summary: "The source is incomplete", body: "No permission is implied.", sources: ["Local evidence"] },
    { kind: "corrects", target: `${q}/reading`, replacement: "withdrawal", reason: "The reading invented permission." },
    { kind: "corrects", target: `${q}/context`, replacement: "new-context", reason: "The context overstated the evidence." },
  ]);
  const titles = Object.fromEntries(w.shown().corrections.map(c => [c.target.id, c.target.title]));
  expect(titles).toEqual({ [`${q}/reading`]: "Answer reading for Q1 (attempt 1)", [`${q}/context`]: "Context for Q1 (attempt 1)" });
});

test("entry replacements and forward refs resolve through the same discovery and validation contract without writing", () => {
  const w = world();
  const description = w.ok<{ fields: Record<string, unknown> }>(["describe", "corrects"]);
  expect(description).toBeDefined();
  const first = w.ok(["submit"], [cards, { kind: "stage", state: "finished" }]);
  w.next();
  const items = [
    { kind: "corrects", target: first.refs["findings/claim"], replacement: "findings/claim", reason: "The earlier finding is withdrawn." },
    cards,
  ];
  const before = w.shown();
  expect(w.ok<{ ok: boolean }>(["validate"], items).ok).toBe(true);
  expect(w.shown()).toEqual(before);
  const sent = w.ok(["submit"], items);
  expect(w.shown().stages[0].results[0].entries[0].correction?.replacement.id).toBe(sent.refs["findings/claim"]);
  expect(w.shown().stages[1].results[0].entries[0].corrects[0].target.id).toBe(first.refs["findings/claim"]);
});

test("competing Stage writers publish exactly one successor and no losing replacement", async () => {
  const w = world();
  const first = w.ok(["submit"], [document("original"), { kind: "stage", state: "finished" }]);
  const stages = [w.next().stage, w.next().stage];
  const before = w.shown();
  const commands = stages.map((stage, i) => {
    const child = Bun.spawn(["bun", script, "submit", "--flow", first.flow, "--stage", stage, "--home", w.home, "--session", "01a1cb0a-6de6-7226-b03b-92a07bf9e558", "--agent", "Impl465"], {
      cwd: w.home, env: { ...ENV, HOME: join(w.home, "default-home"), VSTACK_FLOW_HOST: "off" }, stdin: "pipe", stdout: "pipe", stderr: "pipe",
    });
    child.stdin.write(JSON.stringify({ version: 1, items: [document(`candidate-${i}`), { kind: "corrects", target: first.refs.original, replacement: `candidate-${i}`, reason: `Sample ${i}` }] }));
    child.stdin.end();
    return child;
  });
  const results = await Promise.all(commands.map(async child => ({ code: await child.exited, stderr: await new Response(child.stderr).text() })));
  expect(results.map(r => r.code).sort()).toEqual([0, 1]);
  expect(results.find(r => r.code === 1)?.stderr).toContain("successor");
  const after = w.shown();
  expect(after.stages.flatMap(s => s.results)).toHaveLength(before.stages.flatMap(s => s.results).length + 1);
  expect(after.corrections).toHaveLength(1);
  expect(after.revision).toBe(before.revision + 1);
  expect(after.reading.publications).toHaveLength(before.reading.publications.length + 1);
});

test("an appended replacement entry keeps its captured edit after later focused revisions", () => {
  const w = world();
  const first = w.ok(["submit"], [cards, { kind: "stage", state: "finished" }]);
  w.next();
  const container = w.ok(["submit"], [cards]);
  const entry = { ref: "withdrawal", title: "Withdrawn claim", label: "Correction", blocking: false, impact: "No permission established", action: "Ask again if needed", evidence: "The raw evidence does not settle the decision." };
  const sent = w.ok(["submit"], [
    { kind: "revise", result: container.refs.findings, add: [entry] },
    { kind: "corrects", target: first.refs["findings/claim"], replacement: `${container.refs.findings}/withdrawal`, reason: "The earlier claim overstated the evidence." },
  ]);
  const replacement = sent.refs[`${container.refs.findings}/withdrawal`];
  w.ok(["submit"], [{ kind: "revise", result: replacement, base: sent.revision, set: { title: "Clarified withdrawal" } }]);
  const relation = w.shown().stages[0].results[0].entries[0].correction;
  expect(relation?.replacement).toMatchObject({ id: replacement, revision: 1, edit: sent.revision, changed: sent.revision, anchor: `${container.refs.findings}-r1-edit${sent.revision}-e2` });
  expect(w.content().stages[1].results[0].history.at(-1)?.entries[1].title).toBe("Withdrawn claim");
  const before = w.shown();
  expect(w.cli(["submit", "--flow", first.flow, "--stage", w.opened.stage], [{ kind: "revise", result: first.refs.findings, base: first.revision, set: { title: "Forbidden mutation" } }]).code).toBe(1);
  expect(w.shown()).toEqual(before);
});

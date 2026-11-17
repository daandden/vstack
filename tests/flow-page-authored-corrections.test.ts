import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { snapshot } from "../plugin/skills/flow-page/scripts/model.ts";
import { ENV } from "./support/fixture.ts";
import { editStoredFlow } from "./support/flow-store.ts";
import { flowContent } from "./support/flow-client.ts";

const script = join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "authored-corrections-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let serial = 0;
type Receipt = { flow: string; stage: string; refs: Record<string, string>; revision: number };
type Snapshot = ReturnType<typeof snapshot>;
const note = (ref: string) => ({ kind: "topic", ref, title: ref, summary: `Summary for ${ref}`, body: `Recorded ${ref}`, sources: ["Local evidence"] });
const background = (ref: string) => ({ kind: "background", ref, title: ref, summary: `Summary for ${ref}`, sections: [{ heading: "Evidence", body: "Original evidence" }], sources: ["Local evidence"] });
const question = (ref: string, again?: string) => ({ ref, title: "May work proceed?", description: "The source is uncertain.", needs: [{ need: "Understand the decision", kind: "prose" }], options: [{ label: "Proceed", does: "Starts work", gains: ["Progress"], costs: ["May be premature"] }, { label: "Wait", does: "Waits for evidence", gains: ["No false permission"], costs: ["Delay"] }], ...(again ? { again } : {}) });
function world() {
  const home = join(root, String(serial++));
  mkdirSync(home);
  const cli = (args: string[], items?: object[]) => {
    const p = Bun.spawnSync(["bun", script, ...args, "--home", home, "--session", "01a1cb40-9b3e-7780-ba29-caea28094b57", "--agent", "Impl466"], {
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
  const opened = ok(["open", "--title", "Authored correction fixture", "--skill", "research"]);
  return { cli, ok, opened, home, content: () => flowContent(home, home, opened.flow), shown: () => ok<Snapshot>(["show", "--flow", opened.flow]), next: () => ok(["open", "--flow", opened.flow, "--skill", "implement"]) };
}
const resolved = { outcome: "resolved", decision: "Proceed with work", basis: "Misread uncertainty as permission", maps_to: "A" };
const withdrawn = { outcome: "ambiguous", unresolved: "The user did not authorize work. Ask again if the decision is needed." };
function original(w: ReturnType<typeof world>, response = { status: "answered", text: "possibly a technical shaft, not sure" }): Receipt {
  const asked = w.ok(["submit"], [{ kind: "round", questions: [question("permission")] }]);
  w.ok(["submit"], [{ kind: "answer", question: asked.refs.permission, response, ...(response.status === "answered" ? { reading: resolved } : {}) }]);
  const { ref: _, ...bg } = background("background");
  const sent = w.ok(["submit"], [bg, note("topic"), { kind: "assumed", ref: "assumption", decision: "Reversible detail", pick: "Keep default", why: "No user decision" }, { kind: "close", decisions: [{ question: asked.refs.permission, text: "Work is authorized" }] }, { kind: "stage", state: "finished" }]);
  const shown = w.shown();
  return { ...sent, refs: { ...sent.refs, ...asked.refs, background: shown.stages[0].background!, summary: shown.stages[0].closes[0].id } };
}

test("a later reading withdraws false authorization without changing raw answers or historical close records, and again recovers normally", () => {
  const w = world();
  const first = original(w);
  const before = w.content();
  w.next();
  const items = [{ kind: "reading", ref: "withdrawal", question: first.refs.permission, reading: withdrawn }, { kind: "corrects", target: `${first.refs.permission}/reading`, replacement: "withdrawal", reason: "Uncertain words are not permission" }];
  expect(w.ok<{ ok: boolean }>(["validate"], items).ok).toBe(true);
  const sent = w.ok(["submit"], items);
  const shown = w.shown();
  const after = w.content();
  expect(after.questions.map(q => q.answer.response)).toEqual(before.questions.map(q => q.answer.response));
  expect(after.stages[0]).toMatchObject({ state: before.stages[0].state, opened: before.stages[0].opened, finished: before.stages[0].finished });
  expect(shown.stages[0].closes[0].decisions.map(({ question, text, answer }) => ({ question, text, answer }))).toEqual(
    before.stages[0].items.filter(i => i.type === "close").flatMap(i => i.close.decisions.map(({ question, text, answer }) => ({ question, text, answer }))),
  );
  expect(shown.stages[0].questions[0].answer).toMatchObject({ state: "unresolved", reading: withdrawn, recorded_reading: resolved, response: before.questions[0].answer.response, correction: { head: { id: sent.refs.withdrawal } } });
  expect(shown.stages[0]).toMatchObject({ state: "finished", open_questions: 0 });
  expect(shown.stages[0].questions[0].open).toBe(false);
  expect(shown.next).toEqual([]);
  expect(shown.stages[0].closes[0].decisions[0]).toMatchObject({ answer: "resolved", current_answer: "unresolved", affected: true, current_reading: withdrawn });
  expect(shown.stages[1].readings[0]).toMatchObject({ id: sent.refs.withdrawal, corrects: [{ target: { id: `${first.refs.permission}/reading` } }] });
  const asked = w.ok(["submit"], [{ kind: "round", questions: [question("retry", first.refs.permission)] }]);
  expect(w.shown().next).toContain(asked.refs.retry);
  w.ok(["submit"], [{ kind: "answer", question: asked.refs.retry, response: { status: "answered", picks: ["B"] } }, { kind: "close", decisions: [{ question: asked.refs.retry, text: "Wait for evidence" }] }, { kind: "stage", state: "finished" }]);
  expect(w.shown().stages[1].questions[0].answer).toMatchObject({ state: "picked", picks: ["B. Wait"] });
});

test("Background, Topic, question context, Assumed, and close decision corrections retain original content and reject every stale head", () => {
  const w = world();
  const first = original(w);
  const before = w.content();
  w.next();
  const targets = [first.refs.background, first.refs.topic, `${first.refs.permission}/context`, first.refs.assumption, `${first.refs.summary}/${first.refs.permission}`];
  const sent = w.ok(["submit"], [background("new-background"), note("new-topic"), note("new-context"), { kind: "assumed", ref: "new-assumption", decision: "Reversible detail", pick: "Another default", why: "Still not a user answer" }, { kind: "close", ref: "new-summary", decisions: [{ question: first.refs.permission, text: "The earlier summary overstated authorization" }] }, ...targets.map((target, i) => ({ kind: "corrects", target, replacement: ["new-background", "new-topic", "new-context", "new-assumption", `new-summary/${first.refs.permission}`][i], reason: "The original account was wrong" }))]);
  const after = w.content();
  expect(after.stages[0].background).toMatchObject({ title: before.stages[0].background!.title, summary: before.stages[0].background!.summary, sections: before.stages[0].background!.sections });
  expect(after.topics[0]).toMatchObject({ title: before.topics[0].title, summary: before.topics[0].summary, body: before.topics[0].body, stage: before.topics[0].stage });
  const questionPayload = ({ answer: _, context: __, decided_in: ___, ...question }: typeof before.questions[number]) => question;
  expect(after.questions.map(questionPayload)).toEqual(before.questions.map(questionPayload));
  expect(after.stages[0].assumed[0]).toMatchObject({ decision: before.stages[0].assumed[0].decision, pick: before.stages[0].assumed[0].pick, why: before.stages[0].assumed[0].why });
  expect(w.shown().stages[0].closes[0].decisions.map(({ question, text, answer }) => ({ question, text, answer }))).toEqual(
    before.stages[0].items.filter(i => i.type === "close").flatMap(i => i.close.decisions.map(({ question, text, answer }) => ({ question, text, answer }))),
  );
  expect(w.shown().corrections.map(c => c.target.id)).toEqual(targets);
  for (const target of targets) {
    const bytes = w.shown();
    expect(w.cli(["submit"], [note("stale"), { kind: "corrects", target, replacement: "stale", reason: "Competing update" }]).code).toBe(1);
    expect(w.shown()).toEqual(bytes);
  }
  expect(w.shown().stages[0].questions[0].answer.state).toBe("resolved");
  w.ok(["submit"], [{ kind: "stage", state: "finished" }]);
  w.next();
  const replacements = [sent.refs["new-background"], sent.refs["new-topic"], sent.refs["new-context"], sent.refs["new-assumption"], `${sent.refs["new-summary"]}/${first.refs.permission}`];
  const last = w.ok(["submit"], [
    ...replacements.slice(0, 4).map((_, i) => note(`final-${i}`)),
    { kind: "close", ref: "final-summary", decisions: [{ question: first.refs.permission, text: "A corrected summary is still an agent account, not a user answer" }] },
    ...replacements.map((target, i) => ({ kind: "corrects", target, replacement: i === 4 ? `final-summary/${first.refs.permission}` : `final-${i}`, reason: "Later source changes the account" })),
  ]);
  for (const [i, target] of targets.entries()) expect(w.shown().corrections.find(c => c.target.id === target)?.head.id).toBe(i === 4 ? `${last.refs["final-summary"]}/${first.refs.permission}` : last.refs[`final-${i}`]);
});

test.each(["picked", "empty", "cancelled", "timed-out", "headless"])("a Correction cannot manufacture an answer for %s", status => {
  const w = world();
  const asked = w.ok(["submit"], [{ kind: "round", questions: [question("permission")] }]);
  const response = status === "picked" ? { status: "answered", picks: ["B"] } : { status, ...(status === "headless" ? { picks: ["A"] } : {}) };
  w.ok(["submit"], [{ kind: "answer", question: asked.refs.permission, response }, { kind: "stage", state: "finished", ...(status === "picked" ? {} : { retire: [{ question: asked.refs.permission, reason: "No answer" }] }) }]);
  w.next();
  const before = w.shown();
  const run = w.cli(["submit"], [{ kind: "reading", ref: "false", question: asked.refs.permission, reading: resolved }, { kind: "corrects", target: `${asked.refs.permission}/reading`, replacement: "false", reason: "Attempt to invent consent" }]);
  expect(run.code).toBe(1);
  expect(w.shown()).toEqual(before);
  expect(w.shown().stages[0].questions[0].answer.state).toBe(status === "picked" ? "picked" : "unresolved");
});

test("a Correction of a resolved reading only withdraws it and cannot substitute another decision", () => {
  const w = world();
  const first = original(w);
  w.next();
  const before = w.shown();
  const other = { outcome: "resolved", decision: "Wait for evidence", basis: "Reread as caution", maps_to: "B" };
  const run = w.cli(["submit"], [{ kind: "reading", ref: "other", question: first.refs.permission, reading: other }, { kind: "corrects", target: `${first.refs.permission}/reading`, replacement: "other", reason: "Swap the decision" }]);
  expect(run.code).toBe(1);
  expect(run.stderr).toContain("only withdraws");
  expect(w.shown()).toEqual(before);
  expect(w.shown().stages[0].questions[0].answer).toMatchObject({ state: "resolved", reading: resolved });
});

test("reading chains retain their history, reject orphan readings and renewed consent, and require reopen before correcting a closed Flow", () => {
  const w = world();
  const first = original(w);
  w.ok(["close", "--flow", first.flow]);
  const before = w.shown();
  expect(w.cli(["submit"], [{ kind: "reading", question: first.refs.permission, reading: withdrawn }]).code).toBe(1);
  expect(w.shown()).toEqual(before);
  w.ok(["reopen", "--flow", first.flow, "--skill", "implement"]);
  expect(w.cli(["submit"], [{ kind: "reading", question: first.refs.permission, reading: withdrawn }]).code).toBe(1);
  const sent = w.ok(["submit"], [{ kind: "reading", ref: "withdrawal", question: first.refs.permission, reading: withdrawn }, { kind: "corrects", target: `${first.refs.permission}/reading`, replacement: "withdrawal", reason: "Withdraw authorization" }, { kind: "stage", state: "finished" }]);
  w.next();
  const bytes = w.shown();
  expect(w.cli(["submit"], [{ kind: "reading", ref: "renewed", question: first.refs.permission, reading: resolved }, { kind: "corrects", target: sent.refs.withdrawal, replacement: "renewed", reason: "Renew authorization without asking" }]).code).toBe(1);
  expect(w.shown()).toEqual(bytes);
  const last = w.ok(["submit"], [{ kind: "reading", ref: "clarified", question: first.refs.permission, reading: { outcome: "question", unresolved: "Which evidence supports proceeding?" } }, { kind: "corrects", target: sent.refs.withdrawal, replacement: "clarified", reason: "Clarify the remaining question" }, { kind: "stage", state: "finished" }]);
  expect(w.shown().stages[0].questions[0].answer.correction?.head.id).toBe(last.refs.clarified);
  w.ok(["close", "--flow", first.flow]);
  expect(w.shown().open).toBe(false);
});

test("a legacy Topic without recorded Stage ownership refuses correction without inventing provenance", () => {
  const w = world();
  const first = w.ok(["submit"], [note("legacy"), { kind: "stage", state: "finished" }]);
  editStoredFlow(w.home, first.flow, stored => {
    delete stored.topics[0].stage;
    stored.reading.publications = stored.reading.publications.filter(p => p.id !== first.refs.legacy);
    stored.reading.historical.push({ id: first.refs.legacy, kind: "topic" });
  });
  w.next();
  const bytes = w.shown();
  const run = w.cli(["submit"], [note("replacement"), { kind: "corrects", target: first.refs.legacy, replacement: "replacement", reason: "The account was wrong" }]);
  expect(run.code).toBe(1);
  expect(run.stderr).toContain(`Topic ${first.refs.legacy} has no recorded Stage ownership`);
  expect(w.shown()).toEqual(bytes);
});

test("reading discovery and validation share the typed contract and do not publish malformed replacements", () => {
  const w = world();
  const first = original(w);
  w.next();
  expect(w.ok<{ kind: string }>(["describe", "reading"])).toBeDefined();
  const bytes = w.shown();
  const run = w.cli(["validate"], [{ kind: "reading", question: first.refs.permission, reading: { outcome: "ambiguous", unresolved: [] } }]);
  expect(run.code).toBe(1);
  expect(run.stderr).toContain("reading.unresolved");
  expect(w.shown()).toEqual(bytes);
});

test("a close published with a reading Correction records the final atomic answer state regardless of item order", () => {
  const w = world();
  const first = original(w);
  w.next();
  const sent = w.ok(["submit"], [
    { kind: "corrects", target: `${first.refs.summary}/${first.refs.permission}`, replacement: `new-summary/${first.refs.permission}`, reason: "Withdraw the mistaken close decision" },
    { kind: "corrects", target: `${first.refs.permission}/reading`, replacement: "withdrawal", reason: "Withdraw the mistaken reading" },
    { kind: "close", ref: "new-summary", decisions: [{ question: first.refs.permission, text: "No permission is established" }] },
    { kind: "reading", ref: "withdrawal", question: first.refs.permission, reading: withdrawn },
  ]);
  expect(w.shown().stages[1].closes.find(c => c.id === sent.refs["new-summary"])?.decisions[0].answer).toBe("unresolved");
  expect(w.shown().stages[0].closes[0].decisions[0].answer).toBe("resolved");
});

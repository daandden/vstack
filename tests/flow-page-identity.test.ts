import { afterAll, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ENV, git } from "./support/fixture.ts";
import { storedFolder } from "./support/flow-store.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "flow-page", "scripts", "flow-page.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-page-identity-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));

let n = 0;
function world() {
  const base = join(root, String(n++));
  const home = join(base, "home");
  const project = join(base, "project");
  mkdirSync(home, { recursive: true });
  mkdirSync(project, { recursive: true });
  git(project, "init", "-q", "-b", "main");
  git(project, "commit", "-q", "--allow-empty", "-m", "base");
  return { base, home, project };
}

type Run = { code: number; stdout: string; stderr: string; json: any };
type Opts = { session?: string; stdin?: unknown; cwd: string; home: string };
const argv = (args: string[], o: Opts) => ["bun", SCRIPT, ...args, "--home", o.home];
const envOf = (o: Opts) => ({ ...ENV, HOME: o.home, VSTACK_FLOW_HOST: "off", ...(o.session ? { PI_SESSION_ID: o.session } : {}) });
const stdinOf = (o: Opts) => (o.stdin === undefined ? "ignore" : new TextEncoder().encode(JSON.stringify(o.stdin)));
const parse = (code: number, stdout: string, stderr: string): Run => {
  let json: any;
  try {
    json = JSON.parse(stdout);
  } catch {
    json = undefined;
  }
  return { code, stdout, stderr, json };
};
function run(args: string[], o: Opts): Run {
  const r = Bun.spawnSync(argv(args, o), { cwd: o.cwd, env: envOf(o), stdin: stdinOf(o), stdout: "pipe", stderr: "pipe" });
  return parse(r.exitCode, r.stdout.toString(), r.stderr.toString());
}
async function runAsync(args: string[], o: Opts): Promise<Run> {
  const p = Bun.spawn(argv(args, o), { cwd: o.cwd, env: envOf(o), stdin: stdinOf(o), stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return parse(code, stdout, stderr);
}
const ok = (r: Run): any => {
  expect(r.stderr).toBe("");
  expect(r.code).toBe(0);
  return r.json;
};

const option = (label: string) => ({ label, does: `${label} does`, gains: [`${label} gain`], costs: [`${label} cost`] });
const question = (ref: string) => ({ ref, title: `Which ${ref}?`, description: `Why ${ref} matters.`, needs: [{ need: `Understand why ${ref} changes the decision.`, kind: "prose" }], options: [option("First"), option("Second")] });
const contribution = (...items: object[]) => ({ version: 1, items });
const round = (...questions: object[]) => ({ kind: "round", questions });
const card = (ref: string) => ({ ref, title: `Finding ${ref}`, label: "issue", blocking: true, impact: `Users see ${ref}.`, action: `Fix ${ref}.`, evidence: `${ref}.ts:1` });

function tree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name !== ".lock") out[p] = readFileSync(p, "utf8");
    }
  };
  walk(dir);
  return out;
}

function twoTickets(w: ReturnType<typeof world>) {
  const at = { cwd: w.project, home: w.home };
  const a = ok(run(["open", "--title", "Checkout limits", "--skill", "wayfinder", "--ticket", "101"], { ...at, session: "s-a" }));
  const b = ok(run(["open", "--flow", a.flow, "--skill", "wayfinder", "--ticket", "102"], { ...at, session: "s-b" }));
  return { at, a, b };
}

test("tracker aliases match case-insensitively while preserving original keys and distinguishing underscores", () => {
  const w = world();
  const at = { cwd: w.project, home: w.home, session: "tracker" };
  const a = ok(run(["open", "--title", "Underscore project", "--skill", "implement", "--ticket", "MY_PROJ-12"], at));
  ok(run(["alias", "spec:MY_PROJ-10"], at));
  const b = ok(run(["open", "--title", "Hyphen project", "--skill", "implement", "--ticket", "MY-PROJ-12"], at));
  expect(ok(run(["find", "ticket:my_proj-12"], at)).flow).toBe(a.flow);
  expect(ok(run(["find", "ticket:my-proj-12"], at)).flow).toBe(b.flow);
  expect(ok(run(["find", "spec:my_proj-10"], at)).flow).toBe(a.flow);
  const snap = ok(run(["show", "--flow", a.flow], at));
  expect(snap.stages[0].ticket).toBe("MY_PROJ-12");
  expect(snap.aliases).toContain("spec:MY_PROJ-10");
});

test("two callers bound to different Stages commit concurrently without losing work or aliases", async () => {
  const w = world();
  const { at, a, b } = twoTickets(w);
  const jobs: Promise<Run>[] = [];
  for (let i = 0; i < 6; i++) {
    const draft = { kind: "result", ref: "draft", shape: "timeline", title: `Draft ${i}`, entries: [{ title: "Equal author clocks", time: "2000-01-01T00:00:00Z", outcome: "noted" }, { title: "Clock went backward", time: "1999-01-01T00:00:00Z", outcome: "noted" }] };
    jobs.push(runAsync(["submit"], { ...at, session: "s-a", stdin: contribution(draft, round(question(`a${i}`))) }));
    jobs.push(runAsync(["submit"], { ...at, session: "s-b", stdin: contribution(round(question(`b${i}`)), draft) }));
    jobs.push(runAsync(["alias", `run:run-a${i}`], { ...at, session: "s-a" }));
    jobs.push(runAsync(["alias", `run:run-b${i}`], { ...at, session: "s-b" }));
  }
  const results = await Promise.all(jobs);
  for (const r of results) ok(r);
  const revisions = results.map((r) => r.json.revision);
  expect(new Set(revisions).size).toBe(revisions.length);

  const s = ok(run(["show", "--flow", a.flow], at));
  const stage = (id: string) => s.stages.find((st: any) => st.id === id);
  expect(stage(a.stage).questions).toHaveLength(6);
  expect(stage(b.stage).questions).toHaveLength(6);
  expect(stage(a.stage).questions.map((q: any) => q.q).sort((x: number, y: number) => x - y)).toEqual([1, 2, 3, 4, 5, 6]);
  for (let i = 0; i < 6; i++) expect(s.aliases).toEqual(expect.arrayContaining([`run:run-a${i}`, `run:run-b${i}`]));
  expect(s.revision).toBe(Math.max(...revisions));
  const committed = results.filter((r) => r.json.refs).sort((x, y) => x.json.revision - y.json.revision);
  const expectedIds = committed.flatMap((r) => r.json.stage === a.stage ? [r.json.refs.draft, ...r.json.ask.questions.map((q: any) => q.id)] : [...r.json.ask.questions.map((q: any) => q.id), r.json.refs.draft]);
  expect(s.reading.publications.map((b: any) => b.id)).toEqual(expectedIds);
  expect(s.reading.publications.map((b: any) => b.position)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
  for (let i = 0; i < committed.length; i++) expect(s.reading.publications.slice(i * 2, i * 2 + 2).map((b: any) => b.publication)).toEqual([committed[i].json.revision, committed[i].json.revision]);
});

test("mixed publications keep declared order across Stages, refusal, replay, answers and revisions", () => {
  const w = world();
  const { at, a, b } = twoTickets(w);
  const send = (session: string, ...items: object[]) => ok(run(["submit"], { ...at, session, stdin: contribution(...items) }));
  const first = send("s-a", round(question("one"), question("two")), { kind: "result", ref: "r", shape: "cards", title: "Late research", entries: [card("e")] });
  const second = send("s-b", { kind: "result", ref: "child", shape: "timeline", title: "Earlier draft", entries: [{ title: "Drafted earlier", time: "2000-01-01", outcome: "noted" }] });
  const read = () => ok(run(["show", "--flow", a.flow], at)).reading;
  const expected = [
    { id: first.refs.one, kind: "question", stage: a.stage, position: 1, publication: first.revision },
    { id: first.refs.two, kind: "question", stage: a.stage, position: 2, publication: first.revision },
    { id: first.refs.r, kind: "result", stage: a.stage, position: 3, publication: first.revision },
    { id: second.refs.child, kind: "result", stage: b.stage, position: 4, publication: second.revision },
  ];
  expect(read()).toEqual({ historical: [], publications: expected });
  const refused = run(["submit"], { ...at, session: "s-a", stdin: contribution(round(question("refused")), { kind: "revise", result: first.refs.r, base: 1, set: { title: "Stale" } }) });
  expect(refused.code).toBe(1);
  expect(refused.stderr).toContain("conflict");
  expect(read().publications).toEqual(expected);
  const replay = ok(run(["submit"], { ...at, session: "s-b", stdin: contribution({ kind: "result", ref: "child", shape: "timeline", title: "Earlier draft", entries: [{ title: "Drafted earlier", time: "2000-01-01", outcome: "noted" }] }) }));
  expect(replay).toMatchObject({ repeated: true, refs: second.refs, revision: second.revision });
  send("s-a", { kind: "answer", question: first.refs.one, response: { status: "answered", text: "Keep the first publication." }, reading: { outcome: "resolved", decision: "Keep publication order.", basis: "The words name that order." } }, { kind: "revise", result: first.refs.r, base: first.revision, set: { title: "Revised research" } });
  expect(read().publications).toEqual(expected);
  const last = send("s-a", round(question("three"), { ...question("again"), again: first.refs.one }));
  expect(last.ask.questions.map((q: any) => q.id)).toEqual([last.refs.again, last.refs.three]);
  expect(read().publications.slice(4)).toEqual([
    { id: last.refs.three, kind: "question", stage: a.stage, position: 5, publication: last.revision },
    { id: last.refs.again, kind: "question", stage: a.stage, position: 6, publication: last.revision },
  ]);
  const snapshot = ok(run(["show", "--flow", a.flow], at));
  expect(snapshot.stages[0].questions.find((q: any) => q.id === first.refs.one).answer).toMatchObject({ response: { text: "Keep the first publication." }, reading: { decision: "Keep publication order." } });
});

test("a repeated submission, even a simultaneous one, creates nothing twice", async () => {
  const w = world();
  const { at, a } = twoTickets(w);
  const input = contribution({ kind: "result", ref: "r", shape: "cards", title: "Findings", entries: [card("e")] }, round(question("scope")));
  const [x, y] = await Promise.all([runAsync(["submit"], { ...at, session: "s-a", stdin: input }), runAsync(["submit"], { ...at, session: "s-a", stdin: input })]);
  ok(x);
  ok(y);
  expect(x.json.refs).toEqual(y.json.refs);
  expect(x.json.revision).toBe(y.json.revision);
  const again = ok(run(["submit"], { ...at, session: "s-a", stdin: input }));
  expect(again.refs).toEqual(x.json.refs);
  const s = ok(run(["show", "--flow", a.flow], at)).stages.find((st: any) => st.id === a.stage);
  expect(s.questions).toHaveLength(1);
  expect(s.results).toHaveLength(1);
  expect(ok(run(["show", "--flow", a.flow], at)).revision).toBe(x.json.revision);
});

test("a focused revision changes one Result entry, and a stale edit of the same entry is refused as a conflict", () => {
  const w = world();
  const { at, a } = twoTickets(w);
  const made = ok(run(["submit"], { ...at, session: "s-a", stdin: contribution({ kind: "result", ref: "r", shape: "cards", title: "Findings", entries: [card("one"), card("two")] }) }));
  const rid = made.refs.r;
  const base = made.revision;
  const stored = () => ok(run(["show", "--flow", a.flow], at)).stages[0].results.find((r: any) => r.id === rid);

  ok(run(["submit"], { ...at, session: "s-a", stdin: contribution({ kind: "revise", result: `${rid}/one`, base, set: { blocking: false } }) }));
  expect(stored().entries[0]).toMatchObject({ title: "Finding one", blocking: false, impact: "Users see one.", evidence: "one.ts:1" });

  const before = tree(w.home);
  const stale = run(["submit"], { ...at, session: "s-a", stdin: contribution({ kind: "revise", result: `${rid}/one`, base, set: { impact: "Users see a stale edit." } }) });
  expect(stale.code).toBe(1);
  expect(stale.stdout).toBe("");
  expect(stale.stderr).toContain("conflict");
  expect(tree(w.home)).toEqual(before);

  ok(run(["submit"], { ...at, session: "s-a", stdin: contribution({ kind: "revise", result: `${rid}/two`, base, set: { action: "Ship two." } }) }));
  ok(run(["submit"], { ...at, session: "s-a", stdin: contribution({ kind: "revise", result: rid, add: [card("three")] }) }));
  const after = stored();
  expect(after.entries.map((e: any) => [e.id, e.title, e.blocking, e.action])).toEqual([
    [`${rid}/e1`, "Finding one", false, "Fix one."],
    [`${rid}/e2`, "Finding two", true, "Ship two."],
    [`${rid}/e3`, "Finding three", true, "Fix three."],
  ]);
  expect(after.entries[1].changed).toBeGreaterThan(after.entries[0].changed);

  const invalid = run(["submit"], { ...at, session: "s-a", stdin: contribution({ kind: "revise", result: `${rid}/two`, base: ok(run(["show", "--flow", a.flow], at)).revision, set: { blocking: "yes" } }) });
  expect(invalid.code).toBe(1);
  expect(invalid.stderr).toContain("blocking");
});

test("qualified aliases find a Flow, and lookup reports a missing or ambiguous Flow instead of guessing", () => {
  const w = world();
  const { at, a } = twoTickets(w);
  ok(run(["alias", "spec:267", "branch:feat/flow-page"], { ...at, session: "s-a" }));
  for (const key of ["spec:267", "spec:#267", "ticket:101", "ticket:#102", "branch:feat/flow-page", `folder:${a.flow}`]) {
    expect(ok(run(["find", key], at)).flow).toBe(a.flow);
    expect(ok(run(["show", "--flow", key], at)).flow.id).toBe(a.flow);
  }
  const other = ok(run(["open", "--title", "Another flow", "--skill", "explain"], { ...at, session: "s-c" }));
  ok(run(["alias", "--flow", other.flow, "branch:feat/flow-page"], at));

  const before = tree(w.home);
  const missing = run(["find", "spec:999"], at);
  expect(missing.code).toBe(1);
  expect(missing.stderr).toContain("spec:999");
  const ambiguous = run(["submit", "--flow", "branch:feat/flow-page", "--stage", a.stage], { ...at, stdin: contribution(round(question("x"))) });
  expect(ambiguous.code).toBe(1);
  expect(ambiguous.stderr).toContain(a.flow);
  expect(ambiguous.stderr).toContain(other.flow);
  const unqualified = run(["alias", "267"], { ...at, session: "s-a" });
  expect(unqualified.code).not.toBe(0);
  expect(tree(w.home)).toEqual(before);
});

test("projects stay isolated, and worktrees of one project share a Flow", () => {
  const w = world();
  const { at, a } = twoTickets(w);
  const elsewhere = join(w.base, "elsewhere");
  mkdirSync(elsewhere);
  git(elsewhere, "init", "-q", "-b", "main");
  git(elsewhere, "commit", "-q", "--allow-empty", "-m", "base");
  ok(run(["alias", "spec:267"], { ...at, session: "s-a" }));

  const before = tree(w.home);
  const there = { cwd: elsewhere, home: w.home };
  for (const r of [
    run(["submit", "--flow", a.flow, "--stage", a.stage], { ...there, stdin: contribution(round(question("x"))) }),
    run(["submit"], { ...there, session: "s-a", stdin: contribution(round(question("x"))) }),
    run(["bind", "--flow", a.flow, "--stage", a.stage], { ...there, session: "s-z" }),
    run(["find", "spec:267"], there),
  ]) {
    expect(r.code).toBe(1);
    expect(r.stdout).toBe("");
  }
  expect(tree(w.home)).toEqual(before);

  const wt = join(w.base, "wt");
  git(w.project, "worktree", "add", "-q", wt, "-b", "side");
  const inWt = { cwd: wt, home: w.home };
  const r = ok(run(["submit"], { ...inWt, session: "s-a", stdin: contribution(round(question("fromworktree"))) }));
  expect(r.flow).toBe(a.flow);
  expect(ok(run(["find", "spec:267"], inWt)).flow).toBe(a.flow);
  expect(ok(run(["show", "--flow", a.flow], at)).stages[0].questions.map((q: any) => q.id)).toContain(r.refs.fromworktree);
});

test("a spec alias and a folder relocation keep the Flow's identity, anchors, and continued authoring", () => {
  const w = world();
  const { at, a, b } = twoTickets(w);
  const first = ok(run(["submit"], { ...at, session: "s-a", stdin: contribution(round(question("before"))) }));
  const folder = storedFolder(w.home, a.flow);
  ok(run(["alias", "spec:267"], { ...at, session: "s-a" }));
  const before = ok(run(["show", "--flow", a.flow], at));

  const moved = ok(run(["move", "--to", "vstack-267"], { ...at, session: "s-a" }));
  expect(moved.flow).toBe(a.flow);
  expect(existsSync(folder)).toBe(false);
  expect(storedFolder(w.home, a.flow)).not.toBe(folder);
  for (const key of [a.flow, "spec:267", "folder:vstack-267", `folder:${a.flow}`]) expect(ok(run(["show", "--flow", key], at)).flow.id).toBe(a.flow);

  const after = ok(run(["show", "--flow", a.flow], at));
  expect(after.stages).toEqual(before.stages);
  const later = ok(run(["submit"], { ...at, session: "s-a", stdin: contribution(round(question("after"))) }));
  const fromB = ok(run(["submit"], { ...at, session: "s-b", stdin: contribution(round(question("other"))) }));
  expect([later.flow, fromB.flow]).toEqual([a.flow, a.flow]);
  const snapshot = ok(run(["show", "--flow", a.flow], at));
  const ids = [...snapshot.stages.map((s: any) => s.id), ...snapshot.stages.flatMap((s: any) => s.questions.map((q: any) => q.id))];
  for (const id of [first.refs.before, later.refs.after, fromB.refs.other, a.stage, b.stage]) expect(ids).toContain(id);
});

test("a failed relocation leaves the old Flow usable", () => {
  const w = world();
  const { at, a } = twoTickets(w);
  const other = ok(run(["open", "--title", "Another flow", "--skill", "explain"], { ...at, session: "s-c" }));
  const flowsDir = dirname(storedFolder(w.home, other.flow));

  const before = tree(w.home);
  const taken = run(["move", "--to", other.flow], { ...at, session: "s-a" });
  expect(taken.code).toBe(1);
  expect(tree(w.home)).toEqual(before);

  chmodSync(flowsDir, 0o555);
  try {
    const blocked = run(["move", "--to", "vstack-267"], { ...at, session: "s-a" });
    expect(blocked.code).not.toBe(0);
    expect(blocked.stdout).toBe("");
    const still = ok(run(["submit"], { ...at, session: "s-a", stdin: contribution(round(question("still"))) }));
    expect(still.flow).toBe(a.flow);
    expect(ok(run(["find", `folder:${a.flow}`], at)).flow).toBe(a.flow);
    expect(run(["find", "folder:vstack-267"], at).code).toBe(1);
  } finally {
    chmodSync(flowsDir, 0o755);
  }
});

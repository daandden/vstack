import { afterAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ENV, git } from "./support/fixture.ts";
import { editStoredFlow, storedFolder } from "./support/flow-store.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "flow-page", "scripts", "flow-page.ts");
const EMPTY_GIT_CAPTURE = join(import.meta.dir, "support", "empty-git-capture.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-page-identity-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));

let n = 0;
const observations = new Map<string, { flows: Map<string, string>; sessions: Map<string, Opts> }>();
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
type Opts = { session?: string; stdin?: unknown; cwd: string; home: string; env?: Record<string, string> };
const argv = (args: string[], o: Opts) => ["bun", SCRIPT, ...args, "--home", o.home];
const envOf = (o: Opts) => ({ ...ENV, ...o.env, HOME: join(root, "default-home"), VSTACK_FLOW_HOST: "off", ...(o.session ? { PI_SESSION_ID: o.session } : {}) });
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
  const result = parse(r.exitCode, r.stdout.toString(), r.stderr.toString());
  if (result.code === 0 && result.json?.flow) {
    let observed = observations.get(o.home);
    if (!observed) observations.set(o.home, observed = { flows: new Map(), sessions: new Map() });
    observed.flows.set(typeof result.json.flow === "string" ? result.json.flow : result.json.flow.id, o.cwd);
    if (o.session) observed.sessions.set(`${o.cwd}/${o.session}`, { cwd: o.cwd, home: o.home, session: o.session });
  }
  return result;
}
async function runAsync(args: string[], o: Opts): Promise<Run> {
  const capture = mkdtempSync(join(root, "stdio-"));
  const stdout = join(capture, "stdout");
  const stderr = join(capture, "stderr");
  try {
    const p = Bun.spawn(argv(args, o), { cwd: o.cwd, env: envOf(o), stdin: stdinOf(o), stdout: Bun.file(stdout), stderr: Bun.file(stderr) });
    const code = await p.exited;
    return parse(code, readFileSync(stdout, "utf8"), readFileSync(stderr, "utf8"));
  } finally {
    rmSync(capture, { recursive: true, force: true });
  }
}
const ok = (r: Run): any => {
  expect(r.stderr).toBe("");
  expect(r.code).toBe(0);
  return r.json;
};

const option = (label: string, ref: string) => ({ label, does: `${ref}: ${label} does`, gains: [`${ref}: ${label} gain`], costs: [`${ref}: ${label} cost`] });
const question = (ref: string) => ({ ref, title: `Which ${ref}?`, description: `Why ${ref} matters.`, needs: [{ need: `Understand why ${ref} changes the decision.`, kind: "prose" }], options: [option("First", ref), option("Second", ref)] });
const contribution = (...items: object[]) => ({ version: 1, items });
const round = (...questions: object[]) => ({ kind: "round", questions });
const card = (ref: string) => ({ ref, title: `Finding ${ref}`, label: "issue", blocking: true, impact: `Users see ${ref}.`, action: `Fix ${ref}.`, evidence: `${ref}.ts:1` });

function observed(home: string) {
  const observed = observations.get(home)!;
  return {
    flows: [...observed.flows].map(([flow, cwd]) => ok(run(["show", "--flow", flow], { home, cwd }))),
    bindings: [...observed.sessions.values()].map(at => ok(run(["bound"], at))),
  };
}

function twoTickets(w: ReturnType<typeof world>) {
  const at = { cwd: w.project, home: w.home };
  const a = ok(run(["open", "--title", "Checkout limits", "--skill", "wayfinder", "--ticket", "101"], { ...at, session: "s-a" }));
  const b = ok(run(["open", "--flow", a.flow, "--skill", "wayfinder", "--ticket", "102"], { ...at, session: "s-b" }));
  return { at, a, b };
}

function gitTransport(w: ReturnType<typeof world>) {
  const bin = join(w.base, "bin");
  const tmp = join(w.base, "tmp");
  mkdirSync(bin);
  mkdirSync(tmp);
  const realGit = `'${Bun.which("git")!.replaceAll("'", "'\\''")}'`;
  const bun = `'${process.execPath.replaceAll("'", "'\\''")}'`;
  writeFileSync(join(bin, "git"), `#!/bin/sh
if [ "$FLOW_TEST_GIT_FAILURE" = "1" ]; then exit 7; fi
# Bun may back logical pipes with unlinked regular files.
if [ "$FLOW_TEST_DROP_GIT_PIPE" = "1" ] && ! ${bun} -e 'const stats = require("node:fs").fstatSync(1); process.exit(stats.isFile() && stats.nlink > 0 ? 0 : 1)'; then
  exec ${realGit} "$@" >/dev/null
fi
exec ${realGit} "$@"
`);
  chmodSync(join(bin, "git"), 0o755);
  symlinkSync(process.execPath, join(bin, "bun"));
  return { bin, tmp, env: { PATH: `${bin}:${ENV.PATH}`, TMPDIR: tmp, TMP: tmp, TEMP: tmp } };
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
  expect(last.ask.questions.map((q: any) => q.id)).toEqual([last.refs.three, last.refs.again]);
  expect(last.ask.questions.map((q: any) => q.question.split(".")[0])).toEqual(["Q3", "Q1"]);
  expect(read().publications.slice(4)).toEqual([
    { id: last.refs.three, kind: "question", stage: a.stage, position: 5, publication: last.revision },
    { id: last.refs.again, kind: "question", stage: a.stage, position: 6, publication: last.revision },
  ]);
  const snapshot = ok(run(["show", "--flow", a.flow], at));
  expect(snapshot.stages[0].questions.find((q: any) => q.id === first.refs.one).answer).toMatchObject({ response: { text: "Keep the first publication." }, reading: { decision: "Keep publication order." } });
});

test.each([["lost", "normal"], ["normal", "lost"]])("bound callers retain their project with %s then %s Git pipe output", async (first, second) => {
  const w = world();
  const { at, a, b } = twoTickets(w);
  const transport = gitTransport(w);
  const revisions: number[] = [];
  for (const mode of [first, second]) {
    const env = { ...transport.env, FLOW_TEST_DROP_GIT_PIPE: mode === "lost" ? "1" : "0" };
    const jobs: Promise<Run>[] = [];
    for (let i = 0; i < 6; i++) {
      jobs.push(runAsync(["submit"], { ...at, env, session: "s-a", stdin: contribution(round(question(`${mode}-a${i}`))) }));
      jobs.push(runAsync(["submit"], { ...at, env, session: "s-b", stdin: contribution(round(question(`${mode}-b${i}`))) }));
      jobs.push(runAsync(["alias", `run:${mode}-a${i}`], { ...at, env, session: "s-a" }));
      jobs.push(runAsync(["alias", `run:${mode}-b${i}`], { ...at, env, session: "s-b" }));
    }
    for (const result of await Promise.all(jobs)) {
      const receipt = ok(result);
      expect(receipt.flow).toBe(a.flow);
      revisions.push(receipt.revision);
    }
    expect(ok(run(["bound"], { ...at, env, session: "s-a" })).stage).toBe(a.stage);
    expect(ok(run(["bound"], { ...at, env, session: "s-b" })).stage).toBe(b.stage);
    expect(readdirSync(transport.tmp)).toEqual([]);
  }
  expect(new Set(revisions).size).toBe(48);
  const state = ok(run(["show", "--flow", a.flow], at));
  expect(state.stages.find((s: any) => s.id === a.stage).questions).toHaveLength(12);
  expect(state.stages.find((s: any) => s.id === b.stage).questions).toHaveLength(12);
  for (const mode of [first, second]) {
    for (let i = 0; i < 6; i++) expect(state.aliases).toEqual(expect.arrayContaining([`run:${mode}-a${i}`, `run:${mode}-b${i}`]));
  }
  expect(state.revision).toBe(Math.max(...revisions));
});

test("Git command and spawn failures refuse namespace selection and clean captures", () => {
  const w = world();
  const at = { cwd: w.project, home: w.home, session: "unbound" };
  const transport = gitTransport(w);
  const commandFailure = run(["bound"], { ...at, env: { ...transport.env, FLOW_TEST_GIT_FAILURE: "1" } });
  expect(commandFailure.code).toBe(1);
  expect(commandFailure.stdout).toBe("");
  expect(commandFailure.stderr).toContain("git");
  expect(readdirSync(transport.tmp)).toEqual([]);
  expect(existsSync(join(w.home, ".vstack"))).toBe(false);
  rmSync(join(transport.bin, "git"));
  const spawnFailure = run(["bound"], { ...at, env: { ...transport.env, PATH: transport.bin } });
  expect(spawnFailure.code).toBe(1);
  expect(spawnFailure.stdout).toBe("");
  expect(spawnFailure.stderr).not.toBe("");
  expect(readdirSync(transport.tmp)).toEqual([]);
  expect(existsSync(join(w.home, ".vstack"))).toBe(false);
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

const stableJson = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(stableJson).join(",")}]` : typeof v === "object" && v !== null ? `{${Object.entries(v).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)).map(([k, x]) => `${JSON.stringify(k)}:${stableJson(x)}`).join(",")}}` : JSON.stringify(v);
const digestOf = (v: unknown) => createHash("sha256").update(stableJson(v)).digest("hex");

test("an unchanged receipt committed by an earlier, laxer validator replays without writing, and an edited copy is refused", () => {
  const w = world();
  const { at, a } = twoTickets(w);
  const committed = contribution(round(question("scope")));
  const sent = ok(run(["submit"], { ...at, session: "s-a", stdin: committed }));
  const shown = ok(run(["show", "--flow", a.flow], at));

  const historical = contribution(round({ ...question("scope"), options: [{ ...option("First", "scope"), gains: [] }, option("Second", "scope")] }));
  expect(run(["validate"], { ...at, session: "s-a", stdin: historical }).code).toBe(1);
  editStoredFlow(w.home, a.flow, state => { state.submissions[a.stage]!.digest = digestOf(historical); });

  const before = observed(w.home);
  const replay = ok(run(["submit"], { ...at, session: "s-a", stdin: historical }));
  expect(ok(run(["show", "--flow", a.flow], at))).toEqual(shown);
  expect(replay).toMatchObject({ repeated: true, revision: sent.revision, refs: sent.refs });
  expect(observed(w.home)).toEqual(before);

  const edited = run(["submit"], { ...at, session: "s-a", stdin: contribution(round({ ...question("scope"), title: "Which scope now?", options: [{ ...option("First", "scope"), gains: [] }, option("Second", "scope")] })) });
  expect(edited.code).toBe(1);
  expect(edited.stderr).toContain("gains");
  expect(observed(w.home)).toEqual(before);
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

  const before = observed(w.home);
  const stale = run(["submit"], { ...at, session: "s-a", stdin: contribution({ kind: "revise", result: `${rid}/one`, base, set: { impact: "Users see a stale edit." } }) });
  expect(stale.code).toBe(1);
  expect(JSON.parse(stale.stdout)).toMatchObject({ ok: false, diagnostics: expect.any(Array) });
  expect(stale.stderr).toContain("conflict");
  expect(observed(w.home)).toEqual(before);

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

  const before = observed(w.home);
  const missing = run(["find", "spec:999"], at);
  expect(missing.code).toBe(1);
  expect(missing.stderr).toContain("spec:999");
  const ambiguous = run(["submit", "--flow", "branch:feat/flow-page", "--stage", a.stage], { ...at, stdin: contribution(round(question("x"))) });
  expect(ambiguous.code).toBe(1);
  expect(ambiguous.stderr).toContain(a.flow);
  expect(ambiguous.stderr).toContain(other.flow);
  const unqualified = run(["alias", "267"], { ...at, session: "s-a" });
  expect(unqualified.code).not.toBe(0);
  expect(observed(w.home)).toEqual(before);
});

test("a failed git lookup refuses authoring instead of routing a repository to global Flows", () => {
  const w = world();
  const { at } = twoTickets(w);
  const before = observed(w.home);
  const config = join(w.project, ".git", "config");
  const originalConfig = readFileSync(config, "utf8");
  writeFileSync(join(w.project, ".git", "config"), "[invalid config\n");
  const result = run(["submit"], { ...at, session: "s-a", stdin: contribution(round(question("must-not-route"))) });
  expect(result.code).not.toBe(0);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("git rev-parse");
  expect(result.stderr).toContain("bad config line");
  expect(result.stderr).not.toContain("is bound to no Flow");
  writeFileSync(config, originalConfig);
  expect(observed(w.home)).toEqual(before);
});

test("projects stay isolated, and worktrees of one project share a Flow", () => {
  const w = world();
  const { at, a } = twoTickets(w);
  const elsewhere = join(w.base, "elsewhere");
  mkdirSync(elsewhere);
  git(elsewhere, "init", "-q", "-b", "main");
  git(elsewhere, "commit", "-q", "--allow-empty", "-m", "base");
  ok(run(["alias", "spec:267"], { ...at, session: "s-a" }));

  const before = observed(w.home);
  const there = { cwd: elsewhere, home: w.home };
  for (const [i, r] of [
    run(["submit", "--flow", a.flow, "--stage", a.stage], { ...there, stdin: contribution(round(question("x"))) }),
    run(["submit"], { ...there, session: "s-a", stdin: contribution(round(question("x"))) }),
    run(["bind", "--flow", a.flow, "--stage", a.stage], { ...there, session: "s-z" }),
    run(["find", "spec:267"], there),
  ].entries()) {
    expect(r.code).toBe(1);
    if (i < 2) expect(JSON.parse(r.stdout)).toMatchObject({ ok: false, diagnostics: expect.any(Array) });
    else expect(r.stdout).toBe("");
  }
  expect(observed(w.home)).toEqual(before);

  const wt = join(w.base, "wt");
  git(w.project, "worktree", "add", "-q", wt, "-b", "side");
  const inWt = { cwd: wt, home: w.home };
  const r = ok(run(["submit"], { ...inWt, session: "s-a", stdin: contribution(round(question("fromworktree"))) }));
  expect(r.flow).toBe(a.flow);
  expect(ok(run(["find", "spec:267"], inWt)).flow).toBe(a.flow);
  expect(ok(run(["show", "--flow", a.flow], at)).stages[0].questions.map((q: any) => q.id)).toContain(r.refs.fromworktree);
});

test.each(["repository", "outside-repository"] as const)("Flow authoring keeps its namespace when real Git %s capture buffers disappear", (location) => {
  const w = world();
  const cwd = location === "repository" ? w.project : join(w.base, "plain");
  mkdirSync(cwd, { recursive: true });
  const at = { cwd, home: w.home, session: "capture-loss" };
  const opened = ok(run(["open", "--title", "Capture loss", "--skill", "implement"], at));
  const temporary = join(w.base, "temporary");
  mkdirSync(temporary);
  const input = contribution(round(question("captured")));
  const result = Bun.spawnSync(["bun", "--preload", EMPTY_GIT_CAPTURE, ...argv(["submit"], at).slice(1)], {
    cwd, env: { ...envOf(at), TMPDIR: temporary }, stdin: stdinOf({ ...at, stdin: input }), stdout: "pipe", stderr: "pipe",
  });
  const receipt = ok(parse(result.exitCode, result.stdout.toString(), result.stderr.toString()));
  expect(receipt.flow).toBe(opened.flow);
  expect(receipt.stage).toBe(opened.stage);
  expect(receipt.live).toEqual(opened.live);
  expect(receipt).not.toHaveProperty("page");
  expect(receipt).not.toHaveProperty("presentation");
  const snapshot = ok(run(["show", "--flow", opened.flow], at));
  expect(snapshot.stages.find((stage: any) => stage.id === opened.stage).questions.map((q: any) => q.id)).toEqual([receipt.refs.captured]);
  const stores = readdirSync(join(w.home, ".vstack", "tmp"));
  expect(stores).toHaveLength(1);
  if (location === "repository") expect(stores[0]).toMatch(/^project-[0-9a-f]{6}$/);
  else expect(stores).toEqual(["_global"]);
  expect(readdirSync(temporary)).toEqual([]);
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

  const before = observed(w.home);
  const taken = run(["move", "--to", other.flow], { ...at, session: "s-a" });
  expect(taken.code).toBe(1);
  expect(observed(w.home)).toEqual(before);

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

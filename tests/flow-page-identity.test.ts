import { afterAll, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ENV, git } from "./support/fixture.ts";

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
    jobs.push(runAsync(["submit"], { ...at, session: "s-a", stdin: contribution(round(question(`a${i}`))) }));
    jobs.push(runAsync(["submit"], { ...at, session: "s-b", stdin: contribution(round(question(`b${i}`))) }));
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
  ok(run(["alias", "spec:267"], { ...at, session: "s-a" }));
  const before = ok(run(["show", "--flow", a.flow], at));

  const moved = ok(run(["move", "--to", "vstack-267"], { ...at, session: "s-a" }));
  expect(moved.flow).toBe(a.flow);
  expect(existsSync(dirname(first.page))).toBe(false);
  expect(dirname(moved.page)).not.toBe(dirname(first.page));
  for (const key of [a.flow, "spec:267", "folder:vstack-267", `folder:${a.flow}`]) expect(ok(run(["show", "--flow", key], at)).flow.id).toBe(a.flow);

  const after = ok(run(["show", "--flow", a.flow], at));
  expect(after.stages).toEqual(before.stages);
  const later = ok(run(["submit"], { ...at, session: "s-a", stdin: contribution(round(question("after"))) }));
  const fromB = ok(run(["submit"], { ...at, session: "s-b", stdin: contribution(round(question("other"))) }));
  expect([later.flow, fromB.flow]).toEqual([a.flow, a.flow]);
  expect(later.page).toBe(moved.page);
  const page = readFileSync(moved.page, "utf8");
  for (const id of [first.refs.before, later.refs.after, fromB.refs.other, a.stage, b.stage]) expect(page).toContain(`id="${id}"`);
});

test("a failed relocation leaves the old Flow usable", () => {
  const w = world();
  const { at, a } = twoTickets(w);
  const other = ok(run(["open", "--title", "Another flow", "--skill", "explain"], { ...at, session: "s-c" }));
  const flowsDir = dirname(dirname(other.page));

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

const pageRevision = (page: string) => readFileSync(page, "utf8").match(/name="flow-page-revision" content="(\d+)"/)?.[1];

test("a failed page projection keeps the last good page, marks it stale, and the receipt says the content is committed", () => {
  const w = world();
  const { at, a } = twoTickets(w);
  const good = ok(run(["submit"], { ...at, session: "s-a", stdin: contribution(round(question("kept"))) }));
  expect(good.presentation).toMatchObject({ state: "current", revision: good.revision });
  const folder = dirname(good.page);
  const lastGood = readFileSync(good.page, "utf8");

  chmodSync(folder, 0o555);
  let failed: Run;
  try {
    failed = run(["submit"], { ...at, session: "s-a", stdin: contribution(round(question("committed"))) });
    expect(failed.code).toBe(0);
    expect(failed.stderr).not.toBe("");
    expect(failed.json.revision).toBe(good.revision + 1);
    expect(failed.json.refs.committed).toBeDefined();
    expect(failed.json.presentation).toMatchObject({ state: "stale", revision: good.revision });
    expect(readFileSync(good.page, "utf8")).toBe(lastGood);

    const s = ok(run(["show", "--flow", a.flow], at));
    expect(s.revision).toBe(failed.json.revision);
    expect(s.presentation).toMatchObject({ state: "stale", revision: good.revision });
    expect(s.stages[0].questions.map((q: any) => q.id)).toContain(failed.json.refs.committed);

    const repeat = run(["submit"], { ...at, session: "s-a", stdin: contribution(round(question("committed"))) });
    expect(repeat.code).toBe(0);
    expect(repeat.json.refs).toEqual(failed.json.refs);
  } finally {
    chmodSync(folder, 0o755);
  }
  const fixed = ok(run(["render", "--flow", a.flow], at));
  expect(fixed.presentation).toMatchObject({ state: "current", revision: failed.json.revision });
  expect(pageRevision(good.page)).toBe(String(failed.json.revision));
  expect(ok(run(["show", "--flow", a.flow], at)).stages[0].questions).toHaveLength(2);
});

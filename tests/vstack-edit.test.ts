import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ENV, git, writeFiles } from "./support/fixture.ts";
import { lifecycleFixture } from "./support/update-lifecycle-fixture.ts";

const script = join(import.meta.dir, "../scripts/vstack-edit.ts");
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

type Fixture = ReturnType<typeof lifecycleFixture>;
function fixture() { const f = lifecycleFixture(); dirs.push(f.dir); return f; }
async function edit(f: Fixture, args: string[], env: Record<string, string> = {}) {
  const p = Bun.spawn([process.execPath, script, ...args, "--root", f.root, "--gh", f.gh, "--omp", join(f.dir, "omp")], {
    cwd: f.root,
    env: { ...ENV, OMP_WORKTREE_DIR: f.wtBase, FAKE_OMP_LOG: join(f.dir, "omp-calls.jsonl"), FAKE_OMP_CLONE: "1", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  let json: any;
  try { json = JSON.parse(out); } catch { json = undefined; }
  return { code, out, err, json };
}
/** A refusal: exit 2 and a JSON reason on stdout. */
function refused(r: Awaited<ReturnType<typeof edit>>, reason: string) {
  expect({ code: r.code, ok: r.json?.ok }).toEqual({ code: 2, ok: false });
  expect(r.json.reason).toContain(reason);
}

/** A run made by preflight, after `files` are committed on main. */
async function started(f: Fixture, files: Record<string, string> = {}) {
  if (Object.keys(files).length) { writeFiles(f.root, files); git(f.root, "add", "-A"); git(f.root, "commit", "-qm", "fixture callers"); }
  const r = await edit(f, ["preflight", "--name", "tidy-wording"]);
  if (r.code !== 0) throw new Error(r.out + r.err);
  return { file: r.json.run as string, wt: r.json.worktree.path as string };
}
test("preflight refuses an Update branch and an open Update PR, and otherwise makes the edit worktree from main", async () => {
  const f = fixture();
  git(f.root, "branch", "update/existing");
  refused(await edit(f, ["preflight", "--name", "tidy-wording"]), "update/existing");
  git(f.root, "branch", "-D", "update/existing");
  refused(await edit(f, ["preflight", "--name", "tidy-wording"], { OPEN_PR: JSON.stringify([{ headRefName: "update/open", url: "https://example.invalid/pr/1" }]) }), "https://example.invalid/pr/1");
  refused(await edit(f, ["preflight", "--name", "Tidy Wording"]), "name");
  expect(f.ompCalls()).toEqual([]);

  const r = await edit(f, ["preflight", "--name", "tidy-wording"]);
  expect({ code: r.code, err: r.err }).toEqual({ code: 0, err: "" });
  expect(r.json.branch).toBe("edit/tidy-wording");
  expect(git(r.json.worktree.path, "branch", "--show-current")).toBe("edit/tidy-wording");
  expect(git(r.json.worktree.path, "rev-parse", "HEAD")).toBe(git(f.root, "rev-parse", "main"));
  expect(JSON.parse(readFileSync(r.json.run, "utf8")).worktree.path).toBe(r.json.worktree.path);
  expect(git(f.root, "branch", "--show-current")).toBe("main");
}, 30000);

test("check prints the register row, Disposition, and callers from both reference forms at the current Pin, with no fetch", async () => {
  const f = fixture();
  const run = await started(f, {
    "plugin/skills/tdd/SKILL.md": "---\nname: tdd\ndescription: Fixture skill\n---\nRead skill://wording/refs/glossary.md first.\n",
    "plugin/skills/drift/SKILL.md": "---\nname: drift\ndescription: Fixture skill\n---\nRun `/skill:wording-extra` and read skill://wordings.\n",
  });
  const calls = f.calls().length;
  const r = await edit(f, ["check", "--run", run.file, "plugin/skills/wording", "plugin/skills/ask-vstack"]);
  expect({ code: r.code, err: r.err }).toEqual({ code: 0, err: "" });
  const [wording, router] = r.json.targets;
  expect(wording).toMatchObject({ artifact: "plugin/skills/wording", kind: "skill", dispositions: ["adapt"] });
  expect(wording.rows).toEqual([expect.objectContaining({ id: "matt/wording", upstream: "matt", pin: "v1.1.0", path: "skills/eng/wording", disposition: "adapt" })]);
  expect(wording.callers).toEqual(["plugin/skills/ask-vstack/SKILL.md", "plugin/skills/tdd/SKILL.md"]);
  expect(router).toMatchObject({ artifact: "plugin/skills/ask-vstack", dispositions: ["original"], rows: [] });
  expect(existsSync(f.cache)).toBe(false);
  expect(f.calls().slice(calls)).toEqual([]);
}, 30000);

test("check refuses an adopt target and an artifact the register does not name", async () => {
  const f = fixture();
  const run = await started(f);
  refused(await edit(f, ["check", "--run", run.file, "plugin/skills/keep"]), "adopt");
  refused(await edit(f, ["check", "--run", run.file, "plugin/skills/brand-new"]), "plugin/skills/brand-new");
}, 30000);

const WORDING = "---\nname: wording\ndescription: Fixture skill\n---\nRead GLOSSARY.md before you write.\n";
function decide(f: Fixture, targets: object[]) {
  const file = join(f.dir, `decisions-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, JSON.stringify({ targets, changelog: ["wording reads GLOSSARY.md before it writes."], commit: "fix(wording): read GLOSSARY.md first" }));
  return file;
}
const editWording = { action: "edit", kind: "skill", artifact: "plugin/skills/wording" };

test("prepare raises the patch version and moves the Unreleased lines with the new entry under the new version", async () => {
  const f = fixture();
  const run = await started(f, { "CHANGELOG.md": "# Changelog\n\n## [Unreleased]\n\n- An earlier line.\n\n## [0.1.0] - 2026-01-01\n\n- First.\n" });
  writeFiles(run.wt, { "plugin/skills/wording/SKILL.md": WORDING });
  const decisions = decide(f, [editWording]);
  for (let i = 0; i < 2; i++) {
    const r = await edit(f, ["prepare", "--run", run.file, "--decisions", decisions]);
    expect({ code: r.code, out: r.json.version }).toEqual({ code: 0, out: "0.1.1" });
  }
  expect(JSON.parse(readFileSync(join(run.wt, "plugin/package.json"), "utf8")).version).toBe("0.1.1");
  const changelog = readFileSync(join(run.wt, "CHANGELOG.md"), "utf8");
  expect(changelog).toMatch(/^# Changelog\n\n## \[Unreleased\]\n\n## \[0\.1\.1\] - \d{4}-\d{2}-\d{2}\n\n- An earlier line\.\n- wording reads GLOSSARY\.md before it writes\.\n\n## \[0\.1\.0\] - 2026-01-01\n\n- First\.\n$/);
}, 30000);

test("prepare refuses other actions, adopt targets, unchanged targets, and changes outside the targets", async () => {
  const f = fixture();
  const run = await started(f);
  refused(await edit(f, ["prepare", "--run", run.file, "--decisions", decide(f, [editWording])]), "plugin/skills/wording has no change");
  writeFiles(run.wt, { "plugin/skills/wording/SKILL.md": WORDING });
  refused(await edit(f, ["prepare", "--run", run.file, "--decisions", decide(f, [{ ...editWording, action: "rename" }])]), "rename");
  refused(await edit(f, ["prepare", "--run", run.file, "--decisions", decide(f, [editWording, { action: "edit", kind: "skill", artifact: "plugin/skills/keep" }])]), "adopt");
  writeFiles(run.wt, { "plugin/skills/drift/SKILL.md": "---\nname: drift\ndescription: Fixture skill\n---\nChanged too.\n" });
  refused(await edit(f, ["prepare", "--run", run.file, "--decisions", decide(f, [editWording])]), "plugin/skills/drift");
}, 30000);

/** A prepared run of the wording edit, and the gates command line with its stand-ins. */
async function prepared(f: Fixture) {
  const run = await started(f);
  writeFiles(run.wt, { "plugin/skills/wording/SKILL.md": WORDING });
  const r = await edit(f, ["prepare", "--run", run.file, "--decisions", decide(f, [editWording])]);
  if (r.code !== 0) throw new Error(r.out);
  const suite = join(f.dir, "suite");
  writeFileSync(suite, '#!/bin/sh\n[ -z "$FAIL_TESTS" ]\n'); chmodSync(suite, 0o755);
  return { ...run, gates: ["gates", "--run", run.file, "--smoke", f.smoke, "--test", suite, "--upstreams", f.cache, "--remote", f.remote] };
}

test("gates pass on a clean draft and fail when the load smoke fails or reports a missing skill", async () => {
  const f = fixture();
  const run = await prepared(f);
  const pass = await edit(f, run.gates);
  expect({ code: pass.code, out: pass.json?.ok }).toEqual({ code: 0, out: true });
  refused(await edit(f, run.gates, { FAIL_SMOKE: "1" }), "load smoke");
  refused(await edit(f, run.gates, { SMOKE_DROP: "wording" }), "load smoke missing skill plugin/skills/wording");
  refused(await edit(f, run.gates, { FAIL_TESTS: "1" }), "test suite");
}, 60000);

/** A Grilling page state file whose latest close record has `answer`. */
function grilling(f: Fixture, answer?: string) {
  const file = join(f.dir, `grilling-${Math.random().toString(36).slice(2)}.jsonl`);
  const close = (id: string, a?: string) => JSON.stringify({ type: "close", id, session: 1, decisions: [], ...(a ? { answer: a } : {}) });
  writeFileSync(file, [JSON.stringify({ type: "page", id: "page", title: "Edit wording" }), close("close-1", "Not yet"), close("close-2", answer)].join("\n") + "\n");
  return file;
}

test("finish refuses without passed gates and a confirmed closing gate, then makes one local commit and never pushes or opens a PR", async () => {
  const f = fixture();
  const origin = join(f.dir, "origin.git");
  git(f.dir, "init", "-q", "--bare", origin); git(f.root, "remote", "add", "origin", origin); git(f.root, "push", "-q", "origin", "main");
  const run = await prepared(f);
  const finish = (state?: string) => edit(f, ["finish", "--run", run.file, ...(state ? ["--grilling", state] : [])]);
  const confirmed = grilling(f, "Shared understanding");
  refused(await finish(confirmed), "gates");
  expect((await edit(f, run.gates)).code).toBe(0);
  const calls = f.calls().length;
  refused(await finish(), "closing gate");
  refused(await finish(grilling(f)), "closing gate");
  refused(await finish(grilling(f, "Not yet")), "closing gate");
  // Re-appending an older close replaces it in place on the page; the newer close-2 stays the latest gate.
  const reopened = grilling(f, "Not yet");
  writeFileSync(reopened, readFileSync(reopened, "utf8") + JSON.stringify({ type: "close", id: "close-1", session: 1, decisions: [], answer: "Shared understanding" }) + "\n");
  refused(await finish(reopened), "closing gate");
  writeFiles(run.wt, { "plugin/skills/wording/SKILL.md": WORDING + "One more line.\n" });
  refused(await finish(confirmed), "gates");
  writeFiles(run.wt, { "plugin/skills/wording/SKILL.md": WORDING });

  const done = await finish(confirmed);
  expect({ code: done.code, branch: done.json?.branch }).toEqual({ code: 0, branch: "edit/tidy-wording" });
  expect(git(f.root, "rev-list", "--count", "main..edit/tidy-wording")).toBe("1");
  expect(git(run.wt, "log", "-1", "--format=%s")).toBe("fix(wording): read GLOSSARY.md first");
  expect(git(run.wt, "show", "--name-only", "--format=", "HEAD").split("\n").sort()).toEqual(["CHANGELOG.md", "plugin/package.json", "plugin/skills/wording/SKILL.md"]);
  expect(git(run.wt, "status", "--porcelain")).toBe("");
  expect(git(f.root, "ls-remote", "--heads", "origin")).not.toContain("edit/");
  expect(f.calls().slice(calls)).toEqual([]);
}, 60000);

test("cancel removes only the run's worktree and branch", async () => {
  const f = fixture();
  const run = await started(f);
  const other = join(f.dir, "other-wt");
  git(f.root, "worktree", "add", "-q", "-b", "edit/other", other, "main");
  const main = git(f.root, "rev-parse", "main");
  const r = await edit(f, ["cancel", "--run", run.file]);
  expect({ code: r.code, removed: r.json?.removed }).toEqual({ code: 0, removed: run.wt });
  expect(existsSync(run.wt)).toBe(false);
  expect(git(f.root, "for-each-ref", "--format=%(refname:short)", "refs/heads/edit/")).toBe("edit/other");
  expect(git(f.root, "worktree", "list")).toContain(other);
  expect(git(f.root, "rev-parse", "main")).toBe(main);
}, 30000);

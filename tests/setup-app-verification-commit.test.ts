// setup-app-verification's commit script run as a process over temp git repos (ADR 0009): the Standard-mode
// commit that holds only the Verify skill directory, its refusals, and the dirty state a run checks first.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ENV, git, writeFiles } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "setup-app-verification", "scripts", "commit.ts");
const DIR = ".omp/skills/verify-web";
const SKILL = { [`${DIR}/SKILL.md`]: "---\nname: verify-web\n---\n# Verify web\n" };

let dir: string;
beforeAll(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "vstack-verify-commit-test-")));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function run(cwd: string, ...args: string[]) {
  const r = Bun.spawnSync([process.execPath, SCRIPT, ...args], { cwd, env: ENV, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}

function state(cwd: string) {
  const r = run(cwd, "state", "--app", "web");
  if (r.code !== 0) throw new Error(`state exit ${r.code}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

const commit = (cwd: string, title = "chore: set up verify-web") => run(cwd, "commit", "--app", "web", "--title", title);
const head = (repo: string) => git(repo, "rev-parse", "HEAD");
const committed = (repo: string) => git(repo, "show", "--name-status", "--format=", "HEAD").split("\n").sort();

let n = 0;
/** A repo with one commit holding `files`. */
function makeRepo(files: Record<string, string> = { "README.md": "# app\n" }): string {
  const repo = join(dir, `repo-${++n}`, "app");
  mkdirSync(repo, { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  writeFiles(repo, files);
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "init");
  return repo;
}

test("Standard commit holds only the Verify skill directory, with the given title, and leaves other work as it was", () => {
  const repo = makeRepo({ "README.md": "# app\n", "src/a.ts": "a\n" });
  // Unrelated work in progress: a staged change, an unstaged change, and an untracked file.
  writeFiles(repo, { "src/a.ts": "a staged\n" });
  git(repo, "add", "src/a.ts");
  writeFiles(repo, { "README.md": "# app, unstaged\n", "notes.txt": "untracked\n" });
  // What the run writes in Standard mode.
  writeFiles(repo, { ...SKILL, [`${DIR}/features/README.md`]: "# Features\n" });

  const r = commit(repo);
  expect(r.code).toBe(0);
  const out = JSON.parse(r.stdout);
  expect(out.commit).toBe(head(repo));
  expect(out.dir).toBe(DIR);
  expect(git(repo, "log", "-1", "--format=%s")).toBe("chore: set up verify-web");
  expect(committed(repo)).toEqual([`A\t${DIR}/SKILL.md`, `A\t${DIR}/features/README.md`].sort());
  expect(git(repo, "diff", "--cached", "--name-only")).toBe("src/a.ts");
  expect(git(repo, "diff", "--name-only")).toBe("README.md");
  expect(git(repo, "ls-files", "--others", "--exclude-standard")).toBe("notes.txt");
});

test("a fix commit records edits and deletions inside the directory", () => {
  const repo = makeRepo({ ...SKILL, [`${DIR}/features/old.md`]: "# Old\n", [`${DIR}/features/login.md`]: "# Login\n" });
  rmSync(join(repo, DIR, "features", "old.md"));
  writeFiles(repo, { [`${DIR}/features/login.md`]: "# Login, fixed\n" });

  const r = commit(repo, "fix(verify-web): login");
  expect(r.code).toBe(0);
  expect(committed(repo)).toEqual([`D\t${DIR}/features/old.md`, `M\t${DIR}/features/login.md`].sort());
  expect(git(repo, "status", "--porcelain")).toBe("");
});

test("with nothing changed in the directory, commit makes no commit and prints a null commit", () => {
  const repo = makeRepo({ ...SKILL, "README.md": "# app\n" });
  writeFiles(repo, { "README.md": "# app, unrelated edit\n" });
  const before = head(repo);

  const r = commit(repo);
  expect(r.code).toBe(0);
  expect(JSON.parse(r.stdout).commit).toBeNull();
  expect(head(repo)).toBe(before);
  expect(git(repo, "diff", "--name-only")).toBe("README.md");
});

test("commit refuses in Private mode, without a title, without the directory or its SKILL.md, and for a symlinked directory", () => {
  const priv = makeRepo();
  writeFiles(priv, SKILL);
  mkdirSync(join(priv, ".git", "vstack", "config"), { recursive: true });
  const p = commit(priv);
  expect(p.code).toBe(2);
  expect(p.stderr).toContain("Private");

  const noTitle = makeRepo();
  writeFiles(noTitle, SKILL);
  expect(run(noTitle, "commit", "--app", "web").code).toBe(2);

  const noDir = makeRepo();
  const d = commit(noDir);
  expect(d.code).toBe(2);
  expect(d.stderr).toContain(DIR);

  const noSkill = makeRepo();
  writeFiles(noSkill, { [`${DIR}/features/README.md`]: "# Features\n" });
  const s = commit(noSkill);
  expect(s.code).toBe(2);
  expect(s.stderr).toContain("SKILL.md");

  const linked = makeRepo();
  const shared = join(dirname(linked), "shared", "verify-web");
  writeFiles(shared, { "SKILL.md": SKILL[`${DIR}/SKILL.md`] });
  mkdirSync(join(linked, ".omp", "skills"), { recursive: true });
  symlinkSync(shared, join(linked, DIR));
  const l = commit(linked);
  expect(l.code).toBe(2);
  expect(l.stderr).toContain("symlink");

  for (const repo of [priv, noTitle, noDir, noSkill, linked]) expect(git(repo, "rev-list", "--count", "HEAD")).toBe("1");
});

test("state reports the mode, the directory, and whether the directory has uncommitted changes", () => {
  const repo = makeRepo({ ...SKILL, [`${DIR}/features/login.md`]: "# Login\n", "README.md": "# app\n" });
  writeFiles(repo, { "README.md": "# app, unrelated edit\n" });
  expect(state(repo)).toMatchObject({ mode: "standard", dir: DIR, dirty: false });

  writeFiles(repo, { [`${DIR}/features/login.md`]: "# Login, edited\n" });
  expect(state(repo).dirty).toBe(true);
  git(repo, "add", DIR);
  expect(state(repo).dirty).toBe(true);
  git(repo, "commit", "-q", "-m", "fix");
  expect(state(repo).dirty).toBe(false);

  rmSync(join(repo, DIR, "features", "login.md"));
  expect(state(repo).dirty).toBe(true);
  git(repo, "checkout", "--", DIR);
  writeFiles(repo, { [`${DIR}/features/new.md`]: "# New\n" });
  expect(state(repo).dirty).toBe(true);

  const priv = makeRepo();
  mkdirSync(join(priv, ".git", "vstack", "config"), { recursive: true });
  expect(state(priv).mode).toBe("private");
});

test("outside a git repo, state and commit exit 2", () => {
  const plain = join(dir, "plain");
  mkdirSync(plain, { recursive: true });
  expect(run(plain, "state", "--app", "web").code).toBe(2);
  expect(commit(plain).code).toBe(2);
});

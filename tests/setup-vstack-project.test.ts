// setup-vstack's project script run as a process over temp git repos (spec #63, Testing Decisions, Seam 1):
// the repo state the project section starts from, and the Standard-mode commit that holds only the setup paths.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ENV, git } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "setup-vstack", "scripts", "project.ts");
const CONFIG = ["docs/vstack/issue-tracker.md", "docs/vstack/triage-labels.md", "docs/vstack/domain.md"];
const BLOCK = "## vstack\n\n### Issue tracker\n\nGitHub. See `docs/vstack/issue-tracker.md`.\n";

let dir: string;
beforeAll(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "vstack-project-test-")));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function run(cwd: string, ...args: string[]) {
  const r = Bun.spawnSync([process.execPath, SCRIPT, ...args], { cwd, env: ENV, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}

function state(cwd: string) {
  const r = run(cwd, "state");
  if (r.code !== 0) throw new Error(`state exit ${r.code}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

function write(root: string, files: Record<string, string>) {
  for (const [p, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), content);
  }
}

let n = 0;
/** A repo with one commit holding `files`. */
function makeRepo(files: Record<string, string> = { "README.md": "# app\n" }): string {
  const repo = join(dir, `repo-${++n}`, "app");
  mkdirSync(repo, { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  write(repo, files);
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "init");
  return repo;
}

const configFiles = () => Object.fromEntries(CONFIG.map((p) => [p, `# ${p}\n`]));

test("a fresh repo has no mode, no block file, and its vstack root under the git common dir", () => {
  const repo = makeRepo();
  const s = state(repo);
  expect(s.root).toBe(repo);
  expect(s.common_dir).toBe(join(repo, ".git"));
  expect(s.vstack_root).toBe(join(repo, ".git", "vstack"));
  expect(s.mode).toBeNull();
  expect(s.block_file).toBeNull();
  expect(s.block_exists).toBe(false);
});

test("the block file is CLAUDE.md when it exists, else AGENTS.md, and an existing ## vstack block is found", () => {
  const both = makeRepo({ "CLAUDE.md": "# c\n", "AGENTS.md": "# a\n" });
  expect(state(both).block_file).toBe("CLAUDE.md");

  const agents = makeRepo({ "AGENTS.md": `# a\n\n${BLOCK}` });
  const s = state(agents);
  expect(s.block_file).toBe("AGENTS.md");
  expect(s.block_exists).toBe(true);
  expect(s.block_file_dirty).toBe(false);

  writeFileSync(join(agents, "AGENTS.md"), "# a, edited\n");
  expect(state(agents).block_file_dirty).toBe(true);
});

test("Private mode is on when <common>/vstack/config/ exists, seen from every worktree", () => {
  const repo = makeRepo();
  const wt = join(dirname(repo), "app-feature");
  git(repo, "worktree", "add", "-q", "-b", "feat", wt);
  mkdirSync(join(repo, ".git", "vstack", "config"), { recursive: true });

  const s = state(wt);
  expect(s.root).toBe(wt);
  expect(s.common_dir).toBe(join(repo, ".git"));
  expect(s.vstack_root).toBe(join(repo, ".git", "vstack"));
  expect(s.mode).toBe("private");
});

test("Standard mode is on when docs/vstack/ holds config", () => {
  const repo = makeRepo({ "docs/vstack/issue-tracker.md": "# GitHub\n" });
  expect(state(repo).mode).toBe("standard");
});

test("outside a git repo, state exits 2", () => {
  const plain = join(dir, "plain");
  mkdirSync(plain, { recursive: true });
  const r = run(plain, "state");
  expect(r.code).toBe(2);
  expect(r.stderr).toContain("git");
});

test("Standard commit holds only the three config files and the block file, with the given title", () => {
  const repo = makeRepo({ "README.md": "# app\n", "CLAUDE.md": "# notes\n", "src/a.ts": "a\n" });
  // Unrelated work in progress: a staged change, an unstaged change, and an untracked file.
  write(repo, { "src/a.ts": "a staged\n" });
  git(repo, "add", "src/a.ts");
  write(repo, { "README.md": "# app, unstaged\n", "notes.txt": "untracked\n" });
  // What the agent writes in Standard mode.
  write(repo, configFiles());
  write(repo, { "CLAUDE.md": `# notes\n\n${BLOCK}` });

  const r = run(repo, "commit", "--title", "chore: set up vstack config");
  expect(r.code).toBe(0);
  const out = JSON.parse(r.stdout);
  expect(out.commit).toBe(git(repo, "rev-parse", "HEAD"));
  expect(git(repo, "log", "-1", "--format=%s")).toBe("chore: set up vstack config");
  expect(git(repo, "show", "--name-only", "--format=", "HEAD").split("\n").sort()).toEqual(["CLAUDE.md", ...CONFIG].sort());
  // The unrelated work is where it was.
  expect(git(repo, "diff", "--cached", "--name-only")).toBe("src/a.ts");
  expect(git(repo, "diff", "--name-only")).toBe("README.md");
  expect(git(repo, "ls-files", "--others", "--exclude-standard")).toBe("notes.txt");
});

test("a re-run with nothing changed makes no commit", () => {
  const repo = makeRepo({ "AGENTS.md": "# a\n" });
  write(repo, configFiles());
  write(repo, { "AGENTS.md": `# a\n\n${BLOCK}` });
  expect(run(repo, "commit", "--title", "chore: set up vstack").code).toBe(0);
  const head = git(repo, "rev-parse", "HEAD");

  const again = run(repo, "commit", "--title", "chore: set up vstack");
  expect(again.code).toBe(0);
  expect(JSON.parse(again.stdout).commit).toBeNull();
  expect(git(repo, "rev-parse", "HEAD")).toBe(head);
});

test("commit refuses in Private mode, without a title, or with setup output missing", () => {
  const head = (repo: string) => git(repo, "rev-parse", "HEAD");

  const priv = makeRepo({ "CLAUDE.md": "# c\n" });
  write(priv, configFiles());
  write(priv, { "CLAUDE.md": `# c\n\n${BLOCK}` });
  mkdirSync(join(priv, ".git", "vstack", "config"), { recursive: true });
  const before = head(priv);
  const p = run(priv, "commit", "--title", "chore: set up vstack");
  expect(p.code).toBe(2);
  expect(p.stderr).toContain("Private");
  expect(head(priv)).toBe(before);

  const noTitle = makeRepo({ "CLAUDE.md": `# c\n\n${BLOCK}`, ...configFiles() });
  expect(run(noTitle, "commit").code).toBe(2);

  const noBlock = makeRepo({ "CLAUDE.md": "# c\n" });
  write(noBlock, configFiles());
  const b = run(noBlock, "commit", "--title", "chore: set up vstack");
  expect(b.code).toBe(2);
  expect(b.stderr).toContain("## vstack");

  const noLabels = makeRepo({ "CLAUDE.md": "# c\n" });
  write(noLabels, { ...configFiles(), "CLAUDE.md": `# c\n\n${BLOCK}` });
  rmSync(join(noLabels, "docs/vstack/triage-labels.md"));
  const l = run(noLabels, "commit", "--title", "chore: set up vstack");
  expect(l.code).toBe(2);
  expect(l.stderr).toContain("docs/vstack/triage-labels.md");
});

test("in a repo with no commits yet, the setup commit is the first commit and holds only the setup paths", () => {
  const repo = join(dir, "unborn", "app");
  mkdirSync(repo, { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  write(repo, { ...configFiles(), "AGENTS.md": BLOCK, "src/a.ts": "a\n" });
  const s = state(repo);
  expect(s.block_file).toBe("AGENTS.md");
  expect(s.block_file_dirty).toBe(true);

  const r = run(repo, "commit", "--title", "chore: set up vstack");
  expect(r.code).toBe(0);
  expect(git(repo, "show", "--name-only", "--format=", "HEAD").split("\n").sort()).toEqual(["AGENTS.md", ...CONFIG].sort());
  expect(git(repo, "ls-files", "--others", "--exclude-standard")).toBe("src/a.ts");
});

test("Private-mode config under the vstack root leaves the repo with nothing to commit", () => {
  const repo = makeRepo();
  const s = state(repo);
  write(s.vstack_root, {
    "config/issue-tracker.md": "# GitHub\n",
    "config/triage-labels.md": "# Labels\n",
    "config/domain.md": "# Domain\n",
  });
  expect(state(repo).mode).toBe("private");
  expect(git(repo, "status", "--porcelain")).toBe("");
  expect(readFileSync(join(repo, ".git", "vstack", "config", "domain.md"), "utf8")).toBe("# Domain\n");
});

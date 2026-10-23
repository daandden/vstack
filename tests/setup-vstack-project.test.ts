// setup-vstack's project script run as a process over temp git repos (spec #63, Testing Decisions, Seam 1):
// the repo state the project section starts from, and the Standard-mode commit that holds only the setup paths.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ENV, git } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "setup-vstack", "scripts", "project.ts");
const CONFIG = ["docs/vstack/issue-tracker.md", "docs/vstack/triage-labels.md", "docs/vstack/domain.md", "docs/vstack/code-host.md", "docs/vstack/ci.md"];
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

test("missing_config names each config file the mode's config directory lacks, so a re-run asks only those sections", () => {
  expect(state(makeRepo()).missing_config).toEqual(["issue-tracker.md", "code-host.md", "triage-labels.md", "domain.md", "ci.md"]);

  const older = makeRepo({
    "docs/vstack/issue-tracker.md": "# GitHub\n",
    "docs/vstack/triage-labels.md": "# Labels\n",
    "docs/vstack/domain.md": "# Domain\n",
  });
  expect(state(older).missing_config).toEqual(["code-host.md", "ci.md"]);

  // Private mode reads <vstack root>/config/, not docs/vstack/.
  const priv = makeRepo({ "docs/vstack/issue-tracker.md": "# tracked team config\n" });
  write(join(priv, ".git", "vstack"), { "config/code-host.md": "# GitHub\n", "config/domain.md": "# Domain\n" });
  expect(state(priv).missing_config).toEqual(["issue-tracker.md", "triage-labels.md", "ci.md"]);
});

test("a re-run with the other four config files reports only ci.md in either mode", () => {
  const files = Object.fromEntries(Object.entries(configFiles()).filter(([p]) => p !== "docs/vstack/ci.md"));
  const standard = makeRepo(files);
  expect(state(standard).missing_config).toEqual(["ci.md"]);

  const privateRepo = makeRepo();
  write(join(privateRepo, ".git", "vstack"), Object.fromEntries(
    Object.entries(files).map(([p, content]) => [p.replace("docs/vstack/", "config/"), content]),
  ));
  expect(state(privateRepo).missing_config).toEqual(["ci.md"]);
});

test("missing_default_end_state is true only when code-host.md lacks a valid default End state line, in either mode", () => {
  const codeHost = (facts: string) => `# Code host: GitHub\n\n- Host: GitHub (\`github.com\`)\n- Repo: \`o/r\`\n${facts}\n## Operations\n`;
  const cases: [string, Record<string, string>, boolean][] = [
    ["no line", { "code-host.md": codeHost("") }, true],
    ["a valid line", { "code-host.md": codeHost("- Default End state: merge-ready\n") }, false],
    ["an invalid value", { "code-host.md": codeHost("- Default End state: deploy\n") }, true],
    ["no code-host.md", { "domain.md": "# Domain\n" }, false],
  ];
  for (const [name, files, expected] of cases) {
    const standard = makeRepo(Object.fromEntries(Object.entries(files).map(([f, c]) => [`docs/vstack/${f}`, c])));
    expect([name, "standard", state(standard).missing_default_end_state]).toEqual([name, "standard", expected]);

    const privateRepo = makeRepo();
    write(join(privateRepo, ".git", "vstack"), Object.fromEntries(Object.entries(files).map(([f, c]) => [`config/${f}`, c])));
    expect([name, "private", state(privateRepo).missing_default_end_state]).toEqual([name, "private", expected]);
  }
});

test("Standard setup refuses to commit without ci.md and preserves the index and HEAD", () => {
  const repo = makeRepo({ ...configFiles(), "CLAUDE.md": BLOCK, "src/a.ts": "original\n" });
  const before = git(repo, "rev-parse", "HEAD");
  rmSync(join(repo, "docs/vstack/ci.md"));
  write(repo, { "src/a.ts": "staged\n" });
  git(repo, "add", "src/a.ts");

  const result = run(repo, "commit", "--title", "chore: set up vstack config");
  expect(result.code).toBe(2);
  expect(result.stderr).toContain("docs/vstack/ci.md is missing");
  expect(git(repo, "rev-parse", "HEAD")).toBe(before);
  expect(git(repo, "diff", "--cached", "--name-only")).toBe("src/a.ts");
});

test("outside a git repo, state exits 2", () => {
  const plain = join(dir, "plain");
  mkdirSync(plain, { recursive: true });
  const r = run(plain, "state");
  expect(r.code).toBe(2);
  expect(r.stderr).toContain("git");
});

test("Standard commit holds only the five config files and the block file, with the given title", () => {
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

  const noHost = makeRepo({ "CLAUDE.md": "# c\n" });
  write(noHost, { ...configFiles(), "CLAUDE.md": `# c\n\n${BLOCK}` });
  rmSync(join(noHost, "docs/vstack/code-host.md"));
  const h = run(noHost, "commit", "--title", "chore: set up vstack");
  expect(h.code).toBe(2);
  expect(h.stderr).toContain("docs/vstack/code-host.md");
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

const MIGRATE = join(import.meta.dir, "..", "plugin", "skills", "setup-vstack", "scripts", "migrate.ts");
const migrationPaths = (paths: string[]) => paths.flatMap((p) => ["--migration-path", p]);

test("Migration leaves ci.md to setup, then one commit holds both outputs and nothing else", () => {
  const repo = makeRepo({
    "AGENTS.md": "# a\n\n## Agent skills\n\nSee docs/agents/issue-tracker.md\n",
    "docs/agents/issue-tracker.md": "# GitHub\n",
    "docs/agents/triage-labels.md": "# Labels\n",
    "docs/agents/domain.md": "Read CONTEXT.md\n",
    "CONTEXT.md": "# Domain\n",
    ".omp/rules/setup.md": "Run /setup-matt-pocock-skills\n",
    "src/a.ts": "a\n",
  });
  git(repo, "remote", "add", "origin", "git@github.com:acme/app.git");
  write(repo, { "src/a.ts": "a staged\n" });
  git(repo, "add", "src/a.ts");

  const plan = Bun.spawnSync([process.execPath, MIGRATE, "plan"], { cwd: repo, env: ENV, stdout: "pipe" });
  const planPath = join(dirname(repo), "plan.json");
  writeFileSync(planPath, plan.stdout.toString());
  const applied = Bun.spawnSync([process.execPath, MIGRATE, "apply", "--plan", planPath], { cwd: repo, env: ENV, stdout: "pipe" });
  expect(applied.exitCode).toBe(0);
  const report = JSON.parse(applied.stdout.toString());
  const s = state(repo);
  expect(s.missing_config).toEqual(["ci.md"]);
  expect(s.block_exists).toBe(true);
  write(repo, { "docs/vstack/ci.md": "# CI service: GitHub Actions\n" });
  expect(state(repo).missing_config).toEqual([]);

  const r = run(repo, "commit", "--title", "chore: set up vstack", ...migrationPaths(report.paths));
  expect(r.code).toBe(0);
  expect(git(repo, "show", "--no-renames", "--name-only", "--format=", "HEAD").split("\n").sort()).toEqual([
    ".omp/rules/setup.md", "AGENTS.md", "CONTEXT.md", "GLOSSARY.md",
    "docs/agents/domain.md", "docs/agents/issue-tracker.md", "docs/agents/triage-labels.md",
    ...CONFIG,
  ].sort());
  expect(git(repo, "ls-tree", "-r", "--name-only", "HEAD", "docs/agents")).toBe("");
  expect(git(repo, "status", "--porcelain")).toBe("M  src/a.ts");
});

test("a commit whose only changes are Migration paths still commits when the setup output is unchanged", () => {
  const repo = makeRepo({ "AGENTS.md": `# a\n\n${BLOCK}`, ...configFiles(), "CONTEXT.md": "# Domain\n" });
  git(repo, "mv", "CONTEXT.md", "GLOSSARY.md");
  const r = run(repo, "commit", "--title", "chore: migrate to vstack", ...migrationPaths(["CONTEXT.md", "GLOSSARY.md"]));
  expect(r.code).toBe(0);
  expect(JSON.parse(r.stdout).commit).toBe(git(repo, "rev-parse", "HEAD"));
  expect(git(repo, "show", "--no-renames", "--name-only", "--format=", "HEAD").split("\n").sort()).toEqual(["CONTEXT.md", "GLOSSARY.md"]);
});

test("commit refuses a Migration path outside the repo", () => {
  const repo = makeRepo({ "AGENTS.md": `# a\n\n${BLOCK}`, ...configFiles() });
  const head = git(repo, "rev-parse", "HEAD");
  for (const outside of ["../elsewhere.md", join(dir, "elsewhere.md"), ".git/config"]) {
    const r = run(repo, "commit", "--title", "chore: set up vstack", ...migrationPaths([outside]));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain(outside);
  }
  expect(git(repo, "rev-parse", "HEAD")).toBe(head);
});

test("Migration paths are literal: a bracketed directory name commits no other staged path", () => {
  const repo = makeRepo({ "AGENTS.md": `# a\n\n${BLOCK}`, ...configFiles(), "packages/[slug]/CONTEXT.md": "# Domain\n", "packages/s/GLOSSARY.md": "s\n" });
  git(repo, "mv", "packages/[slug]/CONTEXT.md", "packages/[slug]/GLOSSARY.md");
  write(repo, { "packages/s/GLOSSARY.md": "s staged\n" });
  git(repo, "add", "packages/s/GLOSSARY.md");
  const r = run(repo, "commit", "--title", "chore: migrate", ...migrationPaths(["packages/[slug]/CONTEXT.md", "packages/[slug]/GLOSSARY.md"]));
  expect(r.code).toBe(0);
  expect(git(repo, "show", "--no-renames", "--name-only", "--format=", "HEAD").split("\n").sort()).toEqual(["packages/[slug]/CONTEXT.md", "packages/[slug]/GLOSSARY.md"]);
  expect(git(repo, "status", "--porcelain")).toBe("M  packages/s/GLOSSARY.md");
});

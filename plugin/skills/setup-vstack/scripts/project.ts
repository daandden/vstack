// setup-vstack's project section helpers (spec #63 "setup-vstack"; ADR 0006).
//
//   bun project.ts state                 JSON facts the project section starts from
//   bun project.ts commit --title <t>    Standard mode: commit the setup output, and only it, on the current branch
//
// Run from inside the repo. Exit codes: 0 done; 2 usage error, not in a git repo, or a refused commit.

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";

const CONFIG = ["docs/vstack/issue-tracker.md", "docs/vstack/triage-labels.md", "docs/vstack/domain.md"];
const BLOCK_FILES = ["CLAUDE.md", "AGENTS.md"];
const BLOCK_HEADING = "## vstack";

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

function git(cwd: string, ...args: string[]): { code: number; stdout: string; stderr: string } {
  const r = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, stdout: r.stdout.toString().trim(), stderr: r.stderr.toString().trim() };
}

function gitOrDie(cwd: string, ...args: string[]): string {
  const r = git(cwd, ...args);
  if (r.code !== 0) fail(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
}

const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();

function repoState(cwd: string) {
  const top = git(cwd, "rev-parse", "--show-toplevel");
  if (top.code !== 0) fail("not inside a git repository: the project section runs inside a git checkout");
  const root = realpathSync(top.stdout);
  const commonDir = realpathSync(gitOrDie(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"));
  const vstackRoot = join(commonDir, "vstack");

  const mode = isDir(join(vstackRoot, "config"))
    ? "private"
    : CONFIG.some((p) => existsSync(join(root, p)))
      ? "standard"
      : null;

  const blockFile = BLOCK_FILES.find((f) => existsSync(join(root, f))) ?? null;
  const blockExists = blockFile !== null && hasBlock(readFileSync(join(root, blockFile), "utf8"));
  // Uncommitted edits in the block file would go into the setup commit with the block.
  const blockFileDirty = blockFile !== null && git(root, "diff", "--quiet", "HEAD", "--", blockFile).code !== 0;

  return {
    root,
    common_dir: commonDir,
    vstack_root: vstackRoot,
    mode,
    block_file: blockFile,
    block_exists: blockExists,
    block_file_dirty: blockFileDirty,
  };
}

function hasBlock(text: string): boolean {
  return text.split("\n").some((line) => line.trimEnd() === BLOCK_HEADING);
}

function commit(cwd: string, title: string | undefined) {
  if (!title?.trim()) fail("commit needs --title <commit title>");
  const s = repoState(cwd);
  if (s.mode === "private") fail(`refusing to commit: Private mode is on (${s.vstack_root}/config/ exists), and Private mode commits nothing`);

  for (const p of CONFIG) if (!existsSync(join(s.root, p))) fail(`refusing to commit: ${p} is missing; Standard mode writes all three config files`);
  if (!s.block_file || !s.block_exists) fail(`refusing to commit: no ${BLOCK_HEADING} block in CLAUDE.md or AGENTS.md`);

  const paths = [...CONFIG, s.block_file];
  gitOrDie(s.root, "add", "--", ...paths);
  if (git(s.root, "diff", "--cached", "--quiet", "HEAD", "--", ...paths).code === 0) {
    console.log(JSON.stringify({ commit: null, title, paths, note: "nothing changed since the last setup commit" }));
    return;
  }
  // A pathspec commit takes only these paths and leaves everything else in the index as it was.
  gitOrDie(s.root, "commit", "-q", "-m", title!, "--only", "--", ...paths);
  console.log(JSON.stringify({ commit: gitOrDie(s.root, "rev-parse", "HEAD"), title, paths }));
}

function main(argv: string[]) {
  const cwd = process.cwd();
  if (argv[0] === "state" && argv.length === 1) {
    console.log(JSON.stringify(repoState(cwd), null, 2));
    return;
  }
  if (argv[0] === "commit") {
    const i = argv.indexOf("--title");
    commit(cwd, i === -1 ? undefined : argv[i + 1]);
    return;
  }
  fail("Usage: project.ts state\n       project.ts commit --title <commit title>");
}

main(process.argv.slice(2));

//   bun project.ts state                 JSON facts the project section starts from, with the config files still missing
//   bun project.ts commit --title <t> [--migration-path <repo path>...]
//                                        Standard mode: commit the setup output and this run's Migration paths, and only
//                                        them, on the current branch
//
// Run from inside the repo. Exit codes: 0 done; 2 usage error, not in a git repo, or a refused commit.

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const CONFIG_FILES = ["issue-tracker.md", "code-host.md", "triage-labels.md", "domain.md", "ci.md"];
const CONFIG = CONFIG_FILES.map((f) => `docs/vstack/${f}`);
const BLOCK_FILES = ["CLAUDE.md", "AGENTS.md"];
const BLOCK_HEADING = "## vstack";

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

function git(cwd: string, ...args: string[]): { code: number; stdout: string; stderr: string } {
  // Paths are file names, never patterns: a Migration path such as `packages/[slug]/` must not match other files.
  const r = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, GIT_LITERAL_PATHSPECS: "1" } });
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

  const configDir = mode === "private" ? join(vstackRoot, "config") : join(root, "docs", "vstack");
  const missingConfig = CONFIG_FILES.filter((f) => !existsSync(join(configDir, f)));

  return {
    root,
    common_dir: commonDir,
    vstack_root: vstackRoot,
    mode,
    missing_config: missingConfig,
    block_file: blockFile,
    block_exists: blockExists,
    block_file_dirty: blockFileDirty,
  };
}

function hasBlock(text: string): boolean {
  return text.split("\n").some((line) => line.trimEnd() === BLOCK_HEADING);
}

function commit(cwd: string, title: string | undefined, migrationPaths: string[]) {
  if (!title?.trim()) fail("commit needs --title <commit title>");
  const s = repoState(cwd);
  if (s.mode === "private") fail(`refusing to commit: Private mode is on (${s.vstack_root}/config/ exists), and Private mode commits nothing`);

  for (const p of CONFIG) if (!existsSync(join(s.root, p))) fail(`refusing to commit: ${p} is missing; Standard mode writes all ${CONFIG.length} config files`);
  if (!s.block_file || !s.block_exists) fail(`refusing to commit: no ${BLOCK_HEADING} block in CLAUDE.md or AGENTS.md`);

  const migrated = migrationPaths.map((p) => {
    const rel = relative(s.root, resolve(s.root, p));
    if (!rel || rel === ".." || rel.startsWith("../") || rel.startsWith("/") || rel === ".git" || rel.startsWith(".git/")) {
      fail(`refusing to commit: Migration path ${p} is outside the repo`);
    }
    return rel;
  });
  const onDiskOrIndexed = (p: string) => existsSync(join(s.root, p)) || git(s.root, "ls-files", "--", p).stdout !== "";
  const inHead = (p: string) => git(s.root, "ls-tree", "--name-only", "HEAD", "--", p).stdout !== "";
  const all = [...new Set([...CONFIG, s.block_file, ...migrated])];
  gitOrDie(s.root, "add", "-A", "--", ...all.filter(onDiskOrIndexed));
  const paths = all.filter((p) => onDiskOrIndexed(p) || inHead(p));
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
    let title: string | undefined;
    const migrationPaths: string[] = [];
    for (let i = 1; i < argv.length; i += 2) {
      const value = argv[i + 1];
      if (value === undefined) fail(`${argv[i]} needs a value`);
      if (argv[i] === "--title") title = value;
      else if (argv[i] === "--migration-path") migrationPaths.push(value);
      else fail(`unknown option ${argv[i]}`);
    }
    commit(cwd, title, migrationPaths);
    return;
  }
  fail("Usage: project.ts state\n       project.ts commit --title <commit title> [--migration-path <repo path>...]");
}

main(process.argv.slice(2));

// The Standard-mode commit of a Verify skill, for setup-app-verification and maintain-app-verification (ADR 0009).
//
//   bun commit.ts state --app <app>                  JSON facts: mode, the Verify skill dir, and whether it has uncommitted changes
//   bun commit.ts commit --app <app> --title <t>     Standard mode: commit .omp/skills/verify-<app>/, and only it, on the current branch
//
// Run from inside the repo. Exit codes: 0 done; 2 usage error, not in a git repo, or a refused commit.

import { existsSync, lstatSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";

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

function repoState(cwd: string, app: string) {
  const top = git(cwd, "rev-parse", "--show-toplevel");
  if (top.code !== 0) fail("not inside a git repository: run this inside the app's git checkout");
  const root = realpathSync(top.stdout);
  const commonDir = realpathSync(gitOrDie(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"));
  const vstackRoot = join(commonDir, "vstack");
  const mode = isDir(join(vstackRoot, "config")) ? "private" : "standard";
  const dir = `.omp/skills/verify-${app}`;
  // Staged, unstaged, deleted, and untracked files all count: each would go into the commit.
  const dirty = git(root, "status", "--porcelain", "--untracked-files=all", "--", dir).stdout !== "";
  return { root, vstack_root: vstackRoot, mode, dir, dirty };
}

function commit(cwd: string, app: string, title: string | undefined) {
  if (!title?.trim()) fail("commit needs --title <commit title>");
  const s = repoState(cwd, app);
  if (s.mode === "private") fail(`refusing to commit: Private mode is on (${s.vstack_root}/config/ exists), and Private mode commits nothing`);

  const abs = join(s.root, s.dir);
  const entry = lstatSync(abs, { throwIfNoEntry: false });
  if (!entry) fail(`refusing to commit: ${s.dir} does not exist`);
  if (entry.isSymbolicLink()) fail(`refusing to commit: ${s.dir} is a symlink, a Private-mode link that is never committed`);
  if (!entry.isDirectory()) fail(`refusing to commit: ${s.dir} is not a directory`);
  if (!existsSync(join(abs, "SKILL.md"))) fail(`refusing to commit: ${s.dir}/SKILL.md is missing`);

  // -A also stages deletions inside the directory.
  gitOrDie(s.root, "add", "-A", "--", s.dir);
  if (git(s.root, "diff", "--cached", "--quiet", "HEAD", "--", s.dir).code === 0) {
    console.log(JSON.stringify({ commit: null, title, dir: s.dir, note: "nothing changed in the Verify skill since its last commit" }));
    return;
  }
  // A pathspec commit takes only this directory and leaves everything else in the index as it was.
  gitOrDie(s.root, "commit", "-q", "-m", title!, "--only", "--", s.dir);
  console.log(JSON.stringify({ commit: gitOrDie(s.root, "rev-parse", "HEAD"), title, dir: s.dir }));
}

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

function main(argv: string[]) {
  const usage = "Usage: commit.ts state --app <app>\n       commit.ts commit --app <app> --title <commit title>";
  const app = flag(argv, "--app");
  if (!app || !/^[A-Za-z0-9._-]+$/.test(app) || app.startsWith(".")) fail(`${usage}\n<app> is the name after verify- in .omp/skills/verify-<app>`);
  const cwd = process.cwd();
  if (argv[0] === "state") {
    console.log(JSON.stringify(repoState(cwd, app), null, 2));
    return;
  }
  if (argv[0] === "commit") {
    commit(cwd, app, flag(argv, "--title"));
    return;
  }
  fail(usage);
}

main(process.argv.slice(2));

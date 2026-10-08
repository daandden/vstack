// Worktrees through omp (spec #63 "Private mode, worktrees, and Scratch"; #56): skill://vstack-worktree steps
// 1-6 in Bun, for scripts. `omp` is a parameter, so tests pass a stand-in instead of the real CLI.
//
//   worktreeBase(omp)        step 1: $OMP_WORKTREE_DIR, else `omp config get worktree.base`, else ~/.omp/wt
//   mainCheckoutName(root)   step 2: the basename of the main checkout's root, for <base>/vstack-<repo>-<purpose>
//   addWorktree(...)         steps 3-4: `omp wt add -b <branch> <path> <ref>` (never -q), cloned or plain
//   ensureDeps(path)         step 5 for work that continues on a plain checkout: install deps when missing
//   removeWorktree(...)      step 6: `git worktree remove --force`, and `git branch -D` for a branch this run made

import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import { existsSync } from "node:fs";

export class WorktreeError extends Error {}

function run(cmd: string[], cwd: string) {
  let r;
  try {
    r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  } catch (e) {
    throw new WorktreeError(`cannot run ${cmd[0]}: ${(e as Error).message}`);
  }
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString().trim() };
}

const expandHome = (p: string) => (p === "~" ? homedir() : p.startsWith("~/") ? join(homedir(), p.slice(2)) : p);

/** Step 1. omp ignores a relative `worktree.base` and a relative `$OMP_WORKTREE_DIR`, and so does this. */
export function worktreeBase(omp: string, cwd: string): string {
  const env = process.env.OMP_WORKTREE_DIR;
  if (env && isAbsolute(env)) return env;
  const r = run([omp, "config", "get", "worktree.base"], cwd);
  const value = r.code === 0 ? expandHome(r.out.trim()) : "";
  if (value && value !== "(not set)" && isAbsolute(value)) return value;
  return join(homedir(), ".omp", "wt");
}

/** Step 2: the basename of the main checkout's root, the same from any of its worktrees. */
export function mainCheckoutName(root: string): string {
  const r = run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], root);
  if (r.code !== 0) throw new WorktreeError(`${root} is not a git checkout: ${r.err}`);
  const common = r.out.trim();
  return basename(common) === ".git" ? basename(dirname(common)) : basename(common).replace(/\.git$/, "");
}

export interface AddedWorktree {
  path: string;
  branch: string;
  /** Whether omp cloned the checkout (stdout has `Cloned from … via`); false means a plain checkout of tracked files. */
  cloned: boolean;
}

/** Steps 3-4: a new branch from `ref` in a new worktree at `path`, created by `omp wt add` from `root`. */
export function addWorktree(opts: { omp: string; root: string; branch: string; path: string; ref: string }): AddedWorktree {
  if (existsSync(opts.path)) throw new WorktreeError(`${opts.path} already exists; remove it with: git worktree remove --force ${opts.path}`);
  const r = run([opts.omp, "wt", "add", "-b", opts.branch, opts.path, opts.ref], opts.root);
  if (r.code !== 0 || !existsSync(opts.path)) {
    throw new WorktreeError(`omp wt add -b ${opts.branch} ${opts.path} ${opts.ref} failed (exit ${r.code}): ${r.err || r.out.trim()}`);
  }
  return { path: opts.path, branch: opts.branch, cloned: /^Cloned from .+ via \S+/m.test(r.out) };
}

/** How the worktree got its deps: carried by the clone or already there, installed now, or not needed. */
export type Deps = "present" | "installed" | "none";

/**
 * Step 5 for a site that continues on a plain checkout: with a root `package.json` and no `node_modules`,
 * run `bun install --frozen-lockfile` with the Bun running this script.
 */
export function ensureDeps(path: string): Deps {
  if (!existsSync(join(path, "package.json"))) return "none";
  if (existsSync(join(path, "node_modules"))) return "present";
  const r = run([process.execPath, "install", "--frozen-lockfile"], path);
  if (r.code !== 0) throw new WorktreeError(`bun install --frozen-lockfile failed in ${path}: ${r.err || r.out.trim()}`);
  return "installed";
}

/** Step 6: removes the worktree and the branch this run created. Best effort; returns what failed. */
export function removeWorktree(root: string, wt: { path: string; branch: string }): string[] {
  const failed: string[] = [];
  const rm = run(["git", "worktree", "remove", "--force", wt.path], root);
  if (rm.code !== 0) failed.push(`git worktree remove --force ${wt.path}: ${rm.err}`);
  const br = run(["git", "branch", "-D", wt.branch], root);
  if (br.code !== 0) failed.push(`git branch -D ${wt.branch}: ${br.err}`);
  return failed;
}

// Layout: <home>/.vstack/tmp/<repo-key>/<kind>/<entry>.

import { createHash } from "node:crypto";
import { closeSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

/** The key for Scratch made outside any git repo. */
export const GLOBAL_KEY = "_global";

/** A kind is one lowercase path segment, such as `explain` or `blast-radius`. */
export const KIND = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `<home>/.vstack/tmp`, the only directory clean.ts deletes in. */
export const scratchRoot = (home: string): string => join(home, ".vstack", "tmp");

function git(cwd: string, args: string[], outsideRepo = false): string | undefined {
  const dir = mkdtempSync(join(tmpdir(), "vstack-repo-"));
  let stdout = -1, stderr = -1;
  try {
    // Bun's synchronous pipe capture can lose successful git output under concurrent CLI load.
    stdout = openSync(join(dir, "stdout"), "w");
    stderr = openSync(join(dir, "stderr"), "w");
    const r = Bun.spawnSync(["git", ...args], { cwd, env: { ...process.env, LC_ALL: "C" }, stdin: "ignore", stdout, stderr });
    const out = readFileSync(join(dir, "stdout"), "utf8");
    const error = readFileSync(join(dir, "stderr"), "utf8").trim();
    if (r.exitCode === 0 && out.trim()) return out;
    if (outsideRepo && r.exitCode === 128 && /^fatal: not a git repository\b/.test(error)) return undefined;
    throw new Error(`git ${args.join(" ")} in ${cwd} failed (${r.exitCode}): ${error || "empty repository identity output"}`);
  } finally {
    if (stdout >= 0) closeSync(stdout);
    if (stderr >= 0) closeSync(stderr);
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * `<main checkout basename>-<first 6 hex chars of sha256(absolute git common dir)>`, or `_global` outside a repo.
 * Every worktree of a repo shares the common dir, so they share the key.
 */
export function repoKey(cwd: string): string {
  const out = git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"], true);
  if (out === undefined) return GLOBAL_KEY;
  const common = realpathSync(out.trim());
  // The first entry of `git worktree list` is the main checkout (or the bare repo dir).
  const first = git(cwd, ["worktree", "list", "--porcelain", "-z"])!.split("\0")[0];
  if (!first?.startsWith("worktree ")) throw new Error(`git worktree list in ${cwd} returned no main checkout`);
  const main = first.slice("worktree ".length);
  const hash = createHash("sha256").update(common).digest("hex").slice(0, 6);
  return `${basename(main)}-${hash}`;
}

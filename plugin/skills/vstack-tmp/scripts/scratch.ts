// Layout: <home>/.vstack/tmp/<repo-key>/<kind>/<entry>.

import { createHash } from "node:crypto";
import { closeSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";

/** The key for Scratch made outside any git repo. */
export const GLOBAL_KEY = "_global";

/** A kind is one lowercase path segment, such as `explain` or `blast-radius`. */
export const KIND = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `<home>/.vstack/tmp`, the only directory clean.ts deletes in. */
export const scratchRoot = (home: string): string => join(home, ".vstack", "tmp");

function git(cwd: string, args: string[]): string | undefined {
  const folder = mkdtempSync(join(tmpdir(), "vstack-repo-key-"));
  try {
    const output = join(folder, "stdout");
    const fd = openSync(output, "w", 0o600);
    try {
      // Concurrent CLI processes can receive empty successful Git output through Bun's synchronous pipes.
      let r: ReturnType<typeof Bun.spawnSync>;
      try {
        r = Bun.spawnSync(["git", ...args], { cwd, stdout: fd, stderr: "ignore" });
      } catch {
        return undefined;
      }
      return r.exitCode === 0 ? readFileSync(output, "utf8") : undefined;
    } finally {
      closeSync(fd);
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

/**
 * `<main checkout basename>-<first 6 hex chars of sha256(absolute git common dir)>`, or `_global` outside a repo.
 * Every worktree of a repo shares the common dir, so they share the key.
 */
export function repoKey(cwd: string): string {
  const out = git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (out === undefined) return GLOBAL_KEY;
  const common = realpathSync(out.trim());
  // The first entry of `git worktree list` is the main checkout (or the bare repo dir).
  const first = git(cwd, ["worktree", "list", "--porcelain", "-z"])?.split("\0")[0];
  const main = first?.startsWith("worktree ") ? first.slice("worktree ".length) : basename(common) === ".git" ? dirname(common) : common;
  const hash = createHash("sha256").update(common).digest("hex").slice(0, 6);
  return `${basename(main)}-${hash}`;
}

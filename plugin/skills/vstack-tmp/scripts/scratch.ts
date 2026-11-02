// Layout: <home>/.vstack/tmp/<repo-key>/<kind>/<entry>.

import { createHash } from "node:crypto";
import { closeSync, fstatSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join } from "node:path";

/** The key for Scratch made outside any git repo. */
export const GLOBAL_KEY = "_global";

/** A kind is one lowercase path segment, such as `explain` or `blast-radius`. */
export const KIND = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `<home>/.vstack/tmp`, the only directory clean.ts deletes in. */
export const scratchRoot = (home: string): string => join(home, ".vstack", "tmp");

function git(cwd: string, args: string[], allowNonRepo = false): string | undefined {
  const temporary = mkdtempSync(join(tmpdir(), "vstack-git-"));
  try {
    const stdout = join(temporary, "stdout");
    const stderr = join(temporary, "stderr");
    const outFd = openSync(stdout, "wx", 0o600);
    try {
      const errFd = openSync(stderr, "wx", 0o600);
      try {
        const r = Bun.spawnSync(["git", ...args], { cwd, env: { ...process.env, LC_ALL: "C" }, stdout: outFd, stderr: errFd });
        if (r.exitCode === 0 && !r.signalCode) return readFileSync(stdout, "utf8");
        const diagnostic = readFileSync(stderr, "utf8");
        if (allowNonRepo && r.exitCode === 128 && !r.signalCode && fstatSync(outFd).size === 0 &&
            /^fatal: not a git repository \(or any (?:of the parent directories|parent up to mount point [^\n]*)\)(?:: \.git)?\n/.test(diagnostic)) return undefined;
        throw new Error(`Cannot determine project identity: git ${args.join(" ")} failed (${r.signalCode ?? r.exitCode}): ${diagnostic.trim()}`);
      } finally {
        closeSync(errFd);
      }
    } finally {
      closeSync(outFd);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

/**
 * `<main checkout basename>-<first 6 hex chars of sha256(absolute git common dir)>`, or `_global` outside a repo.
 * Every worktree of a repo shares the common dir, so they share the key.
 */
export function repoKey(cwd: string): string {
  const out = git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"], true);
  if (out === undefined) return GLOBAL_KEY;
  const commonPath = out.replace(/\r?\n$/, "");
  if (!isAbsolute(commonPath)) throw new Error("Cannot determine project identity: Git returned no absolute common directory");
  const common = realpathSync(commonPath);
  // The first entry of `git worktree list` is the main checkout (or the bare repo dir).
  const worktrees = git(cwd, ["worktree", "list", "--porcelain", "-z"])!;
  const end = worktrees.indexOf("\0");
  const main = worktrees.startsWith("worktree ") ? worktrees.slice("worktree ".length, end < 0 ? undefined : end) : "";
  if (!isAbsolute(main)) throw new Error("Cannot determine project identity: Git returned no absolute main checkout");
  const hash = createHash("sha256").update(common).digest("hex").slice(0, 6);
  return `${basename(main)}-${hash}`;
}

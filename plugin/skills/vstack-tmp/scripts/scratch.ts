// Ordinary writes use <home>/.vstack/tmp/<repo-key>/<kind>/<session-id>/.

import { createHash } from "node:crypto";
import { closeSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join } from "node:path";

/** The key for Scratch made outside any git repo. */
export const GLOBAL_KEY = "_global";

/** A kind is one lowercase path segment, such as `explain` or `blast-radius`. */
export const KIND = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const TICKETS_KIND = "to-tickets";
export const SESSION_MARK = ".vstack-scratch-session";

export function isScratchSessionId(id: string | undefined): id is string {
  return id?.length === 36 && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id);
}

export function readScratchSession(path: string, entry = lstatSync(path, { throwIfNoEntry: false })): string | undefined {
  if (!entry?.isDirectory()) return undefined;
  const id = basename(path);
  if (!isScratchSessionId(id)) return undefined;
  const mark = join(path, SESSION_MARK);
  const stat = lstatSync(mark, { throwIfNoEntry: false });
  if (stat?.isFile() && stat.size === id.length + 1 && readFileSync(mark, "utf8") === `${id}\n`) return id;
}

/** Return the session folder, or undefined when an existing entry has no valid mark. */
export function createScratchSession(scratchDir: string, kind: string, id: string): string | undefined {
  if (!KIND.test(kind) || !isScratchSessionId(id)) throw new Error("Invalid Scratch kind or session id");
  const parent = join(scratchDir, kind);
  const dir = join(parent, id);
  mkdirSync(parent, { recursive: true });
  try {
    mkdirSync(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return readScratchSession(dir) === id ? dir : undefined;
  }
  try {
    writeFileSync(join(dir, SESSION_MARK), `${id}\n`, { flag: "wx" });
  } catch (error) {
    try { rmdirSync(dir); } catch { /* Leave any existing contents untouched. */ }
    throw error;
  }
  return dir;
}

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
        const r = Bun.spawnSync(["git", ...args], { cwd, env: { ...process.env, LC_ALL: "C" }, stdin: "ignore", stdout: outFd, stderr: errFd });
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

/** The owning project's real Git common directory, shared by its worktrees. */
export function projectCommonDir(cwd: string): string | undefined {
  const out = git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"], true);
  if (out === undefined) return undefined;
  const commonPath = out.replace(/\r?\n$/, "");
  if (!isAbsolute(commonPath)) throw new Error("Cannot determine project identity: Git returned no absolute common directory");
  return realpathSync(commonPath);
}

/**
 * `<main checkout basename>-<first 6 hex chars of sha256(absolute git common dir)>`, or `_global` outside a repo.
 * Every worktree of a repo shares the common dir, so they share the key.
 */
export function repoKey(cwd: string): string {
  const common = projectCommonDir(cwd);
  if (common === undefined) return GLOBAL_KEY;
  // The first entry of `git worktree list` is the main checkout (or the bare repo dir).
  const worktrees = git(cwd, ["worktree", "list", "--porcelain", "-z"])!;
  const end = worktrees.indexOf("\0");
  const main = worktrees.startsWith("worktree ") ? worktrees.slice("worktree ".length, end < 0 ? undefined : end) : "";
  if (!isAbsolute(main)) throw new Error("Cannot determine project identity: Git returned no absolute main checkout");
  const hash = createHash("sha256").update(common).digest("hex").slice(0, 6);
  return `${basename(main)}-${hash}`;
}

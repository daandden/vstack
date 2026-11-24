import { createHash } from "node:crypto";
import { closeSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { dlopen } from "bun:ffi";

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

function publishScratchSession(source: string, target: string): boolean {
  if (process.platform === "darwin") {
    const RENAME_EXCL = 4;
    const lib = dlopen("/usr/lib/libSystem.dylib", { renamex_np: { args: ["ptr", "ptr", "u32"], returns: "i32" } });
    try {
      return lib.symbols.renamex_np(Buffer.from(`${source}\0`), Buffer.from(`${target}\0`), RENAME_EXCL) === 0;
    } finally { lib.close(); }
  }
  if (process.platform === "linux") {
    const AT_FDCWD = -100, RENAME_NOREPLACE = 1;
    const lib = dlopen("libc.so.6", { renameat2: { args: ["i32", "ptr", "i32", "ptr", "u32"], returns: "i32" } });
    try {
      return lib.symbols.renameat2(AT_FDCWD, Buffer.from(`${source}\0`), AT_FDCWD, Buffer.from(`${target}\0`), RENAME_NOREPLACE) === 0;
    } finally { lib.close(); }
  }
  if (process.platform === "win32") {
    const lib = dlopen("kernel32.dll", { MoveFileW: { args: ["ptr", "ptr"], returns: "i32" } });
    try {
      return lib.symbols.MoveFileW(Buffer.from(`${source}\0`, "utf16le"), Buffer.from(`${target}\0`, "utf16le")) !== 0;
    } finally { lib.close(); }
  }
  throw new Error(`Cannot publish a Scratch session folder without atomic no-replace rename on ${process.platform}`);
}

/** Return the session folder, or undefined when an existing entry has no valid mark. */
export function createScratchSession(scratchDir: string, kind: string, id: string): string | undefined {
  if (!KIND.test(kind) || !isScratchSessionId(id)) throw new Error("Invalid Scratch kind or session id");
  const parent = join(scratchDir, kind);
  const dir = join(parent, id);
  const existing = lstatSync(dir, { throwIfNoEntry: false });
  if (existing) return readScratchSession(dir, existing) === id ? dir : undefined;
  mkdirSync(parent, { recursive: true });
  const pending = mkdtempSync(join(parent, ".vstack-scratch-"));
  let published = false;
  try {
    writeFileSync(join(pending, SESSION_MARK), `${id}\n`, { flag: "wx" });
    published = publishScratchSession(pending, dir);
    if (published) return dir;
    const winner = lstatSync(dir, { throwIfNoEntry: false });
    if (!winner) throw new Error(`Could not publish Scratch session folder without replacing an existing entry: ${dir}`);
    return readScratchSession(dir, winner) === id ? dir : undefined;
  } finally {
    if (!published) rmSync(pending, { recursive: true, force: true });
  }
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

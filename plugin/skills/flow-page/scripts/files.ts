import { createHash, randomBytes } from "node:crypto";
import { chmodSync, closeSync, lstatSync, openSync, readdirSync, renameSync, rmSync, rmdirSync, statSync, unlinkSync, writeFileSync, type BigIntStats, type Stats } from "node:fs";
import { constants } from "node:os";
import { dlopen, read } from "bun:ffi";
import { join } from "node:path";

export const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

const codeUnits = (a: string, b: string) => (a < b ? -1 : 1);
export type Walk = {
  /** Sibling order; UTF-16 code-unit order by default. */
  order?: (a: string, b: string) => number;
  /** Names of files and directories to leave out. */
  skip?: (name: string) => boolean;
  /** Classify entries through symbolic links instead of by the entry itself. */
  follow?: boolean;
  /** Called for an entry that is neither a directory nor a regular file; ignored by default. */
  other?: (path: string) => void;
};

/** Calls `visit` with each regular file's slash-joined path relative to `dir` and its full path, depth first in `order`. */
export function walkFiles(dir: string, visit: (path: string, full: string) => void, { order = codeUnits, skip, follow, other }: Walk = {}): void {
  const walk = (rel: string) => {
    for (const entry of readdirSync(join(dir, rel), { withFileTypes: true }).sort((a: { name: string }, b: { name: string }) => order(a.name, b.name))) {
      if (skip?.(entry.name)) continue;
      const path = rel ? `${rel}/${entry.name}` : entry.name, full = join(dir, path);
      const kind = follow ? statSync(full) : entry;
      if (kind.isDirectory()) walk(path);
      else if (kind.isFile() || follow) visit(path, full);
      else other?.(path);
    }
  };
  walk("");
}

/** Measures an entry without following links. Unreadable children fail the measurement. */
export function measureEntry(path: string, st: Stats | BigIntStats): { newest: number; size: number } {
  let newest = Number(st.mtimeMs), size = 0;
  function walk(path: string, st: Stats | BigIntStats) {
    if (st.isDirectory()) {
      for (const name of readdirSync(path)) {
        const child = join(path, name);
        walk(child, lstatSync(child));
      }
    } else size += Number(st.size);
    newest = Math.max(newest, Number(st.mtimeMs));
  }
  walk(path, st);
  return { newest, size };
}

/** Removes an entry without following links, including read-only snapshot directories. */
export function removeEntry(path: string): void {
  const st = lstatSync(path);
  if (st.isDirectory()) {
    if ((st.mode & 0o700) !== 0o700) chmodSync(path, st.mode | 0o700);
    for (const name of readdirSync(path)) removeEntry(join(path, name));
    rmdirSync(path);
  } else {
    unlinkSync(path);
  }
}

/** Replaces `path` in one rename, so a reader sees the old file or the new one and never a partial write. */
export function writeAtomic(path: string, text: string | Uint8Array): void {
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    writeFileSync(tmp, text);
    renameSync(tmp, path);
  } finally {
    rmSync(tmp, { force: true });
  }
}

// Closing the descriptor, including at process exit, releases the advisory lock.
const errnoName = process.platform === "darwin" ? "__error" : "__errno_location";
const symbols = {
  flock: { args: ["i32", "i32"], returns: "i32" },
  [errnoName]: { args: [], returns: "ptr" },
} as const;
const libraryNames = process.platform === "darwin" ? ["/usr/lib/libSystem.B.dylib"] : ["libc.so.6", "libc.so"];
let libc: ReturnType<typeof dlopen<typeof symbols>> | undefined;
function lib() {
  if (libc) return libc;
  for (const name of libraryNames) {
    try {
      return (libc = dlopen(name, symbols));
    } catch (e) {
      if (name === libraryNames.at(-1)) throw e;
    }
  }
  throw new Error("unreachable");
}
const LOCK_EX = 2;
const LOCK_NB = 4;

export async function withLock<T>(folder: string, fn: () => T): Promise<T> {
  const fd = openSync(join(folder, ".lock"), "a", 0o600);
  try {
    const c = lib();
    while (c.symbols.flock(fd, LOCK_EX | LOCK_NB) !== 0) {
      const errno = read.i32(c.symbols[errnoName]!()!, 0);
      if (errno !== constants.errno.EWOULDBLOCK && errno !== constants.errno.EINTR) throw new Error(`flock on ${folder} failed with errno ${errno}`);
      await Bun.sleep(10);
    }
    return await fn();
  } finally {
    closeSync(fd);
  }
}

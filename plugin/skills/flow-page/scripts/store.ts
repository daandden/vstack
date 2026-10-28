// Where a project's Flows live, how one Flow's commands serialize, and how files are replaced atomically.
// Callers of flow-page.ts never see these paths; they name Flows and Stages by id.

import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:os";
import { join } from "node:path";
import { dlopen, read } from "bun:ffi";
import { repoKey, scratchRoot } from "../../vstack-tmp/scripts/scratch.ts";

/** `<home>/.vstack/tmp/<repo-key>/flow`: one folder per Flow, named by its immutable id. */
export const flowsDir = (home: string, cwd: string): string => join(scratchRoot(home), repoKey(cwd), "flow");

export const statePath = (folder: string) => join(folder, "state.json");
export const pagePath = (folder: string) => join(folder, "index.html");

/** Replaces `path` in one rename, so a reader sees the old file or the new one and never a partial write. */
export function writeAtomic(path: string, text: string): void {
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    writeFileSync(tmp, text);
    renameSync(tmp, path);
  } finally {
    rmSync(tmp, { force: true });
  }
}

/** A new folder under `dir` named `<slug>-<6 hex>`, created exclusively so two callers never share one. */
export function createFlowFolder(dir: string, slug: string): { id: string; folder: string } {
  mkdirSync(dir, { recursive: true });
  for (;;) {
    const id = `${slug}-${randomBytes(3).toString("hex")}`;
    const folder = join(dir, id);
    try {
      mkdirSync(folder);
      return { id, folder };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
  }
}

export const flowFolders = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name) : [];

// A binding records which Flow and Stage one session's agent writes to. It is scoped to the project's flow dir.
export type Binding = { flow: string; stage: string; session: string; agent: string; bound: string };
const bindingPath = (dir: string, session: string, agent: string) =>
  join(dir, ".bindings", `${createHash("sha256").update(`${session}\n${agent}`).digest("hex").slice(0, 32)}.json`);

export function readBinding(dir: string, session: string, agent: string): Binding | undefined {
  const path = bindingPath(dir, session, agent);
  if (!existsSync(path)) return undefined;
  const b = JSON.parse(readFileSync(path, "utf8")) as Binding;
  return b.session === session && b.agent === agent ? b : undefined;
}

export function writeBinding(dir: string, b: Binding): void {
  mkdirSync(join(dir, ".bindings"), { recursive: true });
  writeAtomic(bindingPath(dir, b.session, b.agent), `${JSON.stringify(b)}\n`);
}

// One Flow's commands take an exclusive advisory flock on `<folder>/.lock`. Closing the descriptor, or the
// process ending for any reason, releases it.
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
      const errno = read.i32(c.symbols[errnoName]()!, 0);
      if (errno !== constants.errno.EWOULDBLOCK && errno !== constants.errno.EINTR) throw new Error(`flock on ${folder} failed with errno ${errno}`);
      await Bun.sleep(10);
    }
    return fn();
  } finally {
    closeSync(fd);
  }
}

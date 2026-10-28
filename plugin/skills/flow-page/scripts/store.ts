// Where a project's Flows live, how one Flow's commands serialize, and how files are replaced atomically.
// Callers of flow-page.ts never see these paths; they name Flows and Stages by id.

import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:os";
import { join } from "node:path";
import { dlopen, read } from "bun:ffi";
import { repoKey, scratchRoot } from "../../vstack-tmp/scripts/scratch.ts";
import { closedAt, SLUG, upgrade, type State } from "./model.ts";

export const FLOW_KIND = "flow";
/** `<home>/.vstack/tmp/<repo-key>/flow`: one folder per Flow. All worktrees of a project share it; other projects never see it. */
export const flowsDir = (home: string, cwd: string): string => join(scratchRoot(home), repoKey(cwd), FLOW_KIND);

// A Flow folder holds its committed domain state under `data/` and the last page published from it at `index.html`.
// The page is a projection: a failed publish leaves the state committed and the older page in place.
export const statePath = (folder: string) => join(folder, "data", "state.json");
export const pagePath = (folder: string) => join(folder, "index.html");
/** Captured attachment bytes, as `<sha256>/<name>`, linked from the page by a path relative to it. */
export const assetsDir = (folder: string) => join(folder, "assets");

/** The revision the published page shows, read from the meta tag the renderer writes, or undefined with no page. */
export function pageRevision(folder: string): number | undefined {
  if (!existsSync(pagePath(folder))) return undefined;
  const m = readFileSync(pagePath(folder), "utf8").match(/<meta name="flow-page-revision" content="(\d+)">/);
  return m ? Number(m[1]) : undefined;
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

// `.ids/<id>` reserves each Flow id for good and names the folder that holds it now, so an id stays unique after its
// folder moves and a lookup by id reads one file instead of every Flow.
const idPath = (dir: string, id: string) => join(dir, ".ids", id);

/** A new Flow id `<slug>-<6 hex>`, reserved exclusively, and its new folder with an empty `data/`. */
export function createFlowFolder(dir: string, slug: string): { id: string; folder: string } {
  mkdirSync(join(dir, ".ids"), { recursive: true });
  for (;;) {
    const id = `${slug}-${randomBytes(3).toString("hex")}`;
    try {
      writeFileSync(idPath(dir, id), id, { flag: "wx" });
      mkdirSync(join(dir, id));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      continue;
    }
    mkdirSync(join(dir, id, "data"));
    return { id, folder: join(dir, id) };
  }
}

/** The folder name the id registry gives for `id`, if any. */
export const registeredFolder = (dir: string, id: string): string | undefined => (existsSync(idPath(dir, id)) ? readFileSync(idPath(dir, id), "utf8").trim() : undefined);

/** Points `id` at the folder `name`; called after the folder has moved there. */
export const registerFolder = (dir: string, id: string, name: string): void => writeAtomic(idPath(dir, id), name);

export const flowFolders = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name) : [];

export function readState(folder: string): State | undefined {
  try {
    return upgrade(JSON.parse(readFileSync(statePath(folder), "utf8")));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
}

export function folderOfId(dir: string, id: string): string | undefined {
  if (!SLUG.test(id)) return undefined;
  const name = registeredFolder(dir, id);
  if (name && SLUG.test(name) && readState(join(dir, name))?.flow.id === id) return join(dir, name);
  return flowFolders(dir).map((n) => join(dir, n)).find((folder) => readState(folder)?.flow.id === id);
}

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

/** Deletes every session binding to the Flow `id`. Called when the Flow itself is deleted, so no session stays bound to it. */
export function dropBindings(dir: string, id: string): void {
  const at = join(dir, ".bindings");
  if (!existsSync(at)) return;
  for (const name of readdirSync(at)) {
    const path = join(at, name);
    try {
      if ((JSON.parse(readFileSync(path, "utf8")) as Binding).flow === id) rmSync(path, { force: true });
    } catch {
      // A binding being replaced right now, or not one at all: leave it.
    }
  }
}

// Scratch cleanup judges a Flow by its lifecycle, never by file times or page reads: an open Flow is never removed,
// and a closed one becomes eligible CLOSED_RETENTION after its latest close. The `.ids/` and `.bindings/` dot entries
// of the flow dir are the project's Flow registry: `.ids/` keeps every id ever given, so an expired id is reported
// and never handed out again, and bindings go when their Flow goes.
export const CLOSED_RETENTION = 90 * 86_400_000;
export type Retention = { flow: string; closed?: string } | "unreadable";

/** The lifecycle of the Flow in `folder` without following links, "unreadable" when its state cannot be read, or undefined when `folder` holds no Flow state. */
export function retentionOf(folder: string): Retention | undefined {
  const kind = (p: string) => {
    try {
      const st = lstatSync(p);
      return st.isDirectory() ? "dir" : st.isFile() ? "file" : "other";
    } catch {
      return undefined;
    }
  };
  if (kind(folder) !== "dir" || kind(join(folder, "data")) !== "dir" || kind(statePath(folder)) !== "file") return undefined;
  try {
    const s = upgrade(JSON.parse(readFileSync(statePath(folder), "utf8")) as State);
    const closed = closedAt(s);
    return { flow: s.flow.id, ...(closed !== undefined ? { closed } : {}) };
  } catch {
    return "unreadable";
  }
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
    return await fn();
  } finally {
    closeSync(fd);
  }
}

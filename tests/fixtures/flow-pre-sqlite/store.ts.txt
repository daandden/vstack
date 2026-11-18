import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, rmdirSync, writeFileSync, type Stats } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { basename, dirname, join, sep } from "node:path";
import { repoKey, scratchRoot } from "../../vstack-tmp/scripts/scratch.ts";
import { addAliases, aliasesOf, closedAt, SLUG, upgrade, type State } from "./model.ts";
import { Refusal } from "./fields.ts";
import { measureEntry, removeEntry, withLock, writeAtomic } from "./files.ts";
import type { Comments } from "./comments.ts";
import type { Learning } from "./learning.ts";
import type { ProjectRegistration } from "./observations.ts";

export const FLOW_KIND = "flow";
/** `<home>/.vstack/tmp/<repo-key>/flow`: one folder per Flow. All worktrees of a project share it; other projects never see it. */
const flowsDir = (home: string, cwd: string): string => join(scratchRoot(home), repoKey(cwd), FLOW_KIND);

const statePath = (folder: string) => join(folder, "data", "state.json");
/** Captured attachment bytes, as `<sha256>/<name>`, which the host serves under the Flow's `assets/` path. */
const assetsDir = (folder: string) => join(folder, "assets");

const idPath = (dir: string, id: string) => join(dir, ".ids", id);

/** A new Flow id `<slug>-<6 hex>`, reserved exclusively, and its new folder with an empty `data/`. */
function createFlowFolder(dir: string, slug: string): { id: string; folder: string } {
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
const registeredFolder = (dir: string, id: string): string | undefined => (existsSync(idPath(dir, id)) ? readFileSync(idPath(dir, id), "utf8").trim() : undefined);

/** Points `id` at the folder `name`; called after the folder has moved there. */
const registerFolder = (dir: string, id: string, name: string): void => writeAtomic(idPath(dir, id), name);

type MigrationIdentity = { source: string; flow: string; sha256: string };
const migrationPath = (dir: string, source: string) => join(dir, ".migrations", createHash("sha256").update(source).digest("hex"));
function migrationIdentity(dir: string, source: string): MigrationIdentity | undefined {
  const path = migrationPath(dir, source);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
}
function registerMigration(dir: string, identity: MigrationIdentity): void {
  mkdirSync(join(dir, ".migrations"), { recursive: true });
  writeAtomic(migrationPath(dir, identity.source), JSON.stringify(identity));
}

const flowFolders = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name) : [];

function readState(folder: string): State | undefined {
  try {
    return upgrade(JSON.parse(readFileSync(statePath(folder), "utf8")));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
}

function folderOfId(dir: string, id: string): string | undefined {
  if (!SLUG.test(id)) return undefined;
  const name = registeredFolder(dir, id);
  if (name && SLUG.test(name) && readState(join(dir, name))?.flow.id === id) return join(dir, name);
  return flowFolders(dir).map((n) => join(dir, n)).find((folder) => readState(folder)?.flow.id === id);
}

export type Binding = { flow: string; stage: string; session: string; agent: string; bound: string };
const bindingPath = (dir: string, session: string, agent: string) =>
  join(dir, ".bindings", `${createHash("sha256").update(`${session}\n${agent}`).digest("hex").slice(0, 32)}.json`);

function readBinding(dir: string, session: string, agent: string): Binding | undefined {
  const path = bindingPath(dir, session, agent);
  if (!existsSync(path)) return undefined;
  const b = JSON.parse(readFileSync(path, "utf8")) as Binding;
  return b.session === session && b.agent === agent ? b : undefined;
}

function writeBinding(dir: string, b: Binding): void {
  mkdirSync(join(dir, ".bindings"), { recursive: true });
  writeAtomic(bindingPath(dir, b.session, b.agent), `${JSON.stringify(b)}\n`);
}

/** Deletes every session binding to the Flow `id`. Called when the Flow itself is deleted, so no session stays bound to it. */
function dropBindings(dir: string, id: string): void {
  const at = join(dir, ".bindings");
  if (!existsSync(at)) return;
  for (const name of readdirSync(at)) {
    const path = join(at, name);
    try {
      if ((JSON.parse(readFileSync(path, "utf8")) as Binding).flow === id) rmSync(path, { force: true });
    } catch {
    }
  }
}

export const CLOSED_RETENTION = 15 * 86_400_000;
export type Retention = { flow: string; closed?: string } | "unreadable";

/** The lifecycle of the Flow in `folder` without following links, "unreadable" when its state cannot be read, or undefined when `folder` holds no Flow state. */
function retentionOf(folder: string): Retention | undefined {
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

type Captured = ReadonlyMap<string, Uint8Array>;
export type FlowWrite = {
  save: (state: State, captured?: Captured) => void;
  move: (state: State, to: string) => { flow: string; revision: number; moved_from: string };
};

function save(folder: string, state: State, captured?: Captured): void {
  for (const [file, bytes] of captured ?? []) {
    const path = join(assetsDir(folder), file);
    if (existsSync(path)) continue;
    mkdirSync(dirname(path), { recursive: true });
    writeAtomic(path, bytes);
  }
  writeAtomic(statePath(folder), `${JSON.stringify(state)}\n`);
}

function move(dir: string, folder: string, state: State, to: string) {
  const from = basename(folder);
  const dest = join(dir, to);
  if (dest === folder) throw new Refusal(`Flow ${state.flow.id} is already in ${to}`);
  try {
    mkdirSync(dest);
  } catch (e) {
    throw new Refusal((e as NodeJS.ErrnoException).code === "EEXIST" ? `${to} is taken in this project; choose another folder key` : `could not move Flow ${state.flow.id} to ${to} (${(e as Error).message}); it stays in ${from}`);
  }
  try {
    renameSync(folder, dest);
  } catch (e) {
    rmdirSync(dest);
    throw new Refusal(`could not move Flow ${state.flow.id} to ${to} (${(e as Error).message}); it stays in ${from}`);
  }
  try {
    registerFolder(dir, state.flow.id, to);
    if (addAliases(state, [`folder:${to}`]).length) save(dest, state);
  } catch (e) {
    renameSync(dest, folder);
    registerFolder(dir, state.flow.id, from);
    throw new Refusal(`could not move Flow ${state.flow.id} to ${to} (${(e as Error).message}); it stays in ${from}`);
  }
  return { flow: state.flow.id, revision: state.revision, moved_from: from };
}

/** All Flow data for one project. Callers use ids, never storage folders or locks. */
export class FlowStore {
  constructor(private readonly dir: string, private readonly confined = false) {}

  get scratch(): string { return dirname(this.dir); }
  get key(): string { return basename(this.scratch); }
  contains(path: string): boolean { return path === this.dir || path.startsWith(this.dir + sep); }
  read(id: string): State | undefined {
    const folder = this.folder(id);
    return folder ? readState(folder) : undefined;
  }
  hasId(id: string): boolean { return registeredFolder(this.dir, id) !== undefined; }
  find(alias: string): State[] {
    const matches = (value: string) => /^(spec|ticket):/.test(alias) ? value.toLowerCase() === alias.toLowerCase() : value === alias;
    return flowFolders(this.dir).flatMap(name => {
      const state = readState(join(this.dir, name));
      return state && aliasesOf(state).some(matches) ? [state] : [];
    });
  }
  migratedFrom(source: string): State | undefined {
    for (const name of flowFolders(this.dir)) {
      const state = readState(join(this.dir, name));
      if (state?.migrated?.from === source) return state;
    }
  }
  binding(session: string, agent: string): Binding | undefined { return readBinding(this.dir, session, agent); }
  bind(binding: Binding): void { writeBinding(this.dir, binding); }
  migration(source: string): MigrationIdentity | undefined { return migrationIdentity(this.dir, source); }
  registerMigration(identity: MigrationIdentity): void { registerMigration(this.dir, identity); }
  async migrating<T>(fn: () => T): Promise<T> {
    mkdirSync(this.dir, { recursive: true });
    return withLock(this.dir, fn);
  }
  async create<T>(slug: string, fn: (id: string, write: FlowWrite) => T): Promise<T> {
    const { id, folder } = createFlowFolder(this.dir, slug);
    return withLock(folder, () => fn(id, this.writer(folder)));
  }
  async commit<T>(id: string, fn: (state: State, write: FlowWrite) => T): Promise<T> {
    return this.locked(id, (folder, state) => fn(state, this.writer(folder)));
  }
  private writer(folder: string): FlowWrite {
    return { save: (state, captured) => save(folder, state, captured), move: (state, to) => move(this.dir, folder, state, to) };
  }
  private folder(id: string): string | undefined {
    const folder = folderOfId(this.dir, id);
    return folder && (!this.confined || realpathSync(folder).startsWith(realpathSync(this.dir) + sep)) ? folder : undefined;
  }
  private requireFolder(id: string): string {
    const folder = this.folder(id);
    if (folder) return folder;
    throw new Refusal(this.hasId(id)
      ? `Flow ${id} has no content any more: it expired after it was closed, or its folder was deleted. Nothing can be read or added under this id; open a new Flow`
      : `this project has no Flow ${id}`);
  }
  private async locked<T>(id: string, fn: (folder: string, state: State) => T): Promise<T> {
    let folder = this.requireFolder(id);
    for (let tries = 0; tries < 5; tries++) {
      let done: { value: T } | undefined;
      try {
        done = await withLock(folder, () => {
          const state = readState(folder);
          return state?.flow.id === id ? { value: fn(folder, state) } : undefined;
        });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT" || existsSync(folder)) throw e;
      }
      if (done) return done.value;
      folder = this.requireFolder(id);
    }
    throw new Refusal(`Flow ${id} kept moving while this command waited; run it again`);
  }
  private readData<T>(id: string, name: string, label: string, empty: () => T): T {
    const path = join(this.requireFolder(id), "data", name);
    if (!existsSync(path)) return empty();
    if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error(`${label} storage is not a regular file`);
    return JSON.parse(readFileSync(path, "utf8"));
  }
  readComments(id: string): Comments { return this.readData(id, "comments.json", "Comments", () => ({ version: 1, comments: [] })); }
  async updateComments<T>(id: string, fn: (saved: Comments, state: State) => T): Promise<T> {
    return this.locked(id, (folder, state) => {
      const saved = this.readComments(id);
      const result = fn(saved, state);
      writeAtomic(join(folder, "data", "comments.json"), JSON.stringify(saved));
      return result;
    });
  }
  readLearning(id: string): Learning { return this.readData(id, "learning.json", "Learning", () => ({ version: 1, attempts: [], completed: [] })); }
  async updateLearning<T>(id: string, fn: (saved: Learning, state: State) => T): Promise<T> {
    return this.locked(id, (folder, state) => {
      const saved = this.readLearning(id);
      const result = fn(saved, state);
      writeAtomic(join(folder, "data", "learning.json"), JSON.stringify(saved));
      return result;
    });
  }
  readObservation(id: string): ProjectRegistration {
    return JSON.parse(readFileSync(join(this.requireFolder(id), "observation-project.json"), "utf8"));
  }
  saveObservation(id: string, registration: ProjectRegistration): void {
    writeAtomic(join(this.requireFolder(id), "observation-project.json"), JSON.stringify(registration));
  }
  assets(id: string): string { return assetsDir(this.requireFolder(id)); }
  asset(id: string, file: string): string | undefined {
    if (!/^[a-f0-9]{64}\/[A-Za-z0-9._-]+$/.test(file)) return undefined;
    const folder = this.requireFolder(id);
    const base = realpathSync(assetsDir(folder));
    const path = join(base, file);
    return base.startsWith(realpathSync(folder) + sep) && lstatSync(path).isFile() && realpathSync(path) === path ? path : undefined;
  }
}

export const projectStore = (home: string, cwd: string): FlowStore => new FlowStore(flowsDir(home, cwd));
export function hostedStore(home: string, key: string): FlowStore | undefined {
  if (!/^[^./\\\x00][^/\\\x00]*$/.test(key)) return undefined;
  const dir = join(scratchRoot(home), key, FLOW_KIND);
  return realpathSync(dir).startsWith(realpathSync(scratchRoot(home)) + sep) ? new FlowStore(dir, true) : undefined;
}

export type FlowRetentionEntry = { path: string; entry: string; registry: boolean; newest: number; size: number; retention?: Retention };
export function flowRetentionEntry(path: string, st = lstatSync(path)): FlowRetentionEntry {
  const entry = basename(path);
  if (entry.startsWith(".")) return { path, entry, registry: true, newest: 0, size: 0 };
  return { path, entry, registry: false, ...measureEntry(path, st), retention: retentionOf(path) };
}
export function flowRetentionEntries(projectScratch: string): FlowRetentionEntry[] {
  const dir = join(projectScratch, FLOW_KIND);
  return readdirSync(dir).sort().flatMap(entry => {
    const path = join(dir, entry);
    let st: Stats;
    try { st = lstatSync(path); } catch { return []; }
    return [flowRetentionEntry(path, st)];
  });
}
export async function deleteFlowEntry(path: string, recheck: (entry: FlowRetentionEntry) => string | undefined): Promise<string | undefined> {
  const entry = flowRetentionEntry(path);
  const remove = () => {
    const reason = recheck(flowRetentionEntry(path));
    if (reason) return reason;
    const state = entry.retention && entry.retention !== "unreadable" ? readState(path) : undefined;
    if (state?.migrated) registerMigration(dirname(path), { source: state.migrated.from, flow: state.flow.id, sha256: state.migrated.sha256 });
    removeEntry(path);
    if (state) dropBindings(dirname(path), state.flow.id);
  };
  return entry.retention && entry.retention !== "unreadable" ? withLock(path, remove) : remove();
}


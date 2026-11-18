import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, type Stats } from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, dirname, join, sep } from "node:path";
import { repoKey, scratchRoot } from "../../vstack-tmp/scripts/scratch.ts";
import { addAliases, aliasesOf, closedAt, SLUG, upgrade, type State } from "./model.ts";
import { Refusal } from "./fields.ts";
import { measureEntry, removeEntry, writeAtomic } from "./files.ts";
import { projectDatabase, and, eq, aliases, bindings, flows, identities, learningProgress, migrations, observationContexts, readerComments } from "./database-runtime.js";
import type { Comments } from "./comments.ts";
import type { Learning } from "./learning.ts";
import type { ProjectRegistration } from "./observations.ts";

export const FLOW_KIND = "flow";
export const FLOW_STORAGE = "sqlite";
const flowsDir = (home: string, cwd: string): string => join(scratchRoot(home), repoKey(cwd), FLOW_KIND);
const lookup = (alias: string) => /^(spec|ticket):/.test(alias) ? alias.toLowerCase() : alias;
export type Binding = { flow: string; stage: string; session: string; agent: string; bound: string };
type MigrationIdentity = { source: string; flow: string; sha256: string };
export const CLOSED_RETENTION = 15 * 86_400_000;
export type Retention = { flow: string; closed?: string } | "unreadable";
type Captured = ReadonlyMap<string, Uint8Array>;
export type FlowWrite = {
  save: (state: State, captured?: Captured) => void;
  move: (state: State, to: string) => { flow: string; revision: number; moved_from: string };
};

/** All Flow data for one project. Callers use ids, never database tables or storage folders. */
export class FlowStore {
  private opened?: ReturnType<typeof projectDatabase>;
  private get connection() {
    if (!this.opened) {
      try { this.opened = projectDatabase(join(this.scratch, "flow.db"), this.readonly); }
      catch (error) {
        if (this.readonly) throw new Refusal(`validate needs prepared storage (${(error as Error).message}); run any other flow-page command first`);
        throw error;
      }
      if (!this.readonly) this.importJson();
    }
    return this.opened;
  }
  private get db() { return this.connection.db; }
  constructor(private readonly dir: string, private readonly confined = false, private readonly readonly = false) {}
  get scratch(): string { return dirname(this.dir); }
  get key(): string { return basename(this.scratch); }
  contains(path: string): boolean { return path === this.dir || path.startsWith(this.dir + sep); }
  private row(id: string) { return this.db.select().from(flows).where(eq(flows.id, id)).get(); }
  private folder(id: string): string | undefined {
    const row = this.db.select({ folder: flows.folder }).from(flows).where(eq(flows.id, id)).get();
    if (!row || !SLUG.test(row.folder)) return undefined;
    const folder = join(this.dir, row.folder);
    if (!existsSync(folder)) return undefined;
    if (this.confined && (!lstatSync(folder).isDirectory() || realpathSync(folder) !== folder || !realpathSync(folder).startsWith(realpathSync(this.dir) + sep))) return undefined;
    return folder;
  }
  private requireFolder(id: string): string {
    const folder = this.folder(id);
    if (folder) return folder;
    throw new Refusal(this.hasId(id)
      ? `Flow ${id} has no content any more: it expired after it was closed, or its folder was deleted. Nothing can be read or added under this id; open a new Flow`
      : `this project has no Flow ${id}`);
  }
  read(id: string): State | undefined { return this.folder(id) ? upgrade(this.row(id)!.state) : undefined; }
  revision(id: string): number | undefined {
    if (this.pendingImport(id)) throw new Refusal("validate cannot import legacy JSON; run any other flow-page command first");
    return this.folder(id) ? this.db.select({ revision: flows.revision }).from(flows).where(eq(flows.id, id)).get()?.revision : undefined;
  }
  summary(id: string) {
    const row = this.db.select({ id: flows.id, revision: flows.revision }).from(flows).where(eq(flows.id, id)).get();
    return row && this.folder(id) ? { flow: row.id, revision: row.revision, aliases: this.db.select({ alias: aliases.alias }).from(aliases).where(eq(aliases.flow, id)).orderBy(aliases.position).all().map(a => a.alias) } : undefined;
  }
  hasId(id: string): boolean { return this.db.select().from(identities).where(eq(identities.id, id)).get() !== undefined; }
  findIds(alias: string): { flow: { id: string } }[] {
    if (this.pendingImport(alias)) throw new Refusal("validate cannot import legacy JSON; run any other flow-page command first");
    return this.db.select({ id: aliases.flow }).from(aliases).where(eq(aliases.lookup, lookup(alias))).all().map(row => ({ flow: { id: row.id } }));
  }
  migratedFrom(source: string): State | undefined { const identity = this.migration(source); return identity && this.read(identity.flow); }
  binding(session: string, agent: string): Binding | undefined {
    if (!this.readonly && !this.opened && !existsSync(join(this.scratch, "flow.db")) && !existsSync(join(this.dir, ".bindings"))) return undefined;
    if (this.readonly) {
      this.connection;
      const dir = join(this.dir, ".bindings");
      for (const name of existsSync(dir) ? readdirSync(dir) : []) {
        const path = join(dir, name);
        if (name.endsWith(".imported.json") || !lstatSync(path).isFile()) continue;
        let saved: Binding;
        try { saved = JSON.parse(readFileSync(path, "utf8")); } catch { continue; }
        if (saved?.session === session && saved.agent === agent && typeof saved.flow === "string" && (this.row(saved.flow) || this.pendingImport(saved.flow, true))) {
          throw new Refusal("validate cannot import legacy JSON; run any other flow-page command first");
        }
      }
    }
    return this.db.select().from(bindings).where(and(eq(bindings.session, session), eq(bindings.agent, agent))).get()?.data;
  }
  bind(binding: Binding): void {
    this.db.insert(bindings).values({ ...binding, data: binding }).onConflictDoUpdate({ target: [bindings.session, bindings.agent], set: { flow: binding.flow, data: binding } }).run();
  }
  migration(source: string): MigrationIdentity | undefined { return this.db.select().from(migrations).where(eq(migrations.source, source)).get(); }
  registerMigration(identity: MigrationIdentity): void {
    this.db.insert(migrations).values(identity).onConflictDoUpdate({ target: migrations.source, set: identity }).run();
  }
  migrating<T>(fn: () => T): T { return this.connection.sqlite.transaction(fn).immediate(); }
  create<T>(slug: string, fn: (id: string, write: FlowWrite) => T): T {
    return this.migrating(() => {
      let id: string;
      do { id = `${slug}-${randomBytes(3).toString("hex")}`; } while (this.hasId(id) || existsSync(join(this.dir, id)));
      this.db.insert(identities).values({ id }).run();
      const folder = join(this.dir, id);
      mkdirSync(join(folder, "data"), { recursive: true });
      try { return fn(id, this.writer(folder)); }
      catch (error) { rmSync(folder, { recursive: true, force: true }); throw error; }
    });
  }
  commit<T>(id: string, fn: (state: State, write: FlowWrite) => T): T {
    return this.migrating(() => {
      const folder = this.requireFolder(id);
      return fn(upgrade(this.row(id)!.state), this.writer(folder));
    });
  }
  private save(folder: string, state: State, captured?: Captured): void {
    for (const [file, bytes] of captured ?? []) {
      const path = join(folder, "assets", file);
      if (existsSync(path)) continue;
      mkdirSync(dirname(path), { recursive: true });
      writeAtomic(path, bytes);
    }
    const row = { id: state.flow.id, folder: basename(folder), state, revision: state.revision, slug: state.flow.slug, title: state.flow.title, created: state.flow.created, closed: closedAt(state) ?? null };
    this.db.insert(identities).values({ id: state.flow.id }).onConflictDoNothing().run();
    this.db.insert(flows).values(row).onConflictDoUpdate({ target: flows.id, set: row }).run();
    for (const [position, alias] of aliasesOf(state).entries()) this.db.insert(aliases).values({ flow: state.flow.id, alias, lookup: lookup(alias), position }).onConflictDoUpdate({ target: [aliases.flow, aliases.alias], set: { position } }).run();
    if (state.migrated) this.registerMigration({ source: state.migrated.from, flow: state.flow.id, sha256: state.migrated.sha256 });
  }
  private writer(folder: string): FlowWrite {
    return {
      save: (state, captured) => this.save(folder, state, captured),
      move: (state, to) => {
        const from = basename(folder), dest = join(this.dir, to);
        if (dest === folder) throw new Refusal(`Flow ${state.flow.id} is already in ${to}`);
        if (existsSync(dest)) throw new Refusal(`${to} is taken in this project; choose another folder key`);
        try { renameSync(folder, dest); }
        catch (error) { throw new Refusal(`could not move Flow ${state.flow.id} to ${to} (${(error as Error).message}); it stays in ${from}`); }
        try { addAliases(state, [`folder:${to}`]); this.save(dest, state); }
        catch (error) { renameSync(dest, folder); throw error; }
        return { flow: state.flow.id, revision: state.revision, moved_from: from };
      },
    };
  }
  readComments(id: string): Comments {
    this.requireFolder(id);
    return this.db.select().from(readerComments).where(eq(readerComments.flow, id)).get()?.data ?? { version: 1, comments: [] };
  }
  updateComments<T>(id: string, fn: (saved: Comments, state: State) => T): T {
    return this.commit(id, state => {
      const saved = this.readComments(id), result = fn(saved, state);
      this.db.insert(readerComments).values({ flow: id, data: saved }).onConflictDoUpdate({ target: readerComments.flow, set: { data: saved } }).run();
      return result;
    });
  }
  readLearning(id: string): Learning {
    this.requireFolder(id);
    return this.db.select().from(learningProgress).where(eq(learningProgress.flow, id)).get()?.data ?? { version: 1, attempts: [], completed: [] };
  }
  updateLearning<T>(id: string, fn: (saved: Learning, state: State) => T): T {
    return this.commit(id, state => {
      const saved = this.readLearning(id), result = fn(saved, state);
      this.db.insert(learningProgress).values({ flow: id, data: saved }).onConflictDoUpdate({ target: learningProgress.flow, set: { data: saved } }).run();
      return result;
    });
  }
  readObservation(id: string): ProjectRegistration {
    this.requireFolder(id);
    const row = this.db.select().from(observationContexts).where(eq(observationContexts.flow, id)).get();
    if (!row) throw new Error("Flow observation context is missing");
    return row.data;
  }
  saveObservation(id: string, registration: ProjectRegistration): void {
    this.requireFolder(id);
    this.db.insert(observationContexts).values({ flow: id, data: registration }).onConflictDoUpdate({ target: observationContexts.flow, set: { data: registration } }).run();
  }
  assets(id: string): string { return join(this.requireFolder(id), "assets"); }
  asset(id: string, file: string): string | undefined {
    if (!/^[a-f0-9]{64}\/[A-Za-z0-9._-]+$/.test(file)) return undefined;
    const folder = this.requireFolder(id);
    const base = realpathSync(join(folder, "assets")), path = join(base, file);
    return base.startsWith(realpathSync(folder) + sep) && lstatSync(path).isFile() && realpathSync(path) === path ? path : undefined;
  }
  private pendingImport(key: string, binding = false): boolean {
    if (!this.readonly) return false;
    this.connection;
    if (!existsSync(this.dir)) return false;
    const folder = key.includes(":") ? undefined : this.row(key)?.folder;
    for (const entry of readdirSync(this.dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !SLUG.test(entry.name)) continue;
      const path = join(this.dir, entry.name, "data/state.json");
      if (!existsSync(path) || !lstatSync(path).isFile() || realpathSync(path) !== path) continue;
      if (!binding && (entry.name === key || entry.name === folder || lookup(`folder:${entry.name}`) === lookup(key))) return true;
      try {
        const state = upgrade(JSON.parse(readFileSync(path, "utf8")));
        if (!SLUG.test(state.flow.id)) continue;
        if (!binding && state.flow.id === key) return true;
        if (binding ? state.flow.id !== key : this.row(state.flow.id) || !aliasesOf(state).some(alias => lookup(alias) === lookup(key))) continue;
        for (const name of ["data/comments.json", "data/learning.json", "observation-project.json"]) {
          const source = join(this.dir, entry.name, name);
          if (!existsSync(source)) continue;
          if (!lstatSync(source).isFile() || realpathSync(source) !== source) throw new Error("import source is not a regular file");
          JSON.parse(readFileSync(source, "utf8"));
        }
        return true;
      } catch {}
    }
    return false;
  }
  private importJson(): void {
    if (!existsSync(this.dir)) return;
    const files = (at: string) => existsSync(at) ? readdirSync(at).map(name => join(at, name)).filter(path => lstatSync(path).isFile() && !path.endsWith(".imported.json")) : [];
    const report = (subject: string, path: string, error: unknown) => process.stderr.write(`flow-page.ts: legacy import failed for ${subject} from ${path}: ${String(error instanceof Error ? error.message : error).replace(/[\r\n]+/g, " ")}\n`);
    this.migrating(() => {
      for (const path of files(join(this.dir, ".ids"))) if (SLUG.test(basename(path))) this.db.insert(identities).values({ id: basename(path) }).onConflictDoNothing().run();
    });
    for (const path of files(join(this.dir, ".migrations"))) {
      try {
        const identity = JSON.parse(readFileSync(path, "utf8")) as MigrationIdentity;
        this.migrating(() => { if (!this.migration(identity.source)) this.registerMigration(identity); });
        renameSync(path, `${path}.imported.json`);
      } catch (error) { report(`migration identity ${basename(path)}`, path, error); }
    }
    for (const entry of readdirSync(this.dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !SLUG.test(entry.name)) continue;
      const folder = join(this.dir, entry.name), path = join(folder, "data", "state.json");
      if (!existsSync(path) || !lstatSync(path).isFile() || realpathSync(path) !== path) continue;
      let source = path;
      try {
        this.migrating(() => {
          if (!existsSync(path)) return;
          const state = upgrade(JSON.parse(readFileSync(path, "utf8")));
          if (!SLUG.test(state.flow.id)) throw new Error("invalid imported Flow id");
          if (!this.row(state.flow.id)) {
            const data = (at: string) => {
              source = join(folder, at);
              if (!existsSync(source)) return undefined;
              if (!lstatSync(source).isFile() || realpathSync(source) !== source) throw new Error("import source is not a regular file");
              return JSON.parse(readFileSync(source, "utf8"));
            };
            addAliases(state, [`folder:${entry.name}`]);
            this.save(folder, state);
            const comments = data("data/comments.json"), learning = data("data/learning.json"), context = data("observation-project.json");
            if (comments) this.db.insert(readerComments).values({ flow: state.flow.id, data: comments }).run();
            if (learning) this.db.insert(learningProgress).values({ flow: state.flow.id, data: learning }).run();
            if (context) this.saveObservation(state.flow.id, context);
          }
        });
        for (const name of ["state", "comments", "learning"]) {
          source = join(folder, "data", `${name}.json`);
          if (existsSync(source)) renameSync(source, join(folder, "data", `${name}.imported.json`));
        }
      } catch (error) { report(`Flow ${entry.name}`, source, error); }
    }
    for (const path of files(join(this.dir, ".bindings")).filter(path => !path.endsWith(".imported.json"))) {
      try {
        const saved = JSON.parse(readFileSync(path, "utf8")) as Binding;
        if (!this.row(saved.flow)) continue;
        this.migrating(() => this.bind(saved));
        renameSync(path, path.replace(/\.json$/, ".imported.json"));
      } catch (error) { report(`binding ${basename(path)}`, path, error); }
    }
  }
  retention(path: string, st: Stats): FlowRetentionEntry {
    const entry = basename(path);
    if (entry.startsWith(".")) return { path, entry, registry: true, newest: 0, size: 0 };
    const row = this.db.select({ id: flows.id, closed: flows.closed }).from(flows).where(eq(flows.folder, entry)).get();
    const source = join(path, "data/state.json");
    const retention: Retention | undefined = row ? { flow: row.id, ...(row.closed === null ? {} : { closed: row.closed }) } : existsSync(source) ? "unreadable" : undefined;
    return { path, entry, registry: false, ...measureEntry(path, st), retention };
  }
  delete(path: string, recheck: (entry: FlowRetentionEntry) => string | undefined): string | undefined {
    let staged: string | undefined;
    let reason: string | undefined;
    let deletedId: string | undefined;
    try {
      reason = this.migrating(() => {
        const reason = recheck(this.retention(path, lstatSync(path)));
        if (reason) return reason;
        const row = this.db.select({ id: flows.id }).from(flows).where(eq(flows.folder, basename(path))).get();
        deletedId = row?.id;
        staged = join(this.dir, `.${basename(path)}.delete-${randomBytes(8).toString("hex")}`);
        renameSync(path, staged);
        if (row) {
          for (const table of [bindings, readerComments, learningProgress, observationContexts]) this.db.delete(table).where(eq(table.flow, row.id)).run();
          this.db.delete(flows).where(eq(flows.id, row.id)).run();
        }
      });
    } catch (error) {
      if (staged && existsSync(staged)) renameSync(staged, path);
      throw error;
    }
    if (staged) removeEntry(staged);
    if (deletedId) {
      const legacyBindings = join(this.dir, ".bindings");
      if (existsSync(legacyBindings)) for (const name of readdirSync(legacyBindings)) {
        const path = join(legacyBindings, name);
        if (!lstatSync(path).isFile()) continue;
        try { if ((JSON.parse(readFileSync(path, "utf8")) as Binding).flow === deletedId) rmSync(path); } catch {}
      }
    }
    return reason;
  }
  compact(): void {
    this.connection.sqlite.exec("VACUUM");
    this.connection.sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  }
}

export const projectStore = (home: string, cwd: string, readonly = false): FlowStore => new FlowStore(flowsDir(home, cwd), false, readonly);
export function hostedStore(home: string, key: string): FlowStore | undefined {
  if (!/^[^./\\\x00][^/\\\x00]*$/.test(key)) return undefined;
  const dir = join(scratchRoot(home), key, FLOW_KIND);
  return realpathSync(dir).startsWith(realpathSync(scratchRoot(home)) + sep) ? new FlowStore(dir, true) : undefined;
}

export type FlowRetentionEntry = { path: string; entry: string; registry: boolean; newest: number; size: number; retention?: Retention };
export function flowRetentionEntry(path: string, st = lstatSync(path)): FlowRetentionEntry {
  return new FlowStore(dirname(path)).retention(path, st);
}
export function flowRetentionEntries(projectScratch: string): FlowRetentionEntry[] {
  const dir = join(projectScratch, FLOW_KIND), store = new FlowStore(dir);
  return readdirSync(dir).sort().flatMap(entry => {
    const path = join(dir, entry);
    let st: Stats;
    try { st = lstatSync(path); } catch { return []; }
    return [store.retention(path, st)];
  });
}
export async function deleteFlowEntry(path: string, recheck: (entry: FlowRetentionEntry) => string | undefined): Promise<string | undefined> {
  return new FlowStore(dirname(path)).delete(path, recheck);
}
export function compactFlowDatabase(projectScratch: string): void {
  new FlowStore(join(projectScratch, FLOW_KIND)).compact();
}


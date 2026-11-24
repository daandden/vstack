import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { State } from "../../plugin/skills/flow-page/scripts/model.ts";
import { Database } from "bun:sqlite";
import { closedAt } from "../../plugin/skills/flow-page/scripts/model.ts";
import { repoKey } from "../../plugin/skills/vstack-tmp/scripts/scratch.ts";
import { createHash } from "node:crypto";

export function projectStorage(home: string, cwd: string): string {
  return join(home, ".vstack/tmp", repoKey(cwd));
}

export function legacyFlowFixture(home: string, cwd: string, id = "previous-release-ca075c"): { source: string; state: State; folder: string } {
  const dir = join(projectStorage(home, cwd), "flow");
  cpSync(join(import.meta.dir, "../fixtures/flow-store-previous/flow"), dir, { recursive: true });
  const folder = join(dir, id), source = join(folder, "data/state.json");
  return { source, state: JSON.parse(readFileSync(source, "utf8")), folder };
}

export function legacyFlow(home: string, cwd: string, id: string, state: State | string): string {
  const source = join(projectStorage(home, cwd), "flow", id, "data/state.json");
  mkdirSync(dirname(source), { recursive: true });
  writeFileSync(source, typeof state === "string" ? state : JSON.stringify(state));
  return source;
}

export function legacyBinding(home: string, cwd: string, name: string, value: unknown): string {
  const source = join(projectStorage(home, cwd), "flow/.bindings", `${name}.json`);
  mkdirSync(dirname(source), { recursive: true });
  writeFileSync(source, typeof value === "string" ? value : JSON.stringify(value));
  return source;
}

function openStore(path: string): Database {
  const db = new Database(path);
  db.exec("PRAGMA busy_timeout = 10000");
  return db;
}

export function pendingDatabase(home: string, cwd: string): void {
  const path = join(projectStorage(home, cwd), "flow.db");
  mkdirSync(dirname(path), { recursive: true });
  const db = openStore(path);
  const migrations = join(import.meta.dir, "../../plugin/skills/flow-page/scripts/migrations");
  const initial = readFileSync(join(migrations, "0000_broad_silver_surfer.sql"), "utf8");
  const journal = JSON.parse(readFileSync(join(migrations, "meta/_journal.json"), "utf8"));
  db.exec(initial);
  db.exec("CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)");
  db.query("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)").run(createHash("sha256").update(initial).digest("hex"), journal.entries[0].when);
  db.close();
}

export function storageSnapshot(home: string, cwd: string) {
  const path = join(projectStorage(home, cwd), "flow.db");
  return existsSync(path) ? readFileSync(path) : undefined;
}

export function legacyMetadata(home: string, cwd: string, id: string, name: string, bytes: string): string {
  const path = name === "migration" ? join(projectStorage(home, cwd), "flow/.migrations", id) : join(projectStorage(home, cwd), "flow", id, "data", `${name}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  return path;
}

export function legacyBytes(source: string): Buffer { return readFileSync(source); }
export function legacyBackup(source: string): Buffer { return readFileSync(source.replace(/\.json$/, ".imported.json")); }
export function legacyExists(source: string): boolean { return existsSync(source); }
export function legacySources(home: string, name = "state"): string[] {
  return [...new Bun.Glob(`.vstack/tmp/*/flow/*/data/${name}.json`).scanSync({ cwd: home, dot: true, absolute: true })];
}
export function legacyCompanion(source: string, name: string): string { return join(dirname(source), `${name}.json`); }
export function futureDatabase(home: string, cwd: string): void {
  const db = openStore(join(projectStorage(home, cwd), "flow.db"));
  db.exec("ALTER TABLE flows ADD COLUMN future_nullable TEXT; ALTER TABLE flows ADD COLUMN future_default TEXT NOT NULL DEFAULT ''; CREATE TABLE future_data (flow TEXT, value TEXT); CREATE INDEX future_index ON future_data(flow)");
  db.close();
}
export function refuseFlowDeletion(home: string, flow: string): void {
  const { db } = stored(home, flow);
  db.exec("CREATE TRIGGER refuse_flow_delete BEFORE DELETE ON flows BEGIN SELECT RAISE(ABORT, 'fixture deletion refusal'); END");
  db.close();
}
export function prepareLegacyImport(home: string, cwd: string) {
  const fixture = legacyFlowFixture(home, cwd);
  fixture.state.aliases.push("folder:earlier-folder", "ticket:Org/Repo/51");
  writeFileSync(fixture.source, JSON.stringify(fixture.state));
  writeFileSync(join(fixture.folder, "observation-project.json"), JSON.stringify({ cwd, stage: "stage-1" }));
  const comments = { version: 1, comments: [{ id: "imported-comment", stage: "stage-1", result: "historical-result", revision: 1, edit: null, anchor: { kind: "block" }, text: "Saved before SQLite", time: "2026-11-16T00:00:00Z" }] };
  const learning = { version: 1, attempts: [{ id: "imported-attempt", result: "historical-result", revision: 1, question: "q1", answer: "a", correct: true, time: "2026-11-16T00:00:00Z" }], completed: [{ result: "historical-result", revision: 1 }] };
  legacyMetadata(home, cwd, fixture.state.flow.id, "comments", JSON.stringify(comments));
  legacyMetadata(home, cwd, fixture.state.flow.id, "learning", JSON.stringify(learning));
  writeFileSync(join(projectStorage(home, cwd), "flow/.ids/expired-flow"), "expired-flow");
  return { ...fixture, comments, learning };
}

function stored(home: string, flow: string) {
  for (const path of new Bun.Glob(".vstack/tmp/*/flow.db").scanSync({ cwd: home, dot: true, absolute: true })) {
    const db = openStore(path);
    const row = db.query<{ folder: string; state: string }, [string]>("SELECT folder, state FROM flows WHERE id = ?").get(flow);
    if (row) return { db, row, path };
    db.close();
  }
  throw new Error(`no stored Flow ${flow} under ${home}`);
}

export function storedFolder(home: string, flow: string): string {
  const { db, row, path } = stored(home, flow);
  db.close();
  return join(dirname(path), "flow", row.folder);
}

export function editStoredFlow(home: string, flow: string, edit: (state: State) => void): void {
  const { db, row } = stored(home, flow);
  const state = JSON.parse(row.state) as State;
  edit(state);
  db.query("UPDATE flows SET state = ?, revision = ?, slug = ?, title = ?, created = ?, closed = ? WHERE id = ?").run(JSON.stringify(state), state.revision, state.flow.slug, state.flow.title, state.flow.created, closedAt(state) ?? null, flow);
  db.close();
}

export function editStoredComments(home: string, flow: string, edit: (comments: any, state: State) => void): void {
  const { db, row } = stored(home, flow);
  const comments = JSON.parse(db.query<{ data: string }, [string]>("SELECT data FROM reader_comments WHERE flow = ?").get(flow)!.data);
  edit(comments, JSON.parse(row.state));
  db.query("UPDATE reader_comments SET data = ? WHERE flow = ?").run(JSON.stringify(comments), flow);
  db.close();
}

export function seedHistoricalMermaidCapture(home: string, flow: string, attachment: string, source: Buffer, name: string): void {
  const folder = storedFolder(home, flow);
  const revision = new Bun.CryptoHasher("sha256").update(source).digest("hex");
  const file = `${revision}/${name}`;
  mkdirSync(join(folder, "assets", revision), { recursive: true });
  writeFileSync(join(folder, "assets", file), source);
  editStoredFlow(home, flow, state => {
    Object.assign(state.attachments.find(a => a.id === attachment)!, { revision, file, size: source.length });
    state.revision++;
  });
}

export function touchStoredFiles(dir: string, when: number): void {
  const time = new Date(when);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) touchStoredFiles(path, when);
    utimesSync(path, time, time);
  }
  utimesSync(dir, time, time);
}

export function flowMetadataPaths(home: string, flow: string): string[] {
  const { db, path } = stored(home, flow);
  db.close();
  return [path];
}

export function temporaryFlowFiles(home: string, flow: string): string[] {
  const folder = storedFolder(home, flow);
  return [folder, join(folder, "data")].flatMap(dir => readdirSync(dir).filter(name => name.endsWith(".tmp")));
}

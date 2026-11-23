import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import * as schema from "./schema.ts";
export { and, eq } from "drizzle-orm";
export * from "./schema.ts";

const connections = new Map<string, ReturnType<typeof open>>();
const migrations = readMigrationFiles({ migrationsFolder: join(import.meta.dir, "migrations") });
const busyTimeout = 10_000;
const busyTimeoutPragma = `PRAGMA busy_timeout = ${busyTimeout}`;
function open(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path, { create: true, strict: true });
  sqlite.exec(busyTimeoutPragma);
  // SQLite can return BUSY immediately while another opener switches the journal to WAL.
  const deadline = Date.now() + busyTimeout;
  for (;;) {
    try { sqlite.exec("PRAGMA journal_mode = WAL"); break; }
    catch (error) {
      if ((error as { code?: string }).code !== "SQLITE_BUSY" || Date.now() >= deadline) { sqlite.close(); throw error; }
      Bun.sleepSync(10);
    }
  }
  sqlite.transaction(() => {
    sqlite.exec("CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)");
    const latest = sqlite.query<{ created_at: number }, []>("SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1").get();
    for (const migration of migrations) {
      if (latest && latest.created_at >= migration.folderMillis) continue;
      for (const statement of migration.sql) sqlite.exec(statement);
      sqlite.query("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)").run(migration.hash, migration.folderMillis);
    }
  }).immediate();
  return { sqlite, db: drizzle(sqlite, { schema }) };
}
export function projectDatabase(path: string, readonly = false) {
  if (readonly) {
    const sqlite = new Database(path, { readonly: true, strict: true });
    try {
      sqlite.exec(busyTimeoutPragma);
      const latest = sqlite.query<{ created_at: number }, []>("SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1").get();
      if (migrations.some(migration => !latest || latest.created_at < migration.folderMillis)) throw new Error("pending schema migrations");
      return { sqlite, db: drizzle(sqlite, { schema }) };
    } catch (error) { sqlite.close(); throw error; }
  }
  let connection = connections.get(path);
  if (!connection) { connection = open(path); connections.set(path, connection); }
  return connection;
}

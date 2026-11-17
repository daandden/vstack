import { mkdirSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { State } from "../../plugin/skills/flow-page/scripts/model.ts";
import { Database } from "bun:sqlite";
import { closedAt } from "../../plugin/skills/flow-page/scripts/model.ts";

function stored(home: string, flow: string) {
  for (const path of new Bun.Glob(".vstack/tmp/*/flow.db").scanSync({ cwd: home, dot: true, absolute: true })) {
    const db = new Database(path);
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

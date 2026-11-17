import { mkdirSync, readFileSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { State } from "../../plugin/skills/flow-page/scripts/model.ts";

export function storedFolder(home: string, flow: string): string {
  for (const state of new Bun.Glob(".vstack/tmp/*/flow/*/data/state.json").scanSync({ cwd: home, dot: true, absolute: true })) {
    if (JSON.parse(readFileSync(state, "utf8")).flow?.id === flow) return dirname(dirname(state));
  }
  throw new Error(`no stored Flow ${flow} under ${home}`);
}

function statePathOf(home: string, flow: string): string {
  return join(storedFolder(home, flow), "data", "state.json");
}

export function editStoredFlow(home: string, flow: string, edit: (state: State) => void): void {
  const path = statePathOf(home, flow);
  const state = JSON.parse(readFileSync(path, "utf8")) as State;
  edit(state);
  writeFileSync(path, JSON.stringify(state));
}

export function editStoredComments(home: string, flow: string, edit: (comments: any, state: State) => void): void {
  const path = join(storedFolder(home, flow), "data", "comments.json");
  const comments = JSON.parse(readFileSync(path, "utf8"));
  edit(comments, JSON.parse(readFileSync(statePathOf(home, flow), "utf8")));
  writeFileSync(path, JSON.stringify(comments));
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
  const dir = dirname(storedFolder(home, flow));
  return readdirSync(dir).filter(name => name.startsWith(".")).map(name => join(dir, name));
}

export function temporaryFlowFiles(home: string, flow: string): string[] {
  const folder = storedFolder(home, flow);
  return [folder, join(folder, "data")].flatMap(dir => readdirSync(dir).filter(name => name.endsWith(".tmp")));
}

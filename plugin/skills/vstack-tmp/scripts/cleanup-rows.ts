import { closeSync, lstatSync, openSync, readFileSync, readSync, readdirSync, type BigIntStats } from "node:fs";
import { join, relative } from "node:path";
import { parseHistorical } from "../../flow-page/scripts/migrate.ts";
import { CLOSED_RETENTION, FLOW_KIND, flowRetentionEntries, type FlowRetentionEntry } from "../../flow-page/scripts/store.ts";
import { isScratchSessionId, readScratchSession, SESSION_MARK, TICKETS_KIND } from "./scratch.ts";
import { readSessionLeases } from "./session-leases.ts";

export const DAY = 86_400_000;
export const ATTRIBUTION_UNAVAILABLE = "Session attribution is not available for old Scratch in this project";

type RowKind = "session" | "folder" | "historical" | "flow" | typeof TICKETS_KIND;
export type RowKey = [repo: string, kind: RowKind, name: string];
export type CleanupContext = { ompHome: string; witness?: string; root: string; now: number; ttl: number };
export type RowStatus = { state: "offered" } | { state: "kept" | "withheld"; reason: string };
type Newest = { path: string; stamp: bigint; identity: string };
type Member = { path: string; identity: string; size: number };
export type Row = {
  key: RowKey; members: Member[]; newest?: Newest; size: number; status: RowStatus;
  ancestors: string[]; error?: string; flow?: FlowRetentionEntry; age: number;
};

const offered = { state: "offered" } as const;
const kept = (reason: string): RowStatus => ({ state: "kept", reason });
const withheld = (reason: string): RowStatus => ({ state: "withheld", reason });
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const stat = (path: string) => lstatSync(path, { bigint: true, throwIfNoEntry: false });
const identity = (st: BigIntStats) => `${st.dev}:${st.ino}:${st.birthtimeNs}`;

function realDirs(path: string) {
  return readdirSync(path).sort().filter(name => stat(join(path, name))?.isDirectory());
}

function addMember(ctx: CleanupContext, row: Row, path: string, marked: boolean) {
  let size = 0;
  function measure(file: string, st: BigIntStats) {
    if (st.isDirectory()) {
      for (const name of readdirSync(file)) {
        if (marked && file === path && name === SESSION_MARK) continue;
        const child = join(file, name);
        measure(child, lstatSync(child, { bigint: true }));
      }
      return;
    }
    size += Number(st.size);
    const newest = row.newest;
    if (!newest || st.mtimeNs >= newest.stamp) {
      const rel = relative(ctx.root, file);
      if (!newest || st.mtimeNs > newest.stamp || rel < newest.path) row.newest = { path: rel, stamp: st.mtimeNs, identity: identity(st) };
    }
  }
  try {
    const st = lstatSync(path, { bigint: true });
    measure(path, st);
    row.members.push({ path, identity: identity(st), size });
    row.size += size;
  } catch (error) {
    row.error = `Cannot measure ${path}: ${errorMessage(error)}`;
  }
}

function historicalProtection(path: string): RowStatus | undefined {
  try {
    if (!stat(path)?.isDirectory()) return;
    const page = join(path, "page.jsonl");
    const st = stat(page);
    if (!st) return;
    if (!st.isFile()) return withheld("Historical Grilling state is unreadable");
    const history = parseHistorical(readFileSync(page, "utf8"));
    if (history.flow?.state !== "closed") return kept("Open historical Grilling folder");
  } catch {
    return withheld("Historical Grilling state is unreadable");
  }
}

export function flowStatus(entry: FlowRetentionEntry, ctx: CleanupContext): { status: RowStatus; age: number } {
  const retention = entry.retention;
  if (entry.registry) return { age: 0, status: kept("Flow registry") };
  if (retention === "unreadable") return { age: 0, status: withheld("Flow state or files are unreadable") };
  if (!retention.closed) return { age: 0, status: kept("Open Flow") };
  const age = ctx.now - Date.parse(retention.closed);
  if (!Number.isFinite(age)) return { age: 0, status: withheld("Flow close time is unreadable") };
  return { age, status: age > Math.max(ctx.ttl, CLOSED_RETENTION) ? offered : kept("Newer than the TTL") };
}

function projectRows(ctx: CleanupContext, repo: string, only?: RowKey): Row[] {
  const dir = join(ctx.root, repo);
  const rows = new Map<string, Row>();
  const targetKind = only?.[1], targetName = only?.[2];
  let hasOldScratch = false;
  function row(kind: RowKind, name: string) {
    const id = `${kind}/${name}`;
    let current = rows.get(id);
    if (!current) {
      current = { key: [repo, kind, name], members: [], ancestors: [], size: 0, age: 0, status: offered };
      rows.set(id, current);
    }
    return current;
  }
  for (const kind of realDirs(dir)) {
    const reserved = kind === FLOW_KIND || kind === TICKETS_KIND;
    if (targetKind && (targetKind === FLOW_KIND || targetKind === TICKETS_KIND ? kind !== targetKind : reserved)) continue;
    const kindDir = join(dir, kind);
    if (kind === FLOW_KIND) {
      for (const flow of flowRetentionEntries(dir, targetName)) {
        if (flow.registry) continue;
        const current = row(FLOW_KIND, flow.entry);
        current.flow = flow;
        current.size = flow.size;
        current.members = [{ path: flow.path, identity: "", size: flow.size }];
        Object.assign(current, flowStatus(flow, ctx));
      }
      continue;
    }
    const ancestor = identity(lstatSync(kindDir, { bigint: true }));
    const names = targetKind === TICKETS_KIND && targetName
      ? stat(join(kindDir, targetName)) ? [targetName] : []
      : readdirSync(kindDir).sort();
    for (const name of names) {
      const path = join(kindDir, name);
      if (kind === TICKETS_KIND) {
        const current = row(TICKETS_KIND, name);
        current.ancestors.push(ancestor);
        addMember(ctx, current, path, false);
        continue;
      }
      const protection = kind === "grilling" ? historicalProtection(path) : undefined;
      if (protection) {
        if (!only) row("historical", name).status = protection;
        continue;
      }
      let session: string | undefined;
      try { session = readScratchSession(path); } catch { /* An unreadable mark cannot establish ownership. */ }
      if (!session) hasOldScratch = true;
      if (only && (targetKind !== (session ? "session" : "folder") || targetName !== (session ?? kind))) continue;
      const current = session ? row("session", session) : row("folder", kind);
      current.ancestors.push(ancestor);
      addMember(ctx, current, path, session !== undefined);
    }
  }
  const result = [...rows.values()];
  const parentIds = result.some(row => !row.flow && row.key[1] !== "historical")
    ? [identity(lstatSync(ctx.root, { bigint: true })), identity(lstatSync(dir, { bigint: true }))]
    : [];
  for (const current of result) {
    if (current.flow || current.key[1] === "historical") continue;
    if (current.error) current.status = withheld(current.error);
    else if (hasOldScratch && (current.key[1] === "session" || current.key[1] === "folder")) {
      current.status = withheld(ATTRIBUTION_UNAVAILABLE);
    } else if (current.newest) {
      current.age = ctx.now - Number(current.newest.stamp) / 1e6;
      if (current.age <= ctx.ttl) current.status = kept("Newer than the TTL");
    } else current.status = kept("No files to age");
    current.ancestors.unshift(...parentIds);
  }
  return result;
}

export function buildRows(ctx: CleanupContext, only?: RowKey): Row[] {
  if (!stat(ctx.root)?.isDirectory()) return [];
  const repos = only ? (stat(join(ctx.root, only[0]))?.isDirectory() ? [only[0]] : []) : realDirs(ctx.root);
  const selected = repos.flatMap(repo => projectRows(ctx, repo, only));
  const sessions = new Set(selected.filter(row => row.key[1] === "session" && row.status.state === "offered").map(row => row.key[2]));
  if (!sessions.size) return selected;
  const leases = readSessionLeases(sessions, ctx.witness, ctx.ompHome);
  for (const row of selected) {
    if (row.key[1] !== "session" || row.status.state !== "offered") continue;
    const lease = leases.sessions.get(row.key[2]);
    if (lease?.state === "held") row.status = kept("Session holds a lease");
    else if (lease?.state !== "free") row.status = withheld(lease?.reason ?? "Session lease state is unavailable");
  }
  return selected;
}

function archiveTitle(path: string, id: string): string | undefined {
  if (!stat(path)?.isFile()) return;
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.allocUnsafe(8192);
    const bytes = readSync(fd, buffer);
    const lines = buffer.toString("utf8", 0, bytes).split("\n");
    if (bytes === buffer.length) lines.pop();
    let title: string | undefined, matches = false;
    for (const line of lines.slice(0, 2)) {
      if (!line) break;
      const record = JSON.parse(line);
      if (record.type === "title" && typeof record.title === "string" && record.title.trim()) title = record.title.trim();
      if (record.type === "session") matches = record.id === id;
      if (title && matches) return title;
    }
  } finally { closeSync(fd); }
}

export function sessionTitles(home: string, ids: Set<string>): Map<string, string> {
  const result = new Map<string, string>();
  if (!ids.size) return result;
  const root = join(home, ".omp", "agent", "sessions");
  const names = (path: string) => {
    try { return stat(path)?.isDirectory() ? readdirSync(path).sort().reverse() : []; } catch { return []; }
  };
  for (const slug of names(root)) {
    const dir = join(root, slug);
    for (const name of names(dir)) {
      if (!name.endsWith(".jsonl")) continue;
      const id = name.slice(-42, -6);
      if (!isScratchSessionId(id) || !ids.has(id) || result.has(id)) continue;
      try {
        const title = archiveTitle(join(dir, name), id);
        if (title) result.set(id, title);
      } catch { /* The short id is the label when the archive cannot be read. */ }
    }
    if (result.size === ids.size) break;
  }
  return result;
}

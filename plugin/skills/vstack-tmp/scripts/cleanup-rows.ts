import { lstatSync, readFileSync, readdirSync, type BigIntStats } from "node:fs";
import { join, relative } from "node:path";
import { parseHistorical } from "../../flow-page/scripts/migrate.ts";
import { CLOSED_RETENTION, FLOW_KIND, flowRetentionEntries, type FlowRetentionEntry } from "../../flow-page/scripts/store.ts";
import { readScratchSession, SESSION_MARK, TICKETS_KIND } from "./scratch.ts";
import { searchSessionArchives, type ArchiveLink } from "./session-archives.ts";
import { readSessionLeases } from "./session-leases.ts";

export const DAY = 86_400_000;

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

type OrdinaryRow = Row & { linkedSessions?: Set<string> };
type OrdinaryEntry = { path: string; kind: string; ancestor: string } & (
  { protection: RowStatus } | { session: string } | { directory: boolean }
);
type ArchiveEvidence = { paths: Map<string, boolean>; links?: Map<string, ArchiveLink>; titles?: Map<string, string>; error?: string };
type BuiltRows = { rows: Row[]; archiveError?: string; archiveTitles?: Map<string, string> };

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

function projectInventory(ctx: CleanupContext, repo: string, includeOrdinary: boolean) {
  const dir = join(ctx.root, repo);
  const kinds = realDirs(dir);
  const entries: OrdinaryEntry[] = [];
  if (includeOrdinary) for (const kind of kinds) {
    if (kind === FLOW_KIND || kind === TICKETS_KIND) continue;
    const kindDir = join(dir, kind);
    const ancestor = identity(lstatSync(kindDir, { bigint: true }));
    for (const name of readdirSync(kindDir).sort()) {
      const path = join(kindDir, name);
      let st;
      try { st = lstatSync(path); } catch { /* Measurement reports the unreadable entry on its row. */ }
      const protection = kind === "grilling" ? historicalProtection(path) : undefined;
      if (protection) {
        entries.push({ path, kind, ancestor, protection });
        continue;
      }
      let session: string | undefined;
      try { session = readScratchSession(path, st); } catch { /* An unreadable mark cannot establish ownership. */ }
      entries.push(session ? { path, kind, ancestor, session } : { path, kind, ancestor, directory: st?.isDirectory() ?? false });
    }
  }
  return { repo, dir, kinds, entries };
}

async function readArchives(ctx: CleanupContext, projects: ReturnType<typeof projectInventory>[]): Promise<ArchiveEvidence> {
  const paths = new Map<string, boolean>();
  for (const { entries } of projects) for (const entry of entries) {
    if ("directory" in entry) paths.set(entry.path, entry.directory);
  }
  if (paths.size) {
    try { return { paths, ...await searchSessionArchives(ctx.ompHome, ctx.root, paths) }; }
    catch (error) { return { paths, error: `Session attribution is unavailable: ${errorMessage(error)}` }; }
  }
  return { paths };
}

export function readDeleteArchives(ctx: CleanupContext, keys: RowKey[]) {
  const projects = [];
  for (const repo of new Set(keys.map(key => key[0]))) {
    try {
      if (stat(join(ctx.root, repo))?.isDirectory()) projects.push(projectInventory(ctx, repo, true));
    } catch { /* The rebuild reports unreadable Scratch or rejects old paths the scan did not cover. */ }
  }
  return readArchives(ctx, projects);
}

function projectRows(ctx: CleanupContext, { repo, dir, kinds, entries }: ReturnType<typeof projectInventory>, archives: ArchiveEvidence, only?: RowKey): BuiltRows & { rows: OrdinaryRow[] } {
  const rows = new Map<string, OrdinaryRow>();
  const targetKind = only?.[1], targetName = only?.[2];
  let archiveError: string | undefined;
  function row(kind: RowKind, name: string) {
    const id = `${kind}/${name}`;
    let current = rows.get(id);
    if (!current) {
      current = { key: [repo, kind, name], members: [], ancestors: [], size: 0, age: 0, status: offered };
      rows.set(id, current);
    }
    return current;
  }
  for (const kind of kinds) {
    if (kind !== FLOW_KIND && kind !== TICKETS_KIND || targetKind && kind !== targetKind) continue;
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
      const current = row(TICKETS_KIND, name);
      current.ancestors.push(ancestor);
      addMember(ctx, current, path, false);
    }
  }
  for (const entry of entries) {
    const { path, kind, ancestor } = entry;
    if ("protection" in entry) {
      if (!only) row("historical", path).status = entry.protection;
      continue;
    }
    if (!("session" in entry)) continue;
    if (only && (targetKind !== "session" || targetName !== entry.session)) continue;
    const current = row("session", entry.session);
    current.ancestors.push(ancestor);
    addMember(ctx, current, path, true);
  }
  for (const entry of entries) {
    if (!("directory" in entry)) continue;
    const { path, kind, ancestor, directory } = entry;
    archiveError ??= archives.error;
    if (archives.paths.get(path) !== directory) archiveError ??= "Old Scratch changed during the archive search";
    const link = archives.links?.get(path);
    const rowKind = link ? "session" : "folder", rowName = link?.owner ?? kind;
    if (only && (targetKind !== rowKind || targetName !== rowName)) continue;
    const current = row(rowKind, rowName);
    current.ancestors.push(ancestor);
    addMember(ctx, current, path, false);
    if (link) {
      current.linkedSessions ??= new Set();
      for (const id of link.sessions) current.linkedSessions.add(id);
    }
  }
  const result = [...rows.values()];
  const parentIds = result.some(row => !row.flow && row.key[1] !== "historical")
    ? [identity(lstatSync(ctx.root, { bigint: true })), identity(lstatSync(dir, { bigint: true }))]
    : [];
  for (const current of result) {
    if (current.flow || current.key[1] === "historical") continue;
    if (archiveError && current.key[1] !== TICKETS_KIND) current.status = withheld(archiveError);
    else if (current.error) current.status = withheld(current.error);
    else if (current.newest) {
      current.age = ctx.now - Number(current.newest.stamp) / 1e6;
      if (current.age <= ctx.ttl) current.status = kept("Newer than the TTL");
    } else current.status = kept("No files to age");
    current.ancestors.unshift(...parentIds);
  }
  return { rows: result, archiveError };
}

export async function buildRows(ctx: CleanupContext, selection?: { key: RowKey; archives: ArchiveEvidence }): Promise<BuiltRows> {
  if (!stat(ctx.root)?.isDirectory()) return { rows: [] };
  const only = selection?.key;
  const repos = only ? (stat(join(ctx.root, only[0]))?.isDirectory() ? [only[0]] : []) : realDirs(ctx.root);
  const includeOrdinary = only?.[1] !== FLOW_KIND && only?.[1] !== TICKETS_KIND;
  const projects = repos.map(repo => projectInventory(ctx, repo, includeOrdinary));
  const archives = selection?.archives ?? await readArchives(ctx, projects);
  const builds = projects.map(project => projectRows(ctx, project, archives, only));
  const rows = builds.flatMap(build => build.rows);
  const sessions = new Set<string>();
  let needsEnumeration = false;
  for (const row of rows) {
    if (row.status.state !== "offered") continue;
    if (row.key[1] === "folder") needsEnumeration = true;
    if (row.key[1] !== "session") continue;
    sessions.add(row.key[2]);
    if (row.linkedSessions) for (const id of row.linkedSessions) sessions.add(id);
  }
  if (sessions.size || needsEnumeration) {
    const leases = readSessionLeases(sessions, ctx.witness, ctx.ompHome);
    for (const row of rows) {
      if (row.status.state !== "offered") continue;
      if (row.key[1] === "folder" && !leases.unnamed.available) row.status = withheld(leases.unnamed.reason);
      if (row.key[1] !== "session") continue;
      const id = row.key[2];
      const own = leases.sessions.get(id);
      const linked = row.linkedSessions && [...row.linkedSessions].map(session => leases.sessions.get(session));
      if (own?.state === "held") row.status = kept("Session holds a lease");
      else if (linked?.some(lease => lease?.state === "held")) row.status = kept("A session linked by the archive holds a lease");
      else if (own?.state !== "free") row.status = withheld(own?.reason ?? "Session lease state is unavailable");
      else {
        const unknown = linked?.find(lease => lease?.state === "unknown");
        if (unknown?.state === "unknown") row.status = withheld(unknown.reason);
      }
    }
  }
  return { rows, archiveError: only ? builds[0]?.archiveError : undefined, archiveTitles: archives.titles };
}

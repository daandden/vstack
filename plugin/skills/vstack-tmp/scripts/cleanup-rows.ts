import { lstatSync, readFileSync, readdirSync, type BigIntStats } from "node:fs";
import { join, relative } from "node:path";
import { parseHistorical } from "../../flow-page/scripts/migrate.ts";
import { CLOSED_RETENTION, FLOW_KIND, flowRetentionEntries, type FlowRetentionEntry } from "../../flow-page/scripts/store.ts";
import { readScratchSession, SESSION_MARK, TICKETS_KIND } from "./scratch.ts";
import { searchSessionArchives } from "./session-archives.ts";
import { captureSessionLeases, readSessionLeases } from "./session-leases.ts";

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

type OrdinaryRow = Row & { linkedSessions?: Set<string>; hasLegacy?: boolean };
type OrdinaryEntry = { path: string; kind: string; ancestor: string } & (
  { protection: RowStatus } | { session: string } | { directory: boolean }
);
type ArchiveEvidence = { paths: Map<string, boolean>; error?: string } & Partial<Awaited<ReturnType<typeof searchSessionArchives>>>;
type LeaseSnapshot = ReturnType<typeof captureSessionLeases>;
type DeleteEvidence = { archives: ArchiveEvidence; leases?: LeaseSnapshot };
type BuiltRows = { rows: Row[]; inventoryIssues: string[]; selectionError?: string; archiveTitles?: Map<string, string> };
type InventoryIssue = { kind?: string; reason: string };
type ProjectInventory = {
  repo: string; dir: string; identity?: string; kinds: Map<string, string>; entries: OrdinaryEntry[]; issues: InventoryIssue[];
};

const offered = { state: "offered" } as const;
const unavailableLease = "Session lease state is unavailable";
const kept = (reason: string): RowStatus => ({ state: "kept", reason });
const withheld = (reason: string): RowStatus => ({ state: "withheld", reason });
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const stat = (path: string) => lstatSync(path, { bigint: true, throwIfNoEntry: false });
const identity = (st: BigIntStats) => `${st.dev}:${st.ino}:${st.birthtimeNs}`;

const isRecordKind = (kind: string | undefined) => kind === FLOW_KIND || kind === TICKETS_KIND;
const inventoryIssue = (path: string, error: unknown, kind?: string): InventoryIssue =>
  ({ kind, reason: `Cannot read Scratch inventory at ${path}: ${errorMessage(error)}` });

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

function projectInventory(ctx: CleanupContext, repo: string, recordKind?: string): ProjectInventory | undefined {
  const dir = join(ctx.root, repo);
  const project: ProjectInventory = { repo, dir, kinds: new Map(), entries: [], issues: [] };
  let names: string[];
  try {
    const st = stat(dir);
    if (!st?.isDirectory()) return undefined;
    project.identity = identity(st);
    names = recordKind ? [recordKind] : readdirSync(dir).sort();
  } catch (error) {
    project.issues.push(inventoryIssue(dir, error));
    return project;
  }
  for (const kind of names) {
    const kindDir = join(dir, kind);
    let children: string[], ancestor: string;
    try {
      const st = stat(kindDir);
      if (!st?.isDirectory()) continue;
      ancestor = identity(st);
      project.kinds.set(kind, ancestor);
      if (isRecordKind(kind)) continue;
      children = readdirSync(kindDir).sort();
    } catch (error) {
      project.issues.push(inventoryIssue(kindDir, error, kind));
      continue;
    }
    for (const name of children) {
      const path = join(kindDir, name);
      try {
        const st = lstatSync(path);
        const protection = kind === "grilling" ? historicalProtection(path) : undefined;
        if (protection) project.entries.push({ path, kind, ancestor, protection });
        else {
          const session = readScratchSession(path, st);
          project.entries.push(session ? { path, kind, ancestor, session } : { path, kind, ancestor, directory: st.isDirectory() });
        }
      } catch (error) {
        project.issues.push(inventoryIssue(path, error, kind));
      }
    }
  }
  return project;
}

async function readArchives(ctx: CleanupContext, projects: ProjectInventory[], isHeld?: (id: string) => boolean): Promise<ArchiveEvidence> {
  const paths = new Map<string, boolean>();
  for (const { entries } of projects) for (const entry of entries) {
    if ("directory" in entry) paths.set(entry.path, entry.directory);
  }
  if (paths.size) {
    try { return { paths, ...await searchSessionArchives(ctx.ompHome, ctx.root, paths, isHeld) }; }
    catch (error) { return { paths, error: `Session attribution is unavailable: ${errorMessage(error)}` }; }
  }
  return { paths };
}

export async function readDeleteEvidence(ctx: CleanupContext, keys: RowKey[]): Promise<DeleteEvidence> {
  const ordinary = keys.filter(key => key[1] === "session" || key[1] === "folder");
  const leases = ordinary.length ? captureSessionLeases(ctx.witness, ctx.ompHome) : undefined;
  const projects = [];
  for (const repo of new Set(ordinary.map(key => key[0]))) {
    const project = projectInventory(ctx, repo);
    if (project) projects.push(project);
  }
  return { leases, archives: await readArchives(ctx, projects, leases?.isHeld) };
}

function projectRows(ctx: CleanupContext, rootIdentity: string, project: ProjectInventory, archives: ArchiveEvidence, only?: RowKey) {
  const { repo, dir, kinds, entries, issues } = project;
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
  for (const [kind, ancestor] of kinds) {
    if (!isRecordKind(kind) || targetKind && kind !== targetKind) continue;
    const kindDir = join(dir, kind);
    try {
      if (kind === FLOW_KIND) {
        for (const flow of flowRetentionEntries(dir, targetName)) {
          if (flow.registry) continue;
          const current = row(FLOW_KIND, flow.entry);
          current.flow = flow;
          current.size = flow.size;
          current.members = [{ path: flow.path, identity: flow.folderIdentity, size: flow.size }];
          Object.assign(current, flowStatus(flow, ctx));
        }
      } else {
        const names = targetName ? stat(join(kindDir, targetName)) ? [targetName] : [] : readdirSync(kindDir).sort();
        for (const name of names) {
          const current = row(TICKETS_KIND, name);
          current.ancestors.push(ancestor);
          addMember(ctx, current, join(kindDir, name), false);
        }
      }
    } catch (error) {
      issues.push(inventoryIssue(kindDir, error, kind));
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
    current.hasLegacy = true;
    current.ancestors.push(ancestor);
    addMember(ctx, current, path, false);
    if (link) {
      current.linkedSessions ??= new Set();
      for (const id of link.sessions) current.linkedSessions.add(id);
    }
  }
  const result = [...rows.values()];
  function blockingInventory([, kind, name]: RowKey) {
    return issues.find(issue => issue.kind === undefined ||
      (kind === "session" ? !isRecordKind(issue.kind) : kind === "folder" ? name === issue.kind : kind === issue.kind))?.reason;
  }
  for (const current of result) {
    if (current.flow || current.key[1] === "historical") continue;
    const issue = blockingInventory(current.key);
    if (issue) current.status = withheld(issue);
    else if (archiveError && current.key[1] !== TICKETS_KIND) current.status = withheld(archiveError);
    else if (current.hasLegacy && archives.heldArchiveError) current.status = withheld(archives.heldArchiveError);
    else if (current.error) current.status = withheld(current.error);
    else if (current.newest) {
      current.age = ctx.now - Number(current.newest.stamp) / 1e6;
      if (current.age <= ctx.ttl) current.status = kept("Newer than the TTL");
    } else current.status = kept("No files to age");
    current.ancestors.unshift(rootIdentity, project.identity!);
  }
  const selectionError = only && (blockingInventory(only) ?? archiveError);
  return { rows: result, selectionError, inventoryIssues: issues.map(issue => issue.reason) };
}

function rowLeaseStatus(row: OrdinaryRow, leases: ReturnType<typeof readSessionLeases>): RowStatus {
  if (row.key[1] === "folder") return leases.unnamed.available ? offered : withheld(leases.unnamed.reason);
  if (row.key[1] !== "session") return offered;
  const own = leases.sessions.get(row.key[2]);
  if (own?.state === "held") return kept("Session holds a lease");
  let unavailable = own?.state === "free" ? undefined : own?.reason ?? unavailableLease;
  if (row.linkedSessions) for (const id of row.linkedSessions) {
    const linked = leases.sessions.get(id);
    if (linked?.state === "held") return kept("A session linked by the archive holds a lease");
    if (linked?.state !== "free") unavailable ??= linked?.reason ?? unavailableLease;
  }
  return unavailable === undefined ? offered : withheld(unavailable);
}

/** Rereads changed archives of live sessions, so the row rebuilt next sees their latest mentions. */
export async function settleDeleteEvidence(ctx: CleanupContext, key: RowKey, evidence: DeleteEvidence) {
  if (key[1] !== "session" && key[1] !== "folder") return;
  const current = captureSessionLeases(ctx.witness, ctx.ompHome);
  const { archives, leases: early } = evidence;
  if (archives.settleHeldArchives) {
    archives.heldArchiveError = await archives.settleHeldArchives(id => current.isHeld(id) || !!early?.isHeld(id));
  }
}

/** Reads leases right before removal; `changed` means a live archive changed after the settle, so the row needs a rebuild. */
export function recheckRowLeases(ctx: CleanupContext, row: OrdinaryRow, evidence: DeleteEvidence): RowStatus | { state: "changed"; reason: string } {
  const [, kind, id] = row.key;
  if (kind !== "session" && kind !== "folder") return offered;
  try {
    const final = captureSessionLeases(ctx.witness, ctx.ompHome);
    const status = rowLeaseStatus(row, final.read(kind === "session" ? row.linkedSessions ?? [id] : []));
    if (status.state !== "offered" || !row.hasLegacy) return status;
    const { archives, leases: early } = evidence;
    if (!early || !archives.changedHeldArchive) return withheld("Session archive freshness is unavailable");
    const changed = archives.changedHeldArchive(session => final.isHeld(session) || early.isHeld(session));
    return changed ? { state: "changed", reason: `Held session archive kept changing during the recheck: ${changed}` } : offered;
  } catch (error) {
    return withheld(`Cannot recheck session leases: ${errorMessage(error)}`);
  }
}

export async function buildRows(ctx: CleanupContext, selection?: { key: RowKey } & DeleteEvidence): Promise<BuiltRows> {
  const rootStat = stat(ctx.root);
  if (!rootStat?.isDirectory()) return { rows: [], inventoryIssues: [] };
  const only = selection?.key;
  const repos = only ? [only[0]] : readdirSync(ctx.root).sort();
  const recordKind = isRecordKind(only?.[1]) ? only?.[1] : undefined;
  const projects = repos.flatMap(repo => {
    const project = projectInventory(ctx, repo, recordKind);
    return project ? [project] : [];
  });
  const archives = selection?.archives ?? await readArchives(ctx, projects);
  const rootIdentity = identity(rootStat);
  const builds = projects.map(project => projectRows(ctx, rootIdentity, project, archives, only));
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
    const leases = selection?.leases?.read(sessions) ?? readSessionLeases(sessions, ctx.witness, ctx.ompHome);
    for (const row of rows) {
      if (row.status.state === "offered") row.status = rowLeaseStatus(row, leases);
    }
  }
  return {
    rows, selectionError: only ? builds[0]?.selectionError : undefined, archiveTitles: archives.titles,
    inventoryIssues: builds.flatMap(build => build.inventoryIssues),
  };
}

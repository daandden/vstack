import { createHash } from "node:crypto";
import { lstatSync, readdirSync, rmdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { removeEntry } from "../../flow-page/scripts/files.ts";
import { prepareStorage } from "../../flow-page/scripts/live.ts";
import { compactFlowDatabase, deleteFlowEntry } from "../../flow-page/scripts/store.ts";
import { buildRows, DAY, flowStatus, readDeleteArchives, type CleanupContext, type Row, type RowKey } from "./cleanup-rows.ts";
import { isScratchSessionId, scratchRoot, TICKETS_KIND } from "./scratch.ts";
import { sessionTitles } from "./session-archives.ts";

const UNITS: Record<string, number> = { h: 3_600_000, d: 86_400_000, w: 604_800_000 };

function usage(message: string): never {
  process.stderr.write(`clean.ts: ${message}\nusage: bun clean.ts --home <dir> [--omp-home <dir>] [--witness <session-id>] [--older-than <age>] [--now <time>] [--delete <snapshot>...]\n`);
  process.exit(2);
}

let parsed;
try {
  parsed = parseArgs({
    args: Bun.argv.slice(2),
    options: { home: { type: "string" }, "omp-home": { type: "string" }, witness: { type: "string" }, "older-than": { type: "string" }, now: { type: "string" }, delete: { type: "boolean" } },
    allowPositionals: true,
  });
} catch (e) {
  usage((e as Error).message);
}
const { values, positionals } = parsed;
if (!values.home) usage("--home is required");
if (positionals.length > 0 && !values.delete) usage(`unexpected argument ${positionals[0]}`);
const olderThan = values["older-than"] ?? "15d";
const m = /^(\d+)([hdw]?)$/.exec(olderThan);
if (!m) usage(`--older-than must look like 90d, 90, 36h, or 2w, got ${JSON.stringify(olderThan)}`);
const ttl = Number(m[1]) * UNITS[m[2] || "d"];
const home = resolve(values.home);
const root = scratchRoot(home);
const now = values.now === undefined ? Date.now() : Date.parse(values.now);
if (Number.isNaN(now)) usage(`--now must be an ISO date and time, got ${JSON.stringify(values.now)}`);

const ctx: CleanupContext = {
  ompHome: resolve(values["omp-home"] ?? home), witness: values.witness ?? process.env.PI_SESSION_ID,
  root, now, ttl,
};

function checkAncestors(dir: string) {
  let ancestor = home;
  for (const part of relative(home, dir).split(sep)) {
    ancestor = join(ancestor, part);
    const st = lstatSync(ancestor, { throwIfNoEntry: false });
    if (st && !st.isDirectory()) throw new Error(`${ancestor} is not a directory`);
  }
}
try { checkAncestors(root); } catch (error) { usage((error as Error).message); }

type Snapshot = [version: 1, key: RowKey, request: string, members: string, newest: string];
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("base64url");
const request = digest([home, ctx.ompHome, olderThan]);
const hash = /^[A-Za-z0-9_-]{43}$/;
function segment(value: unknown): value is string {
  return typeof value === "string" && value !== "" && value !== "." && value !== ".." && !/[\/\\\0]/.test(value);
}
function parseSnapshot(raw: string): Snapshot {
  try {
    const snap = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (Array.isArray(snap) && snap.length === 5 && snap[0] === 1 && Array.isArray(snap[1]) && snap[1].length === 3) {
      const [repo, kind, name] = snap[1];
      if (segment(repo) && segment(name) && (kind === "flow" || kind === TICKETS_KIND || kind === "folder" || kind === "session" && isScratchSessionId(name)) &&
          snap.slice(2).every(value => typeof value === "string" && hash.test(value))) return snap as Snapshot;
    }
  } catch { /* Report bad input below without starting a delete. */ }
  usage("--delete needs the unchanged snapshot from a listing, not an entry path");
}
function flowIdentity(flow: NonNullable<Row["flow"]>) {
  return digest(flow.retention && flow.retention !== "unreadable" ? flow.retention.flow : null);
}
function membersHash(row: Row) {
  return row.flow ? flowIdentity(row.flow)
    : digest([row.ancestors, row.members.map(({ path, identity }) => [relative(root, path), identity])]);
}
function newestHash(row: Row) {
  return digest(row.newest ? [row.newest.path, row.newest.stamp.toString(), row.newest.identity] : null);
}
function snapshot(row: Row) {
  const value: Snapshot = [1, row.key, request, membersHash(row), newestHash(row)];
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
function display([repo_key, kind, name]: RowKey, titles: Map<string, string>, row?: Row) {
  return { repo_key, kind, name, label: kind === "session" ? titles.get(name) ?? name.slice(0, 8) : name,
    ...(kind === "flow" || kind === TICKETS_KIND ? { path: row?.members[0]?.path } : {}) };
}

// Resolves once stdout has taken every byte, so a following process.exit cannot cut a piped listing at the pipe buffer.
const print = (v: unknown) => new Promise<void>((done, fail) => process.stdout.write(`${JSON.stringify(v, null, 2)}\n`, (e) => (e ? fail(e) : done())));

if (!values.delete) {
  const { rows: inventory, archiveTitles } = await buildRows(ctx);
  const ready = inventory.filter(row => row.status.state === "offered");
  const titles = archiveTitles ?? sessionTitles(ctx.ompHome, new Set(ready.filter(row => row.key[1] === "session").map(row => row.key[2])));
  const rows = ready.map(row => {
    const [_, kind, name] = row.key;
    const closed = row.flow?.retention;
    return {
      ...display(row.key, titles, row), ...(kind === "session" ? { session_id: name } : {}),
      ...(typeof closed === "object" && closed.closed ? { closed: closed.closed } : {}),
      age_days: Math.floor(row.age / DAY), age_seconds: Math.floor(row.age / 1000), size: row.size, snapshot: snapshot(row),
    };
  });
  const reasons = new Map<string, number>();
  let kept = 0;
  for (const { status } of inventory) {
    if (status.state === "kept") kept++;
    else if (status.state === "withheld") reasons.set(status.reason, (reasons.get(status.reason) ?? 0) + 1);
  }
  await print({ root, older_than: olderThan, rows, kept, withheld: [...reasons].map(([reason, count]) => ({ reason, count })) });
  process.exit(0);
}

if (positionals.length === 0) usage("--delete needs at least one row snapshot");
const targets = [...new Set(positionals)].map(parseSnapshot);
const selected = targets.filter(snap => snap[2] === request).map(snap => snap[1]);
const archives = await readDeleteArchives(ctx, selected);
const titles = archives.titles ?? sessionTitles(ctx.ompHome, new Set(selected.filter(key => key[1] === "session").map(key => key[2])));
type Completed = ReturnType<typeof display> & { removed: string[]; freed: number };
type Failure = { path: string; reason: string };
const deleted: Completed[] = [];
const skipped: (ReturnType<typeof display> & { reason: string })[] = [];
const partial: (Completed & { failed_entries: Failure[] })[] = [];
const pruned: string[] = [];
const compact = new Set<string>();
let storagePrepared = false;
for (const [_, key, scope, members, newest] of targets) {
  if (scope !== request) {
    skipped.push({ ...display(key, titles), reason: "Snapshot home or age does not match" });
    continue;
  }
  let row: Row | undefined;
  let archiveError: string | undefined;
  try {
    checkAncestors(root);
    const rebuilt = await buildRows(ctx, { key, archives });
    [row] = rebuilt.rows;
    archiveError = rebuilt.archiveError;
  } catch (error) {
    skipped.push({ ...display(key, titles), reason: (error as Error).message });
    continue;
  }
  const shown = display(key, titles, row);
  const reason = !row ? (key[1] === "session" || key[1] === "folder" ? archiveError : undefined) ?? "Row is missing"
    : row.status.state !== "offered" ? row.status.reason
    : membersHash(row) !== members ? "Row members changed or were replaced"
    : !row.flow && newestHash(row) !== newest ? "Newest file or its time changed"
    : undefined;
  if (!row || reason) {
    skipped.push({ ...shown, reason: reason ?? "Row is missing" });
    continue;
  }

  const removed: string[] = [];
  const failed_entries: Failure[] = [];
  let freed = 0;
  for (const member of row.members) {
    const parent = dirname(member.path);
    try {
      checkAncestors(parent);
      if (row.flow) {
        if (!storagePrepared) { await prepareStorage(home); storagePrepared = true; }
        checkAncestors(parent);
        const refusal = await deleteFlowEntry(member.path, entry => {
          if (flowIdentity(entry) !== members) return "Flow identity changed";
          const { status } = flowStatus(entry, ctx);
          if (status.state !== "offered") return status.reason;
        });
        if (refusal) {
          skipped.push({ ...shown, reason: refusal });
          break;
        }
        if (row.flow.retention) compact.add(join(root, key[0]));
      } else {
        removeEntry(member.path);
      }
      removed.push(member.path);
      freed += member.size;
    } catch (error) {
      failed_entries.push({ path: member.path, reason: (error as Error).message });
      continue;
    }
    for (const dir of [parent, dirname(parent)]) {
      try {
        checkAncestors(dir);
        if (readdirSync(dir).length) break;
        rmdirSync(dir);
        pruned.push(dir);
      } catch (error) {
        failed_entries.push({ path: dir, reason: (error as Error).message });
        break;
      }
    }
  }
  const completed = { ...shown, removed, freed };
  if (failed_entries.length) partial.push({ ...completed, failed_entries });
  else if (removed.length) deleted.push(completed);
}
const maintenance_errors: Failure[] = [];
for (const projectScratch of compact) {
  try { compactFlowDatabase(projectScratch); }
  catch (error) { maintenance_errors.push({ path: projectScratch, reason: (error as Error).message }); }
}
await print({ root, deleted, skipped, partial, pruned, maintenance_errors });

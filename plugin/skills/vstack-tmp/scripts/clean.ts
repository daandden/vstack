// Lists and deletes expired Scratch entries under <home>/.vstack/tmp/<repo-key>/<kind>/<entry>.
//
//   bun clean.ts --home <dir> [--older-than <age>] [--now <time>]                     list (dry run)
//   bun clean.ts --home <dir> [--older-than <age>] [--now <time>] --delete <path>...  delete those entries
//
// <age> is <n>d, <n>h, <n>w, or a bare <n> for days (default 15d). An entry's age comes from the newest mtime of the entry and
// everything inside it. Symlinks are never followed: a link counts by its own mtime and is deleted as a link.
// A Flow in the `flow` kind is the exception: its age comes from its lifecycle, never from file times or page reads. An
// open Flow is never listed or deleted, and a closed one is listed once it has been closed longer than <age> and at least
// 15 days. The kind's dot entries, the Flow id registry and the session bindings, are never entries; deleting a Flow
// deletes its bindings and keeps its id registered, so the id reports the loss instead of starting again empty.
// <time> is an ISO date and time to measure ages from (default: now).
// The listing prints JSON {root, older_than, entries: [{path, repo_key, kind, entry, newest_mtime, age_days, size, closed?}], kept}.
// A delete re-checks each entry, deletes the ones still older than <age>, removes kind and key dirs it leaves
// empty, and prints JSON {root, deleted, skipped: [{path, reason}], pruned}. Exit 2 on a usage error, and on a
// delete path that is not an entry under the root, before anything is deleted.

import { lstatSync, readFileSync, readdirSync, rmdirSync, type Stats } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { CLOSED_RETENTION, compactFlowDatabase, deleteFlowEntry, FLOW_KIND, flowRetentionEntries, flowRetentionEntry, type FlowRetentionEntry } from "../../flow-page/scripts/store.ts";
import { measureEntry, removeEntry } from "../../flow-page/scripts/files.ts";
import { scratchRoot } from "./scratch.ts";
import { parseHistorical } from "../../flow-page/scripts/migrate.ts";
import { prepareStorage } from "../../flow-page/scripts/live.ts";

const UNITS: Record<string, number> = { h: 3_600_000, d: 86_400_000, w: 604_800_000 };

function usage(message: string): never {
  process.stderr.write(`clean.ts: ${message}\nusage: bun clean.ts --home <dir> [--older-than <n>|<n>d|<n>h|<n>w] [--now <time>] [--delete <path>...]\n`);
  process.exit(2);
}

let parsed;
try {
  parsed = parseArgs({
    args: Bun.argv.slice(2),
    options: { home: { type: "string" }, "older-than": { type: "string" }, now: { type: "string" }, delete: { type: "boolean" } },
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
await prepareStorage(home);
const root = scratchRoot(home);
const now = values.now === undefined ? Date.now() : Date.parse(values.now);
if (Number.isNaN(now)) usage(`--now must be an ISO date and time, got ${JSON.stringify(values.now)}`);

const lstat = (p: string): Stats | undefined => {
  try {
    return lstatSync(p);
  } catch {
    return undefined;
  }
};
const realDirs = (p: string) => readdirSync(p).filter((n) => lstat(join(p, n))?.isDirectory());

// Validate every component walked below --home before listing or deleting through it.
let ancestor = home;
for (const part of relative(home, root).split(sep)) {
  ancestor = join(ancestor, part);
  const st = lstat(ancestor);
  if (st && !st.isDirectory()) usage(`${ancestor} is not a directory`);
}

type RetentionDecision = { registry: true } | { registry?: false; due: boolean; age: number; newest: number; size: number; flow?: string; closed?: string; reason: string };

function retentionDecision(kind: string, entry: string, path: string, st: Stats, stored?: FlowRetentionEntry): RetentionDecision {
  const flowEntry = kind === FLOW_KIND ? stored ?? flowRetentionEntry(path) : undefined;
  if (flowEntry?.registry) return { registry: true };
  const { newest, size } = flowEntry ?? measureEntry(path, st);
  if (kind === "grilling" && st.isDirectory() && lstat(join(path, "page.jsonl"))?.isFile()) {
    try {
      const history = parseHistorical(readFileSync(join(path, "page.jsonl"), "utf8"));
      if (history.flow?.state !== "closed") return { due: false, age: now - newest, newest, size, reason: "open historical Flow" };
    } catch {
      return { due: false, age: now - newest, newest, size, reason: "historical Flow state unreadable" };
    }
  }
  const flow = flowEntry?.retention;
  if (flow === "unreadable") return { due: false, age: now - newest, newest, size, reason: "Flow state unreadable" };
  if (flow && flow.closed === undefined) return { due: false, age: now - newest, newest, size, flow: flow.flow, reason: "open Flow" };
  if (flow) {
    const age = now - Date.parse(flow.closed!);
    return { due: age > Math.max(ttl, CLOSED_RETENTION), age, newest, size, flow: flow.flow, closed: flow.closed, reason: "newer than the TTL" };
  }
  return { due: now - newest > ttl, age: now - newest, newest, size, reason: "newer than the TTL" };
}

function entriesOf(projectScratch: string, kind: string): { path: string; entry: string; stored?: FlowRetentionEntry }[] {
  if (kind === FLOW_KIND) return flowRetentionEntries(projectScratch).map(stored => ({ path: stored.path, entry: stored.entry, stored }));
  const dir = join(projectScratch, kind);
  return readdirSync(dir).sort().map(entry => ({ path: join(dir, entry), entry }));
}

// Resolves once stdout has taken every byte, so a following process.exit cannot cut a piped listing at the pipe buffer.
const print = (v: unknown) => new Promise<void>((done, fail) => process.stdout.write(`${JSON.stringify(v, null, 2)}\n`, (e) => (e ? fail(e) : done())));

if (!values.delete) {
  const entries = [];
  let kept = 0;
  if (lstat(root)?.isDirectory()) {
    for (const repoKey of realDirs(root).sort()) {
      for (const kind of realDirs(join(root, repoKey)).sort()) {
        for (const { entry, path, stored } of entriesOf(join(root, repoKey), kind)) {
          const st = lstat(path);
          if (!st) continue;
          const v = retentionDecision(kind, entry, path, st, stored);
          if (v.registry) continue;
          if (!v.due) {
            kept++;
            continue;
          }
          const age_days = Math.floor(v.age / UNITS.d);
          entries.push({ path, repo_key: repoKey, kind, entry, newest_mtime: new Date(v.newest).toISOString(), age_days, size: v.size, ...(v.closed ? { closed: v.closed } : {}) });
        }
      }
    }
  }
  await print({ root, older_than: olderThan, entries, kept });
  process.exit(0);
}

// Delete: every path has to name an entry at depth 3 under the root before anything is touched.
if (positionals.length === 0) usage("--delete needs at least one entry path");
const targets = positionals.map((p) => {
  const abs = resolve(p);
  const rel = relative(root, abs);
  const parts = rel.split(sep);
  if (!isAbsolute(p) || isAbsolute(rel) || parts.length !== 3 || parts.some((s) => s === "" || s === "." || s === "..")) {
    usage(`${p} is not an entry under ${root} (<repo-key>/<kind>/<entry>)`);
  }
  // The key and kind dirs have to be real directories, so a linked key dir never leads the delete elsewhere.
  for (const dir of [join(root, parts[0]), join(root, parts[0], parts[1])]) {
    const st = lstat(dir);
    if (st && !st.isDirectory()) usage(`${dir} is not a directory`);
  }
  return { path: abs, kind: parts[1], entry: parts[2] };
});

const deleted: string[] = [];
const skipped: { path: string; reason: string }[] = [];
const pruned: string[] = [];
const compact = new Set<string>();
for (const { path, kind, entry } of targets) {
  const st = lstat(path);
  if (!st) {
    skipped.push({ path, reason: "missing" });
    continue;
  }
  const v = retentionDecision(kind, entry, path, st);
  if (v.registry) {
    skipped.push({ path, reason: "Flow registry" });
    continue;
  }
  if (!v.due) {
    skipped.push({ path, reason: v.reason });
    continue;
  }
  if (kind === FLOW_KIND) {
    const reason = await deleteFlowEntry(path, stored => {
      const again = retentionDecision(kind, entry, path, lstatSync(path), stored);
      return again.registry ? "Flow registry" : again.due ? undefined : again.reason;
    });
    if (reason) {
      skipped.push({ path, reason });
      continue;
    }
    if (v.flow) compact.add(join(path, "..", ".."));
  } else {
    removeEntry(path);
  }
  deleted.push(path);
  const kindDir = join(path, "..");
  for (const dir of [kindDir, join(kindDir, "..")]) {
    if (readdirSync(dir).length > 0) break;
    rmdirSync(dir);
    pruned.push(dir);
  }
}
for (const projectScratch of compact) compactFlowDatabase(projectScratch);
await print({ root, deleted, skipped, pruned });

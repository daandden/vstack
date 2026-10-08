// Lists and deletes expired Scratch entries under <home>/.vstack/tmp/<repo-key>/<kind>/<entry>.
//
//   bun clean.ts --home <dir> [--older-than <age>]                     list (dry run)
//   bun clean.ts --home <dir> [--older-than <age>] --delete <path>...  delete those entries
//
// <age> is <n>d, <n>h, <n>w, or a bare <n> for days (default 14d). An entry's age comes from the newest mtime of the entry and
// everything inside it. Symlinks are never followed: a link counts by its own mtime and is deleted as a link.
// The listing prints JSON {root, older_than, entries: [{path, repo_key, kind, entry, newest_mtime, age_days, size}], kept}.
// A delete re-checks each entry, deletes the ones still older than <age>, removes kind and key dirs it leaves
// empty, and prints JSON {root, deleted, skipped: [{path, reason}], pruned}. Exit 2 on a usage error, and on a
// delete path that is not an entry under the root, before anything is deleted.

import { lstatSync, readdirSync, rmdirSync, unlinkSync, type Stats } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { scratchRoot } from "../../vstack-tmp/scripts/scratch.ts";

const UNITS: Record<string, number> = { h: 3_600_000, d: 86_400_000, w: 604_800_000 };

function usage(message: string): never {
  process.stderr.write(`clean.ts: ${message}\nusage: bun clean.ts --home <dir> [--older-than <n>|<n>d|<n>h|<n>w] [--delete <path>...]\n`);
  process.exit(2);
}

let parsed;
try {
  parsed = parseArgs({
    args: Bun.argv.slice(2),
    options: { home: { type: "string" }, "older-than": { type: "string" }, delete: { type: "boolean" } },
    allowPositionals: true,
  });
} catch (e) {
  usage((e as Error).message);
}
const { values, positionals } = parsed;
if (!values.home) usage("--home is required");
if (positionals.length > 0 && !values.delete) usage(`unexpected argument ${positionals[0]}`);
const olderThan = values["older-than"] ?? "14d";
const m = /^(\d+)([hdw]?)$/.exec(olderThan);
if (!m) usage(`--older-than must look like 14d, 14, 36h, or 2w, got ${JSON.stringify(olderThan)}`);
const ttl = Number(m[1]) * UNITS[m[2] || "d"];
const home = resolve(values.home);
const root = scratchRoot(home);
const now = Date.now();

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
/** Newest mtime and total size of an entry and everything inside it, without following links. */
function measure(p: string, st: Stats): { newest: number; size: number } {
  let newest = st.mtimeMs;
  let size = st.isDirectory() ? 0 : st.size;
  if (st.isDirectory()) {
    for (const name of readdirSync(p)) {
      const child = join(p, name);
      const cst = lstat(child);
      if (!cst) continue;
      const sub = measure(child, cst);
      newest = Math.max(newest, sub.newest);
      size += sub.size;
    }
  }
  return { newest, size };
}

/** Removes a file, a link, or a directory tree, unlinking links instead of following them. */
function remove(p: string) {
  const st = lstatSync(p);
  if (st.isDirectory()) {
    for (const name of readdirSync(p)) remove(join(p, name));
    rmdirSync(p);
  } else {
    unlinkSync(p);
  }
}

const print = (v: unknown) => process.stdout.write(`${JSON.stringify(v, null, 2)}\n`);

if (!values.delete) {
  const entries = [];
  let kept = 0;
  if (lstat(root)?.isDirectory()) {
    for (const repoKey of realDirs(root).sort()) {
      for (const kind of realDirs(join(root, repoKey)).sort()) {
        for (const entry of readdirSync(join(root, repoKey, kind)).sort()) {
          const path = join(root, repoKey, kind, entry);
          const st = lstat(path);
          if (!st) continue;
          const { newest, size } = measure(path, st);
          if (now - newest <= ttl) {
            kept++;
            continue;
          }
          const age_days = Math.floor((now - newest) / UNITS.d);
          entries.push({ path, repo_key: repoKey, kind, entry, newest_mtime: new Date(newest).toISOString(), age_days, size });
        }
      }
    }
  }
  print({ root, older_than: olderThan, entries, kept });
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
  return abs;
});

const deleted: string[] = [];
const skipped: { path: string; reason: string }[] = [];
const pruned: string[] = [];
for (const path of targets) {
  const st = lstat(path);
  if (!st) {
    skipped.push({ path, reason: "missing" });
    continue;
  }
  if (now - measure(path, st).newest <= ttl) {
    skipped.push({ path, reason: "newer than the TTL" });
    continue;
  }
  remove(path);
  deleted.push(path);
  const kindDir = join(path, "..");
  for (const dir of [kindDir, join(kindDir, "..")]) {
    if (readdirSync(dir).length > 0) break;
    rmdirSync(dir);
    pruned.push(dir);
  }
}
print({ root, deleted, skipped, pruned });

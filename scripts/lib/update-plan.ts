// The Update's mechanical plan (spec #63 "vstack update"; #38 §3 and corrections; ADR 0008). Given each
// Upstream's old and new Pin, it classifies every register row, pairs moves, stages adopt copies, and writes
// both Upstream sides of adapt and merge rows with the `uses: update` House style rows applied.
// The README ("update-plan") documents the plan JSON this builds.

import { chmodSync, lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { applyRows, selectRows, type Replacement, type TextDisposition } from "./house-style.ts";
import { gitBlobSha, readBlobs, renamePairs, type TreeEntry, type UpstreamSource, type UpstreamTree } from "./upstreams.ts";
import { NEVER_SHIPPED, isHeld, upstreamItems, type Pin, type Register, type Row, type UpstreamItem } from "./vstack-repo.ts";

/** Bumped when a consumer-visible field changes meaning. */
export const PLAN_SCHEMA = 1;

export type ChangeClass = "unchanged" | "changed" | "moved" | "removed";

/** One Upstream in this run: its Pin entry at `main`, its clone, and the Pin it moves to (`new === old` when it did not move). */
export interface UpstreamRun {
  pin: Pin;
  clone: string;
  new: string;
  moved: boolean;
}

export interface PlanUpstream {
  key: string;
  repo: string;
  pin_kind: Pin["pin_kind"];
  clone: string;
  old: string;
  new: string;
  old_commit: string;
  new_commit: string;
  moved: boolean;
}

export interface PlanFile {
  /** Path inside the item (the file name for a single-file item). */
  path: string;
  status: "added" | "modified" | "deleted";
  /** Modified text of an adapt or merge row: whether both sides match once the House style rows are applied. Else null. */
  same_after_house_style: boolean | null;
}

export interface PlanRow {
  id: string;
  upstream: string;
  kind: string;
  disposition: string;
  artifacts: string[];
  class: ChangeClass;
  held: { at: string; path: string } | null;
  effective_old: { ref: string; commit: string; path: string | null };
  new: { ref: string; commit: string; path: string; tree: string } | null;
  move: { from: string; to: string; by: "tree" | "similarity"; similarity: number; renamed: boolean } | null;
  files: PlanFile[];
  house_style_rows: string[];
  sides: { old: string; new: string } | null;
  /** `path`: the staged artifact copy, a directory (or the file of a single-file item). `files`: paths inside it with their blob SHAs. */
  staged: { path: string; files: { path: string; sha: string }[]; dropped: string[] } | null;
}

export interface PlanArtifact {
  artifact: string;
  shared: boolean;
  rows: string[];
  needs_work: boolean;
}

export interface PlanNewItem {
  upstream: string;
  path: string;
  kind: string;
  type: string;
  tree: string;
}

export interface PlanBody {
  upstreams: PlanUpstream[];
  rows: PlanRow[];
  artifacts: PlanArtifact[];
  new: PlanNewItem[];
  counts: Record<ChangeClass | "new", number>;
}

const NESTED = (base: string, paths: Iterable<string>) => {
  const out: string[] = [];
  for (const p of paths) if (p.startsWith(`${base}/`)) out.push(p.slice(base.length + 1));
  return out;
};
const baseName = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const utf8 = new TextDecoder("utf-8", { fatal: true });
const asText = (b: Uint8Array) => {
  try {
    return utf8.decode(b);
  } catch {
    return undefined;
  }
};

/** Files an item owns, keyed by path inside the item. Paths under a nested item or row (`excluded`) belong to that one: longest prefix wins. */
function itemFiles(tree: UpstreamTree, path: string, key: string, excluded: string[]): Map<string, TreeEntry> {
  const entry = tree.get(path);
  const out = new Map<string, TreeEntry>();
  if (!entry) return out;
  if (entry.type === "blob") return out.set(key, entry);
  for (const b of tree.blobsUnder(path)) {
    if (!excluded.some((x) => b.path === x || b.path.startsWith(`${x}/`))) out.set(b.path, b);
  }
  return out;
}

interface Prep {
  row: Row;
  eo: { ref: string; tree: UpstreamTree; path?: string };
  newPath?: string;
  move?: PlanRow["move"];
  /** Where a removed item is compared from when pairing moves. */
  base?: { tree: UpstreamTree; path: string; entry: TreeEntry };
}

function writeEntry(file: string, entry: TreeEntry, bytes: Uint8Array) {
  mkdirSync(dirname(file), { recursive: true });
  if (entry.mode === "120000") symlinkSync(new TextDecoder().decode(bytes), file);
  else {
    writeFileSync(file, bytes);
    if (entry.mode === "100755") chmodSync(file, 0o755);
  }
}

function hashOnDisk(file: string): string {
  const st = lstatSync(file);
  return gitBlobSha(st.isSymbolicLink() ? new TextEncoder().encode(readlinkSync(file)) : readFileSync(file));
}

/**
 * Builds the plan body for the given runs and writes staged adopt copies and House-style-normalized sides
 * under `out`. Rows of Upstreams outside the runs are left out.
 */
export async function buildPlan(opts: {
  runs: UpstreamRun[];
  register: Register;
  replacements: readonly Replacement[];
  source: UpstreamSource;
  out: string;
}): Promise<PlanBody> {
  const body: PlanBody = { upstreams: [], rows: [], artifacts: [], new: [], counts: { unchanged: 0, changed: 0, moved: 0, removed: 0, new: 0 } };
  const byId = new Map<string, PlanRow>();

  for (const run of opts.runs) {
    const { pin, clone } = run;
    const oldTree = await opts.source.tree(pin, pin.pin);
    const newTree = await opts.source.tree(pin, run.new);
    body.upstreams.push({
      key: pin.key,
      repo: pin.repo,
      pin_kind: pin.pin_kind,
      clone,
      old: pin.pin,
      new: run.new,
      old_commit: oldTree.commit,
      new_commit: newTree.commit,
      moved: run.moved,
    });

    const rows = opts.register.rows.filter((r) => r.upstream === pin.key);
    const newItems = upstreamItems(pin, newTree);
    const rowPaths = new Set(rows.flatMap((r) => (r.path ? [r.path] : [])));
    const unmatched = newItems.filter((i) => !rowPaths.has(i.path));
    const taken = new Set<string>();
    const itemsAt = new Map<string, UpstreamItem[]>([[newTree.commit, newItems]]);
    const items = (t: UpstreamTree) => {
      if (!itemsAt.has(t.commit)) itemsAt.set(t.commit, upstreamItems(pin, t));
      return itemsAt.get(t.commit)!;
    };

    const preps: Prep[] = [];
    for (const row of rows) {
      const held = isHeld(row);
      const eoTree = held ? await opts.source.tree(pin, row.held_at!) : oldTree;
      const prep: Prep = { row, eo: { ref: held ? row.held_at! : pin.pin, tree: eoTree, path: held ? row.held_path : row.path } };
      if (row.path && newTree.get(row.path)) prep.newPath = row.path;
      else {
        const [t, p] = row.path && oldTree.get(row.path) ? [oldTree, row.path] : [eoTree, prep.eo.path];
        const entry = p ? t.get(p) : undefined;
        if (entry && p) prep.base = { tree: t, path: p, entry };
      }
      preps.push(prep);
    }

    // Moves, first by identical tree, then by git rename detection on SKILL.md (the file itself for a single-file item).
    const pair = (prep: Prep, to: UpstreamItem, by: "tree" | "similarity", similarity: number) => {
      taken.add(to.path);
      prep.newPath = to.path;
      prep.move = { from: prep.base!.path, to: to.path, by, similarity, renamed: baseName(prep.base!.path) !== baseName(to.path) };
    };
    for (const prep of preps) {
      if (prep.newPath || !prep.base) continue;
      const twin = unmatched.find((i) => !taken.has(i.path) && i.type === prep.base!.entry.type && i.sha === prep.base!.entry.sha);
      if (twin) pair(prep, twin, "tree", 100);
    }
    const probe = (t: UpstreamTree, path: string, type: string) => {
      if (type === "blob") return path;
      return t.get(`${path}/SKILL.md`)?.type === "blob" ? `${path}/SKILL.md` : undefined;
    };
    const byBase = new Map<string, Prep[]>();
    for (const prep of preps) {
      if (prep.newPath || !prep.base) continue;
      const k = prep.base.tree.commit;
      byBase.set(k, [...(byBase.get(k) ?? []), prep]);
    }
    for (const [commit, group] of byBase) {
      const from = new Map<string, Prep>();
      for (const prep of group) {
        const p = probe(prep.base!.tree, prep.base!.path, prep.base!.entry.type);
        if (p) from.set(p, prep);
      }
      const to = new Map<string, UpstreamItem>();
      for (const i of unmatched) {
        if (taken.has(i.path)) continue;
        const p = probe(newTree, i.path, i.type);
        if (p) to.set(p, i);
      }
      if (from.size === 0 || to.size === 0) continue;
      for (const r of renamePairs(clone, commit, newTree.commit, [...from.keys(), ...to.keys()])) {
        const prep = from.get(r.from);
        const target = to.get(r.to);
        if (!prep || !target || prep.newPath || taken.has(target.path) || target.type !== prep.base!.entry.type) continue;
        pair(prep, target, "similarity", r.similarity);
      }
    }

    // Classes and file lists; then the blobs that sides and staged copies need, read in one batch.
    const nestedPaths = [...rows.flatMap((r) => [r.path, r.held_path].filter((p): p is string => !!p))];
    const writes: (() => void)[] = [];
    const wanted = new Set<string>();
    for (const prep of preps) {
      const { row, eo } = prep;
      const newEntry = prep.newPath ? newTree.get(prep.newPath)! : undefined;
      const key = baseName(prep.newPath ?? eo.path ?? row.id);
      const excluded = [
        ...(prep.newPath ? NESTED(prep.newPath, [...nestedPaths, ...newItems.map((i) => i.path)]) : []),
        ...(eo.path ? NESTED(eo.path, [...nestedPaths, ...items(eo.tree).map((i) => i.path)]) : []),
      ];
      const oldFiles = eo.path ? itemFiles(eo.tree, eo.path, key, excluded) : new Map<string, TreeEntry>();
      const newFiles = prep.newPath ? itemFiles(newTree, prep.newPath, key, excluded) : new Map<string, TreeEntry>();
      const files: PlanFile[] = [];
      for (const p of new Set([...oldFiles.keys(), ...newFiles.keys()])) {
        const o = oldFiles.get(p);
        const n = newFiles.get(p);
        if (o && n && o.sha === n.sha) continue;
        files.push({ path: p, status: !o ? "added" : !n ? "deleted" : "modified", same_after_house_style: null });
      }
      files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

      const cls: ChangeClass = !prep.newPath ? "removed" : prep.move ? "moved" : files.length > 0 ? "changed" : "unchanged";
      const planRow: PlanRow = {
        id: row.id,
        upstream: pin.key,
        kind: row.kind!,
        disposition: row.disposition!,
        artifacts: row.artifacts,
        class: cls,
        held: isHeld(row) ? { at: row.held_at!, path: row.held_path! } : null,
        effective_old: { ref: eo.ref, commit: eo.tree.commit, path: eo.path ?? null },
        new: newEntry ? { ref: run.new, commit: newTree.commit, path: prep.newPath!, tree: newEntry.sha } : null,
        move: prep.move ?? null,
        files,
        house_style_rows: [],
        sides: null,
        staged: null,
      };
      body.rows.push(planRow);
      byId.set(row.id, planRow);
      body.counts[cls]++;

      const rowDir = (kind: string) => join(opts.out, kind, ...row.id.split("/"));
      if ((row.disposition === "adapt" || row.disposition === "merge") && files.length > 0) {
        const hs = selectRows(opts.replacements, { use: "update", upstreams: [pin.key], disposition: row.disposition as TextDisposition });
        planRow.house_style_rows = hs.map((r) => r.id);
        planRow.sides = { old: join(rowDir("sides"), "old"), new: join(rowDir("sides"), "new") };
        for (const f of files) {
          const o = oldFiles.get(f.path);
          const n = newFiles.get(f.path);
          if (o) wanted.add(o.sha);
          if (n) wanted.add(n.sha);
          writes.push(() => {
            const norm = (e: TreeEntry) => {
              const bytes = blobs.get(e.sha)!;
              const text = asText(bytes);
              return { text: text === undefined ? undefined : applyRows(text, hs), bytes };
            };
            const on = o && norm(o);
            const nn = n && norm(n);
            for (const [side, e, v] of [["old", o, on], ["new", n, nn]] as const) {
              if (!e || !v) continue;
              const file = join(planRow.sides![side], f.path);
              mkdirSync(dirname(file), { recursive: true });
              writeFileSync(file, v.text ?? v.bytes);
            }
            if (on && nn && on.text !== undefined && nn.text !== undefined) f.same_after_house_style = on.text === nn.text;
          });
        }
      }
      if (row.disposition === "adopt" && (cls === "changed" || cls === "moved")) {
        const all = itemFiles(newTree, prep.newPath!, baseName(prep.newPath!), []);
        const dropped = newEntry!.type === "tree" && all.has(NEVER_SHIPPED) ? [NEVER_SHIPPED] : [];
        for (const d of dropped) all.delete(d);
        for (const e of all.values()) wanted.add(e.sha);
        const path = join(rowDir("adopt"), baseName(prep.newPath!));
        planRow.staged = { path, files: [], dropped };
        writes.push(() => {
          for (const [p, e] of [...all].sort(([a], [b]) => (a < b ? -1 : 1))) {
            const file = newEntry!.type === "blob" ? path : join(path, p);
            writeEntry(file, e, blobs.get(e.sha)!);
            const sha = hashOnDisk(file);
            if (sha !== e.sha) throw new Error(`staged ${file} hashes to ${sha}, not ${e.sha}`);
            planRow.staged!.files.push({ path: p, sha });
          }
        });
      }
    }

    for (const i of unmatched) {
      if (taken.has(i.path)) continue;
      body.new.push({ upstream: pin.key, path: i.path, kind: i.kind, type: i.type, tree: i.sha });
      body.counts.new++;
    }

    const blobs = readBlobs(clone, wanted);
    for (const w of writes) w();
  }

  // Groups by artifact, in register order: an artifact several rows name is one unit of work.
  const groups = new Map<string, string[]>();
  for (const r of body.rows) for (const a of r.artifacts) groups.set(a, [...(groups.get(a) ?? []), r.id]);
  for (const [artifact, ids] of groups) {
    body.artifacts.push({ artifact, shared: ids.length > 1, rows: ids, needs_work: ids.some((id) => byId.get(id)!.class !== "unchanged") });
  }
  return body;
}

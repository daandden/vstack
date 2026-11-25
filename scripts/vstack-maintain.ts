#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { buildPlan, PLAN_SCHEMA, type PlanBody, type UpstreamRun } from "./lib/update-plan.ts";
import { checkLoadSmoke, run } from "./lib/update-gates.ts";
import { GateReport } from "./lib/gate-report.ts";
import { applyRows, findRow, parseHouseStyle, selectRows, type MatchKind, type Replacement, type TextDisposition } from "./lib/house-style.ts";
import { asText, cloneSource, githubSource, defaultUpstreamRemote, defaultUpstreamsDir, fetchRefs, readBlobs, writeEntry, syncClone, newestTag, newestCommit, compareSemverTags, hasTag, resolveRef, isAncestor, gitBlobSha, type UpstreamSource, type UpstreamTree } from "./lib/upstreams.ts";
import { artifactFiles, loadPins, loadRegister, loadHouseStyle, NEVER_SHIPPED, parseRegister, upstreamItems, type Pin, type Register } from "./lib/vstack-repo.ts";
import { createScratchSession, isScratchSessionId, repoKey, scratchRoot } from "../plugin/skills/vstack-tmp/scripts/scratch.ts";
import { yamlBookkeeping } from "./lib/bookkeeping.ts";
import { CHANGE_NOTES, PLUGIN_RELEASE, foldNotes, highestLevel, noteText, pendingNotes, releaseVersion, type PluginRelease, type VersionLevel } from "./lib/change-notes.ts";

const scriptRoot = resolve(import.meta.dir, "..");
const HEAD = "HEAD";
const TARGET = /^plugin\/(?:(skills)\/([a-z0-9-]+)|(agents|rules)\/([a-z0-9-]+)\.md)$/;
const KIND = { skills: "skill", agents: "agent", rules: "rule" } as const;
const git = (cwd: string, ...args: string[]) => run(["git", ...args], cwd);
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"));
function atHead(root: string, file: string) {
  const result = Bun.spawnSync(["git", "show", `HEAD:${file}`], { cwd: root, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString().trim());
  return result.stdout.toString();
}
const yamlHead = (root: string, file: string) => yamlBookkeeping(atHead(root, file));
type Plan = PlanBody & { schema: number; moved: boolean; root: string; out: string };
function planAt(file: string): Plan {
  const p = readJson(file);
  if (p.schema !== PLAN_SCHEMA || !Array.isArray(p.rows) || !p.root || !p.out) throw new Error("--plan must name a maintain plan.json");
  return p;
}
function target(artifact: string) {
  const m = TARGET.exec(artifact);
  if (!m) throw new Error(`${artifact} is not plugin/skills/<name>, plugin/agents/<name>.md, or plugin/rules/<name>.md`);
  return { artifact, kind: KIND[(m[1] ?? m[3]) as keyof typeof KIND], name: m[2] ?? m[4]! };
}

const unitOf = (file: string) => file.split("/").slice(0, 3).join("/");

const nameMatch = (name: string) => ({ from: name, match: (name.includes("-") ? "name" : "ref") as MatchKind });

const renameRow = (from: string, to: string): Replacement => ({ id: `rename-${from}`, ...nameMatch(from), to, upstream: "any", scope: "required", uses: ["update"] });

function callers(wt: string, artifact: string, name: string, bare = false): string[] {
  const ref = new RegExp(`(?:skill://|/skill:)${name}(?![a-z0-9-])`);
  const files = git(wt, "ls-files", "--cached", "--others", "--exclude-standard", "--", "plugin").split("\n").filter(Boolean);
  const text = (f: string) => { const p = join(wt, f); return existsSync(p) && lstatSync(p).isFile() ? readFileSync(p, "utf8") : ""; };
  const names = (t: string) => ref.test(t) || (bare && findRow(t, nameMatch(name)).length > 0);
  return files.filter((f) => !(f === artifact || f.startsWith(`${artifact}/`)) && names(text(f))).sort();
}

const adoptUnits = (register: Register, files: string[]) =>
  [...new Set(files.map(unitOf))].filter((u) => register.rows.some((row) => row.disposition === "adopt" && row.artifacts.includes(u))).sort();

function classify(wt: string, pins: ReturnType<typeof loadPins>, register: Register, artifact: string, present = true) {
  const t = target(artifact);
  const rows = register.rows.filter((row) => row.artifacts.includes(artifact));
  const original = register.originals.includes(artifact);
  if (!rows.length && !original) {
    if (onHead(wt, artifact)) throw new Error(`${artifact} is on ${HEAD} but in no register row and not in originals:`);
    return { ...t, action: "add" as const, dispositions: [] as string[], rows: [] };
  }
  if (present && !existsSync(join(wt, artifact))) throw new Error(`${artifact} does not exist in the checkout`);
  return {
    ...t,
    action: "edit" as const,
    dispositions: original ? ["original"] : [...new Set(rows.map((row) => row.disposition!))],
    rows: rows.map((row) => ({ id: row.id, upstream: row.upstream, pin: row.upstream ? pins.get(row.upstream)?.pin : undefined, path: row.path, tree: row.tree, disposition: row.disposition, reason: row.raw.reason })),
  };
}

function renameTarget(wt: string, pins: ReturnType<typeof loadPins>, register: Register, artifact: string, to: string, present: boolean) {
  const c = classify(wt, pins, register, artifact, present);
  if (c.action === "add") throw new Error(`${artifact} is not on ${HEAD}; a rename needs an item that HEAD registers`);
  const t = target(to);
  if (t.kind !== c.kind) throw new Error(`${artifact} is a ${c.kind} and ${to} is a ${t.kind}; a rename keeps the kind`);
  if (onHead(wt, to) || register.originals.includes(to) || register.rows.some((row) => row.artifacts.includes(to))) throw new Error(`${to} is already on ${HEAD}; pick another name`);
  return { ...c, action: "rename" as const, to, newName: t.name, house_style_row: renameRow(c.name, t.name) };
}

function removeTarget(wt: string, pins: ReturnType<typeof loadPins>, register: Register, artifact: string, present: boolean) {
  const c = classify(wt, pins, register, artifact, present);
  if (c.action === "add") throw new Error(`${artifact} is not on ${HEAD}; a removal needs an item that HEAD registers`);
  const rejects = register.rows.filter((row) => row.artifacts.length && row.artifacts.every((a) => a === artifact)).map((row) => row.id);
  return { ...c, action: "remove" as const, rejects };
}

function headRegister(wt: string) {
  const text = git(wt, "show", `${HEAD}:decision-register.yaml`);
  return { text, register: parseRegister(Bun.YAML.parse(text), `${HEAD}:decision-register.yaml`) };
}

interface UpstreamOptions { upstreams?: string; remote?: string; source?: string }

function outsideCheckout(path: string, what: string): string {
  const dir = resolve(path);
  let parent = dir;
  while (!existsSync(parent)) parent = dirname(parent);
  const checkout = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], { cwd: parent, stdout: "pipe", stderr: "pipe" });
  if (checkout.exitCode === 0) throw new Error(`${what} must be outside every checkout: ${dir}`);
  return dir;
}
const cacheOutsideCheckout = (opts: UpstreamOptions) => outsideCheckout(opts.upstreams ?? defaultUpstreamsDir(), "Upstream cache");
function clones(wt: string, opts: UpstreamOptions): string {
  const dir = cacheOutsideCheckout(opts);
  const { register } = headRegister(wt);
  for (const pin of loadPins(wt).values()) {
    const held = register.rows.filter((row) => row.upstream === pin.key && row.held_at).map((row) => row.held_at!);
    fetchRefs(dir, pin, opts.remote ?? defaultUpstreamRemote(), [pin.pin, ...held]);
  }
  return dir;
}

interface Upstreams { pins: Map<string, Pin>; register: Register; replacements: Replacement[]; dir: string; source: UpstreamSource }

function upstreamsAt(wt: string, opts: UpstreamOptions): Upstreams {
  const dir = clones(wt, opts);
  const pins = loadPins(wt);
  const { houseStyle } = parseHouseStyle(Bun.YAML.parse(git(wt, "show", `${HEAD}:house-style.yaml`)), new Set(pins.keys()));
  return { pins, register: headRegister(wt).register, replacements: houseStyle.replacements, dir, source: opts.source === "github" ? githubSource() : cloneSource(dir) };
}

const itemsAt = async (u: Upstreams, pin: Pin) => upstreamItems(pin, await u.source.tree(pin, pin.pin));

interface Clash { upstream: string; path: string; pin: string }

async function upstreamNames(u: Upstreams): Promise<Map<string, Clash[]>> {
  const names = new Map<string, Clash[]>();
  for (const pin of u.pins.values()) {
    for (const item of await itemsAt(u, pin)) {
      const name = item.type === "blob" ? basename(item.path).replace(/\.md$/, "") : basename(item.path);
      names.set(name, [...(names.get(name) ?? []), { upstream: pin.key, path: item.path, pin: pin.pin }]);
    }
  }
  return names;
}

class Refusal extends Error {
  constructor(message: string, readonly details: Record<string, unknown>) { super(message); }
}

async function refuseClashes(wt: string, u: Upstreams, targets: { artifact: string; clashes?: Clash[]; rename?: boolean }[]) {
  const clashes = [];
  for (const t of targets) {
    for (const c of t.clashes ?? []) {
      const take = t.rename ? null : await takeTarget(wt, u, c.upstream, c.path).then((x) => (x.artifact === t.artifact ? `${c.upstream}:${c.path}` : null), () => null);
      clashes.push({ artifact: t.artifact, ...c, take });
    }
  }
  if (!clashes.length) return;
  const found = clashes.map((c) => `${c.artifact} clashes with ${c.upstream} ${c.path} at ${c.pin}`);
  const takes = clashes.flatMap((c) => (c.take ? [`--take ${c.take}`] : []));
  throw new Refusal(`${found.join("; ")}. Pick another name${takes.length ? `, or take the Upstream item in its place with check ${takes.join(" ")}` : ""}.`, { clashes });
}

const onHead = (wt: string, path: string) => Bun.spawnSync(["git", "cat-file", "-e", `${HEAD}:${path}`], { cwd: wt }).exitCode === 0;

async function takeTarget(wt: string, u: Upstreams, upstream: string, path: string) {
  const pin = u.pins.get(upstream);
  if (!pin) throw new Error(`${upstream} is not an Upstream in pins.yaml`);
  const items = await itemsAt(u, pin);
  const item = items.find((i) => i.path === path);
  if (!item) throw new Error(`${upstream}:${path} is not an Upstream item at the current Pin ${pin.pin}`);
  const dir = item.type === "tree" && (item.kind === "skill" || item.kind === "principle") ? "skills" : item.type === "blob" && item.kind === "agent" && path.endsWith(".md") ? "agents" : undefined;
  if (!dir) throw new Error(`${upstream}:${path} is a ${item.type} of kind ${item.kind}; a take ships only a skill or principle directory or an agent .md file`);
  const t = target(`plugin/${dir}/${basename(path)}`);
  const nested = items.filter((i) => i.path.startsWith(`${path}/`)).map((i) => i.path);
  if (nested.length) throw new Error(`${upstream}:${path} holds other Upstream items (${nested.join(", ")}); a take cannot split them`);
  const row = u.register.rows.find((x) => x.upstream === upstream && x.path?.replace(/\/+$/, "") === path);
  if (row && row.disposition !== "reject") throw new Error(`${upstream}:${path} is ${row.disposition} in ${row.id} and ships as ${row.artifacts.join(", ")}; edit that artifact instead`);
  const id = row?.id ?? (t.kind === "agent" ? `${upstream}/agents/${t.name}` : `${upstream}/${t.name}`);
  if (!row && u.register.rows.some((x) => x.id === id)) throw new Error(`the register already has a row ${id}`);
  if (onHead(wt, t.artifact) || u.register.originals.includes(t.artifact) || u.register.rows.some((x) => x.artifacts.includes(t.artifact))) {
    throw new Error(`${t.artifact} is already on ${HEAD}; ${upstream}:${path} cannot ship under that name`);
  }
  return { ...t, action: "take" as const, upstream, path, pin: pin.pin, tree: item.sha, type: item.type, itemKind: item.kind, id, rowIndex: row?.index };
}

type Take = Awaited<ReturnType<typeof takeTarget>>;

function takeFiles(u: Upstreams, t: Take, tree: UpstreamTree) {
  const entries = tree.blobsUnder(t.path).filter((b) => t.type === "blob" || b.path !== NEVER_SHIPPED);
  const blobs = readBlobs(join(u.dir, t.upstream), entries.map((e) => e.sha));
  const files = entries.map((entry) => { const bytes = blobs.get(entry.sha)!; return { entry, bytes, text: entry.mode === "120000" ? undefined : asText(bytes) }; });
  const rows = (disposition: TextDisposition) => selectRows(u.replacements, { use: "update", upstreams: [t.upstream], disposition });
  const changing = rows("adopt").filter((row) => files.some((f) => f.text !== undefined && findRow(f.text, row).length > 0));
  const disposition = changing.length ? ("adapt" as const) : ("adopt" as const);
  const applied = rows(disposition);
  return {
    disposition,
    house_style_rows: changing.map((row) => row.id),
    files: files.map((f) => ({ entry: f.entry, file: t.type === "blob" ? t.artifact : join(t.artifact, f.entry.path), bytes: disposition === "adapt" && f.text !== undefined ? new TextEncoder().encode(applyRows(f.text, applied)) : f.bytes })),
  };
}

async function take(wt: string, u: Upstreams, upstream: string, path: string) {
  const t = await takeTarget(wt, u, upstream, path);
  return { ...t, ...takeFiles(u, t, await u.source.tree(u.pins.get(upstream)!, t.pin)) };
}

function takeSpec(value: string) {
  const at = value.indexOf(":");
  if (at < 1 || at === value.length - 1) throw new Error(`--take needs <upstream>:<path>, such as matt:skills/engineering/tdd, not ${JSON.stringify(value)}`);
  return [value.slice(0, at), value.slice(at + 1).replace(/^\/+|\/+$/g, "")] as const;
}

function renameSpec(value: string) {
  const at = value.indexOf("=");
  if (at < 1 || at === value.length - 1) throw new Error(`--rename needs <artifact>=<new artifact>, such as plugin/skills/tidy=plugin/skills/tidy-notes, not ${JSON.stringify(value)}`);
  return [value.slice(0, at), value.slice(at + 1)] as const;
}

async function checkTargets(wt: string, artifacts: string[], takes: string[], renames: string[], removes: string[], opts: UpstreamOptions) {
  if (!artifacts.length && !takes.length && !renames.length && !removes.length) throw new Error("name at least one target artifact, --take <upstream>:<path>, --rename <artifact>=<new artifact>, or --remove <artifact>");
  const pins = loadPins(wt);
  const { register } = headRegister(wt);
  const classified = artifacts.map((a) => classify(wt, pins, register, a));
  const renamed = renames.map((spec) => renameTarget(wt, pins, register, ...renameSpec(spec), true));
  const removed = removes.map((a) => removeTarget(wt, pins, register, a, true));
  const adds = classified.some((t) => t.action === "add");
  const u = adds || takes.length || renamed.length ? upstreamsAt(wt, opts) : undefined;
  const names = adds || renamed.length ? await upstreamNames(u!) : undefined;
  const edits = classified.map((t) => ({ ...t, ...(names && t.action === "add" ? { clashes: names.get(t.name) ?? [] } : {}) }));
  const moves = renamed.map(({ newName, ...t }) => ({ ...t, clashes: names!.get(newName) ?? [] }));
  await refuseClashes(wt, u!, [...edits, ...moves.map((t) => ({ artifact: t.to, clashes: t.clashes, rename: true }))]);
  const taken = [];
  for (const spec of takes) {
    const t = await take(wt, u!, ...takeSpec(spec));
    taken.push({ artifact: t.artifact, kind: t.kind, name: t.name, action: t.action, upstream: t.upstream, path: t.path, pin: t.pin, tree: t.tree, row: t.rowIndex === undefined ? null : t.id, disposition: t.disposition, house_style_rows: t.house_style_rows });
  }
  const gone = [...moves, ...removed].map((t) => { const c = callers(wt, t.artifact, t.name, true); return { ...t, callers: c, adopt_callers: adoptUnits(register, c) }; });
  const targets = [...[...edits, ...taken].map((t) => ({ ...t, callers: callers(wt, t.artifact, t.name) })), ...gone];
  const named = targets.flatMap((t) => ("to" in t ? [t.artifact, t.to] : [t.artifact]));
  if (new Set(named).size !== named.length) throw new Error("each target artifact may appear once");
  return { targets };
}

function selection(args: string[], pins: Map<string, Pin>): Map<string, string | undefined> {
  const sel = new Map<string, string | undefined>();
  for (const a of args) {
    const at = a.indexOf("@");
    const [key, ref] = at < 0 ? [a, undefined] : [a.slice(0, at), a.slice(at + 1)];
    if (!pins.has(key)) throw new Error(`unknown upstream ${key}; pins.yaml has ${[...pins.keys()].join(", ")}`);
    if (ref === "") throw new Error(`${a}: empty ref`);
    if (sel.has(key)) throw new Error(`${key} is named twice`);
    sel.set(key, ref);
  }
  if (sel.size === 0) for (const key of pins.keys()) sel.set(key, undefined);
  return sel;
}

function targetPin(pin: Pin, clone: string, ref: string | undefined): { new: string; moved: boolean } {
  if (pin.pin_kind === "tag") {
    if (ref !== undefined) {
      if (!hasTag(clone, ref)) throw new Error(`${pin.key} has no tag ${ref}`);
      return { new: ref, moved: ref !== pin.pin };
    }
    const tag = newestTag(clone);
    if (!tag) throw new Error(`${pin.key} has no v<semver> tag`);
    return compareSemverTags(tag, pin.pin) > 0 ? { new: tag, moved: true } : { new: pin.pin, moved: false };
  }
  if (ref !== undefined) {
    const sha = resolveRef(clone, ref);
    if (!sha) throw new Error(`${pin.key} has no commit ${ref}`);
    return { new: sha, moved: sha !== pin.pin };
  }
  const sha = newestCommit(clone, pin.path);
  const moved = sha !== pin.pin && !isAncestor(clone, sha, pin.pin);
  return moved ? { new: sha, moved } : { new: pin.pin, moved };
}

function maintainEntry(root: string, scratch: string | undefined, sessionId: string): string {
  const projectDir = scratch ?? join(scratchRoot(homedir()), repoKey(root));
  const dir = createScratchSession(projectDir, "maintain", sessionId);
  if (!dir) throw new Error(`Will not adopt unmarked Scratch at ${join(projectDir, "maintain", sessionId)}; move the existing entry before retrying`);
  return join(dir, `${Date.now()}-${randomUUID()}`);
}

async function plan(root: string, refs: string[], opts: UpstreamOptions, scratch: string | undefined, sessionId: string) {
  const pins = loadPins(root), register = loadRegister(root);
  const { houseStyle, problems } = loadHouseStyle(root, new Set(pins.keys()));
  if (problems.length) throw new Error(problems.map(p => `${p.id}: ${p.message}`).join("; "));
  const dir = cacheOutsideCheckout(opts);
  const runs: UpstreamRun[] = [];
  for (const [key, ref] of selection(refs, pins)) {
    const pin = pins.get(key)!;
    const { clone } = syncClone(dir, pin, opts.remote ?? defaultUpstreamRemote());
    runs.push({ pin, clone, ...targetPin(pin, clone, ref) });
  }
  const out = maintainEntry(root, scratch, sessionId);
  mkdirSync(out, { recursive: true });
  const body = await buildPlan({ runs, register, replacements: houseStyle.replacements, source: cloneSource(dir), out });
  const p: Plan = { schema: PLAN_SCHEMA, root, out, moved: runs.some(r => r.moved), ...body };
  const path = join(out, "plan.json"); writeFileSync(path, JSON.stringify(p, null, 2) + "\n");
  return path;
}

function bytes(file: string): Buffer {
  if (!existsSync(file)) return Buffer.alloc(0);
  if (lstatSync(file).isSymbolicLink()) throw new Error(`overlap preview needs a regular file: ${file}`);
  return readFileSync(file);
}
interface Hunk { start: number; end: number; text: string[] }
function hunks(base: Buffer, next: Buffer): Hunk[] {
  const a = base.toString().split("\n"), b = next.toString().split("\n");
  const table = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  const out: Hunk[] = []; let i = 0, j = 0, h: Hunk | undefined;
  const close = () => { if (h) out.push(h); h = undefined; };
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { close(); i++; j++; }
    else {
      h ??= { start: i + 1, end: i + 1, text: [] };
      if (j < b.length && (i === a.length || table[i]![j + 1]! > table[i + 1]![j]!)) h.text.push(b[j++]!);
      else { i++; h.end = i + 1; }
    }
  }
  close(); return out;
}
const touches = (a: Hunk, b: Hunk) => a.start === a.end || b.start === b.end
  ? a.start <= b.end && b.start <= a.end
  : a.start < b.end && b.start < a.end;
function mergePreview(p: Plan, root: string, maps: Record<string, Record<string, string>> = {}) {
  return { rows: p.rows.filter(r => r.sides).map(row => {
    const overlaps: string[] = [], changes: any[] = [];
    for (const artifact of row.artifacts) for (const file of row.files) {
      const suffix = maps[row.id]?.[file.path] ?? (row.kind === "playbook" ? "SKILL.md" : file.path);
      if (suffix.startsWith("/") || suffix.split("/").includes("..")) throw new Error(`invalid file mapping ${row.id}: ${suffix}`);
      const localPath = existsSync(join(root, artifact)) && !lstatSync(join(root, artifact)).isDirectory() ? artifact : `${artifact}/${suffix}`;
      const base = bytes(join(row.sides!.old, file.path)), incoming = bytes(join(row.sides!.new, file.path)), local = bytes(join(root, localPath));
      const binary = [local, base, incoming].some(b => b.includes(0));
      const localEdits = binary ? [] : hunks(base, local), upstreamEdits = binary ? [] : hunks(base, incoming);
      const regions = localEdits.flatMap(a => upstreamEdits.filter(b => touches(a, b)).map(b => ({ local: a, upstream: b })));
      const overlap = !local.equals(incoming) && (binary ? !local.equals(base) && !incoming.equals(base) : regions.length > 0);
      if (overlap) overlaps.push(localPath);
      changes.push({ path: localPath, overlap, binary, regions, local_edits: localEdits, upstream_edits: upstreamEdits });
    }
    return { id: row.id, effective_old: row.effective_old, overlaps, changes };
  }) };
}

interface RowDecision {
  id: string; action: "accept" | "hold" | "defer"; upstream?: string; path?: string;
  disposition?: "adopt" | "adapt" | "merge" | "reject"; artifacts?: string[]; reason?: string; gist?: string;
  removal?: "drop" | "original" | "remove-contribution" | "keep-contribution"; rename?: "follow" | "keep";
}
interface HandTarget {
  action: "add" | "edit" | "take" | "rename" | "remove"; kind: string; artifact: string; to?: string;
  upstream?: string; path?: string; reason?: string; flip?: { confirmed: boolean; reason: string };
}
interface UpstreamDrop { action: "drop"; upstream: string; house_style?: string[] }
const oneLine = (s: unknown): s is string => typeof s === "string" && s.trim() !== "" && !s.includes("\n");
function decisionsAt(file: string) {
  const d = readJson(file) as { decisions?: RowDecision[]; targets?: HandTarget[]; upstreams?: UpstreamDrop[]; changelog: string[] };
  const rows = d.decisions ?? [], targets = d.targets ?? [], drops = d.upstreams ?? [];
  if (!Array.isArray(rows) || !Array.isArray(targets) || !Array.isArray(drops) || !rows.length && !targets.length && !drops.length) throw new Error("decisions need Update rows, Hand edit targets, or Upstream drops");
  if (!Array.isArray(d.changelog) || !d.changelog.length || !d.changelog.every(oneLine)) throw new Error("changelog needs one-line entries");
  if (new Set(rows.map(r => r.id)).size !== rows.length) throw new Error("Update row ids must be unique");
  for (const row of rows) {
    if (!row.id || !["accept", "hold", "defer"].includes(row.action)) throw new Error(`invalid decision ${row.id}`);
    if (row.disposition && !["adopt", "adapt", "merge", "reject"].includes(row.disposition)) throw new Error(`invalid Disposition ${row.id}`);
    if (row.reason !== undefined && !oneLine(row.reason)) throw new Error(`reason needs one line: ${row.id}`);
    if (row.action === "defer" && !oneLine(row.gist)) throw new Error(`defer needs a gist: ${row.id}`);
    for (const artifact of row.artifacts ?? []) target(artifact);
  }
  for (const drop of drops) {
    if (drop.action !== "drop" || typeof drop.upstream !== "string" || !drop.upstream) throw new Error(`an Upstream entry needs action drop and an upstream key: ${JSON.stringify(drop)}`);
    if (drop.house_style !== undefined && (!Array.isArray(drop.house_style) || !drop.house_style.every(id => typeof id === "string" && id))) throw new Error(`${drop.upstream}: house_style lists House style ids`);
  }
  if (new Set(drops.map(x => x.upstream)).size !== drops.length) throw new Error("each Upstream may be dropped once");
  const names = targets.flatMap(t => t.action === "rename" ? [t.artifact, t.to] : [t.artifact]);
  if (new Set(names).size !== names.length) throw new Error("each target may appear once");
  return { rows, targets, drops, changelog: d.changelog };
}

async function validateTargets(root: string, targets: HandTarget[], opts: UpstreamOptions) {
  const pins = loadPins(root), register = headRegister(root).register;
  const u = targets.some(t => ["take", "add", "rename"].includes(t.action)) ? upstreamsAt(root, opts) : undefined;
  const names = u ? await upstreamNames(u) : undefined;
  const taken: (Awaited<ReturnType<typeof take>> & { reason: string })[] = [], renames: ReturnType<typeof renameTarget>[] = [];
  for (const t of targets) {
    const kind = target(t.artifact).kind;
    if (t.kind !== kind) throw new Error(`${t.artifact}: kind must be ${kind}`);
    if (t.action === "take") {
      if (!t.upstream || !t.path || !oneLine(t.reason)) throw new Error(`${t.artifact}: take needs upstream, path, and reason`);
      const x = await take(root, u!, t.upstream, t.path);
      if (x.artifact !== t.artifact) throw new Error(`take ships as ${x.artifact}`);
      taken.push({ ...x, reason: t.reason }); continue;
    }
    if (!["add", "edit", "rename", "remove"].includes(t.action)) throw new Error(`unknown target action ${t.action}`);
    const c = classify(root, pins, register, t.artifact, t.action !== "rename" && t.action !== "remove");
    if ((t.action === "add") !== (c.action === "add")) throw new Error(`${t.artifact}: action does not match HEAD`);
    if (t.action === "edit" && t.reason !== undefined && !oneLine(t.reason)) throw new Error(`${t.artifact}: reason needs one line`);
    if (t.action === "edit" || t.action === "rename") {
      if (c.dispositions.includes("adopt") && (t.flip?.confirmed !== true || !oneLine(t.flip.reason))) throw new Error(`${t.artifact}: adopt needs a confirmed flip and reason`);
      if (!c.dispositions.includes("adopt") && t.flip) throw new Error(`${t.artifact}: only adopt takes a flip`);
    } else if (t.flip) throw new Error(`${t.artifact}: only an adopt edit or rename takes a flip`);
    if (t.action === "add") await refuseClashes(root, u!, [{ artifact: t.artifact, clashes: names!.get(c.name) }]);
    if (t.action === "rename") {
      if (!t.to) throw new Error(`${t.artifact}: rename needs to`);
      const x = renameTarget(root, pins, register, t.artifact, t.to, false);
      if (existsSync(join(root, t.artifact)) || !existsSync(join(root, t.to))) throw new Error(`move ${t.artifact} to ${t.to} before prepare`);
      await refuseClashes(root, u!, [{ artifact: t.to, clashes: names!.get(x.newName), rename: true }]);
      renames.push(x);
    }
    if (t.action === "remove") {
      if (existsSync(join(root, t.artifact))) throw new Error(`delete ${t.artifact} before prepare`);
      if (register.rows.some(r => r.artifacts.length === 1 && r.artifacts[0] === t.artifact) && !oneLine(t.reason)) throw new Error(`${t.artifact}: removal needs a reason`);
    }
    if (t.action === "remove" || t.action === "rename") {
      const left = callers(root, t.artifact, c.name, true);
      if (left.length) throw new Error(`change every caller of ${c.name}: ${left.join(", ")}`);
    }
  }
  return { taken, renames };
}

function defaultBase(root: string): string {
  const remote = Bun.spawnSync(["git", "symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const ref = process.env.VSTACK_BASE_REF ?? (remote.exitCode === 0 ? remote.stdout.toString().trim() : "main");
  return git(root, "merge-base", "HEAD", ref);
}
async function stageAdopt(root: string, p: Plan, upstream: string, path: string, opts: UpstreamOptions): Promise<string> {
  const pin = loadPins(root).get(upstream)!;
  const dir = cacheOutsideCheckout(opts), source = cloneSource(dir);
  const ref = p.upstreams.find(u => u.key === upstream)!.new;
  const tree = await source.tree(pin, ref), item = tree.get(path);
  if (!item) throw new Error(`Upstream item is missing at ${upstream}@${ref}: ${path}`);
  const entries = tree.blobsUnder(path).filter(e => item.type === "blob" || e.path !== NEVER_SHIPPED);
  const blobs = readBlobs(join(dir, upstream), entries.map(e => e.sha));
  const staged = join(p.out, "adopt-copies", randomUUID());
  for (const entry of entries) writeEntry(item.type === "blob" ? staged : join(staged, entry.path), entry, blobs.get(entry.sha)!);
  return staged;
}
/** Shipped skill and agent names: `plugin/skills/<name>` or `plugin/agents/<name>` from non-reject rows and originals. */
function shippedNames(doc: any): Set<string> {
  const names = new Set<string>();
  for (const artifact of [...doc.items.filter((row: any) => row.disposition !== "reject").flatMap((row: any) => row.artifacts), ...doc.originals]) {
    const match = /^plugin\/(?:skills|agents)\/[^/]+/.exec(artifact);
    if (match) names.add(match[0]);
  }
  return names;
}

function commandNames(root: string, ref?: string): Set<string> {
  const files = ref ? git(root, "ls-tree", "-r", "--name-only", ref, "--", "plugin/extensions").split("\n") : existsSync(join(root, "plugin/extensions")) ? [...artifactFiles(root, "plugin/extensions")] : [];
  const names = new Set<string>();
  for (const file of files.filter(file => /\.[cm]?[jt]s$/.test(file))) {
    const source = ref ? git(root, "show", `${ref}:${file}`) : readFileSync(join(root, file), "utf8");
    const text = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
    for (const match of text.matchAll(/\.registerCommand\(\s*["']([^"']+)["']/g)) names.add(match[1]!);
  }
  return names;
}

function checkoutInput(root: string, artifact: string): string {
  const entries: string[] = [];
  function visit(path: string, relative: string) {
    let stat;
    try { stat = lstatSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    if (stat.isSymbolicLink()) entries.push(`120000 ${gitBlobSha(Buffer.from(readlinkSync(path)))} ${relative}`);
    else if (stat.isFile()) entries.push(`${stat.mode & 0o111 ? "100755" : "100644"} ${gitBlobSha(readFileSync(path))} ${relative}`);
    else if (stat.isDirectory()) {
      const names = readdirSync(path).sort();
      if (!names.length) entries.push(`empty ${relative}`);
      for (const name of names) visit(join(path, name), relative ? `${relative}/${name}` : name);
    } else throw new Refusal(`Cannot replace non-regular input ${artifact}`, { category: "input-conflict", conflicts: [artifact] });
  }
  let parent = dirname(join(root, artifact));
  while (parent !== root) {
    if (existsSync(parent) && lstatSync(parent).isSymbolicLink()) throw new Refusal(`Reconcile symlink parent of ${artifact}`, { category: "input-conflict", conflicts: [artifact] });
    parent = dirname(parent);
  }
  visit(join(root, artifact), "");
  return JSON.stringify(entries.sort());
}

function headInput(root: string, artifact: string): string {
  const output = git(root, "ls-tree", "-rz", "HEAD", "--", artifact);
  const entries = output.split("\0").filter(Boolean).map(line => {
    const [header, path] = line.split("\t"), [mode, , sha] = header!.split(" ");
    return `${mode} ${sha} ${path === artifact ? "" : path!.slice(artifact.length + 1)}`;
  });
  return JSON.stringify(entries.sort());
}

function requireInputs(root: string, expected: Map<string, string>) {
  const conflicts = [...expected].filter(([path, input]) => checkoutInput(root, path) !== input).map(([path]) => path);
  if (conflicts.length) throw new Refusal(`Reconcile independently changed content before prepare: ${conflicts.join(", ")}`, { category: "input-conflict", conflicts });
}

type PrepareDecisions = ReturnType<typeof decisionsAt>;
interface PreparationReceipt {
  head: string;
  root: string;
  note: string;
  decisions: PrepareDecisions;
  plan?: Plan;
  outputs: Record<string, string>;
}

function combineDecisions(previous: PrepareDecisions | undefined, next: PrepareDecisions): PrepareDecisions {
  const merge = <T>(old: T[], fresh: T[], key: (value: T) => string) => [...new Map([...old, ...fresh].map(value => [key(value), value])).values()];
  return {
    rows: merge(previous?.rows ?? [], next.rows, row => row.id),
    targets: merge(previous?.targets ?? [], next.targets, target => target.artifact),
    drops: merge(previous?.drops ?? [], next.drops, drop => drop.upstream),
    changelog: [...new Set([...(previous?.changelog ?? []), ...next.changelog])],
  };
}

async function prepare(root: string, file: string, plan: Plan | undefined, opts: UpstreamOptions) {
  const store = git(root, "rev-parse", "--path-format=absolute", "--git-path", "vstack-maintain");
  mkdirSync(store, { recursive: true });
  const lock = join(store, "prepare.lock"), receiptPath = join(store, "prepared.json");
  try { mkdirSync(lock); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    throw new Refusal(`Another preparation owns ${lock}; retry after it finishes.`, { category: "preparation-busy", lock });
  }
  try {
    writeFileSync(join(lock, "owner.json"), JSON.stringify({ pid: process.pid, root }));
    const head = git(root, "rev-parse", "HEAD");
    const saved = existsSync(receiptPath) ? readJson(receiptPath) as PreparationReceipt : undefined;
    const previous = saved?.head === head && saved.root === root ? saved : undefined;
    if (previous?.plan && plan && JSON.stringify(previous.plan) !== JSON.stringify(plan)) throw new Refusal("Reconcile the earlier uncommitted Update before using another plan.", { category: "input-conflict", conflicts: ["plan"] });
    const d = combineDecisions(previous?.decisions, decisionsAt(file));
    const p = plan ?? previous?.plan;
    const note = previous?.note ?? `${CHANGE_NOTES}/${randomUUID()}.json`;
    const result = await prepareOwned(root, d, p, opts, previous, head, note);
    const receipt: PreparationReceipt = { head, root, note, decisions: d, plan: p, outputs: { ...previous?.outputs, ...result.outputs } };
    const temporary = join(store, `${randomUUID()}.json`);
    try {
      writeFileSync(temporary, JSON.stringify(receipt));
      renameSync(temporary, receiptPath);
    } catch (error) {
      throw new Refusal(`Checkout prepared, but ownership receipt could not be saved: ${(error as Error).message}`, { category: "receipt-write-failure", written: Object.keys(result.outputs) });
    } finally { rmSync(temporary, { force: true }); }
    return result.receipt;
  } finally { rmSync(lock, { recursive: true, force: true }); }
}
async function prepareOwned(root: string, d: PrepareDecisions, p: Plan | undefined, opts: UpstreamOptions, previous: PreparationReceipt | undefined, head: string, note: string) {
  const bookkeeping = ["decision-register.yaml", "pins.yaml", "house-style.yaml", "plugin/package.json", "CHANGELOG.md", note];
  const expected = new Map(bookkeeping.map(path => [path, previous?.outputs[path] ?? headInput(root, path)]));
  requireInputs(root, expected);
  const registerFile = yamlHead(root, "decision-register.yaml"), pinsFile = yamlHead(root, "pins.yaml"), styleFile = yamlHead(root, "house-style.yaml");
  const doc = registerFile.value, pins = pinsFile.value, style = styleFile.value;
  const { taken, renames } = await validateTargets(root, d.targets, opts);
  const copies: { source: string; artifact: string }[] = [];
  const shippedAtHead = shippedNames(doc);
  if (d.rows.length && !p) throw new Error("Update rows need --plan");
  if (p) {
    for (const u of p.upstreams) if (pins.upstreams[u.key]?.pin !== u.old) throw new Error(`plan Pin differs from HEAD: ${u.key}; rerun plan`);
    const byId = new Map(d.rows.map(r => [r.id, r]));
    for (const row of p.rows) if (row.class !== "unchanged" && !byId.has(row.id)) throw new Error(`missing decision ${row.id}`);
    const newRows = p.new.map(n => {
      const matches = d.rows.filter(r => r.upstream === n.upstream && r.path === n.path);
      if (matches.length !== 1) throw new Error(`new item needs one decision: ${n.upstream}:${n.path}`);
      return { n, decision: matches[0]! };
    });
    for (const decision of d.rows) if (!p.rows.some(r => r.id === decision.id) && !newRows.some(r => r.decision === decision)) throw new Error(`unknown decision ${decision.id}`);
    for (const r of p.rows) {
      const row = doc.items.find((x: any) => x.id === r.id); if (!row) throw new Error(`HEAD lost row ${r.id}`);
      const decision = byId.get(r.id);
      if (decision?.action === "hold") { row.held_at ??= r.effective_old.ref; row.held_path ??= r.effective_old.path; }
      else if (r.class === "removed") {
        if (!decision?.removal) throw new Error(`removed row needs a removal choice: ${r.id}`);
        const shared = r.artifacts.some(a => doc.items.some((x: any) => x.id !== r.id && x.artifacts.includes(a)));
        if (shared && ["drop", "original"].includes(decision.removal) || !shared && ["remove-contribution", "keep-contribution"].includes(decision.removal)) throw new Error(`removal choice does not match artifact ownership: ${r.id}`);
        if (decision.removal === "original") doc.originals.push(...r.artifacts);
        if (decision.removal === "drop") { for (const a of r.artifacts) if (existsSync(join(root, a))) throw new Error(`delete ${a} before prepare`); }
        doc.items = doc.items.filter((x: any) => x.id !== r.id); continue;
      } else if (decision) {
        const handFlip = d.targets.find(t => t.artifact === r.artifacts[0] && t.flip)?.flip;
        const disposition = decision.action === "defer" ? "reject" : decision.disposition ?? (handFlip ? "adapt" : row.disposition);
        if (handFlip) decision.reason ??= handFlip.reason;
        if (r.move?.renamed && r.disposition === "adopt") {
          if (!decision.rename) throw new Error(`renamed adopt needs follow or keep: ${r.id}`);
          const oldName = basename(r.artifacts[0]!), newName = basename(r.new!.path);
          if (decision.rename === "follow") { decision.artifacts ??= [join(dirname(r.artifacts[0]!), newName)]; style.replacements.push(renameRow(oldName, newName)); }
          else { if (disposition !== "adapt" || !oneLine(decision.reason)) throw new Error(`keeping an adopt name needs adapt and a reason: ${r.id}`); style.replacements.push({ ...renameRow(newName, oldName), upstream: r.upstream }); }
        }
        if (disposition !== row.disposition && !oneLine(decision.reason)) throw new Error(`Disposition change needs a reason: ${r.id}`);
        row.disposition = disposition; row.artifacts = decision.artifacts ?? (disposition === "reject" ? [] : row.artifacts);
        if (decision.reason) row.reason = decision.reason;
        if (decision.action === "defer") row.reason = `Deferred at ${r.new?.ref}: ${decision.gist}`;
        delete row.held_at; delete row.held_path;
        if (disposition === "adopt" && (r.class !== "unchanged" || r.disposition !== "adopt")) {
          if (!r.new || row.artifacts.length !== 1) throw new Error(`adopt needs one artifact at the selected Pin: ${r.id}`);
          if (r.staged) for (const f of r.staged.files) {
            const path = lstatSync(r.staged.path).isDirectory() ? join(r.staged.path, f.path) : r.staged.path;
            const content = lstatSync(path).isSymbolicLink() ? Buffer.from(readlinkSync(path)) : readFileSync(path);
            if (gitBlobSha(content) !== f.sha) throw new Error(`adopt copy changed after planning: ${r.id}/${f.path}`);
          }
          const source = r.staged?.path ?? await stageAdopt(root, p, r.upstream, r.new.path, opts);
          copies.push({ source, artifact: row.artifacts[0] });
        } else for (const a of row.artifacts) if (!existsSync(join(root, a))) throw new Error(`write ${a} before prepare`);
      }
      if (r.new) { row.path = r.new.path; row.tree = r.new.tree; } else { delete row.path; delete row.tree; }
    }
    for (const { n, decision } of newRows) {
      if (decision.action === "hold") throw new Error(`new item cannot Hold: ${decision.id}`);
      if (doc.items.some((x: any) => x.id === decision.id)) throw new Error(`row id already exists: ${decision.id}`);
      const disposition = decision.action === "defer" ? "reject" : decision.disposition;
      if (!disposition || decision.action !== "defer" && !oneLine(decision.reason)) throw new Error(`new item needs Disposition and reason: ${decision.id}`);
      const artifacts = decision.artifacts ?? [];
      if (disposition === "reject" ? artifacts.length : !artifacts.length) throw new Error(`artifacts do not match Disposition: ${decision.id}`);
      if (disposition === "adopt") {
        if (artifacts.length !== 1) throw new Error(`adopt needs one artifact: ${decision.id}`);
        const source = await stageAdopt(root, p, n.upstream, n.path, opts);
        copies.push({ source, artifact: artifacts[0]! });
      } else for (const a of artifacts) if (!existsSync(join(root, a))) throw new Error(`write ${a} before prepare`);
      doc.items.push({ id: decision.id, upstream: n.upstream, kind: n.kind, path: n.path, tree: n.tree, disposition, artifacts, reason: decision.action === "defer" ? `Deferred at ${p.upstreams.find(u => u.key === n.upstream)!.new}: ${decision.gist}` : decision.reason });
    }
    for (const u of p.upstreams) pins.upstreams[u.key].pin = u.new;
  }
  for (const t of d.targets) {
    if (t.action === "add") doc.originals.push(t.artifact);
    for (const row of doc.items) {
      if (!row.artifacts.includes(t.artifact)) continue;
      if (t.action === "edit" && t.reason !== undefined && row.disposition === "adapt") row.reason = t.reason;
      if (t.flip && row.disposition === "adopt") { row.disposition = "adapt"; row.reason = t.flip.reason; }
      if (t.action === "rename") row.artifacts = row.artifacts.map((a: string) => a === t.artifact ? t.to : a);
      if (t.action === "remove") { row.artifacts = row.artifacts.filter((a: string) => a !== t.artifact); if (!row.artifacts.length) { row.disposition = "reject"; row.reason = t.reason; } }
    }
    if (t.action === "rename") doc.originals = doc.originals.map((a: string) => a === t.artifact ? t.to : a);
    if (t.action === "remove") doc.originals = doc.originals.filter((a: string) => a !== t.artifact);
    if (Array.isArray(doc.utility)) { if (t.action === "rename") doc.utility = doc.utility.map((a: string) => a === t.artifact ? t.to : a); if (t.action === "remove") doc.utility = doc.utility.filter((a: string) => a !== t.artifact); }
  }
  for (const drop of d.drops) {
    if (!pins.upstreams?.[drop.upstream]) throw new Error(`${drop.upstream} is not an Upstream in pins.yaml`);
    if (p?.upstreams.some(u => u.key === drop.upstream)) throw new Error(`${drop.upstream}: an Update cannot move a dropped Upstream`);
    const dropped: { artifacts: string[] }[] = doc.items.filter((row: any) => row.upstream === drop.upstream);
    doc.items = doc.items.filter((row: any) => row.upstream !== drop.upstream);
    const kept = new Set([...doc.items.flatMap((row: any) => row.artifacts), ...doc.originals]);
    const owned = [...new Set(dropped.flatMap(row => row.artifacts))].filter(a => !kept.has(a));
    for (const a of owned) if (existsSync(join(root, a))) throw new Error(`delete ${a} before prepare`);
    if (Array.isArray(doc.utility)) doc.utility = doc.utility.filter((a: string) => !owned.includes(a));
    delete pins.upstreams[drop.upstream];
    const ids = new Set(drop.house_style ?? []);
    for (const id of ids) if (![...style.replacements, ...(style.rules ?? [])].some((x: any) => x.id === id)) throw new Error(`${drop.upstream}: no House style row or rule ${id}`);
    style.replacements = style.replacements.filter((row: any) => row.upstream !== drop.upstream && !ids.has(row.id));
    if (Array.isArray(style.rules)) style.rules = style.rules.filter((rule: any) => !ids.has(rule.id));
  }
  for (const t of taken) {
    const values = { upstream: t.upstream, kind: t.itemKind, path: t.path, tree: t.tree, disposition: t.disposition, artifacts: [t.artifact], reason: t.reason };
    const row = doc.items.find((x: any) => x.id === t.id);
    if (row) { Object.assign(row, values); delete row.held_at; delete row.held_path; } else doc.items.push({ id: t.id, ...values });
  }
  for (const t of renames) { if (style.replacements.some((r: any) => r.id === t.house_style_row.id)) throw new Error(`House style row already exists: ${t.house_style_row.id}`); style.replacements.push(t.house_style_row); }
  const shipped = shippedNames(doc), commands = commandNames(root);
  const breaking = [...shippedAtHead].some(name => !shipped.has(name)) || [...commandNames(root, head)].some(name => !commands.has(name));
  const level: VersionLevel = breaking ? "major" : p?.moved ? "minor" : "patch";
  const replacements = [...copies.map(c => c.artifact), ...taken.filter(t => t.disposition === "adopt" || !existsSync(join(root, t.artifact))).map(t => t.artifact)];
  for (const path of replacements) expected.set(path, previous?.outputs[path] ?? headInput(root, path));
  const files = [
    ["decision-register.yaml", registerFile.text()],
    ["pins.yaml", pinsFile.text()],
    ["house-style.yaml", styleFile.text()],
    [note, noteText(level, d.changelog)],
  ] as const;
  if (git(root, "rev-parse", "HEAD") !== head) throw new Refusal("HEAD changed during preparation; rerun with the current branch.", { category: "input-conflict", conflicts: ["HEAD"] });
  requireInputs(root, expected);
  const written: string[] = [];
  let attempted: string | undefined;
  try {
    for (const c of copies) {
      attempted = c.artifact;
      rmSync(join(root, c.artifact), { recursive: true, force: true });
      mkdirSync(dirname(join(root, c.artifact)), { recursive: true });
      cpSync(c.source, join(root, c.artifact), { recursive: true, dereference: false });
      written.push(c.artifact);
    }
    for (const t of taken) if (t.disposition === "adopt" || !existsSync(join(root, t.artifact))) {
      attempted = t.artifact;
      if (t.disposition === "adopt") rmSync(join(root, t.artifact), { recursive: true, force: true });
      for (const f of t.files) writeEntry(join(root, f.file), f.entry, f.bytes);
      written.push(t.artifact);
    }
    for (const [path, content] of files) {
      attempted = path;
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
      written.push(path);
    }
  } catch (error) {
    throw new Refusal(`Preparation write failed at ${attempted}: ${(error as Error).message}`, { category: "write-failure", written, attempted, outcome: "checkout-may-be-partially-written" });
  }
  return {
    outputs: Object.fromEntries([...expected.keys()].map(path => [path, checkoutInput(root, path)])),
    receipt: { note, level, rows: d.rows, targets: d.targets, taken: taken.map(t => ({ id: t.id, disposition: t.disposition })) },
  };
}

function release(root: string) {
  const prepared = git(root, "rev-parse", "HEAD");
  const notes = pendingNotes(root, prepared), level = highestLevel(notes);
  if (!level) throw new Error("No pending Change notes at HEAD.");
  const inputs = ["plugin/package.json", "CHANGELOG.md", PLUGIN_RELEASE, ...notes.map(note => note.path)];
  const expected = new Map(inputs.map(path => [path, headInput(root, path)]));
  const conflicts = inputs.filter(path => checkoutInput(root, path) !== expected.get(path));
  if (conflicts.length) throw new Refusal(`Reconcile changed Plugin release inputs before Plugin release: ${conflicts.join(", ")}`, { category: "input-conflict", conflicts });
  const manifest = JSON.parse(atHead(root, "plugin/package.json"));
  const version = releaseVersion(manifest.version, level);
  const receipt: PluginRelease = { schema: 1, prepared, version, date: new Date().toISOString().slice(0, 10) };
  const changelog = foldNotes(atHead(root, "CHANGELOG.md"), version, notes, receipt.date);
  if (git(root, "rev-parse", "HEAD") !== prepared) throw new Error("HEAD changed during Plugin release; rerun at the current commit.");
  writeFileSync(join(root, "plugin/package.json"), `${JSON.stringify({ ...manifest, version }, null, 2)}\n`);
  writeFileSync(join(root, "CHANGELOG.md"), changelog);
  writeFileSync(join(root, PLUGIN_RELEASE), `${JSON.stringify(receipt, null, 2)}\n`);
  for (const note of notes) rmSync(join(root, note.path));
  return { ok: true, ...receipt, level, notes: notes.map(note => note.path) };
}

function changedSkills(root: string): string[] {
  const files = [...git(root, "diff", "--name-only", defaultBase(root), "--", "plugin/skills").split("\n"), ...git(root, "ls-files", "--others", "--exclude-standard", "--", "plugin/skills").split("\n")];
  return [...new Set(files.filter(Boolean).map(f => f.split("/").slice(0, 3).join("/")))].filter(p => existsSync(join(root, p))).sort();
}
async function gates(root: string, opts: UpstreamOptions, scratch: string | undefined, sessionId: string) {
  const commands: Record<string, string[]> = JSON.parse(process.env.VSTACK_MAINTAIN_COMMANDS ?? "{}");
  const retained = maintainEntry(root, scratch, sessionId);
  const report = new GateReport(root, join(retained, "report.json"), defaultBase(root), false, opts.upstreams);
  try {
    for (const skill of changedSkills(root)) {
      if (report.interrupted) break;
      await report.command("validate", [...(commands.validate ?? [process.execPath, join(root, "plugin/skills/skill-creator/scripts/quick_validate.ts")]), join(root, skill)]);
    }
    if (report.interrupted) return report.finish();
    let cacheFailed = false;
    await report.phase("check", async stage => {
      if (!commands.check) {
        const cache = await report.phase("cache", () => { clones(root, opts); }, stage, [process.execPath, ...process.argv.slice(1)]);
        cacheFailed = !cache.ok;
        if (cacheFailed) return;
      }
      const check = await report.command("register", commands.check ?? [process.execPath, join(root, "scripts/check-register.ts"), "--root", root, "--source", "clones", "--upstreams", opts.upstreams ?? defaultUpstreamsDir(), "--json"], stage);
      stage.output = check.output;
      stage.exitCode = check.exitCode;
    });
    if (cacheFailed || report.interrupted) return report.finish();
    const phaseFile = join(retained, "test-phases.json"), shadowFile = join(retained, "shadow-inputs.json");
    report.shareShadow(shadowFile);
    const tests = await report.command("test", commands.test ?? [process.execPath, "run", "test"], undefined, { ...process.env, VSTACK_GATE_PHASE_REPORT: phaseFile, VSTACK_GATE_SHADOW: shadowFile });
    if (existsSync(phaseFile)) {
      const phases = JSON.parse(readFileSync(phaseFile, "utf8"));
      if (!Array.isArray(phases)) throw new Error(`Invalid test phase report: ${phaseFile}`);
      tests.phases = phases;
      if (phases.some(phase => phase.outcome !== "passed" || phase.ok === false)) {
        tests.ok = false;
        tests.outcome = phases.some(phase => phase.outcome === "interrupted" || phase.outcome === "running") ? "interrupted" : "failed";
      }
      report.save();
    }
    if (report.interrupted) return report.finish();
    const out = mkdtempSync(join(tmpdir(), "vstack-maintain-load-"));
    try {
      const smoke = commands.smoke
        ? await report.command("smoke", [...commands.smoke, join(root, "plugin"), out])
        : await report.phase("smoke", async stage => {
          const load = await report.command("load", [join(root, "scripts/load-smoke.sh"), join(root, "plugin"), out], stage);
          stage.output = load.output;
          stage.exitCode = load.exitCode;
          if (load.ok) checkLoadSmoke(root, JSON.parse(readFileSync(load.stdout!, "utf8")));
        });
      if (!smoke.ok) {
        cpSync(out, retained, { recursive: true, filter: src => !/[/\\]\.omp[/\\]natives$/.test(src) });
        smoke.output += `\nSmoke output retained at ${retained}`;
      }
    } finally { rmSync(out, { recursive: true, force: true }); }
  } catch (error) {
    await report.phase("reporting", () => { throw error; });
  }
  return report.finish();
}

const USAGE = `Usage: bun scripts/vstack-maintain.ts <command> [options]
  plan [<upstream>|<upstream>@<ref> ...]  Print the Scratch plan.json path.
  merge --plan <path>                    Preview Upstream overlaps.
  check [--plan <path>] [<artifact> ...]  Find clashes, adopt flips, and callers.
        [--take <upstream>:<path>] [--rename <artifact>=<to>] [--remove <artifact>]
  prepare --decisions <file> [--plan <path>]  Write bookkeeping from HEAD.
  release                                Fold HEAD's Change notes into a Plugin release.
  gates                                  Run validation, checks, tests, and load smoke.
  --scratch <dir>                        Absolute project Scratch dir for plan and gates.
  --session-id <id>                      Parent session id. Requires --scratch. Defaults to PI_SESSION_ID when omitted.
  --root <dir> --upstreams <cache> --remote <url> --source clones|github
  -h, --help                            Show this text.
Tests may inject command arrays for validate, check, test, and smoke through
VSTACK_MAINTAIN_COMMANDS (a JSON object). Smoke commands receive the plugin and output directories.`;
try {
  const args = parseArgs({ allowPositionals: true, options: {
    root: { type: "string" }, plan: { type: "string" }, decisions: { type: "string" }, upstreams: { type: "string" }, remote: { type: "string" }, source: { type: "string" }, scratch: { type: "string" }, "session-id": { type: "string" },
    take: { type: "string", multiple: true }, rename: { type: "string", multiple: true }, remove: { type: "string", multiple: true }, help: { type: "boolean", short: "h" }
  } });
  if (args.values.help) console.log(USAGE);
  else {
    const [command, ...positionals] = args.positionals, opts = args.values;
    if (opts.scratch !== undefined && !isAbsolute(opts.scratch)) throw new Error("--scratch needs an absolute path");
    const scratch = opts.scratch === undefined ? undefined : outsideCheckout(opts.scratch, "Scratch");
    const p = opts.plan ? planAt(opts.plan) : undefined, root = resolve(opts.root ?? p?.root ?? scriptRoot);
    let result: unknown;
    if (command === "plan" || command === "gates") {
      const suppliedId = opts["session-id"];
      if (suppliedId !== undefined && scratch === undefined) throw new Error("--session-id needs --scratch with the parent's absolute project Scratch dir");
      const sessionId = suppliedId ?? process.env.PI_SESSION_ID;
      if (!isScratchSessionId(sessionId)) throw new Error("Run from an omp session with a valid PI_SESSION_ID, or pass the parent's id with --session-id and --scratch");
      result = command === "plan" ? await plan(root, positionals, opts, scratch, sessionId) : await gates(root, opts, scratch, sessionId);
      if (command === "gates" && !(result as { ok: boolean }).ok) process.exitCode = 2;
    } else if (command === "merge") { if (!p) throw new Error("merge needs --plan"); result = mergePreview(p, root, opts.decisions ? readJson(opts.decisions).file_maps : undefined); }
    else if (command === "check") {
      const artifacts = [...new Set([...positionals, ...(p?.rows.flatMap(r => r.artifacts) ?? [])])];
      result = await checkTargets(root, artifacts, opts.take ?? [], opts.rename ?? [], opts.remove ?? [], opts);
    } else if (command === "prepare") { if (!opts.decisions) throw new Error("prepare needs --decisions"); result = await prepare(root, opts.decisions, p, opts); }
    else if (command === "release") result = release(root);
    else throw new Error(USAGE);
    console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
  }
} catch (e) { console.log(JSON.stringify({ ok: false, reason: (e as Error).message, ...(e instanceof Refusal ? e.details : {}) })); process.exitCode = 2; }

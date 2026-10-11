#!/usr/bin/env bun
// vstack-edit: the deterministic steps of a Hand edit. The skill owns judgment and `ask`; this script acts
// only on the run file and the decisions file. Every command prints JSON. Exit 0: done. Exit 2: refused or
// failed, with {"ok": false, "reason"} on stdout. The README's vstack-edit section documents the commands.

import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { addWorktree, ensureDeps, mainCheckoutName, removeWorktree, worktreeBase, type AddedWorktree } from "./lib/omp-worktree.ts";
import { loadGate, preflight, run } from "./lib/update-gates.ts";
import { applyRows, findRow, parseHouseStyle, selectRows, type MatchKind, type Replacement, type TextDisposition } from "./lib/house-style.ts";
import { asText, cloneSource, defaultUpstreamRemote, defaultUpstreamsDir, fetchRefs, readBlobs, writeEntry, type UpstreamSource, type UpstreamTree } from "./lib/upstreams.ts";
import { loadPins, NEVER_SHIPPED, parseRegister, upstreamItems, type Pin, type Register } from "./lib/vstack-repo.ts";

const scriptRoot = resolve(import.meta.dir, "..");
const MAIN = "main";
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** A register unit that a Hand edit can target, with its kind: `plugin/skills/<name>`, `plugin/agents/<name>.md`, `plugin/rules/<name>.md`. */
const TARGET = /^plugin\/(?:(skills)\/([a-z0-9-]+)|(agents|rules)\/([a-z0-9-]+)\.md)$/;
const KIND = { skills: "skill", agents: "agent", rules: "rule" } as const;
/** The paths a Hand edit changes and finish commits. house-style.yaml gains the row of a rename. */
const MANAGED = ["plugin", "CHANGELOG.md", "decision-register.yaml", "house-style.yaml"];
/** The router. A run that adds, takes, renames, or removes a skill also changes its route here (check-register's unrouted-skill). */
const ROUTER = "plugin/skills/ask-vstack";
/** The grilling closing-gate answer that confirms the result: "Shared understanding", with or without its option letter. */
const CONFIRMED = /^(?:[A-Z]\.\s*)?Shared understanding\b/;

/** The run file preflight writes: every later command reads it through `--run`. */
interface Run {
  root: string;
  branch: string;
  worktree: { path: string; cloned: boolean; deps: string };
  out: string;
}

const git = (cwd: string, ...args: string[]) => run(["git", ...args], cwd);
const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));
function save(p: string, v: unknown) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(v, null, 2) + "\n");
}

function start(root: string, name: string | undefined, gh: string, omp: string) {
  if (!name || !NAME.test(name)) throw new Error(`--name must be lowercase letters, digits, and single hyphens, not ${JSON.stringify(name ?? "")}`);
  preflight(root, gh);
  const path = join(worktreeBase(omp, root), `vstack-${mainCheckoutName(root)}-edit-${name}`);
  let wt: AddedWorktree | undefined;
  try {
    wt = addWorktree({ omp, root, branch: `edit/${name}`, path, ref: MAIN });
    const deps = wt.cloned ? "cloned" : ensureDeps(wt.path);
    const out = join(git(wt.path, "rev-parse", "--absolute-git-dir"), "vstack-edit");
    const state: Run = { root, branch: wt.branch, worktree: { path: wt.path, cloned: wt.cloned, deps }, out };
    const file = join(out, "run.json");
    save(file, state);
    return { run: file, ...state };
  } catch (e) {
    if (wt) removeWorktree(root, wt);
    throw e;
  }
}

function runAt(file: string | undefined): Run {
  if (!file) throw new Error("--run <run.json> is required; preflight prints its path");
  const r: Run = readJson(file);
  if (!r.branch?.startsWith("edit/") || !existsSync(r.worktree?.path ?? "")) throw new Error(`${file} is not a live vstack-edit run`);
  if (git(r.worktree.path, "branch", "--show-current") !== r.branch) throw new Error(`the run's worktree is no longer on ${r.branch}`);
  return r;
}

function target(artifact: string) {
  const m = TARGET.exec(artifact);
  if (!m) throw new Error(`${artifact} is not plugin/skills/<name>, plugin/agents/<name>.md, or plugin/rules/<name>.md`);
  return { artifact, kind: KIND[(m[1] ?? m[3]) as keyof typeof KIND], name: m[2] ?? m[4]! };
}

/** The register unit a plugin file belongs to: `plugin/skills/<name>`, or the agent or rule file itself. */
const unitOf = (file: string) => file.split("/").slice(0, 3).join("/");

/**
 * How a rename's House style row finds a name in text: a hyphenated name anywhere as a name, a one-word name only
 * as `/x`, `` `x` ``, `**x**`, or `skill://x`, as the rename rows in house-style.yaml do for names that are also
 * English words.
 */
const nameMatch = (name: string) => ({ from: name, match: (name.includes("-") ? "name" : "ref") as MatchKind });

/** The row a rename adds: required for every Upstream, so check-register fails shipped text that keeps the old name and the Update rewrites it. */
const renameRow = (from: string, to: string): Replacement => ({ id: `rename-${from}`, ...nameMatch(from), to, upstream: "any", scope: "required", uses: ["update"] });

/**
 * Plugin files outside `artifact` that name it as `skill://<name>` or `/skill:<name>`. With `bare`, also the files
 * where its rename row matches, such as an adopt caller's Upstream form `/<name>`.
 */
function callers(wt: string, artifact: string, name: string, bare = false): string[] {
  const ref = new RegExp(`(?:skill://|/skill:)${name}(?![a-z0-9-])`);
  const files = git(wt, "ls-files", "--cached", "--others", "--exclude-standard", "--", "plugin").split("\n").filter(Boolean);
  const text = (f: string) => { const p = join(wt, f); return existsSync(p) && lstatSync(p).isFile() ? readFileSync(p, "utf8") : ""; };
  const names = (t: string) => ref.test(t) || (bare && findRow(t, nameMatch(name)).length > 0);
  return files.filter((f) => !(f === artifact || f.startsWith(`${artifact}/`)) && names(text(f))).sort();
}

/** The units among `files` that main registers as adopt: a change to one of them needs a confirmed flip. */
const adoptUnits = (register: Register, files: string[]) =>
  [...new Set(files.map(unitOf))].filter((u) => register.rows.some((row) => row.disposition === "adopt" && row.artifacts.includes(u))).sort();

/**
 * What the flow does with a target, judged against main: `add` for a name that main and its register do not have,
 * `edit` for a registered item, which must be in the worktree unless `present` is false (a rename or removal moved
 * or deleted it).
 */
function classify(wt: string, pins: ReturnType<typeof loadPins>, register: Register, artifact: string, present = true) {
  const t = target(artifact);
  const rows = register.rows.filter((row) => row.artifacts.includes(artifact));
  const original = register.originals.includes(artifact);
  if (!rows.length && !original) {
    if (onMain(wt, artifact)) throw new Error(`${artifact} is on ${MAIN} but in no register row and not in originals:`);
    return { ...t, action: "add" as const, dispositions: [] as string[], rows: [] };
  }
  if (present && !existsSync(join(wt, artifact))) throw new Error(`${artifact} does not exist in the run's worktree`);
  return {
    ...t,
    action: "edit" as const,
    dispositions: original ? ["original"] : [...new Set(rows.map((row) => row.disposition!))],
    rows: rows.map((row) => ({ id: row.id, upstream: row.upstream, pin: row.upstream ? pins.get(row.upstream)?.pin : undefined, path: row.path, tree: row.tree, disposition: row.disposition, reason: row.raw.reason })),
  };
}

/** A rename of `artifact` to `to`, judged against main: main registers `artifact`, and `to` is a new name of the same kind. */
function renameTarget(wt: string, pins: ReturnType<typeof loadPins>, register: Register, artifact: string, to: string, present: boolean) {
  const c = classify(wt, pins, register, artifact, present);
  if (c.action === "add") throw new Error(`${artifact} is not on ${MAIN}; a rename needs an item that main registers`);
  const t = target(to);
  if (t.kind !== c.kind) throw new Error(`${artifact} is a ${c.kind} and ${to} is a ${t.kind}; a rename keeps the kind`);
  if (onMain(wt, to) || register.originals.includes(to) || register.rows.some((row) => row.artifacts.includes(to))) throw new Error(`${to} is already on ${MAIN}; pick another name`);
  return { ...c, action: "rename" as const, to, newName: t.name, house_style_row: renameRow(c.name, t.name) };
}

/** A removal of `artifact`, judged against main, with the register rows that name only it: they turn reject. */
function removeTarget(wt: string, pins: ReturnType<typeof loadPins>, register: Register, artifact: string, present: boolean) {
  const c = classify(wt, pins, register, artifact, present);
  if (c.action === "add") throw new Error(`${artifact} is not on ${MAIN}; a removal needs an item that main registers`);
  const rejects = register.rows.filter((row) => row.artifacts.length && row.artifacts.every((a) => a === artifact)).map((row) => row.id);
  return { ...c, action: "remove" as const, rejects };
}

/** main's register, which the bookkeeping starts from: a row that prepare flipped is still adopt here, and a new item is still absent. */
function mainRegister(wt: string) {
  const text = git(wt, "show", `${MAIN}:decision-register.yaml`);
  return { text, register: parseRegister(Bun.YAML.parse(text), `${MAIN}:decision-register.yaml`) };
}

interface UpstreamOptions { upstreams?: string; remote?: string }

/**
 * The clone cache, holding every ref the run reads: each current Pin, and the `held_at` ref of each held row, which
 * check-register reads. A missing clone or ref is fetched alone, so the cache gains no branch and no newer ref.
 */
function clones(wt: string, opts: UpstreamOptions): string {
  const dir = opts.upstreams ?? defaultUpstreamsDir();
  const { register } = mainRegister(wt);
  for (const pin of loadPins(wt).values()) {
    const held = register.rows.filter((row) => row.upstream === pin.key && row.held_at).map((row) => row.held_at!);
    fetchRefs(dir, pin, opts.remote ?? defaultUpstreamRemote(), [pin.pin, ...held]);
  }
  return dir;
}

/** What a take and a clash check read: the Pins, main's register and House style rows, and the clone cache, only at each Pin. */
interface Upstreams { pins: Map<string, Pin>; register: Register; replacements: Replacement[]; dir: string; source: UpstreamSource }

function upstreamsAt(wt: string, opts: UpstreamOptions): Upstreams {
  const dir = clones(wt, opts);
  const pins = loadPins(wt);
  const { houseStyle } = parseHouseStyle(Bun.YAML.parse(git(wt, "show", `${MAIN}:house-style.yaml`)), new Set(pins.keys()));
  return { pins, register: mainRegister(wt).register, replacements: houseStyle.replacements, dir, source: cloneSource(dir) };
}

const itemsAt = async (u: Upstreams, pin: Pin) => upstreamItems(pin, await u.source.tree(pin, pin.pin));

/** An Upstream item at a current Pin that a new name matches. */
interface Clash { upstream: string; path: string; pin: string }

/** Each Upstream item name at the current Pins, with where it is. */
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

/** A refusal with details for the skill, printed next to `reason`. */
class Refusal extends Error {
  constructor(message: string, readonly details: Record<string, unknown>) { super(message); }
}

/**
 * Refuses a new name that an Upstream item has at a current Pin, before anything is written. Each clash in the
 * refusal has `take`: the `--take` value that takes that item in place of the new item, or null when it cannot.
 * A rename's new name gets no take: the renamed item stays.
 */
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

const onMain = (wt: string, path: string) => Bun.spawnSync(["git", "cat-file", "-e", `${MAIN}:${path}`], { cwd: wt }).exitCode === 0;

/**
 * The Upstream item `<upstream>:<path>` at its current Pin, as a take target: a rejected item, or one with no
 * register row. A skill or principle directory ships as `plugin/skills/<name>`, an agent file as `plugin/agents/<name>.md`.
 */
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
  const id = row?.id ?? (t.kind === "agent" ? `${upstream}/agents/${t.name}` : `${upstream}/${t.name}`); // the id forms of the register's own rows
  if (!row && u.register.rows.some((x) => x.id === id)) throw new Error(`the register already has a row ${id}`);
  if (onMain(wt, t.artifact) || u.register.originals.includes(t.artifact) || u.register.rows.some((x) => x.artifacts.includes(t.artifact))) {
    throw new Error(`${t.artifact} is already on ${MAIN}; ${upstream}:${path} cannot ship under that name`);
  }
  return { ...t, action: "take" as const, upstream, path, pin: pin.pin, tree: item.sha, type: item.type, itemKind: item.kind, id, rowIndex: row?.index };
}

type Take = Awaited<ReturnType<typeof takeTarget>>;

/**
 * The files a take ships, read at the Pin without agents/openai.yaml. The take is adopt unless a House style row
 * that covers adopt text (scope required) matches the item; then it is adapt, and every row the Update runs on adapt
 * text is applied to it.
 */
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

/** A take target with its Disposition and files, from a `--take <upstream>:<path>` value. */
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

/**
 * Each target's action, register rows and Disposition at the current Pins, and callers. A new name also gets its
 * Upstream clashes. A take gets the Upstream item, its rejected row if any, and the Disposition it ships as. A
 * rename or removal also counts a caller that names the old name in an Upstream form, lists the adopt callers, and
 * gets the House style row (rename) or the register rows that turn reject (removal).
 */
async function check(r: Run, artifacts: string[], takes: string[], renames: string[], removes: string[], opts: UpstreamOptions) {
  if (!artifacts.length && !takes.length && !renames.length && !removes.length) throw new Error("name at least one target artifact, --take <upstream>:<path>, --rename <artifact>=<new artifact>, or --remove <artifact>");
  const wt = r.worktree.path;
  const pins = loadPins(wt);
  const { register } = mainRegister(wt);
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

/** The decisions file the skill writes from the user's answers. */
interface Decisions {
  targets: {
    action: string;
    kind: string;
    artifact: string;
    /** Only on an adopt edit or rename: the user confirmed the flip to adapt and gave the row's new one-line reason. */
    flip?: { confirmed: boolean; reason: string };
    /** Only on a take: the Upstream item, as check printed it. */
    upstream?: string;
    path?: string;
    /** Only on a take, and on a removal that turns a register row reject: the row's one-line reason from the user's answers. */
    reason?: string;
    /** Only on a rename: the artifact path of the new name. */
    to?: string;
  }[];
  /** CHANGELOG lines, without the leading `- `. */
  changelog: string[];
  /** The commit message finish uses. */
  commit: string;
}

const ACTIONS = ["add", "edit", "take", "rename", "remove"];
const oneLine = (s: unknown): s is string => typeof s === "string" && s.trim() !== "" && !s.includes("\n");

function decisionsAt(file: string | undefined): Decisions {
  if (!file) throw new Error("--decisions <file> is required");
  const d = readJson(file);
  if (!Array.isArray(d.targets) || !d.targets.length) throw new Error("decisions need a nonempty targets array");
  for (const t of d.targets) if (!ACTIONS.includes(t?.action)) throw new Error(`${t?.artifact}: action ${JSON.stringify(t?.action)} is not supported yet; only ${ACTIONS.join(", ")} are`);
  const named = d.targets.flatMap((t: any) => (t.action === "rename" && typeof t.to === "string" ? [t.artifact, t.to] : [t.artifact]));
  if (new Set(named).size !== named.length) throw new Error("each target artifact may appear once");
  if (!Array.isArray(d.changelog) || !d.changelog.length || d.changelog.some((l: unknown) => !oneLine(l))) throw new Error("changelog must list one or more one-line entries");
  if (typeof d.commit !== "string" || !d.commit.trim()) throw new Error("commit must hold the commit message");
  return d;
}

/** Artifact units under plugin/ that differ from main, tracked or untracked. The manifest is bookkeeping, not a unit. */
function changedUnits(wt: string): string[] {
  const files = [...git(wt, "diff", "--name-only", MAIN, "--", "plugin").split("\n"), ...git(wt, "ls-files", "--others", "--exclude-standard", "--", "plugin").split("\n")];
  return [...new Set(files.filter((f) => f && f !== "plugin/package.json").map(unitOf))].sort();
}

/** main's CHANGELOG with `entries` added under Unreleased, then every Unreleased line moved under the `version` heading. */
function changelog(text: string, version: string, entries: string[]): string {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.startsWith("## [Unreleased]"));
  if (start < 0) throw new Error(`${MAIN}:CHANGELOG.md has no ## [Unreleased] heading`);
  let end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  if (end < 0) end = lines.length;
  const moved = [...lines.slice(start + 1, end).filter((l) => l.trim()), ...entries.map((e) => `- ${e}`)];
  const section = [lines[start]!, "", `## [${version}] - ${new Date().toISOString().slice(0, 10)}`, "", ...moved, ""];
  return [...lines.slice(0, start), ...section, ...lines.slice(end)].join("\n").replace(/\n*$/, "\n");
}

/**
 * A register row's new values: a flip's or a removal's Disposition and reason, and the artifacts of a taken rejected
 * row, a renamed artifact, or a removed one. A take ships the current Pin, so `unhold` drops a Hold (`held_at`,
 * `held_path`) that check-register would compare it against.
 */
interface RowChange { disposition?: string; reason?: string; artifacts?: string[]; unhold?: boolean }

/** The line range of the `items:` block and the first line of each row in it. */
function itemLines(lines: string[]) {
  const items = lines.findIndex((l) => l.startsWith("items:"));
  let end = lines.findIndex((l, i) => i > items && /^[^\s#]/.test(l));
  if (end < 0) end = lines.length;
  return { items, end, starts: lines.flatMap((l, i) => (i > items && i < end && l.startsWith("  - ") ? [i] : [])) };
}

/** Refuses `out` unless it parses as `text` with `edit` applied: the line edits of `file` kept every other value. */
function sameAs(text: string, out: string, edit: (doc: any) => void, file = "decision-register.yaml") {
  const expected = Bun.YAML.parse(text) as any;
  edit(expected);
  if (!Bun.deepEquals(Bun.YAML.parse(out), expected)) throw new Error(`${MAIN}:${file} has a layout prepare cannot rewrite line by line`);
  return out;
}

/** `text` with each row in `changes`, by index, given its new values. Every other line stays as it is. */
function rewriteRows(text: string, changes: Map<number, RowChange>): string {
  if (!changes.size) return text;
  const lines: (string | undefined)[] = text.split("\n");
  const { end, starts } = itemLines(lines as string[]);
  for (const [index, c] of changes) {
    const last = starts[index + 1] ?? end;
    for (let i = starts[index]!; i < last; i++) {
      const line = lines[i];
      if (line === undefined) continue;
      const drop = (from: number) => { for (let j = from; j < last && lines[j]!.startsWith("      "); j++) lines[j] = undefined; }; // a value's own lines
      if (c.disposition !== undefined && line.startsWith("    disposition:")) lines[i] = `    disposition: ${c.disposition}`;
      else if (c.reason !== undefined && line.startsWith("    reason:")) lines[i] = `    reason: ${JSON.stringify(c.reason)}`;
      else if (c.artifacts && line.startsWith("    artifacts:")) {
        lines[i] = `    artifacts: [${c.artifacts.join(", ")}]`;
        drop(i + 1);
      } else if (c.unhold && /^    held_(?:at|path):/.test(line)) {
        lines[i] = undefined;
        drop(i + 1);
      }
    }
  }
  return sameAs(text, lines.filter((l) => l !== undefined).join("\n"), (doc) => {
    for (const [index, { unhold, ...c }] of changes) {
      Object.assign(doc.items[index], c);
      if (unhold) { delete doc.items[index].held_at; delete doc.items[index].held_path; }
    }
  });
}

/** `text` with `rows` appended after the last row of `items:`, in the layout of the rows above them. */
function appendRows(text: string, rows: { id: string; upstream: string; kind: string; path: string; tree: string; disposition: string; artifacts: string[]; reason: string }[]): string {
  if (!rows.length) return text;
  const lines = text.split("\n");
  let { end } = itemLines(lines);
  while (end > 0 && !/^\s/.test(lines[end - 1]!)) end--; // blank lines and comments before the next key stay with it
  const block = rows.flatMap((row) => [
    `  - id: ${row.id}`,
    ...(["upstream", "kind", "path", "tree", "disposition"] as const).map((k) => `    ${k}: ${row[k]}`),
    `    artifacts: [${row.artifacts.join(", ")}]`,
    `    reason: ${JSON.stringify(row.reason)}`,
  ]);
  return sameAs(text, [...lines.slice(0, end), ...block, ...lines.slice(end)].join("\n"), (doc) => doc.items.push(...rows));
}

/** `text`, main's house-style.yaml, with `rows` appended at the end of `replacements:`, after every row that can write their `from`. */
function withStyleRows(text: string, rows: Replacement[]): string {
  if (!rows.length) return text;
  const lines = text.split("\n");
  const at = lines.findIndex((l) => /^replacements:\s*$/.test(l));
  if (at < 0) throw new Error(`${MAIN}:house-style.yaml has no top-level replacements: list`);
  let end = lines.findIndex((l, i) => i > at && /^[^\s#]/.test(l));
  if (end < 0) end = lines.length;
  while (end > at + 1 && !/^\s/.test(lines[end - 1]!)) end--; // blank lines and comments before the next key stay with it
  const block = rows.flatMap((row) => [`  - id: ${row.id}`, ...(["from", "to", "match", "upstream", "scope"] as const).map((k) => `    ${k}: ${row[k]}`), `    uses: [${row.uses.join(", ")}]`]);
  return sameAs(text, [...lines.slice(0, end), ...block, ...lines.slice(end)].join("\n"), (doc) => doc.replacements.push(...rows), "house-style.yaml");
}

/** Refuses a change to an adopt target unless the user confirmed its flip to adapt with a new reason, and a flip on any other target. */
function refuseUnconfirmedFlip(t: Decisions["targets"][number], dispositions: string[]) {
  const adopt = dispositions.includes("adopt");
  const { confirmed, reason } = t.flip ?? {};
  if (adopt && (confirmed !== true || !oneLine(reason))) {
    throw new Error(`${t.artifact} is adopt; ${t.action === "rename" ? "a rename" : "an edit"} flips it to adapt, so the target needs flip {"confirmed": true, "reason": "<one-line new reason>"} from the user's answers`);
  }
  if (!adopt && t.flip !== undefined) throw new Error(`${t.artifact} is not adopt; only an adopt target takes a flip`);
}

/**
 * Refuses decisions whose action or kind differ from what main has, an adopt edit or rename without a confirmed
 * flip, a take of anything but a rejected or unregistered item at the current Pin or without its reason, a new name
 * that clashes with an Upstream item, a rename or removal that left the old artifact or a file that still names it,
 * and plugin changes other than the targets and, when the run adds, takes, renames, or removes a skill, its route in
 * ask-vstack.
 */
async function validate(r: Run, d: Decisions, opts: UpstreamOptions) {
  const wt = r.worktree.path;
  const pins = loadPins(wt);
  const { register } = mainRegister(wt);
  const kindOf = (t: Decisions["targets"][number], kind: string) => { if (t.kind !== kind) throw new Error(`${t.artifact}: its kind is ${kind}, not ${t.kind}`); };
  const targets = d.targets.filter((t) => t.action === "add" || t.action === "edit").map((t) => {
    const c = classify(wt, pins, register, t.artifact);
    if (t.action !== c.action) throw new Error(c.action === "add" ? `${t.artifact} is not on ${MAIN}; its action is add, not ${t.action}` : `${t.artifact} is already on ${MAIN}; its action is edit, not ${t.action}`);
    kindOf(t, c.kind);
    refuseUnconfirmedFlip(t, c.dispositions);
    return c;
  });
  const renames = d.targets.filter((t) => t.action === "rename").map((t) => {
    if (typeof t.to !== "string") throw new Error(`${t.artifact}: a rename needs the new artifact path in to`);
    const x = renameTarget(wt, pins, register, t.artifact, t.to, false);
    kindOf(t, x.kind);
    if (existsSync(join(wt, t.artifact))) throw new Error(`${t.artifact} still exists; a rename moves it to ${t.to}`);
    if (!existsSync(join(wt, t.to))) throw new Error(`${t.to} does not exist; move ${t.artifact} there first`);
    refuseUnconfirmedFlip(t, x.dispositions);
    return x;
  });
  const removals = d.targets.filter((t) => t.action === "remove").map((t) => {
    const x = removeTarget(wt, pins, register, t.artifact, false);
    kindOf(t, x.kind);
    if (existsSync(join(wt, t.artifact))) throw new Error(`${t.artifact} still exists; a removal deletes it`);
    if (t.flip !== undefined) throw new Error(`${t.artifact} is a removal; only an adopt edit or rename takes a flip`);
    if (x.rejects.length && !oneLine(t.reason)) throw new Error(`${t.artifact}: a removal needs the one-line reason from the user's answers for the register rows that it turns reject (${x.rejects.join(", ")})`);
    if (!x.rejects.length && t.reason !== undefined) throw new Error(`${t.artifact} has no register row that a removal turns reject; drop reason`);
    return { ...x, reason: t.reason?.trim() };
  });
  const added = targets.filter((t) => t.action === "add");
  const takes = d.targets.filter((t) => t.action === "take");
  const u = added.length || takes.length || renames.length ? upstreamsAt(wt, opts) : undefined;
  const taken = [];
  for (const t of takes) {
    if (typeof t.upstream !== "string" || typeof t.path !== "string") throw new Error(`${t.artifact}: a take needs the upstream and path that check printed`);
    const x = await take(wt, u!, t.upstream, t.path);
    if (x.artifact !== t.artifact) throw new Error(`${t.upstream}:${t.path} ships as ${x.artifact}, not ${t.artifact}`);
    kindOf(t, x.kind);
    if (!oneLine(t.reason)) throw new Error(`${t.artifact}: a take needs the register row's one-line reason from the user's answers`);
    if (t.flip !== undefined) throw new Error(`${t.artifact} is a take; only an adopt edit takes a flip`);
    taken.push({ ...x, reason: t.reason.trim() });
  }
  for (const t of renames) if (u!.replacements.some((row) => row.id === t.house_style_row.id)) throw new Error(`${MAIN}:house-style.yaml already has a row ${t.house_style_row.id}`);
  if (added.length || renames.length) {
    const names = await upstreamNames(u!);
    await refuseClashes(wt, u!, [...added.map((t) => ({ artifact: t.artifact, clashes: names.get(t.name) })), ...renames.map((t) => ({ artifact: t.to, clashes: names.get(t.newName), rename: true }))]);
  }
  const changed = changedUnits(wt);
  const named = new Set([...d.targets.map((t) => t.artifact), ...renames.map((t) => t.to)]);
  const routes = [...added, ...taken, ...renames, ...removals].some((t) => t.kind === "skill");
  for (const t of targets) if (!changed.includes(t.artifact)) throw new Error(`${t.artifact} has no change from ${MAIN}; write the draft first`);
  for (const a of changed) if (!named.has(a) && !(routes && a === ROUTER)) throw new Error(`${a} changed but is not a target; add it to the decisions file or undo the change`);
  const left = [...renames, ...removals].flatMap((t) => callers(wt, t.artifact, t.name, true).map((f) => `${f} still names ${t.name}`));
  if (left.length) throw new Error(`${left.join("; ")}. Change every caller in this run and list it as a target`);
  return { added: added.map((t) => t.artifact), taken, renames, removals };
}

/**
 * main's register text with `removed` dropped from the `originals:` block list, each `renamed` key changed to its
 * value, and `added` appended. Refuses a layout it cannot change exactly.
 */
function withOriginals(text: string, added: string[], renamed: Map<string, string>, removed: Set<string>): string {
  if (!added.length && !renamed.size && !removed.size) return text;
  const lines = text.split("\n");
  const at = lines.findIndex((l) => /^originals:\s*(?:\[\])?\s*$/.test(l));
  if (at < 0) throw new Error(`${MAIN}:decision-register.yaml has no top-level originals: list`);
  let end = at + 1;
  while (end < lines.length && /^\s+- /.test(lines[end]!)) end++;
  const indent = /^(\s+)- /.exec(lines[at + 1] ?? "")?.[1] ?? "  ";
  const kept = lines.slice(at + 1, end).flatMap((l) => {
    const a = l.replace(/^\s+- /, "").trim();
    return removed.has(a) ? [] : [renamed.has(a) ? `${indent}- ${renamed.get(a)}` : l];
  });
  const list = [...kept, ...added.map((a) => `${indent}- ${a}`)];
  const out = [...lines.slice(0, at), list.length ? "originals:" : "originals: []", ...list, ...lines.slice(end)].join("\n");
  const before = parseRegister(Bun.YAML.parse(text), "main").originals;
  const expected = [...before.filter((a) => !removed.has(a)).map((a) => renamed.get(a) ?? a), ...added];
  if (JSON.stringify(parseRegister(Bun.YAML.parse(out), "prepared").originals) !== JSON.stringify(expected)) throw new Error(`cannot change originals: in ${MAIN}:decision-register.yaml; keep it one block list`);
  return out;
}

/**
 * The bookkeeping, rebuilt from main on every run: the confirmed adopt flips, the taken rows, the moved and removed
 * artifacts, new originals, the House style row of each rename, the version bump, and the CHANGELOG entry. A removal
 * turns a row that names only the removed artifact reject. A rename or removal of a skill or agent, a shipped name,
 * raises the major version; any other run the patch version. A taken item that the worktree lacks is written from its
 * Pin first; one that the worktree has stays as it is, so a fix to an adapt take survives the next prepare.
 */
async function prepare(r: Run, file: string | undefined, opts: UpstreamOptions) {
  const d = decisionsAt(file);
  const { added, taken, renames, removals } = await validate(r, d, opts);
  const wt = r.worktree.path;
  const { text, register } = mainRegister(wt);
  const changes = new Map<number, RowChange>();
  const change = (index: number, c: RowChange) => changes.set(index, { ...changes.get(index), ...c });
  for (const t of d.targets) {
    if (t.flip) for (const row of register.rows) if (row.disposition === "adopt" && row.artifacts.includes(t.artifact)) change(row.index, { disposition: "adapt", reason: t.flip.reason.trim() });
  }
  for (const t of taken) if (t.rowIndex !== undefined) change(t.rowIndex, { disposition: t.disposition, reason: t.reason, artifacts: [t.artifact], unhold: true });
  for (const t of renames) for (const row of register.rows) if (row.artifacts.includes(t.artifact)) change(row.index, { artifacts: row.artifacts.map((a) => (a === t.artifact ? t.to : a)) });
  for (const t of removals) {
    for (const row of register.rows) {
      if (!row.artifacts.includes(t.artifact)) continue;
      change(row.index, t.rejects.includes(row.id) ? { disposition: "reject", artifacts: [], reason: t.reason! } : { artifacts: row.artifacts.filter((a) => a !== t.artifact) });
    }
  }
  const rows = taken.filter((t) => t.rowIndex === undefined).map((t) => ({ id: t.id, upstream: t.upstream, kind: t.itemKind, path: t.path, tree: t.tree, disposition: t.disposition, artifacts: [t.artifact], reason: t.reason }));
  const renamedOriginals = new Map(renames.filter((t) => register.originals.includes(t.artifact)).map((t) => [t.artifact, t.to]));
  const removedOriginals = new Set(removals.filter((t) => register.originals.includes(t.artifact)).map((t) => t.artifact));
  const registerChanged = changes.size || rows.length || added.length || renamedOriginals.size || removedOriginals.size;
  const rewritten = registerChanged ? withOriginals(appendRows(rewriteRows(text, changes), rows), added, renamedOriginals, removedOriginals) + "\n" : undefined;
  const styleRows = renames.map((t) => t.house_style_row);
  const style = styleRows.length ? withStyleRows(git(wt, "show", `${MAIN}:house-style.yaml`), styleRows) + "\n" : undefined;
  const manifest = git(wt, "show", `${MAIN}:plugin/package.json`);
  const [major, minor, patch] = String(JSON.parse(manifest).version).split(".").map(Number);
  const shippedName = [...renames, ...removals].some((t) => t.kind === "skill" || t.kind === "agent");
  const version = shippedName ? `${major! + 1}.0.0` : `${major}.${minor}.${patch! + 1}`;
  for (const t of taken) if (!existsSync(join(wt, t.artifact))) for (const f of t.files) writeEntry(join(wt, f.file), f.entry, f.bytes);
  if (rewritten) writeFileSync(join(wt, "decision-register.yaml"), rewritten);
  else git(wt, "restore", "--source", MAIN, "--", "decision-register.yaml");
  if (style) writeFileSync(join(wt, "house-style.yaml"), style);
  else git(wt, "restore", "--source", MAIN, "--", "house-style.yaml");
  writeFileSync(join(wt, "plugin/package.json"), manifest.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`) + "\n");
  writeFileSync(join(wt, "CHANGELOG.md"), changelog(git(wt, "show", `${MAIN}:CHANGELOG.md`), version, d.changelog));
  save(join(r.out, "decisions.json"), d);
  save(join(r.out, "prepared.json"), { digest: digest(r) });
  const flipped = [...changes].filter(([i, c]) => register.rows[i]!.disposition === "adopt" && c.disposition === "adapt").map(([i]) => register.rows[i]!.id);
  return {
    version,
    changelog: d.changelog,
    targets: d.targets.map((t) => t.artifact),
    flipped,
    taken: taken.map((t) => ({ id: t.id, artifact: t.artifact, disposition: t.disposition })),
    renamed: renames.map((t) => ({ artifact: t.artifact, to: t.to })),
    removed: removals.map((t) => ({ artifact: t.artifact, rejected: t.rejects })),
    house_style_rows: styleRows.map((row) => row.id),
    originals: added,
  };
}

/** A hash of `roots` in the worktree, by path and content, without the paths in `skip`. */
function hashTree(wt: string, roots: string[], skip: string[] = []) {
  const h = createHash("sha256");
  const visit = (path: string) => {
    const rel = relative(wt, path);
    if (!existsSync(path) || skip.includes(rel)) return;
    h.update(rel);
    const st = lstatSync(path);
    if (st.isSymbolicLink()) h.update(readlinkSync(path));
    else if (st.isDirectory()) for (const name of readdirSync(path).sort()) visit(join(path, name));
    else h.update(readFileSync(path));
  };
  for (const name of roots) visit(join(wt, name));
  return h;
}

/** A hash of the managed paths in the worktree and the prepared decisions: what the last prepare left. */
function digest(r: Run): string {
  return hashTree(r.worktree.path, MANAGED).update(readFileSync(join(r.out, "decisions.json"))).digest("hex");
}

/** A hash of the skill, agent, and rule text: plugin/ without the version, which is bookkeeping like CHANGELOG.md and the register. */
const textDigest = (r: Run) => hashTree(r.worktree.path, ["plugin"], ["plugin/package.json"]).digest("hex");

const receiptHolds = (r: Run, name: string, key: string, value: () => string) => { const p = join(r.out, name); return existsSync(p) && readJson(p)[key] === value(); };

/**
 * Refuses unless the files are as the last prepare left them and the last gates pass covers the current text.
 * Bookkeeping alone (CHANGELOG lines, commit message, flip reason, and what prepare derives from them) needs a
 * new prepare, not new gates.
 */
function gatesHold(r: Run) {
  if (!receiptHolds(r, "prepared.json", "digest", () => digest(r))) throw new Error("the files changed after the last prepare; run prepare, and gates too if the skill, agent, or rule text changed");
  if (!receiptHolds(r, "gates.json", "text", () => textDigest(r))) throw new Error("no gates passed on the current skill, agent, or rule text; run gates");
}

interface GateOptions extends UpstreamOptions { smoke?: string; test?: string }

/**
 * quick_validate on each skill directory that exists after prepare and that the run added, changed, or renamed, at
 * its final path: a removed skill and the old path of a renamed one get none. Then check-register, the test suite,
 * and the load gate. Runs every gate and refuses with all failures. A pass writes the receipt finish checks.
 */
async function gates(r: Run, opts: GateOptions) {
  const prepared = join(r.out, "decisions.json");
  if (!existsSync(prepared)) throw new Error("run prepare before gates");
  await validate(r, decisionsAt(prepared), opts);
  const wt = r.worktree.path;
  const receipt = join(r.out, "gates.json");
  rmSync(receipt, { force: true });
  const before = digest(r);
  const failures: string[] = [];
  const gate = (name: string, fn: () => void) => { try { fn(); } catch (e) { failures.push(`${name}: ${(e as Error).message}`); } };
  for (const a of changedUnits(wt)) {
    if (a.startsWith("plugin/skills/") && existsSync(join(wt, a))) gate(`quick_validate ${a}`, () => run([process.execPath, join(scriptRoot, "plugin/skills/skill-creator/scripts/quick_validate.ts"), join(wt, a)], wt));
  }
  gate("check-register", () => {
    const upstreams = clones(wt, opts);
    const c = Bun.spawnSync([process.execPath, join(scriptRoot, "scripts/check-register.ts"), "--root", wt, "--source", "clones", "--upstreams", upstreams, "--base", MAIN, "--json"], { cwd: wt, stdout: "pipe", stderr: "pipe" });
    if (c.exitCode === 2) throw new Error(c.stderr.toString().trim());
    const result = JSON.parse(c.stdout.toString());
    if (!result.ok) throw new Error(result.failures.map((f: any) => `${f.class} ${f.item}: ${f.message}`).join("; "));
  });
  gate("test suite", () => {
    const log = join(r.out, "tests.log");
    const t = Bun.spawnSync(opts.test ? [opts.test] : [process.execPath, "run", "test"], { cwd: wt, stdout: "pipe", stderr: "pipe" });
    writeFileSync(log, t.stdout.toString() + t.stderr.toString());
    if (t.exitCode !== 0) throw new Error(`failed (exit ${t.exitCode}); read ${log}`);
  });
  gate("load smoke", () => { loadGate(wt, join(r.out, "smoke"), opts.smoke); });
  if (digest(r) !== before) throw new Error("the worktree changed while the gates ran; run gates again");
  if (failures.length) throw new Error(`gates failed; fix the draft, run prepare, then run gates again. ${failures.join(" | ")}`);
  save(receipt, { text: textDigest(r) });
  return { digest: before, passed: ["quick_validate", "check-register", "test suite", "load smoke"] };
}

/** Records the text the three reviewers read. They read the final files, so the gates must cover them. */
function reviewed(r: Run) {
  gatesHold(r);
  const text = textDigest(r);
  save(join(r.out, "review.json"), { text });
  return { text };
}

/**
 * One local commit of the managed paths, after the last prepare, gates and a review that cover the current text,
 * and a confirmed closing gate. Never pushes.
 */
function finish(r: Run, grilling: string | undefined) {
  gatesHold(r);
  if (!receiptHolds(r, "review.json", "text", () => textDigest(r))) throw new Error("the reviewers did not read the current skill, agent, or rule text; run all three reviewers again, then reviewed");
  if (!grilling) throw new Error("--grilling <state.jsonl> is required; finish needs the confirmed closing gate");
  // As on the Grilling page: a later line with the same id replaces the record, which keeps its first-seen position.
  const records = new Map<string, any>();
  for (const line of readFileSync(grilling, "utf8").split("\n").filter(Boolean)) { const rec = JSON.parse(line); records.set(rec.id, rec); }
  const answer = [...records.values()].filter((x) => x.type === "close").at(-1)?.answer;
  if (typeof answer !== "string" || !CONFIRMED.test(answer)) throw new Error(`the closing gate is not confirmed: the latest close answer is ${JSON.stringify(answer ?? null)}, not Shared understanding`);
  const wt = r.worktree.path;
  git(wt, "add", "--", ...MANAGED.filter((n) => existsSync(join(wt, n))));
  git(wt, "commit", "-q", "-m", decisionsAt(join(r.out, "decisions.json")).commit);
  return { sha: git(wt, "rev-parse", "HEAD"), branch: r.branch, worktree: wt };
}

async function main() {
  const { values: opts, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      ...Object.fromEntries(["root", "name", "gh", "omp", "run", "decisions", "smoke", "test", "upstreams", "remote", "grilling"].map((name) => [name, { type: "string" as const }])),
      ...Object.fromEntries(["take", "rename", "remove"].map((name) => [name, { type: "string" as const, multiple: true as const }])),
    },
  });
  const [command, ...rest] = positionals;
  const root = realpathSync(resolve(opts.root ?? process.cwd()));
  const gh = opts.gh ?? process.env.VSTACK_GH ?? "gh";
  const omp = opts.omp ?? process.env.VSTACK_OMP ?? "omp";
  if (command === "preflight") return start(root, opts.name, gh, omp);
  const r = runAt(opts.run);
  if (command === "check") return check(r, rest, opts.take ?? [], opts.rename ?? [], opts.remove ?? [], opts);
  if (command === "prepare") return prepare(r, opts.decisions, opts);
  if (command === "gates") return gates(r, opts);
  if (command === "reviewed") return reviewed(r);
  if (command === "finish") return finish(r, opts.grilling);
  if (command === "cancel") {
    const failed = removeWorktree(r.root, { path: r.worktree.path, branch: r.branch });
    if (failed.length) throw new Error(failed.join("; "));
    return { removed: r.worktree.path, branch: r.branch };
  }
  throw new Error("Usage: bun scripts/vstack-edit.ts preflight|check|prepare|gates|reviewed|finish|cancel [options]");
}

try {
  console.log(JSON.stringify({ ok: true, ...(await main()) }, null, 2));
} catch (e) {
  console.log(JSON.stringify({ ok: false, reason: (e as Error).message, ...(e instanceof Refusal ? e.details : {}) }, null, 2));
  process.exitCode = 2;
}

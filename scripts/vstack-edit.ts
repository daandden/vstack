#!/usr/bin/env bun
// vstack-edit: the deterministic steps of a Hand edit. The skill owns judgment and `ask`; this script acts
// only on the run file and the decisions file. Every command prints JSON. Exit 0: done. Exit 2: refused or
// failed, with {"ok": false, "reason"} on stdout. The README's vstack-edit section documents the commands.

import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { addWorktree, ensureDeps, mainCheckoutName, removeWorktree, worktreeBase, type AddedWorktree } from "./lib/omp-worktree.ts";
import { loadGate, preflight, run } from "./lib/update-gates.ts";
import { defaultUpstreamRemote, defaultUpstreamsDir, syncClone } from "./lib/upstreams.ts";
import { loadPins, parseRegister, type Register } from "./lib/vstack-repo.ts";

const scriptRoot = resolve(import.meta.dir, "..");
const MAIN = "main";
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** A register unit that a Hand edit can target, with its kind: `plugin/skills/<name>`, `plugin/agents/<name>.md`, `plugin/rules/<name>.md`. */
const TARGET = /^plugin\/(?:(skills)\/([a-z0-9-]+)|(agents|rules)\/([a-z0-9-]+)\.md)$/;
const KIND = { skills: "skill", agents: "agent", rules: "rule" } as const;
/** The paths a Hand edit changes and finish commits. */
const MANAGED = ["plugin", "CHANGELOG.md", "decision-register.yaml"];
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

/** Plugin files outside `artifact` that name it as `skill://<name>` or `/skill:<name>`. */
function callers(wt: string, artifact: string, name: string): string[] {
  const ref = new RegExp(`(?:skill://|/skill:)${name}(?![a-z0-9-])`);
  const files = git(wt, "ls-files", "--cached", "--others", "--exclude-standard", "--", "plugin").split("\n").filter(Boolean);
  const text = (f: string) => { const p = join(wt, f); return existsSync(p) && lstatSync(p).isFile() ? readFileSync(p, "utf8") : ""; };
  return files.filter((f) => !(f === artifact || f.startsWith(`${artifact}/`)) && ref.test(text(f))).sort();
}

/** A target this flow can edit now: registered in `register` and present in the worktree. */
function editable(wt: string, pins: ReturnType<typeof loadPins>, register: Register, artifact: string) {
  const t = target(artifact);
  const rows = register.rows.filter((row) => row.artifacts.includes(artifact));
  const original = register.originals.includes(artifact);
  if (!rows.length && !original) throw new Error(`${artifact} is in no register row and not in originals:; adding an artifact is not supported yet`);
  if (!existsSync(join(wt, artifact))) throw new Error(`${artifact} does not exist in the run's worktree`);
  return {
    ...t,
    dispositions: original ? ["original"] : [...new Set(rows.map((row) => row.disposition))],
    rows: rows.map((row) => ({ id: row.id, upstream: row.upstream, pin: row.upstream ? pins.get(row.upstream)?.pin : undefined, path: row.path, tree: row.tree, disposition: row.disposition, reason: row.raw.reason })),
  };
}

/** main's register, which the bookkeeping starts from: a row that prepare flipped is still adopt here. */
function mainRegister(wt: string) {
  const text = git(wt, "show", `${MAIN}:decision-register.yaml`);
  return { text, register: parseRegister(Bun.YAML.parse(text), `${MAIN}:decision-register.yaml`) };
}

/** Each target's register rows and Disposition at the current Pins, and its callers. Reads no Upstream. */
function check(r: Run, artifacts: string[]) {
  if (!artifacts.length) throw new Error("name at least one target artifact");
  const wt = r.worktree.path;
  const pins = loadPins(wt);
  const { register } = mainRegister(wt);
  return { targets: artifacts.map((a) => { const t = editable(wt, pins, register, a); return { ...t, callers: callers(wt, a, t.name) }; }) };
}

/** The decisions file the skill writes from the user's answers. */
interface Decisions {
  targets: {
    action: string;
    kind: string;
    artifact: string;
    /** Only on an adopt target: the user confirmed the flip to adapt and gave the row's new one-line reason. */
    flip?: { confirmed: boolean; reason: string };
  }[];
  /** CHANGELOG lines, without the leading `- `. */
  changelog: string[];
  /** The commit message finish uses. */
  commit: string;
}

function decisionsAt(file: string | undefined): Decisions {
  if (!file) throw new Error("--decisions <file> is required");
  const d = readJson(file);
  if (!Array.isArray(d.targets) || !d.targets.length) throw new Error("decisions need a nonempty targets array");
  for (const t of d.targets) if (t?.action !== "edit") throw new Error(`${t?.artifact}: action ${JSON.stringify(t?.action)} is not supported yet; only edit is`);
  if (new Set(d.targets.map((t: any) => t.artifact)).size !== d.targets.length) throw new Error("each target artifact may appear once");
  if (!Array.isArray(d.changelog) || !d.changelog.length || d.changelog.some((l: unknown) => typeof l !== "string" || !l.trim() || l.includes("\n"))) throw new Error("changelog must list one or more one-line entries");
  if (typeof d.commit !== "string" || !d.commit.trim()) throw new Error("commit must hold the commit message");
  return d;
}

/** Artifact units under plugin/ that differ from main, tracked or untracked. The manifest is bookkeeping, not a unit. */
function changedUnits(wt: string): string[] {
  const files = [...git(wt, "diff", "--name-only", MAIN, "--", "plugin").split("\n"), ...git(wt, "ls-files", "--others", "--exclude-standard", "--", "plugin").split("\n")];
  return [...new Set(files.filter((f) => f && f !== "plugin/package.json").map((f) => f.split("/").slice(0, 3).join("/")))].sort();
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

/** `text` with each row in `reasons`, by index, set to adapt with its new reason. Every other line stays as it is. */
function flipRows(text: string, reasons: Map<number, string>): string {
  const lines = text.split("\n");
  const items = lines.findIndex((l) => l.startsWith("items:"));
  let end = lines.findIndex((l, i) => i > items && /^[^\s#]/.test(l));
  if (end < 0) end = lines.length;
  const starts = lines.flatMap((l, i) => (i > items && i < end && l.startsWith("  - ") ? [i] : []));
  for (const [index, reason] of reasons) {
    for (let i = starts[index]!; i < (starts[index + 1] ?? end); i++) {
      if (lines[i]!.startsWith("    disposition:")) lines[i] = "    disposition: adapt";
      else if (lines[i]!.startsWith("    reason:")) lines[i] = `    reason: ${JSON.stringify(reason)}`;
    }
  }
  const out = lines.join("\n");
  const expected = Bun.YAML.parse(text) as any;
  for (const [index, reason] of reasons) Object.assign(expected.items[index], { disposition: "adapt", reason });
  if (!Bun.deepEquals(Bun.YAML.parse(out), expected)) throw new Error(`${MAIN}:decision-register.yaml has a row layout the flip cannot rewrite line by line`);
  return out;
}

/** Refuses decisions whose targets the flow cannot edit, or that differ from the plugin units the draft changed. */
function validate(r: Run, d: Decisions) {
  const wt = r.worktree.path;
  const pins = loadPins(wt);
  const { register } = mainRegister(wt);
  for (const t of d.targets) {
    const e = editable(wt, pins, register, t.artifact);
    if (t.kind !== e.kind) throw new Error(`${t.artifact} is a ${e.kind}, not a ${t.kind}`);
    const adopt = e.dispositions.includes("adopt");
    const { confirmed, reason } = t.flip ?? {};
    if (adopt && (confirmed !== true || typeof reason !== "string" || !reason.trim() || reason.includes("\n"))) {
      throw new Error(`${t.artifact} is adopt; an edit flips it to adapt, so the target needs flip {"confirmed": true, "reason": "<one-line new reason>"} from the user's answers`);
    }
    if (!adopt && t.flip !== undefined) throw new Error(`${t.artifact} is not adopt; only an adopt target takes a flip`);
  }
  const changed = changedUnits(wt);
  const named = new Set(d.targets.map((t) => t.artifact));
  for (const a of named) if (!changed.includes(a)) throw new Error(`${a} has no change from ${MAIN}; write the draft first`);
  for (const a of changed) if (!named.has(a)) throw new Error(`${a} changed but is not a target; add it to the decisions file or undo the change`);
}

/** The bookkeeping, rebuilt from main on every run: the confirmed adopt flips, the patch bump, and the CHANGELOG entry. */
function prepare(r: Run, file: string | undefined) {
  const d = decisionsAt(file);
  validate(r, d);
  const wt = r.worktree.path;
  const { text, register } = mainRegister(wt);
  const reasons = new Map<number, string>();
  for (const t of d.targets) {
    if (t.flip) for (const row of register.rows) if (row.disposition === "adopt" && row.artifacts.includes(t.artifact)) reasons.set(row.index, t.flip.reason.trim());
  }
  const flipped = reasons.size ? flipRows(text, reasons) + "\n" : undefined;
  const manifest = git(wt, "show", `${MAIN}:plugin/package.json`);
  const [major, minor, patch] = String(JSON.parse(manifest).version).split(".").map(Number);
  const version = `${major}.${minor}.${patch! + 1}`;
  if (flipped) writeFileSync(join(wt, "decision-register.yaml"), flipped);
  else git(wt, "restore", "--source", MAIN, "--", "decision-register.yaml");
  writeFileSync(join(wt, "plugin/package.json"), manifest.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`) + "\n");
  writeFileSync(join(wt, "CHANGELOG.md"), changelog(git(wt, "show", `${MAIN}:CHANGELOG.md`), version, d.changelog));
  save(join(r.out, "decisions.json"), d);
  return { version, changelog: d.changelog, targets: d.targets.map((t) => t.artifact), flipped: [...reasons.keys()].map((i) => register.rows[i]!.id) };
}

/** A hash of the managed paths in the worktree and the prepared decisions: what the gates and the closing gate saw. */
function digest(r: Run): string {
  const h = createHash("sha256");
  const visit = (path: string) => {
    if (!existsSync(path)) return;
    h.update(relative(r.worktree.path, path));
    const st = lstatSync(path);
    if (st.isSymbolicLink()) h.update(readlinkSync(path));
    else if (st.isDirectory()) for (const name of readdirSync(path).sort()) visit(join(path, name));
    else h.update(readFileSync(path));
  };
  for (const name of MANAGED) visit(join(r.worktree.path, name));
  h.update(readFileSync(join(r.out, "decisions.json")));
  return h.digest("hex");
}

interface GateOptions { smoke?: string; test?: string; upstreams?: string; remote?: string }

/**
 * quick_validate on each target skill, check-register, the test suite, and the load gate. Runs every gate and
 * refuses with all failures. A pass writes the receipt finish checks.
 */
function gates(r: Run, opts: GateOptions) {
  const prepared = join(r.out, "decisions.json");
  if (!existsSync(prepared)) throw new Error("run prepare before gates");
  const d = decisionsAt(prepared);
  validate(r, d);
  const wt = r.worktree.path;
  const receipt = join(r.out, "gates.json");
  rmSync(receipt, { force: true });
  const before = digest(r);
  const failures: string[] = [];
  const gate = (name: string, fn: () => void) => { try { fn(); } catch (e) { failures.push(`${name}: ${(e as Error).message}`); } };
  for (const t of d.targets) {
    if (t.kind === "skill") gate(`quick_validate ${t.artifact}`, () => run([process.execPath, join(scriptRoot, "plugin/skills/skill-creator/scripts/quick_validate.ts"), join(wt, t.artifact)], wt));
  }
  gate("check-register", () => {
    const upstreams = opts.upstreams ?? defaultUpstreamsDir();
    for (const pin of loadPins(wt).values()) if (!existsSync(join(upstreams, pin.key))) syncClone(upstreams, pin, opts.remote ?? defaultUpstreamRemote());
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
  save(receipt, { digest: before });
  return { digest: before, passed: ["quick_validate", "check-register", "test suite", "load smoke"] };
}

/** One local commit of the managed paths, after passed gates on the current files and a confirmed closing gate. Never pushes. */
function finish(r: Run, grilling: string | undefined) {
  const receipt = join(r.out, "gates.json");
  if (!existsSync(receipt) || readJson(receipt).digest !== digest(r)) throw new Error("no gates passed on the current files; run prepare and gates again");
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
    options: Object.fromEntries(["root", "name", "gh", "omp", "run", "decisions", "smoke", "test", "upstreams", "remote", "grilling"].map((name) => [name, { type: "string" as const }])),
  });
  const [command, ...rest] = positionals;
  const root = realpathSync(resolve(opts.root ?? process.cwd()));
  const gh = opts.gh ?? process.env.VSTACK_GH ?? "gh";
  const omp = opts.omp ?? process.env.VSTACK_OMP ?? "omp";
  if (command === "preflight") return start(root, opts.name, gh, omp);
  const r = runAt(opts.run);
  if (command === "check") return check(r, rest);
  if (command === "prepare") return prepare(r, opts.decisions);
  if (command === "gates") return gates(r, opts);
  if (command === "finish") return finish(r, opts.grilling);
  if (command === "cancel") {
    const failed = removeWorktree(r.root, { path: r.worktree.path, branch: r.branch });
    if (failed.length) throw new Error(failed.join("; "));
    return { removed: r.worktree.path, branch: r.branch };
  }
  throw new Error("Usage: bun scripts/vstack-edit.ts preflight|check|prepare|gates|finish|cancel [options]");
}

try {
  console.log(JSON.stringify({ ok: true, ...(await main()) }, null, 2));
} catch (e) {
  console.log(JSON.stringify({ ok: false, reason: (e as Error).message }, null, 2));
  process.exitCode = 2;
}

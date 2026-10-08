#!/usr/bin/env bun
// Seam 1: process CLI. Judgment and ask stay in the skill; this script owns writes and gates.
import { parseArgs } from "node:util";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { removeWorktree } from "./lib/omp-worktree.ts";
import { compareSemverTags, defaultUpstreamRemote, defaultUpstreamsDir, gitBlobSha, syncClone } from "./lib/upstreams.ts";
import { listPluginArtifacts, loadPins, loadRegister } from "./lib/vstack-repo.ts";
import type { PlanBody, PlanRow } from "./lib/update-plan.ts";
import { preprocessTinyMessage } from "../plugin/extensions/prompt-cleaner.ts";
import { proposeMerges, replayStep } from "./lib/update-merge.ts";

type Plan = PlanBody & { schema: number; moved: boolean; root: string; out: string; branch: string; worktree: { path: string } };
type Decision = { id: string; action: "accept" | "hold" | "defer"; removal?: "drop" | "original" | "remove-contribution" | "keep-contribution"; rename?: "follow" | "keep"; upstream?: string; path?: string; disposition?: string; reason?: string; gist?: string; artifacts?: string[]; drafts?: Record<string, string>; reason_check: string; adr_conflicts?: string[]; review_findings?: string[]; draft_adr?: { path: string; source: string }; explicit_accept?: boolean };
const scriptRoot = resolve(import.meta.dir, "..");
const managed = ["plugin", "decision-register.yaml", "pins.yaml", "house-style.yaml", "CHANGELOG.md", "principle-questions.json", "docs/adr"];
const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const yaml = (p: string): any => Bun.YAML.parse(readFileSync(p, "utf8"));
function save(p: string, v: unknown) { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(v, null, 2) + "\n"); }
function run(cmd: string[], cwd: string): string {
  const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`${cmd[0]} ${cmd.slice(1).join(" ")} (exit ${r.exitCode}): ${r.stderr.toString().trim() || r.stdout.toString().trim()}`);
  return r.stdout.toString().trim();
}
const git = (cwd: string, ...args: string[]) => run(["git", ...args], cwd);
function preflight(root: string, gh: string) {
  if (git(root, "rev-parse", "--show-toplevel") !== resolve(root)) throw new Error("cwd must be the vstack checkout root");
  if (readJson(join(root, "plugin/package.json")).name !== "vstack") throw new Error("plugin manifest must name vstack");
  const branches = git(root, "for-each-ref", "--format=%(refname:short)", "refs/heads/update/", "refs/remotes/origin/update/");
  if (branches) throw new Error(`Update branches already exist (no resume): ${branches}`);
  const prs = JSON.parse(run([gh, "pr", "list", "--state", "open", "--limit", "1000", "--json", "number,headRefName,title,url"], root));
  const open = prs.filter((p: any) => p.headRefName?.startsWith("update/") || /^Update(?:\s|:)/i.test(p.title));
  if (open.length) throw new Error(`Open Update PR (no resume): ${open.map((p: any) => p.url || `#${p.number}`).join(", ")}`);
}
function planAt(path: string): Plan {
  const p = readJson(path);
  if (p.schema !== 1 || !p.moved || !isAbsolute(p.worktree?.path) || !p.branch?.startsWith("update/")) throw new Error("expected a moved schema-1 update-plan");
  if (git(p.worktree.path, "branch", "--show-current") !== p.branch) throw new Error("Update worktree branch changed");
  return p;
}
function snapshot(p: Plan) {
  const base = join(p.out, "baseline");
  if (existsSync(base)) return base;
  mkdirSync(base, { recursive: true });
  for (const name of managed) if (existsSync(join(p.worktree.path, name))) cpSync(join(p.worktree.path, name), join(base, name), { recursive: true, dereference: false });
  save(join(base, "complete.json"), { head: git(p.worktree.path, "rev-parse", "HEAD") });
  return base;
}
function owned(path: string): string {
  if (!/^plugin\/(skills|agents|rules|extensions)\/[^/]+/.test(path) || path.split("/").some(s => s === "..") || isAbsolute(path)) throw new Error(`invalid artifact path ${path}`);
  return path;
}
function copy(source: string, target: string) {
  if (!isAbsolute(source)) throw new Error(`draft path is not absolute: ${source}`);
  rmSync(target, { recursive: true, force: true }); mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true, dereference: false });
}
function decisionsAt(file: string): Decision[] {
  const ds = readJson(file).decisions;
  if (!Array.isArray(ds) || new Set(ds.map(d => d.id)).size !== ds.length) throw new Error("decisions must be an array with unique ids");
  for (const d of ds) if (!d.id || !["accept", "hold", "defer"].includes(d.action) || typeof d.reason_check !== "string" || !d.reason_check.trim()) throw new Error(`invalid decision or missing reason_check: ${d.id}`);
  return ds;
}
function apply(p: Plan, ds: Decision[], phase: string) {
  // Validate the whole decision set before the first write, especially pins.yaml.
  const byId = new Map(ds.map(d => [d.id, d]));
  const base = snapshot(p);
  const doc = yaml(join(base, "decision-register.yaml"));
  const style = yaml(join(base, "house-style.yaml"));
  const proposals = existsSync(join(p.out, "merge-steps.json")) ? readJson(join(p.out, "merge-steps.json")) : proposeMerges(p, base);
  const needed = p.rows.filter(r => r.class !== "unchanged" || doc.items.find((x: any) => x.id === r.id)?.reason?.startsWith("Deferred at "));
  for (const r of needed) if (!byId.has(r.id)) throw new Error(`missing decision ${r.id}`);
  const newDecisions = p.new.map(n => {
    const matches = ds.filter(d => d.upstream === n.upstream && d.path === n.path);
    if (matches.length !== 1) throw new Error(`new item needs one decision: ${n.upstream}:${n.path}`);
    const d = matches[0]!;
    if (d.action === "hold") throw new Error(`new item has no older contribution to Hold: ${d.id}; defer it instead`);
    if (doc.items.some((x: any) => x.id === d.id)) throw new Error(`new item id already exists: ${d.id}`);
    return { n, d };
  });
  for (const d of ds) {
    if (!p.rows.some(r => r.id === d.id) && !newDecisions.some(x => x.d.id === d.id)) throw new Error(`unknown decision ${d.id}`);
    if ((d.adr_conflicts?.length || d.review_findings?.length) && d.action !== "hold" && !d.explicit_accept) throw new Error(`findings require explicit acceptance: ${d.id}`);
    if (d.action === "defer" && !d.gist?.trim()) throw new Error(`defer needs a gist: ${d.id}`);
    if (d.disposition && !["adopt", "adapt", "merge", "reject"].includes(d.disposition)) throw new Error(`invalid Disposition: ${d.id}`);
    for (const a of d.artifacts ?? []) owned(a);
    for (const [a, source] of Object.entries(d.drafts ?? {})) { owned(a); if (!isAbsolute(source) || !existsSync(source)) throw new Error(`missing draft: ${d.id}: ${source}`); }
    if (d.draft_adr && (!/^docs\/adr\/\d{4}-[^/]+\.md$/.test(d.draft_adr.path) || !isAbsolute(d.draft_adr.source) || !existsSync(d.draft_adr.source))) throw new Error(`invalid draft ADR: ${d.id}`);
  }
  const copies: { source: string; artifact: string; step?: boolean; hashes?: NonNullable<PlanRow["staged"]>["files"] }[] = [];
  const outcomes: any[] = [];
  for (const r of p.rows) {
    const row = doc.items.find((x: any) => x.id === r.id);
    if (!row) throw new Error(`register lost row ${r.id}`);
    const d = byId.get(r.id);
    if (!d) {
      if (r.new) { row.path = r.new.path; row.tree = r.new.tree; }
      continue;
    }
    if (r.class === "removed" && d.action !== "hold") {
      const shared = r.artifacts.filter(a => p.rows.some(other => other.id !== r.id && other.artifacts.includes(a)));
      if (!d.removal || !["drop", "original", "remove-contribution", "keep-contribution"].includes(d.removal)) throw new Error(`removed row needs an explicit removal choice: ${r.id}`);
      if (d.removal === "original" && shared.length) throw new Error(`shared artifact cannot become original: ${r.id}`);
      if (d.removal === "drop" && shared.length) throw new Error(`choose remove-contribution or keep-contribution: ${r.id}`);
      if (["remove-contribution", "keep-contribution"].includes(d.removal) && !shared.length) throw new Error(`row has no shared contribution: ${r.id}`);
      if (d.removal === "original") doc.originals.push(...r.artifacts);
      if (d.removal === "remove-contribution") for (const a of shared) {
        const source = d.drafts?.[a];
        if (!source) throw new Error(`removed shared contribution needs a reviewed draft: ${r.id}: ${a}`);
        copies.push({ source, artifact: a, step: true });
      }
      doc.items = doc.items.filter((x: any) => x.id !== r.id);
      outcomes.push({ id: r.id, action: d.action, removal: d.removal });
      continue;
    }
    if (r.disposition === "adopt" && r.new && r.artifacts[0]?.split("/").at(-1) !== r.new.path.split("/").at(-1) && d.action !== "hold") {
      if (!["follow", "keep"].includes(d.rename ?? "")) throw new Error(`renamed adopt needs follow or keep: ${r.id}`);
      const oldName = r.artifacts[0]!.split("/").at(-1)!, newName = r.new!.path.split("/").at(-1)!;
      if (d.rename === "follow") {
        d.artifacts ??= [r.artifacts[0]!.replace(/[^/]+$/, newName)];
        style.replacements.push({ id: `rename-${r.id.replaceAll("/", "-")}`, from: oldName, to: newName, match: "name", upstream: "any", scope: "required", uses: ["update"] });
      } else {
        d.disposition = "adapt";
        if (!d.reason?.trim()) throw new Error(`keeping a renamed adopt needs an adapt reason: ${r.id}`);
        d.drafts ??= Object.fromEntries(r.artifacts.map(a => [a, join(base, a)]));
        style.replacements.push({ id: `rename-${r.id.replaceAll("/", "-")}`, from: newName, to: oldName, match: "name", upstream: r.upstream, scope: "required", uses: ["update"] });
      }
    }
    if (d.action === "hold") {
      row.held_at = r.held?.at ?? r.effective_old.ref;
      row.held_path = r.held?.path ?? r.effective_old.path;
      if (!row.held_path) throw new Error(`Hold has no baseline path: ${r.id}`);
    } else {
      const disposition = d.action === "defer" ? "reject" : d.disposition ?? row.disposition;
      const artifacts = d.artifacts ?? (disposition === "reject" ? [] : row.artifacts);
      row.disposition = disposition; row.artifacts = artifacts;
      if (d.reason) row.reason = d.reason;
      if (d.action === "defer") row.reason = `Deferred at ${r.new?.ref}: ${d.gist}`;
      delete row.held_at; delete row.held_path;
      if (disposition === "adopt" && r.class !== "unchanged") {
        if (!r.staged || artifacts.length !== 1) throw new Error(`adopt has no staged copy: ${r.id}`);
        copies.push({ source: r.staged.path, artifact: artifacts[0], hashes: r.staged.files });
      } else if (disposition !== "reject" && (r.sides || d.disposition && d.disposition !== r.disposition || d.drafts)) {
        for (const a of artifacts) {
          const generated = proposals.steps.find((s: any) => s.id === r.id);
          if (!d.drafts?.[a] && generated?.conflicts.length) throw new Error(`unresolved merge conflict: ${r.id}; review ${generated.conflicts.join(", ")}`);
          const source = d.drafts?.[a] ?? generated?.drafts[a];
          if (!source) throw new Error(`missing drafted artifact ${r.id}: ${a}`);
          copies.push({ source, artifact: a, step: ["adapt", "merge"].includes(r.disposition) && r.artifacts.includes(a) });
        }
      }
    }
    if (r.new) { row.path = r.new.path; row.tree = r.new.tree; } else { delete row.path; delete row.tree; }
    outcomes.push({ id: r.id, action: d.action, disposition: row.disposition, effectiveOld: { ref: row.held_at ?? r.new?.ref, path: row.held_path ?? r.new?.path } });
  }
  for (const { n, d } of newDecisions) {
    const pin = p.upstreams.find(u => u.key === n.upstream)!.new;
    const disposition = d.action === "defer" ? "reject" : d.disposition;
    if (!disposition || !d.reason && d.action !== "defer") throw new Error(`new item needs Disposition and reason: ${d.id}`);
    const artifacts = d.artifacts ?? [];
    if (disposition === "reject" && artifacts.length) throw new Error(`reject has artifacts: ${d.id}`);
    if (disposition !== "reject" && !artifacts.length) throw new Error(`new item has no artifacts: ${d.id}`);
    for (const a of artifacts) {
      const source = d.drafts?.[a]; if (!source) throw new Error(`new item needs draft: ${d.id}: ${a}`);
      copies.push({ source, artifact: a });
    }
    doc.items.push({ id: d.id, upstream: n.upstream, kind: n.kind, path: n.path, tree: n.tree, disposition, artifacts, reason: d.action === "defer" ? `Deferred at ${pin}: ${d.gist}` : d.reason });
    outcomes.push({ id: d.id, action: d.action, disposition });
  }
  for (const c of copies) {
    const held = p.rows.find(r => byId.get(r.id)?.action === "hold" && r.artifacts.includes(c.artifact));
    if (held && !c.step) throw new Error(`draft would overwrite held contribution ${held.id}: ${c.artifact}`);
    if (c.hashes) for (const f of c.hashes) {
      const path = lstatSync(c.source).isDirectory() ? join(c.source, f.path) : c.source;
      const bytes = lstatSync(path).isSymbolicLink() ? Buffer.from(readlinkSync(path)) : readFileSync(path);
      if (gitBlobSha(bytes) !== f.sha) throw new Error(`staged adopt hash changed: ${c.artifact}/${f.path}`);
    }
  }
  // Compose accepted deltas outside the worktree before any managed file is touched.
  const candidate = join(p.out, "candidate");
  rmSync(candidate, { recursive: true, force: true });
  cpSync(join(base, "plugin"), join(candidate, "plugin"), { recursive: true, dereference: false });
  for (const c of copies) {
    if (c.step) replayStep(join(candidate, c.artifact), join(base, c.artifact), c.source, join(p.out, "replay"));
    else copy(c.source, join(candidate, c.artifact));
  }
  // Rebuild from the initial worktree, not the last proposal. Hold restores old artifacts.
  for (const name of managed) {
    rmSync(join(p.worktree.path, name), { recursive: true, force: true });
    if (existsSync(join(base, name))) cpSync(join(base, name), join(p.worktree.path, name), { recursive: true, dereference: false });
  }
  copy(join(candidate, "plugin"), join(p.worktree.path, "plugin"));
  writeFileSync(join(p.worktree.path, "house-style.yaml"), Bun.YAML.stringify(style, null, 2));
  const used = new Set([...doc.items.flatMap((r: any) => r.artifacts), ...doc.originals]);
  const old = yaml(join(base, "decision-register.yaml"));
  for (const a of old.items.flatMap((r: any) => r.artifacts)) if (!used.has(a)) rmSync(join(p.worktree.path, owned(a)), { recursive: true, force: true });
  for (const d of ds) if (d.action !== "hold" && d.draft_adr) copy(d.draft_adr.source, join(p.worktree.path, d.draft_adr.path));
  const pins = yaml(join(base, "pins.yaml"));
  for (const u of p.upstreams) pins.upstreams[u.key].pin = u.new;
  writeFileSync(join(p.worktree.path, "decision-register.yaml"), Bun.YAML.stringify(doc, null, 2));
  writeFileSync(join(p.worktree.path, "pins.yaml"), Bun.YAML.stringify(pins, null, 2));
  const manifest = readJson(join(base, "plugin/package.json"));
  const [major, minor] = manifest.version.split(".").map(Number);
  const removedName = listPluginArtifacts(base).some(a => /^plugin\/(skills|agents|commands)\//.test(a) && !existsSync(join(p.worktree.path, a)));
  manifest.version = removedName ? `${major + 1}.0.0` : `${major}.${minor + 1}.0`;
  writeFileSync(join(p.worktree.path, "plugin/package.json"), JSON.stringify(manifest, null, 2) + "\n");
  const summary = markdown(p, ds);
  const changelog = existsSync(join(base, "CHANGELOG.md")) ? readFileSync(join(base, "CHANGELOG.md"), "utf8") : "# Changelog\n\n## [Unreleased]\n";
  const entry = `\n## [${manifest.version}] - ${new Date().toISOString().slice(0, 10)}\n\n- Update ${p.upstreams.filter(u => u.moved).map(u => `${u.key} ${u.old} → ${u.new}`).join(", ")}.\n- Hold: ${outcomes.filter(r => r.action === "hold").map(r => r.id).join(", ") || "none"}.\n`;
  writeFileSync(join(p.worktree.path, "CHANGELOG.md"), changelog.replace("## [Unreleased]", `## [Unreleased]\n${entry}`));
  const result = { phase, version: manifest.version, rows: outcomes, summary };
  save(join(p.out, "applied.json"), result); save(join(p.out, "decisions.json"), { decisions: ds });
  return result;
}
function markdown(p: Plan, ds: Decision[]) {
  return `## Update\n\n${p.upstreams.filter(u => u.moved).map(u => `- ${u.key}: ${u.old} → ${u.new}`).join("\n")}\n\n## Row outcomes\n\n${ds.map(d => `- ${d.id}: ${d.action}; ${d.disposition ?? p.rows.find(r => r.id === d.id)?.disposition ?? "reject"}. ${d.reason_check}${d.removal ? ` Removal: ${d.removal}.` : ""}${d.rename ? ` Rename: ${d.rename}.` : ""}${d.reason ? ` Reason: ${d.reason}` : ""}${d.draft_adr ? ` ADR: ${d.draft_adr.path}` : ""}`).join("\n")}\n\n## Verification\n\nRegister check and worktree plugin load smoke passed before confirmation and after application. The direct jev sample-prompt re-run and flagged questions are in the report.\n`;
}
function digest(p: Plan) {
  const h = createHash("sha256");
  function visit(path: string) {
    if (!existsSync(path)) return;
    h.update(relative(p.worktree.path, path));
    const st = lstatSync(path);
    if (st.isSymbolicLink()) h.update(readlinkSync(path));
    else if (st.isDirectory()) for (const name of readdirSync(path).sort()) visit(join(path, name));
    else h.update(readFileSync(path));
  }
  for (const name of managed) visit(join(p.worktree.path, name));
  h.update(readFileSync(join(p.out, "decisions.json")));
  return h.digest("hex");
}
async function jev(p: Plan, endpoint: string, key: string) {
  if (!key) throw new Error("jev gate needs TYPESAFE_API_KEY (or obtain the native jev credential through omp)");
  const questions = readJson(join(p.worktree.path, "principle-questions.json"));
  const samples = readJson(join(p.worktree.path, "sample-prompts.json")).prompts;
  const changed = p.rows.filter(r => r.kind === "principle" && r.class !== "unchanged").map(r => r.artifacts[0]?.split("principle-")[1]).filter(Boolean);
  const flags: any[] = [], borderline: any[] = [], results: any[] = [];
  for (const sample of samples) {
    const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "jev-latest", state: { request: preprocessTinyMessage(sample.prompt) }, questions }), signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`jev sample ${sample.id}: HTTP ${response.status}`);
    const answers = (await response.json()).answers;
    for (const name of Object.keys(questions)) {
      const answer = answers?.[name], score = answer?.noul;
      if (answer?.type !== "noul" || typeof score !== "number" || score < 0 || score > 1) throw new Error(`jev sample ${sample.id}: invalid answer ${name}`);
      const issue = { sample: sample.id, principle: name, score, changed: changed.includes(name), question: questions[name] };
      if ((sample.expected.includes(name) && score < .70) || (!sample.expected.includes(name) && !sample.allowed.includes(name) && score > .80)) flags.push(issue);
      if (score >= .70 && score <= .80) borderline.push(issue);
    }
    results.push({ sample: sample.id, answers });
  }
  return { changed, flags, borderline, results };
}
async function gates(p: Plan, phase: string, opts: any) {
  const fingerprint = digest(p);
  const upstreams = opts.upstreams ?? defaultUpstreamsDir();
  for (const pin of loadPins(p.worktree.path).values()) {
    if (!existsSync(join(upstreams, pin.key))) syncClone(upstreams, pin, opts.remote ?? defaultUpstreamRemote());
  }
  const register = run([process.execPath, opts.check ?? join(scriptRoot, "scripts/check-register.ts"), "--root", p.worktree.path, "--source", "clones", "--upstreams", upstreams, "--base", "main", "--json"], p.worktree.path);
  const checked = JSON.parse(register); if (!checked.ok) throw new Error("register gate failed");
  const smokeDir = join(p.out, `smoke-${phase}`);
  const smoke = JSON.parse(run([opts.smoke ?? join(scriptRoot, "scripts/load-smoke.sh"), join(p.worktree.path, "plugin"), smokeDir], p.worktree.path));
  const artifacts = loadRegister(p.worktree.path);
  const paths = new Set([...artifacts.originals, ...artifacts.rows.flatMap(r => r.artifacts)]);
  for (const a of paths) {
    if (a.startsWith("plugin/skills/") && !smoke.skillCommands?.includes(a.split("/")[2])) throw new Error(`load smoke missing skill ${a}`);
    if (a.startsWith("plugin/agents/") && !smoke.agents?.includes(a.split("/")[2]!.replace(/\.md$/, ""))) throw new Error(`load smoke missing agent ${a}`);
    if (a.startsWith("plugin/rules/") && !smoke.genericRules?.includes(readFileSync(join(p.worktree.path, a), "utf8").replace(/^---[\s\S]*?---\s*/, "").trim())) throw new Error(`load smoke missing rule ${a}`);
  }
  if (smoke.warnings?.length) throw new Error(`load smoke warnings: ${smoke.warnings.join("; ")}`);
  let judgment;
  if (phase === "preview") {
    judgment = await jev(p, opts.endpoint ?? "https://api.typesafe.ai/v1/systemone", process.env.TYPESAFE_API_KEY ?? "");
    save(join(p.out, "jev.json"), judgment);
  } else {
    if (!existsSync(join(p.out, "gate-preview.json")) || !existsSync(join(p.out, "jev.json"))) throw new Error("preview gates must pass first");
    judgment = readJson(join(p.out, "jev.json"));
  }
  if (fingerprint !== digest(p)) throw new Error("worktree changed during gates; run them again");
  const receipt = { phase, digest: fingerprint, register: checked, smoke, jev: judgment };
  save(join(p.out, `gate-${phase}.json`), receipt); return receipt;
}
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
function diff(a: string, b: string) {
  const r = Bun.spawnSync(["git", "diff", "--no-index", "--", existsSync(a) ? a : "/dev/null", existsSync(b) ? b : "/dev/null"], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode > 1) throw new Error(r.stderr.toString());
  return r.stdout.toString() || "No vstack text change.";
}
function report(p: Plan, ds: Decision[], output: string) {
  if (!isAbsolute(output) || !relative(p.worktree.path, output).startsWith("..") || !relative(p.root, output).startsWith("..")) throw new Error("report must be an absolute path outside both checkouts");
  const base = snapshot(p), rows: string[] = [];
  const mergeSteps = existsSync(join(p.out, "merge-steps.json")) ? readJson(join(p.out, "merge-steps.json")).steps : [];
  const items = [...p.rows.filter(r => r.class !== "unchanged" || ds.some(d => d.id === r.id)), ...p.new.map(n => ({ ...n, id: ds.find(d => d.upstream === n.upstream && d.path === n.path)?.id ?? `${n.upstream}:${n.path}`, class: "new", artifacts: ds.find(d => d.upstream === n.upstream && d.path === n.path)?.artifacts ?? [], effective_old: null, new: { path: n.path } }))];
  for (const row of items) {
    const u = p.upstreams.find(u => u.key === row.upstream)!;
    const paths = [row.effective_old?.path, row.new?.path].filter(Boolean) as string[];
    const upstream = git(u.clone, "diff", row.effective_old?.commit ?? u.old_commit, u.new_commit, "--", ...paths) || "No Upstream text change.";
    const vstack = row.artifacts.map(a => diff(join(base, a), join(p.worktree.path, a))).join("\n") || "No shipped artifact.";
    const d = ds.find(d => d.id === row.id);
    const step = mergeSteps.find((s: any) => s.id === row.id);
    const proposal = Object.entries(d?.drafts ?? step?.drafts ?? {}).map(([a, source]) => diff(join(base, a), source as string)).join("\n");
    rows.push(`<section><h2>${esc(row.id)} · ${esc(row.class)}</h2><p>Baseline: ${esc(row.effective_old?.ref ?? "new item")} / ${esc(row.effective_old?.path)}</p><p>Reason check: ${esc(d?.reason_check)}</p><p>Decision: ${esc(d?.action)}; ${esc(d?.disposition ?? ("disposition" in row ? row.disposition : ""))}</p><div class="diffs"><article><h3>Upstream</h3><pre>${esc(upstream)}</pre></article><article><h3>vstack</h3><pre>${esc(vstack)}</pre></article></div><p>Merge conflicts: ${esc(step?.conflicts.join("; ") || "none")}</p><p>ADR conflicts: ${esc(d?.adr_conflicts?.join("; ") || "none")}</p><p>Draft ADR: ${esc(d?.draft_adr ? readFileSync(d.draft_adr.source, "utf8") : "none")}</p><p>Fan-out review: ${esc(d?.review_findings?.join("; ") || "no findings")}</p><p>Held-back findings: ${esc(d?.action === "hold" ? [...d.adr_conflicts ?? [], ...d.review_findings ?? []].join("; ") || "none" : "none")}</p></section>`);
    if (proposal) rows[rows.length - 1] = rows[rows.length - 1]!.replace("</section>", `<article><h3>Individual row proposal</h3><pre>${esc(proposal)}</pre></article></section>`);
  }
  const judge = existsSync(join(p.out, "jev.json")) ? readJson(join(p.out, "jev.json")) : { flags: [], borderline: [] };
  const html = readFileSync(join(scriptRoot, "plugin/skills/vstack-update/templates/report.html"), "utf8").replace("<!-- ROWS -->", rows.join("\n")).replace("<!-- JEV -->", `<pre>${esc(JSON.stringify({ changed: judge.changed, flags: judge.flags, borderline: judge.borderline }, null, 2))}</pre>`);
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, html); return { report: output };
}
async function main() {
  const { values: opts, positionals } = parseArgs({ allowPositionals: true, options: Object.fromEntries(["root", "plan", "decisions", "gh", "push", "omp", "upstreams", "remote", "out", "check", "smoke", "endpoint", "phase", "report"].map(name => [name, { type: "string" }])) });
  const [command, ...selection] = positionals;
  const root = resolve(opts.root ?? process.cwd()), gh = opts.gh ?? process.env.VSTACK_GH ?? "gh";
  if (command === "preflight") { preflight(root, gh); return { ok: true }; }
  if (command === "plan") {
    preflight(root, gh);
    const args = [process.execPath, join(scriptRoot, "scripts/update-plan.ts"), "--root", root];
    for (const name of ["upstreams", "remote", "omp", "out"]) if (opts[name]) args.push(`--${name}`, opts[name]);
    const pins = Bun.YAML.parse(git(root, "show", "main:pins.yaml")) as any;
    const requested = selection.length ? selection : Object.keys(pins.upstreams);
    const targets = requested.map(input => {
      if (input.includes("@")) return input;
      const pin = pins.upstreams[input];
      if (!pin || pin.pin_kind !== "tag") return input;
      const pages = JSON.parse(run([gh, "api", "--paginate", "--slurp", `repos/${pin.repo}/releases`], root));
      const releases = pages.flat().filter((r: any) => !r.draft && !r.prerelease && /^v\d+\.\d+\.\d+$/.test(r.tag_name));
      releases.sort((a: any, b: any) => compareSemverTags(b.tag_name, a.tag_name));
      const tag = releases[0]?.tag_name;
      return `${input}@${tag && compareSemverTags(tag, pin.pin) > 0 ? tag : pin.pin}`;
    });
    return JSON.parse(run([...args, ...targets], root));
  }
  if (!opts.plan) throw new Error("--plan is required");
  const p = planAt(opts.plan);
  if (command === "cancel") {
    // cancellation has no proposal side effects
    const failed = removeWorktree(p.root, { path: p.worktree.path, branch: p.branch });
    if (failed.length) throw new Error(failed.join("; "));
    return { removed: p.worktree.path, branch: p.branch };
  }
  if (command === "merge") {
    const result = proposeMerges(p, snapshot(p), opts.decisions ? readJson(opts.decisions).file_maps ?? {} : {});
    save(join(p.out, "merge-steps.json"), result); return result;
  }
  if (command === "apply" || command === "prepare") {
    if (!opts.decisions) throw new Error("--decisions is required");
    return apply(p, decisionsAt(opts.decisions), command === "prepare" ? "preview" : "confirmed");
  }
  if (command === "gates") {
    if (!opts.phase || !["preview", "confirmed"].includes(opts.phase)) throw new Error("--phase preview|confirmed is required");
    if (readJson(join(p.out, "applied.json")).phase !== opts.phase) throw new Error("gate phase does not match applied decisions");
    return await gates(p, opts.phase, opts);
  }
  if (command === "report") {
    if (!opts.report) throw new Error("--report must name the Scratch update-report.html");
    return report(p, decisionsAt(opts.decisions ?? join(p.out, "decisions.json")), opts.report);
  }
  if (command === "finish") {
    const receipt = readJson(join(p.out, "gate-confirmed.json"));
    if (receipt.digest !== digest(p)) throw new Error("confirmed gate is stale; fix, re-ask touched rows, apply, and re-gate");
    const applied = readJson(join(p.out, "applied.json"));
    if (applied.phase !== "confirmed") throw new Error("not confirmed");
    const body = join(p.out, "pr-body.md"); writeFileSync(body, applied.summary);
    git(p.worktree.path, "add", "--", ...managed.filter(n => existsSync(join(p.worktree.path, n))));
    git(p.worktree.path, "commit", "-m", `feat(update): ${p.branch.slice(7)}`);
    const sha = git(p.worktree.path, "rev-parse", "HEAD");
    if (opts.push ?? process.env.VSTACK_PUSH) run([opts.push ?? process.env.VSTACK_PUSH!, "origin", p.branch], p.worktree.path);
    else git(p.worktree.path, "push", "-u", "origin", p.branch);
    const url = run([gh, "pr", "create", "--base", "main", "--head", p.branch, "--title", `Update ${p.branch.slice(7)}`, "--body-file", body], p.worktree.path);
    return { sha, url, branch: p.branch };
  }
  throw new Error("Usage: bun scripts/vstack-update.ts preflight|plan|merge|prepare|apply|gates|report|finish|cancel [options]");
}
try { console.log(JSON.stringify(await main(), null, 2)); } catch (e) { console.error(`vstack-update: ${(e as Error).message}`); process.exitCode = 2; }

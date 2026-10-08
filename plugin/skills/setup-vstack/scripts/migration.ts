// Machine Migration (#40): read-only plans, mandatory private moves, fail-closed application.
// vstack is linked from a full clone (ADR 0005). Use the clone's pure House style module, but read
// rows only from the shipped copy: the root YAML is not a runtime input.
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { applyRows, findRow, parseReplacements, type Replacement } from "../../../../scripts/lib/house-style.ts";

export const PRUNED = ["node_modules", ".venv", "Library"];
const isDir = (p: string) => existsSync(p) && lstatSync(p).isDirectory();
const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);
export const migrationHome = () => process.env.HOME || (() => { throw new Error("HOME is not set"); })();

function git(cwd: string, ...args: string[]) {
  const r = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  if (r.exitCode !== 0) throw new Error(r.stderr.toString().trim() || `git ${args.join(" ")} failed`);
  return r.stdout.toString().trim();
}

export interface Change { path: string; after_path: string; before: string; after: string; diff: string }
export interface Hit { path: string; line: number; text: string }
export interface Item {
  id: string;
  kind: "private-move" | "profiles-move" | "skills-remove" | "rule-rewrite" | "store-rewrite" | "old-rule-delete";
  mandatory: boolean;
  destructive: boolean;
  from?: string;
  to?: string;
  common_dir?: string;
  worktrees?: string[];
  relative_rows?: boolean;
  symlinks?: { path: string; target: string }[];
  changes?: Change[];
  manual_hits?: Hit[];
  names?: string[];
}
export interface Plan {
  schema: 1;
  home: string;
  roots: string[];
  pruned: string[];
  scan_errors: { path: string; error: string }[];
  standard_projects: string[];
  items: Item[];
  notices: string[];
}

function rows(): Replacement[] {
  const doc = Bun.YAML.parse(readFileSync(join(import.meta.dir, "../references/house-style.yaml"), "utf8"));
  const parsed = parseReplacements(doc, new Set(["matt", "pstack", "diagram", "css", "prose"]));
  if (parsed.problems.length) throw new Error(parsed.problems.map(p => `${p.id}: ${p.message}`).join("; "));
  if (parsed.replacements.some(r => !r.uses.includes("migration"))) throw new Error("Migration copy holds a non-Migration row");
  return parsed.replacements;
}

function files(root: string): string[] {
  if (!existsSync(root)) return [];
  if (!lstatSync(root).isDirectory()) return lstatSync(root).isFile() ? [root] : [];
  return readdirSync(root, { withFileTypes: true }).flatMap(e => {
    const p = join(root, e.name);
    return e.isDirectory() ? files(p) : e.isFile() ? [p] : [];
  });
}

function hits(path: string, text: string, replacements: Replacement[]): Hit[] {
  return text.split("\n").flatMap((t, i) => /matt-pocock|docs-agents/.test(t) || replacements.some(r => findRow(t, r).length)
    ? [{ path, line: i + 1, text: t }] : []);
}

function change(path: string, afterPath: string, before: string, after: string): Change {
  const a = before.split("\n"), b = after.split("\n");
  return { path, after_path: afterPath, before, after,
    diff: `--- ${path}\n+++ ${afterPath}\n@@ -1,${a.length} +1,${b.length} @@\n${a.map(l => "-" + l).join("\n")}\n${b.map(l => "+" + l).join("\n")}\n` };
}

function rewrite(text: string, commonDirs: string[], relative: boolean, replacements: Replacement[]) {
  // Absolute prefixes are generated per common dir, specific config path first. A sibling such as
  // matt-pocock-backup is not that prefix. Shared rows then preserve whole-name match semantics.
  for (const c of commonDirs) {
    const from = join(c, "matt-pocock"), to = join(c, "vstack");
    for (const [a, b] of [[from + "/docs-agents", to + "/config"], [from, to]]) {
      const escaped = a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      text = text.replace(new RegExp(escaped + "(?=$|[/\\s\"'`<>),;])", "g"), () => b);
    }
  }
  return applyRows(text, replacements.filter(r => relative || !r.id.startsWith("mig-")));
}

/** Resolve every .git entry by git, not by its spelling, then deduplicate common dirs. */
export function machinePlan(home: string, scanRoots: string[]): Plan {
  home = realpathSync(home);
  const plan: Plan = { schema: 1, home, roots: scanRoots.map(p => resolve(p)), pruned: [...PRUNED], scan_errors: [], standard_projects: [], items: [], notices: [
    "Scanned only the named roots. A separate git dir whose checkout is outside them is not discoverable.",
    "Accepted downgrade: Matt main (c55ee46; 24 of 25 installed copies newer than v1.2.3) is replaced by the Base Pin v1.2.3. Only a vstack Update moves the Pin.",
    "Private moves are mandatory. Cancel cancels all machine changes. No compatibility symlink is kept: outside absolute links to old artifacts break.",
  ] };
  const common = new Map<string, Set<string>>(), visited = new Set<string>();
  function walk(dir: string) {
    try {
      const actual = realpathSync(dir);
      if (visited.has(actual)) return;
      visited.add(actual);
      const entries = readdirSync(actual, { withFileTypes: true });
      if (entries.some(e => e.name === ".git")) {
        const c = realpathSync(git(actual, "rev-parse", "--path-format=absolute", "--git-common-dir"));
        if (!common.has(c)) common.set(c, new Set());
        common.get(c)!.add(actual);
      }
      for (const e of entries) if (e.isDirectory() && e.name !== ".git" && !PRUNED.includes(e.name)) walk(join(actual, e.name));
    } catch (e) { plan.scan_errors.push({ path: dir, error: errorText(e) }); }
  }
  for (const root of plan.roots) walk(root);
  const replacements = rows();
  const privateDirs = [...common.keys()].filter(c => existsSync(join(c, "matt-pocock"))).sort();
  for (const [c, worktrees] of common) {
    // One discovered linked checkout covers every registered checkout, even outside the scan roots.
    for (const line of git([...worktrees][0]!, "worktree", "list", "--porcelain").split("\n")) {
      if (line.startsWith("worktree ")) worktrees.add(line.slice(9));
    }
    for (const r of worktrees) {
      if (!existsSync(r)) continue;
      if (isDir(join(r, "docs/agents")) || ["AGENTS.md", "CLAUDE.md"].some(f => existsSync(join(r, f)) && readFileSync(join(r, f), "utf8").includes(replacements.find(row => row.id === "config-block")!.from))) {
        plan.standard_projects.push(r);
      }
    }
    const ordinary = [...worktrees].some(r => resolve(r, ".git") === c);
    for (const path of files(join(c, "vstack"))) {
      if (![".md", ".html", ".json"].includes(extname(path))) continue;
      const before = readFileSync(path, "utf8");
      if (before.includes("\0") || !hits(path, before, replacements).length) continue;
      const after = rewrite(before, [c], ordinary, replacements);
      plan.items.push({ id: `store:${path}`, kind: "store-rewrite", mandatory: false, destructive: false, from: path,
        changes: [change(path, path, before, after)], manual_hits: hits(path, after, replacements) });
    }
    if (!privateDirs.includes(c)) continue;
    const from = join(c, "matt-pocock"), to = join(c, "vstack");
    const relative = [...worktrees].some(r => resolve(r, ".git") === c);
    const item: Item = { id: `private:${c}`, kind: "private-move", mandatory: true, destructive: true, from, to,
      common_dir: c, worktrees: [...worktrees].sort(), relative_rows: relative, changes: [], manual_hits: [], symlinks: [] };
    for (const p of files(from)) {
      if (![".md", ".html", ".json"].includes(extname(p))) continue;
      const before = readFileSync(p, "utf8");
      if (before.includes("\0")) continue;
      const after = rewrite(before, [c], relative, replacements);
      const rel = p.slice(from.length + 1).replace(/^docs-agents(?=\/|$)/, "config");
      const target = join(to, rel);
      if (before !== after) item.changes!.push(change(p, target, before, after));
      item.manual_hits!.push(...hits(target, after, replacements));
    }
    for (const r of worktrees) {
      const p = join(r, "docs/agents");
      try {
        if (lstatSync(p).isSymbolicLink()) {
          const target = readlinkSync(p), absolute = resolve(dirname(p), target);
          if (absolute === from || absolute.startsWith(from + "/")) item.symlinks!.push({ path: p, target });
        }
      } catch (e: any) { if (e.code !== "ENOENT") throw e; }
    }
    plan.items.push(item);
  }
  plan.standard_projects = [...new Set(plan.standard_projects)].sort();
  const profiles = join(home, ".diagram-design/profiles");
  if (existsSync(profiles)) plan.items.push({ id: "profiles", kind: "profiles-move", mandatory: true, destructive: true, from: profiles, to: join(home, ".vstack/diagram-design/profiles") });
  const lock = process.env.XDG_STATE_HOME ? join(process.env.XDG_STATE_HOME, "skills/.skill-lock.json") : join(home, ".agents/.skill-lock.json");
  const names = new Set<string>();
  if (existsSync(lock)) {
    const doc = JSON.parse(readFileSync(lock, "utf8"));
    for (const [name, entry] of Object.entries(doc.skills ?? {})) {
      if ((entry as any).source === "mattpocock/skills" || ["cathrynlavery/diagram-design", "vojtaholik/good-css"].includes((entry as any).source)) names.add(name);
    }
  }
  for (const name of ["diagram-design", "good-css"]) if (existsSync(join(home, ".agents/skills", name))) names.add(name);
  if (names.size) plan.items.push({ id: "global-skills", kind: "skills-remove", mandatory: false, destructive: true, names: [...names].sort() });
  const oldRules: string[] = [];
  const ruleFiles = [...files(join(home, ".agents/rules")), ...files(join(home, ".omp/agent/rules")), ...files(join(home, ".omp/agent/AGENTS.md")), ...files(join(home, ".claude/CLAUDE.md"))];
  for (const path of ruleFiles.sort()) {
    if (path.endsWith("/matt-pocock-private-config.md")) { oldRules.push(path); continue; }
    const before = readFileSync(path, "utf8");
    if (!hits(path, before, replacements).length) continue;
    // A global relative reference is ambiguous when any discovered store is not an ordinary .git.
    const relative = [...common.keys()].every(c => [...common.get(c)!].some(r => resolve(r, ".git") === c));
    const after = rewrite(before, [...common.keys()].sort(), relative, replacements);
    plan.items.push({ id: `rule:${path}`, kind: "rule-rewrite", mandatory: false, destructive: false, from: path,
      changes: [change(path, path, before, after)], manual_hits: hits(path, after, replacements) });
  }
  for (const path of oldRules) plan.items.push({ id: `old-rule:${path}`, kind: "old-rule-delete", mandatory: true, destructive: true, from: path });
  return plan;
}

function privateMove(item: Item) {
  const { from, to, common_dir: common } = item as Item & { from: string; to: string; common_dir: string };
  if (existsSync(to)) throw new Error(`${to} already exists; vstack wins. Resolve the old-versus-new difference in a project plan; no automatic merge`);
  if (!isDir(from)) throw new Error(`${from} is not a directory`);
  const oldConfig = join(from, "docs-agents"), newConfig = join(from, "config");
  if (existsSync(oldConfig) && existsSync(newConfig)) throw new Error("both docs-agents and config exist inside the old store; no automatic merge");
  let renamed = false, configRenamed = false;
  const removed: { path: string; target: string }[] = [], written: Change[] = [];
  const exclude = join(common, "info/exclude"), beforeExclude = existsSync(exclude) ? readFileSync(exclude, "utf8") : null;
  try {
    for (const ch of item.changes!) { writeFileSync(ch.path, ch.after); written.push(ch); }
    if (existsSync(oldConfig)) { renameSync(oldConfig, newConfig); configRenamed = true; }
    renameSync(from, to); renamed = true;
    for (const link of item.symlinks!) { rmSync(link.path); removed.push(link); }
    if (removed.length && beforeExclude !== null) {
      writeFileSync(exclude, beforeExclude.split("\n").filter(l => !/^\/?docs\/agents\/?$/.test(l.trim())).join("\n"));
    }
  } catch (e) {
    // Restore the old store on a failed move so check 6 and the project guard stay closed.
    const rollbackErrors: string[] = [];
    const restore = (fn: () => void) => { try { fn(); } catch (r) { rollbackErrors.push(errorText(r)); } };
    if (renamed) restore(() => renameSync(to, from));
    if (configRenamed) restore(() => renameSync(newConfig, oldConfig));
    for (const ch of written) restore(() => writeFileSync(ch.path, ch.before));
    for (const link of removed) restore(() => symlinkSync(link.target, link.path));
    if (beforeExclude !== null) restore(() => writeFileSync(exclude, beforeExclude));
    throw new Error(errorText(e) + (rollbackErrors.length ? `; rollback errors: ${rollbackErrors.join("; ")}` : ""));
  }
}

export async function applyMachine(plan: Plan, skip: string[] = []) {
  const current = machinePlan(plan.home, plan.roots);
  if (!isDeepStrictEqual(current, plan)) throw new Error("Machine state changed since the plan. Show a new plan through ask before applying");
  if (plan.scan_errors.length) throw new Error("Scan incomplete; resolve every scan error before applying");
  for (const id of skip) {
    const item = plan.items.find(i => i.id === id);
    if (!item) throw new Error(`unknown item ${id}`);
    if (item.mandatory) throw new Error(`cannot deselect mandatory item ${id}`);
  }
  const applied: string[] = [], failures: { id: string; error: string }[] = [], warnings: { id: string; error: string }[] = [];
  let movesSucceeded = true;
  for (const item of plan.items) {
    if (skip.includes(item.id)) continue;
    try {
      if (item.kind === "private-move") privateMove(item);
      else if (item.kind === "profiles-move") {
        if (existsSync(item.to!)) throw new Error(`${item.to} already exists; no automatic merge`);
        mkdirSync(dirname(item.to!), { recursive: true }); renameSync(item.from!, item.to!);
      } else if (item.kind === "skills-remove") {
        const cmd = process.env.VSTACK_SKILLS_CLI ? [process.env.VSTACK_SKILLS_CLI] : ["npx", "--yes", "skills@1.7.0"];
        const p = Bun.spawn([...cmd, "remove", "-g", ...item.names!, "-y"], { cwd: plan.home, env: { ...process.env, HOME: plan.home }, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
        const [code, stdout, stderr] = await Promise.all([p.exited, new Response(p.stdout).text(), new Response(p.stderr).text()]);
        if (code !== 0) throw new Error(`skills remove exit ${code}: ${stderr.trim() || stdout.trim()}`);
      } else if (item.kind === "rule-rewrite" || item.kind === "store-rewrite") {
        for (const ch of item.changes!) writeFileSync(ch.path, ch.after);
      } else if (item.kind === "old-rule-delete") {
        if (!movesSucceeded) throw new Error("kept: a private or profile move failed");
        rmSync(item.from!);
      }
      applied.push(item.id);
    } catch (e) {
      if (item.kind === "skills-remove") warnings.push({ id: item.id, error: errorText(e) });
      else {
        if (item.kind === "private-move" || item.kind === "profiles-move") movesSucceeded = false;
        failures.push({ id: item.id, error: errorText(e) });
      }
    }
  }
  const manualHits = plan.items.filter(i => !skip.includes(i.id) && applied.includes(i.id)).flatMap(i => i.manual_hits ?? []);
  const remaining = machinePlan(plan.home, plan.roots);
  const complete = failures.length === 0 && remaining.items.length === 0 && remaining.scan_errors.length === 0;
  return { complete, applied, skipped: skip, failures, warnings, manual_hits: manualHits, remaining_items: remaining.items.map(i => i.id),
    message: complete ? "Machine Migration applied. Start a new session with /new." : "Migration incomplete; check 6 still fails. Review the remaining items and errors. Start a new session after completing Migration.",
  };
}

import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { applyRows, findRow, parseReplacements, type Replacement } from "../../../../scripts/lib/house-style.ts";

export interface Change { path: string; after_path: string; before: string; after: string; diff: string }
export interface Hit { path: string; line: number; text: string }
type Mode = "move" | "private";
interface Item {
  id: string;
  kind: "config-move" | "config-copy" | "code-host" | "rewrite" | "store-rewrite" | "domain-move" | "old-delete" | "old-store-delete" | "private-move";
  mandatory: boolean;
  destructive: boolean;
  from?: string;
  to?: string;
  changes: Change[];
  manual_hits: Hit[];
  symlinks?: { path: string; target: string }[];
}
export interface Plan {
  schema: 1;
  root: string;
  common_dir: string;
  mode: Mode;
  private_available: boolean;
  items: Item[];
  notices: string[];
}

const dir = (p: string) => existsSync(p) && lstatSync(p).isDirectory();
const text = (p: string) => readFileSync(p, "utf8");
const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);
const STORE_TEXT = [".md", ".html", ".json"];

function git(cwd: string, ...args: string[]) {
  const r = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe", stdin: "ignore", env: { ...process.env, GIT_LITERAL_PATHSPECS: "1" } });
  if (r.exitCode !== 0) throw new Error(r.stderr.toString().trim() || `git ${args.join(" ")} failed`);
  return r.stdout.toString().trim();
}
// A linked worktree's git rejects paths in the shared common dir, and git never tracks them.
const tracked = (root: string, path: string) => !relative(root, path).startsWith("..") && git(root, "ls-files", "--", path).length > 0;

function rows(): Replacement[] {
  const doc = Bun.YAML.parse(text(join(import.meta.dir, "../references/house-style.yaml")));
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

function hits(path: string, t: string, replacements: Replacement[]): Hit[] {
  return t.split("\n").flatMap((line, i) => /matt-pocock|docs-agents/.test(line) || replacements.some(r => findRow(line, r).length)
    ? [{ path, line: i + 1, text: line }] : []);
}

function change(path: string, afterPath: string, before: string, after: string): Change {
  const a = before.split("\n"), b = after.split("\n");
  return { path, after_path: afterPath, before, after,
    diff: `--- ${path}\n+++ ${afterPath}\n@@ -1,${a.length} +1,${b.length} @@\n${a.map(l => "-" + l).join("\n")}\n${b.map(l => "+" + l).join("\n")}\n` };
}

function rewrite(t: string, common: string, commonIsOrdinaryGit: boolean, replacements: Replacement[]) {
  const from = join(common, "matt-pocock"), to = join(common, "vstack");
  for (const [a, b] of [[from + "/docs-agents", to + "/config"], [from, to]]) {
    const escaped = a!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(escaped + "(?=$|[/\\s\"'`<>),;])", "g"), () => b!);
  }
  return applyRows(t, replacements.filter(r => commonIsOrdinaryGit || !r.id.startsWith("mig-")));
}

function domainFiles(root: string): string[] {
  if (!dir(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap(e => {
    if ([".git", "node_modules", ".venv", "Library", "docs/agents"].includes(e.name)) return [];
    const p = join(root, e.name);
    return e.isDirectory() ? domainFiles(p) : e.isFile() && /^(CONTEXT|GLOSSARY)(-MAP)?\.md$/.test(e.name) ? [p] : [];
  });
}

function codeHostSeed(root: string): { template: string; text: string } | null {
  const remotes = git(root, "remote").split("\n").filter(Boolean);
  const name = remotes.includes("origin") ? "origin" : remotes[0];
  if (!name) return null;
  const m = /^(?:[\w.+-]+@|(?:https?|ssh|git):\/\/(?:[^@/]+@)?)(github\.com|gitlab\.com)[:/](.+?)(?:\.git)?\/?$/.exec(git(root, "remote", "get-url", name));
  if (!m) return null;
  const template = join(import.meta.dir, "..", m[1] === "github.com" ? "code-host-github.md" : "code-host-gitlab.md");
  const seeded = m[1] === "github.com"
    ? text(template).replaceAll("<owner>/<repo>", m[2]!)
    : text(template).replaceAll("<group>/<project>", m[2]!).replaceAll("<gitlab.com or the self-hosted host>", "gitlab.com");
  return { template, text: seeded };
}

function privateMovePlan(common: string, worktrees: string[], commonIsOrdinaryGit: boolean, replacements: Replacement[]): Item {
  const from = join(common, "matt-pocock"), to = join(common, "vstack");
  const item: Item = { id: `private:${common}`, kind: "private-move", mandatory: true, destructive: true, from, to, changes: [], manual_hits: [], symlinks: [] };
  for (const p of files(from)) {
    if (!STORE_TEXT.includes(extname(p))) continue;
    const before = text(p);
    if (before.includes("\0")) continue;
    const after = rewrite(before, common, commonIsOrdinaryGit, replacements);
    const target = join(to, p.slice(from.length + 1).replace(/^docs-agents(?=\/|$)/, "config"));
    if (before !== after) item.changes.push(change(p, target, before, after));
    item.manual_hits.push(...hits(target, after, replacements));
  }
  for (const w of worktrees) {
    const p = join(w, "docs/agents");
    try {
      if (lstatSync(p).isSymbolicLink()) {
        const target = readlinkSync(p), absolute = resolve(dirname(p), target);
        if (absolute === from || absolute.startsWith(from + "/")) item.symlinks!.push({ path: p, target });
      }
    } catch (e: any) { if (e.code !== "ENOENT") throw e; }
  }
  return item;
}

export function projectPlan(cwd: string, mode: Mode = "move"): Plan {
  const root = realpathSync(git(cwd, "rev-parse", "--show-toplevel"));
  const common = realpathSync(git(root, "rev-parse", "--path-format=absolute", "--git-common-dir"));
  const oldStore = join(common, "matt-pocock"), store = join(common, "vstack");
  const privateMode = mode === "private" || dir(join(store, "config")) || existsSync(oldStore);
  const oldConfig = join(root, "docs/agents");
  const plan: Plan = { schema: 1, root, common_dir: common, mode, private_available: dir(oldConfig) && tracked(root, oldConfig), items: [], notices: [
    "Hand edits are kept; config is not re-seeded.",
    "vstack wins destination conflicts; deletion offers never merge old files.",
  ] };
  const replacements = rows(), checkoutOwnsCommonDir = join(root, ".git") === common;
  const worktrees = git(root, "worktree", "list", "--porcelain").split("\n").filter(l => l.startsWith("worktree ")).map(l => l.slice(9));
  // Relative paths in the shared store name the main checkout's `.git`, wherever setup runs.
  const commonIsOrdinaryGit = worktrees.some(w => resolve(w, ".git") === common);
  const substitute = (t: string, path = root) =>
    rewrite(t, common, path.startsWith(common + "/") ? commonIsOrdinaryGit : checkoutOwnsCommonDir, replacements);
  const add = (kind: Item["kind"], from: string, to: string, before: string, after: string) => {
    plan.items.push({ id: `${kind}:${from}`, kind, mandatory: false, destructive: ["old-delete", "old-store-delete"].includes(kind), from, to,
      changes: [change(from, to, before, after)], manual_hits: hits(to, after, replacements) });
  };
  let moved: Item | undefined;
  if (existsSync(oldStore)) {
    if (existsSync(store)) {
      const i: Item = { id: `old-store:${common}`, kind: "old-store-delete", mandatory: false, destructive: true, from: oldStore, to: store, changes: [], manual_hits: [] };
      for (const p of files(oldStore)) {
        const to = join(store, p.slice(oldStore.length + 1).replace(/^docs-agents(?=\/|$)/, "config"));
        if (STORE_TEXT.includes(extname(p))) i.changes.push(change(p, to, text(p), existsSync(to) ? text(to) : ""));
      }
      plan.items.push(i);
      plan.notices.push("The Migration stays incomplete until this deletion is approved. Outside links to old storage break; no compatibility link.");
      if (!dir(join(store, "config"))) plan.notices.push("The winning vstack store has no config directory; application refuses deletion until you resolve that destination.");
      return plan;
    }
    moved = privateMovePlan(common, worktrees, commonIsOrdinaryGit, replacements);
    plan.items.push(moved);
    plan.notices.push("The private move is mandatory. A failure stops all remaining Migration actions. Outside links to old storage break.");
  }
  const destination = privateMode ? join(store, "config") : join(root, "docs/vstack");
  const firstPrivateCopy = mode === "private" && !dir(join(store, "config")) && !moved;
  if (dir(oldConfig) && (!privateMode || firstPrivateCopy)) {
    for (const e of readdirSync(oldConfig, { withFileTypes: true })) {
      if (!e.isFile() || !e.name.endsWith(".md")) continue;
      const from = join(oldConfig, e.name), to = join(destination, e.name), before = text(from);
      if (existsSync(to)) { add("old-delete", from, to, before, text(to)); continue; }
      let after = substitute(before);
      if (privateMode && e.name === "issue-tracker.md") after = after.replaceAll(".scratch/", join(store, "artifacts") + "/");
      if (privateMode && e.name === "domain.md") {
        after = after.replace(/(?<![\w/-])GLOSSARY(-MAP)?\.md/g, (_, map) => join(store, "domain", `GLOSSARY${map ?? ""}.md`)).replaceAll("docs/adr/", join(store, "domain/adr") + "/");
        after += `\nRead the repo's tracked GLOSSARY.md and docs/adr/ as well when present. Private domain docs live in ${store}/domain/.\n`;
      }
      add(privateMode ? "config-copy" : "config-move", from, to, before, after);
    }
  }
  const hostFile = join(destination, "code-host.md");
  const hostPlanned = plan.items.some(i => i.to === hostFile || i.changes.some(c => c.after_path === hostFile))
    || (moved !== undefined && ["docs-agents", "config"].some(d => existsSync(join(oldStore, d, "code-host.md"))));
  if (plan.items.some(i => ["config-move", "config-copy", "private-move"].includes(i.kind)) && !existsSync(hostFile) && !hostPlanned) {
    const seed = codeHostSeed(root);
    if (seed) add("code-host", seed.template, hostFile, "", seed.text);
    else plan.notices.push("No code-host.md: the remote is not on github.com or gitlab.com. setup-vstack's Code host section maps it after Migration, in the same run.");
  }
  const standardConfig = privateMode ? [] : files(join(root, "docs/vstack")).filter(p => p.endsWith(".md"));
  for (const path of [...["AGENTS.md", "CLAUDE.md"].map(f => join(root, f)), ...files(join(root, ".omp/rules")), ...standardConfig]) {
    if (!existsSync(path) || !lstatSync(path).isFile()) continue;
    if (privateMode && ["AGENTS.md", "CLAUDE.md"].includes(basename(path)) && tracked(root, path)) continue;
    const before = text(path), after = substitute(before);
    if (before !== after || hits(path, after, replacements).length) add("rewrite", path, path, before, after);
  }
  for (const source of [...domainFiles(root), ...domainFiles(moved ? oldStore : join(store, "domain"))]) {
    if (privateMode && tracked(root, source)) continue;
    const inOld = moved !== undefined && source.startsWith(oldStore + "/");
    const path = inOld ? join(store, source.slice(oldStore.length + 1)) : source;
    const before = inOld ? substitute(text(source), source) : text(source);
    const to = join(dirname(path), basename(path).replace(/^CONTEXT/, "GLOSSARY"));
    const after = substitute(before, path);
    if (path !== to) {
      if (existsSync(to)) add("old-delete", path, to, before, text(to));
      else add("domain-move", path, to, before, after);
    } else if (before !== after) add("rewrite", path, path, before, after);
  }
  const planned = new Set(plan.items.flatMap(i => [i.from, ...i.changes.map(c => c.after_path)]));
  for (const path of files(store)) {
    if (planned.has(path) || !STORE_TEXT.includes(extname(path))) continue;
    const before = text(path);
    if (before.includes("\0") || !hits(path, before, replacements).length) continue;
    add("store-rewrite", path, path, before, substitute(before, path));
  }
  return plan;
}

function privateMove(item: Item, common: string) {
  const { from, to } = item as Item & { from: string; to: string };
  if (existsSync(to)) throw new Error(`${to} already exists; vstack wins. Resolve the old-versus-new difference first; no automatic merge`);
  if (!dir(from)) throw new Error(`${from} is not a directory`);
  const oldConfig = join(from, "docs-agents"), newConfig = join(from, "config");
  if (existsSync(oldConfig) && existsSync(newConfig)) throw new Error("both docs-agents and config exist inside the old store; no automatic merge");
  let renamed = false, configRenamed = false;
  const removed: { path: string; target: string }[] = [], written: Change[] = [];
  const exclude = join(common, "info/exclude"), beforeExclude = existsSync(exclude) ? text(exclude) : null;
  try {
    for (const ch of item.changes) { writeFileSync(ch.path, ch.after); written.push(ch); }
    if (existsSync(oldConfig)) { renameSync(oldConfig, newConfig); configRenamed = true; }
    renameSync(from, to); renamed = true;
    for (const link of item.symlinks!) { rmSync(link.path); removed.push(link); }
    if (removed.length && beforeExclude !== null) {
      writeFileSync(exclude, beforeExclude.split("\n").filter(l => !/^\/?docs\/agents\/?$/.test(l.trim())).join("\n"));
    }
  } catch (e) {
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

function move(root: string, from: string, to: string) {
  mkdirSync(dirname(to), { recursive: true });
  if (tracked(root, from)) git(root, "mv", "--", from, to); else renameSync(from, to);
}

export function applyProject(plan: Plan, skip: string[] = []) {
  if (!isDeepStrictEqual(projectPlan(plan.root, plan.mode), plan)) throw new Error("Project state changed since the plan. Show a new plan through ask before applying");
  for (const id of skip) {
    const i = plan.items.find(i => i.id === id);
    if (!i) throw new Error(`unknown item ${id}`);
    if (i.mandatory) throw new Error(`cannot deselect mandatory item ${id}`);
  }
  const applied: string[] = [], failures: { id: string; error: string }[] = [], changed: string[] = [];
  for (const item of plan.items) {
    if (skip.includes(item.id)) continue;
    try {
      if (item.kind === "private-move") privateMove(item, plan.common_dir);
      else if (item.kind === "old-store-delete") {
        if (!dir(join(item.to!, "config"))) throw new Error("vstack destination has no config; old private storage kept, Migration stays incomplete");
        rmSync(item.from!, { recursive: true });
      } else if (item.kind === "old-delete") { rmSync(item.from!); changed.push(item.from!); }
      else {
        const ch = item.changes[0]!;
        if (item.kind === "config-move" || item.kind === "domain-move") { move(plan.root, ch.path, ch.after_path); changed.push(ch.path); }
        mkdirSync(dirname(ch.after_path), { recursive: true }); writeFileSync(ch.after_path, ch.after); changed.push(ch.after_path);
      }
      applied.push(item.id);
    } catch (e) { failures.push({ id: item.id, error: errorText(e) }); break; }
  }
  const blocked = existsSync(join(plan.common_dir, "matt-pocock"));
  const paths = [...new Set(changed.filter(p => !p.startsWith(plan.common_dir + "/")).map(p => relative(plan.root, p)))].sort();
  return { complete: !blocked && !failures.length, applied, skipped: skip, failures, blocked, paths,
    manual_hits: plan.items.filter(i => applied.includes(i.id)).flatMap(i => i.manual_hits),
    message: blocked || failures.length ? "Migration incomplete. Setup stops here." : "Migration applied. Setup goes on in this run." };
}

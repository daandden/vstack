// Project Migration: a read-only approval snapshot and an uncommitted cutover.
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { change, files, hits, machinePlan, privateMove, rewrite, rows, type Change, type Hit, type Item } from "./migration.ts";

type Mode = "move" | "private";
interface ProjectItem {
  id: string;
  kind: "config-move" | "config-copy" | "code-host" | "rewrite" | "domain-move" | "old-delete" | "old-store-delete" | "private-move";
  mandatory: boolean;
  destructive: boolean;
  from?: string;
  to?: string;
  changes: Change[];
  manual_hits: Hit[];
  fallback?: Item;
}
export interface ProjectPlan {
  schema: 1;
  root: string;
  common_dir: string;
  mode: Mode;
  private_available: boolean;
  items: ProjectItem[];
  notices: string[];
}
function git(root: string, ...args: string[]) {
  const p = Bun.spawnSync(["git", "-C", root, ...args], {stdout:"pipe",stderr:"pipe"});
  if (p.exitCode) throw new Error(p.stderr.toString().trim());
  return p.stdout.toString().trim();
}
const tracked = (root: string, path: string) => git(root, "ls-files", "--", path).length > 0;
const text = (path: string) => readFileSync(path, "utf8");
const dir = (path: string) => existsSync(path) && lstatSync(path).isDirectory();
function domainFiles(root: string): string[] {
  if (!dir(root)) return [];
  return readdirSync(root, {withFileTypes:true}).flatMap(e => {
    if ([".git", "node_modules", ".venv", "Library", "docs/agents"].includes(e.name)) return [];
    const p = join(root,e.name);
    return e.isDirectory() ? domainFiles(p) : e.isFile() && /^(CONTEXT|GLOSSARY)(-MAP)?\.md$/.test(e.name) ? [p] : [];
  });
}
// Matt's setup has no Code host, so a Migration seeds code-host.md from setup-vstack's template when the
// remote is github.com or gitlab.com (ADR 0020). Any other host needs setup-vstack to map its tool.
const TEMPLATES = join(import.meta.dir, "../../setup-vstack");
function codeHostSeed(root: string): { template: string; text: string } | null {
  const remotes = git(root,"remote").split("\n").filter(Boolean);
  const name = remotes.includes("origin") ? "origin" : remotes[0];
  if (!name) return null;
  const m = /^(?:[\w.+-]+@|(?:https?|ssh|git):\/\/(?:[^@/]+@)?)(github\.com|gitlab\.com)[:/](.+?)(?:\.git)?\/?$/.exec(git(root,"remote","get-url",name));
  if (!m) return null;
  const template = join(TEMPLATES, m[1] === "github.com" ? "code-host-github.md" : "code-host-gitlab.md");
  const text = m[1] === "github.com"
    ? readFileSync(template,"utf8").replaceAll("<owner>/<repo>",m[2]!)
    : readFileSync(template,"utf8").replaceAll("<group>/<project>",m[2]!).replaceAll("<gitlab.com or the self-hosted host>","gitlab.com");
  return { template, text };
}
export function projectPlan(cwd: string, mode: Mode = "move"): ProjectPlan {
  const root = realpathSync(git(cwd,"rev-parse","--show-toplevel"));
  const common = realpathSync(git(root,"rev-parse","--path-format=absolute","--git-common-dir"));
  const oldStore = join(common,"matt-pocock"), store = join(common,"vstack");
  const privateMode = mode === "private" || dir(join(store,"config")) || existsSync(oldStore);
  const oldConfig = join(root,"docs/agents");
  const privateAvailable = dir(oldConfig) && tracked(root,oldConfig);
  const plan: ProjectPlan = {schema:1,root,common_dir:common,mode,private_available:privateAvailable,items:[],notices:[
    "Changes stay uncommitted. Hand edits are kept; config is not re-seeded.",
    "vstack wins destination conflicts; deletion offers never merge old files.",
    "After applying, start a new omp session with /new.",
  ]};
  const replacements = rows(), relative = join(root,".git") === common;
  const substitute = (t: string) => rewrite(t,[common],relative,replacements);
  const add = (kind: ProjectItem["kind"], from: string, to: string, before: string, after: string, mandatory = false) => {
    const i: ProjectItem = {id:`${kind}:${from}`,kind,mandatory,destructive:["old-delete","old-store-delete"].includes(kind),from,to,changes:[change(from,to,before,after)],manual_hits:hits(to,after,replacements)};
    plan.items.push(i); return i;
  };
  let movedStore: Item | undefined;
  if (existsSync(oldStore)) {
    if (existsSync(store)) {
      const i: ProjectItem = {id:`old-store:${common}`,kind:"old-store-delete",mandatory:false,destructive:true,from:oldStore,to:store,changes:[],manual_hits:[]};
      for (const p of files(oldStore)) {
        const to = join(store,p.slice(oldStore.length+1).replace(/^docs-agents(?=\/|$)/,"config"));
        if ([".md",".json",".html"].some(ext=>p.endsWith(ext))) i.changes.push(change(p,to,text(p),existsSync(to)?text(to):""));
      }
      plan.items.push(i);
      plan.notices.push("The Migration stays incomplete until this deletion is approved. Outside links to old storage break; no compatibility link.");
      // A destination without config cannot safely enable Private mode by deleting the old store.
      if (!dir(join(store,"config"))) plan.notices.push("The winning vstack store has no config directory; application refuses deletion until you resolve that destination.");
      return plan;
    }
    movedStore = machinePlan(root,[root]).items.find(i=>i.kind === "private-move" && i.common_dir === common);
    if (!movedStore) throw new Error("Cannot plan this repo's mandatory private storage move");
    plan.items.push({id:movedStore.id,kind:"private-move",mandatory:true,destructive:true,from:oldStore,to:store,changes:movedStore.changes!,manual_hits:movedStore.manual_hits!,fallback:movedStore});
    plan.notices.push("Private fallback is mandatory. A failure stops all remaining project actions. Outside old links break.");
  }
  const destination = privateMode ? join(store,"config") : join(root,"docs/vstack");
  // Existing Private config deliberately leaves the team's tracked Matt setup alone.
  if (dir(oldConfig) && (!privateMode || (mode === "private" && !dir(join(store,"config")) && !movedStore))) {
    for (const e of readdirSync(oldConfig,{withFileTypes:true})) {
      if (!e.isFile() || !e.name.endsWith(".md")) continue;
      const from = join(oldConfig,e.name), to = join(destination,e.name), before = text(from);
      if (existsSync(to)) { add("old-delete",from,to,before,text(to)); continue; }
      let after = substitute(before);
      if (privateMode && e.name === "issue-tracker.md") after = after.replaceAll(".scratch/",join(store,"artifacts")+"/");
      if (privateMode && e.name === "domain.md") {
        after = after.replace(/(?<![\w/-])GLOSSARY(-MAP)?\.md/g, (_, map) => join(store,"domain",`GLOSSARY${map ?? ""}.md`)).replaceAll("docs/adr/",join(store,"domain/adr")+"/");
        after += `\nRead the repo's tracked GLOSSARY.md and docs/adr/ as well when present. Private domain docs live in ${store}/domain/.\n`;
      }
      add(privateMode?"config-copy":"config-move",from,to,before,after);
    }
  }
  const hostFile = join(destination,"code-host.md");
  // A code-host.md that this plan moves or copies is the user's; the seed must never replace it.
  const hostPlanned = plan.items.some(i=>i.to===hostFile || i.changes.some(c=>c.after_path===hostFile))
    || (movedStore !== undefined && ["docs-agents","config"].some(d=>existsSync(join(oldStore,d,"code-host.md"))));
  if (plan.items.some(i=>["config-move","config-copy","private-move"].includes(i.kind)) && !existsSync(hostFile) && !hostPlanned) {
    const seed = codeHostSeed(root);
    if (seed) add("code-host",seed.template,hostFile,"",seed.text);
    else plan.notices.push("No code-host.md: the remote is not on github.com or gitlab.com. Run /skill:setup-vstack after Migration to map this repo's Code host.");
  }
  for (const path of [...["AGENTS.md","CLAUDE.md"].map(f=>join(root,f)),...files(join(root,".omp/rules"))]) {
    if (!existsSync(path) || !lstatSync(path).isFile()) continue;
    const before = text(path);
    // Preserve the whole tracked instruction file in Private mode, including the legacy block.
    if (privateMode && ["AGENTS.md","CLAUDE.md"].includes(basename(path)) && tracked(root,path)) continue;
    const after = substitute(before);
    if (before !== after) add("rewrite",path,path,before,after);
    else if (hits(path,after,replacements).length) add("rewrite",path,path,before,after);
  }
  const domainSources = [...domainFiles(root), ...domainFiles(movedStore ? oldStore : join(store,"domain"))];
  for (const source of domainSources) {
    if (privateMode && tracked(root,source)) continue;
    const path = movedStore && source.startsWith(oldStore+"/") ? join(store,source.slice(oldStore.length+1)) : source;
    const before = movedStore && source.startsWith(oldStore+"/") ? substitute(text(source)) : text(source);
    const to = join(dirname(path),basename(path).replace(/^CONTEXT/,"GLOSSARY"));
    const after = substitute(before);
    if (path !== to) {
      if (existsSync(to)) add("old-delete",path,to,before,text(to));
      else add("domain-move",path,to,before,after);
    } else if (before !== after) add("rewrite",path,path,before,after);
  }
  return plan;
}
function move(root: string, from: string, to: string) {
  mkdirSync(dirname(to),{recursive:true});
  if (tracked(root,from)) git(root,"mv","--",from,to); else renameSync(from,to);
}
export function applyProject(plan: ProjectPlan, skip: string[] = []) {
  if (!isDeepStrictEqual(projectPlan(plan.root,plan.mode),plan)) throw new Error("Project state changed since the plan. Show a new plan through ask before applying");
  for (const id of skip) {
    const i=plan.items.find(i=>i.id===id);
    if (!i) throw new Error(`unknown item ${id}`);
    if (i.mandatory) throw new Error(`cannot deselect mandatory item ${id}`);
  }
  const applied: string[] = [], failures: {id:string;error:string}[] = [];
  for (const item of plan.items) {
    if (skip.includes(item.id)) continue;
    try {
      if (item.kind === "private-move") privateMove(item.fallback!);
      else if (item.kind === "old-store-delete") {
        if (!dir(join(item.to!,"config"))) throw new Error("vstack destination has no config; old private storage kept, Migration stays incomplete");
        rmSync(item.from!,{recursive:true});
      } else if (item.kind === "old-delete") rmSync(item.from!);
      else {
        const ch=item.changes[0]!;
        if (item.kind === "config-move" || item.kind === "domain-move") move(plan.root,ch.path,ch.after_path);
        mkdirSync(dirname(ch.after_path),{recursive:true});writeFileSync(ch.after_path,ch.after);
      }
      applied.push(item.id);
    } catch(e) { failures.push({id:item.id,error:e instanceof Error?e.message:String(e)}); break; }
  }
  const blocked = existsSync(join(plan.common_dir,"matt-pocock"));
  return {complete:!blocked && !failures.length,applied,skipped:skip,failures,blocked,
    manual_hits:plan.items.filter(i=>applied.includes(i.id)).flatMap(i=>i.manual_hits),
    message:blocked || failures.length ? "Project Migration incomplete. Start a new session after completing Migration." : "Project Migration applied, uncommitted for review. Start a new session with /new, then run /skill:setup-vstack."};
}

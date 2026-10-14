import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { git } from "./support/fixture.ts";
const SCRIPT = join(import.meta.dir, "../plugin/skills/migrate-to-vstack/scripts/migrate-project.ts");
const dirs: string[] = [];
afterAll(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));
function put(p: string, t: string) { mkdirSync(dirname(p), {recursive:true}); writeFileSync(p,t); }
function repo() { const r = realpathSync(mkdtempSync(join(tmpdir(), "vstack-project-migration-"))); dirs.push(r); git(r,"init","-q"); put(join(r,"README"),"repo"); git(r,"add","."); git(r,"commit","-qm","initial"); return r; }
function run(r: string, ...args: string[]) { const p = Bun.spawnSync([process.execPath,SCRIPT,...args],{cwd:r,env:{...process.env,HOME:r},stdout:"pipe",stderr:"pipe"}); return {code:p.exitCode,stderr:p.stderr.toString(),json:()=>JSON.parse(p.stdout.toString())}; }
function apply(r: string, mode = "move", skip: string[] = []) { const p=run(r,"plan","--mode",mode); expect(p.code).toBe(0); const f=join(git(r,"rev-parse","--path-format=absolute","--git-common-dir"),"approved.json");put(f,JSON.stringify(p.json()));return run(r,"apply","--plan",f,...skip.flatMap(id=>["--skip",id])); }
function matt(r: string) { put(join(r,"docs/agents/domain.md"),"Hand edits: CONTEXT-MAP.md and CONTEXT.md. ask-matt\n");put(join(r,"AGENTS.md"),"# Repo\n## Agent skills\nUse docs/agents/domain.md\n## Other\nKeep this\n");git(r,"add",".");git(r,"commit","-qm","Matt setup"); }
test("Move plans read-only, applies rows preserving edits, stages tracked renames without committing",()=>{const r=repo();matt(r);put(join(r,"docs/agents/custom.md"),"hand untracked");const head=git(r,"rev-parse","HEAD");const p=run(r,"plan").json();expect(p.private_available).toBe(true);expect(p.items.some((i:any)=>i.kind==="config-move")).toBe(true);expect(existsSync(join(r,"docs/vstack"))).toBe(false);expect(apply(r).code).toBe(0);expect(readFileSync(join(r,"docs/vstack/domain.md"),"utf8")).toBe("Hand edits: GLOSSARY-MAP.md and GLOSSARY.md. ask-matt\n");expect(readFileSync(join(r,"AGENTS.md"),"utf8")).toContain("## vstack\nUse docs/vstack/domain.md");expect(readFileSync(join(r,"docs/vstack/custom.md"),"utf8")).toBe("hand untracked");expect(git(r,"rev-parse","HEAD")).toBe(head);expect(run(r,"plan").json().items).toEqual([]);});
test("Private copy preserves tracked files and block, redirects scratch and domain config",()=>{const r=repo();matt(r);put(join(r,"docs/agents/issue-tracker.md"),".scratch/map .scratch/tickets .scratch/frontier");const before=readFileSync(join(r,"AGENTS.md"),"utf8");expect(apply(r,"private").code).toBe(0);expect(readFileSync(join(r,"AGENTS.md"),"utf8")).toBe(before);expect(existsSync(join(r,"docs/agents/domain.md"))).toBe(true);expect(readFileSync(join(r,".git/vstack/config/issue-tracker.md"),"utf8")).toContain(join(r,".git/vstack/artifacts/")+"frontier");expect(readFileSync(join(r,".git/vstack/config/domain.md"),"utf8")).toContain(join(r,".git/vstack/domain/"));expect(run(r,"plan").json().items).toEqual([]);});
test("marker, nested domain files, map links and rule hits share one plan",()=>{const r=repo();put(join(r,".diagram-design"),"profile: compact\n");put(join(r,"CONTEXT-MAP.md"),"[a](packages/a/CONTEXT.md)");put(join(r,"packages/a/CONTEXT.md"),"domain hand edit");put(join(r,".omp/rules/user.md"),"/setup-matt-pocock-skills");expect(apply(r).json().message).toContain("new session");expect(readFileSync(join(r,"docs/vstack/diagram.md"),"utf8")).toBe("diagram-profile: compact\n");expect(existsSync(join(r,".diagram-design"))).toBe(false);expect(readFileSync(join(r,"GLOSSARY-MAP.md"),"utf8")).toBe("[a](packages/a/GLOSSARY.md)");expect(readFileSync(join(r,"packages/a/GLOSSARY.md"),"utf8")).toBe("domain hand edit");expect(readFileSync(join(r,".omp/rules/user.md"),"utf8")).toBe("/skill:setup-vstack");});
test("fallback private storage is mandatory and domain files follow it",()=>{const r=repo();put(join(r,".git/matt-pocock/docs-agents/domain.md"),".git/matt-pocock/domain/CONTEXT.md");put(join(r,".git/matt-pocock/domain/CONTEXT.md"),"hand domain");put(join(r,".git/matt-pocock/claims/claim.json"),"{}");const p=run(r,"plan").json();expect(p.items[0].mandatory).toBe(true);expect(apply(r,"move",[p.items[0].id]).code).toBe(2);expect(apply(r).code).toBe(0);expect(readFileSync(join(r,".git/vstack/domain/GLOSSARY.md"),"utf8")).toBe("hand domain");expect(existsSync(join(r,".git/vstack/claims/claim.json"))).toBe(true);expect(existsSync(join(r,"docs/vstack"))).toBe(false);});
test("vstack wins conflicts with a diff and optional delete, including private storage",()=>{const r=repo();matt(r);put(join(r,"docs/vstack/domain.md"),"vstack wins");let p=run(r,"plan").json();const old=p.items.find((i:any)=>i.kind==="old-delete");expect(old.destructive).toBe(true);expect(old.changes[0].diff).toContain("+vstack wins");expect(apply(r,"move",[old.id]).code).toBe(0);expect(existsSync(join(r,"docs/agents/domain.md"))).toBe(true);expect(apply(r).code).toBe(0);expect(readFileSync(join(r,"docs/vstack/domain.md"),"utf8")).toBe("vstack wins");put(join(r,".git/matt-pocock/docs-agents/domain.md"),"old");put(join(r,".git/vstack/config/domain.md"),"new");p=run(r,"plan").json();expect(p.items[0].kind).toBe("old-store-delete");expect(p.items[0].changes[0].diff).toContain("+new");expect(apply(r).code).toBe(0);expect(existsSync(join(r,".git/matt-pocock"))).toBe(false);expect(readFileSync(join(r,".git/vstack/config/domain.md"),"utf8")).toBe("new");});
test("Cancel and stale plans write nothing",()=>{const r=repo();matt(r);expect(run(r,"cancel").code).toBe(0);expect(existsSync(join(r,"docs/agents/domain.md"))).toBe(true);const f=join(r,".git/approved.json");put(f,JSON.stringify(run(r,"plan").json()));put(join(r,"docs/agents/domain.md"),"changed");expect(run(r,"apply","--plan",f).code).toBe(2);expect(existsSync(join(r,"docs/vstack"))).toBe(false);});

test("Private re-runs keep tracked legacy domain files, with marker and private map conversion", () => {
  const r = repo(); matt(r);
  put(join(r,"CONTEXT.md"), "team domain"); git(r,"add","CONTEXT.md"); git(r,"commit","-qm","team domain");
  put(join(r,".diagram-design"), "profile: team");
  expect(apply(r,"private").code).toBe(0);
  expect(readFileSync(join(r,".git/vstack/config/diagram.md"),"utf8")).toBe("diagram-profile: team\n");
  expect(readFileSync(join(r,"CONTEXT.md"),"utf8")).toBe("team domain");
  put(join(r,".git/vstack/domain/CONTEXT-MAP.md"), "[one](one/CONTEXT.md)");
  put(join(r,".git/vstack/domain/one/CONTEXT.md"), "private domain");
  expect(apply(r).code).toBe(0);
  expect(readFileSync(join(r,".git/vstack/domain/GLOSSARY-MAP.md"),"utf8")).toBe("[one](one/GLOSSARY.md)");
  expect(run(r,"plan").json().items).toEqual([]);
});
test("fallback resolves a linked worktree common dir and refuses unsafe old-store deletion", () => {
  const r=repo(), linked=join(r,"linked");
  git(r,"worktree","add","-qb","linked",linked);
  put(join(r,".git/matt-pocock/docs-agents/domain.md"),`${r}/.git/matt-pocock/domain/CONTEXT.md`);
  expect(apply(linked).code).toBe(0);
  expect(readFileSync(join(r,".git/vstack/config/domain.md"),"utf8")).toBe(`${r}/.git/vstack/domain/GLOSSARY.md`);
  const unsafe=repo();
  put(join(unsafe,".git/matt-pocock/docs-agents/domain.md"),"old");
  put(join(unsafe,".git/vstack/claims/claim.json"),"{}");
  expect(apply(unsafe).code).toBe(1);
  expect(existsSync(join(unsafe,".git/matt-pocock"))).toBe(true);
  expect(existsSync(join(unsafe,"docs/vstack"))).toBe(false);
});
const TEMPLATES = join(import.meta.dir, "../plugin/skills/setup-vstack");
test("a migrated GitHub or GitLab repo gets code-host.md from the template, with its repo filled in", () => {
  const gh = repo(); matt(gh); git(gh,"remote","add","origin","git@github.com:acme/app.git");
  const item = run(gh,"plan").json().items.find((i:any)=>i.kind==="code-host");
  expect(item.to).toBe(join(gh,"docs/vstack/code-host.md"));
  expect(apply(gh).code).toBe(0);
  const written = readFileSync(join(gh,"docs/vstack/code-host.md"),"utf8");
  expect(written).toBe(readFileSync(join(TEMPLATES,"code-host-github.md"),"utf8").replaceAll("<owner>/<repo>","acme/app"));
  expect(run(gh,"plan").json().items).toEqual([]);

  const gl = repo(); matt(gl); git(gl,"remote","add","origin","https://gitlab.com/group/sub/project.git");
  expect(apply(gl,"private").code).toBe(0);
  const glWritten = readFileSync(join(gl,".git/vstack/config/code-host.md"),"utf8");
  expect(glWritten).toContain("Repo: `group/sub/project`");
  expect(glWritten).toContain("Host: GitLab (`gitlab.com`)");
  expect(glWritten).not.toContain("<group>/<project>");
});
test("any other remote, or no remote, gets a setup-vstack notice and no code-host item", () => {
  const bb = repo(); matt(bb); git(bb,"remote","add","origin","git@bitbucket.org:acme/app.git");
  const p = run(bb,"plan").json();
  expect(p.items.some((i:any)=>i.kind==="code-host")).toBe(false);
  expect(p.notices.some((n:string)=>n.includes("code-host.md") && n.includes("/skill:setup-vstack"))).toBe(true);
  const none = repo();
  expect(run(none,"plan").json().notices.some((n:string)=>n.includes("code-host.md"))).toBe(false);
});
test("a code-host.md that Migration moves or copies keeps its hand edits instead of the template seed", () => {
  const hand = "# Code host: Bitbucket\nTool: hand-mapped MCP\n";
  for (const mode of ["move","private"]) {
    const r = repo(); matt(r); git(r,"remote","add","origin","git@github.com:acme/app.git");
    put(join(r,"docs/agents/code-host.md"),hand); git(r,"add","."); git(r,"commit","-qm","hand host");
    expect(run(r,"plan","--mode",mode).json().items.some((i:any)=>i.kind==="code-host")).toBe(false);
    expect(apply(r,mode).code).toBe(0);
    expect(readFileSync(join(r,mode==="move"?"docs/vstack/code-host.md":".git/vstack/config/code-host.md"),"utf8")).toBe(hand);
  }
  for (const dir of ["docs-agents","config"]) {
    const r = repo(); git(r,"remote","add","origin","git@github.com:acme/app.git");
    put(join(r,".git/matt-pocock",dir,"domain.md"),"domain"); put(join(r,".git/matt-pocock",dir,"code-host.md"),hand);
    expect(run(r,"plan").json().items.some((i:any)=>i.kind==="code-host")).toBe(false);
    expect(apply(r).code).toBe(0);
    expect(readFileSync(join(r,".git/vstack/config/code-host.md"),"utf8")).toBe(hand);
  }
});

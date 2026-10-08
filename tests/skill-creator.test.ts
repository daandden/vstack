import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const roots: string[] = [];
afterEach(() => { for (const p of roots.splice(0)) rmSync(p, {recursive:true, force:true}); });
function fixture() { const p=mkdtempSync(join(tmpdir(),"skill-creator-")); roots.push(p); return p; }
function run(script:string,...args:string[]) { const r=Bun.spawnSync(["bun",join(import.meta.dir,"../plugin/skills/skill-creator/scripts",script+".ts"),...args],{stdout:"pipe",stderr:"pipe"}); return {code:r.exitCode,text:r.stdout.toString()+r.stderr.toString()}; }
test("initializer normalizes names, creates only requested resources, refuses overwrite, and validator rejects unfinished output",()=> {
 const root=fixture(); const r=run("init_skill","My New Skill","--path",root,"--resources","references,references");
 expect(r.code).toBe(0); expect(r.text).toContain("Normalized"); expect(existsSync(join(root,"my-new-skill/references"))).toBe(true); expect(existsSync(join(root,"my-new-skill/scripts"))).toBe(false);
 expect(run("init_skill","my-new-skill","--path",root).code).toBe(1);
 expect(run("quick_validate",join(root,"my-new-skill")).text).toContain("TODO");
});

test("initializer validates flags and creates Bun examples",()=> {
 const root=fixture();
 for(const args of [["!!!","--path",root],["a".repeat(65),"--path",root],["ok","--path",root,"--examples"],["ok","--path",root,"--resources","unknown"],["ok","--path"],["ok","--path",root,"--bad"]]) expect(run("init_skill",...args).code).toBe(1);
 expect(run("init_skill","sample","--path",root,"--resources","scripts,references,assets","--examples").code).toBe(0);
 expect(readFileSync(join(root,"sample/scripts/example.ts"),"utf8")).toContain("sample");
 expect(existsSync(join(root,"sample/references/api_reference.md"))).toBe(true);
 expect(existsSync(join(root,"sample/assets/example_asset.txt"))).toBe(true);
});
test("validator accepts metadata, references and fenced examples",()=> {
 const root=join(fixture(),"sample"); mkdirSync(join(root,"references"),{recursive:true});
 writeFileSync(join(root,"references/detail.md"),"# Details\n");
 writeFileSync(join(root,"SKILL.md"),'---\nname: sample\ndescription: Handle sample requests.\nmetadata: {owner: me}\nglobs: ["*.ts"]\nallowed-tools: [read]\nhide: false\ncustom: value\n---\n# Sample\nRead [details](references/detail.md). [site](https://example.com).\n`[code](missing)`\n```md\n[ignored](missing)\n[TODO: example]\n```\n');
 expect(run("quick_validate",root)).toEqual({code:0,text:"Skill is valid!\n"});
});
test("validator reports all errors and skips dependency directories",()=> {
 const root=join(fixture(),"sample"); mkdirSync(join(root,"references"),{recursive:true}); mkdirSync(join(root,"node_modules"));
 writeFileSync(join(root,"node_modules/bad.md"),"[bad](missing)"); writeFileSync(join(root,"references/orphan.txt"),"orphan");
 writeFileSync(join(root,"SKILL.md"),'---\nname: Wrong\ndescription: "<bad>"\nhide: nope\nmetadata: []\nglobs: [1]\nallowed-tools: false\n---\n[TODO: unfinished]\n[bad](missing.md)\n');
 const r=run("quick_validate",root); expect(r.code).toBe(1);
 for(const text of ["lowercase","differs from folder","angle brackets","hide","metadata","globs","allowed-tools","unfinished TODO","missing.md","orphan.txt"]) expect(r.text).toContain(text);
 expect(r.text).not.toContain("node_modules");
});
test("validator rejects absent files, bad YAML, nonmapping frontmatter and empty body",()=> {
 const root=join(fixture(),"sample"); mkdirSync(root);
 expect(run("quick_validate",root).text).toContain("SKILL.md not found");
 for(const [content,expected] of [["no frontmatter","must start"],["---\nname: [\n---\nbody","Invalid YAML"],["---\n- item\n---\nbody","YAML mapping"],["---\nname: sample\ndescription: Valid.\n---\n<!-- comment -->","no instructions"],["---\nname: 1\ndescription: false\n---\nbody","must be a string"]]) { writeFileSync(join(root,"SKILL.md"),content); expect(run("quick_validate",root).text).toContain(expected); }
 expect(run("quick_validate").code).toBe(1);
});

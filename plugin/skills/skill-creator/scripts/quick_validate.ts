import { existsSync, readFileSync, readdirSync, statSync, realpathSync } from "node:fs";
import { join, dirname, relative, basename } from "node:path";
const args=process.argv.slice(2);
if(args.length!==1) { console.log("Usage: quick_validate.ts <skill_directory>"); process.exit(1); }
const root=args[0], errors:string[]=[];
function prose(text:string):[number,string][] { let marker="",length=0; const result:[number,string][]=[]; text.split(/\r?\n/).forEach((line,i)=> { const m=line.match(/^[ \t]*(?:(?:[-+*]|\d+[.)])[ \t]+)?(`{3,}|~{3,})(.*)$/); if(m) { if(!marker) { marker=m[1][0]; length=m[1].length; } else if(m[1][0]===marker && m[1].length>=length && !m[2].trim()) marker=""; } else if(!marker) result.push([i+1,line]); }); return result; }
function files(dir:string):string[] { return readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>e.isDirectory() ? ([".git","node_modules","__pycache__"].includes(e.name)?[]:files(join(dir,e.name))) : e.isFile()?[join(dir,e.name)]:[]); }
function validate() {
 const skill=join(root,"SKILL.md"); if(!existsSync(skill)) { errors.push("SKILL.md not found"); return; }
 const content=readFileSync(skill,"utf8"), match=content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
 if(!match) { errors.push("SKILL.md must start with YAML frontmatter delimited by '---' lines"); return; }
 let fm:Record<string,unknown>; try { fm=Bun.YAML.parse(match[1]) as Record<string,unknown>; } catch(e) { errors.push(`Invalid YAML in frontmatter: ${e}`); return; }
 if(!fm || typeof fm!=="object" || Array.isArray(fm)) { errors.push("Frontmatter must be a YAML mapping"); return; }
 const stringList=(v:unknown)=>Array.isArray(v)&&v.every(x=>typeof x==="string");
 for(const [key,type] of Object.entries({license:"string",metadata:"mapping","disable-model-invocation":"boolean",hide:"boolean",alwaysApply:"boolean","argument-hint":"string"})) if(key in fm && !(type==="mapping" ? fm[key]!==null && typeof fm[key]==="object" && !Array.isArray(fm[key]) : typeof fm[key]===type)) errors.push(`'${key}' must be a ${type}`);
 if("globs" in fm && !stringList(fm.globs)) errors.push("'globs' must be a list of strings");
 if("allowed-tools" in fm && typeof fm["allowed-tools"]!=="string" && !stringList(fm["allowed-tools"])) errors.push("'allowed-tools' must be a string or a list of strings");
 for(const key of ["name","description"]) if(!(key in fm)) errors.push(`Missing '${key}' in frontmatter`); else if(typeof fm[key]!=="string") errors.push(`'${key}' must be a string`);
 if(typeof fm.name==="string") { const name=fm.name.trim(); if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) errors.push(`Name '${name}' must use lowercase letters, digits, and single hyphens, starting and ending with a letter or digit`); if(name.length>64) errors.push(`Name is too long (${name.length} characters); shorten it to 64 or fewer`); const folder=basename(realpathSync(root)); if(name && name!==folder) errors.push(`Name '${name}' differs from folder '${folder}'; rename one to match`); }
 if(typeof fm.description==="string") { const d=fm.description.trim(); if(!d) errors.push("Description is empty; say what the skill does and when it applies"); if(d.startsWith("[TODO:")) errors.push("Description contains an unfinished TODO placeholder"); if(/[<>]/.test(d)) errors.push("Description cannot contain angle brackets (< or >)"); if(d.length>1024) errors.push(`Description is too long (${d.length} characters); shorten it to 1024 or fewer`); }
 const body=content.slice(match[0].length); if(!body.replace(/<!--[\s\S]*?-->/g,"").trim()) errors.push("SKILL.md has no instructions after the frontmatter"); if(prose(body).some(([,line])=>/^[ ]{0,3}\[TODO:[^\n]*\][ \t]*$/.test(line))) errors.push("Skill instructions contain an unfinished TODO placeholder");
 const all=files(root), markdown=all.filter(p=>p.endsWith(".md")), texts=new Map(markdown.map(p=>[p,readFileSync(p,"utf8")]));
 for(const [path,text] of texts) for(const [number,line] of prose(text)) { const clean=line.replace(/(`+)(?:(?!\1).)+?\1/g,""); const links=clean.matchAll(/!?\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+["'][^)]*["'])?\s*\)/g); for(const m of links) { const target=m[1].replace(/^<|>$/g,""); if(!target || target.startsWith("#") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(target)) continue; const dest=target.split("#")[0]; if(dest && !existsSync(join(dirname(path),dest))) errors.push(`${relative(root,path)}:${number}: link target '${target}' does not exist; fix the path or remove the link`); } }
 const refs=join(root,"references"); if(existsSync(refs)&&statSync(refs).isDirectory()) for(const ref of files(refs)) if(![...texts].some(([p,text])=>p!==ref && text.includes(basename(ref)))) errors.push(`${relative(root,ref)} is never mentioned; link it where it applies or delete it`);
}
try { validate(); } catch(e) { errors.push(`Cannot validate skill: ${e instanceof Error?e.message:String(e)}`); }
if(errors.length) { console.log(`Found ${errors.length} problem(s):`); for(const error of errors) console.log(`- ${error}`); process.exit(1); }
console.log("Skill is valid!");

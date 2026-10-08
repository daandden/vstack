import { mkdirSync, existsSync, writeFileSync, chmodSync } from "node:fs";
import { resolve, join } from "node:path";
function fail(message:string):never { console.error(`[ERROR] ${message}`); process.exit(1); }
const args=process.argv.slice(2);
const raw=args.shift();
if (!raw || raw.startsWith("--")) fail("Usage: init_skill.ts <skill-name> --path <path> [--resources scripts,references,assets] [--examples]");
let path="", resources="", examples=false;
while(args.length) { const flag=args.shift(); if(flag==="--examples") examples=true; else if(flag==="--path" || flag==="--resources") { const value=args.shift(); if(!value || value.startsWith("--")) fail(`Missing value for ${flag}`); if(flag==="--path") path=value; else resources=value; } else fail(`Unknown argument: ${flag}`); }
if(!path) fail("--path is required");
const name=raw.trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
if(!name) fail("Skill name must include at least one letter or digit.");
if(name.length>64) fail(`Skill name '${name}' is too long (${name.length} characters). Maximum is 64 characters.`);
if(name!==raw) console.log(`Note: Normalized skill name from '${raw}' to '${name}'.`);
const selected=[...new Set(resources.split(",").map(x=>x.trim()).filter(Boolean))];
const invalid=selected.filter(x=>!["scripts","references","assets"].includes(x)).sort();
if(invalid.length) fail(`Unknown resource type(s): ${invalid.join(", ")}. Allowed: assets, references, scripts`);
if(examples && !selected.length) fail("--examples requires --resources to be set.");
const dir=join(resolve(path),name);
if(existsSync(dir)) fail(`Skill directory already exists: ${dir}`);
const title=name.split("-").map(x=>x[0].toUpperCase()+x.slice(1)).join(" ");
try {
 mkdirSync(dir,{recursive:true}); console.log(`[OK] Created skill directory: ${dir}`);
 writeFileSync(join(dir,"SKILL.md"),`---\nname: ${name}\ndescription: "[TODO: Briefly describe what this skill does and when it applies.]"\n---\n\n# ${title}\n\n[TODO: Add the task-specific guidance the agent needs. Reference supporting files only when they are relevant.]\n`);
 console.log("[OK] Created SKILL.md");
 for(const resource of selected) { const sub=join(dir,resource); mkdirSync(sub); if(examples) {
 const file=resource==="scripts"?"example.ts":resource==="references"?"api_reference.md":"example_asset.txt";
 const content=resource==="scripts"?`// Example helper for ${name}. Replace with task-specific implementation or delete.\nconsole.log("Example helper for ${name}");\n`:`# Reference for ${title}\n\nReplace this example with maintained task-specific material, or delete it.\n`;
 writeFileSync(join(sub,file),content); if(resource==="scripts") chmodSync(join(sub,file),0o755); console.log(`[OK] Created ${resource}/${file}`);
 } else console.log(`[OK] Created ${resource}/`); }
 console.log(`\n[OK] Skill '${name}' initialized successfully at ${dir}\n\nNext steps:\n1. Edit SKILL.md to complete the TODO items and update the description\n2. Customize or delete example files; keep only resources the workflow needs\n3. Run the validator when ready to check the skill structure\n4. Consider independent forward-testing only when complexity or risk warrants it`);
} catch(error) { fail(`Error creating skill: ${error instanceof Error?error.message:String(error)}`); }

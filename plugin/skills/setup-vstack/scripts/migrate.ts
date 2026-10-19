import { readFileSync } from "node:fs";
import { applyProject, projectPlan, type Plan } from "./migration.ts";
function main() {
  const [cmd,...args]=process.argv.slice(2);
  let mode: "move" | "private" = "move", planPath: string | undefined;
  const skip: string[]=[];
  for(let i=0;i<args.length;i++) {
    const flag=args[i], value=args[++i];
    if(!value) throw new Error(`${flag} needs a value`);
    if(flag==="--mode" && (value==="move" || value==="private")) mode=value;
    else if(flag==="--plan") planPath=value;
    else if(flag==="--skip") skip.push(value);
    else throw new Error(`unknown option ${flag}`);
  }
  if(cmd==="cancel") { console.log(JSON.stringify({complete:false,applied:[],message:"Cancelled the whole project Migration; no changes."}));return 0; }
  if(cmd==="plan") { console.log(JSON.stringify(projectPlan(process.cwd(),mode),null,2));return 0; }
  if(cmd!=="apply" || !planPath) throw new Error("Usage: migrate.ts plan [--mode move|private] | apply --plan <approved JSON> [--skip <id>...] | cancel");
  const report=applyProject(JSON.parse(readFileSync(planPath,"utf8")) as Plan,process.cwd(),skip);
  console.log(JSON.stringify(report,null,2));return report.complete?0:1;
}
try { process.exit(main()); } catch(e) { console.error(e instanceof Error?e.message:String(e));process.exit(2); }

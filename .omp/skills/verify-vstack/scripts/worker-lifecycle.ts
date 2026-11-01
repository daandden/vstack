import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const [checkoutArg, runArg] = Bun.argv.slice(2);
if (!checkoutArg || !runArg) throw new Error("usage: bun worker-lifecycle.ts <checkout> <new verify run>");
const checkout = resolve(checkoutArg);
const run = resolve(runArg);
const evidence = join(run, "lifecycle");
const base = join(run, "data", "wt");
const home = join(run, "data", "home");
mkdirSync(evidence, { recursive: true });
const env = { PATH: process.env.PATH ?? "", HOME: home, TERM: "dumb" };
for (const [key, value] of [["task.isolation.enabled", "true"], ["worktree.base", base], ["async.enabled", "false"], ["eval.js", "true"], ["tools.approvalMode", "yolo"]]) {
  const configured = Bun.spawnSync(["omp", "config", "set", key!, value!], { env, stdout: "pipe", stderr: "pipe" });
  if (configured.exitCode !== 0) throw new Error(configured.stderr.toString());
}
const cli = join(checkout, "plugin/skills/vstack-fan-out/scripts/worker-clone.ts");
const shared = `Vstack root: ${checkout}. Scratch: ${run}. Write only in the tree this brief names. Do not change any other checkout. This is a disposable lifecycle fixture, not a product change.`;
type Reply = { tool: string; args: object } | { text: string };
const replies: Reply[] = [];
const cell = (code: string) => replies.push({ tool: "eval", args: { language: "js", code } });
const child = (path: string, content: string, questions: string[] = []) => {
  replies.push({ tool: "write", args: { path, content } });
  replies.push({ tool: "yield", args: { data: { changed_paths: [path], open_questions: questions } } });
};
const spawn = (name: string, task: string) => `await agent(${JSON.stringify(task + " " + shared)}, {agent:"vstack-worker", label:${JSON.stringify(name)}, isolated:true, apply:false, merge:false})`;
const merger = (role: string) => `
await tool.task({context:${JSON.stringify(shared)},tasks:[{name:"Land${role}",agent:"vstack-worker",solutionSpace:"One disposable patch landing with commit, paths supplied",task:${JSON.stringify(`Act as implement-spec's merger. Read ${join(evidence, role + "-handoff.json")}. Apply only its patch with git apply --3way, verify lifecycle.txt equals its expected value, then commit. Return the SHA. This fixture repository has no build step. ` + shared)}}]});`;
const mergeCell = (role: string) => {
  cell(`var h = JSON.parse(await Bun.file(${JSON.stringify(join(evidence, role + "-handoff.json"))}).text());
var applied = Bun.spawnSync(["git","apply","--3way","--",h.patch],{cwd:h.repo,stdout:"pipe",stderr:"pipe"});
if(applied.exitCode) throw new Error(applied.stderr.toString());
if(await Bun.file(h.repo+"/lifecycle.txt").text()!==h.expected) throw new Error("landed contents differ");
var committed = Bun.spawnSync(["git","commit","-qm",${JSON.stringify("Land " + role + " lifecycle fixture")}],{cwd:h.repo,stdout:"pipe",stderr:"pipe"});
if(committed.exitCode) throw new Error(committed.stderr.toString());`);
  replies.push({ text: `Landed ${role} after verifying its committed contents.` });
};
cell(`var fs = await import("node:fs");
var path = await import("node:path");
var E=${JSON.stringify(evidence)}, WT=${JSON.stringify(base)}, CLI=${JSON.stringify(cli)};
var repo = process.cwd();
function cmd(a){var r=Bun.spawnSync(a,{cwd:repo,stdout:"pipe",stderr:"pipe"});if(r.exitCode)throw new Error(a.join(" ")+": "+r.stderr);return r.stdout.toString();}
function save(n,data){fs.writeFileSync(E+"/"+n+".json",JSON.stringify(data,null,2));}
function check(ok,msg){if(!ok)throw new Error(msg);}
function patchOf(result){var text=typeof result==="string"?result:JSON.stringify(result);var m=text.match(/Isolation: changes captured at \\x60?([^\\x60\\n]+?)\\x60? \\(apply=false\\)\\. Not applied\\./);check(m,"missing omp patch notice: "+text);check(fs.statSync(m[1]).size>0,"empty patch");return m[1];}
function status(id,name){var r=Bun.spawnSync(["bun",CLI,"status",id],{cwd:repo,env:{...process.env,OMP_WORKTREE_DIR:WT},stdout:"pipe",stderr:"pipe"});save(name,{exit:r.exitCode,stdout:r.stdout.toString(),stderr:r.stderr.toString()});check(r.exitCode===0,"status command failed: "+r.stderr);return JSON.parse(r.stdout.toString()).workers[0];}
function handoff(role,result,expected){var p=patchOf(result);fs.copyFileSync(p,E+"/"+role+".patch");save(role+"-completion",{result,patch:p});save(role+"-handoff",{patch:p,repo,expected});return p;}
cmd(["git","init","-q"]);cmd(["git","config","user.name","Verify"]);cmd(["git","config","user.email","verify@example.invalid"]);
fs.writeFileSync(repo+"/lifecycle.txt","base\\n");cmd(["git","add","lifecycle.txt"]);cmd(["git","commit","-qm","Fixture baseline"]);
var start=cmd(["git","rev-parse","HEAD"]).trim();
var protectedWorker=${spawn("Keep323", "Keep useful-unlanded.txt as unlanded useful work. Return an unresolved external dependency. Do not commit.")};
var protectedResult=await protectedWorker.wait();`);
child("useful-unlanded.txt", "preserve this unfinished work\n", ["External dependency remains unresolved"]);
cell(`var protectedPatch=handoff("protected",protectedResult,"");var protectedState=status(protectedWorker.id,"protected-retained");check(protectedState.state==="present","protected worker missing");
save("early-stop-retained",{id:protectedWorker.id,outcome:"retained",reason:"early stop: external dependency unresolved",patch:protectedPatch,preserved:E+"/protected.patch",state:protectedState});
var implementer=${spawn("Impl323", "Change lifecycle.txt from base to implemented. Return its patch without committing. No questions.")};
var implResult=await implementer.wait();`);
child("lifecycle.txt", "implemented\n");
cell(`var implPatch=handoff("implementer",implResult,"implemented\\n");var implBefore=status(implementer.id,"implementer-before");check(implBefore.state==="present","implementer not located before release");${merger("implementer")}`);
mergeCell("implementer");
cell(`var implCommit=cmd(["git","rev-parse","HEAD"]).trim();check(cmd(["git","show","HEAD:lifecycle.txt"])==="implemented\\n","implementation commit missing");
var implHash=Bun.hash(fs.readFileSync(implPatch)).toString(16);
var implRelease=await tool.write({path:"proc://"+implementer.id+"/kill"});
var implAfter=status(implementer.id,"implementer-after");check(implAfter.state==="absent","implementer survived release");check(!fs.existsSync(implBefore.clone),"implementer clone survives on disk");check(Bun.hash(fs.readFileSync(implPatch)).toString(16)===implHash,"implementation patch changed");
check(status(protectedWorker.id,"protected-after-implementer").state==="present","unrelated owned work was removed");
save("implementer-release",{id:implementer.id,commit:implCommit,release:implRelease,before:implBefore,after:implAfter,patch:implPatch,patch_hash:implHash,parent_alive:true});
var fixer=${spawn("Fix323", "Review fixer: change lifecycle.txt to reviewed. Return question: accept reviewed wording? Keep the worker available until that question is settled.")};
var fixerResult=await fixer.wait();`);
child("lifecycle.txt", "reviewed\n", ["Accept reviewed wording?"]);
cell(`var fixerPatch=handoff("fixer",fixerResult,"reviewed\\n");var fixerBefore=status(fixer.id,"fixer-held");check(fixerBefore.state==="present","fixer was not retained");check(cmd(["git","show","HEAD:lifecycle.txt"])==="implemented\\n","held fixer patch landed too soon");
save("fixer-question",{id:fixer.id,outcome:"retained",reason:"unanswered question: accept reviewed wording?",patch:fixerPatch,state:fixerBefore,parent_alive:true});`);
replies.push({ text: "The review fixer stays retained with its question unresolved. Awaiting the fixture answer." });
cell(`var fixtureAnswer="Accept reviewed wording";
save("fixer-answer",{answer:fixtureAnswer,source:"scripted fixture answer, not maintainer authorization",state:"resolved"});${merger("fixer")}`);
mergeCell("fixer");
cell(`var fixCommit=cmd(["git","rev-parse","HEAD"]).trim();check(cmd(["git","show","HEAD:lifecycle.txt"])==="reviewed\\n","fixer commit missing");
var fixRelease=await tool.write({path:"proc://"+fixer.id+"/kill"});
var fixerAfter=status(fixer.id,"fixer-after");check(fixerAfter.state==="absent","fixer survived release");check(!fs.existsSync(fixerBefore.clone),"fixer clone survives on disk");
check(status(protectedWorker.id,"protected-after-fixer").state==="present","unrelated retained worker was deleted");
check(fs.existsSync(fixerPatch)&&fs.existsSync(E+"/fixer.patch"),"fixer patch evidence missing");
save("fixer-release",{id:fixer.id,commit:fixCommit,release:fixRelease,before:fixerBefore,after:fixerAfter,patch:fixerPatch,parent_alive:true});
var protectedRelease=await tool.write({path:"proc://"+protectedWorker.id+"/kill"});
var protectedAfter=status(protectedWorker.id,"protected-after-preservation");check(protectedAfter.state==="absent","protected worker not released after preserving useful work");
check(fs.readFileSync(E+"/protected.patch","utf8").includes("preserve this unfinished work"),"useful early-stop work lost");
check(cmd(["git","show",implCommit+":lifecycle.txt"])==="implemented\\n","integration commit disappeared");
check(fs.readFileSync(implPatch).length>0&&fs.existsSync(E+"/implementer.patch"),"implementation patch evidence missing");
var listing=cmd(["omp","worktree","list","--json"]);save("final-listing",JSON.parse(listing));
save("passed",{implementer:implCommit,review_fixer:fixCommit,retained_then_released:true,early_stop:"retained with useful patch preserved",all_probe_clones_removed:true,parent_alive:true,protected_release:protectedRelease,repo});
print("LIFECYCLE_PROOF_PASSED "+E);`);
replies.push({ text: "Lifecycle proof complete. Implementer and review fixer removed while this parent is alive; early-stop work is preserved." });
const repliesPath = join(run, "worker-lifecycle-replies.json");
writeFileSync(repliesPath, JSON.stringify(replies, null, 2));
const driver = join(import.meta.dir, "drive.ts");
const driven = Bun.spawnSync([process.execPath, driver, "--plugin", join(checkout, "plugin"), "--run", run, "--name", "worker-lifecycle", "--session", "--replies", repliesPath,
  JSON.stringify({ type: "prompt", message: "/skill:implement-spec Disposable lifecycle fixture. Follow the supplied scripted tool actions." }),
  JSON.stringify({ type: "prompt", message: "Fixture answer: accept reviewed wording. Land the held fix and release the no-longer-needed workers." }),
  JSON.stringify({ type: "get_state" })], { stdout: "pipe", stderr: "pipe" });
writeFileSync(join(run, "worker-lifecycle-drive.json"), JSON.stringify({ exit: driven.exitCode, stdout: driven.stdout.toString(), stderr: driven.stderr.toString() }, null, 2));
if (driven.exitCode !== 0) throw new Error(driven.stderr.toString());
const proof = JSON.parse(readFileSync(join(evidence, "passed.json"), "utf8"));
console.log(JSON.stringify({ lifecycle: "passed", proof, evidence }));

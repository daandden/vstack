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
mkdirSync(home, { recursive: true });
const env = { PATH: process.env.PATH ?? "", HOME: home, TERM: "dumb" };
const ovnfs = Bun.which("ovnfs");
if (!ovnfs) throw new Error("ovnfs is required. Run /skill:setup-vstack.");
const statusArgs = [ovnfs, "--json", "status"];
const statusReply = Bun.spawnSync(statusArgs, { stdout: "pipe", stderr: "pipe" });
if (statusReply.exitCode !== 0) throw new Error(`ovnfs status failed: ${statusReply.stderr.toString().trim() || statusReply.stdout.toString().trim()}`);
const { state, mount } = JSON.parse(statusReply.stdout.toString());
if (typeof state !== "string" || !state || typeof mount !== "string" || !mount) throw new Error("ovnfs --json status must return state and mount paths.");
const namespace = { OVNFS_STATE: state, OVNFS_MOUNT: mount };
writeFileSync(join(evidence, "ovnfs-status.json"), JSON.stringify({ command: statusArgs, exit: statusReply.exitCode, state, mount }, null, 2));
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const ovnfsWrapper = join(run, "data", "ovnfs");
writeFileSync(ovnfsWrapper, `#!/bin/sh\nexport OVNFS_STATE=${quote(state)}\nexport OVNFS_MOUNT=${quote(mount)}\nexec ${quote(ovnfs)} "$@"\n`, { mode: 0o755 });
for (const [key, value] of [["task.isolation.enabled", "true"], ["isolation.backend", "auto"], ["ovnfs.path", ovnfsWrapper], ["worktree.base", base], ["async.enabled", "false"], ["eval.js", "true"], ["tools.approvalMode", "yolo"]]) {
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
  replies.push({ text: [`Changed ${path}.`, ...questions].join("\n") });
};
const leaveProcesses = (path: string, content: string) => {
  replies.push({ tool: "write", args: { path, content } });
  replies.push({ tool: "bash", args: { i: "Leaving a SIGHUP-ignoring process", command: `bun -e 'require("child_process").spawn("/usr/bin/nohup",[process.execPath,"-e","process.title=\\"vstack-verify-leftover\\";setTimeout(()=>{},600000)"],{detached:true,stdio:"ignore"}).unref()'` } });
  replies.push({ tool: "bash", args: { i: "Starting a named service", name: "lifecycle-svc", ready: { log: "lifecycle-svc-ready" }, command: `bun -e 'console.log("lifecycle-svc-ready");setTimeout(()=>{},600000)'` } });
  replies.push({ tool: "eval", args: { language: "js", code: "return process.pid;" } });
  replies.push({ text: `Changed ${path}. Left a SIGHUP-ignoring process, the lifecycle-svc service, and a JS eval kernel running.` });
};
// omp wakes the settled implementer when processes stops its named service; this reply answers that turn.
const SERVICE_ACK = "The parent stopped the lifecycle-svc fixture; nothing to do.";
const spawn = (name: string, task: string) => `await agent(${JSON.stringify(task + " " + shared)}, {agent:"vstack-worker", label:${JSON.stringify(name)}, isolated:true, apply:false, merge:false})`;
const merger = (role: string) => `
await tool.task({context:${JSON.stringify(shared)},tasks:[{name:"Land${role}",agent:"vstack-worker",solutionSpace:"One disposable patch landing with commit, paths supplied",task:${JSON.stringify(`Act as implement-spec's merger. Read ${join(evidence, role + "-handoff.json")}. Apply only its patch with git apply --3way, verify lifecycle.txt equals its expected value, then commit. Return the SHA. This fixture repository has no build step. ` + shared)}}]});`;
const mergeCell = (role: string) => {
  cell(`var h = JSON.parse(await Bun.file(${JSON.stringify(join(evidence, role + "-handoff.json"))}).text());
var applied = Bun.spawnSync(["git","apply","--3way","--",h.patch],{cwd:h.repo,stdout:"pipe",stderr:"pipe"});
if(applied.exitCode) throw new Error(applied.stderr.toString());
if(await Bun.file(h.repo+"/lifecycle.txt").text()!==h.expected) throw new Error("landed contents differ");
var branch = Bun.spawnSync(["git","symbolic-ref","-q","HEAD"],{cwd:h.repo,stdout:"pipe",stderr:"pipe"});
if(branch.exitCode || branch.stdout.toString().trim()!=="refs/heads/"+h.branch) throw new Error("fixture merger branch guard failed");
var committed = Bun.spawnSync(["git","commit","-qm",${JSON.stringify("Land " + role + " lifecycle fixture")}],{cwd:h.repo,stdout:"pipe",stderr:"pipe"});
if(committed.exitCode) throw new Error(committed.stderr.toString());
var newHead = Bun.spawnSync(["git","rev-parse","HEAD"],{cwd:h.repo,stdout:"pipe",stderr:"pipe"});
var branchTip = Bun.spawnSync(["git","rev-parse",h.branch],{cwd:h.repo,stdout:"pipe",stderr:"pipe"});
if(newHead.exitCode || branchTip.exitCode || newHead.stdout.toString()!==branchTip.stdout.toString()) throw new Error("fixture commit anchor mismatch");`);
  replies.push({ text: `Landed ${role} after verifying its committed contents.` });
};
cell(`var fs = await import("node:fs");
var path = await import("node:path");
var E=${JSON.stringify(evidence)}, WT=${JSON.stringify(base)}, CLI=${JSON.stringify(cli)}, OVNFS=${JSON.stringify(namespace)};
var repo = process.cwd();
function cmd(a){var r=Bun.spawnSync(a,{cwd:repo,stdout:"pipe",stderr:"pipe"});if(r.exitCode)throw new Error(a.join(" ")+": "+r.stderr);return r.stdout.toString();}
function save(n,data){fs.writeFileSync(E+"/"+n+".json",JSON.stringify(data,null,2));}
function check(ok,msg){if(!ok)throw new Error(msg);}
function patchOf(result){var text=typeof result==="string"?result:JSON.stringify(result);var m=text.match(/Isolation: changes captured at \\x60?([^\\x60\\n]+?)\\x60? \\(apply=false\\)\\. Not applied\\./);check(m,"missing omp patch notice: "+text);check(fs.statSync(m[1]).size>0,"empty patch");return m[1];}
function status(id,name,before){var r=Bun.spawnSync(["bun",CLI,"status",id,...(before?["--before",E+"/"+before+".status.json"]:[])],{cwd:repo,env:{...process.env,OMP_WORKTREE_DIR:WT,...OVNFS},stdout:"pipe",stderr:"pipe"});save(name,{exit:r.exitCode,stdout:r.stdout.toString(),stderr:r.stderr.toString()});check(r.exitCode===0,"status command failed: "+r.stderr);var parsed=JSON.parse(r.stdout.toString());save(name+".status",parsed);return parsed.workers[0];}
var q=${quote.toString()};
function alive(c){var started=String(c.started||"");check(started,"candidate has no start identity: "+c.pid);if(process.platform==="linux"){var stat;try{stat=fs.readFileSync("/proc/"+c.pid+"/stat","utf8");}catch(e){check(e.code==="ENOENT"||e.code==="ESRCH","stat probe failed for "+c.pid+": "+e.code);return false;}return stat.slice(stat.lastIndexOf(")")+2).split(" ")[19]===started;}var r=Bun.spawnSync(["ps","-o","lstart=","-p",String(c.pid)],{stdout:"pipe",stderr:"pipe"});var out=r.stdout.toString().trim(),err=r.stderr.toString().trim();if(r.exitCode!==0){check(!out&&!err,"ps probe failed for "+c.pid+": "+err);return false;}var seconds=Date.parse(out)/1000;check(Number.isFinite(seconds),"unreadable start time for "+c.pid+": "+out);return seconds===Number(started.split(".")[0]);}
async function processes(id,name,before){var out=E+"/"+name+".json";var reply=await tool.bash({i:"Checking worker processes",cwd:repo,command:"bun "+q(CLI)+" processes "+q(id)+" --before "+q(E+"/"+before+".status.json")+" > "+q(out)+" 2> "+q(out+".stderr")+"; echo exit=$?"});save(name+"-reply",{reply});var replyText=(reply&&reply.text)||JSON.stringify(reply);check(replyText.indexOf("exit=0")>=0,"processes exited nonzero for "+id+": "+replyText);check(fs.existsSync(out)&&fs.statSync(out).size>0,"processes produced no output: "+JSON.stringify(reply));var worker=JSON.parse(fs.readFileSync(out,"utf8")).workers[0];check(worker.release==="proceed","processes held "+id+": "+worker.reason);return worker;}
function handoff(role,result,expected){var p=patchOf(result);fs.copyFileSync(p,E+"/"+role+".patch");save(role+"-completion",{result,patch:p});save(role+"-handoff",{patch:p,repo,expected,branch:"integration"});return p;}
cmd(["git","init","-q","-b","integration"]);cmd(["git","config","user.name","Verify"]);cmd(["git","config","user.email","verify@example.invalid"]);
fs.writeFileSync(repo+"/lifecycle.txt","base\\n");cmd(["git","add","lifecycle.txt"]);
check(cmd(["git","symbolic-ref","-q","HEAD"]).trim()==="refs/heads/integration","fixture baseline branch guard failed");
cmd(["git","commit","-qm","Fixture baseline"]);
var start=cmd(["git","rev-parse","integration"]).trim();
check(cmd(["git","rev-parse","HEAD"]).trim()===start,"fixture baseline commit anchor mismatch");
var protectedWorker=${spawn("Keep323", "Keep useful-unlanded.txt as unlanded useful work. Return an unresolved external dependency. Do not commit.")};
var protectedResult=await protectedWorker.wait();`);
child("useful-unlanded.txt", "preserve this unfinished work\n", ["External dependency remains unresolved"]);
cell(`var protectedPatch=handoff("protected",protectedResult,"");var protectedState=status(protectedWorker.id,"protected-retained");check(protectedState.state==="present","protected worker missing");
save("early-stop-retained",{id:protectedWorker.id,outcome:"retained",reason:"early stop: external dependency unresolved",patch:protectedPatch,preserved:E+"/protected.patch",state:protectedState});
var implementer=${spawn("Impl323", "Change lifecycle.txt from base to implemented. Then leave a SIGHUP-ignoring background process and a named service running in your checkout, as a leftover-process fixture. Return its patch without committing. No questions.")};
var implResult=await implementer.wait();`);
leaveProcesses("lifecycle.txt", "implemented\n");
cell(`var implPatch=handoff("implementer",implResult,"implemented\\n");var implBefore=status(implementer.id,"implementer-before");check(implBefore.state==="present","implementer not located before release");${merger("implementer")}`);
mergeCell("implementer");
cell(`var implCommit=cmd(["git","rev-parse","integration"]).trim();check(cmd(["git","show","integration:lifecycle.txt"])==="implemented\\n","implementation commit missing");
var implProcs=await processes(implementer.id,"implementer-processes","implementer-before");
var managed=implProcs.candidates.filter(c=>c.owner==="omp");
var stopped=implProcs.candidates.filter(c=>c.owner!=="omp");
var leftover=stopped.filter(c=>/vstack-verify-leftover/.test(c.command||""));
var wrapper=stopped.filter(c=>/__omp_worker_shell_process/.test(c.command||"")&&/lifecycle-svc/.test(c.command||""));
var serviceChild=stopped.filter(c=>wrapper.some(w=>w.pid===c.ppid)&&/lifecycle-svc-ready/.test(c.command||""));
check(implProcs.session&&implProcs.candidates.length===4&&leftover.length===1&&wrapper.length===1&&serviceChild.length===1&&new Set([...leftover,...wrapper,...serviceChild].map(c=>c.pid)).size===3,"expected exactly one detached leftover, one service wrapper with its child, and one eval kernel: "+JSON.stringify(implProcs.candidates));
check(managed.length===1&&/__omp_worker_js_eval_process/.test(managed[0].command||"")&&managed[0].outcome==="omp-managed"&&managed[0].service===false&&alive(managed[0]),"expected the worker's JS eval kernel as a live omp-managed candidate: "+JSON.stringify(managed));
check(stopped.every(c=>c.owner==="worker"&&c.service===false&&(c.outcome==="terminated"||c.outcome==="killed")),"a leftover was not proven and stopped: "+JSON.stringify(stopped));
check(stopped.every(c=>!alive(c)),"a stopped leftover is still alive");
var parentSession=(await tool.bash({i:"Reading the parent session file",command:"printf %s \\"$PI_SESSION_FILE\\""})).text.trim();check(parentSession.endsWith(".jsonl"),"parent session file unknown: "+parentSession);
var implSession=parentSession.slice(0,-".jsonl".length)+"/"+implementer.id+".jsonl";
for(var waited=0;!(fs.existsSync(implSession)&&fs.readFileSync(implSession,"utf8").includes(${JSON.stringify(SERVICE_ACK)}));waited+=200){check(waited<60000,"implementer was not woken by its stopped service");await Bun.sleep(200);}
var implRecheck=await processes(implementer.id,"implementer-processes-recheck","implementer-before");check(implRecheck.candidates.every(c=>c.owner==="omp"&&c.outcome==="omp-managed"),"implementer has non-omp candidates after its wake: "+JSON.stringify(implRecheck.candidates));
save("implementer-service-wake",{session:implSession,acknowledged:true,recheck:implRecheck});`);
replies.push({ text: SERVICE_ACK });
cell(`var implHash=Bun.hash(fs.readFileSync(implPatch)).toString(16);
var implRelease=await tool.write({path:"proc://"+implementer.id+"/kill",content:""});
save("implementer-release-reply",{id:implementer.id,release:implRelease});
var implAfter=status(implementer.id,"implementer-after","implementer-before");check(implAfter.state==="absent","implementer survived release");check(Bun.hash(fs.readFileSync(implPatch)).toString(16)===implHash,"implementation patch changed");
for(var waitedGone=0;implProcs.candidates.some(c=>alive(c));waitedGone+=200){check(waitedGone<10000,"a candidate outlived release: "+JSON.stringify(implProcs.candidates.filter(c=>alive(c))));await Bun.sleep(200);}
check(status(protectedWorker.id,"protected-after-implementer").state==="present","unrelated owned work was removed");
save("implementer-release",{id:implementer.id,commit:implCommit,release:implRelease,before:implBefore,processes:implProcs,after:implAfter,patch:implPatch,patch_hash:implHash,parent_alive:true});
var fixer=${spawn("Fix323", "Review fixer: change lifecycle.txt to reviewed. Return question: accept reviewed wording? Keep the worker available until that question is settled.")};
var fixerResult=await fixer.wait();`);
child("lifecycle.txt", "reviewed\n", ["Accept reviewed wording?"]);
cell(`var fixerPatch=handoff("fixer",fixerResult,"reviewed\\n");var fixerBefore=status(fixer.id,"fixer-held");check(fixerBefore.state==="present","fixer was not retained");check(cmd(["git","show","HEAD:lifecycle.txt"])==="implemented\\n","held fixer patch landed too soon");
save("fixer-question",{id:fixer.id,outcome:"retained",reason:"unanswered question: accept reviewed wording?",patch:fixerPatch,state:fixerBefore,parent_alive:true});`);
replies.push({ text: "The review fixer stays retained with its question unresolved. Awaiting the fixture answer." });
cell(`var fixtureAnswer="Accept reviewed wording";
save("fixer-answer",{answer:fixtureAnswer,source:"scripted fixture answer, not maintainer authorization",state:"resolved"});${merger("fixer")}`);
mergeCell("fixer");
cell(`var fixCommit=cmd(["git","rev-parse","integration"]).trim();check(cmd(["git","show","integration:lifecycle.txt"])==="reviewed\\n","fixer commit missing");
var fixProcs=await processes(fixer.id,"fixer-processes","fixer-held");check(fixProcs.candidates.length===0,"fixer left processes: "+JSON.stringify(fixProcs.candidates));
var fixRelease=await tool.write({path:"proc://"+fixer.id+"/kill",content:""});
save("fixer-release-reply",{id:fixer.id,release:fixRelease});
var fixerAfter=status(fixer.id,"fixer-after","fixer-held");check(fixerAfter.state==="absent","fixer survived release");
check(status(protectedWorker.id,"protected-after-fixer").state==="present","unrelated retained worker was deleted");
check(fs.existsSync(fixerPatch)&&fs.existsSync(E+"/fixer.patch"),"fixer patch evidence missing");
save("fixer-release",{id:fixer.id,commit:fixCommit,release:fixRelease,before:fixerBefore,processes:fixProcs,after:fixerAfter,patch:fixerPatch,parent_alive:true});
var protectedProcs=await processes(protectedWorker.id,"protected-processes","protected-retained");check(protectedProcs.candidates.length===0,"protected worker left processes: "+JSON.stringify(protectedProcs.candidates));
var protectedRelease=await tool.write({path:"proc://"+protectedWorker.id+"/kill",content:""});
save("protected-release-reply",{id:protectedWorker.id,release:protectedRelease});
var protectedAfter=status(protectedWorker.id,"protected-after-preservation","protected-retained");check(protectedAfter.state==="absent","protected worker not released after preserving useful work");
check(fs.readFileSync(E+"/protected.patch","utf8").includes("preserve this unfinished work"),"useful early-stop work lost");
check(cmd(["git","show",implCommit+":lifecycle.txt"])==="implemented\\n","integration commit disappeared");
check(fs.readFileSync(implPatch).length>0&&fs.existsSync(E+"/implementer.patch"),"implementation patch evidence missing");
var listing=cmd([${JSON.stringify(ovnfsWrapper)},"--json","ls"]);save("final-listing",JSON.parse(listing));
save("passed",{implementer:implCommit,review_fixer:fixCommit,retained_then_released:true,early_stop:"retained with useful patch preserved",all_probe_clones_removed:true,parent_alive:true,leftover_processes_stopped:implProcs.candidates.map(c=>({pid:c.pid,command:c.command,outcome:c.outcome})),protected_release:protectedRelease,repo});
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

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
const USAGE = "Usage: trigger-evals.ts <queries.json> <run dir> [--candidate <workspace>/candidate/<name>] [--skills-dir <dir>]... [--runs 3] [--full] [--session-file <file>] [--omp <path>]";
const SELECTION = "This is a selection-only evaluation. Read SKILL.md for every skill that applies to this request, then stop before acting on the request. Do not inspect project inputs, create a plan, perform the workflow, or read follow-on references. If asked a question, take the recommended answer and state it. Do not change any files.";
function fail(message: string): never { console.error(`[ERROR] ${message}`); process.exit(1); }
type Query = { id: string; split: "train" | "test"; request: string; expected: Record<string, boolean> };

const args = process.argv.slice(2), positional: string[] = [], skillsDirs: string[] = [];
let runsPerQuery = 3, sessionFile = process.env.PI_SESSION_FILE ?? "", omp = "omp", candidate = "", full = false;
while (args.length) {
  const arg = args.shift()!;
  if (!arg.startsWith("--")) { positional.push(arg); continue; }
  if (arg === "--full") { full = true; continue; }
  const value = args.shift();
  if (!value || value.startsWith("--")) fail(`Missing value for ${arg}`);
  if (arg === "--candidate") candidate = resolve(value);
  else if (arg === "--skills-dir") skillsDirs.push(resolve(value));
  else if (arg === "--runs") runsPerQuery = Number(value);
  else if (arg === "--session-file") sessionFile = value;
  else if (arg === "--omp") omp = value;
  else fail(`Unknown argument: ${arg}\n${USAGE}`);
}
if (positional.length !== 2) fail(USAGE);
const queries: Query[] = JSON.parse(readFileSync(positional[0], "utf8"));
const ids = new Set<string>();
for (const { id } of queries) {
  if (typeof id !== "string" || !/^[a-z0-9-]+$/.test(id)) fail(`Query id ${JSON.stringify(id)} must use only lowercase letters, digits, and hyphens`);
  if (ids.has(id)) fail(`Duplicate query id ${JSON.stringify(id)}`);
  ids.add(id);
}
const runDir = resolve(positional[1]);
if (existsSync(runDir)) fail(`Run dir ${runDir} already exists; use a new iteration-<N>`);

if (!sessionFile) fail("Missing prerequisite: PI_SESSION_FILE is unset; pass --session-file");
if (!existsSync(sessionFile)) fail(`Missing prerequisite: session file ${sessionFile} does not exist; set PI_SESSION_FILE or pass --session-file`);
let model = "", thinking = "";
for (const line of readFileSync(sessionFile, "utf8").split("\n")) {
  let record;
  try { record = JSON.parse(line); } catch { continue; }
  if (record.type === "model_change") model = record.model;
  if (record.type === "thinking_level_change") thinking = record.thinkingLevel;
}
if (!model) fail(`Missing prerequisite: no model_change record in ${sessionFile}`);
if (!thinking) fail(`Missing prerequisite: no thinking_level_change record in ${sessionFile}`);

if (candidate && !existsSync(join(candidate, "SKILL.md"))) fail(`Candidate ${candidate} has no SKILL.md; copy the complete skill to <workspace>/candidate/<name>/`);
const customDirectories = [...(candidate ? [dirname(candidate)] : []), ...skillsDirs];
const overlay = { memory: { backend: "off" }, skills: { ...(customDirectories.length && { customDirectories }), ...(candidate && { ignoredSkills: [`*/${basename(candidate)}`] }) } };
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("PI_") && !key.startsWith("OMP_")));
const runs = queries.flatMap((query) => Array.from({ length: runsPerQuery }, (_, i) => {
  const id = `${query.id}-run-${i + 1}`, dir = join(runDir, id), cwd = join(dir, "workspace");
  mkdirSync(cwd, { recursive: true });
  writeFileSync(join(dir, "trigger.yml"), `${JSON.stringify(overlay)}\n`);
  const argv = [omp, "-p", "--model", model, "--thinking", thinking, "--approval-mode", "yolo", "--cwd", cwd, "--session-dir", join(dir, "session"), "--config", join(dir, "trigger.yml"), full ? query.request : `${query.request}\n\n${SELECTION}`];
  return { id, query: query.id, run: i + 1, cwd, argv, dir };
}));
const processes: Bun.Subprocess[] = [];
for (const r of runs) {
  try { processes.push(Bun.spawn(r.argv, { cwd: r.cwd, env, stdin: "ignore", stdout: Bun.file(join(r.dir, "stdout.txt")), stderr: Bun.file(join(r.dir, "stderr.txt")) })); }
  catch (error) { for (const p of processes) p.kill(); fail(`Cannot start ${omp}: ${error instanceof Error ? error.message : String(error)}`); }
}
writeFileSync(join(runDir, "commands.json"), `${JSON.stringify(runs.map((r, i) => ({ id: r.id, query: r.query, run: r.run, argv: r.argv, cwd: r.cwd, pid: processes[i].pid })), null, 2)}\n`);
const exitCodes = await Promise.all(processes.map((p) => p.exited));

const tested = [...new Set(queries.flatMap((query) => Object.keys(query.expected)))];
function skillOf(path: string, cwd: string) {
  const uri = path.match(/^skill:\/\/([^/:]+)(?:\/SKILL\.md)?$/);
  if (uri) return uri[1];
  const file = resolve(cwd, path), name = basename(dirname(file));
  return basename(file) === "SKILL.md" && tested.includes(name) ? name : undefined;
}
type ToolCall = { name: string; arguments?: { path?: unknown } };
type StatusEvent = { op?: unknown; path?: unknown; error?: unknown; hasError?: unknown };
type ToolResult = { isError?: boolean; details?: { statusEvents?: StatusEvent[] } };
function readPaths(call: ToolCall, result: ToolResult): string[] {
  if (call.name === "read") return !result.isError && typeof call.arguments?.path === "string" ? [call.arguments.path] : [];
  if (call.name === "eval") return (result.details?.statusEvents ?? []).flatMap((e) => e.op === "read" && typeof e.path === "string" && !e.error && !e.hasError ? [e.path] : []);
  return [];
}
type Load = { skill: string; session: string; call_line: number; result_line: number };
const results = runs.map((r, i) => {
  const sessionDir = join(r.dir, "session"), loaded: Load[] = [];
  const files = existsSync(sessionDir) ? readdirSync(sessionDir).filter((file) => file.endsWith(".jsonl")).sort() : [];
  for (const file of files) {
    const session = join(sessionDir, file), calls = new Map<string, { line: number; call: ToolCall }>();
    readFileSync(session, "utf8").split("\n").forEach((line, n) => {
      let message;
      try { message = JSON.parse(line).message; } catch { return; }
      if (message?.role === "assistant") for (const c of message.content ?? []) if (c.type === "toolCall") calls.set(c.id, { line: n + 1, call: c });
      const call = message?.role === "toolResult" ? calls.get(message.toolCallId) : undefined;
      if (!call) return;
      for (const skill of readPaths(call.call, message).flatMap((p) => skillOf(p, r.cwd) ?? [])) if (!loaded.some((l) => l.skill === skill)) loaded.push({ skill, session, call_line: call.line, result_line: n + 1 });
    });
  }
  return { id: r.id, query: r.query, run: r.run, exit_code: exitCodes[i], loaded };
});

const tally = () => ({ correct: 0, trials: 0 });
const scores = Object.fromEntries(tested.map((skill) => {
  const score = { all: tally(), train: tally(), test: tally() };
  for (const result of results) {
    const query = queries.find((q) => q.id === result.query)!;
    if ((!full && result.exit_code !== 0) || !(skill in query.expected)) continue;
    const correct = result.loaded.some((l) => l.skill === skill) === query.expected[skill];
    for (const key of ["all", query.split] as const) { score[key].trials++; if (correct) score[key].correct++; }
  }
  return [skill, score];
}));
writeFileSync(join(runDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
writeFileSync(join(runDir, "scores.json"), `${JSON.stringify(scores, null, 2)}\n`);
console.log(JSON.stringify(scores, null, 2));

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name: string) => args[args.indexOf(name) + 1]!;
const env = process.env;
if (env.STUB_OMP_LOG) appendFileSync(env.STUB_OMP_LOG, `${JSON.stringify({ args, env, cwd: process.cwd(), pid: process.pid })}\n`);

if (env.STUB_OMP_BARRIER) {
  mkdirSync(env.STUB_OMP_BARRIER, { recursive: true });
  writeFileSync(join(env.STUB_OMP_BARRIER, String(process.pid)), "");
  const deadline = Date.now() + 10_000;
  while (readdirSync(env.STUB_OMP_BARRIER).length < Number(env.STUB_OMP_EXPECT)) {
    if (Date.now() > deadline) { console.error("stub omp: the other runs never started"); process.exit(3); }
    Bun.sleepSync(20);
  }
}

const prompt = args.at(-1)!;
const transcripts: Record<string, unknown[]> = env.STUB_OMP_TRANSCRIPTS && existsSync(env.STUB_OMP_TRANSCRIPTS) ? JSON.parse(readFileSync(env.STUB_OMP_TRANSCRIPTS, "utf8")) : {};
const entries = Object.entries(transcripts).find(([request]) => prompt.startsWith(request))?.[1] ?? [];
const lines = [{ type: "session", version: 3, id: "stub", cwd: flag("--cwd") }, ...entries];
mkdirSync(flag("--session-dir"), { recursive: true });
writeFileSync(join(flag("--session-dir"), "session.jsonl"), lines.map((line) => JSON.stringify(line)).join("\n") + "\n");
if (env.STUB_OMP_FAIL && flag("--session-dir").includes(env.STUB_OMP_FAIL)) process.exit(7);

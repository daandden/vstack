// Checks the Grilling page visual judge against visual-judge-cases.json with the live jev judge.
//
//   TYPESAFE_API_KEY=<key> bun scripts/visual-judge-check.ts
//
// Get the key with `omp token typesafe`. Each case sends its question state with the rubric in
// plugin/skills/grilling-page/references/visual-judge.json, the same rubric the skill's helper uses.
// A case passes when the top label is expected or allowed. Under 0.7 confidence the agent adds no
// visual, so a case whose expected or allowed labels include none also passes then.
// Exit 0 when every case passes, 1 when a case misses, 2 on a missing key or a bad response.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const root = join(import.meta.dir, "..");
const readJson = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));

type Case = { id: string; expected: string; allowed?: string[]; state: unknown };
const { rubric: rubricPath, cases } = readJson("visual-judge-cases.json") as { rubric: string; cases: Case[] };
const rubric = readJson(rubricPath) as { instructions: string; threshold: number; labels: Record<string, { criterion: string }> };
const THRESHOLD = rubric.threshold;
const questions = {
  visual: { type: "choice", instructions: rubric.instructions, criteria: Object.fromEntries(Object.entries(rubric.labels).map(([label, l]) => [label, l.criterion])) },
};

const key = process.env.TYPESAFE_API_KEY ?? "";
if (!key) {
  process.stderr.write("visual-judge-check.ts needs TYPESAFE_API_KEY. Run: TYPESAFE_API_KEY=$(omp token typesafe) bun scripts/visual-judge-check.ts\n");
  process.exit(2);
}

const misses: string[] = [];
const low: string[] = [];
for (const c of cases) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "jev-latest", state: c.state, questions }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    process.stderr.write(`case ${c.id}: HTTP ${response.status} ${await response.text()}\n`);
    process.exit(2);
  }
  const answer = (await response.json()).answers?.visual;
  const choice: unknown = answer?.choice;
  const confidence: unknown = answer?.confidence;
  if (typeof choice !== "string" || !(choice in rubric.labels) || typeof confidence !== "number") {
    process.stderr.write(`case ${c.id}: invalid answer ${JSON.stringify(answer)}\n`);
    process.exit(2);
  }
  const ok = [c.expected, ...(c.allowed ?? [])];
  const line = `${c.id}: ${choice} at ${confidence.toFixed(2)}, expected ${ok.join(" or ")}`;
  if (!ok.includes(choice) && !(confidence < THRESHOLD && ok.includes("none"))) misses.push(line);
  if (confidence < THRESHOLD) low.push(line);
}

for (const line of misses) process.stdout.write(`MISS ${line}\n`);
for (const line of low) process.stdout.write(`UNDER ${THRESHOLD} ${line}\n`);
process.stdout.write(`${cases.length - misses.length}/${cases.length} cases pass, ${low.length} under ${THRESHOLD}\n`);
process.exit(misses.length ? 1 : 0);

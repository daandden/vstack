// Checks the Grilling page visual judge against visual-judge-cases.json with the live jev judge.
//
//   TYPESAFE_API_KEY=<key> bun scripts/visual-judge-check.ts
//
// Get the key with `omp token typesafe`. It sends the questions that grilling-page's helper sends,
// built from plugin/skills/grilling-page/references/visual-judge.json and diagram-design's visual-type guide.
// A diagram case passes when each kind's yes probability is at or over its threshold exactly when the
// case labels that kind true. A type case passes when expected or an allowed type is in the judge's top types.
// Exit 0 when every case passes, 1 when a case misses, 2 on a missing key or a bad response.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const root = join(import.meta.dir, "..");
const readJson = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));

type Kind = { question: string; true: string; false: string; threshold: number; shows: string };
type Rubric = { instructions: string; diagrams: Record<string, Kind>; types: { instructions: string; guide: string; top: number } };
type DiagramCase = { id: string; state: unknown } & Record<string, unknown>;
type TypeCase = { id: string; expected: string; allowed: string[]; state: unknown };

const file = readJson("visual-judge-cases.json") as { rubric: string; diagram_cases: DiagramCase[]; type_cases: TypeCase[] };
const rubric = readJson(file.rubric) as Rubric;
const guide = readFileSync(join(root, dirname(dirname(file.rubric)), rubric.types.guide), "utf8");
const types = Object.fromEntries([...guide.matchAll(/^\| (.+?) \| \*\*(.+?)\*\* \| \[type-[\w-]+\.md\]/gm)].map((m) => [m[2], m[1]]));
if (!Object.keys(types).length) {
  process.stderr.write(`no visual-type rows found in ${rubric.types.guide}\n`);
  process.exit(2);
}

const key = process.env.TYPESAFE_API_KEY ?? "";
if (!key) {
  process.stderr.write("visual-judge-check.ts needs TYPESAFE_API_KEY. Run: TYPESAFE_API_KEY=$(omp token typesafe) bun scripts/visual-judge-check.ts\n");
  process.exit(2);
}

async function judge(id: string, state: unknown, questions: object): Promise<Record<string, any>> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "jev-latest", state, questions }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    process.stderr.write(`case ${id}: HTTP ${response.status} ${await response.text()}\n`);
    process.exit(2);
  }
  return (await response.json()).answers ?? {};
}

const misses: string[] = [];
// omp's judge() calls a yes-or-no question "bool"; the REST API names it "noul" and answers with { noul: P(yes) }.
const diagramQuestions = Object.fromEntries(
  Object.entries(rubric.diagrams).map(([kind, d]) => [kind, { type: "noul", instructions: `${rubric.instructions} ${d.question}`, criteria: { true: d.true, false: d.false } }]),
);
for (const c of file.diagram_cases) {
  const answers = await judge(c.id, c.state, diagramQuestions);
  for (const [kind, d] of Object.entries(rubric.diagrams)) {
    const p: unknown = answers[kind]?.noul;
    if (typeof p !== "number") {
      process.stderr.write(`case ${c.id}: invalid ${kind} answer ${JSON.stringify(answers[kind])}\n`);
      process.exit(2);
    }
    if (p >= d.threshold !== c[kind]) misses.push(`${c.id}: ${kind} diagram ${p.toFixed(2)} against threshold ${d.threshold}, expected ${c[kind] ? "yes" : "no"}`);
  }
}

const typeQuestion = { type: { type: "choice", instructions: rubric.types.instructions, criteria: types } };
for (const c of file.type_cases) {
  const probabilities: unknown = (await judge(c.id, c.state, typeQuestion)).type?.probabilities;
  if (!probabilities || typeof probabilities !== "object") {
    process.stderr.write(`case ${c.id}: invalid type answer\n`);
    process.exit(2);
  }
  const p = probabilities as Record<string, number>;
  const top = Object.keys(p).sort((a, b) => p[b] - p[a]).slice(0, rubric.types.top);
  const ok = [c.expected, ...c.allowed];
  if (!top.some((t) => ok.includes(t))) misses.push(`${c.id}: top ${top.join(", ")}, expected ${ok.join(" or ")}`);
}

const total = file.diagram_cases.length + file.type_cases.length;
for (const line of misses) process.stdout.write(`MISS ${line}\n`);
process.stdout.write(`${total - new Set(misses.map((m) => m.split(":")[0])).size}/${total} cases pass (${file.diagram_cases.length} diagram, ${file.type_cases.length} type)\n`);
process.exit(misses.length ? 1 : 0);

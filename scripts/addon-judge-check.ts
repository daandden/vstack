
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { preprocessTinyMessage } from "../plugin/extensions/prompt-cleaner";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const root = join(import.meta.dir, "..");
const readJson = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));
type Prompt = { id: string; prompt: string; restated?: boolean; expected: string[]; allowed?: string[] };
type Question = { type: "noul"; instructions: string; criteria: { true: string; false: string } };
type Result = { id: string; means: Record<string, number> };

const key = process.env.TYPESAFE_API_KEY ?? "";
if (!key) {
  process.stderr.write("addon-judge-check.ts needs TYPESAFE_API_KEY. Run: TYPESAFE_API_KEY=$(omp token typesafe) bun scripts/addon-judge-check.ts\n");
  process.exit(2);
}

try {
  const args = process.argv.slice(2);
  let runs = 1;
  let printMeans = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--print-means") printMeans = true;
    else if (args[i] === "--runs") {
      runs = Number(args[++i]);
      if (!Number.isSafeInteger(runs) || runs < 1) throw new Error("--runs needs a positive integer");
    } else throw new Error(`unknown option: ${args[i]}`);
  }
  const questions = readJson("addon-questions.json") as Record<string, Question>;
  const { prompts, threshold } = readJson("sample-prompts.json") as { prompts: Prompt[]; threshold: number };
  const names = Object.keys(questions);
  const flags: string[] = [];
  const borderline: string[] = [];
  const results: Result[] = [];
  const models = new Set<string>();
  let flaggedPrompts = 0;

  for (let start = 0; start < prompts.length; start += 4) {
    const batch = await Promise.all(prompts.slice(start, start + 4).map(async prompt => {
      const totals = Object.fromEntries(names.map(name => [name, 0]));
      for (let run = 0; run < runs; run++) {
        const response = await fetch(ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          // A restated sample holds a stored smol restatement, which the extension sends as it is, up to 10,000 characters (ADR 0021).
          body: JSON.stringify({ model: "jev-latest", state: { request: prompt.restated ? prompt.prompt.slice(0, 10_000) : preprocessTinyMessage(prompt.prompt) }, questions }),
          signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) throw new Error(`prompt ${prompt.id}: HTTP ${response.status} ${await response.text()}`);
        const body = await response.json();
        if (typeof body.model === "string") models.add(body.model);
        for (const name of names) {
          const answer = body.answers?.[name];
          const score: unknown = answer?.noul;
          if (answer?.type !== "noul" || typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 1) {
            throw new Error(`prompt ${prompt.id}: invalid answer ${name}: ${JSON.stringify(answer)}`);
          }
          totals[name]! += score;
        }
      }
      return { id: prompt.id, means: Object.fromEntries(names.map(name => [name, totals[name]! / runs])) };
    }));
    for (let i = 0; i < batch.length; i++) {
      const result = batch[i]!;
      const prompt = prompts[start + i]!;
      const before = flags.length;
      for (const name of names) {
        const score = result.means[name]!;
        const expected = prompt.expected.includes(name);
        const allowed = prompt.allowed?.includes(name) ?? false;
        const line = `${prompt.id}: ${name} at ${score.toFixed(3)}`;
        if (expected && score < 0.70) flags.push(`${line}, expected >= 0.70`);
        if (!expected && !allowed && score > 0.80) flags.push(`${line}, unexpected > 0.80`);
        if (score >= 0.70 && score <= 0.80) borderline.push(line);
      }
      if (flags.length > before) flaggedPrompts++;
      results.push(result);
    }
  }

  for (const line of flags) process.stdout.write(`FLAG ${line}\n`);
  for (const line of borderline) process.stdout.write(`BORDERLINE ${line}\n`);
  process.stdout.write(`${prompts.length - flaggedPrompts}/${prompts.length} prompts pass, ${flags.length} flags, ${borderline.length} borderline; ${names.length} questions, ${runs} run(s) per prompt; model ${[...models].join(", ") || "jev-latest"}\n`);
  if (printMeans) {
    for (const result of results) {
      const selected = Object.fromEntries(Object.entries(result.means).filter(([, score]) => score >= threshold));
      const near = Object.fromEntries(Object.entries(result.means).filter(([, score]) => score >= 0.70 && score <= 0.80));
      process.stdout.write(`MEANS ${JSON.stringify({ ...result, baseline_selected: selected, baseline_borderline: near })}\n`);
    }
  }
  process.exit(flags.length ? 1 : 0);
} catch (error) {
  process.stderr.write(`addon-judge-check.ts: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
}


import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { addonJudgeState, briefJudgeState, briefQuestions, parseAddonCatalog } from "../plugin/extensions/addon-catalog";
import { cleanBrief, preprocessTinyMessage } from "../plugin/extensions/prompt-cleaner";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const root = join(import.meta.dir, "..");
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
type Prompt = { id: string; prompt: string; restated?: boolean; brief?: boolean; expected: string[]; allowed?: string[] };
type Result = { id: string; means: Record<string, number> };

const key = process.env.TYPESAFE_API_KEY ?? "";
if (!key) {
  process.stderr.write("addon-judge-check.ts needs TYPESAFE_API_KEY. Run: TYPESAFE_API_KEY=$(omp token typesafe) bun scripts/addon-judge-check.ts [corpus.json]\n");
  process.exit(2);
}

const MISS_BELOW = 0.65;
const WRONG_ABOVE = 0.85;
const isBorderline = (score: number) => score >= MISS_BELOW && score <= WRONG_ABOVE;

try {
  const args = process.argv.slice(2);
  let runs = 1;
  let printMeans = false;
  let corpus = join(root, "sample-prompts.json");
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--print-means") printMeans = true;
    else if (args[i] === "--runs") {
      runs = Number(args[++i]);
      if (!Number.isSafeInteger(runs) || runs < 1) throw new Error("--runs needs a positive integer");
    } else if (!args[i]!.startsWith("-")) corpus = resolve(args[i]!);
    else throw new Error(`unknown option: ${args[i]}`);
  }
  const catalog = parseAddonCatalog(readJson(join(root, "addon-questions.json")));
  const { prompts, threshold } = readJson(corpus) as { prompts: Prompt[]; threshold: number };
  // A brief sample is a subagent's first prompt, judged as the extension judges it in a subagent session (ADR 0025).
  const questionsFor = (prompt: Prompt) => prompt.brief ? briefQuestions(catalog) : catalog.questions;
  const stateFor = (prompt: Prompt) => {
    if (prompt.brief) return briefJudgeState(catalog, cleanBrief(prompt.prompt));
    // A restated sample holds a stored smol restatement of a mid-session or fresh run start, which the extension sends as it is, up to 10,000 characters (ADR 0021, ADR 0026).
    return addonJudgeState(catalog, prompt.restated ? prompt.prompt.slice(0, 10_000) : preprocessTinyMessage(prompt.prompt));
  };
  const asked = new Set(prompts.flatMap(prompt => Object.keys(questionsFor(prompt))));
  const flags: string[] = [];
  const borderline: string[] = [];
  const results: Result[] = [];
  const models = new Set<string>();
  let flaggedPrompts = 0;

  for (let start = 0; start < prompts.length; start += 4) {
    const batch = await Promise.all(prompts.slice(start, start + 4).map(async prompt => {
      const questions = questionsFor(prompt);
      const names = Object.keys(questions);
      const totals = Object.fromEntries(names.map(name => [name, 0]));
      for (let run = 0; run < runs; run++) {
        const response = await fetch(ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "jev-latest", state: stateFor(prompt), questions }),
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
      for (const name of Object.keys(result.means)) {
        const score = result.means[name]!;
        const expected = prompt.expected.includes(name);
        const allowed = prompt.allowed?.includes(name) ?? false;
        const line = `${prompt.id}: ${name} at ${score.toFixed(3)}`;
        if (expected && score < MISS_BELOW) flags.push(`${line}, expected >= ${MISS_BELOW}`);
        if (!expected && !allowed && score > WRONG_ABOVE) flags.push(`${line}, unexpected > ${WRONG_ABOVE.toFixed(2)}`);
        if (isBorderline(score)) borderline.push(line);
      }
      if (flags.length > before) flaggedPrompts++;
      results.push(result);
    }
  }

  for (const line of flags) process.stdout.write(`FLAG ${line}\n`);
  for (const line of borderline) process.stdout.write(`BORDERLINE ${line}\n`);
  process.stdout.write(`${prompts.length - flaggedPrompts}/${prompts.length} prompts pass, ${flags.length} flags, ${borderline.length} borderline; ${asked.size} questions, ${runs} run(s) per prompt; model ${[...models].join(", ") || "jev-latest"}\n`);
  if (printMeans) {
    for (const result of results) {
      const selected = Object.fromEntries(Object.entries(result.means).filter(([, score]) => score >= threshold));
      const near = Object.fromEntries(Object.entries(result.means).filter(([, score]) => isBorderline(score)));
      process.stdout.write(`MEANS ${JSON.stringify({ ...result, baseline_selected: selected, baseline_borderline: near })}\n`);
    }
  }
  process.exit(flags.length ? 1 : 0);
} catch (error) {
  process.stderr.write(`addon-judge-check.ts: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
}

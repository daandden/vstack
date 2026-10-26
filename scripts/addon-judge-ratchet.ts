import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { addonJudgeState, briefJudgeState, briefQuestions, parseAddonCatalog } from "../plugin/extensions/addon-catalog";
import { cleanBrief, preprocessTinyMessage } from "../plugin/extensions/prompt-cleaner";

const ENDPOINT = process.env.TYPESAFE_ENDPOINT ?? "https://api.typesafe.ai/v1/systemone";
const SELECT_AT = 0.7;
const MISS_BELOW = 0.65;
const WRONG_ABOVE = 0.95;
const MAX_ATTEMPTS = 4;
const CASE_CEILING_MS = 120_000;
const CONCURRENCY = 8;

type Form = { prompt: string; restated?: boolean; brief?: boolean; expected: string[]; allowed?: string[] };
type Case = { id: string; stratum: string; forms: Form[] };
type Slot = { task: Case; rep: number };
type Grade = { pass: number; flag_free: number; no_miss: number; no_wrong: number };

const root = fileURLToPath(new URL("..", import.meta.url));
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const args = process.argv.slice(2);
const flags = new Set(["--out", "--cases", "--state", "--reps", "--expect-model", "--only"]);
const options = new Map<string, string>();
for (let i = 0; i < args.length; i += 2) {
  const flag = args[i]!;
  const value = args[i + 1];
  if (!flags.has(flag) || options.has(flag) || !value || value.startsWith("--")) {
    process.stderr.write(`unknown, duplicate, or incomplete option: ${flag}\n`);
    process.exit(2);
  }
  options.set(flag, value);
}
const opt = (name: string) => options.get(name);
const out = resolve(opt("--out") ?? "");
const casesPath = opt("--cases");
const statePath = opt("--state");
const reps = Number(opt("--reps") ?? 3);
const expectModel = opt("--expect-model") ?? "jev-1.14.0";
const only = opt("--only")?.split(",");
const key = process.env.TYPESAFE_API_KEY ?? "";
if (!opt("--out") || !casesPath || !Number.isSafeInteger(reps) || reps < 1 || !key) {
  process.stderr.write("usage: TYPESAFE_API_KEY=... bun scripts/addon-judge-ratchet.ts --cases <file> --out <dir> [--reps N] [--state _state.json] [--only ids] [--expect-model jev-1.14.0]\n");
  process.exit(2);
}
const split = statePath ? readJson(statePath) : undefined;
if (split && (!Array.isArray(split.train_ids) || !split.train_ids.length || !Array.isArray(split.test_ids) ||
    [...split.train_ids, ...split.test_ids].some(id => typeof id !== "string") ||
    split.train_ids.some((id: string) => split.test_ids.includes(id)))) {
  process.stderr.write("--state must contain non-empty train_ids and disjoint test_ids arrays of strings\n");
  process.exit(2);
}
const train: Set<string> | undefined = split ? new Set(split.train_ids) : undefined;

const catalog = parseAddonCatalog(readJson(join(root, "addon-questions.json")));
const caseFile = readJson(resolve(casesPath));
if (!Array.isArray(caseFile.cases) || !caseFile.cases.length) throw new Error("cases must be a non-empty array");
const ids = new Set<string>();
for (const task of caseFile.cases) {
  if (!task || typeof task.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(task.id) || ids.has(task.id)) {
    throw new Error("each case needs a unique filename-safe id");
  }
  ids.add(task.id);
  if (typeof task.stratum !== "string" || !task.stratum.trim() || !Array.isArray(task.forms) || !task.forms.length) {
    throw new Error(`case ${task.id} needs a stratum and at least one form`);
  }
  for (const form of task.forms) {
    if (!form || typeof form.prompt !== "string" || !Array.isArray(form.expected) ||
        (form.allowed !== undefined && !Array.isArray(form.allowed)) ||
        (form.brief !== undefined && typeof form.brief !== "boolean") ||
        (form.restated !== undefined && typeof form.restated !== "boolean")) {
      throw new Error(`case ${task.id} has an invalid form`);
    }
    const questions = form.brief ? briefQuestions(catalog) : catalog.questions;
    for (const label of [...form.expected, ...(form.allowed ?? [])]) {
      if (typeof label !== "string" || !Object.hasOwn(questions, label)) {
        throw new Error(`case ${task.id}: unknown or ineligible Addon label ${String(label)}`);
      }
    }
  }
}
if (only?.some(id => !ids.has(id))) throw new Error("--only contains an unknown case id");
const tasks = (caseFile.cases as Case[]).filter(task => !only || only.includes(task.id));
const questionsFor = (form: Form) => form.brief ? briefQuestions(catalog) : catalog.questions;
const stateFor = (form: Form) => form.brief
  ? briefJudgeState(catalog, cleanBrief(form.prompt))
  : addonJudgeState(catalog, form.restated ? form.prompt.slice(0, 10_000) : preprocessTinyMessage(form.prompt));
const formKind = (form: Form) => form.brief ? "brief" : form.restated ? "restated" : "raw";

mkdirSync(join(out, "traces"), { recursive: true });
const resultsPath = join(out, "results.jsonl");
const errorsPath = join(out, "errors.jsonl");
const done = new Set<string>();
if (existsSync(resultsPath)) {
  for (const line of readFileSync(resultsPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    done.add(`${row.prompt_id}#${row.rep}`);
  }
}
const slots: Slot[] = tasks.flatMap(task => Array.from({ length: reps }, (_, rep) => ({ task, rep })))
  .filter(({ task, rep }) => !done.has(`${task.id}#${rep}`));

class Failure extends Error {
  constructor(readonly kind: string, message: string, readonly attempts: number) { super(message); }
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function ask(form: Form, deadline: number) {
  const body = JSON.stringify({ model: "jev-latest", state: stateFor(form), questions: questionsFor(form) });
  let last = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Failure("timeout", `case ceiling ${CASE_CEILING_MS} ms reached: ${last}`, attempt - 1);
    try {
      const started = Date.now();
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(Math.min(30_000, remaining)),
      });
      const text = await response.text();
      if (response.ok) return { json: JSON.parse(text), latency: (Date.now() - started) / 1000, retries: attempt - 1 };
      last = `HTTP ${response.status} ${text.slice(0, 300)}`;
      if (response.status !== 408 && response.status !== 429 && response.status < 500) throw new Failure("api_error", last, attempt);
    } catch (error) {
      if (error instanceof Failure) throw error;
      last = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    }
    if (attempt < MAX_ATTEMPTS) {
      const delay = Math.min(500 * 2 ** attempt * (0.5 + Math.random()), Math.max(0, deadline - Date.now()));
      await sleep(delay);
    }
  }
  if (Date.now() >= deadline) throw new Failure("timeout", `case ceiling ${CASE_CEILING_MS} ms reached: ${last}`, MAX_ATTEMPTS);
  throw new Failure("api_error", `gave up after ${MAX_ATTEMPTS} attempts: ${last}`, MAX_ATTEMPTS);
}

function grade(form: Form, scores: Record<string, number>): { grade: Grade; explanation: string } {
  const expected = new Set(form.expected);
  const allowed = new Set(form.allowed ?? []);
  const missed = [...expected].filter(name => scores[name]! < SELECT_AT);
  const wrong = Object.keys(scores).filter(name => !expected.has(name) && !allowed.has(name) && scores[name]! >= SELECT_AT);
  const flagged = [
    ...[...expected].filter(name => scores[name]! < MISS_BELOW),
    ...Object.keys(scores).filter(name => !expected.has(name) && !allowed.has(name) && scores[name]! > WRONG_ABOVE),
  ];
  const fmt = (names: string[]) => names.map(name => `${name}=${scores[name]!.toFixed(2)}`).join(", ");
  const parts = [];
  if (missed.length) parts.push(`missed ${fmt(missed)}`);
  if (wrong.length) parts.push(`wrong ${fmt(wrong)}`);
  if (flagged.length) parts.push(`flagged ${fmt(flagged)}`);
  return {
    grade: { pass: missed.length || wrong.length ? 0 : 1, flag_free: flagged.length ? 0 : 1, no_miss: missed.length ? 0 : 1, no_wrong: wrong.length ? 0 : 1 },
    explanation: parts.join("; ") || "exact",
  };
}

async function run(slot: Slot) {
  const { task, rep } = slot;
  const tags = [task.stratum, task.forms.some(form => form.expected.length) ? "should-pick" : "should-not-pick"];
  const fail = (kind: string, message: string, attempts: number) => {
    process.exitCode = 1;
    appendFileSync(errorsPath, JSON.stringify({ prompt_id: task.id, rep, tags, class: kind, message, attempts, at: new Date().toISOString() }) + "\n");
  };
  const deadline = Date.now() + CASE_CEILING_MS;
  const forms: { kind: string; state: { request: string; preamble: string }; expected: string[]; allowed: string[]; scores: Record<string, number>; grade: Grade; explanation: string }[] = [];
  let model = "";
  let latency = 0;
  let retries = 0;
  const usage = { input_tokens: 0, output_tokens: 0 };
  try {
    for (const form of task.forms) {
      const answer = await ask(form, deadline);
      if (answer.json.model !== expectModel) return fail("model_mismatch", `served ${answer.json.model}, expected ${expectModel}`, answer.retries + 1);
      const scores: Record<string, number> = {};
      for (const name of Object.keys(questionsFor(form))) {
        const reply = answer.json.answers?.[name];
        const score: unknown = reply?.noul;
        if (reply?.type !== "noul" || typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 1) {
          return fail("invalid_answer", `${formKind(form)} ${name}: ${JSON.stringify(reply)}`, answer.retries + 1);
        }
        scores[name] = score;
      }
      if (!Number.isFinite(answer.json.usage?.input_tokens) || !Number.isFinite(answer.json.usage?.output_tokens)) {
        return fail("invalid_usage", "response must include numeric input_tokens and output_tokens", answer.retries + 1);
      }
      model = answer.json.model;
      latency += answer.latency;
      retries += answer.retries;
      usage.input_tokens += answer.json.usage.input_tokens;
      usage.output_tokens += answer.json.usage.output_tokens;
      const state = stateFor(form);
      forms.push({ kind: formKind(form), state, expected: form.expected, allowed: form.allowed ?? [], scores, ...grade(form, scores) });
    }
  } catch (error) {
    if (error instanceof Failure) return fail(error.kind, error.message, error.attempts);
    return fail("runner_crash", error instanceof Error ? error.stack ?? error.message : String(error), 0);
  }
  const mean = (metric: keyof Grade) => forms.reduce((sum, form) => sum + form.grade[metric], 0) / forms.length;
  const row = {
    prompt_id: task.id, rep,
    prompt: forms.map(form => `[${form.kind}] ${form.state.request}`).join("\n\n"),
    tags,
    grade: { pass: retries ? 0 : mean("pass"), flag_free: mean("flag_free"), no_miss: mean("no_miss"), no_wrong: mean("no_wrong") },
    explanation: (retries ? `failed strict scoring after ${retries} API retries | ` : "") + forms.map(form => `${form.kind}: ${form.explanation}`).join(" | "),
    status: "ok", model, usage, latency_s: latency, retries,
    forms: forms.map(({ kind, expected, allowed, scores, grade }) => ({ kind, expected, allowed, scores, grade })),
  };
  if (train?.has(task.id)) {
    writeFileSync(join(out, "traces", `${task.id}_rep${rep}.json`), JSON.stringify(forms.flatMap(form => [
      { role: "system", content: form.state.preamble },
      { role: "user", content: form.state.request },
      { role: "assistant", content: Object.entries(form.scores).sort((a, b) => b[1] - a[1]).map(([name, score]) => `${name}: ${score.toFixed(3)}`).join("\n") },
    ]), null, 2));
  }
  appendFileSync(resultsPath, JSON.stringify(row) + "\n");
}

let next = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < slots.length) await run(slots[next++]!);
}));
process.stdout.write(`${slots.length} slots attempted into ${out}\n`);

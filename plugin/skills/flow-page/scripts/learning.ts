import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fields, Refusal, refuse, text, type Quiz, type State } from "./model.ts";
import { readState, withLock, writeAtomic } from "./store.ts";

type Attempt = { id: string; result: string; revision: number; question: string; answer: string; correct: boolean; time: string };
type Learning = { version: 1; attempts: Attempt[]; completed: { result: string; revision: number }[] };
class Conflict extends Error {}
const pathOf = (folder: string) => join(folder, "data", "learning.json");
function read(folder: string): Learning {
  const path = pathOf(folder);
  if (!existsSync(path)) return { version: 1, attempts: [], completed: [] };
  if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error("Learning storage is not a regular file");
  return JSON.parse(readFileSync(path, "utf8"));
}
function question(s: State, a: Attempt) {
  const result = [...s.results, ...s.history].find((r) => r.id === a.result && (r.revision ?? 1) === a.revision);
  return result?.quiz?.questions.find((q) => q.ref === a.question) ?? refuse("learning", "attempt names no captured Quiz question");
}
function correct(q: Quiz["questions"][number], answer: string): boolean {
  const rule = q.answer;
  if ("choice" in rule) {
    if (!q.choices!.some((c) => c.ref === answer)) refuse("learning", "answer names no choice");
    return answer === rule.choice;
  }
  if ("number" in rule) {
    if (!answer.trim() || !Number.isFinite(Number(answer))) refuse("learning", "answer must be a finite number");
    return Math.abs(Number(answer) - rule.number) <= rule.tolerance;
  }
  const normalize = (v: string) => rule.case_sensitive ? v.trim() : v.trim().toLowerCase();
  return rule.text.some((v) => normalize(v) === normalize(answer));
}
export async function learning(folder: string, req: Request): Promise<{ status: number; body: unknown }> {
  try {
    if (req.method === "GET") return { status: 200, body: read(folder) };
    if (req.method !== "POST") return { status: 405, body: { error: "Only GET and POST are supported" } };
    // Bound the streamed body as well as Content-Length before parsing any input.
    const reader = req.body?.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    if (reader) for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 262144) { await reader.cancel(); return { status: 413, body: { error: "Learning batch is too large" } }; }
      parts.push(value);
    }
    const o = fields(JSON.parse(Buffer.concat(parts).toString()), "learning", ["version", "attempts"]);
    if (o.version !== 1 || !Array.isArray(o.attempts) || o.attempts.length > 100) refuse("learning", "needs version 1 and at most 100 attempts");
    return await withLock(folder, async () => {
      const s = readState(folder)!;
      const progress = read(folder);
      for (const raw of o.attempts as unknown[]) {
        const a = fields(raw, "attempt", ["id", "result", "revision", "question", "answer"]);
        const id = text(a, "id", "attempt");
        if (!/^[a-zA-Z0-9-]{8,100}$/.test(id) || !Number.isInteger(a.revision) || (a.revision as number) < 1) refuse("attempt", "invalid id or revision");
        const input = { id, result: text(a, "result", "attempt"), revision: a.revision as number, question: text(a, "question", "attempt"), answer: text(a, "answer", "attempt") };
        if (input.answer.length > 4096) refuse("attempt", "answer is too long");
        const prior = progress.attempts.find((x) => x.id === id);
        if (prior) {
          if (["result", "revision", "question", "answer"].some((k) => prior[k as keyof Attempt] !== input[k as keyof typeof input])) throw new Conflict("An accepted attempt id cannot be changed");
          continue;
        }
        progress.attempts.push({ ...input, correct: correct(question(s, input as Attempt), input.answer), time: new Date().toISOString() });
      }
      progress.completed = [...s.results, ...s.history].filter((r) => r.quiz && r.quiz.questions.every((q) => progress.attempts.some((a) => a.result === r.id && a.revision === (r.revision ?? 1) && a.question === q.ref && a.correct))).map((r) => ({ result: r.id, revision: r.revision ?? 1 }));
      writeAtomic(pathOf(folder), JSON.stringify(progress));
      return { status: 200, body: progress };
    });
  } catch (e) {
    if (e instanceof Conflict) return { status: 409, body: { error: e.message } };
    if (e instanceof Refusal || e instanceof SyntaxError) return { status: 400, body: { error: e.message } };
    throw e;
  }
}

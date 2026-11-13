import { readFileSync } from "node:fs";

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");
const sha = (value: unknown): value is string => typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const verdicts = new Set(["PASS", "PASS+NOTES", "FAIL", "DRIFT", "REFUSED"]);
const outcomes = new Set(["passed", "failed", "unavailable"]);

try {
  const [expectedPath, recordPath, ...extra] = process.argv.slice(2);
  if (!expectedPath || !recordPath || extra.length) throw new Error("Usage: bun check-verdict.ts <expected.json> <record.json>");
  const expected: unknown = JSON.parse(readFileSync(expectedPath, "utf8"));
  const record: unknown = JSON.parse(readFileSync(recordPath, "utf8"));
  if (!object(expected) || !sha(expected.head_sha) || !sha(expected.base_sha) || typeof expected.patch_id !== "string" ||
      !Array.isArray(expected.required_steps) || expected.required_steps.length === 0 || !expected.required_steps.every(text) ||
      new Set(expected.required_steps).size !== expected.required_steps.length) {
    throw new Error("Parent expectations need full head_sha and base_sha, a string patch_id, and nonempty unique required_steps IDs");
  }
  if (!object(record)) throw new Error("Verdict record must be a JSON object");
  const problems: string[] = [];
  if (typeof record.verdict !== "string" || !verdicts.has(record.verdict)) problems.push("Unknown verdict");
  if (!strings(record.evidence)) problems.push("evidence must be an array of strings");
  for (const field of ["notes", "open_questions"]) {
    if (record[field] !== undefined && !strings(record[field])) problems.push(`${field} must be an array of strings`);
  }
  const refused = record.verdict === "REFUSED";
  for (const field of ["head_sha", "base_sha", "patch_id"] as const) {
    if (refused && record[field] === null) continue;
    if (typeof record[field] !== "string" || record[field] !== expected[field]) problems.push(`${field} does not match the requested identity`);
  }
  if (refused) {
    if (!strings(record.notes) || !record.notes.some(text)) problems.push("REFUSED needs nonempty reason notes naming the refusal and needed setup");
  } else if (strings(record.evidence) && !record.evidence.some(text)) problems.push("A completed Verdict needs concrete evidence");
  if (Object.hasOwn(record, "cleanup_error") && !text(record.cleanup_error)) problems.push("cleanup_error must be a nonempty string when supplied");
  const steps = new Map<string, { outcome: string; evidence: string[] }>();
  if (!Array.isArray(record.proof_steps)) problems.push("proof_steps must be an array of per-step outcomes");
  else for (const step of record.proof_steps) {
    if (!object(step) || !text(step.id) || typeof step.outcome !== "string" || !outcomes.has(step.outcome) ||
        !Array.isArray(step.evidence) || step.evidence.length === 0 || !step.evidence.every(text)) {
      problems.push("Each proof step needs an ID, passed/failed/unavailable outcome, and nonempty evidence strings");
      continue;
    }
    if (steps.has(step.id)) problems.push(`Duplicate proof step ${step.id}`);
    steps.set(step.id, { outcome: step.outcome, evidence: step.evidence });
  }
  const valid = problems.length === 0;
  for (const id of expected.required_steps) {
    const step = steps.get(id);
    if (!step) problems.push(`Missing required proof ${id}`);
    else if (step.outcome !== "passed") problems.push(`Required proof ${id} ${step.outcome}`);
  }
  if (text(record.cleanup_error)) problems.push(`Cleanup failed: ${record.cleanup_error}`);
  if (record.verdict !== "PASS" && record.verdict !== "PASS+NOTES") problems.push(`Verdict ${String(record.verdict)} does not pass`);
  const ok = valid && problems.length === 0;
  console.log(JSON.stringify({ ok, valid, requires_review: true, open_questions: record.open_questions ?? [], problems, record }));
  if (!ok) process.exitCode = 2;
} catch (error) {
  console.log(JSON.stringify({ ok: false, valid: false, requires_review: true, problems: [error instanceof Error ? error.message : String(error)] }));
  process.exitCode = 2;
}

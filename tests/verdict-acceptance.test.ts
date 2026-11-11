import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve(import.meta.dir, "../plugin/skills/ship/scripts/check-verdict.ts");
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const expected = {
  head_sha: "a".repeat(40), base_sha: "b".repeat(40), patch_id: "c".repeat(40),
  required_steps: ["tests", "branch-race-negative", "native-journey"],
};
function passing(verdict = "PASS") {
  return {
    verdict, head_sha: expected.head_sha, base_sha: expected.base_sha, patch_id: expected.patch_id,
    evidence: ["Tests and required journeys passed; logs in verify/run."], notes: [] as string[],
    proof_steps: expected.required_steps.map(id => ({ id, outcome: "passed", evidence: [`verify/run/${id}.log`] })),
  };
}
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "verdict-acceptance-")); dirs.push(dir);
  const recordPath = join(dir, "record.json"), expectedPath = join(dir, "expected.json");
  function check(record: unknown, requirements: unknown = expected) {
    writeFileSync(recordPath, JSON.stringify(record)); writeFileSync(expectedPath, JSON.stringify(requirements));
    const before = readFileSync(recordPath, "utf8");
    const p = Bun.spawnSync([process.execPath, script, expectedPath, recordPath], { stdout: "pipe", stderr: "pipe" });
    expect(readFileSync(recordPath, "utf8")).toBe(before);
    return { code: p.exitCode, result: JSON.parse(p.stdout.toString()) };
  }
  return { check };
}

test("contrary branch-race proof cannot pass in notes or be replaced by a corrective follow-up", () => {
  const { check } = fixture();
  for (const verdict of ["PASS", "PASS+NOTES"]) {
    const record = passing(verdict);
    record.proof_steps[1]!.outcome = "failed";
    record.proof_steps[1]!.evidence = ["verify/run/branch-race.log: a raced branch was committed"];
    record.notes = ["A later guarded run passed; treat the failed negative probe as a note."];
    record.proof_steps.push({ id: "corrective-follow-up", outcome: "passed", evidence: ["verify/follow-up/branch-race.log"] });
    const rejected = check(record);
    expect(rejected.code).toBe(2);
    expect(rejected.result.problems).toContain("Required proof branch-race-negative failed");
    expect(rejected.result.record).toEqual(record);
    const corrected = passing(verdict);
    expect(check(corrected).code).toBe(0);
    expect(check(record).code).toBe(2);
  }
});

test("missing or unavailable native proof blocks both passing headlines despite optional notes", () => {
  const { check } = fixture();
  for (const verdict of ["PASS", "PASS+NOTES"]) {
    const omitted = passing(verdict); omitted.proof_steps.pop();
    omitted.notes = ["Native journey unavailable; local launch succeeded."];
    expect(check(omitted).result.problems).toContain("Missing required proof native-journey");
    const unavailable = passing(verdict);
    unavailable.proof_steps[2]!.outcome = "unavailable";
    unavailable.proof_steps[2]!.evidence = ["verify/run/native.log: required native runtime unavailable"];
    unavailable.notes = omitted.notes;
    expect(check(unavailable).result.problems).toContain("Required proof native-journey unavailable");
  }
});

test("complete proof remains subject to identity, evidence, refusal, and cleanup guards", () => {
  const { check } = fixture();
  expect(check(passing()).code).toBe(0);
  expect(check(passing("PASS+NOTES")).code).toBe(0);
  for (const change of [
    { head_sha: "d".repeat(40) }, { base_sha: "d".repeat(40) }, { patch_id: "d".repeat(40) },
    { evidence: [] }, { notes: "not an array" }, { open_questions: [3] },
    { cleanup_error: "Removal failed; record preserved at verify/run/checkout.json" },
    { cleanup_error: " " }, { cleanup_error: false },
    { verdict: "FAIL" }, { verdict: "DRIFT" }, { verdict: "UNKNOWN" },
  ]) expect(check({ ...passing(), ...change }).code).toBe(2);
  const questions = check({ ...passing(), open_questions: ["Approve the unavailable native substitute?"] });
  expect(questions.result.open_questions).toEqual(["Approve the unavailable native substitute?"]);
  expect(questions.result.requires_review).toBe(true);
  const refused = { verdict: "REFUSED", head_sha: null, base_sha: null, patch_id: null,
    evidence: [], notes: ["Isolation unavailable; enable worktree.clone through setup-vstack."], proof_steps: [] };
  const refusal = check(refused);
  expect(refusal.code).toBe(2);
  expect(refusal.result.valid).toBe(true);
  expect(refusal.result.record).toEqual(refused);
  expect(check({ ...refused, notes: [] }).result.valid).toBe(false);
  expect(check({ ...refused, cleanup_error: "Could not remove the head checkout" }).result.record.verdict).toBe("REFUSED");
});

test("proof coverage comes from the parent, not producer requirements, legacy records, or duplicate outcomes", () => {
  const { check } = fixture();
  const missing = passing(); missing.proof_steps.pop();
  expect(check({ ...missing, required_steps: ["tests", "branch-race-negative"] }).code).toBe(2);
  const { proof_steps: _steps, ...legacy } = passing();
  expect(check(legacy).result.valid).toBe(false);
  const duplicate = passing(); duplicate.proof_steps.push({ ...duplicate.proof_steps[1]!, outcome: "failed" });
  expect(check(duplicate).result.valid).toBe(false);
  for (const proof_steps of [null, {}, [{ id: "tests", outcome: "skipped", evidence: ["log"] }],
    [{ id: "tests", outcome: "passed", evidence: [] }], [{ id: "", outcome: "passed", evidence: ["log"] }]]) {
    expect(check({ ...passing(), proof_steps }).result.valid).toBe(false);
  }
  for (const required_steps of [[], ["tests", "tests"], [""], undefined]) {
    expect(check(passing(), { ...expected, required_steps }).code).toBe(2);
  }
  expect(check(passing(), { ...expected, required_steps: [...expected.required_steps, "new-required-journey"] }).code).toBe(2);
});

test("an empty patch identity remains valid and optional nonpassing proof does not replace required coverage", () => {
  const { check } = fixture();
  const record = passing();
  record.proof_steps.push({ id: "optional-experiment", outcome: "unavailable", evidence: ["No optional fixture was installed"] });
  expect(check({ ...record, patch_id: "" }, { ...expected, patch_id: "" }).code).toBe(0);
});

test("the real preparation producer returns a migrated refusal, never a passing substitute", () => {
  const prepare = resolve(import.meta.dir, "../plugin/skills/ship/scripts/prepare-verifier.ts");
  const p = Bun.spawnSync([process.execPath, prepare, "preflight"], { stdout: "pipe", stderr: "pipe" });
  expect(p.exitCode).toBe(2);
  const record = JSON.parse(p.stdout.toString());
  expect(record.verdict).toBe("REFUSED");
  expect(record.proof_steps).toEqual([]);
  const refusal = fixture().check(record);
  expect(refusal.code).toBe(2);
  expect(refusal.result.valid).toBe(true);
  expect(refusal.result.record).toEqual(record);
});

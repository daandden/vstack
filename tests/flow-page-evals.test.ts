import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const script = join(import.meta.dir, "../plugin/skills/flow-page/evals/check-record.ts");
function check(path: string) {
  const result = Bun.spawnSync(["bun", script, path], { stdout: "pipe", stderr: "pipe" });
  return { code: result.exitCode, out: result.stdout.toString(), error: result.stderr.toString() };
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "flow-eval-record-"));
  roots.push(root);
  const now = "A later Result is ready to publish.";
  const question = {
    title: "Where does the update appear?",
    description: "Compare the publication positions.",
    brief: { unblocks: "Implement update placement.", undo: "Restore the existing reading order.", no_recommendation: "Both placements preserve the update.", ask_reason: "taste", evidence_checked: "The ordering proof shows both placements preserve the recorded update." },
    needs: [{ need: "Locate the later update", kind: "prose" }],
    options: [{ label: "Later position", does: "Adds a link to the updated record.", gains: ["Chronology"], costs: ["One more entry"] }],
  };
  const submitted = { version: 1, items: [{ kind: "round", now, questions: [question] }] };
  const receipt = { flow: "flow-fixture", stage: "stage-1", revision: 2, refs: { pick: "question-1" } };
  const state = { flow: { id: "flow-fixture" }, revision: 2, rounds: [{ id: "round-1", now }], questions: [{ ...question, round: "round-1", id: "question-1", stage: "stage-1", options: [{ ...question.options[0], label: "A. Later position" }] }], attachments: [] };
  const binding = { flow: "flow-fixture", stage: "stage-1", session: "01a19000-0000-7000-8000-000000000001", agent: "main", bound: "2026-10-31T00:00:00Z" };
  const files = { "submitted.json": JSON.stringify(submitted), "receipt.json": JSON.stringify(receipt), "state.json": JSON.stringify(state), "binding.json": JSON.stringify(binding), "page.webp": "captured bytes", "aria.json": "{}", "display.json": "{}" };
  const hashes: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    writeFileSync(join(root, path), content);
    hashes[path] = createHash("sha256").update(content).digest("hex");
  }
  const record = { version: 1, first_revision: 2, question_ids: ["question-1"], identity: { session: binding.session, agent: binding.agent }, submitted: "submitted.json", receipt: "receipt.json", state: "state.json", binding: "binding.json", screenshot: "page.webp", aria: "aria.json", display: "display.json", files: hashes };
  const path = join(root, "record.json");
  writeFileSync(path, JSON.stringify(record));
  return { root, path, record };
}

test("a frozen record rejects changed evidence bytes instead of reporting available evidence", () => {
  const { root, path } = fixture();
  writeFileSync(join(root, "page.webp"), "replaced capture");
  const result = check(path);
  expect(result.code).toBe(1);
  expect(result.error).toContain("page.webp: sha256 mismatch");
});

test("later receipt and state bytes cannot replace the first published revision", () => {
  const { root, path, record } = fixture();
  for (const file of ["receipt.json", "state.json"]) {
    const data = JSON.parse(readFileSync(join(root, file), "utf8"));
    data.revision = 3;
    const bytes = JSON.stringify(data);
    writeFileSync(join(root, file), bytes);
    record.files[file] = createHash("sha256").update(bytes).digest("hex");
  }
  writeFileSync(path, JSON.stringify(record));
  const result = check(path);
  expect(result.code).toBe(1);
  expect(result.error).toContain("first revision 2 does not match receipt 3 and state 3");
});

test("a captured Background diagram stays separate from question-local kind coverage", () => {
  const { root, path, record } = fixture();
  const state = JSON.parse(readFileSync(join(root, "state.json"), "utf8"));
  state.questions[0].needs = [{ need: "Compare both reading routes", kind: "scenario" }];
  state.backgrounds = [{ figures: [{ attachment: "attachment-1" }] }];
  const asset = "<svg xmlns=\"http://www.w3.org/2000/svg\"/>";
  const hash = createHash("sha256").update(asset).digest("hex");
  state.attachments = [{ id: "attachment-1", availability: "captured", revision: hash, file: "diagram.svg" }];
  const submitted = JSON.parse(readFileSync(join(root, "submitted.json"), "utf8"));
  submitted.items[0].questions[0].needs = state.questions[0].needs;
  for (const [file, bytes] of Object.entries({ "state.json": JSON.stringify(state), "submitted.json": JSON.stringify(submitted), "diagram.svg": asset })) {
    writeFileSync(join(root, file), bytes);
    record.files[file] = createHash("sha256").update(bytes).digest("hex");
  }
  writeFileSync(path, JSON.stringify(record));
  const first = check(path);
  expect(first.code).toBe(0);
  expect(JSON.parse(first.out).questions).toEqual([{ id: "question-1", local_kinds: [], missing_kinds: ["scenario"], local_attachments: [] }]);

  state.questions[0].figures = [{ attachment: "attachment-1", kind: "scenario" }];
  const bytes = JSON.stringify(state);
  writeFileSync(join(root, "state.json"), bytes);
  record.files["state.json"] = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(path, JSON.stringify(record));
  const local = check(path);
  expect(local.code).toBe(0);
  expect(JSON.parse(local.out).questions).toEqual([{ id: "question-1", local_kinds: ["scenario"], missing_kinds: [], local_attachments: ["attachment-1"] }]);
});

test("a receipt from a different Flow cannot identify the frozen question", () => {
  const { root, path, record } = fixture();
  const receipt = JSON.parse(readFileSync(join(root, "receipt.json"), "utf8"));
  receipt.flow = "flow-other";
  const bytes = JSON.stringify(receipt);
  writeFileSync(join(root, "receipt.json"), bytes);
  record.files["receipt.json"] = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(path, JSON.stringify(record));
  const result = check(path);
  expect(result.code).toBe(1);
  expect(result.error).toContain("receipt Flow flow-other does not match state flow-fixture");
});

test("omitting a required capture from the hash manifest makes evidence unavailable", () => {
  const { path, record } = fixture();
  delete record.files["page.webp"];
  writeFileSync(path, JSON.stringify(record));
  const result = check(path);
  expect(result.code).toBe(1);
  expect(result.error).toContain("screenshot: page.webp is not in the hash manifest");
});

test("a Flow bound under a substituted identity cannot stand for the required authoring identity", () => {
  const { root, path, record } = fixture();
  const binding = JSON.parse(readFileSync(join(root, "binding.json"), "utf8"));
  binding.session = "01a19000-0000-7000-8000-000000000002";
  binding.agent = "ArbitrarySalamander";
  const bytes = JSON.stringify(binding);
  writeFileSync(join(root, "binding.json"), bytes);
  record.files["binding.json"] = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(path, JSON.stringify(record));
  const result = check(path);
  expect(result.code).toBe(1);
  expect(result.error).toContain("binding identity 01a19000-0000-7000-8000-000000000002/ArbitrarySalamander does not match required 01a19000-0000-7000-8000-000000000001/main");
});

test("a binding for another Flow cannot identify the frozen publication", () => {
  const { root, path, record } = fixture();
  const binding = JSON.parse(readFileSync(join(root, "binding.json"), "utf8"));
  binding.flow = "flow-other";
  const bytes = JSON.stringify(binding);
  writeFileSync(join(root, "binding.json"), bytes);
  record.files["binding.json"] = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(path, JSON.stringify(record));
  const result = check(path);
  expect(result.code).toBe(1);
  expect(result.error).toContain("binding flow-other/stage-1 does not match receipt flow-fixture/stage-1");
});

test("omitting the frozen binding makes the authoring identity unavailable", () => {
  const { path, record } = fixture();
  delete record.files["binding.json"];
  writeFileSync(path, JSON.stringify(record));
  const result = check(path);
  expect(result.code).toBe(1);
  expect(result.error).toContain("binding: binding.json is not in the hash manifest");
});

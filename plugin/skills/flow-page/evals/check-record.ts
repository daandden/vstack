import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

try {
  const path = process.argv[2];
  if (!path || process.argv.length !== 3) throw new Error("Usage: bun check-record.ts <record.json>");
  const record = JSON.parse(readFileSync(path, "utf8"));
  const root = dirname(resolve(path));
  if (record.version !== 1 || !record.files || Object.keys(record.files).length === 0) {
    throw new Error("Record needs version 1 and a nonempty files sha256 map");
  }
  for (const field of ["submitted", "receipt", "state", "binding", "screenshot", "aria", "display"]) {
    if (typeof record[field] !== "string" || !Object.hasOwn(record.files, record[field])) {
      throw new Error(`${field}: ${record[field]} is not in the hash manifest`);
    }
  }
  for (const [file, expected] of Object.entries(record.files)) {
    const actual = createHash("sha256").update(readFileSync(resolve(root, file))).digest("hex");
    if (actual !== expected) throw new Error(`${file}: sha256 mismatch. Preserve the original evidence instead of replacing it.`);
  }
  const load = (name: string) => JSON.parse(readFileSync(resolve(root, name), "utf8"));
  const receipt = load(record.receipt);
  const state = load(record.state);
  if (receipt.revision !== record.first_revision || state.revision !== record.first_revision) {
    throw new Error(`first revision ${record.first_revision} does not match receipt ${receipt.revision} and state ${state.revision}`);
  }
  if (receipt.flow !== state.flow.id) {
    throw new Error(`receipt Flow ${receipt.flow} does not match state ${state.flow.id}`);
  }
  const binding = load(record.binding);
  const identity = record.identity ?? {};
  if (binding.session !== identity.session || binding.agent !== identity.agent) {
    throw new Error(`binding identity ${binding.session}/${binding.agent} does not match required ${identity.session}/${identity.agent}`);
  }
  if (binding.flow !== receipt.flow || binding.stage !== receipt.stage) {
    throw new Error(`binding ${binding.flow}/${binding.stage} does not match receipt ${receipt.flow}/${receipt.stage}`);
  }
  const questions = record.question_ids.map((id: string) => {
    const question = state.questions.find((item: { id: string }) => item.id === id);
    if (!question) throw new Error(`${id}: question is absent from frozen state`);
    const visuals = [...(question.figures ?? []), ...question.options.flatMap((option: { preview?: object }) => option.preview ? [option.preview] : [])];
    const localKinds = [...new Set(visuals.map(visual => visual.kind))].sort();
    return {
      id,
      local_kinds: localKinds,
      missing_kinds: [...new Set(question.needs.filter((need: { kind: string }) => need.kind !== "prose" && !localKinds.includes(need.kind)).map((need: { kind: string }) => need.kind))].sort(),
      local_attachments: [...new Set(visuals.flatMap(visual => visual.attachment ? [visual.attachment] : []))].sort(),
    };
  });
  console.log(JSON.stringify({ files_verified: Object.keys(record.files).length, identity: { session: binding.session, agent: binding.agent }, questions }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

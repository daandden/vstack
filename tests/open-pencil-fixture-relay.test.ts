import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const relay = resolve(import.meta.dir, "../.omp/skills/verify-vstack/scripts/open-pencil-fixture-relay.ts");

function listFixtures(malformedStructured = false) {
  const work = mkdtempSync(join(tmpdir(), "open-pencil-fixture-relay-"));
  try {
    const fixture = join(work, "fixture");
    mkdirSync(fixture);
    const target = { id: "target", path: join(fixture, "Target.fig"), active: false };
    const decoy = { id: "decoy", path: join(fixture, "Decoy.fig"), active: true };
    const unrelated = { id: "unrelated", path: join(work, "Unrelated.fig"), active: false, pages: [{ name: "Private page" }] };
    for (const doc of [target, decoy, unrelated]) writeFileSync(doc.path, "");
    const listing = { documents: [target, unrelated, decoy] };
    const answer = {
      jsonrpc: "2.0", id: 7, result: {
        content: [{ type: "text", text: JSON.stringify(listing) }],
        structuredContent: malformedStructured ? { documents: [target, { path: 42 }] } : listing,
      },
    };
    const other = { jsonrpc: "2.0", id: "other", result: { content: [{ type: "text", text: "unmodified" }] } };
    const bridge = join(work, "bridge");
    writeFileSync(join(work, "answers.jsonl"), [other, answer].map(frame => JSON.stringify(frame)).join("\n") + "\n");
    writeFileSync(bridge, '#!/bin/sh\nIFS= read -r first\nIFS= read -r second\n/bin/cat "${0%/*}/answers.jsonl"\n');
    chmodSync(bridge, 0o700);
    const input = [
      { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "list_documents" } },
      { jsonrpc: "2.0", id: "other", method: "tools/list" },
    ].map(frame => JSON.stringify(frame)).join("\n") + "\n";
    const result = Bun.spawnSync([process.execPath, "--no-env-file", relay, bridge, fixture], { stdin: Buffer.from(input), stderr: "pipe" });
    return { result, other, visible: { documents: [target, decoy] } };
  } finally {
    rmSync(work, { recursive: true });
  }
}

test("fixture relay preserves fixture IDs and active flags without exposing unrelated rows", () => {
  const { result, other, visible } = listFixtures();
  const stdout = result.stdout.toString();
  expect(result.exitCode).toBe(0);
  expect(stdout).not.toContain("Private page");
  expect(stdout).not.toContain("Unrelated.fig");
  const [passThrough, filtered] = stdout.trim().split("\n").map(line => JSON.parse(line));
  expect(passThrough).toEqual(other);
  expect(JSON.parse(filtered.result.content[0].text)).toEqual(visible);
  expect(filtered.result.structuredContent).toEqual(visible);
  expect(result.stderr.toString().trim()).toBe('{"dropped_nonfixture_documents":1}');
});

test("fixture relay refuses the whole listing when the structured response cannot be filtered", () => {
  const { result, other } = listFixtures(true);
  expect(result.exitCode).toBe(0);
  const [passThrough, refused] = result.stdout.toString().trim().split("\n").map(line => JSON.parse(line));
  expect(passThrough).toEqual(other);
  expect(refused).toEqual({ jsonrpc: "2.0", id: 7, error: { code: -32603, message: "Could not isolate the fixture document listing" } });
});

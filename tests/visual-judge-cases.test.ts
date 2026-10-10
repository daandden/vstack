// visual-judge-cases.json against the rubric that grilling-page's helper sends to jev.
// scripts/visual-judge-check.ts runs the cases live; this test keeps them in step with the rubric offline.

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));
const file = read("visual-judge-cases.json");
const labels = Object.keys(read(file.rubric).labels);

test("every case names only labels the rubric has", () => {
  const unknown = file.cases.flatMap((c: any) => [c.expected, ...(c.allowed ?? [])].filter((l: string) => !labels.includes(l)).map((l: string) => `${c.id}: ${l}`));
  expect(unknown).toEqual([]);
});

test("every rubric label is the expected label of at least one case", () => {
  expect(labels.filter((l) => !file.cases.some((c: any) => c.expected === l))).toEqual([]);
});

test("every case state has the shape the helper sends: title, description, and lettered-off options", () => {
  const bad = file.cases
    .filter((c: any) => {
      const s = c.state;
      return typeof s.title !== "string" || typeof s.description !== "string" || !Array.isArray(s.options) || s.options.length < 2
        || s.options.some((o: any) => typeof o.label !== "string" || /^[A-Z]\. /.test(o.label) || typeof o.does !== "string");
    })
    .map((c: any) => c.id);
  expect(bad).toEqual([]);
  expect(new Set(file.cases.map((c: any) => c.id)).size).toBe(file.cases.length);
});

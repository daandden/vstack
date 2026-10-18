// diagram-design's shipped verify-geometry.py runs as a process on one figure file (spec #149, Testing
// Decisions, main seam). Each case reads the exit code and the reported findings, never the wording.
// The figures are the Catppuccin smoke figures of #155. Each failing case changes one thing in the Mocha one.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { EVAL_PYTHON, FIGURES, runScript, writeVariant } from "./support/diagram-scripts";

const NO_PYTHON = EVAL_PYTHON === null;

let dir: string;
beforeAll(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "vstack-verify-geometry-test-")));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** The checker's verdict on one file: the exit code and one entry per finding line before its summary line. */
function verifyGeometry(path: string) {
  const r = runScript("verify-geometry.py", [path]);
  const lines = r.stdout.split("\n").filter((l) => l !== "");
  return { code: r.code, findings: lines.slice(0, -1), summary: lines.at(-1) ?? "", stderr: r.stderr };
}

function expectPass(path: string) {
  const r = verifyGeometry(path);
  expect(r.stderr).toBe("");
  expect(r.findings).toEqual([]);
  expect(r.code).toBe(0);
}

function expectFail(path: string) {
  const r = verifyGeometry(path);
  expect(r.stderr).toBe("");
  expect(r.findings.length).toBeGreaterThan(0);
  // Every finding names the figure it was found in.
  for (const finding of r.findings) expect(finding.startsWith(`${basename(path)}:`)).toBe(true);
  expect(r.code).toBe(1);
}

const variant = (name: string, edits: [string | RegExp, string][]) => writeVariant(dir, name, FIGURES.mocha, edits);

test.skipIf(NO_PYTHON)("a Mocha figure and a Latte figure pass", () => {
  expectPass(FIGURES.mocha);
  expectPass(FIGURES.latte);
});

test.skipIf(NO_PYTHON)("a diagonal connector fails", () => {
  expectFail(variant("diagonal", [['<line x1="200" y1="148" x2="278" y2="148"', '<line x1="200" y1="148" x2="278" y2="164"']]));
});

test.skipIf(NO_PYTHON)("a label mask under a later node fails", () => {
  expectFail(variant("mask-under-node", [['<rect x="224" y="128" width="32" height="12"', '<rect x="264" y="128" width="32" height="12"']]));
});

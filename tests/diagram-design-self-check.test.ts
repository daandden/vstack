
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EVAL_PYTHON, FIGURES, runPython, runScript, writeVariant } from "./support/diagram-scripts";

const NO_PYTHON = EVAL_PYTHON === null;

let dir: string;
beforeAll(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "vstack-self-check-test-")));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function selfCheck(path: string, extra: string[] = []) {
  const r = runScript("self_check.py", [...extra, path]);
  const lines = r.stdout.split("\n").filter((l) => l !== "");
  return { code: r.code, verdict: lines[0] ?? "", findings: lines.filter((l) => l.startsWith("  - ")), stderr: r.stderr };
}

function expectPass(path: string) {
  const r = selfCheck(path);
  expect(r.verdict).toBe(`OK ${path}`);
  expect(r.findings).toEqual([]);
  expect(r.code).toBe(0);
}

function expectFail(path: string) {
  const r = selfCheck(path);
  expect(r.verdict).toBe(`FAIL ${path}`);
  expect(r.findings.length).toBeGreaterThan(0);
  expect(r.code).toBe(1);
}

const variant = (name: string, edits: [string | RegExp, string][]) => writeVariant(dir, name, FIGURES.mocha, edits);

test.skipIf(NO_PYTHON)("a Mocha figure passes", () => {
  expectPass(FIGURES.mocha);
});

test.skipIf(NO_PYTHON)("a figure with no title, description, or ARIA attributes passes", () => {
  expectPass(
    variant("no-aria", [
      [/ role="img" aria-labelledby="[^"]*"/, ""],
      [/\s*<title id="[^"]*">[^<]*<\/title>/, ""],
      [/\s*<desc id="[^"]*">[^<]*<\/desc>/, ""],
    ]),
  );
});

test.skipIf(NO_PYTHON)("a figure with motion markup and no controls passes", () => {
  expectPass(
    variant("motion-no-controls", [
      ["<svg viewBox=", '<svg data-motion-root data-motion-mode="step" data-step-count="2" viewBox='],
      ['<rect x="40" y="120"', '<rect data-motion-item data-step="1" x="40" y="120"'],
      ['<rect x="280" y="120"', '<rect data-motion-item data-step="2" x="280" y="120"'],
    ]),
  );
});

test.skipIf(NO_PYTHON)("a figure with a remote script fails", () => {
  expectFail(variant("remote-script", [["</body>", '<script src="https://cdn.example.com/app.js"></script>\n</body>']]));
});

test.skipIf(NO_PYTHON)("a figure with an inline event handler fails", () => {
  expectFail(variant("event-handler", [['<rect x="40" y="120"', '<rect onclick="alert(1)" x="40" y="120"']]));
});

test.skipIf(NO_PYTHON)("a figure with a Google Fonts link fails", () => {
  expectFail(
    variant("google-fonts-link", [
      ["</head>", '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter&display=swap">\n</head>'],
    ]),
  );
});

test.skipIf(NO_PYTHON)("a figure with a font import fails", () => {
  expectFail(variant("font-import", [["<style>", '<style>\n    @import url("https://fonts.googleapis.com/css2?family=Inter");']]));
});

test.skipIf(NO_PYTHON)("a figure with content past the viewBox fails", () => {
  expectFail(variant("past-viewbox", [["</svg>", '<rect x="1100" y="20" width="40" height="24" fill="#cba6f7"/>\n</svg>']]));
});

test.skipIf(NO_PYTHON)("self_check has no offline flag", () => {
  const r = selfCheck(FIGURES.mocha, ["--offline"]);
  expect(r.code).toBe(2);
});

test.skipIf(NO_PYTHON)("export of a passing figure gives a well-formed SVG that carries its CSS", () => {
  const source = variant("class-styled", [
    ["</style>", "  svg .focal-node { stroke-width: 1.5; }\n  </style>"],
    ['<rect x="520" y="120" width="160" height="56" rx="6" fill="rgba', '<rect class="focal-node" x="520" y="120" width="160" height="56" rx="6" fill="rgba'],
  ]);
  expectPass(source);
  const out = join(dir, "class-styled.svg");
  const r = runScript("export_svg.py", [source, out]);
  expect(r.code).toBe(0);
  expect(r.stdout.trim()).toBe(out);
  const parsed = runPython([
    "-c",
    [
      "import sys, xml.etree.ElementTree as ET",
      "root = ET.parse(sys.argv[1]).getroot()",
      "styles = [s.text or '' for s in root.iter('{http://www.w3.org/2000/svg}style')]",
      "print(root.tag)",
      "print(any('.focal-node' in s for s in styles))",
    ].join("\n"),
    out,
  ]);
  expect(parsed.code).toBe(0);
  expect(parsed.stdout.split("\n").slice(0, 2)).toEqual(["{http://www.w3.org/2000/svg}svg", "True"]);
});

// diagram-design's shipped lint-skin.py runs as a process on one figure file (spec #149, Testing Decisions,
// main seam). Each case reads the exit code and the reported findings, never the wording.
// The figures are the Catppuccin smoke figures of #155. Each variant changes one thing in one of them.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { DIAGRAM_SCRIPTS, EVAL_PYTHON, FIGURES, runScript, writeVariant } from "./support/diagram-scripts";

const NO_PYTHON = EVAL_PYTHON === null;

let dir: string;
beforeAll(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "vstack-lint-skin-test-")));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** The checker's verdict on one file: the exit code and one entry per finding line before its summary line. */
function lintSkin(path: string) {
  const r = runScript("lint-skin.py", [path]);
  const lines = r.stdout.split("\n").filter((l) => l !== "");
  return { code: r.code, findings: lines.slice(0, -1), stderr: r.stderr };
}

function expectPass(path: string) {
  const r = lintSkin(path);
  expect(r.stderr).toBe("");
  expect(r.findings).toEqual([]);
  expect(r.code).toBe(0);
}

function expectFail(path: string) {
  const r = lintSkin(path);
  expect(r.stderr).toBe("");
  expect(r.findings.length).toBeGreaterThan(0);
  // Every finding names the figure it was found in.
  for (const finding of r.findings) expect(finding.split(":")[0]!.endsWith(basename(path))).toBe(true);
  expect(r.code).toBe(1);
}

const mocha = (name: string, edits: [string | RegExp, string][]) => writeVariant(dir, name, FIGURES.mocha, edits);

test.skipIf(NO_PYTHON)("a Mocha figure and a Latte figure pass", () => {
  expectPass(FIGURES.mocha);
  expectPass(FIGURES.latte);
});

test.skipIf(NO_PYTHON)("an off-palette color fails", () => {
  expectFail(mocha("off-palette", [['stroke="#cba6f7" stroke-width="1"/>', 'stroke="#b5523b" stroke-width="1"/>']]));
});

test.skipIf(NO_PYTHON)("an off-palette color inside an HTML comment passes", () => {
  // The same color fails outside the comment, so only the comment can make the figure pass.
  const color = '<rect x="0" y="0" width="4" height="4" fill="#b5523b"/>';
  expectPass(mocha("commented-color", [["      </svg>", `        <!-- ${color} -->\n      </svg>`]]));
  expectFail(mocha("uncommented-color", [["      </svg>", `        ${color}\n      </svg>`]]));
});

test.skipIf(NO_PYTHON)("the terminal skin's dot-grid white passes", () => {
  // primitive-terminal.md draws the terminal dot grid in white at 0.06 to 0.08 opacity.
  const dot = '<circle cx="1" cy="1" r="0.9" fill="rgba(255,255,255,0.06)"/>';
  expectPass(mocha("terminal-dot-grid", [["      </svg>", `        ${dot}\n      </svg>`]]));
});

test.skipIf(NO_PYTHON)("a color from the other flavor fails", () => {
  // Mocha mauve in a Latte figure, then Latte mauve in a Mocha one: each is on-palette only in its own flavor.
  expectFail(writeVariant(dir, "mocha-in-latte", FIGURES.latte, [['stroke="#8839ef" stroke-width="1"/>', 'stroke="#cba6f7" stroke-width="1"/>']]));
  expectFail(mocha("latte-in-mocha", [['stroke="#cba6f7" stroke-width="1"/>', 'stroke="#8839ef" stroke-width="1"/>']]));
  expectFail(mocha("latte-rgba-in-mocha", [["rgba(203,166,247,0.10)", "rgba(136,57,239,0.10)"]]));
});

test.skipIf(NO_PYTHON)("a figure with no accessibility attributes passes", () => {
  expectPass(
    mocha("no-a11y", [
      [' role="img" aria-labelledby="figure-ship-mocha-title figure-ship-mocha-desc"', ""],
      [/\s*<title id="figure-ship-mocha-title">[^<]*<\/title>/, ""],
      [/\s*<desc id="figure-ship-mocha-desc">[^<]*<\/desc>/, ""],
    ]),
  );
});

test.skipIf(NO_PYTHON)("a figure that names Geist or Instrument Serif fails", () => {
  expectFail(mocha("geist", [["font-family: var(--font-term);", "font-family: 'Geist', ui-monospace, monospace;"]]));
  expectFail(
    mocha("instrument-serif", [
      [
        `font-style="italic" font-family="'IosevkaTermSlab Nerd Font Mono', ui-monospace, monospace"`,
        `font-style="italic" font-family="'Instrument Serif', ui-monospace, monospace"`,
      ],
    ]),
  );
});

test.skipIf(NO_PYTHON)("a figure with a Google Fonts link or font import fails", () => {
  // The link names an Iosevka face, so only the link itself can fail the figure.
  const link = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IosevkaTerm+Nerd+Font+Mono&display=swap">';
  expectFail(mocha("google-fonts-link", [['<meta charset="UTF-8">', `<meta charset="UTF-8">\n  ${link}`]]));
  const fontImport = "@import url('https://fonts.googleapis.com/css2?family=IosevkaTerm+Nerd+Font+Mono');";
  expectFail(mocha("font-import", [["<style>", `<style>\n    ${fontImport}`]]));
});

test.skipIf(NO_PYTHON)("a figure with motion markup passes", () => {
  // The motion pieces come from the shipped motion template: controls, live region, and the inline controller.
  const template = readFileSync(join(DIAGRAM_SCRIPTS, "..", "assets", "template-motion.html"), "utf8");
  const piece = (re: RegExp) => {
    const m = template.match(re);
    if (m === null) throw new Error(`template-motion.html has no ${String(re)}`);
    return m[0];
  };
  const controls = piece(/<div data-motion-controls[\s\S]*?<\/div>/);
  const status = piece(/<p class="sr-only" data-motion-status[^>]*><\/p>/);
  const controller = piece(/ {2}<script data-diagram-controls>[\s\S]*?<\/script>/);
  const motion = (name: string, script: string) =>
    mocha(name, [
      ["<style>", "<style>\n    @keyframes draw-path { to { stroke-dashoffset: 0; } }\n    .draw-path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw-path 640ms linear forwards; }"],
      ['<div class="frame">', '<div class="frame" data-motion-root data-motion-mode="step" data-step-count="1" data-step-current="1" data-frame="static" data-static-frame="complete">'],
      [
        "      </svg>",
        '        <path data-motion-item data-step="1" data-motion-decorative aria-hidden="true" focusable="false" pathLength="1" class="draw-path" d="M 200 148 H 278" fill="none" stroke="#cba6f7"/>\n      </svg>',
      ],
      ["    </div>\n  </div>\n</body>", `    </div>\n    ${controls}\n    ${status}\n  </div>\n${script}\n</body>`],
    ]);
  expectPass(motion("motion", controller));
  // Controller identity is not a style rule: a copy nested one level deeper passes too.
  expectPass(motion("motion-nested", controller.replace(/^/gm, "  ")));
});

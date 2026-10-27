// vstack-figures' render script run as a process (issue #260): Mermaid in, a Catppuccin Mocha Pele SVG out.

import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "vstack-figures", "scripts", "render.ts");
const FONT = "'IosevkaTerm Nerd Font Mono', ui-monospace, monospace";
/** The Mocha values from issue #260, "Theme with Catppuccin Mocha". */
const MOCHA: Record<string, string> = {
  "--pele-bg": "#1e1e2e", "--pele-fg": "#cdd6f4",
  "--pele-fg-on-light": "#11111b", "--pele-fg-on-dark": "#cdd6f4",
  "--pele-muted": "#a6adc8", "--pele-line": "#bac2de",
  "--pele-surface": "#313244", "--pele-surface-alt": "#181825", "--pele-border": "#6c7086",
  "--pele-accent": "#cba6f7", "--pele-critical": "#f38ba8", "--pele-error": "#f38ba8",
  "--pele-font": FONT, "--pele-font-mono": FONT,
  "--pele-series-1": "#cba6f7", "--pele-series-2": "#a6e3a1", "--pele-series-3": "#94e2d5", "--pele-series-4": "#fab387",
  "--pele-series-5": "#89b4fa", "--pele-series-6": "#f9e2af", "--pele-series-7": "#f5c2e7", "--pele-series-8": "#89dceb",
};
const FLOWCHART = "flowchart TD\n  Cart([Cart submitted]) --> Stock{In stock?}\n  Stock -- Yes --> Pay[Take payment]\n  Stock -- No --> Split[Split shipment]\n  Split --> Pay\n";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
function workdir() { const d = mkdtempSync(join(tmpdir(), "vstack-figure-")); dirs.push(d); return d; }
async function render(args: string[], stdin?: string) {
  const p = Bun.spawn(["bun", SCRIPT, ...args], { stdin: stdin === undefined ? "ignore" : new Blob([stdin]), stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return { code, stdout, stderr };
}
const styleOf = (svg: string) => /^<svg\b[^>]*>\s*<style>([\s\S]*?)<\/style>/.exec(svg)?.[1];

test("a flowchart renders to a Mocha SVG with a mauve rule for each focal id", async () => {
  const dir = workdir(), source = join(dir, "order.mmd"), out = join(dir, "figures", "order.svg");
  writeFileSync(source, FLOWCHART);
  const r = await render([source, out, "--focus", "Stock", "--focus", "Split"]);
  expect(r.stderr).toBe("");
  expect(r.code).toBe(0);
  expect(r.stdout.trim()).toBe(out);
  const svg = readFileSync(out, "utf8");
  expect(svg).toMatch(/^<svg\b[^>]*class="pele pele-flowchart /);
  expect(svg).toContain('data-id="Stock"');
  const style = styleOf(svg)!;
  expect(style).toBeDefined();
  for (const [name, value] of Object.entries(MOCHA)) expect(style).toContain(`${name}: ${value};`);
  // --pele-radius is geometry, not theme.
  for (const name of new Set(svg.match(/--pele-[a-z0-9-]+/g))) if (name !== "--pele-radius") expect(Object.keys(MOCHA)).toContain(name);
  const root = /^<svg\b[^>]*class="pele pele-flowchart (pele-f[0-9a-f]{8})"/.exec(svg)?.[1];
  expect(root).toBeDefined();
  for (const id of ["Stock", "Split"]) {
    expect(style).toMatch(new RegExp(`\\.${root} \\[data-id="${id}"\\] :is\\([^)]*\\brect\\b[^)]*\\) \\{ stroke: #cba6f7; stroke-width: 2\\.5px; \\}`));
    expect(style).toContain(`.${root} [data-id="${id}"] text { fill: #cba6f7; }`);
  }
  expect(style).not.toContain('[data-id="Pay"]');
});

test("a focal rule reaches only its own figure when two figures share a page", async () => {
  const dir = workdir(), source = join(dir, "order.mmd");
  writeFileSync(source, FLOWCHART);
  const a = join(dir, "a.svg"), b = join(dir, "b.svg");
  expect((await render([source, a, "--focus", "Pay"])).code).toBe(0);
  expect((await render([source, b])).code).toBe(0);
  const rootClass = (file: string) => /^<svg\b[^>]*class="([^"]*)"/.exec(readFileSync(file, "utf8"))![1]!.split(" ");
  const focalScopes = [...styleOf(readFileSync(a, "utf8"))!.matchAll(/^\.([\w-]+) \[data-id="Pay"\]/gm)].map((m) => m[1]!);
  expect(focalScopes.length).toBe(2);
  for (const scope of focalScopes) {
    expect(rootClass(a)).toContain(scope);
    expect(rootClass(b)).not.toContain(scope);
  }
});

test.each([
  ["a round flowchart node", "flowchart TD\n  Round((Round)) --> Box[Box]\n", "Round", "circle"],
  ["a pie slice", "pie\n  \"Complete\" : 3\n  \"Open\" : 1\n", "Complete", "path"],
])("the focal stroke rule reaches %s", async (_, mermaid, focus, shape) => {
  const dir = workdir(), out = join(dir, "f.svg");
  expect((await render(["-", out, "--focus", focus], mermaid)).code).toBe(0);
  const svg = readFileSync(out, "utf8");
  const scope = /^<svg\b[^>]*class="[^"]*(pele-f[0-9a-f]{8})"/.exec(svg)![1];
  const strokeRule = styleOf(svg)!.split("\n").find((l) => l.includes(`[data-id="${focus}"]`) && l.includes("stroke:"))!;
  const selectors = strokeRule.slice(0, strokeRule.indexOf("{")).split(/,(?![^(]*\))/).map((s) => s.trim());
  // The focal geometry is either the data-id element itself or a shape inside it.
  const self = new RegExp(`<${shape}\\b[^>]*data-id="${focus}"`).test(svg);
  const want = self ? `.${scope} [data-id="${focus}"]:is(` : `.${scope} [data-id="${focus}"] :is(`;
  const hit = selectors.find((s) => s.startsWith(want));
  expect(hit).toBeDefined();
  expect(hit).toContain(shape);
});

test("Mermaid on stdin renders the same way", async () => {
  const dir = workdir(), out = join(dir, "stdin.svg");
  const r = await render(["-", out], FLOWCHART);
  expect(r.code).toBe(0);
  expect(styleOf(readFileSync(out, "utf8"))).toContain("--pele-bg: #1e1e2e;");
  expect(styleOf(readFileSync(out, "utf8"))).not.toContain("data-id");
});

test("bad Mermaid exits 1 with Pele's parse error and writes no file", async () => {
  const dir = workdir(), source = join(dir, "bad.mmd"), out = join(dir, "bad.svg");
  writeFileSync(source, "flowchart TD\n  A[Cart --> \n");
  const r = await render([source, out]);
  expect(r.code).toBe(1);
  expect(r.stderr).toContain("Parse error on line 2");
  expect(r.stdout).toBe("");
  expect(existsSync(out)).toBe(false);
});

test("a usage error exits 2 and writes no file", async () => {
  const dir = workdir(), source = join(dir, "ok.mmd"), out = join(dir, "ok.svg");
  writeFileSync(source, FLOWCHART);
  for (const args of [[], [source], [source, out, "--focus"], [source, out, "extra"], [source, out, "--bogus"]]) {
    const r = await render(args);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("Usage: bun render.ts");
  }
  expect(existsSync(out)).toBe(false);
});

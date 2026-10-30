import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "vstack-figures", "scripts", "render.ts");
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

async function figure(source: string) {
  const dir = mkdtempSync(join(tmpdir(), "vstack-readable-"));
  dirs.push(dir);
  const out = join(dir, "figure.svg");
  const process = Bun.spawn([globalThis.process.execPath, SCRIPT, "-", out], {
    stdin: new Blob([source]), stdout: "pipe", stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([process.exited, new Response(process.stdout).text(), new Response(process.stderr).text()]);
  expect({ code, stderr, stdout: stdout.trim() }).toEqual({ code: 0, stderr: "", stdout: out });
  return readFileSync(out, "utf8");
}

function box(svg: string, id: string) {
  const node = new RegExp(`<g\\b[^>]*data-id="${id}"[^>]*>([\\s\\S]*?)</g>`).exec(svg)?.[1];
  expect(node).toBeDefined();
  const rect = /<rect\b[^>]*width="([\d.]+)" height="([\d.]+)"/.exec(node!);
  expect(rect).toBeDefined();
  return { width: Number(rect![1]), height: Number(rect![2]) };
}

test("labels use fixed-font cell widths, graphemes, and smaller formatted spans", async () => {
  const letters = "M".repeat(20);
  const svg = await figure(`flowchart TD
  Wide[${"W".repeat(20)}] --> Narrow[${"i".repeat(20)}]
  Plain[${letters}] --> Bold["<b><i><u><code>${letters}</code></u></i></b>"]
  Sub["<sub>${letters}</sub>"] --> Sup["<sup>${letters}</sup>"]
  Combined["${"e\u0301".repeat(20)}"] --> Latin[${"e".repeat(20)}]
  CJK["${"界".repeat(20)}"] --> Kana["${"カ".repeat(20)}"]
  Precomposed["${"é".repeat(20)}"]
`);
  expect(box(svg, "Wide")).toEqual(box(svg, "Narrow"));
  expect(box(svg, "Plain")).toEqual(box(svg, "Bold"));
  expect(box(svg, "Combined")).toEqual(box(svg, "Latin"));
  expect(box(svg, "Combined")).toEqual(box(svg, "Precomposed"));
  expect(box(svg, "Sub").width).toBeLessThan(box(svg, "Plain").width);
  expect(box(svg, "Sup")).toEqual(box(svg, "Sub"));
  expect(box(svg, "CJK").width).toBeGreaterThan(box(svg, "Latin").width);
  expect(box(svg, "Kana")).toEqual(box(svg, "CJK"));
});

test("wrapping follows visible cells and keeps smaller spans on fewer lines", async () => {
  const wide = Array(30).fill("WWW").join(" "), narrow = Array(30).fill("iii").join(" ");
  const svg = await figure(`flowchart TD
  Wide["${wide}"] --> Narrow["${narrow}"]
  Sub["<b><sub>${wide}</sub></b>"] --> Sup["<i><sup>${wide}</sup></i>"]
`);
  expect(box(svg, "Wide")).toEqual(box(svg, "Narrow"));
  expect(box(svg, "Wide").height).toBeGreaterThan(48);
  expect(box(svg, "Sub").height).toBeLessThan(box(svg, "Wide").height);
  expect(box(svg, "Sub")).toEqual(box(svg, "Sup"));
});

test("default flowchart edges have angular step presentation", async () => {
  const source = "flowchart TD\n A[Start] --> B[Branch]\n A --> C[Other]\n B --> D[Join]\n C --> D\n";
  const svg = await figure(source);
  const paths = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map((m) => m[1]!);
  expect(paths.length).toBeGreaterThan(4);
  expect(paths.some((d) => /[LHV].*[LHV].*[LHV]/.test(d))).toBe(true);
  expect(paths.every((d) => !/[CSA]/i.test(d))).toBe(true);
});

test("a failed render leaves a prior successful SVG unchanged and reports no output", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vstack-readable-"));
  dirs.push(dir);
  const out = join(dir, "figure.svg");
  const run = (source: string) => Bun.spawnSync([process.execPath, SCRIPT, "-", out], { stdin: Buffer.from(source) });
  expect(run("flowchart TD\n A[Ready] --> B[Done]\n").exitCode).toBe(0);
  const before = readFileSync(out);
  const failed = run("flowchart TD\n A[Unclosed -->\n");
  expect(failed.exitCode).toBe(1);
  expect(failed.stdout.toString()).toBe("");
  expect(failed.stderr.toString()).toContain("Parse error");
  expect(readFileSync(out)).toEqual(before);
});

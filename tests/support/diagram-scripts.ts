import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..", "..");

/** The shipped scripts folder that a drawer runs from the installed plugin. */
export const DIAGRAM_SCRIPTS = join(REPO, "plugin", "skills", "diagram-design", "scripts");

export const FIGURES = {
  mocha: join(import.meta.dir, "..", "fixtures", "diagram-design", "figure-mocha.html"),
} as const;

function resolveEvalPython(): string | null {
  if (Bun.which("omp") === null) return null;
  const r = Bun.spawnSync(["omp", "setup", "python", "--check", "--json"], { cwd: REPO, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) return null;
  try {
    const report = JSON.parse(r.stdout.toString()) as { available?: boolean; pythonPath?: string };
    return report.available === true && report.pythonPath ? report.pythonPath : null;
  } catch {
    return null;
  }
}

/** The Python interpreter of omp's eval, or null when this machine has none. */
export const EVAL_PYTHON = resolveEvalPython();

/** Runs `python <args>` under eval's interpreter. Call it only in tests that skip when EVAL_PYTHON is null. */
export function runPython(args: string[]): { code: number; stdout: string; stderr: string } {
  if (EVAL_PYTHON === null) throw new Error("no eval Python: skip this test with test.skipIf(EVAL_PYTHON === null)");
  const r = Bun.spawnSync([EVAL_PYTHON, ...args], { cwd: REPO, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}

/** Runs one shipped script, such as `self_check.py`, with its command-line arguments. */
export function runScript(script: string, args: string[]) {
  return runPython([join(DIAGRAM_SCRIPTS, script), ...args]);
}

/**
 * Writes `<dir>/<name>.html`: a copy of `base` with each [from, to] replacement applied once.
 * A replacement that matches nothing throws, so a fixture change cannot turn a case into a no-op.
 */
export function writeVariant(dir: string, name: string, base: string, edits: [string | RegExp, string][]): string {
  let html = readFileSync(base, "utf8");
  for (const [from, to] of edits) {
    const next = html.replace(from, to);
    if (next === html) throw new Error(`variant ${name}: ${String(from)} matches nothing in ${base}`);
    html = next;
  }
  const path = join(dir, `${name}.html`);
  writeFileSync(path, html);
  return path;
}

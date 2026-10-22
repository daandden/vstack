
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadRegister } from "./vstack-repo.ts";

const DEFAULT_SMOKE = resolve(import.meta.dir, "../load-smoke.sh");

const EXTENSION_COMMANDS = ["vstack-clean"];

/** The fields of the load-smoke.sh summary that the load gate reads. */
export interface LoadSmoke {
  skillCommands?: string[];
  agents?: string[];
  genericRules?: string;
  extensionCommands?: string[];
  warnings?: string[];
}

const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));

/** Runs `cmd` in `cwd` and returns its trimmed stdout. A nonzero exit throws with the command and its stderr. */
export function run(cmd: string[], cwd: string): string {
  const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`${cmd[0]} ${cmd.slice(1).join(" ")} (exit ${r.exitCode}): ${r.stderr.toString().trim() || r.stdout.toString().trim()}`);
  return r.stdout.toString().trim();
}


/**
 * Runs the load smoke on `<root>/plugin` with its output in `out`, and returns the summary.
 * Throws unless every registered skill, agent, and rule loads, the smoke reports no warnings,
 * and, when the manifest lists extensions, every extension Command is present.
 */
export function loadGate(root: string, out: string, smokeScript = DEFAULT_SMOKE): LoadSmoke {
  const smoke: LoadSmoke = JSON.parse(run([smokeScript, join(root, "plugin"), out], root));
  const artifacts = loadRegister(root);
  const paths = new Set([...artifacts.originals, ...artifacts.rows.flatMap(r => r.artifacts)]);
  for (const a of paths) {
    if (a.startsWith("plugin/skills/") && !smoke.skillCommands?.includes(a.split("/")[2]!)) throw new Error(`load smoke missing skill ${a}`);
    if (a.startsWith("plugin/agents/") && !smoke.agents?.includes(a.split("/")[2]!.replace(/\.md$/, ""))) throw new Error(`load smoke missing agent ${a}`);
    if (a.startsWith("plugin/rules/") && !smoke.genericRules?.includes(readFileSync(join(root, a), "utf8").replace(/^---[\s\S]*?---\s*/, "").trim())) throw new Error(`load smoke missing rule ${a}`);
  }
  if (smoke.warnings?.length) throw new Error(`load smoke warnings: ${smoke.warnings.join("; ")}`);
  const extensions: string[] = readJson(join(root, "plugin/package.json")).omp?.extensions ?? [];
  if (extensions.length) for (const command of EXTENSION_COMMANDS) {
    if (!smoke.extensionCommands?.includes(command)) throw new Error(`load smoke missing extension command ${command}: ${extensions.join(", ")} did not load`);
  }
  return smoke;
}

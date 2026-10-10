// The Update preflight and the load gate, shared by the maintainer scripts. Each check throws an Error when it fails.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadRegister } from "./vstack-repo.ts";

const DEFAULT_SMOKE = resolve(import.meta.dir, "../load-smoke.sh");

/** Top-level tools the vstack extension registers; skill text calls them by name. */
const EXTENSION_TOOLS = ["vstack_rename_session"];

/** The fields of the load-smoke.sh summary that the load gate reads. */
export interface LoadSmoke {
  skillCommands?: string[];
  agents?: string[];
  genericRules?: string;
  tools?: string[];
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
 * Refuses to start unless `root` is the root of a vstack checkout with no Update in flight:
 * no `update/` branch, local or on origin, and no open Update PR on the `gh` CLI's repo.
 */
export function preflight(root: string, gh: string) {
  if (run(["git", "rev-parse", "--show-toplevel"], root) !== resolve(root)) throw new Error("cwd must be the vstack checkout root");
  if (readJson(join(root, "plugin/package.json")).name !== "vstack") throw new Error("plugin manifest must name vstack");
  const branches = run(["git", "for-each-ref", "--format=%(refname:short)", "refs/heads/update/", "refs/remotes/origin/update/"], root);
  if (branches) throw new Error(`Update branches already exist (no resume): ${branches}`);
  const prs = JSON.parse(run([gh, "pr", "list", "--state", "open", "--limit", "1000", "--json", "number,headRefName,title,url"], root));
  const open = prs.filter((p: any) => p.headRefName?.startsWith("update/") || /^Update(?:\s|:)/i.test(p.title));
  if (open.length) throw new Error(`Open Update PR (no resume): ${open.map((p: any) => p.url || `#${p.number}`).join(", ")}`);
}

/**
 * Runs the load smoke on `<root>/plugin` with its output in `out`, and returns the summary.
 * Throws unless every registered skill, agent, and rule loads, the smoke reports no warnings,
 * and, when the manifest lists extensions, every extension tool is present.
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
  // omp logs an extension load failure and keeps going, so a missing top-level tool is the only sign in the smoke.
  const extensions: string[] = readJson(join(root, "plugin/package.json")).omp?.extensions ?? [];
  if (extensions.length) for (const tool of EXTENSION_TOOLS) {
    if (!smoke.tools?.includes(tool)) throw new Error(`load smoke missing extension tool ${tool}: ${extensions.join(", ")} did not load`);
  }
  return smoke;
}

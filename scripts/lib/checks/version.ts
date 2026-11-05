// Plugin manifest and version bump.
// The version base is a git commit; plugin/ in the working tree (tracked and untracked files) is compared with it.
// Base choice: --base / VSTACK_BASE_REF when set (an all-zero SHA counts as unset, as GitHub sends for a new
// branch); else the merge base of HEAD and origin/HEAD; else HEAD, so only uncommitted changes count.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { artifactFiles, ConfigError, readManifest } from "../vstack-repo.ts";
import type { Check, CheckContext, Failure } from "./types.ts";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

function git(root: string, args: string[]) {
  const r = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
  return { ok: r.exitCode === 0, out: r.stdout.toString().trim() };
}

function resolveBase(ctx: CheckContext): { sha?: string; label: string } {
  const given = ctx.baseRef?.trim();
  if (given && !/^0+$/.test(given)) {
    const r = git(ctx.root, ["rev-parse", "--verify", "--quiet", `${given}^{commit}`]);
    if (!r.ok) throw new ConfigError(`version base ${given} is not a commit in ${ctx.root}`);
    return { sha: r.out, label: `${given} (given)` };
  }
  const mb = git(ctx.root, ["merge-base", "HEAD", "origin/HEAD"]);
  if (mb.ok && mb.out) return { sha: mb.out, label: "merge base of HEAD and origin/HEAD" };
  const head = git(ctx.root, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  if (head.ok) return { sha: head.out, label: "HEAD (no origin/HEAD; only uncommitted changes count)" };
  return { label: "none (no commits)" };
}

function newer(a: string, b: string): boolean {
  const x = SEMVER.exec(a)!.slice(1).map(Number);
  const y = SEMVER.exec(b)!.slice(1).map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

export const versionChecks: Check = {
  classes: ["invalid-manifest", "no-version-bump"],
  async run(ctx) {
    const out: Failure[] = [];
    const item = "plugin/package.json";
    const m = readManifest(ctx.root);
    const bad = (message: string) => out.push({ class: "invalid-manifest", item, message });
    if (m === undefined) bad("plugin/package.json does not exist");
    else if (m === null) bad("plugin/package.json is not valid JSON");
    else {
      if (m.name !== "vstack") bad(`name is ${JSON.stringify(m.name)}, not "vstack"`);
      if (typeof m.version !== "string" || !SEMVER.test(m.version)) bad(`version ${JSON.stringify(m.version)} is not x.y.z`);
      if (!m.omp || typeof m.omp !== "object") bad("the omp field is missing; omp loads nothing from a linked root without it");
    }

    const base = resolveBase(ctx);
    ctx.notes.push(`version base: ${base.sha ?? "-"} ${base.label}`);
    if (!base.sha || out.length > 0) return out;

    const content = new Set(artifactFiles(ctx.root, "plugin"));
    const changed = new Set([
      ...git(ctx.root, ["diff", "--name-only", base.sha, "--", "plugin"]).out.split("\n"),
      ...git(ctx.root, ["ls-files", "--others", "--exclude-standard", "--", "plugin"]).out.split("\n"),
    ]);
    changed.delete("");
    for (const path of changed) {
      if (existsSync(join(ctx.root, path)) && !content.has(path)) changed.delete(path);
    }
    if (changed.size === 0) return out;

    const shown = git(ctx.root, ["show", `${base.sha}:plugin/package.json`]);
    if (!shown.ok) return out; // plugin/ is new since the base: any valid version is a first version
    let baseVersion: unknown;
    try {
      baseVersion = JSON.parse(shown.out).version;
    } catch {
      baseVersion = undefined;
    }
    if (typeof baseVersion === "string" && SEMVER.test(baseVersion) && !newer(m.version, baseVersion)) {
      out.push({
        class: "no-version-bump",
        item,
        message: `${changed.size} file(s) under plugin/ changed since ${base.sha.slice(0, 12)} but version ${m.version} is not above ${baseVersion}`,
      });
    }
    return out;
  },
};

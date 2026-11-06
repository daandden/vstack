// Plugin manifest and branch Change-note checks.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { artifactFiles, ConfigError, readManifest } from "../vstack-repo.ts";
import { pendingNotes } from "../change-notes.ts";
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
    if (!r.ok) throw new ConfigError(`change-note base ${given} is not a commit in ${ctx.root}`);
    return { sha: r.out, label: `${given} (given)` };
  }
  const mb = git(ctx.root, ["merge-base", "HEAD", "origin/HEAD"]);
  if (mb.ok && mb.out) return { sha: mb.out, label: "merge base of HEAD and origin/HEAD" };
  const head = git(ctx.root, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  if (head.ok) return { sha: head.out, label: "HEAD (no origin/HEAD; only uncommitted changes count)" };
  return { label: "none (no commits)" };
}

export const versionChecks: Check = {
  classes: ["invalid-manifest", "missing-change-note"],
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
    ctx.notes.push(`change-note base: ${base.sha ?? "-"} ${base.label}`);
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
    if (!shown.ok) return out;
    const oldPaths = new Set(pendingNotes(ctx.root, base.sha).map(note => note.path));
    const added = pendingNotes(ctx.root).filter(note => !oldPaths.has(note.path));
    if (!added.length) out.push({
      class: "missing-change-note",
      item: "change-notes",
      message: `${changed.size} shipped file(s) changed since ${base.sha.slice(0, 12)} without a branch Change note; run vstack-maintain prepare`,
    });
    return out;
  },
};

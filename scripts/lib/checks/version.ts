import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { artifactFiles, ConfigError, readManifest } from "../vstack-repo.ts";
import { PLUGIN_RELEASE, foldNotes, highestLevel, pendingNotes, releaseVersion } from "../change-notes.ts";
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

function checkRelease(root: string, base: string, version: string): { attempted: boolean; error?: string } {
  const previous = git(root, ["show", `${base}:${PLUGIN_RELEASE}`]).out;
  const receipt = existsSync(join(root, PLUGIN_RELEASE)) ? readFileSync(join(root, PLUGIN_RELEASE), "utf8").trim() : "";
  const oldManifest = git(root, ["show", `${base}:plugin/package.json`]);
  if (!oldManifest.ok) return { attempted: false };
  const oldVersion = JSON.parse(oldManifest.out).version;
  const common = git(root, ["merge-base", base, "HEAD"]);
  const before = pendingNotes(root, common.ok ? common.out : base);
  const current = pendingNotes(root);
  const removed = before.filter(note => !current.some(now => now.path === note.path));
  if (receipt === previous && oldVersion === version && !removed.length) return { attempted: false };
  try {
    if (!receipt || receipt === previous) throw new Error("A version change or consumed Change note needs a new Plugin release receipt; run vstack-maintain release.");
    const release = JSON.parse(receipt);
    if (release.schema !== 1 || typeof release.prepared !== "string" || !/^[a-f0-9]{40}$/.test(release.prepared) || typeof release.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(release.date)) {
      throw new Error("Expected schema 1, a full prepared commit SHA, and a YYYY-MM-DD date.");
    }
    if (!git(root, ["merge-base", "--is-ancestor", release.prepared, "HEAD"]).ok) throw new Error("The prepared commit must be an ancestor of HEAD.");
    const notes = pendingNotes(root, release.prepared), level = highestLevel(notes);
    if (!level) throw new Error("The prepared commit has no pending Change notes.");
    const preparedVersion = JSON.parse(git(root, ["show", `${release.prepared}:plugin/package.json`]).out).version;
    const expected = releaseVersion(preparedVersion, level);
    if (oldVersion !== preparedVersion) throw new Error("The base already released these notes or changed the plugin version.");
    if (version !== expected || release.version !== expected) throw new Error(`The prepared ${level} notes require version ${expected}, not ${version}.`);
    const left = notes.filter(note => current.some(now => now.path === note.path));
    if (left.length) throw new Error(`Prepared Change notes remain pending: ${left.map(note => note.path).join(", ")}`);
    const extra = removed.filter(note => !notes.some(prepared => prepared.path === note.path));
    if (extra.length) throw new Error(`The Plugin release removed notes outside its prepared set: ${extra.map(note => note.path).join(", ")}`);
    const section = foldNotes("", expected, notes, release.date).trim();
    const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
    const headings = changelog.split(/(?=^## )/m).filter(block => block.startsWith(`## [${expected}]`));
    if (headings.length !== 1 || headings[0]!.trim() !== section) throw new Error("CHANGELOG must contain the dated Plugin release heading and every prepared entry, unchanged and once.");
    return { attempted: true };
  } catch (error) {
    return { attempted: true, error: (error as Error).message };
  }
}

export const versionChecks: Check = {
  classes: ["invalid-manifest", "missing-change-note", "invalid-plugin-release"],
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

    const release = checkRelease(ctx.root, base.sha, m!.version);
    if (release.error) out.push({ class: "invalid-plugin-release", item: PLUGIN_RELEASE, message: release.error });
    const comparison = release.attempted ? git(ctx.root, ["merge-base", base.sha, "HEAD"]).out || base.sha : base.sha;

    const content = new Set(artifactFiles(ctx.root, "plugin"));
    const changed = new Set([
      ...git(ctx.root, ["diff", "--name-only", comparison, "--", "plugin"]).out.split("\n"),
      ...git(ctx.root, ["ls-files", "--others", "--exclude-standard", "--", "plugin"]).out.split("\n"),
    ]);
    changed.delete("");
    for (const path of changed) {
      if (existsSync(join(ctx.root, path)) && !content.has(path)) changed.delete(path);
    }
    const shown = git(ctx.root, ["show", `${comparison}:plugin/package.json`]);
    if (!shown.ok) return out;
    if (release.attempted) {
      const { version: _old, ...oldMetadata } = JSON.parse(shown.out);
      const { version: _new, ...metadata } = m!;
      if (JSON.stringify(oldMetadata) === JSON.stringify(metadata)) changed.delete("plugin/package.json");
    }
    if (changed.size === 0) return out;

    const oldPaths = new Set(pendingNotes(ctx.root, comparison).map(note => note.path));
    const added = pendingNotes(ctx.root).filter(note => !oldPaths.has(note.path));
    if (!added.length) out.push({
      class: "missing-change-note",
      item: "change-notes",
      message: `${changed.size} shipped file(s) changed since ${comparison.slice(0, 12)} without a branch Change note; run vstack-maintain prepare`,
    });
    return out;
  },
};

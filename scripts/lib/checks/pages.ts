// vstack page templates follow good-css (#61): every `*.html` and `*.css` file under a skill's `templates/`
// directory is linted with the script the CSS upstream names as `page_lint:` in pins.yaml (its
// `scripts/check-css.mjs`), read at that Upstream's Pin and run with Bun. Figures never sit in a template,
// so diagram-design's own `assets/` pages are not templates. With no template the lint is not fetched.

import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UpstreamError } from "../upstreams.ts";
import type { Check, CheckContext, Failure } from "./types.ts";

/** Repo-relative paths of every page template: `plugin/skills/<name>/templates/**\/*.{html,css}`. */
export function pageTemplates(root: string): string[] {
  const skills = join(root, "plugin", "skills");
  if (!existsSync(skills)) return [];
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
      const child = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(child);
      else if (e.isFile() && /\.(html|css)$/i.test(e.name)) out.push(child);
    }
  };
  for (const skill of readdirSync(skills, { withFileTypes: true })) {
    const rel = `plugin/skills/${skill.name}/templates`;
    if (skill.isDirectory() && existsSync(join(root, rel))) walk(rel);
  }
  return out.sort();
}

async function lint(ctx: CheckContext, templates: string[]): Promise<Failure[]> {
  const linters = [...ctx.pins.values()].filter((p) => p.pageLint);
  if (linters.length !== 1) {
    throw new UpstreamError(
      `${templates.length} page template(s) need a lint, and ${linters.length} Upstreams in pins.yaml set page_lint (exactly one must: the CSS upstream's scripts/check-css.mjs)`,
    );
  }
  const pin = linters[0];
  const script = pin.pageLint!;
  const dir = mkdtempSync(join(tmpdir(), "vstack-page-lint-"));
  try {
    const file = join(dir, "page-lint.mjs");
    writeFileSync(file, await ctx.source.file(pin, pin.pin, script));
    const r = Bun.spawnSync([process.execPath, file, ...templates], { cwd: ctx.root, stdout: "pipe", stderr: "pipe" });
    const stdout = r.stdout.toString();
    if (r.exitCode !== 0 && r.exitCode !== 1) {
      throw new UpstreamError(`${pin.key}@${pin.pin}:${script} exited ${r.exitCode}: ${(r.stderr.toString() || stdout).trim().slice(0, 400)}`);
    }
    ctx.notes.push(`page templates: ${templates.length}, linted with ${pin.key}@${pin.pin}:${script}`);
    const byTemplate = new Map<string, string[]>();
    const known = new Set(templates);
    for (const line of stdout.split("\n")) {
      const m = line.match(/^(.+?):(\d+) /);
      if (!m || !known.has(m[1])) continue;
      byTemplate.set(m[1], [...(byTemplate.get(m[1]) ?? []), line]);
    }
    if (r.exitCode === 1 && byTemplate.size === 0) {
      throw new UpstreamError(`${pin.key}@${pin.pin}:${script} failed without naming a template: ${stdout.trim().slice(0, 400)}`);
    }
    return [...byTemplate].map(([item, lines]) => ({ class: "page-css", item, message: lines.join("; ") }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export const pageChecks: Check = {
  classes: ["page-css"],
  async run(ctx) {
    const templates = pageTemplates(ctx.root);
    if (templates.length === 0) {
      ctx.notes.push("page templates: none");
      return [];
    }
    return lint(ctx, templates);
  },
};


import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { UpstreamError } from "../upstreams.ts";
import type { Check, CheckContext, Failure } from "./types.ts";

export function pageTemplates(root: string): string[] {
  const skills = join(root, "plugin", "skills");
  if (!existsSync(skills)) return [];
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
      const child = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(child);
      else if (e.isFile() && (rel.startsWith("reader/") ? /\.css$/i : /\.(html|css)$/i).test(e.name)) out.push(child);
    }
  };
  for (const skill of readdirSync(skills, { withFileTypes: true })) {
    const rel = `plugin/skills/${skill.name}/templates`;
    if (skill.isDirectory() && existsSync(join(root, rel))) walk(rel);
  }
  if (existsSync(join(root, "reader", "app"))) walk("reader/app");
  return out.sort();
}

function lint(ctx: CheckContext, templates: string[]): Failure[] {
  const script = "plugin/skills/vstack-maintain/scripts/check-css.mjs";
  const r = Bun.spawnSync([process.execPath, join(ctx.root, script), ...templates], { cwd: ctx.root, stdout: "pipe", stderr: "pipe" });
  const stdout = r.stdout.toString();
  if (r.exitCode !== 0 && r.exitCode !== 1) {
    throw new UpstreamError(`${script} exited ${r.exitCode}: ${(r.stderr.toString() || stdout).trim().slice(0, 400)}`);
  }
  ctx.notes.push(`page templates: ${templates.length}, linted with ${script}`);
  const byTemplate = new Map<string, string[]>();
  const known = new Set(templates);
  for (const line of stdout.split("\n")) {
    const m = line.match(/^(.+?):(\d+) /);
    if (!m || !known.has(m[1])) continue;
    byTemplate.set(m[1], [...(byTemplate.get(m[1]) ?? []), line]);
  }
  if (r.exitCode === 1 && byTemplate.size === 0) {
    throw new UpstreamError(`${script} failed without naming a template: ${stdout.trim().slice(0, 400)}`);
  }
  return [...byTemplate].map(([item, lines]) => ({ class: "page-css", item, message: lines.join("; ") }));
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

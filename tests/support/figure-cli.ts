import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "../../plugin/skills/vstack-figures/scripts/render.ts");
export async function renderFigure(dir: string, source: string, options: { bindings?: unknown; focus?: string[]; name?: string; rawBindings?: string } = {}) {
  const out = join(dir, `${options.name ?? "figure"}.svg`), args = [process.execPath, SCRIPT, "-", out];
  if (options.bindings !== undefined || options.rawBindings !== undefined) {
    const file = join(dir, `${options.name ?? "figure"}.json`);
    writeFileSync(file, options.rawBindings ?? JSON.stringify(options.bindings)); args.push("--bindings", file);
  }
  for (const id of options.focus ?? []) args.push("--focus", id);
  const p = Bun.spawn(args, { stdin: new Blob([source]), stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([p.exited, new Response(p.stdout).text(), new Response(p.stderr).text()]);
  return { code, stdout, stderr, out, svg: existsSync(out) ? readFileSync(out, "utf8") : undefined };
}

export function marks(svg: string, id: string) {
  const result: { tag: string; style: string; text: boolean }[] = [], owners: (string | undefined)[] = [];
  for (const match of svg.matchAll(/<\/?[\w:-]+\b(?:"[^"]*"|'[^']*'|[^'">])*>/g)) {
    const tag = match[0];
    if (tag.startsWith("</")) { owners.pop(); continue; }
    const owner = /\bdata-id="([^"]*)"/.exec(tag)?.[1] ?? owners.at(-1);
    const name = /^<(\w+)/.exec(tag)![1];
    if (owner === id && /^(?:rect|circle|path|polygon|ellipse|line|polyline|text)$/.test(name!)) result.push({ tag, style: /\bstyle="([^"]*)"/.exec(tag)?.[1] ?? "", text: name === "text" });
    if (!tag.endsWith("/>")) owners.push(owner);
  }
  return result;
}
export const shape = (svg: string, id: string) => marks(svg, id).find((m) => !m.text)!;
export const text = (svg: string, id: string) => marks(svg, id).find((m) => m.text)!;

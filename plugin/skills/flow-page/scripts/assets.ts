import { readFileSync, realpathSync, statSync } from "node:fs";
import { basename, extname, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { refuse } from "./fields.ts";

/** A directory a contribution may read files from, already resolved through every symlink. */
export type Root = { name: "project" | "scratch"; dir: string };
export type Captured = { revision: string; file: string; size: number; name: string; from: { root: string; path: string } };


const BLOCKED_TAGS = new Set(["script", "iframe", "frame", "frameset", "object", "embed", "applet", "portal", "link", "meta", "base", "style", "form", "input", "button", "textarea", "select", "template", "noscript", "noembed", "noframes", "plaintext", "xmp", "set", "animate", "animatemotion", "animatetransform", "handler", "listener", "foreignobject"]);
const NAMED_ENTITIES: Record<string, string> = { colon: ":", tab: "\t", newline: "\n", nbsp: " " };

/** Problems in captured SVG or historical HTML, parsed as the browser parses markup. SVG may retain `<style>`. */
export function unsafeMarkup(markup: string, allowStyle = false): string[] {
  const problems: string[] = [];
  new HTMLRewriter()
    .on("*", {
      element(el) {
        const tag = el.tagName.toLowerCase();
        if (BLOCKED_TAGS.has(tag) && !(allowStyle && tag === "style")) problems.push(`<${el.tagName}> is not allowed`);
        for (const [name, value] of el.attributes) {
          if (name.toLowerCase().startsWith("on")) problems.push(`the ${name} attribute on <${el.tagName}> is not allowed`);
          const decoded = value
            .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
            .replace(/&#(\d+);?/g, (_, n) => String.fromCodePoint(Number(n)))
            .replace(/&([a-z]+);/gi, (m, n) => NAMED_ENTITIES[n.toLowerCase()] ?? m)
            .replace(/[\u0000-\u0020]/g, "")
            .toLowerCase();
          if (/^(javascript|vbscript|data):/.test(decoded)) problems.push(`the ${name} attribute on <${el.tagName}> holds a ${decoded.split(":")[0]}: URL`);
        }
      },
    })
    .transform(markup);
  if (/@import|javascript:|expression\(/i.test(markup)) problems.push("its styles import a file or hold a script URL");
  return problems;
}

const starts = (b: Uint8Array, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

function imageExt(b: Uint8Array): string | undefined {
  if (starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (starts(b, [0xff, 0xd8, 0xff])) return "jpg";
  if (starts(b, ascii("GIF87a")) || starts(b, ascii("GIF89a"))) return "gif";
  if (starts(b, ascii("RIFF")) && starts(b, ascii("WEBP"), 8)) return "webp";
  return undefined;
}
function videoExt(b: Uint8Array): string | undefined {
  if (starts(b, ascii("ftyp"), 4)) return "mp4";
  if (starts(b, [0x1a, 0x45, 0xdf, 0xa3])) return "webm";
  return undefined;
}
const DOWNLOAD_EXTS = new Set(["txt", "log", "json", "jsonl", "ndjson", "csv", "tsv", "md", "patch", "diff", "zip", "gz", "tgz", "tar", "pdf"]);

function locate(path: string, roots: Root[], cwd: string, where: string): { real: string; root: Root } {
  const lexical = resolve(cwd, path);
  let real: string;
  try {
    real = realpathSync(lexical);
  } catch {
    return refuse(where, `${path} does not exist`);
  }
  const inside = (p: string) => roots.find((r) => p === r.dir || p.startsWith(r.dir + sep));
  const root = inside(real);
  if (!root) {
    if (inside(lexical)) refuse(where, `${path} is a symlink that leads outside the project and its Scratch dir`);
    refuse(where, `${path} is outside the project and its Scratch dir; attach only files inside them`);
  }
  if (!statSync(real).isFile()) refuse(where, `${path} is not a regular file`);
  return { real, root: root! };
}

/** Reads and checks the file an attachment of `type` names, without writing anything. */
export function capture(path: string, type: string, roots: Root[], cwd: string, where: string): Captured & { bytes: Uint8Array } {
  const { real, root } = locate(path, roots, cwd, where);
  const bytes = new Uint8Array(readFileSync(real));
  let ext: string;
  if (type === "image") ext = imageExt(bytes) ?? refuse(where, `${path} is not a PNG, JPEG, GIF, or WebP image`);
  else if (type === "video") ext = videoExt(bytes) ?? refuse(where, `${path} is not an MP4 or WebM video`);
  else if (type === "svg") {
    const svg = new TextDecoder().decode(bytes).replace(/^\uFEFF/, "").replace(/<\?xml[^>]*\?>\s*/, "").trim();
    if (!svg.startsWith("<svg")) refuse(where, `${path} must be an <svg> document`);
    const problems = unsafeMarkup(svg, true);
    if (problems.length) refuse(where, `${path} is not safe: ${problems.join("; ")}`);
    ext = "svg";
  } else if (type === "mermaid") {
    let source: string;
    try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return refuse(where, `${path} is not UTF-8 text`); }
    // The reader renders the source with this Pele version and these options, so a source it cannot render is refused now.
    // Pele loads here, not at the top: every CLI command imports this module, and most never capture Mermaid.
    const { render } = require("pele") as typeof import("pele");
    try { render(source.replace(/^\uFEFF/, ""), { links: false, images: false }); } catch (e) { refuse(where, `${path} is not Mermaid that Pele renders: ${(e as Error).message}`); }
    ext = "mmd";
  } else {
    const own = extname(real).slice(1).toLowerCase();
    ext = DOWNLOAD_EXTS.has(own) ? own : "bin";
  }
  const revision = createHash("sha256").update(bytes).digest("hex");
  const stem = basename(real, extname(real)).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+/, "") || "attachment";
  return { revision, file: `${revision}/${stem}.${ext}`, size: bytes.length, name: basename(real), from: { root: root.name, path: relative(root.dir, real) }, bytes };
}

/** The canonical file a Result was made from, with the sha256 of its bytes now. Its content is not stored. */
export function canonicalFile(path: string, roots: Root[], cwd: string, where: string): { file: string; root: string; sha256: string } {
  const { real, root } = locate(path, roots, cwd, where);
  return { file: relative(root.dir, real), root: root.name, sha256: createHash("sha256").update(readFileSync(real)).digest("hex") };
}

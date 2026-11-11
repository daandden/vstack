#!/usr/bin/env node
/*
MIT License

Copyright (c) 2026 Vojta Holik

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/* vstack original, derived from vojtaholik/good-css scripts/check-css.mjs at
   92d436ba1937d1b1407c47e35abb3e199eaace2e. vstack maintains this copy.
   Checks hover gating, focus outlines, and color notation in CSS files and
   HTML style blocks. Violations print as path:line and exit with code 1. */

/* Blank comments, strings, and url() without moving line numbers. */
const blank = (text, pattern) => text.replace(pattern, (match) => match.replace(/[^\n]/g, " "));
const quiet = (css) => blank(css, /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|url\([^)]*\)/g);

/* Everything outside <style> becomes spaces. */
const styleBlocks = (html) => {
  const kept = html.replace(/[^\n]/g, " ").split("");
  for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const start = match.index + match[0].indexOf(">") + 1;
    for (let index = 0; index < match[1].length; index++) kept[start + index] = match[1][index];
  }
  return kept.join("");
};

/* Yields each rule and declaration with its enclosing blocks. */
function* read(css) {
  const text = quiet(css);
  const blocks = [];
  let chunk = "";
  let chunkLine = null;
  let line = 1;

  for (const char of text) {
    if (char === "{" || char === "}" || char === ";") {
      const source = chunk.trim();
      const at = chunkLine ?? line;
      if (char === "{") {
        yield { type: "rule", prelude: source, line: at, blocks: [...blocks] };
        blocks.push(source);
      } else {
        const colon = source.indexOf(":");
        if (colon > 0 && !source.startsWith("@")) {
          yield {
            type: "declaration",
            property: source.slice(0, colon).trim().toLowerCase(),
            value: source.slice(colon + 1).trim(),
            line: at,
            blocks: [...blocks],
          };
        }
        if (char === "}") blocks.pop();
      }
      chunk = "";
      chunkLine = null;
    } else {
      if (chunkLine === null && /\S/.test(char)) chunkLine = line;
      chunk += char;
    }
    if (char === "\n") line++;
  }
}

/* Returns violations as { line, rule, message }. */
export function check(css) {
  const found = [];
  for (const node of read(css)) {
    const report = (rule, message) => found.push({ line: node.line, rule, message });
    const queries = node.blocks.filter((block) => block.startsWith("@media")).join(" ");

    if (node.type === "rule") {
      const gated = /\(\s*hover\s*:\s*hover\s*\)/.test(queries) && /\(\s*pointer\s*:\s*fine\s*\)/.test(queries);
      if (!node.prelude.startsWith("@") && /:hover\b/.test(node.prelude) && !gated)
        report("hover", "Put this `:hover` rule inside `@media (hover: hover) and (pointer: fine)`.");
      continue;
    }

    const { property, value } = node;
    const lower = value.toLowerCase();
    if ((property === "outline" && /^(none|0)\b/.test(lower)) || (property === "outline-style" && lower.startsWith("none")))
      report("outline", "Never remove the outline. Style focus with `:focus-visible` and `outline`.");

    /* A mask reads only the alpha of its colors. */
    if (!/^(-webkit-)?mask(-image)?$/.test(property) && /#[0-9a-f]{3,8}(?![\w-])|(?<![\w-])(rgba?|hsla?)\(/.test(lower))
      report("color", "Write the color in `oklch()`, with `none` as the hue of a gray, white or black.");
  }
  return found;
}

/* Returns null when a file has no CSS this script can read. */
export const checkFile = (path) => {
  const text = readFileSync(path, "utf8");
  if (path.endsWith(".css")) return check(text);
  return /<style\b/i.test(text) ? check(styleBlocks(text)) : null;
};

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = process.argv.slice(2);
  if (!paths.length) {
    console.error("Usage: node check-css.mjs <file> [<file> ...]");
    process.exit(2);
  }

  let checked = 0;
  let count = 0;
  for (const path of paths) {
    const violations = checkFile(path);
    if (!violations) {
      console.log(`${path} Not checked. It has no <style> block.`);
      continue;
    }
    checked++;
    for (const violation of violations) {
      console.log(`${path}:${violation.line} ${violation.message}`);
      count++;
    }
  }

  if (count) process.exit(1);
  console.log(`No violations in ${checked} ${checked === 1 ? "file" : "files"}.`);
}

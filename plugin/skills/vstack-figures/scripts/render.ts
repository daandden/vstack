// Renders one Mermaid figure to a Catppuccin Mocha SVG with Pele. No browser, no Python.
//
//   bun render.ts <source.mmd | -> <out.svg> [--focus <mermaid-id>]...
//
// `-` reads the Mermaid from stdin. Each --focus id gets a mauve stroke and text rule.
// The script inserts one <style> as the first child of the root <svg>. That style sets every
// --pele-* variable on .pele, so the file looks the same inline, on a Grilling page, or alone.
// An inline <style> applies to the whole page, so the root also gets a class made from the output
// path, and the focal rules select only under it.
// Exit 0 writes the SVG and prints its absolute path. Exit 1 prints Pele's parse error and writes
// nothing. Exit 2 is a usage error.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { render } from "pele";

const USAGE = "Usage: bun render.ts <source.mmd | -> <out.svg> [--focus <mermaid-id>]...";
const FONT = "'IosevkaTerm Nerd Font Mono', ui-monospace, monospace";
const MAUVE = "#cba6f7";
const MOCHA = `.pele {
	--pele-bg: #1e1e2e; --pele-fg: #cdd6f4;
	--pele-fg-on-light: #11111b; --pele-fg-on-dark: #cdd6f4;
	--pele-muted: #a6adc8; --pele-line: #bac2de;
	--pele-surface: #313244; --pele-surface-alt: #181825; --pele-border: #6c7086;
	--pele-accent: #cba6f7; --pele-critical: #f38ba8; --pele-error: #f38ba8;
	--pele-font: ${FONT};
	--pele-font-mono: ${FONT};
	--pele-series-1: #cba6f7; --pele-series-2: #a6e3a1; --pele-series-3: #94e2d5; --pele-series-4: #fab387;
	--pele-series-5: #89b4fa; --pele-series-6: #f9e2af; --pele-series-7: #f5c2e7; --pele-series-8: #89dceb;
}
.pele text { font-variant-ligatures: none; }`;

function usage(message: string): never {
	console.error(`${message}\n${USAGE}`);
	process.exit(2);
}

/** A CSS string body for an attribute selector. It escapes what would end the string or break the
 *  <style> element in XML or HTML. */
const cssString = (id: string) => id.replace(/["\\&<>\n\r\f]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `);

function focusRules(scope: string, id: string) {
	const sel = `.${scope} [data-id="${cssString(id)}"]`;
	const shapes = ":is(rect, path, polygon, circle, ellipse)";
	return `${sel}${shapes}, ${sel} ${shapes} { stroke: ${MAUVE}; stroke-width: 2.5px; }\n${sel} text { fill: ${MAUVE}; }`;
}

function rootTagEnd(svg: string): number {
	if (!svg.startsWith("<svg")) throw new Error("Pele returned no root <svg>");
	let quote = "";
	for (let i = 4; i < svg.length; i++) {
		const c = svg[i]!;
		if (quote) { if (c === quote) quote = ""; }
		else if (c === '"' || c === "'") quote = c;
		else if (c === ">") return i + 1;
	}
	throw new Error("Pele returned an unterminated <svg> tag");
}

let args;
try {
	args = parseArgs({ allowPositionals: true, strict: true, options: { focus: { type: "string", multiple: true } } });
} catch (e) {
	usage((e as Error).message);
}
if (args.positionals.length !== 2) usage("Name one Mermaid source and one output SVG.");
const [input, output] = args.positionals as [string, string];
const focus = args.values.focus ?? [];
if (focus.some((id) => id === "")) usage("--focus needs a Mermaid id.");

let source: string;
try {
	source = input === "-" ? await Bun.stdin.text() : readFileSync(input, "utf8");
} catch (e) {
	usage(`Cannot read ${input}: ${(e as Error).message}`);
}

let svg: string;
try {
	svg = render(source, { fontFamily: FONT }).svg;
} catch (e) {
	console.error((e as Error).message);
	process.exit(1);
}

const out = resolve(output);
const scope = `pele-f${new Bun.CryptoHasher("sha256").update(out).digest("hex").slice(0, 8)}`;
const style = `<style>\n${[MOCHA, ...focus.map((id) => focusRules(scope, id))].join("\n")}\n</style>`;
const end = rootTagEnd(svg);
const root = svg.slice(0, end).replace(/ class="(pele [^"]*)"/, ` class="$1 ${scope}"`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${root}${style}${svg.slice(end)}\n`);
console.log(out);

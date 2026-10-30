// The public Bun CLI for caller-authored Pele figures. Palette and identity rules stay private.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { parse, render } from "pele";
import { bindingsDocument, FONT, palette, type Binding } from "./palette.ts";

const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const WIDE = /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/u;
// IosevkaTerm uses half-em cells in every face. Fallback fonts and other Unicode widths may differ.
const fontMeasurer = {
	width(text: string, size: number, style: number) {
		let cells = 0;
		for (const { segment } of GRAPHEMES.segment(text)) cells += WIDE.test(segment) ? 2 : 1;
		// Pele passes the base size for Sub (8) and Sup (16), including combined style flags.
		return cells * size * 0.5 * (style & 24 ? 0.75 : 1);
	},
};

const USAGE = "Usage: bun render.ts <source.mmd | -> <out.svg> [--focus <mermaid-id>]... [--bindings <bindings.json>]";
function usage(message: string): never {
	console.error(`${message}\n${USAGE}`);
	process.exit(2);
}

function readabilityRules(scope: string) {
	// Pele emits "smaller", which Chromium renders at 13.33px for a 16px label, not 12px.
	// Fix the output size explicitly so script measurement and browser text use the same scale.
	return `.${scope} tspan[baseline-shift] { font-size: 75%; }
.${scope}:is(.pele-wardley, .pele-venn) text, .${scope} .pele-edge-label text, .${scope} .pele-cluster-label {
	paint-order: stroke fill; stroke: #1e1e2e; stroke-width: 0.12em; stroke-linejoin: round;
}`;
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
	args = parseArgs({ allowPositionals: true, strict: true, options: { focus: { type: "string", multiple: true }, bindings: { type: "string" } } });
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

let bindings: Binding[] = [];
if (args.values.bindings !== undefined) {
	try {
		bindings = bindingsDocument(JSON.parse(readFileSync(args.values.bindings, "utf8")));
	} catch (e) {
		usage(`Cannot read bindings: ${(e as Error).message}`);
	}
}

const out = resolve(output);
const scope = `pele-f${new Bun.CryptoHasher("sha256").update(out).digest("hex").slice(0, 8)}`;
let svg: string;
let style: string;
try {
	const config = { flowchart: { curve: "step" as const } };
	const model = parse(source, { config });
	const painted = palette(render(model, {
		fontFamily: FONT, fontFamilyMono: FONT, measurer: fontMeasurer, config,
	}).svg, model, bindings, focus, scope);
	svg = painted.svg;
	style = `<style>\n${painted.css}\n${readabilityRules(scope)}\n</style>`;
} catch (e) {
	console.error((e as Error).message);
	process.exit(1);
}
const end = rootTagEnd(svg);
const root = svg.slice(0, end).replace(/ class="(pele [^"]*)"/, ` class="$1 ${scope}"`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${root}${style}${svg.slice(end)}\n`);
console.log(out);

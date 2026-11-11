import { palette } from "#figures/palette";
import { DIAGRAM_CONFIG, readabilityRules } from "../../../plugin/skills/vstack-figures/scripts/presentation.ts";

/** The font Pele measures each label in, and the font the label is drawn in. */
export const DIAGRAM_FONT = "'IosevkaTerm Nerd Font Mono', ui-monospace, monospace";

const SVG = "http://www.w3.org/2000/svg";
const ELEMENTS = new Set([
  "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "textPath", "title", "desc",
  "defs", "marker", "clipPath", "mask", "linearGradient", "radialGradient", "stop", "pattern", "symbol", "use",
]);
const UNSAFE = /url\(\s*(?!['"]?#)|@import|javascript:|vbscript:|data:|expression\(/i;
const SHAPES = ":is(rect, path, polygon, circle, ellipse)";

const MOCHA_PAINTS: Record<string, string> = {
  "#1e1e2e": "bg", "#cdd6f4": "fg", "#11111b": "fg-on-light",
  "#a6adc8": "muted", "#bac2de": "line", "#313244": "surface",
  "#181825": "surface-alt", "#45475a": "surface-1", "#6c7086": "border",
  "#cba6f7": "accent", "#f38ba8": "critical", "#a6e3a1": "series-2",
  "#94e2d5": "series-3", "#fab387": "series-4", "#89b4fa": "series-5",
  "#f9e2af": "series-6", "#f5c2e7": "series-7", "#89dceb": "series-8",
  "#b4befe": "lavender",
};
const PAINT_ATTRIBUTES = new Set(["fill", "stroke", "color", "stop-color", "flood-color", "lighting-color"]);
function themedPaint(value: string): string {
  return value.replace(/#[0-9a-f]{6}\b/gi, (hex) => {
    const token = MOCHA_PAINTS[hex.toLowerCase()];
    return token ? `var(--pele-${token})` : hex;
  });
}

export type Drawn = { svg: SVGSVGElement; css: string };

function clean(root: Element): SVGSVGElement {
  for (const el of [...root.querySelectorAll("*")]) {
    if (el.namespaceURI === SVG && el.localName === "a") el.replaceWith(...el.childNodes);
    else if (el.namespaceURI !== SVG || !ELEMENTS.has(el.localName)) el.remove();
  }
  for (const el of [root, ...root.querySelectorAll("*")]) {
    for (const { name, value } of [...el.attributes]) {
      const local = name.slice(name.indexOf(":") + 1).toLowerCase();
      if (local.startsWith("on") || (local === "href" && !value.startsWith("#")) || UNSAFE.test(value)) el.removeAttribute(name);
      else if (PAINT_ATTRIBUTES.has(local) && !value.includes("url(")) el.setAttribute(name, themedPaint(value));
    }
    const style = el.getAttribute("style");
    if (style) el.setAttribute("style", style.replace(/((?:^|;)\s*(?:fill|stroke|color|stop-color|flood-color|lighting-color|--[\w-]+)\s*:)([^;]*)/gi,
      (declaration, property, value) => value.includes("url(") ? declaration : property + themedPaint(value)));
  }
  return root as SVGSVGElement;
}

function parse(markup: string): SVGSVGElement | undefined {
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
  const root = doc.documentElement;
  if (root.namespaceURI !== SVG || root.localName !== "svg" || doc.getElementsByTagNameNS("*", "parsererror").length) return undefined;
  return root as unknown as SVGSVGElement;
}

function focusRules(ids: string[]): string {
  return ids.map((id) => {
    const sel = `[data-id="${CSS.escape(id)}"]`;
    return `${sel}${SHAPES}, ${sel} ${SHAPES} { stroke: var(--pele-accent) !important; stroke-width: 2.5px !important; }`;
  }).join("\n");
}

function storedFocus(css: string): string[] {
  const unescape = (s: string) => s.replace(/\\([0-9a-fA-F]{1,6}) ?|\\(.)/g, (_, hex?: string, ch?: string) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : ch!));
  return [...new Set([...css.matchAll(/\[data-id="((?:[^"\\]|\\.)*)"\]/g)].map((m) => unescape(m[1]!)))];
}

/** Measures label widths with page text in the diagram font, so each label gets the width it is drawn at. WebKit's
 *  canvas skips a user-installed first family when a fallback follows it, and Pele measures with a canvas by default. */
function pageMeasurer(probe: HTMLElement) {
  const widths = new Map<string, number>();
  return {
    // `style` holds Pele's text style bits: 1 bold, 2 italic, 4 monospace, 8 subscript, 16 superscript.
    width(text: string, size: number, style: number): number {
      const font = `${style & 2 ? "italic " : ""}${style & 1 ? "bold " : ""}${style & 24 ? size / 1.2 : size}px ${DIAGRAM_FONT}`;
      const key = `${font}\n${text}`;
      let w = widths.get(key);
      if (w === undefined) {
        probe.style.font = font;
        probe.textContent = text;
        w = probe.getBoundingClientRect().width;
        widths.set(key, w);
      }
      return w;
    },
  };
}

export async function drawMermaid(source: string, focus: string[]): Promise<Drawn> {
  await document.fonts.ready;
  const { detectType, load, parse: parseModel, render } = await import("pele/lazy");
  await load(detectType(source));
  const probe = document.createElement("span");
  probe.className = "fixed [inset-block-start:0] [inset-inline-start:0] invisible pointer-events-none whitespace-pre tracking-normal [word-spacing:normal] [font-kerning:normal] [font-variant-ligatures:none]";
  probe.setAttribute("aria-hidden", "true");
  document.body.append(probe);
  try {
    const fontSize = parseFloat(getComputedStyle(document.body).fontSize);
    const model = parseModel(source, { config: DIAGRAM_CONFIG });
    const { svg } = render(model, { config: DIAGRAM_CONFIG, measurer: pageMeasurer(probe), fontFamily: DIAGRAM_FONT, fontFamilyMono: DIAGRAM_FONT, fontSize, links: false, images: false });
    let painted = svg;
    let css = "";
    try {
      painted = palette(svg, model, [], focus, "pele-reader", source).svg;
      css = "svg { background: var(--pele-bg); }";
    } catch {
      css = focusRules(focus);
    }
    const root = parse(painted);
    if (!root) throw new Error("Pele returned no SVG");
    return { svg: clean(root), css: `${readabilityRules(".pele", "var(--pele-bg)")}\n${css}` };
  } finally {
    probe.remove();
  }
}

/** A captured SVG that Pele drew, re-themed from its own CSS variables, or undefined for any other SVG. Its stored
 *  palette block is dropped; its focus rules are kept in the theme's accent. */
export function derivePele(markup: string): Drawn | undefined {
  const root = parse(markup);
  if (!root || !root.classList.contains("pele")) return undefined;
  const css = [...root.getElementsByTagNameNS(SVG, "style")].map((s) => s.textContent ?? "").join("\n");
  return { svg: clean(root), css: focusRules(storedFocus(css)) };
}

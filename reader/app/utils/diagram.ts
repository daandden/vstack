// Diagrams render in the page, so their labels use the fonts this browser measured them with. A Mermaid attachment
// is drawn by the pinned Pele, loading only the code for its diagram type. A captured SVG that Pele drew earlier is
// shown from its stored bytes without its embedded palette. Both take every color from the `--pele-*` variables
// that reader.css sets per theme, so a theme switch restyles them without drawing again. Any other SVG stays in an
// <img>, where it cannot reach the page.

/** The font Pele measures each label in, and the font the label is drawn in. */
export const DIAGRAM_FONT = "'IosevkaTerm Nerd Font Mono', ui-monospace, monospace";

const SVG = "http://www.w3.org/2000/svg";
const ELEMENTS = new Set([
  "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "textPath", "title", "desc",
  "defs", "marker", "clipPath", "mask", "linearGradient", "radialGradient", "stop", "pattern", "symbol", "use",
]);
// Anything that could load a resource or run code: a URL that leaves the document, an import, or a script URL.
const UNSAFE = /url\(\s*(?!['"]?#)|@import|javascript:|vbscript:|data:|expression\(/i;
const SHAPES = ":is(rect, path, polygon, circle, ellipse)";

export type Drawn = { svg: SVGSVGElement; css: string };

/** The SVG with only drawing elements and attributes kept: no script, handler, link, style, image, or outside URL. */
function clean(root: Element): SVGSVGElement {
  for (const el of [...root.querySelectorAll("*")]) {
    if (el.namespaceURI === SVG && el.localName === "a") el.replaceWith(...el.childNodes);
    else if (el.namespaceURI !== SVG || !ELEMENTS.has(el.localName)) el.remove();
  }
  for (const el of [root, ...root.querySelectorAll("*")]) {
    for (const { name, value } of [...el.attributes]) {
      const local = name.slice(name.indexOf(":") + 1).toLowerCase();
      if (local.startsWith("on") || (local === "href" && !value.startsWith("#")) || UNSAFE.test(value)) el.removeAttribute(name);
    }
  }
  return root as SVGSVGElement;
}

function parse(markup: string): SVGSVGElement | undefined {
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
  const root = doc.documentElement;
  if (root.namespaceURI !== SVG || root.localName !== "svg" || doc.getElementsByTagNameNS("*", "parsererror").length) return undefined;
  return root as unknown as SVGSVGElement;
}

/** Marks each focal Mermaid id in the theme's accent, as vstack-figures' render script does in Mocha mauve. */
function focusRules(ids: string[]): string {
  return ids.map((id) => {
    const sel = `[data-id="${CSS.escape(id)}"]`;
    return `${sel}${SHAPES}, ${sel} ${SHAPES} { stroke: var(--pele-accent); stroke-width: 2.5px; }\n${sel} text { fill: var(--pele-accent); }`;
  }).join("\n");
}

/** The focal ids a stored figure's own focus rules name, read from its `[data-id="…"]` selectors. */
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

/** Draws Mermaid source with the pinned Pele, without links or images. */
export async function drawMermaid(source: string, focus: string[]): Promise<Drawn> {
  await document.fonts.ready;
  const { renderAsync } = await import("pele/lazy");
  const probe = document.createElement("span");
  probe.className = "diagram-measure";
  probe.setAttribute("aria-hidden", "true");
  document.body.append(probe);
  try {
    const { svg } = await renderAsync(source, { measurer: pageMeasurer(probe), fontFamily: DIAGRAM_FONT, fontFamilyMono: DIAGRAM_FONT, links: false, images: false });
    const root = parse(svg);
    if (!root) throw new Error("Pele returned no SVG");
    return { svg: clean(root), css: focusRules(focus) };
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

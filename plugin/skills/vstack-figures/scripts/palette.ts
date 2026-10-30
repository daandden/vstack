import type { DiagramModel, FlowchartModel } from "pele";

export const FONT = "'IosevkaTerm Nerd Font Mono', ui-monospace, monospace";
const BASE = "#1e1e2e", TEXT = "#cdd6f4", SURFACE = "#313244", BORDER = "#6c7086", MAUVE = "#cba6f7";
const ROLES: Record<string, string> = {
  ok: "#a6e3a1", warn: "#f9e2af", bad: "#f38ba8", changed: "#89b4fa",
  actor: "#f5c2e7", store: "#94e2d5", external: "#fab387",
};
const ACCENTS = ["#f5e0dc", "#f2cdcd", "#f5c2e7", "#f38ba8", "#eba0ac", "#fab387", "#f9e2af", "#a6e3a1", "#94e2d5", "#89dceb", "#74c7ec", "#89b4fa", "#b4befe"];
export type Binding = { id: string; role?: string; category?: string };
type Target = { id: string; role?: string; category?: string; intrinsic?: string; line?: boolean };
const PELE_CLASS = /^(?:pele|usecase-|system-boundary)|^highlight$/;
const SHAPE = new Set(["rect", "path", "polygon", "circle", "ellipse", "line", "polyline"]);
const PAINT = new Set(["fill", "stroke", "color", "stop-color", "background", "background-color"]);
const decode = (s: string) => s.replace(/&(?:quot|apos|amp|lt|gt|#\d+|#x[\da-f]+);/gi, (s) => ({ "&quot;": '"', "&apos;": "'", "&amp;": "&", "&lt;": "<", "&gt;": ">" })[s] ?? String.fromCodePoint(parseInt(s.slice(s[2] === "x" ? 3 : 2, -1), s[2] === "x" ? 16 : 10)));

export function bindingsDocument(value: unknown): Binding[] {
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  if (!object(value) || Object.keys(value).some((k) => k !== "elements") || !Array.isArray(value.elements)) throw new Error("Bindings must contain an elements array.");
  return value.elements.map((entry, index) => {
    if (!object(entry) || Object.keys(entry).some((k) => !["id", "role", "category"].includes(k)) || typeof entry.id !== "string" || !entry.id.trim() || (Object.hasOwn(entry, "role") === Object.hasOwn(entry, "category")) || (Object.hasOwn(entry, "role") && typeof entry.role !== "string") || (Object.hasOwn(entry, "category") && (typeof entry.category !== "string" || !entry.category.trim()))) throw new Error(`Binding ${index + 1} needs a source id and exactly one role or nonempty category key; selectors and paints are unsupported.`);
    return entry as Binding;
  });
}

function role(name: string) {
  if (!Object.hasOwn(ROLES, name)) throw new Error(`Unknown color role: ${name}. Use one of: ${Object.keys(ROLES).join(", ")}.`);
  return name;
}
function assign(target: Target, key: "role" | "category", value: string) {
  if (key === "role") role(value);
  if (target[key] !== undefined && target[key] !== value) throw new Error(key === "role" ? `Element ${target.id} has more than one color role: ${target.role}, ${value}.` : `Element ${target.id} has conflicting category keys: ${target.category}, ${value}.`);
  target[key] = value;
}
function classes(target: Target, names: string[]) {
  for (const name of names) if (name && !PELE_CLASS.test(name)) assign(target, "role", name);
}
function categoryColor(key: string) {
  // FNV-1a over UTF-8 fixes the mapping across processes and diagram families.
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(key)) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
  return ACCENTS[hash % ACCENTS.length]!;
}
function flowTargets(model: FlowchartModel) {
  const declarations = [
    ...[...model.classes.values()].flatMap((c) => [...c.styles, ...c.textStyles]),
    ...[...model.nodes.values()].flatMap((n) => n.styles),
    ...model.edges.flatMap((e) => e.style ?? []),
    ...(model.defaultEdgeStyle ?? []),
  ];
  for (const declaration of declarations) {
    const colon = declaration.indexOf(":");
    if (colon > 0) refusePaint(declaration.slice(0, colon).trim(), declaration.slice(colon + 1), true);
  }
  const targets = new Map<string, Target[]>();
  const add = (id: string, names: string[], intrinsic?: string, line = false) => {
    const t: Target = { id, intrinsic, line };
    for (const name of names) assign(t, "role", name);
    targets.set(id, [...(targets.get(id) ?? []), t]);
  };
  const groups = new Set(model.subgraphs.map((g) => g.id));
  for (const n of model.nodes.values()) {
    if (groups.has(n.id)) continue;
    const intrinsic = n.type === "person" ? "actor" : ["cylinder", "cyl", "database", "db", "disk", "lin-cyl"].includes(n.type ?? "") ? "store" : undefined;
    add(n.id, n.classes, intrinsic, n.type === "text");
  }
  for (const g of model.subgraphs) add(g.id, g.classes);
  for (const e of model.edges) if (e.isUserDefinedId && e.id) add(e.id, e.classes, undefined, true);
  return targets;
}

function themed(value: string) {
  let rest = value;
  for (let before = ""; before !== rest;) { before = rest; rest = rest.replace(/var\([^()]*(?:\([^()]*\))?[^()]*\)/g, " "); }
  return /^(?:\s|[(),]|\d+(?:\.\d+)?%|color-mix|in|srgb|none|transparent|currentColor|inherit)*$/.test(rest);
}
function refusePaint(prop: string, value: string, authored = false) {
  if (PAINT.has(prop) && (authored || !themed(value))) throw new Error(`The Mermaid sets its own color (${prop}:${value.trim()}). Remove the classDef, style, or linkStyle line, or the color in a sequence rect or box, and mark the element with a color role.`);
}

export function palette(svg: string, model: DiagramModel, bindings: Binding[], focus: string[], scope: string): { svg: string; css: string } {
  const targets = model.type === "flowchart" ? flowTargets(model) : new Map<string, Target[]>();
  // Family resolvers return semantic identities, not DOM counts. Later families extend this dispatch.
  for (const binding of bindings) {
    if (binding.role !== undefined) role(binding.role);
    if (model.type !== "flowchart") throw new Error(`Unsupported binding target ${binding.id}: ${model.type} does not yet expose binding identities.`);
    const matches = targets.get(binding.id);
    if (!matches?.length) throw new Error(`Missing binding target: ${binding.id}. Use a declared flowchart node, subgraph, or edge id.`);
    if (matches.length !== 1) throw new Error(`Ambiguous binding target: ${binding.id}. It names ${matches.length} source targets.`);
    assign(matches[0]!, binding.role !== undefined ? "role" : "category", binding.role ?? binding.category!);
  }
  const stack: { name: string; target?: Target; focused: boolean }[] = [];
  svg = svg.replace(/<\/?[\w:-]+\b(?:"[^"]*"|'[^']*'|[^'">])*>/g, (tag) => {
    if (tag.startsWith("</")) { stack.pop(); return tag; }
    const name = /^<([\w:-]+)/.exec(tag)![1]!;
    const attrs = new Map([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1]!, decode(m[2]!)]));
    for (const [prop, value] of attrs) {
      refusePaint(prop, value);
      if (prop === "style") for (const decl of value.split(";")) { const colon = decl.indexOf(":"); if (colon > 0) refusePaint(decl.slice(0, colon).trim(), decl.slice(colon + 1)); }
    }
    const id = attrs.get("data-id"), ownClasses = (attrs.get("class") ?? "").split(/\s+/);
    const parent = stack.at(-1);
    let target = parent?.target, focused = parent?.focused ?? false;
    if (id !== undefined || ownClasses.some((c) => c === "pele-node" || c === "pele-cluster")) {
      target = id === undefined ? { id: "unnamed" } : targets.get(id)?.[0] ?? { id };
      if (ownClasses.some((c) => c === "pele-node" || c === "pele-cluster")) classes(target, ownClasses);
      focused = id !== undefined && focus.includes(id);
    }
    const accent = target?.role ? ROLES[target.role] : target?.category !== undefined ? categoryColor(target.category) : target?.intrinsic ? ROLES[target.intrinsic] : undefined;
    const invisible = attrs.get("fill") === "none" && attrs.get("stroke") === "none";
    if (!invisible && (accent || focused) && (SHAPE.has(name) || name === "text")) {
      const line = target?.line || ownClasses.includes("pele-edge") || parent?.name === "line";
      const fill = line && !ownClasses.includes("pele-marker") ? "none" : accent;
      const paint = name === "text"
        ? `fill:${focused ? MAUVE : line ? accent : BASE}`
        : `${accent && !["line", "polyline"].includes(name) ? `fill:${fill};` : ""}stroke:${focused ? MAUVE : accent}${focused ? ";stroke-width:2.5px" : ""}`;
      if (attrs.has("style")) tag = tag.replace(/\bstyle="([^"]*)"/, (_, style) => `style="${style};${paint}"`);
      else tag = tag.replace(/\/?\s*>$/, (end) => ` style="${paint}"${end}`);
    }
    if (!tag.endsWith("/>")) stack.push({ name, target, focused });
    return tag;
  });
  // Pele embeds default fallback colors and mixes nested cluster borders. Resolve both to literal Mocha.
  svg = svg.replace(/color-mix\([^()]*(?:\([^()]*\)[^()]*)*\)/g, BORDER).replace(/var\((--[\w-]+),\s*#[\da-f]{3,8}\s*\)/gi, "var($1)");
  const theme = `.${scope} {
background: ${BASE};
--pele-bg: ${BASE}; --pele-fg: ${TEXT}; --pele-fg-on-light: ${BASE}; --pele-fg-on-dark: ${BASE};
--pele-muted: #a6adc8; --pele-line: #bac2de; --pele-surface: ${SURFACE}; --pele-surface-alt: ${SURFACE}; --pele-border: ${BORDER};
--pele-accent: ${BORDER}; --pele-critical: #f38ba8; --pele-error: #f38ba8;
--pele-font: ${FONT}; --pele-font-mono: ${FONT};
${ACCENTS.slice(0, 8).map((c, i) => `--pele-series-${i + 1}: ${c};`).join(" ")}
}
.${scope} text { font-variant-ligatures: none; }`;
  return { svg, css: theme };
}

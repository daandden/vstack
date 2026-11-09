import type { DiagramModel, FlowchartModel } from "pele";
import { sankeyMode } from "./sankey-mode.ts";

export const FONT = "'IosevkaTerm Nerd Font Mono', ui-monospace, monospace";
const BASE = "#1e1e2e", TEXT = "#cdd6f4", SURFACE = "#313244", BORDER = "#6c7086", MAUVE = "#cba6f7";
const ROLES: Record<string, string> = {
  ok: "#a6e3a1", warn: "#f9e2af", bad: "#f38ba8", changed: "#89b4fa",
  actor: "#f5c2e7", store: "#94e2d5", external: "#fab387",
};
const ACCENTS = ["#f5e0dc", "#f2cdcd", "#f5c2e7", "#f38ba8", "#eba0ac", "#fab387", "#f9e2af", "#a6e3a1", "#94e2d5", "#89dceb", "#74c7ec", "#89b4fa", "#b4befe"];
const CHARTS = new Set(["quadrantChart", "xychart", "pie", "sankey", "radar", "treemap", "venn"]);
export type Binding = { id: string; role?: string; category?: string };
type Target = { id: string; role?: string; category?: string; categorical?: string; intrinsic?: string; key?: string; sourceCategory?: string; neutral?: boolean; line?: boolean; loose?: boolean; labelOnly?: boolean; unsupported?: boolean; iconOnly?: boolean; looseLabel?: boolean; edge?: boolean };
const PELE_CLASS = /^(?:pele|usecase-|system-boundary)|^(?:highlight|clickable)$/;
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
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(key)) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
  return ACCENTS[hash % ACCENTS.length]!;
}
function flowTargets(model: FlowchartModel | Extract<DiagramModel, { type: "agentflow" }>) {
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
    for (const name of names) if (name !== "clickable") assign(t, "role", name);
    targets.set(id, [...(targets.get(id) ?? []), t]);
    return t;
  };
  const groups = new Set(model.subgraphs.map((g) => g.id));
  for (const n of model.nodes.values()) {
    if (groups.has(n.id)) continue;
    const intrinsic = n.type === "person" ? "actor" : ["cylinder", "cyl", "database", "db", "disk", "lin-cyl"].includes(n.type ?? "") ? "store" : undefined;
    add(n.id, n.classes, intrinsic, n.type === "text");
  }
  for (const g of model.subgraphs) add(g.id, g.classes);
  for (const e of model.edges) if (e.id && (e.isUserDefinedId || model.type === "agentflow")) {
    const target = add(e.id, e.classes, model.type === "agentflow" && "edgeSemantic" in e && e.edgeSemantic === "failure" ? "bad" : undefined, true);
    target.edge = true;
    target.unsupported = !e.isUserDefinedId;
  }
  if (model.type === "agentflow") {
    for (const vertex of model.semanticModel().vertices) {
      const target = targets.get(vertex.id)?.[0];
      if (!target) continue;
      if (vertex.vertexKind === "refdoc") target.intrinsic = "store";
      else target.key = vertex.vertexKind;
    }
    for (const group of model.subgraphs) targets.get(group.id)![0]!.neutral = true;
    for (const [id, connector] of model.connectors) if (!targets.has(id)) add(id, connector.classes).key = "connector";
  }
  return targets;
}

function entityTargets(model: DiagramModel): Map<string, Target[]> | undefined {
  if (model.type === "class" || model.type === "er" || model.type === "block") {
    const definitions = model.type === "class" ? model.styleClasses : model.classes;
    const declarations = [...definitions.values()].flatMap((definition) => [...definition.styles, ...definition.textStyles]);
    if (model.type === "class") for (const node of model.classes.values()) declarations.push(...node.styles);
    else if (model.type === "er") {
      for (const entity of model.entities.values()) declarations.push(...entity.cssStyles);
      for (const group of model.subgraphs) declarations.push(...group.cssStyles);
    } else for (const node of [...model.byId.values(), ...model.edges]) declarations.push(...(node.styles ?? []));
    for (const declaration of declarations) {
      const colon = declaration.indexOf(":");
      if (colon > 0) refusePaint(declaration.slice(0, colon).trim(), declaration.slice(colon + 1), true);
    }
  }
  const targets = new Map<string, Target[]>();
  const add = (id: string, names: string[] = [], intrinsic?: string, line = false) => {
    const target: Target = { id, intrinsic, line };
    for (const name of names) if (name && name !== "default" && name !== "clickable") assign(target, "role", name);
    targets.set(id, [...(targets.get(id) ?? []), target]);
    return target;
  };
  switch (model.type) {
    case "c4":
      for (const shape of model.shapes) {
        const kinds = shape.kind.split("_");
        add(shape.alias, [], kinds.includes("person") ? "actor" : kinds.includes("external") ? "external" : kinds.includes("db") ? "store" : undefined);
      }
      for (const group of model.boundaries) if (group.type !== "global") add(group.alias);
      break;
    case "er":
      for (const [id, entity] of model.entities) add(id, entity.cssClasses.split(/\s+/));
      for (const group of model.subgraphs) add(group.id, group.classes);
      break;
    case "class":
      for (const node of model.classes.values()) add(node.id, node.cssClasses.split(/\s+/));
      for (const group of model.namespaces.values()) if (group.explicit) add(group.id);
      break;
    case "architecture":
      for (const node of model.nodes.values()) {
        const target = add(node.id, [], node.type === "service" && ["database", "disk"].includes(node.icon ?? "") ? "store" : undefined);
        target.looseLabel = true;
      }
      for (const group of model.groups.values()) add(group.id);
      break;
    case "block":
      for (const node of model.byId.values()) if (node.type !== "space") add(node.id, node.classes, node.type === "cylinder" ? "store" : undefined);
      break;
    case "requirement":
      for (const node of model.requirements.values()) add(node.name, node.classes);
      for (const node of model.elements.values()) add(node.name, node.classes, node.type.toLowerCase() === "file" ? "store" : undefined);
      break;
    case "usecase":
      for (const node of model.actors.values()) add(node.id, node.classes, undefined, true);
      for (const node of model.useCases.values()) add(node.id, node.classes);
      for (const node of model.systemBoundaries.values()) add(node.id, node.classes);
      for (const node of model.jsonNodes.values()) add(node.id, node.classes);
      for (const edge of model.relationships) if (edge.explicitId) add(edge.id, edge.classes, undefined, true).edge = true;
      break;
    case "treeView": {
      const pending = [...model.root.children];
      while (pending.length) {
        const node = pending.pop()!;
        const target = add(node.name, (node.cssClass ?? "").split(/\s+/).filter((name) => name !== "highlight"), node.nodeType === "file" ? "store" : undefined, true);
        target.iconOnly = true;
        pending.push(...node.children);
      }
      break;
    }
    default:
      return undefined;
  }
  return targets;
}

function workTargets(model: DiagramModel) {
  const targets = new Map<string, Target[]>();
  const add = (id: string, options: Partial<Target> = {}) => {
    const target: Target = { id, neutral: true, ...options };
    targets.set(id, [...(targets.get(id) ?? []), target]);
    return target;
  };
  switch (model.type) {
    case "gantt":
      for (const task of model.tasks) {
        const target = add(task.id, { intrinsic: task.done ? "ok" : task.crit ? "warn" : undefined, loose: task.milestone || task.vert });
        classes(target, task.classes);
        target.unsupported = !task.raw.data.slice(1).split(",").some((part) => part.trim() === task.id);
      }
      for (const section of new Set(model.sections)) add(section, { loose: true });
      break;
    case "timeline":
      for (const section of new Set(model.sections)) add(section, { key: section });
      for (const period of model.periods) add(period.text.trim(), { key: period.section || period.text.trim() });
      break;
    case "journey":
      for (const section of new Set(model.sections)) add(section);
      for (const task of model.tasks) add(task.task);
      for (const person of new Set(model.tasks.flatMap((task) => task.people).filter(Boolean))) add(person, { key: person, loose: true });
      break;
    case "kanban":
      for (const section of model.sections) {
        classes(add(section.id), (section.cssClasses ?? "").split(/\s+/));
        for (const item of section.items) classes(add(item.id), (item.cssClasses ?? "").split(/\s+/));
      }
      break;
    case "gitGraph":
      for (const branch of model.lanes) add(branch, { key: branch });
      for (const commit of model.commits.values()) add(commit.id, { key: commit.branch, loose: true, unsupported: !commit.customId });
      break;
  }
  return targets;
}

function spatialTargets(model: DiagramModel) {
  const targets = new Map<string, Target[]>();
  const add = (target: Target) => targets.set(target.id, [...(targets.get(target.id) ?? []), target]);
  if (model.type === "mindmap") {
    const branches = new Map(model.nodes.filter((n) => n.level === 1).map((n) => [n.section, n.descr]));
    for (const node of model.nodes) {
      const target: Target = { id: node.nodeId, sourceCategory: branches.get(node.section), loose: node.type === 0 };
      classes(target, (node.class ?? "").split(/\s+/));
      add(target);
    }
  } else if (model.type === "ishikawa") {
    if (model.root) {
      add({ id: model.root.text });
      for (const category of model.root.children) add({ id: category.text, sourceCategory: category.text });
    }
  } else if (model.type === "wardley") {
    for (const node of model.nodes) add({ id: node.id, loose: true, labelOnly: node.sourceStrategy === "market" });
  } else if (model.type === "cynefin") {
    // These five domains are grammar identities, including the empty regions Pele always draws.
    for (const id of ["complex", "complicated", "clear", "chaotic", "confusion"]) add({ id, sourceCategory: id });
    for (const domain of model.domains.values()) for (const item of domain.items) add({ id: item.label });
  }
  return targets;
}

function chartTargets(model: DiagramModel) {
  const targets = new Map<string, Target[]>();
  const add = (id: string, categorical = id, names: string[] = []) => {
    const target: Target = { id, categorical };
    classes(target, names);
    targets.set(id, [...(targets.get(id) ?? []), target]);
  };
  if (model.type === "pie") for (const name of model.sections.keys()) add(name);
  if (model.type === "sankey") for (const node of model.nodes) add(node.id);
  if (model.type === "quadrantChart") {
    for (const style of [...model.classes.values(), ...model.points]) {
      if (style.color) refusePaint("fill", style.color, true);
      if (style.strokeColor) refusePaint("stroke", style.strokeColor, true);
    }
    for (const point of model.points) add(point.text.text, point.text.text, [point.className]);
    for (const [i, quadrant] of model.quadrants.entries()) if (quadrant) add(`quadrant-${i + 1}`, quadrant.text);
  }
  if (model.type === "xychart") for (const plot of model.plots) if (plot.title) add(plot.title);
  if (model.type === "radar") for (const curve of model.curves) add(curve.name);
  if (model.type === "venn") {
    for (const style of model.styles) for (const [property, value] of style.styles) refusePaint(property, value, true);
    for (const subset of model.subsets) add(subset.sets.join("|"));
    for (const text of model.textNodes) add(text.id);
  }
  if (model.type === "treemap") {
    for (const declarations of model.classes.values()) for (const declaration of declarations) {
      const colon = declaration.indexOf(":");
      if (colon > 0) refusePaint(declaration.slice(0, colon).trim(), declaration.slice(colon + 1), true);
    }
    const visit = (nodes: typeof model.roots) => {
      for (const node of nodes) {
        add(node.name, node.name, node.classSelector?.split(/\s+/) ?? []);
        if (node.children) visit(node.children);
      }
    };
    visit(model.roots);
  }
  return targets;
}

function targetColor(target: Target | undefined, intrinsicEligible = true): string | undefined {
  const category = target?.categorical ?? target?.key ?? target?.sourceCategory;
  return target?.role ? ROLES[target.role] : target?.category !== undefined ? categoryColor(target.category) : intrinsicEligible && target?.intrinsic ? ROLES[target.intrinsic] : category !== undefined ? categoryColor(category) : undefined;
}

function sankeyPaint(svg: string, model: Extract<DiagramModel, { type: "sankey" }>, targets: Map<string, Target[]>, scope: string) {
  const templates = new Map([...svg.matchAll(/<linearGradient\b[^>]*\bid="([^"]+)"[^>]*>[\s\S]*?<\/linearGradient>/g)].map((m) => [m[1]!, m[0]]));
  const gradients: string[] = [];
  let index = 0;
  svg = svg.replace(/<path\b[^>]*>/g, (tag) => {
    if (!/\bclass="pele-sankey-link"/.test(tag)) return tag;
    const link = model.links[index++]!;
    const source = targetColor(targets.get(link.source.id)?.[0])!, destination = targetColor(targets.get(link.target.id)?.[0])!;
    const oldId = /\bfill="url\(#([^)]*)\)/.exec(tag)?.[1];
    if (oldId) {
      const template = templates.get(oldId);
      if (!template) throw new Error("Unsupported Sankey gradient: no endpoint definition.");
      const id = `${scope}-sankey-${index}`;
      let stop = 0;
      gradients.push(template.replace(/\bid="[^"]*"/, `id="${id}"`).replace(/stop-color="[^"]*"/g, () => `stop-color="${stop++ === 0 ? source : destination}"`));
      return tag.replace(/\bfill="[^"]*"/, `fill="url(#${id}) ${source}"`);
    }
    return tag.replace(/\bfill="[^"]*"/, `fill="${sankeyMode(model) === "target" ? destination : source}"`);
  });
  if (gradients.length) svg = svg.replace(/<linearGradient\b[^>]*>[\s\S]*?<\/linearGradient>/g, "").replace("</defs>", `${gradients.join("")}</defs>`);
  return svg;
}

function interactionTargets(model: DiagramModel) {
  if (model.type === "eventmodeling") {
    const targets = new Map<string, Target[]>();
    for (const box of model.boxes) {
      const target: Target = { id: box.id, neutral: true };
      if (box.kind === "readmodel") target.intrinsic = "store";
      else if (box.kind !== "ui") target.key = box.kind;
      targets.set(box.id, [...(targets.get(box.id) ?? []), target]);
    }
    return targets;
  }
  if (model.type === "agentflow") return flowTargets(model);
  if (model.type === "state") {
    const targets = new Map<string, Target[]>();
    const add = (state: { id: string; start?: boolean; classes?: string[] }) => {
      if (state.start !== undefined) return;
      const target = targets.get(state.id)?.[0] ?? { id: state.id };
      for (const name of state.classes ?? []) assign(target, "role", name);
      targets.set(state.id, [target]);
    };
    const visit = (doc: typeof model.rootDoc) => {
      for (const stmt of doc) {
        if (typeof stmt === "string") continue;
        if (stmt.stmt === "relation") { add(stmt.state1); add(stmt.state2); }
        else if (stmt.stmt === "state") { add(stmt); if (stmt.doc) visit(stmt.doc); }
      }
    };
    visit(model.rootDoc);
    for (const [id, state] of model.states) if (targets.has(id)) add(state);
    for (const c of model.classes.values()) for (const declaration of [...c.styles, ...c.textStyles]) {
      const colon = declaration.indexOf(":");
      if (colon > 0) refusePaint(declaration.slice(0, colon).trim(), declaration.slice(colon + 1), true);
    }
    return targets;
  }
  if (model.type !== "sequence") return undefined;
  return new Map([...model.actors].map(([id, actor]) => [id, [{
    id, intrinsic: actor.type === "actor" ? "actor" : actor.type === "database" ? "store" : undefined,
    looseLabel: ["actor", "boundary", "control", "entity", "database"].includes(actor.type),
  } as Target]]));
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
  const work = ["timeline", "gantt", "journey", "kanban", "gitGraph"].includes(model.type);
  const spatial = ["mindmap", "ishikawa", "wardley", "cynefin"].includes(model.type);
  const chart = CHARTS.has(model.type);
  const interaction = interactionTargets(model);
  const resolved = model.type === "flowchart" ? flowTargets(model) : interaction ?? (work ? workTargets(model) : spatial ? spatialTargets(model) : chart ? chartTargets(model) : entityTargets(model));
  const targets = resolved ?? new Map<string, Target[]>();
  const visible = spatial ? new Set([...svg.matchAll(/\bdata-id="([^"]*)"/g)].map((m) => decode(m[1]!))) : undefined;
  const ownsIdentity = (names: string[]) => model.type === "sequence"
    ? names.some((n) => n === "pele-actor" || n === "pele-lifeline")
    : model.type === "state" ? names.some((n) => n === "pele-state" || n === "pele-state-composite")
    : model.type === "eventmodeling" ? names.includes("pele-node")
    : true;
  const interactionVisible = new Set<string>(), emitted = new Set<string>();
  if (interaction) for (const match of svg.matchAll(/<[\w:-]+\b(?:"[^"]*"|'[^']*'|[^'">])*>/g)) {
    const id = /\bdata-id="([^"]*)"/.exec(match[0])?.[1];
    if (id === undefined) continue;
    emitted.add(decode(id));
    if (ownsIdentity((/\bclass="([^"]*)"/.exec(match[0])?.[1] ?? "").split(/\s+/))) interactionVisible.add(decode(id));
  }
  const resolve = (id: string, kind: "binding" | "focus") => {
    const matches = targets.get(id);
    if (!matches?.length) throw new Error(`${emitted.has(id) ? "Unsupported" : "Missing"} ${kind} target: ${id}. Use a declared source id supported by ${model.type}.`);
    if (matches.length !== 1) throw new Error(`Ambiguous ${kind} target: ${id}. It names ${matches.length} source targets.`);
    const target = matches[0]!;
    if (target.unsupported || !interactionVisible.has(id)) throw new Error(`Unsupported ${kind} target ${id}: ${target.unsupported ? "Generated ids are not declared source identities." : "No visible geometry, including children of collapsed flows."}`);
    return target;
  };
  for (const binding of bindings) {
    if (binding.role !== undefined) role(binding.role);
    if (interaction) { assign(resolve(binding.id, "binding"), binding.role !== undefined ? "role" : "category", binding.role ?? binding.category!); continue; }
    if (!resolved) throw new Error(`Unsupported binding target ${binding.id}: ${model.type} does not yet expose binding identities.`);
    const matches = targets.get(binding.id);
    if (!matches?.length) throw new Error(`Missing binding target: ${binding.id}. Use a supported source identity for ${model.type}.`);
    if (matches.length !== 1) throw new Error(`Ambiguous binding target: ${binding.id}. It names ${matches.length} source targets.`);
    if (matches[0]!.unsupported) throw new Error(`Unsupported binding target ${binding.id}: generated ${model.type} ids are not declared source identities.`);
    if (visible && !visible.has(binding.id)) throw new Error(`Unavailable binding target: ${binding.id}. Pele emits no visible geometry for this source target.`);
    assign(matches[0]!, binding.role !== undefined ? "role" : "category", binding.role ?? binding.category!);
  }
  for (const id of focus) {
    if (interaction) { resolve(id, "focus"); continue; }
    if (!resolved) throw new Error(`Unsupported focus target ${id}: ${model.type} does not expose stable focus identities.`);
    const matches = targets.get(id);
    if (!matches?.length) throw new Error(`Missing focus target: ${id}. Use a supported source identity for ${model.type}.`);
    if (matches.length !== 1) throw new Error(`Ambiguous focus target: ${id}. It names ${matches.length} source targets.`);
    if (matches[0]!.unsupported) throw new Error(`Unsupported focus target ${id}: generated ${model.type} ids are not declared source identities.`);
  }
  if (model.type === "journey") {
    svg = svg.replace(/(<circle\b[^>]*class="pele-actor"[^>]*)(>)(<title>([^<]*)<\/title>)/g, (_, start, end, title, person) => `${start} data-id="${person}"${end}${title}`);
  }
  const priorities = new Map<string, string>();
  if (model.type === "kanban") for (const section of model.sections) for (const item of section.items) if (item.priority) priorities.set(item.id, item.priority);
  const crossBranch: Target[] = [], sameBranch: Target[] = [];
  if (model.type === "gitGraph") {
    for (const commit of [...model.commits.values()].sort((a, b) => a.seq - b.seq)) {
      for (const [index, id] of commit.parents.entries()) {
        const parent = model.commits.get(id);
        if (!parent || parent === commit) continue;
        const branch = index > 0 && commit.type === 3 ? parent.branch : commit.branch;
        const target = { ...targets.get(branch)![0]!, line: true };
        (parent.branch === commit.branch ? sameBranch : crossBranch).push(target);
      }
    }
  }
  const gitEdges = [...crossBranch, ...sameBranch];
  let gitEdge = 0;
  if (model.type === "sankey") {
    for (const match of svg.matchAll(/\b(fill|stroke|stop-color)="([^"]*)"/g)) {
      const value = match[2]!.replace(/^url\(#[^)]+\)\s*/, "");
      refusePaint(match[1]!, value);
    }
    for (const match of svg.matchAll(/\bstyle="([^"]*)"/g)) for (const decl of decode(match[1]!).split(";")) {
      const colon = decl.indexOf(":");
      if (colon > 0) refusePaint(decl.slice(0, colon).trim(), decl.slice(colon + 1));
    }
    svg = sankeyPaint(svg, model, targets, scope);
  }
  const stack: { name: string; target?: Target; focused: boolean; icon: boolean; classes: string[]; loose: boolean }[] = [];
  const chartVisible = new Set<Target>();
  const focusedVisible = new Set<string>();
  const xyPlots = model.type === "xychart" ? [...model.plots.filter((p) => p.type === "bar"), ...model.plots.filter((p) => p.type === "line")] : [];
  let quadrantLabel = 0, xyPlot = 0, xyBar = 0;
  svg = svg.replace(/<\/?[\w:-]+\b(?:"[^"]*"|'[^']*'|[^'">])*>/g, (tag) => {
    if (tag.startsWith("</")) { stack.pop(); return tag; }
    const name = /^<([\w:-]+)/.exec(tag)![1]!;
    const attrs = new Map([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1]!, decode(m[2]!)]));
    for (const [prop, value] of attrs) {
      if (model.type !== "sankey" || !["fill", "stop-color"].includes(prop)) refusePaint(prop, value);
      if (prop === "style") for (const decl of value.split(";")) { const colon = decl.indexOf(":"); if (colon > 0) refusePaint(decl.slice(0, colon).trim(), decl.slice(colon + 1)); }
    }
    const id = attrs.get("data-id"), ownClasses = (attrs.get("class") ?? "").split(/\s+/);
    const parent = stack.at(-1);
    let target = parent?.target, focused = parent?.focused ?? false;
    if (model.type === "ishikawa" && ownClasses.some((c) => ["pele-ishikawa-causes", "pele-ishikawa-bones", "pele-marker"].includes(c))) {
      target = undefined; focused = false;
    }
    if (model.type === "mindmap" && ownClasses.includes("pele-edges")) {
      tag = tag.replace(/\bstroke="[^"]*"/, 'stroke="var(--_l)"');
    }
    let loose = parent?.loose ?? false;
    let sourceId = id;
    if (model.type === "quadrantChart" && ownClasses.includes("pele-quadrant")) sourceId = `quadrant-${id}`;
    if (model.type === "quadrantChart" && parent?.classes.includes("pele-point-labels")) sourceId = model.points[quadrantLabel++]?.text.text;
    if (sourceId !== undefined || ownClasses.some((c) => c === "pele-node" || c === "pele-cluster")) {
      const edge = ownClasses.includes("pele-edge") || ownClasses.includes("pele-edge-label");
      const matches = sourceId === undefined ? undefined : targets.get(sourceId);
      const matched = chart ? matches?.length === 1 ? matches[0] : undefined : spatial
        ? matches?.length === 1 ? matches[0] : model.type === "cynefin"
          ? matches?.find((t) => !!t.sourceCategory !== ownClasses.includes("pele-node")) : undefined
        : ownsIdentity(ownClasses) ? matches?.find((candidate) => work || !!candidate.edge === edge) : undefined;
      target = matched ?? (sourceId === undefined ? { id: "unnamed", neutral: work } : { id: sourceId });
      if (model.type === "eventmodeling" && ownClasses.includes("pele-em-lane")) target = { id: id ?? "lane", neutral: true };
      if (ownClasses.some((c) => c === "pele-node" || c === "pele-cluster")) classes(target, ownClasses);
      focused = !!(sourceId !== undefined && ownsIdentity(ownClasses) && focus.includes(sourceId) && !target.unsupported && (chart ? matched : !matches || matched));
    }
    if (model.type === "kanban" && ownClasses.includes("pele-priority")) target = { id: target?.id ?? "", key: priorities.get(target?.id ?? ""), neutral: true, line: true };
    if (model.type === "gitGraph" && ownClasses.includes("pele-edge")) target = gitEdges[gitEdge++];
    if (model.type === "wardley" && ownClasses.includes("pele-wardley-trend") && target) target = { ...target, line: true };
    if (model.type === "wardley" && ownClasses.some((c) => /^pele-wardley-(?:build|buy|outsource|market)$/.test(c))) {
      target = undefined; focused = false;
    }
    if (model.type === "radar" && ownClasses.includes("pele-axis-label") || model.type === "sankey" && ownClasses.includes("pele-sankey-link")) { target = undefined; focused = false; }
    if (model.type === "xychart") {
      if (ownClasses.includes("pele-series")) {
        const plot = xyPlots[xyPlot++];
        xyBar = 0;
        if (!plot?.title) target = { id: "" };
      }
      if (name === "rect" && parent?.classes.includes("pele-bars") && !target?.id) {
        const datum = xyPlots[xyPlot - 1]?.data.filter(([, value]) => typeof value === "number" && Number.isFinite(value))[xyBar++];
        target = model.xAxis.type === "band" && datum ? { id: "", categorical: datum[0] } : undefined;
        focused = false;
      }
    }
    if (model.type === "wardley" && target?.labelOnly && !target.line && SHAPE.has(name)) target = undefined;
    const icon = ownClasses.includes("pele-icon") || (parent?.target === target && (parent?.icon ?? false));
    if (chart) loose = ownClasses.includes("pele-legend-item") || ownClasses.includes("pele-section") || model.type === "sankey" || model.type === "venn" || model.type === "quadrantChart" && (ownClasses.includes("pele-point") || parent?.classes.includes("pele-point-labels")) || parent?.loose === true;
    const accent = targetColor(target, !target?.iconOnly || icon);
    const rolePaint = !!(target?.role || target?.category === undefined && target?.intrinsic && (!target.iconOnly || icon));
    const invisible = attrs.get("fill") === "none" && attrs.get("stroke") === "none";
    const neutral = target && ["wardley", "cynefin"].includes(model.type) && ["rect", "circle"].includes(name) && attrs.get("fill") === "var(--_bg)";
    if (chart && target && !invisible && (SHAPE.has(name) || name === "text")) chartVisible.add(target);
    if (focused && target && !invisible && SHAPE.has(name)) focusedVisible.add(target.id);
    if (!invisible && (accent || focused || target?.neutral || neutral || chart && target) && (SHAPE.has(name) || name === "text")) {
      const line = target?.line || ownClasses.includes("pele-edge") || ownClasses.includes("pele-lane") || ownClasses.includes("pele-lifeline") || parent?.name === "line" || chart && attrs.get("fill") === "none";
      const open = (model.type === "flowchart" || interaction) && attrs.get("fill") === "none";
      const fill = open || icon || (line && (!spatial || ["path", "line", "polyline"].includes(name)) && !ownClasses.includes("pele-marker")) ? "none" : model.type === "gitGraph" && attrs.get("fill") === "var(--_bg)" ? BASE : accent ?? SURFACE;
      const stroke = model.type === "gitGraph" && attrs.get("stroke") === "var(--_bg)" ? BASE : focused ? MAUVE : icon && !line ? rolePaint ? TEXT : BASE : accent ?? BORDER;
      const paint = name === "text"
        ? `fill:${rolePaint || !accent ? TEXT : line || loose || target?.loose || target?.looseLabel || model.type === "gantt" && attrs.get("fill") === "var(--_m)" ? accent : BASE}`
        : `${!["line", "polyline"].includes(name) ? `fill:${fill};${accent && !rolePaint && ["mindmap", "cynefin"].includes(model.type) && attrs.has("fill-opacity") ? "fill-opacity:1;" : ""}` : ""}stroke:${stroke}${focused ? ";stroke-width:2.5px" : ""}${rolePaint && fill !== "none" ? ";fill-opacity:0.22" : model.type === "agentflow" && accent && fill !== "none" ? ";fill-opacity:1" : ""}`;
      if (attrs.has("style")) tag = tag.replace(/\bstyle="([^"]*)"/, (_, style) => `style="${style};${paint}"`);
      else tag = tag.replace(/\/?\s*>$/, (end) => ` style="${paint}"${end}`);
    }
    if (!tag.endsWith("/>")) stack.push({ name, target, focused, icon, classes: ownClasses, loose });
    return tag;
  });
  for (const binding of bindings) if (chart && !chartVisible.has(targets.get(binding.id)![0]!)) throw new Error(`Unsupported binding target ${binding.id}: no visible owned marks in ${model.type}.`);
  for (const id of focus) if (!focusedVisible.has(id)) throw new Error(`Unsupported focus target ${id}: no visible owned marks in ${model.type}.`);
  svg = svg.replace(/color-mix\([^()]*(?:\([^()]*\)[^()]*)*\)/g, BORDER).replace(/var\((--[\w-]+),\s*#[\da-f]{3,8}\s*\)/gi, "var($1)");
  const theme = `.${scope} {
background: ${BASE};
--pele-bg: ${BASE}; --pele-fg: ${TEXT}; --pele-fg-on-light: ${BASE}; --pele-fg-on-dark: ${BASE};
--pele-muted: #a6adc8; --pele-line: #bac2de; --pele-surface: ${SURFACE}; --pele-surface-alt: ${SURFACE}; --pele-border: ${BORDER};
--pele-accent: ${BORDER}; --pele-critical: #f38ba8; --pele-error: #f38ba8;
--pele-font: ${FONT}; --pele-font-mono: ${FONT};
${ACCENTS.slice(0, 8).map((c, i) => `--pele-series-${i + 1}: ${CHARTS.has(model.type) ? SURFACE : c};`).join(" ")}
}
.${scope} text { font-variant-ligatures: none; }`;
  return { svg, css: theme };
}

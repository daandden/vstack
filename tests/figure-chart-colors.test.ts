import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { marks, renderFigure, shape } from "./support/figure-cli.ts";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function setup() { const dir = mkdtempSync(join(tmpdir(), "figure-chart-colors-")); dirs.push(dir); return dir; }
const elements = (...entries: unknown[]) => ({ elements: entries });
const fill = (svg: string, id: string) => /fill:(#[\da-f]+)/.exec(shape(svg, id).style)?.[1];

test("a pie category binds its slice and legend without guessing percentage ownership", async () => {
  const r = await renderFigure(setup(), 'pie\n "Orders" : 3\n "Other" : 1\n', { bindings: elements({ id: "Orders", role: "bad" }), focus: ["Orders"] });
  expect({ code: r.code, stderr: r.stderr }).toEqual({ code: 0, stderr: "" });
  const owned = marks(r.svg!, "Orders");
  expect(owned.filter((m) => !m.text)).toHaveLength(2);
  for (const m of owned.filter((m) => !m.text)) expect(m.style).toContain("fill:#f38ba8;stroke:#cba6f7");
  expect(owned.find((m) => m.text)!.style).toContain("fill:#cba6f7");
  expect(r.svg).toContain(">75%</text>");
});

test("exact category names stay stable across pie, repeated Sankey endpoints, and treemap processes", async () => {
  const dir = setup(), keys = Array.from({ length: 150 }, (_, i) => `category-${i}`);
  const colors: string[][] = [];
  for (const [run, names] of [keys, [...keys].reverse(), ["inserted", ...keys]].entries()) {
    for (const [family, source] of [
      ["pie", `pie\n${names.map((key) => ` "${key}" : 1`).join("\n")}\n`],
      ["sankey", `sankey\n\n${names.map((key) => `Root,${key},1`).join("\n")}\n`],
      ["treemap", `treemap\n${names.map((key) => ` "${key}": 1`).join("\n")}\n`],
    ]) {
      const r = await renderFigure(dir, source!, { name: `${family}-${run}` });
      expect({ family, code: r.code, stderr: r.stderr }).toEqual({ family, code: 0, stderr: "" });
      const paints = keys.map((key) => fill(r.svg!, key));
      expect(paints.every(Boolean)).toBe(true);
      colors.push(paints as string[]);
      for (const key of keys) expect(r.svg).toContain(key);
    }
  }
  for (const paints of colors) expect(paints).toEqual(colors[0]!);
  expect(new Set(colors[0])).toEqual(new Set(["#f5e0dc", "#f2cdcd", "#f5c2e7", "#f38ba8", "#eba0ac", "#fab387", "#f9e2af", "#a6e3a1", "#94e2d5", "#89dceb", "#74c7ec", "#89b4fa", "#b4befe"]));
});

const CHARTS = [
  ["quadrantChart", 'quadrantChart\n quadrant-1 Shared\n Orders: [0.3, 0.8]\n Other: [0.7, 0.2]\n', "Orders"],
  ["xychart", 'xychart\n x-axis [Jan, Feb]\n bar Orders [3, 7]\n line Other [2, 5]\n', "Orders"],
  ["xychart-beta", 'xychart-beta\n x-axis [Jan, Feb]\n bar Orders [3, 7]\n', "Orders"],
  ["pie", 'pie\n "Orders": 3\n "Other": 7\n', "Orders"],
  ["sankey", 'sankey\n\nOrders,Other,3\nOrders,Third,7\n', "Orders"],
  ["sankey-beta", 'sankey-beta\n\nOrders,Other,3\n', "Orders"],
  ["radar-beta", 'radar-beta\n axis speed, cost, clarity\n curve Orders{3, 4, 5}\n curve Other{4, 2, 3}\n', "Orders"],
  ["treemap-beta", 'treemap-beta\n "Orders"\n   "Other": 3\n   "Third": 7\n', "Orders"],
  ["treemap", 'treemap\n "Orders": 3\n "Other": 7\n', "Orders"],
  ["venn-beta", 'venn-beta\n set Orders\n set Other\n union Orders,Other["Shared"]\n', "Orders"],
] as const;

test.each(CHARTS)("%s accepts category and role overrides without changing values or layout", async (name, source, id) => {
  const dir = setup(), baseline = await renderFigure(dir, source);
  const bound = await renderFigure(dir, source, { name: "bound", bindings: elements({ id, category: "shared exact key" }) });
  const role = await renderFigure(dir, source, { name: "role", bindings: elements({ id, category: "shared exact key" }, { id, role: "ok" }, { id, role: "ok" }) });
  expect({ name, code: bound.code, stderr: bound.stderr }).toEqual({ name, code: 0, stderr: "" });
  expect(role.code).toBe(0); expect(fill(role.svg!, id)).toBe("#a6e3a1");
  const reference = await renderFigure(dir, 'pie\n "Reference": 1\n', { name: "key", bindings: elements({ id: "Reference", category: "shared exact key" }) });
  expect(fill(bound.svg!, id)).toBe(fill(reference.svg!, "Reference"));
  const geometry = (svg: string) => [...svg.matchAll(/\b(?:d|x|y|x1|y1|x2|y2|cx|cy|r|width|height|transform|viewBox|fill-opacity)="[^"]*"/g)].map((m) => m[0]);
  expect(geometry(bound.svg!)).toEqual(geometry(baseline.svg!));
  const labels = (svg: string) => [...svg.matchAll(/>([^<]+)</g)].map((m) => m[1]).filter((s) => !s!.includes("--pele-"));
  expect(labels(bound.svg!)).toEqual(labels(baseline.svg!));
});

test.each(["gradient", "source", "target"])("Sankey %s mode retains actual endpoint identities and literal stops", async (mode) => {
  const source = `---\nconfig:\n  sankey:\n    linkColor: ${mode}\n---\nsankey\n\nOrders,Other,3\nOrders,Third,7\n`;
  const r = await renderFigure(setup(), source, { bindings: elements({ id: "Orders", category: "same concept" }, { id: "Other", role: "bad" }) });
  expect({ code: r.code, stderr: r.stderr }).toEqual({ code: 0, stderr: "" });
  const sourceColor = fill(r.svg!, "Orders"), destination = fill(r.svg!, "Other");
  const link = /<path\b[^>]*data-id="Orders-&gt;Other"[^>]*>/.exec(r.svg!)![0];
  if (mode === "gradient") {
    const id = /fill="url\(#([^)]*)\)/.exec(link)![1];
    const gradient = new RegExp(`<linearGradient id="${id}"[^>]*>(.*?)</linearGradient>`).exec(r.svg!)![1]!;
    expect([...gradient.matchAll(/stop-color="([^"]*)"/g)].map((m) => m[1])).toEqual([sourceColor, destination]);
  } else {
    expect(r.svg).not.toContain("<linearGradient");
    expect(link).toContain(`fill="${mode === "source" ? sourceColor : destination}"`);
  }
});

test.each(CHARTS)("%s refuses conflicts and missing targets without making stale output current", async (_, source, id) => {
  const dir = setup(), good = await renderFigure(dir, source);
  for (const [entries, message] of [
    [[{ id, role: "bad" }, { id, role: "ok" }], "more than one color role"],
    [[{ id, role: "ok" }, { id, category: "one" }, { id, category: "two" }], "conflicting category keys"],
    [[{ id: "Absent", category: "one" }], "Missing binding target"],
  ] as const) for (const name of ["figure", "new"]) {
    const r = await renderFigure(dir, source, { name, bindings: elements(...entries) });
    expect(r.code).toBe(1); expect(r.stderr).toContain(message); expect(r.stdout).toBe("");
    if (name === "figure") expect(r.svg).toBe(good.svg); else expect(existsSync(r.out)).toBe(false);
  }
});

test.each([
  ['quadrantChart\n Orders: [0.2, 0.3]\n Orders: [0.6, 0.7]\n', "Orders"],
  ['xychart\n x-axis [Jan, Feb]\n bar Orders [3, 7]\n line Orders [2, 4]\n', "Orders"],
  ['treemap\n "One"\n   "Repeated": 3\n "Two"\n   "Repeated": 1\n', "Repeated"],
])("duplicate category names are ambiguous rather than arbitrary mark matches", async (source, id) => {
  const dir = setup(), valid = await renderFigure(dir, source);
  expect(valid.code).toBe(0);
  const r = await renderFigure(dir, source, { name: "bound", bindings: elements({ id, role: "bad" }) });
  expect(r.code).toBe(1); expect(r.stderr).toContain("Ambiguous binding target"); expect(existsSync(r.out)).toBe(false);
});

test("Venn intersections color visible text but do not invent a fillable region", async () => {
  const r = await renderFigure(setup(), 'venn-beta\n set Orders\n set Other\n union Orders,Other["Shared"]\n', { bindings: elements({ id: "Orders|Other", role: "warn" }) });
  expect(r.code).toBe(0);
  const intersection = marks(r.svg!, "Orders|Other");
  expect(intersection.filter((m) => !m.text)).toHaveLength(0);
  expect(intersection.find((m) => m.text)?.style).toContain("fill:#f9e2af");
});

test("unnamed xy bars use exact band categories, but do not acquire fabricated focus or binding ids", async () => {
  const dir = setup(), source = 'xychart\n x-axis [Orders, Other]\n bar [3, 7]\n', r = await renderFigure(dir, source);
  expect(r.code).toBe(0);
  const reference = await renderFigure(dir, 'pie\n "Orders": 3\n "Other": 7\n', { name: "reference" });
  const rectangles = [...r.svg!.matchAll(/<rect\b[^>]*style="([^"]*)"[^>]*>/g)];
  expect(rectangles.map((m) => /fill:(#[\da-f]+)/.exec(m[1]!)?.[1])).toEqual(["Orders", "Other"].map((id) => fill(reference.svg!, id)));
  expect(r.svg).not.toContain("stroke:#cba6f7");
  for (const options of [{ bindings: elements({ id: "Orders", role: "bad" }) }, { focus: ["Orders"] }]) {
    for (const name of ["figure", "fresh"]) {
      const refused = await renderFigure(dir, source, { ...options, name });
      expect(refused.code).toBe(1); expect(refused.stdout).toBe("");
      if (name === "figure") expect(refused.svg).toBe(r.svg);
      else expect(existsSync(refused.out)).toBe(false);
    }
  }
});

test("a source target with no emitted marks is an explicit support limit", async () => {
  const dir = setup(), source = 'treemap\n "Empty": 0\n "Visible": 1\n', good = await renderFigure(dir, source);
  expect(good.code).toBe(0);
  for (const options of [{ bindings: elements({ id: "Empty", role: "bad" }) }, { focus: ["Empty"] }]) {
    for (const name of ["figure", "fresh"]) {
      const refused = await renderFigure(dir, source, { ...options, name });
      expect(refused.code).toBe(1); expect(refused.stdout).toBe("");
      if (name === "figure") expect(refused.svg).toBe(good.svg);
      else expect(existsSync(refused.out)).toBe(false);
    }
  }
});

test("named quadrant labels contrast with their backing while loose point labels retain their category", async () => {
  const r = await renderFigure(setup(), 'quadrantChart\n quadrant-1 Orders\n Point: [0.3, 0.8]\n');
  expect(r.code).toBe(0);
  expect(marks(r.svg!, "1").find((m) => m.text)?.style).toContain("fill:#1e1e2e");
});

test.each([
  'quadrantChart\n Orders:::ok: [0.3, 0.8]\n',
  'treemap\n "Orders": 3:::ok\n',
])("authored chart roles override a category and conflict with a different explicit role", async (source) => {
  const dir = setup();
  const r = await renderFigure(dir, source, { bindings: elements({ id: "Orders", category: "one" }, { id: "Orders", role: "ok" }) });
  expect(r.code).toBe(0); expect(fill(r.svg!, "Orders")).toBe("#a6e3a1");
  const refused = await renderFigure(dir, source, { name: "bad", bindings: elements({ id: "Orders", role: "bad" }) });
  expect(refused.code).toBe(1); expect(refused.stderr).toContain("more than one color role"); expect(existsSync(refused.out)).toBe(false);
});

test("Sankey link concatenations never masquerade as unique binding ids", async () => {
  const source = 'sankey\n\n"A->B",C,1\nA,"B->C",1\n';
  const r = await renderFigure(setup(), source, { bindings: elements({ id: "A->B->C", category: "one" }) });
  expect(r.code).toBe(1); expect(r.stderr).toContain("Missing binding target"); expect(existsSync(r.out)).toBe(false);
});

test.each([
  'quadrantChart\n Orders: [0.3, 0.8] color: #ff0000\n',
  'treemap\n "Orders": 3:::ok\n classDef ok fill:red\n',
  '---\nconfig:\n sankey:\n  nodeColors:\n   Orders: red\n---\nsankey\n\nOrders,Other,1\n',
])("authored chart paints are refused rather than silently hidden by the palette", async (source) => {
  const r = await renderFigure(setup(), source);
  expect(r.code).toBe(1); expect(r.stderr).toContain("sets its own color"); expect(existsSync(r.out)).toBe(false);
});

test.each([
  'quadrantChart\n Orders: [0.3, 0.8]\n classDef unused color: #ff0000\n',
  'treemap\n "Orders": 3\n classDef unused fill:red\n',
])("unused chart paint declarations are also semantic refusals", async (source) => {
  const r = await renderFigure(setup(), source);
  expect(r.code).toBe(1); expect(r.stderr).toContain("sets its own color"); expect(existsSync(r.out)).toBe(false);
});

test.each(["Orders: var(--pele-error)", "Unused: red"])("Sankey refuses authored nodeColors %s even when masked or unused", async (declaration) => {
  const dir = setup(), good = await renderFigure(dir, "sankey\n\nOrders,Other,1\n");
  expect(good.code).toBe(0);
  const source = `---\nconfig:\n sankey:\n  nodeColors:\n   ${declaration}\n---\nsankey\n\nOrders,Other,1\n`;
  for (const name of ["figure", "fresh"]) {
    const refused = await renderFigure(dir, source, { name });
    expect(refused.code).toBe(1); expect(refused.stdout).toBe("");
    if (name === "figure") expect(refused.svg).toBe(good.svg);
    else expect(existsSync(refused.out)).toBe(false);
  }
});

test.each(["{}", "{Orders: ''}", "{Orders: null}"])("Sankey accepts a configuration without node paint: %s", async (nodeColors) => {
  const dir = setup(), plain = await renderFigure(dir, "sankey\n\nOrders,Other,1\n");
  expect(plain.code).toBe(0);
  const r = await renderFigure(dir, `---\nconfig:\n sankey:\n  nodeColors: ${nodeColors}\n---\nsankey\n\nOrders,Other,1\n`);
  expect(r.code).toBe(0); expect(r.svg).toBe(plain.svg);
});

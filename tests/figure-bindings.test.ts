import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderFigure, shape, text } from "./support/figure-cli.ts";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function setup() { const dir = mkdtempSync(join(tmpdir(), "figure-bindings-")); dirs.push(dir); return dir; }
const SOURCE = "flowchart LR\n A[(Cache)] --> B[Failed person]\n";
const elements = (...entries: unknown[]) => ({ elements: entries });

test("a caller binds a flowchart source id to a literal role without changing the label", async () => {
  const r = await renderFigure(setup(), SOURCE, { bindings: elements({ id: "A", role: "bad" }) });
  expect({ code: r.code, stderr: r.stderr }).toEqual({ code: 0, stderr: "" });
  expect(r.stdout.trim()).toBe(r.out); expect(shape(r.svg!, "A").style).toContain("fill:#f38ba8;stroke:#f38ba8");
  expect(r.svg).toContain("Cache"); expect(r.svg).not.toContain("color-mix");
});

test("meaningful shapes establish kinds, labels do not, and an explicit state overrides the kind", async () => {
  const dir = setup(), source = "flowchart LR\n P@{ shape: person, label: Agent } --> A[(Data)]\n A --> Q[Failed person database]\n";
  const plain = await renderFigure(dir, source);
  expect(plain.code).toBe(0); expect(shape(plain.svg!, "P").style).toContain("fill:#f5c2e7");
  expect(shape(plain.svg!, "A").style).toContain("fill:#94e2d5"); expect(shape(plain.svg!, "Q").style).not.toContain("fill:#");
  const bound = await renderFigure(dir, source, { name: "bound", bindings: elements({ id: "P", role: "bad" }, { id: "A", category: "orders" }) });
  expect(bound.code).toBe(0); expect(shape(bound.svg!, "P").style).toContain("fill:#f38ba8");
  expect(shape(bound.svg!, "A").style).not.toContain("fill:#94e2d5");
});

test("category colors depend only on exact keys across order, insertion, ids, and processes", async () => {
  const dir = setup(), keys = Array.from({ length: 150 }, (_, i) => `category-${i}`);
  const sources = [keys, [...keys].reverse(), ["inserted", ...keys]];
  const colors: string[][] = [];
  for (const [run, list] of sources.entries()) {
    const r = await renderFigure(dir, `flowchart LR\n${list.map((key, i) => `N${i}[${key}]`).join("\n")}\n`, { name: `run-${run}`, bindings: elements(...list.map((key, i) => ({ id: `N${i}`, category: key }))) });
    expect(r.code).toBe(0);
    colors.push(keys.map((key) => /fill:(#[\da-f]+)/.exec(shape(r.svg!, `N${list.indexOf(key)}`).style)![1]!));
    for (const key of keys) expect(r.svg).toContain(key);
  }
  expect(colors[1]).toEqual(colors[0]); expect(colors[2]).toEqual(colors[0]);
  expect(new Set(colors[0])).toEqual(new Set(["#f5e0dc", "#f2cdcd", "#f5c2e7", "#f38ba8", "#eba0ac", "#fab387", "#f9e2af", "#a6e3a1", "#94e2d5", "#89dceb", "#74c7ec", "#89b4fa", "#b4befe"]));
});

test("flowchart aliases share the exact category identity mapping", async () => {
  const dir = setup(), fills: string[] = [];
  for (const keyword of ["flowchart", "graph", "flowchart-elk"]) {
    const r = await renderFigure(dir, `${keyword} LR\n A[Orders]\n`, { name: keyword, bindings: elements({ id: "A", category: "orders" }) });
    expect(r.code).toBe(0); fills.push(shape(r.svg!, "A").style);
  }
  expect(fills[1]).toBe(fills[0]); expect(fills[2]).toBe(fills[0]);
});

test("identical explicit assignments repeat, and an explicit role wins a category regardless of order", async () => {
  const dir = setup();
  for (const entries of [
    [{ id: "A", role: "ok" }, { id: "A", category: "cache" }, { id: "A", role: "ok" }, { id: "A", category: "cache" }],
    [{ id: "A", category: "cache" }, { id: "A", role: "ok" }],
  ]) {
    const r = await renderFigure(dir, "flowchart LR\n A:::ok --> B\n", { bindings: elements(...entries) });
    expect(r.code).toBe(0); expect(shape(r.svg!, "A").style).toContain("fill:#a6e3a1"); expect(text(r.svg!, "A").style).toContain("fill:#1e1e2e");
  }
});

test.each([
  ["unknown role", elements({ id: "A", role: "green" }), "Unknown color role"],
  ["different explicit roles", elements({ id: "A", role: "ok" }, { id: "A", role: "bad" }), "more than one color role"],
  ["Mermaid and binding roles", elements({ id: "A", role: "bad" }), "more than one color role"],
  ["different categories masked by a role", elements({ id: "A", role: "ok" }, { id: "A", category: "one" }, { id: "A", category: "two" }), "conflicting category keys"],
  ["missing id", elements({ id: "Absent", role: "ok" }), "Missing binding target: Absent"],
  ["label used instead of id", elements({ id: "Cache", role: "ok" }), "Missing binding target: Cache"],
])("%s is a semantic refusal that preserves old output and creates no new output", async (_, bindings, message) => {
  const dir = setup(), source = "flowchart LR\n A[Cache]:::ok --> B\n";
  const good = await renderFigure(dir, source);
  for (const name of ["figure", "new"]) {
    const r = await renderFigure(dir, source, { name, bindings });
    expect(r.code).toBe(1); expect(r.stderr).toContain(message); expect(r.stdout).toBe("");
    if (name === "figure") expect(r.svg).toBe(good.svg); else expect(existsSync(r.out)).toBe(false);
  }
});

test("an id shared by a source node and edge is ambiguous rather than a DOM-count lookup", async () => {
  const r = await renderFigure(setup(), "flowchart LR\n A A@--> B\n", { bindings: elements({ id: "A", role: "ok" }) });
  expect(r.code).toBe(1); expect(r.stderr).toContain("Ambiguous binding target: A"); expect(existsSync(r.out)).toBe(false);
});

test("explicit edge ids color their route, marker, and label without filling the route", async () => {
  const r = await renderFigure(setup(), "flowchart LR\n A edge@-->|Ready| B\n", { bindings: elements({ id: "edge", role: "ok" }) });
  expect(r.code).toBe(0); expect(shape(r.svg!, "edge").style).toContain("fill:none;stroke:#a6e3a1");
});

test("a text-only node retains visible accent text without inventing a backing", async () => {
  const r = await renderFigure(setup(), "flowchart LR\n A@{ shape: text, label: Label }\n", { bindings: elements({ id: "A", role: "ok" }) });
  expect(r.code).toBe(0); expect(text(r.svg!, "A").style).toContain("fill:#a6e3a1");
  expect(shape(r.svg!, "A").tag).toContain('fill="none" stroke="none"');
  expect(shape(r.svg!, "A").style).not.toContain("#a6e3a1");
});

test.each([null, {}, { elements: {} }, elements({ id: "A" }), elements({ id: "A", role: "ok", category: "a" }), elements({ id: "A", category: " " }), elements({ id: "A", role: 1 }), elements({ id: "A", role: "ok", selector: "rect" })])("malformed bindings are usage errors", async (bindings) => {
  const r = await renderFigure(setup(), SOURCE, { bindings }); expect(r.code).toBe(2); expect(r.stderr).toContain("Usage: bun render.ts"); expect(existsSync(r.out)).toBe(false);
});

test("malformed JSON is a usage error and preserves a previous success", async () => {
  const dir = setup(), good = await renderFigure(dir, SOURCE);
  const r = await renderFigure(dir, SOURCE, { rawBindings: "{" }); expect(r.code).toBe(2); expect(r.svg).toBe(good.svg); expect(r.stdout).toBe("");
});

test.each([
  ["packet", 'packet\n 0-7: "Header"\n'], ["packet-beta", 'packet-beta\n 0-7: "Header"\n'],
  ["railroad-beta", 'railroad-beta\n rule = terminal("word");\n'],
  ["railroad-ebnf-beta", 'railroad-ebnf-beta\n rule = "word";\n'],
  ["railroad-abnf-beta", 'railroad-abnf-beta\n rule = "word";\n'],
  ["railroad-peg-beta", 'railroad-peg-beta\n rule <- "word";\n'],
])("%s retains neutral rendering and explicitly refuses unsupported identities", async (_, source) => {
  const dir = setup(), good = await renderFigure(dir, source); expect(good.code).toBe(0);
  const r = await renderFigure(dir, source, { name: "bound", bindings: elements({ id: "rule", role: "ok" }) });
  expect(r.code).toBe(1); expect(r.stderr).toContain("Unsupported binding target rule"); expect(existsSync(r.out)).toBe(false);
});

test.each([
  ["flowchart LR\n A --> B\n", "Absent"],
  ["flowchart LR\n A A@--> B\n", "A"],
])("%s refuses %s focus without publishing or replacing a figure", async (source, id) => {
  const dir = setup(), good = await renderFigure(dir, SOURCE);
  expect(good.code).toBe(0);
  for (const name of ["figure", "fresh"]) {
    const refused = await renderFigure(dir, source, { name, focus: [id] });
    expect(refused.code).toBe(1); expect(refused.stdout).toBe("");
    if (name === "figure") expect(refused.svg).toBe(good.svg);
    else expect(existsSync(refused.out)).toBe(false);
  }
});

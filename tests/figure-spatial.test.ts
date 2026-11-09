import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { marks, renderFigure, shape, text } from "./support/figure-cli.ts";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function setup() { const dir = mkdtempSync(join(tmpdir(), "figure-spatial-")); dirs.push(dir); return dir; }
const elements = (...entries: unknown[]) => ({ elements: entries });
const MINDMAP = "mindmap\n root((Order))\n  a[Orders]\n   child[Failed database]\n  b[People]\n";

test("mindmap branches use exact category names and node roles do not color descendants", async () => {
  const dir = setup();
  const plain = await renderFigure(dir, MINDMAP);
  const reference = await renderFigure(dir, "flowchart LR\n A[Orders]\n", { name: "reference", bindings: elements({ id: "A", category: "Orders" }) });
  expect(plain.code).toBe(0); expect(reference.code).toBe(0);
  const fill = /fill:(#[\da-f]+)/.exec(shape(reference.svg!, "A").style)![1];
  expect(shape(plain.svg!, "a").style).toContain(`fill:${fill}`);
  expect(shape(plain.svg!, "child").style).toContain(`fill:${fill}`);
  const bound = await renderFigure(dir, MINDMAP, { name: "bound", focus: ["a"], bindings: elements({ id: "a", category: "other" }, { id: "a", role: "bad" }) });
  expect({ code: bound.code, stderr: bound.stderr }).toEqual({ code: 0, stderr: "" });
  expect(shape(bound.svg!, "a").style).toContain("fill:#f38ba8");
  expect(shape(bound.svg!, "a").style).toContain("stroke:#cba6f7");
  expect(text(bound.svg!, "a").style).toContain("fill:#cdd6f4");
  expect(shape(bound.svg!, "child").style).toBe(shape(plain.svg!, "child").style);
});

test.each(["ishikawa-beta", "ishikawa"])("%s colors only the category header, not causes or routes", async (keyword) => {
  const r = await renderFigure(setup(), `${keyword}\n Delay\n  Orders\n   Manual review\n`, { focus: ["Orders"], bindings: elements({ id: "Orders", role: "warn" }) });
  expect({ code: r.code, stderr: r.stderr }).toEqual({ code: 0, stderr: "" });
  const owned = marks(r.svg!, "Orders");
  expect(owned.find((m) => m.tag.startsWith("<rect"))!.style).toContain("fill:#f9e2af;stroke:#cba6f7");
  expect(owned.filter((m) => m.tag.startsWith("<path")).every((m) => !m.style.includes("#"))).toBe(true);
  expect(owned.filter((m) => m.text).map((m) => m.style)).toEqual(["fill:#cdd6f4", ""]);
});

test("Wardley source strategies, anchors, labels, and evolution imply no role", async () => {
  const dir = setup(), source = "wardley-beta\n anchor User [0.9, 0.2]\n component Database [0.4, 0.6] (buy)\n evolve Database 0.8\n User -> Database\n";
  const plain = await renderFigure(dir, source);
  expect(plain.code).toBe(0);
  expect(marks(plain.svg!, "Database").some((m) => m.style.includes("fill:#313244"))).toBe(true);
  expect(text(plain.svg!, "User").style).not.toContain("#f5c2e7");
  const bound = await renderFigure(dir, source, { name: "bound", focus: ["Database"], bindings: elements({ id: "User", role: "actor" }, { id: "Database", category: "orders" }, { id: "Database", role: "bad" }) });
  expect(bound.code).toBe(0);
  const database = marks(bound.svg!, "Database");
  expect(database.some((m) => m.tag.startsWith("<circle") && m.style.includes("fill:#f38ba8;stroke:#cba6f7"))).toBe(true);
  expect(database.some((m) => m.tag.startsWith("<path") && m.style.includes("fill:none;stroke:#cba6f7"))).toBe(true);
  expect(text(bound.svg!, "User").style).toContain("fill:#cdd6f4");
  expect(marks(bound.svg!, "User").every((m) => m.text)).toBe(true);
});

test("Cynefin domains own regions and labels while item backing stays neutral", async () => {
  const r = await renderFigure(setup(), 'cynefin-beta\n clear\n  "Failed database"\n complex\n  "Orders"\n', { focus: ["clear"], bindings: elements({ id: "clear", role: "ok" }, { id: "Orders", role: "store" }) });
  expect(r.code).toBe(0);
  expect(shape(r.svg!, "clear").style).toContain("fill:#a6e3a1");
  expect(shape(r.svg!, "clear").style).toContain("stroke:#cba6f7");
  expect(text(r.svg!, "clear").style).toContain("fill:#cdd6f4");
  expect(shape(r.svg!, "Failed database").style).toContain("fill:#313244");
  expect(text(r.svg!, "Failed database").style).not.toContain("#cba6f7");
  expect(shape(r.svg!, "Orders").style).toContain("fill:#94e2d5");
});

test("category names match across families, declaration reorder, insertion, and processes", async () => {
  const dir = setup(), fills: string[] = [];
  const sources = [
    ["flowchart LR\n a[Orders]\n", "a", elements({ id: "a", category: "Orders" })],
    [MINDMAP, "a", undefined],
    ["mindmap\n root((Order))\n  x[Inserted]\n  b[People]\n  a[Orders]\n   child[Failed database]\n", "a", undefined],
    ["ishikawa-beta\n Delay\n  Orders\n   Manual review\n  People\n   Training\n", "Orders", undefined],
    ["ishikawa\n Delay\n  Inserted\n   Other\n  People\n   Training\n  Orders\n   Manual review\n", "Orders", undefined],
    ["wardley-beta\n component Orders [0.4, 0.6]\n", "Orders", elements({ id: "Orders", category: "Orders" })],
    ['cynefin-beta\n clear\n  "Routine"\n', "clear", elements({ id: "clear", category: "Orders" })],
  ] as const;
  for (const [i, [source, id, bindings]] of sources.entries()) {
    const r = await renderFigure(dir, source, { name: `category-${i}`, bindings });
    expect(r.code).toBe(0);
    const mark = marks(r.svg!, id).find((m) => !m.text && m.style.includes("fill:#"))!;
    fills.push(/fill:(#[\da-f]+)/.exec(mark.style)![1]!);
  }
  expect(new Set(fills)).toEqual(new Set(["#f38ba8"]));
});

test.each([
  ["mindmap\n root((Root))\n  a[Orders]\n   :::ok\n", "a", "more than one color role"],
  ["mindmap\n root((Root))\n  a[One]\n  a[Two]\n", "a", "Ambiguous binding target"],
  ["ishikawa\n Delay\n  Orders\n   Manual review\n", "Manual review", "Missing binding target"],
  ["ishikawa\n Delay\n  Orders\n   One\n  Orders\n   Two\n", "Orders", "Ambiguous binding target"],
  ["wardley-beta\n component A [0.4, 0.6]\n component B [0.3, 0.7]\n A -> B\n", "A-B", "Missing binding target"],
  ['cynefin-beta\n clear\n  "Same"\n complex\n  "Same"\n', "Same", "Ambiguous binding target"],
  ['cynefin-beta\n clear\n  "complex"\n', "complex", "Ambiguous binding target"],
  ['cynefin-beta\n confusion\n  "One"\n  "Two"\n  "Three"\n  "Four"\n  "Five"\n', "Five", "Unavailable binding target"],
])("unresolvable or conflicting spatial binding preserves prior output", async (source, id, message) => {
  const dir = setup(), good = await renderFigure(dir, source);
  expect(good.code).toBe(0);
  for (const name of ["figure", "new"]) {
    const r = await renderFigure(dir, source, { name, bindings: elements({ id, role: "bad" }) });
    expect(r.code).toBe(1); expect(r.stderr).toContain(message); expect(r.stdout).toBe("");
    if (name === "figure") expect(r.svg).toBe(good.svg); else expect(existsSync(r.out)).toBe(false);
  }
});

test("mindmap text-only roles and Wardley market bindings add no geometry or strategy meaning", async () => {
  const dir = setup();
  const mindmap = await renderFigure(dir, "mindmap\n root((Root))\n  Plain\n   :::actor\n");
  expect(mindmap.code).toBe(0);
  expect(text(mindmap.svg!, "Plain").style).toContain("fill:#cdd6f4");
  expect(marks(mindmap.svg!, "Plain").every((m) => m.text)).toBe(true);
  const market = await renderFigure(dir, "wardley-beta\n component Market [0.4, 0.6] (market)\n", { name: "market", bindings: elements({ id: "Market", role: "external" }) });
  expect(market.code).toBe(0);
  expect(text(market.svg!, "Market").style).toContain("fill:#cdd6f4");
  expect(marks(market.svg!, "Market").filter((m) => !m.text).every((m) => !m.style.includes("#fab387"))).toBe(true);
});

test.each([
  ["mindmap\n root((Root))\n  a[Orders]\n", "a"],
  ["ishikawa\n Delay\n  Orders\n   Cause\n", "Orders"],
  ["wardley-beta\n component Orders [0.4, 0.6]\n", "Orders"],
  ['cynefin-beta\n clear\n  "Orders"\n', "clear"],
])("spatial bindings retain duplicate, precedence, and masked-conflict semantics", async (source, id) => {
  const dir = setup();
  const good = await renderFigure(dir, source, { bindings: elements({ id, category: "orders" }, { id, category: "orders" }, { id, role: "ok" }, { id, role: "ok" }) });
  expect(good.code).toBe(0);
  expect(marks(good.svg!, id).some((m) => !m.text && m.style.includes("fill:#a6e3a1"))).toBe(true);
  const bad = await renderFigure(dir, source, { bindings: elements({ id, role: "ok" }, { id, category: "one" }, { id, category: "two" }) });
  expect(bad.code).toBe(1); expect(bad.stderr).toContain("conflicting category keys"); expect(bad.svg).toBe(good.svg);
});

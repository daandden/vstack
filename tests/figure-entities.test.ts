import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { marks, renderFigure, shape, text } from "./support/figure-cli.ts";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function setup() { const dir = mkdtempSync(join(tmpdir(), "figure-entities-")); dirs.push(dir); return dir; }
const elements = (...entries: unknown[]) => ({ elements: entries });

test("native C4 kinds distinguish people, outside stores, stores, queues, and software", async () => {
  const source = 'C4Context\n Person_Ext(person, "Software")\n SystemDb_Ext(outside, "Data")\n SystemDb(data, "Person")\n SystemQueue(queue, "Database")\n System(app, "Failed person database")\n';
  const r = await renderFigure(setup(), source);
  expect({ code: r.code, stderr: r.stderr }).toEqual({ code: 0, stderr: "" });
  expect(shape(r.svg!, "person").style).toContain("#f5c2e7");
  expect(shape(r.svg!, "outside").style).toContain("fill:#fab387");
  expect(shape(r.svg!, "data").style).toContain("fill:#94e2d5");
  for (const id of ["person", "outside", "data"]) expect(shape(r.svg!, id).style).toContain("fill-opacity:0.22");
  expect(shape(r.svg!, "queue").style).not.toContain("fill:#");
  expect(shape(r.svg!, "app").style).not.toContain("fill:#");
});

test.each([
  ["C4Context", "user"], ["C4Container", "db"], ["C4Component", "controller"],
  ["C4Dynamic", "api"], ["C4Deployment", "host"], ["erDiagram", "CUSTOMER"],
  ["classDiagram", "Order"], ["architecture-beta", "db"], ["block-beta", "A"],
  ["block", "A"], ["requirementDiagram", "latency"], ["usecase-beta", "checkout"],
])("%s binds its declared identity and focuses actual owned marks", async (keyword, id) => {
  const source = readFileSync(join(import.meta.dir, `../plugin/skills/vstack-figures/references/examples/${keyword}.mmd`), "utf8");
  const r = await renderFigure(setup(), source, { bindings: elements({ id, role: "bad" }), focus: [id] });
  expect({ code: r.code, stderr: r.stderr }).toEqual({ code: 0, stderr: "" });
  expect(shape(r.svg!, id).style).toContain("fill:#f38ba8;stroke:#cba6f7");
  expect(shape(r.svg!, id).style).toContain("fill-opacity:0.22");
  expect(text(r.svg!, id).style).toContain("fill:#cdd6f4");
});

test("tree basenames bind uniquely while generated numbers and invented paths do not", async () => {
  const dir = setup(), source = "treeView-beta\nproject/\n  src/\n    index.ts icon(file)\n    README.md icon(none)\n";
  const plain = await renderFigure(dir, source);
  expect(plain.code).toBe(0);
  expect(shape(plain.svg!, "index.ts").style).toContain("stroke:#94e2d5");
  expect(text(plain.svg!, "index.ts").style).not.toContain("fill:#");
  expect(marks(plain.svg!, "README.md").filter((m) => !m.text)).toHaveLength(0);
  const bound = await renderFigure(dir, source, { name: "bound", bindings: elements({ id: "README.md", role: "bad" }) });
  expect(bound.code).toBe(0); expect(text(bound.svg!, "README.md").style).toContain("fill:#cdd6f4");
  expect(marks(bound.svg!, "README.md").filter((m) => !m.text)).toHaveLength(0);
  for (const id of ["3", "project/src/index.ts"]) {
    const r = await renderFigure(dir, source, { name: id === "3" ? "number" : "path", bindings: elements({ id, role: "ok" }) });
    expect(r.code).toBe(1); expect(r.stderr).toContain("Missing binding target"); expect(existsSync(r.out)).toBe(false);
  }
  const repeated = "treeView-beta\nroot/\n  one/\n    index.ts\n  two/\n    index.ts\n";
  expect((await renderFigure(dir, repeated, { name: "unbound" })).code).toBe(0);
  const ambiguous = await renderFigure(dir, repeated, { name: "ambiguous", bindings: elements({ id: "index.ts", role: "ok" }) });
  expect(ambiguous.code).toBe(1); expect(ambiguous.stderr).toContain("Ambiguous binding target: index.ts"); expect(existsSync(ambiguous.out)).toBe(false);
});

test("architecture store icons remain visible on their accent backing", async () => {
  const r = await renderFigure(setup(), "architecture-beta\n service db(database)[Data]\n");
  expect(r.code).toBe(0);
  expect(shape(r.svg!, "db").style).toContain("fill:#94e2d5");
  expect(text(r.svg!, "db").style).toContain("fill:#cdd6f4");
  const iconPaths = marks(r.svg!, "db").filter((m) => m.tag.startsWith("<path"));
  expect(iconPaths.length).toBeGreaterThan(0);
  for (const path of iconPaths) expect(path.style).toContain("fill:none;stroke:#cdd6f4");
});

test.each([
  ['architecture-beta\n service data(database)[Person]\n', "data", "#94e2d5"],
  ['block-beta\n data[("Person")]\n', "data", "#94e2d5"],
  ['requirementDiagram\n element data {\n type: file\n }\n', "data", "#94e2d5"],
  ['usecase-beta\n actor data(Database person)\n data --> run(Run)\n', "data", undefined],
  ['classDiagram\n class DatabasePerson\n', "DatabasePerson", undefined],
  ['erDiagram\n PERSON ||--o{ DATABASE : uses\n', "PERSON", undefined],
])("source kinds, not labels, establish intrinsic roles in %s", async (source, id, color) => {
  const r = await renderFigure(setup(), source);
  expect({ code: r.code, stderr: r.stderr }).toEqual({ code: 0, stderr: "" });
  if (color) expect(shape(r.svg!, id).style).toContain(`fill:${color}`);
  else expect(shape(r.svg!, id).style).not.toContain("fill:#");
});

test("a failing C4 store and category-over-kind keep role and focus precedence", async () => {
  const dir = setup(), source = 'C4Container\n ContainerDb(db, "Orders", "SQL")\n';
  const category = await renderFigure(dir, source, { bindings: elements({ id: "db", category: "orders" }) });
  expect(category.code).toBe(0); expect(shape(category.svg!, "db").style).not.toContain("fill:#94e2d5");
  const flow = await renderFigure(dir, "flowchart LR\n A[Orders]\n", { name: "flow", bindings: elements({ id: "A", category: "orders" }) });
  expect(flow.code).toBe(0); expect(/fill:(#[\da-f]+)/.exec(shape(category.svg!, "db").style)?.[1]).toBe(/fill:(#[\da-f]+)/.exec(shape(flow.svg!, "A").style)?.[1]);
  const failed = await renderFigure(dir, source, { name: "failed", bindings: elements({ id: "db", role: "bad" }, { id: "db", category: "orders" }, { id: "db", role: "bad" }), focus: ["db"] });
  expect(failed.code).toBe(0);
  for (const mark of marks(failed.svg!, "db").filter((m) => !m.text)) expect(mark.style).toContain("stroke:#cba6f7");
  expect(shape(failed.svg!, "db").style).toContain("fill:#f38ba8");
  expect(text(failed.svg!, "db").style).toContain("fill:#cdd6f4");
  for (const entries of [
    [{ id: "db", role: "bad" }, { id: "db", role: "ok" }],
    [{ id: "db", role: "bad" }, { id: "db", category: "one" }, { id: "db", category: "two" }],
    [{ id: "absent", role: "ok" }],
  ]) {
    const r = await renderFigure(dir, source, { bindings: elements(...entries) });
    expect(r.code).toBe(1); expect(r.stdout).toBe(""); expect(r.svg).toBe(category.svg);
  }
});

test.each([
  ['erDiagram\n A:::ok\n', "A"],
  ['classDiagram\n class A:::ok\n', "A"],
  ['block-beta\n A["Node"]\n class A ok\n', "A"],
  ['requirementDiagram\n requirement A {\n text: A\n }\n class A ok\n', "A"],
  ['usecase-beta\n actor A:::ok\n', "A"],
])("authored roles and bindings agree or refuse without source-order precedence in %s", async (source, id) => {
  const dir = setup(), good = await renderFigure(dir, source, { bindings: elements({ id, role: "ok" }) });
  expect({ code: good.code, stderr: good.stderr }).toEqual({ code: 0, stderr: "" });
  const refused = await renderFigure(dir, source, { bindings: elements({ id, role: "bad" }) });
  expect(refused.code).toBe(1); expect(refused.stderr).toContain("more than one color role"); expect(refused.svg).toBe(good.svg);
});

test.each([
  ['C4Deployment\n Deployment_Node(zone, "Outside", "Cloud") {\n Container(child, "Person database", "Bun")\n }\n'],
  ['architecture-beta\n group zone(cloud)[Outside]\n service child(server)[Person database] in zone\n'],
  ['block-beta\n block:zone\n child["Person database"]\n end\n'],
  ['usecase-beta\n systemBoundary zone[Outside]\n child(Person database)\n end\n'],
  ['erDiagram\n subgraph zone [Outside]\n child\n end\n'],
  ['classDiagram\n namespace zone {\n class child\n }\n'],
])("a group colors its own backing without asserting a child kind in %s", async (source) => {
  const r = await renderFigure(setup(), source, { bindings: elements({ id: "zone", role: "external" }), focus: ["zone"] });
  expect({ code: r.code, stderr: r.stderr }).toEqual({ code: 0, stderr: "" });
  expect(shape(r.svg!, "zone").style).toContain("fill:#fab387;stroke:#cba6f7");
  expect(shape(r.svg!, "child").style).not.toContain("fill:#");
  expect(text(r.svg!, "child").style).not.toContain("#cba6f7");
});

test("a native C4 entity alias does not bind a generated relationship with the same spelling", async () => {
  const r = await renderFigure(setup(), 'C4Context\n System(a, "A")\n System(b, "B")\n System(a-b, "Separate entity")\n Rel(a, b, "Calls")\n', { bindings: elements({ id: "a-b", role: "bad" }) });
  expect(r.code).toBe(0);
  const owned = marks(r.svg!, "a-b");
  expect(owned.filter((m) => m.tag.startsWith("<rect")).some((m) => m.style.includes("fill:#f38ba8"))).toBe(true);
  expect(owned.filter((m) => m.tag.startsWith("<path")).every((m) => !m.style.includes("#f38ba8"))).toBe(true);
});

test("an explicit use-case edge colors all its existing route marks", async () => {
  const r = await renderFigure(setup(), "usecase-beta\n actor a\n a link@--> action(Run)\n", { bindings: elements({ id: "link", role: "ok" }) });
  expect(r.code).toBe(0);
  expect(shape(r.svg!, "link").style).toContain("fill:none;stroke:#a6e3a1");
  expect(marks(r.svg!, "link").filter((m) => !m.text).every((m) => m.style.includes("stroke:#a6e3a1"))).toBe(true);
});

test.each([
  'classDiagram\n class A\n classDef unused fill:#ff0000\n',
  'erDiagram\n A\n classDef unused fill:#ff0000\n',
  'block-beta\n A["Node"]\n classDef unused fill:#ff0000\n',
  'classDiagram\n class A:::ok\n classDef ok fill:var(--pele-error)\n',
  'classDiagram\n class A\n style A fill:var(--pele-error)\n',
  'erDiagram\n A\n style A fill:#ff0000\n',
  'block-beta\n A["Node"]\n style A fill:var(--pele-error)\n',
])("entity authored paint is refused even when unused or masked: %s", async (source) => {
  const dir = setup(), good = await renderFigure(dir, "flowchart LR\n Prior[Previous figure]\n");
  expect(good.code).toBe(0);
  for (const name of ["figure", "fresh"]) {
    const refused = await renderFigure(dir, source, { name });
    expect(refused.code).toBe(1); expect(refused.stdout).toBe("");
    if (name === "figure") expect(refused.svg).toBe(good.svg);
    else expect(existsSync(refused.out)).toBe(false);
  }
});

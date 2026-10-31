import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { marks, renderFigure, shape, text } from "./support/figure-cli.ts";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function setup() { const dir = mkdtempSync(join(tmpdir(), "figure-workflows-")); dirs.push(dir); return dir; }
const elements = (...entries: unknown[]) => ({ elements: entries });
const SEQUENCE = 'sequenceDiagram\n actor P as Failed person\n participant S as Human\n participant D@{ "type": "database", "alias": "Data" }\n participant Q@{ "type": "queue", "alias": "Pending" }\n P->>S: failed\n S->>D: read\n D->>Q: done\n';

test("sequence source kinds distinguish people and data from software, and bindings own both headers and footers", async () => {
  const dir = setup(), plain = await renderFigure(dir, SEQUENCE);
  expect({ code: plain.code, stderr: plain.stderr }).toEqual({ code: 0, stderr: "" });
  expect(marks(plain.svg!, "P").filter((m) => !m.text).every((m) => m.style.includes("#f5c2e7"))).toBe(true);
  expect(marks(plain.svg!, "D").filter((m) => !m.text).every((m) => m.style.includes("#94e2d5"))).toBe(true);
  expect(shape(plain.svg!, "S").style).not.toContain("#f5c2e7");
  expect(shape(plain.svg!, "Q").style).not.toContain("#94e2d5");
  const bound = await renderFigure(dir, SEQUENCE, { name: "bound", focus: ["S"], bindings: elements({ id: "P", role: "bad" }, { id: "S", role: "external" }, { id: "D", category: "orders" }) });
  expect({ code: bound.code, stderr: bound.stderr }).toEqual({ code: 0, stderr: "" });
  const labels = marks(bound.svg!, "S").filter((m) => m.text);
  expect(labels).toHaveLength(2);
  expect(labels.every((m) => m.style.includes("fill:#cba6f7"))).toBe(true);
  expect(marks(bound.svg!, "S").filter((m) => !m.text && m.tag.startsWith("<rect")).every((m) => m.style.includes("fill:#fab387;stroke:#cba6f7"))).toBe(true);
  expect(shape(bound.svg!, "P").style).toContain("#f38ba8");
  expect(bound.svg).toContain("Failed person");
  expect(text(plain.svg!, "P").style).toContain("fill:#f5c2e7");
  expect(text(plain.svg!, "D").style).toContain("fill:#94e2d5");
  expect(marks(plain.svg!, "P").find((m) => m.tag.startsWith("<path") && m.tag.includes('fill="none"') && !m.tag.includes("pele-lifeline"))!.style).toContain("fill:none");
});

test.each(["stateDiagram-v2", "stateDiagram"])("%s binds declared states without inferring outcomes from labels", async (keyword) => {
  const dir = setup(), source = `${keyword}\n state "Failed" as P {\n A --> B\n }\n class P store\n class A ok\n [*] --> P\n P --> [*]\n`;
  const plain = await renderFigure(dir, source);
  expect(plain.code).toBe(0);
  expect(shape(plain.svg!, "B").style).not.toContain("#f38ba8");
  const r = await renderFigure(dir, source, { name: "bound", focus: ["P"], bindings: elements({ id: "P", role: "store" }, { id: "B", role: "bad" }) });
  expect({ code: r.code, stderr: r.stderr }).toEqual({ code: 0, stderr: "" });
  expect(shape(r.svg!, "P").style).toContain("fill:#94e2d5;stroke:#cba6f7");
  expect(shape(r.svg!, "A").style).toContain("fill:#a6e3a1;stroke:#a6e3a1");
  expect(shape(r.svg!, "B").style).toContain("fill:#f38ba8;stroke:#f38ba8");
  expect(text(r.svg!, "A").style).not.toContain("#cba6f7");
  const conflict = await renderFigure(dir, source, { bindings: elements({ id: "A", role: "bad" }) });
  expect(conflict.code).toBe(1); expect(conflict.stderr).toContain("more than one color role");
});

const AGENT = 'agentflow-beta LR\n flow G[Failed group]\n A[[Software]] --> B@{ shape: refdoc, label: "File" }\n flow H[Hidden]@{ view: collapsed }\n C[Child]\n end\n end\n A fail@--x B\n';
test("agent flows preserve source kind categories and failure relations, not label-word outcomes", async () => {
  const dir = setup(), plain = await renderFigure(dir, AGENT);
  expect(plain.code).toBe(0);
  expect(shape(plain.svg!, "A").style).not.toContain("#f5c2e7");
  expect(shape(plain.svg!, "B").style).toContain("fill:#94e2d5");
  expect(shape(plain.svg!, "fail").style).toContain("fill:none;stroke:#f38ba8");
  const bound = await renderFigure(dir, AGENT, { name: "bound", focus: ["G"], bindings: elements({ id: "G", role: "external" }, { id: "A", role: "ok" }, { id: "B", role: "bad" }, { id: "H", category: "orders" }) });
  expect({ code: bound.code, stderr: bound.stderr }).toEqual({ code: 0, stderr: "" });
  expect(shape(bound.svg!, "G").style).toContain("fill:#fab387;stroke:#cba6f7");
  expect(shape(bound.svg!, "A").style).toContain("fill:#a6e3a1;stroke:#a6e3a1");
  expect(shape(bound.svg!, "B").style).toContain("fill:#f38ba8;stroke:#f38ba8");
  expect(shape(bound.svg!, "A").style).toContain("fill-opacity:1");
  expect(shape(bound.svg!, "B").style).toContain("fill-opacity:1");
  expect(marks(bound.svg!, "C")).toHaveLength(0);
});

const EVENT = "eventmodeling\n tf 1 ui Failed\n tf 2 cmd Done\n tf 3 evt Rejected\n tf 4 rmo Orders\n tf 5 pcr Agent\n";
test("event frames keep source kind categories and stored data distinct from asserted outcomes", async () => {
  const dir = setup(), plain = await renderFigure(dir, EVENT);
  expect(plain.code).toBe(0);
  expect(shape(plain.svg!, "1").style).toContain("fill:#313244");
  expect(shape(plain.svg!, "4").style).toContain("fill:#94e2d5");
  const r = await renderFigure(dir, EVENT, { name: "bound", focus: ["4"], bindings: elements({ id: "3", role: "bad" }, { id: "4", category: "orders" }, { id: "5", role: "external" }) });
  expect({ code: r.code, stderr: r.stderr }).toEqual({ code: 0, stderr: "" });
  expect(marks(r.svg!, "3").filter((m) => !m.text).every((m) => m.style.includes("#f38ba8"))).toBe(true);
  expect(shape(r.svg!, "4").style).toContain("stroke:#cba6f7");
  expect(text(r.svg!, "4").style).toContain("fill:#cba6f7");
  expect(shape(r.svg!, "5").style).toContain("fill:#fab387");
});

test.each([
  ["sequence frame", "sequenceDiagram\n participant A\n loop Failed\n A->>A: Retry\n end\n", "i0"],
  ["sequence alias", SEQUENCE, "Human"],
  ["state pseudostate", "stateDiagram-v2\n [*] --> Open\n", "root_start"],
  ["collapsed child", AGENT, "C"],
  ["generated agent edge", AGENT, "L_A_B_0"],
  ["event entity name", EVENT, "Rejected"],
  ["event lane", EVENT, "Events"],
])("%s cannot fabricate a binding or visible focus", async (_, source, id) => {
  const dir = setup(), good = await renderFigure(dir, source);
  expect(good.code).toBe(0);
  for (const options of [{ bindings: elements({ id, role: "ok" }) }, { focus: [id] }]) {
    const failed = await renderFigure(dir, source, options);
    expect(failed.code).toBe(1);
    expect(failed.stderr).toMatch(/(?:Unsupported|Missing) (?:binding|focus) target/);
    expect(failed.stdout).toBe("");
    expect(failed.svg).toBe(good.svg);
    const fresh = await renderFigure(dir, source, { ...options, name: "new" });
    expect(fresh.code).toBe(1); expect(existsSync(fresh.out)).toBe(false);
  }
});

test("swimlanes bind group and task identities without assigning group roles to children", async () => {
  const r = await renderFigure(setup(), "swimlane-beta LR\n subgraph G[Group]\n A[Failed person]\n B[(Data)]\n end\n A --> B\n class A ok\n", { focus: ["G"], bindings: elements({ id: "G", role: "external" }, { id: "B", role: "bad" }) });
  expect({ code: r.code, stderr: r.stderr }).toEqual({ code: 0, stderr: "" });
  expect(shape(r.svg!, "G").style).toContain("fill:none;stroke:#cba6f7");
  expect(marks(r.svg!, "G").some((m) => !m.text && m.style.includes("fill:#fab387;stroke:#cba6f7"))).toBe(true);
  expect(shape(r.svg!, "A").style).toContain("fill:#a6e3a1;stroke:#a6e3a1");
  expect(shape(r.svg!, "B").style).toContain("fill:#f38ba8;stroke:#f38ba8");
});

test.each([
  ["sequence", SEQUENCE, "D"],
  ["state", "stateDiagram-v2\n A --> B\n", "A"],
  ["swimlane", "swimlane-beta LR\n A --> B\n", "A"],
  ["agent", AGENT, "B"],
  ["event", EVENT, "4"],
])("%s shares category mapping and duplicate rules through the real CLI", async (_, source, id) => {
  const dir = setup(), reference = await renderFigure(dir, "flowchart LR\n A[Orders]\n", { name: "reference", bindings: elements({ id: "A", category: "orders" }) });
  const r = await renderFigure(dir, source, { bindings: elements({ id, category: "orders" }, { id, category: "orders" }) });
  expect(r.code).toBe(0);
  const fill = /fill:(#[\da-f]+)/.exec(shape(reference.svg!, "A").style)![1]!;
  expect(marks(r.svg!, id).filter((m) => !m.text && !m.tag.includes('class="pele-lifeline"')).some((m) => m.style.includes(`fill:${fill}`))).toBe(true);
  for (const entries of [
    [{ id, role: "ok" }, { id, role: "bad" }],
    [{ id, role: "ok" }, { id, category: "one" }, { id, category: "two" }],
  ]) {
    const failed = await renderFigure(dir, source, { bindings: elements(...entries) });
    expect(failed.code).toBe(1); expect(failed.svg).toBe(r.svg); expect(failed.stdout).toBe("");
  }
  const repeated = await renderFigure(dir, source, { bindings: elements({ id, category: "orders" }, { id, role: "ok" }, { id, role: "ok" }) });
  expect(repeated.code).toBe(0);
  expect(marks(repeated.svg!, id).filter((m) => !m.text && !m.tag.includes('class="pele-lifeline"')).some((m) => m.style.includes("fill:#a6e3a1"))).toBe(true);
});

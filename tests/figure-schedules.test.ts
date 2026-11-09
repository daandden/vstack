import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderFigure, marks, shape, text } from "./support/figure-cli.ts";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function setup() { const dir = mkdtempSync(join(tmpdir(), "figure-schedules-")); dirs.push(dir); return dir; }
const elements = (...entries: unknown[]) => ({ elements: entries });
const GANTT = "gantt\n dateFormat YYYY-MM-DD\n Done :done, d, 2026-01-01, 2d\n Critical :crit, c, 2026-01-03, 2d\n Active :active, a, 2026-01-05, 2d\n Failed done :n, 2026-01-07, 2d\n";

test("Gantt source states distinguish done and critical from active and words in labels", async () => {
  const dir = setup(), r = await renderFigure(dir, GANTT);
  expect({ code: r.code, stderr: r.stderr }).toEqual({ code: 0, stderr: "" });
  expect(shape(r.svg!, "d").style).toContain("fill:#a6e3a1");
  expect(shape(r.svg!, "c").style).toContain("fill:#f9e2af");
  for (const id of ["a", "n"]) expect(shape(r.svg!, id).style).toContain("fill:#313244");
  const bound = await renderFigure(dir, GANTT, { name: "bound", bindings: elements({ id: "d", role: "bad" }, { id: "c", category: "orders" }), focus: ["d"] });
  expect(bound.code).toBe(0);
  expect(shape(bound.svg!, "d").style).toContain("fill:#f38ba8;stroke:#cba6f7");
  expect(text(bound.svg!, "d").style).toContain("fill:#cdd6f4");
  expect(shape(bound.svg!, "c").style).not.toContain("fill:#f9e2af");
});

const FAMILIES = [
  ["timeline", "timeline\n section orders\n  2026 : Launch\n", "orders"],
  ["journey", "journey\n section Review\n Submit: 5: orders\n", "orders"],
  ["kanban", "kanban\n orders[Orders]\n  work[Failed person]\n", "orders"],
  ["gitGraph", 'gitGraph\n commit id: "start"\n branch orders\n commit id: "work"\n', "orders"],
] as const;

test.each(FAMILIES)("%s categories share an exact key across families and support caller overrides", async (family, source, id) => {
  const dir = setup();
  const flow = await renderFigure(dir, "flowchart LR\n A[Orders]\n", { name: "flow", bindings: elements({ id: "A", category: "orders" }) });
  const r = await renderFigure(dir, source, { name: family, ...(family === "kanban" ? { bindings: elements({ id, category: "orders" }) } : {}) });
  expect({ code: r.code, stderr: r.stderr }).toEqual({ code: 0, stderr: "" });
  const fill = /fill:(#[\da-f]+)/.exec(shape(flow.svg!, "A").style)![1];
  expect(marks(r.svg!, id).some((mark) => mark.style.includes(`fill:${fill}`))).toBe(true);
  const bound = await renderFigure(dir, source, { name: "bound", bindings: elements({ id, role: "bad" }, { id, role: "bad" }, { id, category: "orders" }), focus: [id] });
  expect(bound.code).toBe(0);
  expect(r.svg).toContain(family === "journey" ? "Submit" : family === "timeline" ? "Launch" : family === "kanban" ? "Failed person" : "work");
  expect(bound.svg).toContain("fill:#f38ba8;stroke:#cba6f7");
});

test("journey people keep associated marks while scores and task names imply no state", async () => {
  const r = await renderFigure(setup(), "journey\n section Orders\n Failed: 1: Customer\n Accepted: 5: Customer\n", { bindings: elements({ id: "Customer", role: "bad" }) });
  expect(r.code).toBe(0);
  for (const id of ["Failed", "Accepted"]) expect(shape(r.svg!, id).style).toContain("fill:#313244");
  expect(marks(r.svg!, "Customer").filter((mark) => !mark.text)).toHaveLength(3);
  for (const mark of marks(r.svg!, "Customer")) expect(mark.style).toContain(mark.text ? "fill:#cdd6f4" : "fill:#f38ba8");
});

test.each([
  ["timeline event", "timeline\n 2026 : Launch\n", "Launch", "Missing"],
  ["generated Gantt id", "gantt\n dateFormat YYYY-MM-DD\n Build :2026-01-01, 2d\n", "task1", "Unsupported"],
  ["generated Git id", "gitGraph\n commit\n", "0-9e3779b", "Unsupported"],
  ["repeated timeline period", "timeline\n 2026 : First\n 2026 : Second\n", "2026", "Ambiguous"],
  ["repeated journey task", "journey\n Work: 1: A\n Work: 5: B\n", "Work", "Ambiguous"],
  ["section and card id", "kanban\n todo[Todo]\n  todo[Work]\n", "todo", "Ambiguous"],
])("%s refuses unavailable identity without replacing old output", async (_, source, id, reason) => {
  const dir = setup(), good = await renderFigure(dir, source);
  expect(good.code).toBe(0);
  for (const name of ["figure", "new"]) {
    const r = await renderFigure(dir, source, { name, bindings: elements({ id, role: "ok" }) });
    expect(r.code).toBe(1); expect(r.stderr).toContain(`${reason} binding target`); expect(r.stdout).toBe("");
    if (name === "figure") expect(r.svg).toBe(good.svg); else expect(existsSync(r.out)).toBe(false);
  }
});

test.each([...FAMILIES, ["gantt", GANTT, "d"]] as const)("%s preserves conflicting assignment refusals even behind a role", async (_, source, id) => {
  for (const entries of [
    [{ id, role: "ok" }, { id, role: "bad" }],
    [{ id, role: "ok" }, { id, category: "one" }, { id, category: "two" }],
  ]) {
    const r = await renderFigure(setup(), source, { bindings: elements(...entries) });
    expect(r.code).toBe(1); expect(existsSync(r.out)).toBe(false);
    expect(r.stderr).toMatch(/more than one color role|conflicting category keys/);
  }
});

test("category identities survive declaration and branch reordering and insertion in separate CLI processes", async () => {
  const dir = setup();
  const sources = [
    ["timeline\n section orders\n 2026 : Launch\n section billing\n 2027 : Pay\n", "timeline\n section inserted\n 2025 : New\n section billing\n 2027 : Pay\n section orders\n 2026 : Launch\n"],
    ["journey\n Work: 1: orders\n Pay: 5: billing\n", "journey\n New: 3: inserted\n Pay: 5: billing\n Work: 1: orders\n"],
    ["kanban\n orders[Orders]\n  work[Work]\n billing[Billing]\n  pay[Pay]\n", "kanban\n inserted[New]\n  new[New]\n billing[Billing]\n  pay[Pay]\n orders[Orders]\n  work[Work]\n"],
    ['gitGraph\n commit id: \"start\"\n branch orders\n commit id: \"work\"\n checkout main\n branch billing\n commit id: \"pay\"\n', 'gitGraph\n commit id: \"start\"\n branch inserted\n commit\n checkout main\n branch billing\n commit id: \"pay\"\n checkout main\n branch orders\n commit id: \"work\"\n'],
  ];
  for (const [index, [before, after]] of sources.entries()) {
    const bindings = index === 2 ? elements({ id: "orders", category: "orders" }, { id: "billing", category: "billing" }) : undefined;
    const first = await renderFigure(dir, before!, { name: `first-${index}`, bindings });
    const second = await renderFigure(dir, after!, { name: `second-${index}`, bindings });
    expect(first.code).toBe(0); expect(second.code).toBe(0);
    for (const id of ["orders", "billing"]) {
      const paints = (svg: string) => marks(svg, id).map((mark) => mark.style);
      expect(paints(second.svg!)).toEqual(paints(first.svg!));
    }
  }
});

test("Kanban priority identifies only the existing indicator and adds no label or legend", async () => {
  const dir = setup(), source = "kanban\n todo[Done failed]\n  work[Work]@{ priority: High, assigned: Agent }\n";
  const r = await renderFigure(dir, source);
  expect(r.code).toBe(0);
  expect(shape(r.svg!, "todo").style).toContain("fill:#313244");
  expect(shape(r.svg!, "work").style).toContain("fill:#313244");
  const indicator = marks(r.svg!, "work").find((mark) => mark.tag.includes('fill="none"'))!;
  const flow = await renderFigure(dir, "flowchart LR\n A[High]\n", { name: "flow", bindings: elements({ id: "A", category: "High" }) });
  const fill = /fill:(#[\da-f]+)/.exec(shape(flow.svg!, "A").style)![1];
  expect(indicator.style).toContain(`fill:none;stroke:${fill}`);
  expect(r.svg).not.toContain(">High<"); expect(r.svg).not.toContain("pele-legend");
});

test("Gantt labels placed outside short bars keep readable light paint", async () => {
  const r = await renderFigure(setup(), "gantt\n dateFormat YYYY-MM-DD\n Long completed task label outside its bar :done, short, 2026-01-01, 1d\n Long range :range, 2026-01-02, 40d\n");
  expect(r.code).toBe(0);
  expect(text(r.svg!, "short").style).toContain("fill:#cdd6f4");
});

test("Git histories keep branch identity beyond Pele's repeated series slots and retain colliding labels", async () => {
  const source = 'gitGraph\n commit id: "start"\n' + Array.from({ length: 20 }, (_, i) => ` branch category-${i}\n commit id: "work-${i}"\n checkout main\n`).join("");
  const r = await renderFigure(setup(), source);
  expect(r.code).toBe(0);
  const colors: string[] = [];
  for (let i = 0; i < 20; i++) {
    const branch = marks(r.svg!, `category-${i}`).find((mark) => mark.tag.startsWith("<rect"))!;
    const fill = /fill:(#[\da-f]+)/.exec(branch.style)![1]!;
    expect(shape(r.svg!, `work-${i}`).style).toContain(`fill:${fill}`);
    expect(r.svg).toContain(`>category-${i}<`);
    colors.push(fill);
  }
  expect(new Set(colors).size).toBeLessThan(20);
});

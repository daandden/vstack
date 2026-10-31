import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderFigure, shape, text } from "./support/figure-cli.ts";

const SCRIPT = join(import.meta.dir, "../plugin/skills/vstack-figures/scripts/render.ts");
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
function workdir() { const d = mkdtempSync(join(tmpdir(), "vstack-figure-")); dirs.push(d); return d; }
const FLOWCHART = "flowchart TD\n Cart([Cart submitted]) --> Stock{In stock?}\n Stock -- Yes --> Pay[Take payment]\n Stock -- No --> Split[Split shipment]\n Split --> Pay\n";
const MOCHA = new Set(["#f5e0dc", "#f2cdcd", "#f5c2e7", "#cba6f7", "#f38ba8", "#eba0ac", "#fab387", "#f9e2af", "#a6e3a1", "#94e2d5", "#89dceb", "#74c7ec", "#89b4fa", "#b4befe", "#cdd6f4", "#bac2de", "#a6adc8", "#9399b2", "#7f849c", "#6c7086", "#585b70", "#45475a", "#313244", "#1e1e2e", "#181825", "#11111b"]);

test("source files and repeatable focus render literal Mocha with an absolute output receipt", async () => {
  const dir = workdir(), source = join(dir, "source.mmd"), out = join(dir, "nested", "figure.svg");
  writeFileSync(source, FLOWCHART);
  const p = Bun.spawn([process.execPath, SCRIPT, source, out, "--focus", "Stock", "--focus", "Split"], { stdout: "pipe", stderr: "pipe" });
  expect(await new Response(p.stderr).text()).toBe(""); expect(await p.exited).toBe(0);
  expect((await new Response(p.stdout).text()).trim()).toBe(out);
  const svg = readFileSync(out, "utf8");
  expect(svg).toContain("'IosevkaTerm Nerd Font Mono', ui-monospace, monospace");
  expect(svg).toContain("--pele-bg: #1e1e2e"); expect(svg).toContain("--pele-surface: #313244");
  for (const id of ["Stock", "Split"]) { expect(shape(svg, id).style).toContain("stroke:#cba6f7"); expect(text(svg, id).style).toContain("fill:#cba6f7"); }
  expect(shape(svg, "Pay").style).not.toContain("#cba6f7");
  for (const color of svg.match(/#[\da-fA-F]{3,8}\b/g) ?? []) expect(MOCHA.has(color.toLowerCase())).toBe(true);
  expect(svg).not.toContain("color-mix");
});

test("stdin, nested groups, and focal roles keep their own geometry and fill", async () => {
  const r = await renderFigure(workdir(), "flowchart LR\n subgraph Outer\n subgraph Inner[Shipping]\n Split[Split shipment]:::warn\n end\n end\n Cart --> Pay[Take payment]:::ok\n class Inner store\n", { focus: ["Inner", "Pay"] });
  expect({ code: r.code, stderr: r.stderr }).toEqual({ code: 0, stderr: "" });
  expect(shape(r.svg!, "Inner").style).toContain("fill:#94e2d5;stroke:#cba6f7");
  expect(shape(r.svg!, "Split").style).toContain("fill:#f9e2af;stroke:#f9e2af");
  expect(shape(r.svg!, "Pay").style).toContain("fill:#a6e3a1;stroke:#cba6f7");
  expect(text(r.svg!, "Split").style).toContain("fill:#1e1e2e");
  expect(r.svg).not.toContain("color-mix");
});

test.each([
  ["ok", "#a6e3a1"], ["warn", "#f9e2af"], ["bad", "#f38ba8"], ["changed", "#89b4fa"],
  ["actor", "#f5c2e7"], ["store", "#94e2d5"], ["external", "#fab387"],
])("the %s role uses its fixed solid accent", async (role, color) => {
  const r = await renderFigure(workdir(), `flowchart LR\n A:::${role} --> B\n`);
  expect(r.code).toBe(0); expect(shape(r.svg!, "A").style).toContain(`fill:${color};stroke:${color}`);
  expect(text(r.svg!, "A").style).toContain("fill:#1e1e2e");
});

test.each([
  ["classDef", "flowchart LR\n A:::ok --> B\n classDef ok fill:#a6e3a1\n"],
  ["unused classDef", "flowchart LR\n A --> B\n classDef unused fill:red\n"],
  ["style", "flowchart LR\n A --> B\n style B stroke:#f00\n"],
  ["linkStyle", "flowchart LR\n A --> B\n linkStyle 0 stroke:red\n"],
  ["sequence rect", "sequenceDiagram\n rect rgb(40,40,60)\n A->>B: Hi\n end\n"],
  ["sequence box", "sequenceDiagram\n box Aqua Shop\n participant A\n end\n A->>A: Hi\n"],
])("authored paints in %s are semantic refusals without output", async (_, source) => {
  const r = await renderFigure(workdir(), source); expect(r.code).toBe(1);
  expect(r.stderr).toContain("The Mermaid sets its own color"); expect(existsSync(r.out)).toBe(false);
});

test.each(["green", "constructor", "pele-invalid", "highlight"])("unknown role %s is a semantic refusal", async (role) => {
  const r = await renderFigure(workdir(), `flowchart LR\n A:::${role} --> B\n`);
  expect(r.code).toBe(1); expect(r.stderr).toContain(`Unknown color role: ${role}`); expect(existsSync(r.out)).toBe(false);
});

test.each([
  "treeView-beta\n root/\n  a.ts :::highlight\n  b.ts\n",
  "flowchart LR\n A:::ok --> B\n class A ok\n",
])("Pele classes and identical role repeats still render", async (source) => {
  const r = await renderFigure(workdir(), source); expect({ code: r.code, stderr: r.stderr }).toEqual({ code: 0, stderr: "" });
});

test("different authored roles and bad Mermaid preserve a previous success", async () => {
  const dir = workdir(), good = await renderFigure(dir, FLOWCHART);
  for (const [source, message] of [
    ["flowchart LR\n A:::ok --> B\n class A store\n", "Element A has more than one color role"],
    ["flowchart TD\n A[Cart --> \n", "Parse error on line 2"],
  ]) {
    const r = await renderFigure(dir, source!); expect(r.code).toBe(1); expect(r.stderr).toContain(message!); expect(r.stdout).toBe(""); expect(r.svg).toBe(good.svg);
  }
});

test("usage and unreadable input errors exit 2 without publishing output", async () => {
  const dir = workdir(), out = join(dir, "figure.svg");
  for (const args of [[], ["missing"], ["missing", out], ["-", out, "--focus"], ["-", out, "extra"], ["-", out, "--bogus"], ["-", out, "--bindings", join(dir, "missing.json")]]) {
    const p = Bun.spawn([process.execPath, SCRIPT, ...args], { stdin: new Blob([FLOWCHART]), stdout: "pipe", stderr: "pipe" });
    expect(await p.exited).toBe(2); expect(await new Response(p.stderr).text()).toContain("Usage: bun render.ts"); expect(await new Response(p.stdout).text()).toBe("");
  }
  expect(existsSync(out)).toBe(false);
});

test.each([
  ["state", "stateDiagram-v2\n [*] --> Open\n Open --> Closed\n class Open ok\n", "Open"],
  ["requirement", "requirementDiagram\n requirement latency {\n id: 1\n text: Reply promptly\n risk: low\n verifymethod: test\n }\n class latency ok\n", "latency"],
  ["block", "block-beta\n columns 2\n A[\"Client\"] B[\"Server\"]\n class A ok\n", "A"],
  ["ER", "erDiagram\n CUSTOMER:::ok ||--o{ ORDER : places\n", "CUSTOMER"],
  ["class", "classDiagram\n class Order:::ok {\n +submit()\n }\n", "Order"],
  ["mindmap", "mindmap\n root((Order))\n  a[Payment]\n  :::ok\n", "a"],
])("existing %s authored roles retain solid literal role paint", async (_, source, id) => {
  const r = await renderFigure(workdir(), source);
  expect({ code: r.code, stderr: r.stderr }).toEqual({ code: 0, stderr: "" });
  expect(shape(r.svg!, id).style).toContain("fill:#a6e3a1");
  expect(text(r.svg!, id).style).toContain("fill:#1e1e2e");
});

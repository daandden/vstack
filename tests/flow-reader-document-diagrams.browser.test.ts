import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser } from "playwright-core";
import { ENV } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "flow-page", "scripts", "flow-page.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-reader-document-diagrams-")));
const home = join(root, "home");
mkdirSync(home);
const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
const port = socket.port;
socket.stop(true);

function cli(args: string[], input?: object) {
  const p = Bun.spawnSync([process.execPath, SCRIPT, ...args, "--home", home, "--session", "document-diagrams"], {
    cwd: root, env: { ...ENV, VSTACK_FLOW_PORT: String(port), HOME: home },
    stdin: input ? new TextEncoder().encode(JSON.stringify(input)) : "ignore", stdout: "pipe", stderr: "pipe",
  });
  if (p.exitCode !== 0) throw new Error(`flow-page ${args.join(" ")} exited ${p.exitCode}: ${p.stderr}`);
  return JSON.parse(p.stdout.toString());
}

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => {
  await browser?.close();
  try { cli(["host", "stop"]); } catch {}
  rmSync(root, { recursive: true, force: true });
});

const near = (actual: string, expected: number[]) => actual.match(/\d+/g)!.every((value, i) => Math.abs(Number(value) - expected[i]!) <= 1);

test("Document Mermaid draws through the figure reader with accessible naming, authored paints, and a keyboard Source disclosure", async () => {
  const opened = cli(["open", "--skill", "implement", "--title", "Document diagrams"]);
  const source = [
    "flowchart LR",
    "  a[Mapped paint]:::ok --> b[Fixed paint]",
    "  b --> c[Unmapped Mocha paint]",
    "  classDef ok fill:#a6e3a1,stroke:#cba6f7,color:#cdd6f4",
    "  style b fill:#123456,stroke:#654321",
    "  style c fill:#eba0ac",
    "  linkStyle 0 stroke:#fab387,stroke-width:4px",
  ].join("\n");
  const plain = "flowchart LR\n  a[Unclosed";
  const submitted = cli(["submit"], { version: 1, items: [{
    kind: "result", ref: "doc", shape: "document", title: "Spec drawing", sections: [{ heading: "Checkout decision", blocks: [
      { code: source, language: "mermaid", source: "docs/spec.md:12" },
      { code: plain, language: "text", source: "docs/example.txt:1" },
    ] }],
  }] });
  const context = await browser.newContext({ colorScheme: "light", viewport: { width: 320, height: 800 } });
  try {
    const page = await context.newPage();
    await page.goto(`${opened.live.url}#${submitted.refs.doc}`);
    const diagram = page.getByRole("img", { name: "Checkout decision diagram 1", exact: true });
    await diagram.locator("svg").waitFor();
    const figure = page.locator(".document figure").first();
    expect(await figure.locator("figcaption").count()).toBe(0);
    expect(await figure.locator(".figure-title").count()).toBe(0);
    const disclosure = figure.locator("details.source");
    expect(await disclosure.evaluate((d: HTMLDetailsElement) => d.open)).toBe(false);
    expect(await disclosure.locator("pre").isVisible()).toBe(false);
    await disclosure.locator("summary").focus();
    await page.keyboard.press("Enter");
    expect(await disclosure.locator("pre code").textContent()).toBe(source);
    expect(await disclosure.innerText()).toContain("docs/spec.md:12");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press("Enter");
    expect(await disclosure.evaluate((d: HTMLDetailsElement) => d.open)).toBe(false);
    expect(await page.locator('.document > section > figure.code pre[data-language="text"] code').textContent()).toBe(plain);
    expect(await page.locator("figure.code figcaption").innerText()).toBe("text · docs/example.txt:1");
    const paints = () => diagram.evaluate((host) => {
      const root = host.shadowRoot!;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d")!;
      const color = (paint: string) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = paint;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return `rgb(${r}, ${g}, ${b})`;
      };
      const shape = (id: string) => root.querySelector(`[data-id="${id}"] rect`)!;
      return {
        mapped: color(getComputedStyle(shape("a")).fill),
        border: color(getComputedStyle(shape("a")).stroke),
        fixed: color(getComputedStyle(shape("b")).fill),
        fixedBorder: color(getComputedStyle(shape("b")).stroke),
        unmapped: color(getComputedStyle(shape("c")).fill),
        strokes: [...root.querySelectorAll("path")].map((p) => color(getComputedStyle(p).stroke)),
        focus: root.querySelector("style")!.textContent,
      };
    });
    const light = await paints();
    expect(light.mapped).toBe("rgb(64, 160, 43)");
    expect(light.border).toBe("rgb(136, 57, 239)");
    expect(light.fixed).toBe("rgb(18, 52, 86)");
    expect(light.fixedBorder).toBe("rgb(101, 67, 33)");
    expect(light.unmapped).toBe("rgb(235, 160, 172)");
    expect(light.strokes.some((color) => near(color, [254, 100, 11]))).toBe(true);
    expect(light.focus).not.toContain("[data-id=");
    await diagram.evaluate((host) => { (window as any).documentDiagram = host.shadowRoot!.querySelector("svg"); });
    await page.getByRole("button", { name: "Dark", exact: true }).click();
    const dark = await paints();
    expect(dark.mapped).toBe("rgb(166, 227, 161)");
    expect(dark.border).toBe("rgb(203, 166, 247)");
    expect(dark.fixed).toBe(light.fixed);
    expect(dark.fixedBorder).toBe(light.fixedBorder);
    expect(dark.unmapped).toBe(light.unmapped);
    expect(dark.strokes.some((color) => near(color, [250, 179, 135]))).toBe(true);
    expect(await diagram.evaluate((host) => host.shadowRoot!.querySelector("svg") === (window as any).documentDiagram)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await context.close();
  }
}, 120_000);

test("Document Sankey keeps authored node paints when the shared role pass refuses them", async () => {
  const opened = cli(["open", "--skill", "implement", "--title", "Document Sankey paint"]);
  const source = '---\nconfig:\n  sankey:\n    linkColor: target\n    nodeColors:\n      Orders: "#123456"\n      Other: "#654321"\n---\nsankey\n\nOrders,Other,3\n';
  const submitted = cli(["submit"], { version: 1, items: [{
    kind: "result", ref: "doc", shape: "document", title: "Authored Sankey", sections: [{ heading: "Authored endpoints", blocks: [{ code: source, language: "mermaid" }] }],
  }] });
  const context = await browser.newContext({ colorScheme: "light" });
  try {
    const page = await context.newPage();
    await page.goto(`${opened.live.url}#${submitted.refs.doc}`);
    const diagram = page.getByRole("img", { name: "Authored endpoints diagram 1", exact: true });
    await diagram.locator("svg").waitFor();
    for (const theme of ["Light", "Dark"] as const) {
      await page.getByRole("button", { name: theme, exact: true }).click();
      const seen = await diagram.evaluate((host) => {
        const svg = host.shadowRoot!.querySelector("svg")!;
        const fill = (selector: string) => getComputedStyle(svg.querySelector(selector)!).fill;
        return {
          source: fill('.pele-sankey-node[data-id="Orders"]'),
          target: fill('.pele-sankey-node[data-id="Other"]'),
          link: fill(".pele-sankey-link"),
        };
      });
      expect(seen).toEqual({ source: "rgb(18, 52, 86)", target: "rgb(101, 67, 33)", link: "rgb(101, 67, 33)" });
    }
  } finally { await context.close(); }
}, 120_000);

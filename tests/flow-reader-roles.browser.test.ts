import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Locator } from "playwright-core";
import { ENV } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "flow-page", "scripts", "flow-page.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-reader-roles-")));
const home = join(root, "home");
mkdirSync(home);
const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
const port = socket.port;
socket.stop(true);
function cli(args: string[], input?: object) {
  const p = Bun.spawnSync([process.execPath, SCRIPT, ...args, "--home", home, "--session", "reader-roles", "--agent", "fixture"], {
    cwd: root, env: { ...ENV, HOME: home, VSTACK_FLOW_PORT: String(port) },
    stdin: input ? new TextEncoder().encode(JSON.stringify(input)) : "ignore", stdout: "pipe", stderr: "pipe",
  });
  if (p.exitCode !== 0) throw new Error(`flow-page ${args.join(" ")}: ${p.stderr}`);
  return JSON.parse(p.stdout.toString());
}
let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => {
  await browser?.close();
  try { cli(["host", "stop"]); } catch {}
  rmSync(root, { recursive: true, force: true });
});

const ROLES = ["ok", "warn", "bad", "changed", "actor", "store", "external"] as const;
const ACCENTS = {
  Light: {
    ok: [64, 160, 43], warn: [223, 142, 29], bad: [210, 15, 57], changed: [30, 102, 245],
    actor: [234, 118, 203], store: [23, 146, 153], external: [254, 100, 11],
  },
  Dark: {
    ok: [166, 227, 161], warn: [249, 226, 175], bad: [243, 139, 168], changed: [137, 180, 250],
    actor: [245, 194, 231], store: [148, 226, 213], external: [250, 179, 135],
  },
};
const near = (actual: number[], expected: number[]) => actual.every((n, i) => Math.abs(n - expected[i]!) <= 3);
const luminance = (rgb: number[]) => rgb.map((n) => n / 255).map((n) => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4)
  .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i]!, 0);

async function paints(figure: Locator) {
  return figure.evaluate((host) => {
    const svg = host.shadowRoot!.querySelector("svg")!;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    const rgb = (paint: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = paint;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    return Object.fromEntries([...svg.querySelectorAll(".pele-node")].map((node) => {
      const shape = node.querySelector("rect, path, polygon, circle, ellipse")!;
      const shapeStyle = getComputedStyle(shape);
      return [node.getAttribute("data-id")!, {
        fill: rgb(shapeStyle.fill), stroke: rgb(shapeStyle.stroke), opacity: Number(shapeStyle.fillOpacity),
        width: parseFloat(shapeStyle.strokeWidth), label: rgb(getComputedStyle(node.querySelector("text")!).fill),
        background: rgb(getComputedStyle(svg).backgroundColor),
      }];
    }));
  });
}

function capture(source: string, focus: string[], caption: string) {
  writeFileSync(join(root, "roles.mmd"), source);
  const opened = cli(["open", "--skill", "implement", "--title", caption]);
  const submitted = cli(["submit"], { version: 1, items: [
    { kind: "attachment", ref: "figure", type: "mermaid", path: "roles.mmd", caption, origin: "Reader role fixture", ...(focus.length ? { focus } : {}) },
    { kind: "result", ref: "result", shape: "document", title: "Role drawing", sections: [{ heading: "Drawing", blocks: [{ figure: "figure" }] }] },
  ] });
  return { ...opened, live: { ...opened.live, url: `${opened.live.url}#${submitted.refs.result}` } };
}

test("the reader applies all shared Color roles and intrinsic kinds, with readable labels and border-only focus in both themes without redrawing", async () => {
  const source = ["flowchart TD", ...ROLES.map((role) => `  ${role}[${role}]:::${role}`),
    "  focused[Focused success]:::ok", "  person@{ shape: person, label: Reader }", "  database[(Captured source)]", "  plain[Neutral]",
  ].join("\n");
  const opened = capture(source, ["focused"], "All Color roles");
  const context = await browser.newContext({ colorScheme: "light", viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(opened.live.url);
    const figure = page.getByRole("img", { name: "All Color roles", exact: true });
    await figure.locator("svg").waitFor();
    await figure.evaluate((host) => { (window as any).roleDrawing = host.shadowRoot!.querySelector("svg"); });
    for (const theme of ["Light", "Dark", "Light"] as const) {
      await page.getByRole("button", { name: theme, exact: true }).click();
      const seen = await paints(figure);
      for (const role of ROLES) {
        const node = seen[role]!;
        expect(near(node.fill, ACCENTS[theme][role]), `${theme} ${role}: ${node.fill}`).toBe(true);
        expect(node.opacity).toBe(0.22);
        expect(node.stroke).toEqual(node.fill);
        expect(node.label).toEqual(seen.plain!.label);
        const backing = node.fill.map((n, j) => n * node.opacity + node.background[j]! * (1 - node.opacity));
        const a = luminance(node.label), b = luminance(backing);
        expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
      }
      expect(seen.person!.fill).toEqual(seen.actor!.fill);
      expect(seen.database!.fill).toEqual(seen.store!.fill);
      expect(seen.focused).toMatchObject({ fill: seen.ok!.fill, opacity: seen.ok!.opacity, label: seen.ok!.label, width: 2.5 });
      expect(near(seen.focused!.stroke, theme === "Light" ? [136, 57, 239] : [203, 166, 247])).toBe(true);
      expect(await figure.evaluate((host) => host.shadowRoot!.querySelector("svg") === (window as any).roleDrawing)).toBe(true);
    }
    await page.setViewportSize({ width: 320, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
}, 120_000);

test.each([
  ["unknown role", "flowchart LR\n  a[Historical target]:::unknown --> b[Other]:::ok"],
  ["conflicting roles", "flowchart LR\n  a[Historical target]:::ok --> b[Other]:::ok\n  class a bad"],
  ["authored paint", "flowchart LR\n  a[Historical target]:::ok --> b[Other]:::ok\n  style a fill:#123456,stroke:#654321"],
])("a stored figure refused for %s still draws without role paints and keeps only its focus border", async (reason, historical) => {
  const opened = capture("flowchart LR\n  a[Historical target] --> b[Other]", ["a"], `Historical ${reason}`);
  const context = await browser.newContext({ colorScheme: "light" });
  try {
    const page = await context.newPage();
    await page.route("**/assets/**/roles.mmd", (route) => route.fulfill({ contentType: "text/plain", body: historical }));
    await page.goto(opened.live.url);
    const figure = page.getByRole("img", { name: `Historical ${reason}`, exact: true });
    await figure.locator("svg").waitFor();
    for (const theme of ["Light", "Dark"] as const) {
      await page.getByRole("button", { name: theme, exact: true }).click();
      const seen = await paints(figure);
      expect(seen.a!.width).toBe(2.5);
      expect(near(seen.a!.stroke, theme === "Light" ? [136, 57, 239] : [203, 166, 247])).toBe(true);
      expect(seen.a!.label).toEqual(reason === "authored paint" ? theme === "Light" ? [239, 241, 245] : [205, 214, 244] : seen.b!.label);
      expect(seen.a!.opacity).toBe(1);
      expect(seen.b!.opacity).toBe(1);
      expect(near(seen.b!.fill, ACCENTS[theme].ok)).toBe(false);
      if (reason === "authored paint") expect(seen.a!.fill).toEqual([18, 52, 86]);
    }
  } finally { await context.close(); }
}, 120_000);

test.each(["source", "target"] as const)("Sankey %s links match the selected endpoint in both reader themes", async (mode) => {
  const source = `---\nconfig:\n  sankey:\n    linkColor: ${mode}\n---\nsankey\n\nOrders,Other,3\n`;
  const caption = `Sankey ${mode} endpoint`;
  const opened = capture(source, [], caption);
  const context = await browser.newContext({ colorScheme: "light" });
  try {
    const page = await context.newPage();
    await page.goto(opened.live.url);
    const figure = page.getByRole("img", { name: caption, exact: true });
    await figure.locator("svg").waitFor();
    for (const theme of ["Light", "Dark"] as const) {
      await page.getByRole("button", { name: theme, exact: true }).click();
      const seen = await figure.evaluate((host) => {
        const svg = host.shadowRoot!.querySelector("svg")!;
        const fill = (selector: string) => getComputedStyle(svg.querySelector(selector)!).fill;
        return {
          link: fill(".pele-sankey-link"),
          source: fill('.pele-sankey-node[data-id="Orders"]'),
          target: fill('.pele-sankey-node[data-id="Other"]'),
        };
      });
      expect(seen.source).not.toBe(seen.target);
      expect(seen.link).toBe(seen[mode]);
    }
  } finally { await context.close(); }
}, 120_000);

// The Flow reader's diagrams as a reader sees them in headless Chromium: a Flow served by the real CLI and host in
// an isolated home and port. Chromium comes from playwright-core's own browser cache, here and in CI.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Locator, type Page } from "playwright-core";
import { ENV } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "flow-page", "scripts", "flow-page.ts");
const CAPTURED_SVG = join(import.meta.dir, "fixtures", "flow-page-diagrams", "captured-pele-mocha.svg");
const SETUP = "./node_modules/.bin/playwright-core install --only-shell chromium (CI: the \"Install Chromium\" step in .github/workflows/check-register.yml)";

const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-reader-diagrams-")));
const home = join(root, "home");
mkdirSync(home);
const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
const port = socket.port;
socket.stop(true);

function cli(args: string[], input?: object) {
  const p = Bun.spawnSync([process.execPath, SCRIPT, ...args, "--home", home, "--session", "diagrams"], {
    cwd: root, env: { ...ENV, VSTACK_FLOW_PORT: String(port), HOME: home },
    stdin: input ? new TextEncoder().encode(JSON.stringify(input)) : "ignore", stdout: "pipe", stderr: "pipe",
  });
  const stderr = p.stderr.toString();
  if (p.exitCode !== 0) throw new Error(`flow-page ${args.join(" ")} exited ${p.exitCode}: ${stderr}`);
  return JSON.parse(p.stdout.toString());
}

let browser: Browser;
beforeAll(async () => {
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    throw new Error(`Headless Chromium for playwright-core is not installed. Run: ${SETUP}\n${(e as Error).message}`);
  }
});
afterAll(async () => {
  await browser?.close();
  try { cli(["host", "stop"]); } catch {}
  rmSync(root, { recursive: true, force: true });
});

// Catppuccin's published hex values, the independent source for "Latte" and "Mocha".
const PALETTES = {
  latte: { base: [0xef, 0xf1, 0xf5], mantle: [0xe6, 0xe9, 0xef], surface0: [0xcc, 0xd0, 0xda] },
  mocha: { base: [0x1e, 0x1e, 0x2e], mantle: [0x18, 0x18, 0x25], surface0: [0x31, 0x32, 0x44] },
};
type Rgb = number[];

/** The share of a figure's drawn pixels near each palette color, read from a screenshot of the figure. */
async function palette(figure: Locator, decoder: Page): Promise<Record<string, number>> {
  const png = (await figure.screenshot()).toString("base64");
  const targets = Object.fromEntries(Object.entries(PALETTES).flatMap(([p, colors]) => Object.entries(colors).map(([c, rgb]) => [`${p}.${c}`, rgb])));
  return decoder.evaluate(async ({ png, targets }: { png: string; targets: Record<string, Rgb> }) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const px = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const share: Record<string, number> = {};
    for (const [name, [r, g, b]] of Object.entries(targets)) {
      let near = 0;
      for (let i = 0; i < px.length; i += 4) if (Math.abs(px[i]! - r!) <= 6 && Math.abs(px[i + 1]! - g!) <= 6 && Math.abs(px[i + 2]! - b!) <= 6) near++;
      share[name] = near / (px.length / 4);
    }
    return share;
  }, { png, targets });
}

/** Waits until the figure is drawn in one palette and shows none of the other. */
async function drawnIn(figure: Locator, decoder: Page, scheme: "latte" | "mocha"): Promise<Record<string, number>> {
  const other = scheme === "latte" ? "mocha" : "latte";
  let seen: Record<string, number> = {};
  for (const end = Date.now() + 10_000; Date.now() < end; await Bun.sleep(100)) {
    seen = await palette(figure, decoder);
    const total = (p: string) => Object.keys(PALETTES[p as keyof typeof PALETTES]).reduce((s, c) => s + seen[`${p}.${c}`]!, 0);
    if (seen[`${scheme}.surface0`]! > 0.05 && total(scheme) > 0.3 && total(other) < 0.005) return seen;
  }
  throw new Error(`the figure did not show ${scheme}: ${JSON.stringify(seen)}`);
}

test("Flow diagrams draw safely in the reader's Latte or Mocha theme, and a captured Pele SVG keeps its bytes", async () => {
  const opened = cli(["open", "--skill", "grill-me", "--title", "Diagrams in the reader"]);
  writeFileSync(join(root, "hostile.mmd"), [
    "flowchart LR",
    '  h1["<img src=x onerror=alert(1)> <script>alert(2)</script> Plain text"] --> h2["</text><foreignObject><div>pwn</div></foreignObject>"]',
    '  h2 --> h3["&lt;svg onload=alert(3)&gt; and javascript:alert(4)"]',
    '  click h1 "javascript:alert(5)"',
    '  click h3 href "https://example.com/beacon"',
    "",
  ].join("\n"));
  writeFileSync(join(root, "reading.mmd"), 'flowchart TD\n  a1["Read the page"] --> a2["Answer the question"]\n  a2 --> a3["Publish the result"]\n');
  copyFileSync(CAPTURED_SVG, join(root, "captured.svg"));
  const captured = readFileSync(CAPTURED_SVG);
  const capturedSha = new Bun.CryptoHasher("sha256").update(captured).digest("hex");
  const figure = (ref: string, title: string) => ({
    ref: `${ref}-question`, title, description: `Look at the ${title} diagram.`,
    needs: [{ need: `Follow the ${title} steps.`, kind: "context-diagram" }],
    figures: [{ attachment: ref, kind: "context-diagram" }],
    options: [{ label: "Fine", does: "Accepts it", gains: ["Clarity"], costs: ["None"] }],
  });
  cli(["submit"], { version: 1, items: [
    { kind: "attachment", ref: "hostile", type: "mermaid", caption: "Hostile labels", origin: "Mermaid source hostile.mmd", path: "hostile.mmd", focus: ["h1"] },
    { kind: "attachment", ref: "reading", type: "mermaid", caption: "Reading then answering", origin: "Mermaid source reading.mmd", path: "reading.mmd", focus: ["a2"] },
    { kind: "attachment", ref: "captured", type: "svg", caption: "Captured design review", origin: "Pele render of design-review-sequence.mmd", path: "captured.svg" },
    { kind: "round", questions: [figure("hostile", "hostile"), figure("reading", "reading"), figure("captured", "captured")] },
  ] });

  const context = await browser.newContext({ colorScheme: "light", viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const decoder = await context.newPage();
  const dialogs: string[] = [];
  const offOrigin: string[] = [];
  const popups: string[] = [];
  const origin = new URL(opened.live.url).origin;
  page.on("dialog", (d) => { dialogs.push(d.message()); void d.dismiss(); });
  page.on("request", (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith("data:")) offOrigin.push(r.url()); });
  context.on("page", (p) => { if (p !== decoder) popups.push(p.url()); });

  await page.goto(opened.live.url);
  await page.getByRole("button", { name: "Light" }).click();

  // A hostile label is text: its markup never becomes elements, handlers, links, or requests.
  const hostile = page.getByRole("img", { name: "Hostile labels" });
  await hostile.getByText("Plain text").waitFor();
  for (const text of ["pwn", "javascript:alert(4)"]) expect(await hostile.getByText(text).first().isVisible()).toBe(true);
  const injected = await hostile.evaluate((host) => {
    const all = [...(host.shadowRoot ?? host).querySelectorAll("*")];
    return {
      active: all.filter((e) => ["script", "img", "image", "foreignobject", "iframe", "object", "embed", "a", "div"].includes(e.localName.toLowerCase())).map((e) => e.localName),
      handlers: all.flatMap((e) => [...e.attributes].filter((a) => /^on/i.test(a.localName)).map((a) => `${e.localName}@${a.name}`)),
      links: all.flatMap((e) => [...e.attributes].filter((a) => /href$/i.test(a.localName) && !a.value.startsWith("#")).map((a) => `${e.localName}@${a.value}`)),
    };
  });
  expect(injected).toEqual({ active: [], handlers: [], links: [] });
  for (const text of ["Plain text", "javascript:alert(4)"]) await hostile.getByText(text).first().click();
  await Bun.sleep(300);
  expect(page.url()).toBe(opened.live.url);
  expect({ dialogs, offOrigin, popups }).toEqual({ dialogs: [], offOrigin: [], popups: [] });

  // A Mermaid figure draws in Latte on the light theme and in Mocha once the reader switches to dark, in place.
  const reading = page.getByRole("img", { name: "Reading then answering" });
  await reading.getByText("Answer the question").waitFor();
  await reading.scrollIntoViewIfNeeded();
  await drawnIn(reading, decoder, "latte");
  await page.evaluate(() => { (window as any).sameDocument = true; });
  await page.getByRole("button", { name: "Dark" }).click();
  await drawnIn(reading, decoder, "mocha");
  expect(await page.evaluate(() => (window as any).sameDocument)).toBe(true);

  // A Pele SVG captured in Mocha shows Latte on the light theme, while the host still serves its captured bytes.
  await page.getByRole("button", { name: "Light" }).click();
  const old = page.getByRole("img", { name: "Captured design review" });
  await old.scrollIntoViewIfNeeded();
  await drawnIn(old, decoder, "latte");
  const model = await (await fetch(new URL("content", opened.live.url))).json() as any;
  const stored = model.attachments.find((a: any) => a.caption === "Captured design review");
  const served = Buffer.from(await (await fetch(new URL(`assets/${stored.file}`, opened.live.url))).arrayBuffer());
  expect(new Bun.CryptoHasher("sha256").update(served).digest("hex")).toBe(capturedSha);
  expect({ dialogs, offOrigin, popups }).toEqual({ dialogs: [], offOrigin: [], popups: [] });
  await context.close();
}, 120_000);

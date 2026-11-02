
import { afterAll, beforeAll, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Locator, type Page } from "playwright-core";
import { ENV } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "flow-page", "scripts", "flow-page.ts");
const CAPTURED_SVG = join(import.meta.dir, "fixtures", "flow-page-diagrams", "captured-pele-mocha.svg");
const STYLED_SOURCE = join(import.meta.dir, "fixtures", "flow-page-diagrams", "styled-mocha.mmd");
const STYLED_SVG = join(import.meta.dir, "fixtures", "flow-page-diagrams", "styled-pele-mocha.svg");
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

test.each(["mermaid", "svg"] as const)("Flow diagrams draw safely in the reader's Latte or Mocha theme with styled %s, and captured bytes stay unchanged", async (type) => {
  const opened = cli(["open", "--skill", "grill-me", "--title", "Diagrams in the reader"]);
  writeFileSync(join(root, "hostile.mmd"), [
    "flowchart LR",
    '  h1["<img src=x onerror=alert(1)> <script>alert(2)</script> Plain text"] --> h2["</text><foreignObject><div>pwn</div></foreignObject>"]',
    '  h2 --> h3["&lt;svg onload=alert(3)&gt; and javascript:alert(4)"]',
    '  click h1 "javascript:alert(5)"',
    '  click h3 href "https://example.com/beacon"',
    "",
  ].join("\n"));
  copyFileSync(type === "mermaid" ? STYLED_SOURCE : STYLED_SVG, join(root, "reading"));
  copyFileSync(CAPTURED_SVG, join(root, "captured.svg"));
  copyFileSync(STYLED_SVG, join(root, "styled.svg"));
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
    { kind: "attachment", ref: "reading", type, caption: "Reading then answering", origin: `Styled ${type} capture`, path: "reading", ...(type === "mermaid" ? { focus: ["a2"] } : {}) },
    { kind: "attachment", ref: "captured", type: "svg", caption: "Captured design review", origin: "Pele render of design-review-sequence.mmd", path: "captured.svg" },
    { kind: "attachment", ref: "styled", type: "svg", caption: "Styled historical design", origin: "Pele render of styled-mocha.mmd", path: "styled.svg" },
    { kind: "round", questions: [figure("hostile", "hostile"), figure("reading", "reading"), figure("captured", "captured"), figure("styled", "styled")] },
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

  const reading = page.getByRole("img", { name: "Reading then answering" });
  await reading.getByText("Answer the question").waitFor();
  await reading.scrollIntoViewIfNeeded();
  await drawnIn(reading, decoder, "latte");
  await page.evaluate(() => { (window as any).sameDocument = true; });
  await page.getByRole("button", { name: "Dark" }).click();
  await drawnIn(reading, decoder, "mocha");
  expect(await page.evaluate(() => (window as any).sameDocument)).toBe(true);

  await page.getByRole("button", { name: "Light" }).click();
  const old = page.getByRole("img", { name: "Captured design review" });
  await old.scrollIntoViewIfNeeded();
  await drawnIn(old, decoder, "latte");
  const styled = page.getByRole("img", { name: "Styled historical design" });
  await styled.scrollIntoViewIfNeeded();
  await drawnIn(styled, decoder, "latte");
  const authored = (f: Locator) => f.evaluate((host) => getComputedStyle(host.shadowRoot!.querySelector('[data-id="a4"] rect')!).fill);
  expect(await authored(reading)).toBe("rgb(18, 52, 86)");
  expect(await authored(styled)).toBe("rgb(18, 52, 86)");
  await page.getByRole("button", { name: "Dark" }).click();
  await drawnIn(styled, decoder, "mocha");
  expect(await authored(reading)).toBe("rgb(18, 52, 86)");
  expect(await authored(styled)).toBe("rgb(18, 52, 86)");
  const model = await (await fetch(new URL("content", opened.live.url))).json() as any;
  const stored = model.attachments.find((a: any) => a.caption === "Captured design review");
  const served = Buffer.from(await (await fetch(new URL(`assets/${stored.file}`, opened.live.url))).arrayBuffer());
  expect(new Bun.CryptoHasher("sha256").update(served).digest("hex")).toBe(capturedSha);
  for (const [caption, file] of [["Reading then answering", type === "mermaid" ? STYLED_SOURCE : STYLED_SVG], ["Styled historical design", STYLED_SVG]]) {
    const attachment = model.attachments.find((a: any) => a.caption === caption);
    const bytes = Buffer.from(await (await fetch(new URL(`assets/${attachment.file}`, opened.live.url))).arrayBuffer());
    expect(bytes.equals(readFileSync(file!))).toBe(true);
  }
  expect({ dialogs, offOrigin, popups }).toEqual({ dialogs: [], offOrigin: [], popups: [] });
  await context.close();
}, 120_000);

test.each(["mermaid", "svg"] as const)("narrow readers preserve %s label size and allow keyboard panning without page overflow", async (type) => {
  const opened = cli(["open", "--skill", "grill-me", "--title", "Reading a wide diagram"]);
  const source = join(root, `wide.${type === "mermaid" ? "mmd" : "svg"}`);
  if (type === "mermaid") writeFileSync(source, [
    "flowchart LR",
    '  a["Read the first contribution"] --> b["Answer the current question"]',
    '  b --> c["Keep the earlier contribution in place"]',
    '  c --> d["Continue reading the next contribution"]',
  ].join("\n"));
  else copyFileSync(CAPTURED_SVG, source);
  const bytes = readFileSync(source);
  cli(["submit"], { version: 1, items: [
    { kind: "attachment", ref: "wide", type, caption: "Wide reading diagram", origin: "Captured diagram", path: source },
    { kind: "round", questions: [{
      ref: "wide-reading", title: "Can you follow the full path?", description: "Read every step before answering.",
      needs: [{ need: "Follow the full reading path.", kind: "context-diagram" }],
      figures: [{ attachment: "wide", kind: "context-diagram" }],
      options: [{ label: "Continue", does: "Keeps the reading path", gains: ["Readable steps"], costs: ["None"] }],
    }] },
  ] });
  const context = await browser.newContext({ viewport: { width: 360, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(opened.live.url);
    const figure = page.getByRole("img", { name: "Wide reading diagram" });
    await figure.locator("svg").waitFor();
    for (const theme of ["Light", "Dark"]) {
      await page.getByRole("button", { name: theme, exact: true }).click();
      const geometry = await figure.evaluate((host) => ({
        fonts: [...host.shadowRoot!.querySelectorAll("text")].filter((t) => t.textContent?.trim()).map((t) => {
          const matrix = t.getScreenCTM()!;
          return parseFloat(getComputedStyle(t).fontSize) * Math.hypot(matrix.a, matrix.b);
        }),
        viewport: host.clientWidth, drawing: host.scrollWidth,
        page: document.documentElement.scrollWidth, screen: innerWidth,
      }));
      expect(geometry.fonts.length).toBeGreaterThan(0);
      expect(Math.min(...geometry.fonts)).toBeGreaterThanOrEqual(12);
      expect(geometry.drawing).toBeGreaterThan(geometry.viewport);
      expect(geometry.page).toBeLessThanOrEqual(geometry.screen);
      await figure.evaluate((host) => { host.scrollLeft = 0; });
      await figure.focus();
      const readingUrl = page.url();
      await page.keyboard.press("ArrowRight");
      await Bun.sleep(250);
      const panned = await figure.evaluate((host) => host.scrollLeft);
      expect(panned).toBeGreaterThan(0);
      await page.keyboard.press("ArrowLeft");
      await Bun.sleep(250);
      expect(await figure.evaluate((host) => host.scrollLeft)).toBeLessThan(panned);
      expect(page.url()).toBe(readingUrl);
      expect(await figure.evaluate((host) => document.activeElement === host)).toBe(true);
    }
    const model = await (await fetch(new URL("content", opened.live.url))).json() as any;
    const attachment = model.attachments.find((a: any) => a.caption === "Wide reading diagram");
    const served = Buffer.from(await (await fetch(new URL(`assets/${attachment.file}`, opened.live.url))).arrayBuffer());
    expect(served.equals(bytes)).toBe(true);
  } finally {
    await context.close();
  }
}, 120_000);

test("image titles keep one current question prefix and reuse exact adjacent pretitles", async () => {
  const opened = cli(["open", "--skill", "grill-me", "--title", "Image title projection"]);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
  const path = join(root, "caption.png");
  writeFileSync(path, png);
  const caption = "Q1 · With-skill example · Light · 1280 × 900 CSS px";
  const options = [{ label: "Inspect", does: "Reads the example", gains: ["Context"], costs: ["Reading"] }];
  cli(["submit"], { version: 1, items: [
    { kind: "attachment", ref: "qualified", type: "image", path, caption, origin: "Recorded image fixture" },
    { kind: "attachment", ref: "unqualified", type: "image", path, caption: "No-skill example", origin: "Recorded image fixture" },
    { kind: "round", questions: [
      { title: "Exact adjacent title", description: "Keep the authored title once.", options,
        needs: [{ need: "Read the title.", kind: "source-excerpt" }, { need: "Inspect the image.", kind: "source-view" }],
        figures: [{ text: caption, kind: "source-excerpt" }, { attachment: "qualified", kind: "source-view" }] },
      { title: "Reused image", description: "Use this question's identity.", options,
        needs: [{ need: "Inspect the image.", kind: "source-view" }], figures: [{ attachment: "qualified", kind: "source-view" }] },
      { title: "Option preview", description: "Use this question's identity.",
        needs: [{ need: "Inspect the preview.", kind: "option-preview" }],
        options: [{ ...options[0], preview: { attachment: "qualified", kind: "option-preview" } }] },
      { title: "Unqualified caption", description: "Add the owning question's identity.", options,
        needs: [{ need: "Inspect the image.", kind: "source-view" }], figures: [{ attachment: "unqualified", kind: "source-view" }] },
    ] },
    { kind: "result", shape: "document", title: "Recorded Result caption", sections: [{ heading: "Example", blocks: [{ figure: "qualified" }] }] },
  ] });
  const historical = join(home, ".vstack", "tmp", "_global", "caption-history");
  mkdirSync(historical, { recursive: true });
  writeFileSync(join(historical, "caption.png"), png);
  const pretitle = "Q7 · Historical example";
  writeFileSync(join(historical, "page.jsonl"), [
    { type: "page", id: "page", title: "Historical title projection" },
    { type: "stage", id: "grill", skill: "grill-me", state: "in-progress", order: 1 },
    { type: "round", id: "r1", stage: "grill", time: "2026-10-28T20:09:59+07:00", session: 1, round: 1 },
    { type: "question", id: "historical-caption", round: "r1", q: 7, title: "Historical pretitle", description: "Keep the exact pretitle.",
      options: [{ ...options[0], label: "A. Inspect" }], visual: { html: `<p>${pretitle}</p><img src="caption.png" alt="${pretitle}">` } },
  ].map((row) => JSON.stringify(row)).join("\n") + "\n");
  const migrated = cli(["migrate", historical]);
  for (const width of [1280, 360]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      const page = await context.newPage();
      for (const theme of ["Light", "Dark"]) {
        await page.goto(opened.live.url);
        await page.getByRole("button", { name: theme, exact: true }).click();
        const figures = page.locator("figure.visual, figure.attachment");
        expect(await figures.count()).toBe(5);
        const expected = [caption, "Q2 · With-skill example · Light · 1280 × 900 CSS px", "Q3 · With-skill example · Light · 1280 × 900 CSS px", "Q4 · No-skill example", caption];
        for (let i = 0; i < expected.length; i++) {
          const figure = figures.nth(i);
          await figure.locator("img").evaluate((img: HTMLImageElement) => img.decode());
          expect(await figure.evaluate((el) => el.querySelector(".label")?.textContent ?? (el.classList.contains("attachment") ? el.querySelector("figcaption p")?.textContent : el.previousElementSibling?.textContent))).toBe(expected[i]);
          expect(await figure.locator("figcaption").innerText()).toContain("Origin: Recorded image fixture");
        }
        expect(await figures.first().locator(".label").count()).toBe(0);
        await page.goto(migrated.live.url);
        const old = page.locator("#historical-caption");
        await old.locator("img").evaluate((img: HTMLImageElement) => img.decode());
        expect((await old.innerText()).split(pretitle).length - 1).toBe(1);
        expect(await old.locator(".figure-caption .label").count()).toBe(0);
      }
    } finally {
      await context.close();
    }
  }
});


import { afterAll, beforeAll, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Locator, type Page } from "playwright-core";
import { ENV } from "./support/fixture.ts";
import { storedFolder } from "./support/flow-store.ts";

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
    cwd: root, env: { ...ENV, VSTACK_FLOW_PORT: String(port), HOME: join(root, "default-home") },
    stdin: input ? new TextEncoder().encode(JSON.stringify(input)) : "ignore", stdout: "pipe", stderr: "pipe",
  });
  const stderr = p.stderr.toString();
  if (p.exitCode !== 0) throw new Error(`flow-page ${args.join(" ")} exited ${p.exitCode}: ${stderr}`);
  return JSON.parse(p.stdout.toString());
}

function seedHistoricalMermaidCapture(flow: string, attachmentId: string, source: Buffer, name: string) {
  const folder = storedFolder(home, flow);
  const statePath = join(folder, "data", "state.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const revision = new Bun.CryptoHasher("sha256").update(source).digest("hex");
  const file = `${revision}/${name}`;
  mkdirSync(join(folder, "assets", revision), { recursive: true });
  writeFileSync(join(folder, "assets", file), source);
  Object.assign(state.attachments.find((a: any) => a.id === attachmentId), { revision, file, size: source.length });
  state.revision++;
  writeFileSync(statePath, JSON.stringify(state));
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

test("stored flowcharts redraw with export step routes and theme-colored label outlines", async () => {
  const opened = cli(["open", "--skill", "grill-me", "--title", "Stored flowchart readability"]);
  const historical = readFileSync(join(import.meta.dir, "fixtures", "flow-page-diagrams", "release-cascade.mmd"), "utf8");
  const grouped = "flowchart TD\n subgraph Run[Review run]\n A[Read] -->|continue| B[Answer]\n A --> C[Inspect]\n C --> B\n end\n";
  const sources = { historical, grouped };
  const exported: Record<string, string[]> = {};
  const commands = (svg: string) => [...svg.matchAll(/<g class="pele-edge"[^>]*><path d="([^"]+)"/g)].map((m) => m[1]!.replace(/[^a-z]/gi, ""));
  for (const [name, source] of Object.entries(sources)) {
    writeFileSync(join(root, `${name}.mmd`), source);
    const output = join(root, `${name}.svg`);
    const rendered = Bun.spawnSync([process.execPath, join(import.meta.dir, "..", "plugin", "skills", "vstack-figures", "scripts", "render.ts"), "-", output], {
      stdin: Buffer.from(source), stdout: "pipe", stderr: "pipe",
    });
    expect({ exit: rendered.exitCode, stderr: rendered.stderr.toString() }).toEqual({ exit: 0, stderr: "" });
    exported[name] = commands(readFileSync(output, "utf8"));
  }
  cli(["submit"], { version: 1, items: [
    ...Object.keys(sources).map((name) => ({ kind: "attachment", ref: name, type: "mermaid", caption: name, origin: "Stored flowchart source", path: `${name}.mmd` })),
    { kind: "result", shape: "document", title: "Stored flowcharts", sections: [{ heading: "Drawings", blocks: Object.keys(sources).map((figure) => ({ figure })) }] },
  ] });
  const context = await browser.newContext({ colorScheme: "light", viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(opened.live.url);
    await page.reload();
    await page.locator(`nav[aria-label="Flow tabs"] a[href="#${opened.stage}"]`).click();
    for (const [theme, background] of [["Light", [239, 241, 245]], ["Dark", [30, 30, 46]]] as const) {
      await page.getByRole("button", { name: theme, exact: true }).click();
      for (const name of Object.keys(sources)) {
        const figure = page.getByRole("img", { name, exact: true });
        await figure.locator("svg").waitFor();
        const drawing = await figure.evaluate((host) => {
          const svg = host.shadowRoot!.querySelector("svg")!;
          const previous = (host as HTMLElement & { readabilitySVG?: Element }).readabilitySVG;
          (host as HTMLElement & { readabilitySVG?: Element }).readabilitySVG = svg;
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1;
          const paint = canvas.getContext("2d")!;
          return {
            sameDrawing: !previous || previous === svg,
            edges: [...svg.querySelectorAll(".pele-edge > path:first-child")].map((p) => p.getAttribute("d")!.replace(/[^a-z]/gi, "")),
            labels: [...svg.querySelectorAll(".pele-edge-label text, .pele-cluster-label")].map((label) => {
              const style = getComputedStyle(label);
              paint.fillStyle = style.stroke;
              paint.fillRect(0, 0, 1, 1);
              return { stroke: [...paint.getImageData(0, 0, 1, 1).data].slice(0, 3), width: parseFloat(style.strokeWidth), fontSize: parseFloat(style.fontSize), order: style.paintOrder, join: style.strokeLinejoin };
            }),
            clusters: svg.querySelectorAll(".pele-cluster-label").length,
            boxes: [...svg.querySelectorAll(".pele-edge-label > rect")].map((box) => getComputedStyle(box).display),
          };
        });
        expect(drawing.sameDrawing).toBe(true);
        expect(drawing.edges.length).toBeGreaterThan(0);
        expect(drawing.edges.every((d) => !/[CSA]/i.test(d))).toBe(true);
        expect(drawing.edges.some((d) => /[LHV].*[LHV].*[LHV]/i.test(d))).toBe(true);
        expect(exported[name]!.length).toBe(drawing.edges.length);
        expect(exported[name]!.every((d) => !/[CSA]/i.test(d))).toBe(true);
        expect(exported[name]!.some((d) => /[LHV].*[LHV].*[LHV]/i.test(d))).toBe(true);
        expect(drawing.labels.length).toBeGreaterThan(0);
        for (const label of drawing.labels) {
          expect(label).toMatchObject({ stroke: background, order: "stroke", join: "round" });
          expect(label.width).toBeCloseTo(label.fontSize * 0.12, 3);
        }
        expect(drawing.boxes.length).toBeGreaterThan(0);
        expect(drawing.boxes.every((display) => display === "none")).toBe(true);
        if (name === "grouped") expect(drawing.clusters).toBeGreaterThan(0);
      }
    }
    const model = await (await fetch(new URL("content", opened.live.url))).json() as any;
    const attachment = model.attachments.find((a: any) => a.caption === "historical");
    expect(await (await fetch(new URL(`assets/${attachment.file}`, opened.live.url))).text()).toBe(historical);
  } finally {
    await context.close();
  }
}, 120_000);

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
  if (type === "mermaid") writeFileSync(join(root, "reading"), "flowchart TD\n a1[Read the page] --> a2[Answer the question]:::ok\n");
  else copyFileSync(STYLED_SVG, join(root, "reading"));
  copyFileSync(CAPTURED_SVG, join(root, "captured.svg"));
  copyFileSync(STYLED_SVG, join(root, "styled.svg"));
  const captured = readFileSync(CAPTURED_SVG);
  const capturedSha = new Bun.CryptoHasher("sha256").update(captured).digest("hex");
  const figure = (ref: string, title: string) => ({
    ref: `${ref}-question`, title, description: `Look at the ${title} diagram.`,
    needs: [{ need: `Follow the ${title} steps.`, kind: "context-diagram" }],
    figures: [{ attachment: ref, kind: "context-diagram" }],
    options: [{ label: "Fine", does: `Accepts the ${title} drawing`, gains: [`Clarity for ${title}`], costs: [`No revision of ${title}`] }],
  });
  const submitted = cli(["submit"], { version: 1, items: [
    { kind: "attachment", ref: "hostile", type: "mermaid", caption: "Hostile labels", origin: "Mermaid source hostile.mmd", path: "hostile.mmd", focus: ["h1"] },
    { kind: "attachment", ref: "reading", type, caption: "Reading then answering", origin: `Styled ${type} capture`, path: "reading", ...(type === "mermaid" ? { focus: ["a2"] } : {}) },
    { kind: "attachment", ref: "captured", type: "svg", caption: "Captured design review", origin: "Pele render of design-review-sequence.mmd", path: "captured.svg" },
    { kind: "attachment", ref: "styled", type: "svg", caption: "Styled historical design", origin: "Pele render of styled-mocha.mmd", path: "styled.svg" },
    { kind: "round", questions: [figure("hostile", "hostile"), figure("reading", "reading"), figure("captured", "captured"), figure("styled", "styled")] },
  ] });
  if (type === "mermaid") seedHistoricalMermaidCapture(submitted.flow, submitted.refs.reading, readFileSync(STYLED_SOURCE), "reading.mmd");

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

test("every figure shows its caption as a title, a formatted description, and a closed Source, above a media box sized to the media", async () => {
  const opened = cli(["open", "--skill", "grill-me", "--title", "Figure captions"]);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
  writeFileSync(join(root, "caption.png"), png);
  writeFileSync(join(root, "narrow.mmd"), "flowchart TD\n  a[Start] --> b[End]\n");
  const description = "Two steps:\n\n- `Start` comes first\n- [End](https://example.com/end) comes last";
  const options = [{ label: "Inspect", does: "Reads the figure", gains: ["Context"], costs: ["Reading"] }];
  cli(["submit"], { version: 1, items: [
    { kind: "attachment", ref: "flow", type: "mermaid", path: "narrow.mmd", caption: "Narrow flow", description, origin: "Mermaid source narrow.mmd" },
    { kind: "attachment", ref: "shot", type: "image", path: "caption.png", caption: "Q1 · Legacy screenshot", origin: "Recorded image fixture" },
    { kind: "background", title: "Context", summary: "Why these figures exist.", sections: [{ heading: "Today", body: "Two figures." }], sources: ["fixture"], figures: [{ attachment: "shot" }] },
    { kind: "round", questions: [{
      title: "Which figure reads better?", description: "Compare them.",
      needs: [{ need: "Read the label.", kind: "source-excerpt" }, { need: "Follow the flow.", kind: "context-diagram" }, { need: "See the screenshot.", kind: "option-preview" }],
      figures: [{ text: "Narrow flow", kind: "source-excerpt" }, { attachment: "flow", kind: "context-diagram" }],
      options: [{ ...options[0], preview: { attachment: "shot", kind: "option-preview" } }],
    }] },
    { kind: "result", shape: "document", title: "Figures in a Result", sections: [{ heading: "Flow", blocks: [{ figure: "flow" }] }], attachments: ["shot"] },
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

  const context = await browser.newContext({ colorScheme: "light", viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(opened.live.url);
    await page.getByRole("img", { name: "Narrow flow" }).first().locator("svg").waitFor();
    expect(await page.locator("main").evaluate((m) => m.getBoundingClientRect().width)).toBe(1024);

    const figures = page.locator("figure");
    expect(await figures.count()).toBe(5);
    const body = await page.evaluate(() => {
      const probe = document.body.appendChild(document.createElement("span"));
      probe.style.background = "var(--mantle)";
      const mantle = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return { color: getComputedStyle(document.body).color, size: parseFloat(getComputedStyle(document.body).fontSize), mantle };
    });
    for (let i = 0; i < 5; i++) {
      const figure = figures.nth(i);
      await figure.scrollIntoViewIfNeeded();
      const title = figure.locator(".figure-title");
      expect(["Narrow flow", "Legacy screenshot"]).toContain(await title.innerText());
      const look = await title.evaluate((t) => ({ family: getComputedStyle(t).fontFamily, weight: getComputedStyle(t).fontWeight, color: getComputedStyle(t).color }));
      expect(look.family).toContain("Slab");
      expect(look).toMatchObject({ weight: "650", color: body.color });
      expect(await figure.evaluate((f) => getComputedStyle(f).backgroundColor)).toBe("rgba(0, 0, 0, 0)");

      const source = figure.locator("details.source");
      expect(await source.locator("summary").innerText()).toBe("Source");
      expect(await source.evaluate((d: HTMLDetailsElement) => d.open)).toBe(false);
      const origin = (await title.innerText()) === "Narrow flow" ? "Mermaid source narrow.mmd" : "Recorded image fixture";
      expect(await figure.getByText(origin).isVisible()).toBe(false);
      await source.locator("summary").click();
      expect(await figure.getByText(origin).isVisible()).toBe(true);

      if ((await title.innerText()) !== "Narrow flow") continue;
      const text = figure.locator(".figure-description");
      expect(await text.locator("li").count()).toBe(2);
      expect(await text.locator("code").innerText()).toBe("Start");
      expect(await text.locator("a").getAttribute("href")).toBe("https://example.com/end");
      const drawn = await figure.locator(".diagram").evaluate((host) => {
        const svg = host.shadowRoot!.querySelector("svg")!;
        return {
          background: getComputedStyle(host).backgroundColor,
          host: host.getBoundingClientRect().width, svg: svg.getBoundingClientRect().width,
          fonts: [...svg.querySelectorAll("text")].filter((t) => t.textContent?.trim()).map((t) => parseFloat(getComputedStyle(t).fontSize) * Math.hypot(t.getScreenCTM()!.a, t.getScreenCTM()!.b)),
        };
      });
      expect(drawn.background).toBe(body.mantle);
      expect(drawn.host).toBeLessThan(drawn.svg + 32);
      expect(drawn.fonts.length).toBeGreaterThan(0);
      for (const size of drawn.fonts) expect(size).toBeCloseTo(body.size, 1);
    }
    expect(await page.locator("figcaption").filter({ hasText: /Q\d+ ·/ }).count()).toBe(0);

    await page.goto(migrated.live.url);
    const old = page.locator("#historical-caption");
    await old.locator("img").evaluate((img: HTMLImageElement) => img.decode());
    expect(await old.locator(".figure-title").innerText()).toBe("Historical example");
    expect((await old.innerText()).split("Historical example").length - 1).toBe(1);
    expect(await old.innerText()).not.toContain("Q7 ·");
    expect(await old.evaluate((el) => getComputedStyle(el.querySelector(".figure-title")!.closest("[id]")!).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    expect(await old.locator("details.source summary").innerText()).toBe("Source");
    await old.locator("details.source summary").click();
    const source = await old.locator("details.source").innerText();
    for (const field of ["Image", "Captured", "Revision", "Origin: Grilling page"]) expect(source).toContain(field);
  } finally {
    await context.close();
  }
}, 120_000);

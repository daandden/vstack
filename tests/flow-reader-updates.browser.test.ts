import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import { ENV, git } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "flow-page", "scripts", "flow-page.ts");

test("eight parked readers release HTTP/1.1 capacity and retain their place through authored and observation-only updates", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-reader-updates-")));
  const home = join(root, "home");
  mkdirSync(home);
  git(root, "init", "-q");
  git(root, "commit", "-q", "--allow-empty", "-m", "seed");
  const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = socket.port;
  socket.stop(true);
  function cli(args: string[], input?: object): any {
    const p = Bun.spawnSync([process.execPath, SCRIPT, ...args, "--home", home, "--session", "01a1aab9-cf0b-7748-8926-cbabe7deb9b8", "--agent", "Merge330"], {
      cwd: root, env: { ...ENV, HOME: home, VSTACK_FLOW_PORT: String(port) },
      stdin: input ? new TextEncoder().encode(JSON.stringify(input)) : "ignore", stdout: "pipe", stderr: "pipe",
    });
    if (p.exitCode !== 0) throw new Error(`flow-page ${args.join(" ")}: ${p.stderr}`);
    return JSON.parse(p.stdout.toString());
  }
  let remote = "open";
  const methods: string[] = [];
  const observedAt = new Date().toISOString();
  const provider = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(req) {
    methods.push(req.method);
    return Response.json({ observed_at: observedAt, records: [{ name: "Capacity PR", state: remote }] });
  } });
  mkdirSync(join(root, "docs", "vstack"), { recursive: true });
  writeFileSync(join(root, "docs", "vstack", "code-host.md"), `- Flow observation: ${JSON.stringify({ adapter: "http-json", url: provider.url.origin, poll_seconds: 0.1 })}\n`);
  writeFileSync(join(root, "evidence.txt"), "Captured capacity evidence\n");
  const browser = await chromium.launch({ headless: true, ...(process.env.VSTACK_TEST_BROWSER_CHANNEL ? { channel: process.env.VSTACK_TEST_BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const readers: Page[] = [];
  try {
    const opened = cli(["open", "--skill", "research", "--title", "Reader capacity fixture"]);
    const seed = cli(["submit"], { version: 1, items: [
      { kind: "attachment", ref: "capture", type: "file", path: "evidence.txt", caption: "Capacity evidence", origin: "Owned fixture" },
      { kind: "result", ref: "before", shape: "document", title: "Earlier evidence", sections: [{ heading: "Context", blocks: [{ prose: "Earlier reading context. ".repeat(200) }] }] },
      { kind: "result", ref: "selected", shape: "document", title: "Selected evidence", attachments: ["capture"], sections: [{ heading: "Reading stop", blocks: [{ prose: "Keep this reading stop selected." }] }] },
    ] });
    await context.addInitScript(() => {
      Object.defineProperty(document, "visibilityState", { get: () => "hidden" });
      Object.defineProperty(document, "hidden", { get: () => true });
    });
    let contentReads = 0;
    context.on("request", (req) => { if (new URL(req.url()).pathname.endsWith("/content")) contentReads++; });
    for (let i = 0; i < 8; i++) {
      const page = await context.newPage();
      readers.push(page);
      await page.goto(opened.live.url, { waitUntil: "domcontentloaded", timeout: 5000 });
      await page.getByRole("heading", { name: "Selected evidence", exact: true }).waitFor({ timeout: 5000 });
    }
    const selected = readers[6]!;
    await selected.route(/\/(versions|content|observations)$/, async (route) => {
      const response = await route.fetch();
      await Bun.sleep(750);
      await route.fulfill({ response });
    });
    const endViewport = await selected.locator(`#${seed.refs.selected}`).evaluate((el) => Math.ceil(
      document.documentElement.scrollHeight - (el.getBoundingClientRect().top + scrollY)
      + parseFloat(getComputedStyle(document.documentElement).scrollPaddingBlockStart) + 6,
    ));
    await selected.setViewportSize({ width: 1280, height: endViewport });
    await selected.getByText("On this page", { exact: true }).click();
    await selected.locator(`.jump-row a[href="#${seed.refs.selected}"]`).click();
    await selected.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await selected.locator(`.jump-row a[href="#${seed.refs.selected}"]`).getAttribute("aria-current")).toBe("location");
    await selected.waitForFunction((id) => document.querySelector(`.jump-row a[href="#${id}"]`)?.getAttribute("aria-current") === "location", seed.refs.selected);
    const position = await selected.locator(`#${seed.refs.selected}`).evaluate((el) => el.getBoundingClientRect().top);
    const address = selected.url();
    const focus = await selected.evaluate(() => document.activeElement?.id);
    const captured = await readers[7]!.evaluate(async () => {
      const model = await (await fetch(new URL("content", location.href))).json();
      const file = model.attachments.find((a: any) => a.caption === "Capacity evidence").file;
      return await (await fetch(new URL(`assets/${file}`, location.href))).text();
    });
    expect(captured).toBe("Captured capacity evidence\n");
    const unchangedReads = contentReads;
    remote = "merged";
    await Promise.all(readers.map((p) => p.waitForFunction(() => document.querySelector("#observation-code-host")?.textContent?.includes("merged"), undefined, { timeout: 6000 })));
    expect(contentReads).toBe(unchangedReads);
    const saved = await (await fetch(new URL("content", opened.live.url))).json() as any;
    expect(saved.revision).toBe(seed.revision);
    expect(saved.flow.id).toBe(opened.flow);
    const updated = cli(["submit"], { version: 1, items: [
      { kind: "result", revises: seed.refs.before, shape: "document", title: "Expanded earlier evidence", sections: [{ heading: "Context", blocks: [{ prose: "Expanded reading context. ".repeat(400) }] }] },
    ] });
    await Promise.all(readers.map((p) => p.getByRole("heading", { name: "Expanded earlier evidence", exact: true }).waitFor({ state: "attached", timeout: 6000 })));
    expect(selected.url()).toBe(address);
    expect(await selected.evaluate(() => document.activeElement?.id)).toBe(focus);
    expect(await selected.locator(`.jump-row a[href="#${seed.refs.selected}"]`).getAttribute("aria-current")).toBe("location");
    expect(Math.abs(await selected.locator(`#${seed.refs.selected}`).evaluate((el) => el.getBoundingClientRect().top) - position)).toBeLessThan(2);
    expect((await (await fetch(new URL("versions", opened.live.url))).json() as any).revision).toBe(updated.revision);
    expect(methods.length).toBeGreaterThan(0);
    expect(methods.every((m) => m === "GET")).toBe(true);
    const reads = await selected.evaluate(() => performance.getEntriesByType("resource")
      .filter((r) => /\/(versions|content|observations)$/.test(r.name))
      .map((r) => ({ start: r.startTime, end: (r as PerformanceResourceTiming).responseEnd, duration: r.duration }))
      .sort((a, b) => a.start - b.start));
    expect(reads.some((r) => r.duration >= 700)).toBe(true);
    for (let i = 1; i < reads.length; i++) expect(reads[i]!.start).toBeGreaterThanOrEqual(reads[i - 1]!.end);
    expect((await fetch(new URL("versions", opened.live.url), { method: "POST" })).status).toBe(405);
    expect(context.pages()).toHaveLength(8);
  } finally {
    await context.close();
    await browser.close();
    cli(["host", "stop"]);
    provider.stop(true);
    rmSync(root, { recursive: true, force: true });
  }
}, 60_000);

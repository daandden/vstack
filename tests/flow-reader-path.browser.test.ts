import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser } from "playwright-core";
import { ENV } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "flow-page", "scripts", "flow-page.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-reader-path-")));
const home = join(root, "home");
mkdirSync(home);
const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
const port = socket.port;
socket.stop(true);

function cli(args: string[], items?: object[]) {
  const p = Bun.spawnSync([process.execPath, SCRIPT, ...args, "--home", home, "--session", "path", "--agent", "main"], {
    cwd: root, env: { ...ENV, VSTACK_FLOW_PORT: String(port), HOME: home },
    stdin: items ? new TextEncoder().encode(JSON.stringify({ version: 1, items })) : "ignore", stdout: "pipe", stderr: "pipe",
  });
  if (p.exitCode !== 0) throw new Error(`flow-page ${args.join(" ")} exited ${p.exitCode}: ${p.stderr.toString()}`);
  return JSON.parse(p.stdout.toString());
}

let browser: Browser;
beforeAll(async () => {
  try { browser = await chromium.launch({ headless: true }); }
  catch (e) { throw new Error(`Install Chromium: ./node_modules/.bin/playwright-core install --only-shell chromium\n${(e as Error).message}`); }
});
afterAll(async () => {
  await browser?.close();
  try { cli(["host", "stop"]); } catch {}
  rmSync(root, { recursive: true, force: true });
});

test("the Matt path stands above Flow content with recorded step states and is absent off-path", async () => {
  const grill = cli(["open", "--skill", "grill-with-docs", "--title", "Matt path banner"]);
  cli(["submit", "--flow", grill.flow, "--stage", grill.stage], [{ kind: "stage", state: "finished" }]);
  const spec = cli(["open", "--skill", "to-spec", "--flow", grill.flow]);
  cli(["submit", "--flow", spec.flow, "--stage", spec.stage], [{ kind: "stage", state: "finished" }]);
  cli(["open", "--skill", "to-tickets", "--flow", grill.flow]);
  const offPath = cli(["open", "--skill", "research", "--title", "Off-path findings"]);
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  try {
    const page = await context.newPage();
    await page.goto(grill.live.url);
    await page.locator(".bar .tabs").waitFor();
    const banner = page.getByRole("region", { name: "Matt flow path" });
    expect(await banner.count()).toBe(1);
    expect(await banner.isVisible()).toBe(true);
    expect(await banner.locator("ol").count()).toBeGreaterThan(0);
    expect(await banner.locator("[data-path-step]").evaluateAll((els) => els.map((el) => [el.getAttribute("data-path-step"), el.getAttribute("data-state")]))).toEqual([
      ["grill", "finished"], ["to-spec", "finished"], ["to-tickets", "in-progress"], ["implement-spec", "to-come"],
    ]);
    expect(await banner.locator('[aria-current="step"]').getAttribute("data-path-step")).toBe("to-tickets");
    expect(await banner.locator('[aria-current="step"] .path-step-heading').textContent()).toContain("to-tickets");
    const geometry = await banner.evaluate((el) => ({
      top: el.getBoundingClientRect().top,
      bottom: el.getBoundingClientRect().bottom,
      heading: document.querySelector(".masthead")!.getBoundingClientRect().top,
      content: document.getElementById("reading")!.getBoundingClientRect().top,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.heading);
    expect(geometry.bottom).toBeLessThan(geometry.content);
    expect(geometry.overflow).toBe(0);
    await page.goto(offPath.live.url);
    await page.locator(".bar .tabs").waitFor();
    expect(await page.getByRole("region", { name: "Matt flow path" }).count()).toBe(0);
    expect(await page.locator("#overview").textContent()).toContain("Research");
  } finally { await context.close(); }
}, 120_000);

test("repeated Matt path Stages have distinct labels and nonoverlapping 44px links", async () => {
  const first = cli(["open", "--skill", "implement", "--title", "Repeated implement Stages"]);
  cli(["submit", "--flow", first.flow, "--stage", first.stage], [{ kind: "stage", state: "finished" }]);
  const second = cli(["open", "--skill", "implement", "--flow", first.flow]);
  for (const width of [360, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      const page = await context.newPage();
      await page.goto(first.live.url);
      await page.locator(".bar .tabs").waitFor();
      const step = page.locator('[data-path-step="implement"]');
      expect(await step.locator(".path-step-heading > :first-child").textContent()).toBe("implement");
      const links = step.locator(".path-stages a");
      expect(await links.allTextContents()).toEqual(["Implement", "Implement 2"]);
      expect(await links.evaluateAll((els) => {
        const rects = els.map((el) => el.getBoundingClientRect());
        return rects.every((r) => r.width >= 44 && r.height >= 44)
          && rects.every((r, i) => rects.slice(i + 1).every((s) => r.bottom <= s.top || s.bottom <= r.top || r.right <= s.left || s.right <= r.left));
      })).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      await step.getByRole("link", { name: "Implement 2", exact: true }).click();
      expect(new URL(page.url()).hash).toBe(`#${second.stage}`);
      await page.locator(`.bar .tabs a[href="#${second.stage}"][aria-current="page"]`).waitFor();
      expect(await page.getByRole("navigation", { name: "Flow tabs", exact: true }).getByRole("link", { name: "Implement 2", exact: true }).getAttribute("aria-current")).toBe("page");
    } finally { await context.close(); }
  }
}, 120_000);

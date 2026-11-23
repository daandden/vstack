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
    cwd: root, env: { ...ENV, VSTACK_FLOW_PORT: String(port), HOME: join(root, "default-home") },
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

test("the Matt path lives only in the Map panel with recorded states and is absent off-path", async () => {
  const grill = cli(["open", "--skill", "grill-with-docs", "--title", "Matt path map"]);
  cli(["submit", "--flow", grill.flow, "--stage", grill.stage], [{ kind: "stage", state: "finished" }]);
  const spec = cli(["open", "--skill", "to-spec", "--flow", grill.flow]);
  cli(["submit", "--flow", spec.flow, "--stage", spec.stage], [{ kind: "stage", state: "finished" }]);
  cli(["open", "--skill", "to-tickets", "--flow", grill.flow]);
  const offPath = cli(["open", "--skill", "research", "--title", "Off-path findings"]);
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  try {
    const page = await context.newPage();
    await page.goto(grill.live.url);
    await page.getByRole("navigation", { name: "Flow navigation", exact: true }).waitFor();
    expect(await page.locator(".reader > .matt-path").count()).toBe(0);
    await page.keyboard.press("m");
    const map = page.getByRole("dialog", { name: "Map", exact: true });
    await map.waitFor();
    expect(await map.getByText(/tabs ·.*items · Enter opens/).count()).toBe(0);
    for (const control of [map.getByRole("button", { name: "Close" }), ...await map.getByRole("tab").all()]) {
      expect(await control.evaluate(el => {
        const css = getComputedStyle(el);
        return [css.minBlockSize, css.paddingInlineStart];
      })).toEqual(["28px", "8px"]);
    }
    expect(await map.getByRole("tab").allTextContents()).toEqual(["Matt flow path", "Stages"]);
    await page.keyboard.press("h");
    const path = map.getByRole("region", { name: "Matt flow path" });
    expect(await path.isVisible()).toBe(true);
    expect(await path.locator("ol").count()).toBeGreaterThan(0);
    expect(await path.locator("[data-path-step]").evaluateAll((els) => els.map((el) => [el.getAttribute("data-path-step"), el.getAttribute("data-state")]))).toEqual([
      ["grill", "finished"], ["to-spec", "finished"], ["to-tickets", "in-progress"], ["implement-spec", "to-come"],
    ]);
    expect(await path.locator('[aria-current="step"]').getAttribute("data-path-step")).toBe("to-tickets");
    const active = path.locator('[aria-current="step"]');
    expect(await active.getByText("In progress", { exact: true }).count()).toBe(1);
    expect(await path.getByRole("heading", { name: "Multi session", exact: true }).isVisible()).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    const initial = page.url();
    await page.keyboard.press("j");
    expect(await page.evaluate(() => document.activeElement?.getAttribute("data-path-step"))).toBe("to-spec");
    await page.keyboard.press("k");
    expect(await page.evaluate(() => document.activeElement?.getAttribute("data-path-step"))).toBe("grill");
    expect(page.url()).toBe(initial);
    await page.keyboard.press("Enter");
    await map.waitFor({ state: "hidden" });
    await page.locator(`#${grill.stage}`).waitFor();
    await page.goto(offPath.live.url);
    await page.getByRole("navigation", { name: "Flow navigation", exact: true }).waitFor();
    await page.keyboard.press("m");
    await map.waitFor();
    expect(await map.getByRole("tab").allTextContents()).toEqual(["Stages"]);
    expect(await map.getByRole("tab", { name: "Stages", exact: true }).getAttribute("aria-selected")).toBe("true");
    expect(await page.getByRole("region", { name: "Matt flow path" }).count()).toBe(0);
    expect(await page.locator("#overview").textContent()).toContain("Research");
  } finally { await context.close(); }
}, 120_000);

test("repeated Matt path Stages have distinct labels and nonoverlapping compact links", async () => {
  const first = cli(["open", "--skill", "implement", "--title", "Repeated implement Stages"]);
  cli(["submit", "--flow", first.flow, "--stage", first.stage], [{ kind: "stage", state: "finished" }]);
  const second = cli(["open", "--skill", "implement", "--flow", first.flow]);
  cli(["submit", "--flow", second.flow, "--stage", second.stage], [{ kind: "stage", state: "finished" }]);
  const third = cli(["open", "--skill", "implement", "--flow", first.flow]);
  for (const width of [320, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      const page = await context.newPage();
      await page.goto(first.live.url);
      await page.getByRole("navigation", { name: "Flow navigation", exact: true }).waitFor();
      await page.keyboard.press("m");
      await page.getByRole("dialog", { name: "Map", exact: true }).waitFor();
      await page.keyboard.press("h");
      const step = page.locator('[data-path-step="implement"]');
      const skill = step.getByText("implement", { exact: true });
      const links = step.getByRole("link");
      expect(await links.allTextContents()).toEqual(["Implement", "Implement 2", "Implement 3"]);
      expect(await step.getByText("Finished", { exact: true }).count()).toBe(1);
      expect(await step.getByText("In progress", { exact: true }).count()).toBe(1);
      if (width === 1280) {
        const skillBox = (await skill.boundingBox())!, stageBox = (await links.first().boundingBox())!;
        expect(stageBox.x).toBeGreaterThan(skillBox.x);
        expect(Math.abs(skillBox.y + skillBox.height / 2 - stageBox.y - stageBox.height / 2)).toBeLessThan(6);
        expect(await step.getByText("In progress", { exact: true }).evaluate(el => {
          const text = document.createRange();
          text.selectNodeContents(el);
          return text.getClientRects().length;
        })).toBe(1);
      }
      expect(await links.evaluateAll((els) => {
        const rects = els.map((el) => el.getBoundingClientRect());
        return els.every((el) => getComputedStyle(el).minBlockSize === "28px" && getComputedStyle(el).paddingInlineStart === "8px")
          && rects.every((r, i) => rects.slice(i + 1).every((s) => r.bottom <= s.top || s.bottom <= r.top || r.right <= s.left || s.right <= r.left));
      })).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      for (const [index, stage] of [[2, second], [3, third]] as const) {
        await step.getByRole("link", { name: `Implement ${index}`, exact: true }).click();
        expect(new URL(page.url()).hash).toBe(`#${stage.stage}`);
        await page.locator(`#${stage.stage}`).waitFor();
        expect(await page.getByRole("navigation", { name: "Flow navigation", exact: true }).getByText(`Implement ${index}`, { exact: true }).isVisible()).toBe(true);
        if (index === 2) {
          await page.keyboard.press("m");
          await page.keyboard.press("h");
          await step.waitFor();
        }
      }
    } finally { await context.close(); }
  }
}, 120_000);

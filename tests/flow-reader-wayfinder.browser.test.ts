import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser } from "playwright-core";
import { ENV } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin/skills/flow-page/scripts/flow-page.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-reader-wayfinder-")));
const home = join(root, "home");
mkdirSync(home);
const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
const port = socket.port;
socket.stop(true);
function cli(args: string[], items?: object[]) {
  const p = Bun.spawnSync([process.execPath, SCRIPT, ...args, "--home", home, "--session", "wayfinder", "--agent", "main"], {
    cwd: root, env: { ...ENV, VSTACK_FLOW_PORT: String(port), HOME: home },
    stdin: items ? new TextEncoder().encode(JSON.stringify({ version: 1, items })) : "ignore", stdout: "pipe", stderr: "pipe",
  });
  if (p.exitCode) throw new Error(p.stderr.toString());
  return JSON.parse(p.stdout.toString());
}
const ticket = (id: string, state = "frontier", blockers: string[] = [], title = `Decide ${id}`) => ({ id, title, url: `https://tracker.example.test/issues/${id}`, state, blockers });
const publish = (tickets: object[]) => {
  const opened = cli(["open", "--skill", "wayfinder", "--title", "Wayfinder ticket graph"]);
  cli(["submit", "--flow", opened.flow, "--stage", opened.stage], [{ kind: "wayfinder", tickets }]);
  return opened;
};
let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => {
  await browser?.close();
  try { cli(["host", "stop"]); } catch {}
  rmSync(root, { recursive: true, force: true });
});

test("the wayfinder Map tab draws blocking links and states, and Enter opens the selected ticket", async () => {
  const tickets = [ticket("scope", "resolved"), ticket("storage"), ticket("reader", "blocked", ["storage"]), ticket("auth", "claimed"), ticket("billing", "out-of-scope")];
  const opened = publish(tickets);
  const context = await browser.newContext();
  try {
    await context.route("https://tracker.example.test/**", (route) => route.fulfill({ body: "Ticket opened", contentType: "text/plain" }));
    const page = await context.newPage();
    await page.goto(opened.live.url);
    await page.locator(".bar .tabs").waitFor();
    await page.keyboard.press("m");
    const tab = page.getByRole("tab", { name: "Wayfinder map", exact: true });
    await tab.waitFor();
    await page.keyboard.press("l");
    expect(await tab.getAttribute("aria-selected")).toBe("true");
    const pane = page.getByRole("tabpanel", { name: "Wayfinder map" });
    expect(await pane.locator("[data-map-item]").allTextContents()).toEqual(tickets.map((t) => t.title));
    expect(await pane.locator("[data-map-state]").allTextContents()).toEqual(["Resolved", "On the frontier", "Blocked", "Claimed", "Out of scope"]);
    await pane.locator('path[data-blocker="storage"][data-ticket="reader"]').waitFor();
    expect(await pane.getByText("Blocked by Decide storage", { exact: true }).isVisible()).toBe(true);
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe("Decide scope");
    await page.keyboard.press("j");
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe("Decide storage");
    await page.keyboard.press("k");
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe("Decide scope");
    await page.keyboard.press("j");
    const popup = context.waitForEvent("page");
    await page.keyboard.press("Enter");
    const tracker = await popup;
    await tracker.waitForLoadState();
    expect(tracker.url()).toBe(tickets[1]!.url);
    await tracker.close();
    await page.keyboard.press("h");
    expect(await page.getByRole("tab", { name: "Stages", exact: true }).getAttribute("aria-selected")).toBe("true");
    await page.keyboard.press("Escape");
    const ordinary = cli(["open", "--skill", "research", "--title", "No map"]);
    await page.goto(ordinary.live.url);
    await page.locator(".bar .tabs").waitFor();
    await page.keyboard.press("m");
    expect(await page.getByRole("tab", { name: "Wayfinder map", exact: true }).count()).toBe(0);
  } finally { await context.close(); }
}, 120_000);

test("local ticket paths are selectable text and Enter does not navigate", async () => {
  const url = ".scratch/storage/issues/01-storage.md";
  const opened = publish([ticket("scope"), { ...ticket("storage"), url }, ticket("reader")]);
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(opened.live.url);
    await page.locator(".bar .tabs").waitFor();
    await page.keyboard.press("m");
    await page.getByRole("tab", { name: "Wayfinder map", exact: true }).click();
    const local = page.locator('[data-ticket-node="storage"] [data-map-item]');
    expect(await local.getAttribute("href")).toBeNull();
    expect(await local.locator("a").count()).toBe(0);
    expect(await local.getByText(url, { exact: true }).isVisible()).toBe(true);
    await page.keyboard.press("j");
    expect(await local.evaluate((el) => document.activeElement === el)).toBe(true);
    const before = page.url();
    await page.keyboard.press("Enter");
    expect(page.url()).toBe(before);
    expect(context.pages().length).toBe(1);
    expect(await local.evaluate((el) => document.activeElement === el)).toBe(true);
    await page.keyboard.press("j");
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe("Decide reader");
    await page.keyboard.press("k");
    expect(await local.evaluate((el) => document.activeElement === el)).toBe(true);
  } finally { await context.close(); }
}, 120_000);

test("live snapshots recover lost Map focus without stealing retained or closed-panel focus", async () => {
  const opened = publish([ticket("scope"), ticket("storage"), ticket("reader")]);
  const submit = (tickets: object[]) => cli(["submit", "--flow", opened.flow, "--stage", opened.stage], [{ kind: "wayfinder", tickets }]);
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(opened.live.url);
    await page.locator(".bar .tabs").waitFor();
    await page.keyboard.press("m");
    const map = page.getByRole("dialog", { name: "Map", exact: true });
    const wayfinder = page.getByRole("tab", { name: "Wayfinder map", exact: true });
    await wayfinder.click();
    await page.keyboard.press("j");
    const storage = page.locator('[data-ticket-node="storage"] [data-map-item]');
    expect(await storage.evaluate((el) => document.activeElement === el)).toBe(true);

    submit([ticket("scope", "resolved"), ticket("storage"), ticket("reader")]);
    await page.locator('[data-ticket-node="scope"][data-state="resolved"]').waitFor();
    expect(await storage.evaluate((el) => document.activeElement === el)).toBe(true);

    submit([ticket("scope"), ticket("reader")]);
    await storage.waitFor({ state: "detached" });
    expect(await map.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe("Decide scope");
    await page.keyboard.press("j");
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe("Decide reader");
    await page.keyboard.press("k");
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe("Decide scope");
    await page.keyboard.press("h");
    expect(await page.getByRole("tab", { name: "Stages", exact: true }).getAttribute("aria-selected")).toBe("true");
    await page.keyboard.press("l");
    expect(await wayfinder.getAttribute("aria-selected")).toBe("true");

    submit([]);
    await page.getByText("No tickets charted yet.", { exact: true }).waitFor();
    expect(await wayfinder.evaluate((el) => document.activeElement === el)).toBe(true);
    await page.keyboard.press("h");
    expect(await page.getByRole("tab", { name: "Stages", exact: true }).getAttribute("aria-selected")).toBe("true");
    await page.keyboard.press("Escape");
    await map.waitFor({ state: "hidden" });
    await page.locator('.bar .tabs a[href="#overview"]').focus();
    const focus = await page.evaluateHandle(() => document.activeElement);
    submit([ticket("after-close")]);
    await page.locator('[data-ticket-node="after-close"]').waitFor({ state: "attached" });
    expect(await page.evaluate((el) => document.activeElement === el, focus)).toBe(true);
    await focus.dispose();
  } finally { await context.close(); }
}, 120_000);

test("empty and single-ticket maps stay readable at 320px and with enlarged text", async () => {
  const long = "Compare privacy boundaries for enterprise workspace synchronisation and retained investigation evidence ".repeat(8);
  for (const tickets of [[], [ticket("privacy", "frontier", [], long)]]) {
    const opened = publish(tickets);
    const context = await browser.newContext({ viewport: { width: 320, height: 800 }, colorScheme: "dark", reducedMotion: "reduce" });
    try {
      const page = await context.newPage();
      await page.goto(opened.live.url);
      await page.locator(".bar .tabs").waitFor();
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      await page.keyboard.press("m");
      await page.getByRole("tab", { name: "Wayfinder map", exact: true }).click();
      const pane = page.getByRole("tabpanel", { name: "Wayfinder map" });
      if (!tickets.length) expect(await pane.getByText("No tickets charted yet.").isVisible()).toBe(true);
      else {
        const node = pane.locator("[data-map-item]");
        expect(await node.textContent()).toBe(long);
        const size = await node.evaluate((el) => ({ width: el.clientWidth, content: el.scrollWidth, height: el.clientHeight, contentHeight: el.scrollHeight }));
        expect(size.content).toBeLessThanOrEqual(size.width + 1);
        expect(size.contentHeight).toBeLessThanOrEqual(size.height + 1);
        await node.focus();
        await page.keyboard.press("k");
        expect(await node.evaluate((el) => document.activeElement === el)).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.keyboard.press("Escape");
    } finally { await context.close(); }
  }
}, 120_000);

test("a large ticket graph pans on both axes without moving the page's selection", async () => {
  const tickets = Array.from({ length: 1000 }, (_, i) => ticket(`decision-${i}`, i < 4 ? "blocked" : "frontier", i < 4 ? [`decision-${i + 1}`] : []));
  const opened = publish(tickets);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const page = await context.newPage();
    await page.goto(opened.live.url);
    await page.locator(".bar .tabs").waitFor();
    await page.keyboard.press("m");
    await page.getByRole("tab", { name: "Wayfinder map", exact: true }).click();
    const pane = page.getByRole("tabpanel", { name: "Wayfinder map" });
    expect(await pane.locator("[data-map-item]").count()).toBe(1000);
    await pane.evaluate((el) => { el.scrollTop = 0; el.scrollLeft = 0; });
    const before = await page.evaluate(() => ({ hash: location.hash, selected: document.activeElement?.textContent }));
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    const scroll = await pane.evaluate((el) => ({ x: el.scrollLeft, y: el.scrollTop }));
    expect(scroll.x).toBeGreaterThan(0);
    expect(scroll.y).toBeGreaterThan(0);
    expect(await page.evaluate(() => ({ hash: location.hash, selected: document.activeElement?.textContent }))).toEqual(before);
  } finally { await context.close(); }
}, 120_000);

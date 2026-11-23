import { expect, test } from "bun:test";
import { decisionBrief } from "./support/decision-brief.ts";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import { ENV } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts");
type Receipt = { flow: string; stage: string; revision: number; refs: Record<string, string>; live: { url: string } };
const doc = (ref: string, title = ref) => ({ kind: "result", ref, shape: "document", title, sections: [{ heading: "Evidence", blocks: [{ prose: `Recorded evidence for ${title}.` }] }] });
const question = (ref: string) => ({ ref, title: "Choose the recovery route", brief: decisionBrief("the recovery route"), description: "Which route should we use?", needs: [{ need: "Understand the route", kind: "prose" }], options: [
  { label: "Keep", does: "Keeps the route", gains: ["Stable"], costs: ["No change"] },
  { label: "Change", does: "Changes the route", gains: ["New route"], costs: ["Work"] },
] });

async function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-reader-changes-")));
  const home = join(root, "home");
  mkdirSync(home);
  const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = socket.port;
  socket.stop(true);
  function cli(args: string[], items?: unknown[]): Receipt {
    const result = Bun.spawnSync([process.execPath, SCRIPT, ...args, "--home", home, "--session", "01a1cad3-9dfc-7048-b4e0-099d559a9c69", "--agent", "Impl475"], {
      cwd: root, env: { ...ENV, HOME: join(root, "default-home"), VSTACK_FLOW_PORT: String(port) },
      stdin: items ? new TextEncoder().encode(JSON.stringify({ version: 1, items })) : "ignore", stdout: "pipe", stderr: "pipe",
    });
    if (result.exitCode !== 0) throw new Error(`flow-page ${args.join(" ")}: ${result.stdout} ${result.stderr}`);
    return JSON.parse(result.stdout.toString()) as Receipt;
  }
  const browser = await chromium.launch({ headless: true });
  return { root, home, cli, browser, async close() { await browser.close(); cli(["host", "stop"]); rmSync(root, { recursive: true, force: true }); } };
}

const index = (page: Page) => page.getByRole("navigation", { name: "Changed since your last visit", exact: true });
const openIndex = (page: Page) => page.locator("#overview > details > summary").filter({ hasText: /^Changed since your last visit$/ }).click();
const links = (page: Page) => index(page).getByRole("link").evaluateAll(elements => elements.map(el => el.getAttribute("href")));
const order = (page: Page) => page.locator("[data-reading]").evaluateAll(elements => elements.map(el => ({ id: el.getAttribute("data-reading"), position: el.getAttribute("data-position"), historical: el.hasAttribute("data-historical") })));
async function capture(page: Page, name: string) {
  const proof = process.env.FLOW_READER_EVIDENCE;
  if (!proof) return;
  mkdirSync(proof, { recursive: true });
  await page.screenshot({ path: join(proof, `${name}.png`), fullPage: true });
  writeFileSync(join(proof, `${name}.aria.txt`), await page.locator("body").ariaSnapshot());
}

test("returning readers find new and revised blocks in place without authoring or inventing historical publication order", async () => {
  const f = await fixture();
  const context = await f.browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const historical = join(f.home, ".vstack", "tmp", "_global", "visit-history");
    mkdirSync(historical, { recursive: true });
    writeFileSync(join(historical, "page.jsonl"), [
      { type: "page", id: "page", title: "Returning reader" },
      { type: "stage", id: "first", skill: "grill-me", state: "in-progress", order: 1 },
      { type: "round", id: "r1", stage: "first", time: "2026-10-28T20:09:59+07:00", session: 1, round: 1 },
      { type: "question", id: "old-question", round: "r1", q: 1, title: "Historical route?", description: "Pick one. The earlier notes cover the alternative.", options: [{ label: "A. Keep", does: "Keeps it", gains: ["Stable"], costs: ["None"] }] },
    ].map(row => JSON.stringify(row)).join("\n") + "\n");
    const opened = f.cli(["migrate", historical]);
    const stage = f.cli(["open", "--flow", opened.flow, "--skill", "research"]);
    const submit = (items: unknown[], target = stage.stage) => f.cli(["submit", "--flow", opened.flow, "--stage", target], items);
    const seed = submit([doc("report", "Recovery evidence"), { kind: "round", now: "The recovery report is ready to review.", questions: [question("route")] }, doc("unchanged", "Untouched evidence")]);
    let page = await context.newPage();
    await page.goto(`${opened.live.url}#overview`);
    const decisions = page.getByRole("region", { name: "Open decisions", exact: true });
    const historicalRow = decisions.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Historical route?", exact: true }) });
    await historicalRow.getByText("Pick one.", { exact: true }).waitFor();
    expect(await historicalRow.getByText("The earlier notes cover the alternative.", { exact: false }).count()).toBe(0);
    expect(await historicalRow.locator("time").getAttribute("datetime")).toBe("2026-10-28T20:09:59+07:00");
    expect(await historicalRow.getByRole("link").getAttribute("href")).toBe("#old-question");
    await openIndex(page);
    await index(page).getByText("First visit", { exact: false }).waitFor();
    expect(await links(page)).toEqual([]);
    const firstOrder = await order(page);
    const beforeViewing = f.cli(["show", "--flow", opened.flow]);
    await capture(page, "first-visit");
    await page.close();
    page = await context.newPage();
    await page.goto(`${opened.live.url}#overview`);
    await openIndex(page);
    await index(page).getByText("No new or revised blocks", { exact: false }).waitFor();
    expect(await links(page)).toEqual([]);
    expect(f.cli(["show", "--flow", opened.flow])).toEqual(beforeViewing);
    await page.close();

    const longTitle = "Recovery evidence for operations/worker/recovery/confirm-all-queued-customer-requests-completed-without-retries and customer-feedback-from-enterprise-onboarding";
    const changed = submit([
      { ...doc("updated", "Recovery evidence, revised"), revises: seed.refs.report },
      doc("new", longTitle),
      { kind: "answer", question: seed.refs.route, response: { status: "answered", picks: ["B"] } },
    ]);
    submit([{ kind: "answer", question: "old-question", response: { status: "answered", picks: ["A"] } }], "first");
    const authored = f.cli(["show", "--flow", opened.flow]);
    page = await context.newPage();
    await page.goto(`${opened.live.url}#overview`);
    await openIndex(page);
    await index(page).getByRole("link", { name: /Recovery evidence, revised/ }).waitFor();
    expect(await links(page)).toEqual(["#old-question", `#${seed.refs.report}-changes-${seed.revision}`, `#${seed.refs.route}`, `#${changed.refs.new}`]);
    expect(await index(page).getByRole("listitem").first().innerText()).toContain("Historical");
    expect(await index(page).getByRole("listitem").first().innerText()).not.toContain("New");
    expect(await index(page).getByRole("listitem").last().innerText()).toContain("New");
    const afterOrder = await order(page);
    expect(afterOrder.slice(0, firstOrder.length)).toEqual(firstOrder);
    expect(afterOrder[0]).toMatchObject({ id: "old-question", historical: true, position: null });
    for (const href of await links(page)) {
      await page.getByRole("navigation", { name: "Flow navigation" }).getByRole("link", { name: "Returning reader", exact: true }).click();
      const link = index(page).locator(`a[href="${href}"]`);
      await link.focus();
      await page.keyboard.press("Enter");
      const target = page.locator(href!);
      expect(await target.isVisible()).toBe(true);
      expect(await target.count()).toBe(1);
      expect(await page.evaluate(() => location.hash)).toBe(href!);
    }
    await page.locator(`#${seed.refs.report}`).getByText("Earlier revisions (1)", { exact: true }).click();
    expect(await page.locator(`#${seed.refs.report}-r1`).getByRole("heading", { name: "Recovery evidence", exact: true }).isVisible()).toBe(true);
    await page.getByRole("navigation", { name: "Flow navigation" }).getByRole("link", { name: "Returning reader", exact: true }).click();
    for (const theme of ["Light", "Dark"]) {
      await page.getByRole("button", { name: theme, exact: true }).click();
      for (const width of [320, 1280, 2560]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        await capture(page, `return-${theme.toLowerCase()}-${width}`);
      }
    }
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await capture(page, "return-text-growth-proxy");
    expect(f.cli(["show", "--flow", opened.flow])).toEqual(authored);
    const fresh = await f.browser.newContext();
    const independent = await fresh.newPage();
    await independent.goto(`${opened.live.url}#overview`);
    await openIndex(independent);
    await index(independent).getByText("First visit", { exact: false }).waitFor();
    expect(await links(independent)).toEqual([]);
    await fresh.close();
    await page.reload();
    await openIndex(page);
    await index(page).getByText("No new or revised blocks", { exact: false }).waitFor();
    expect(await links(page)).toEqual([]);
    expect(f.cli(["show", "--flow", opened.flow])).toEqual(authored);
  } finally { await context.close(); await f.close(); }
}, 120_000);

test("the live visit index handles one and a thousand new blocks without duplicating their targets", async () => {
  const f = await fixture();
  const context = await f.browser.newContext({ viewport: { width: 320, height: 900 } });
  try {
    const opened = f.cli(["open", "--skill", "research", "--title", "Large returning visit"]);
    const page = await context.newPage();
    await page.goto(`${opened.live.url}#overview`);
    await openIndex(page);
    await index(page).getByText("First visit", { exact: false }).waitFor();
    await page.reload();
    await openIndex(page);
    await index(page).getByText("No new or revised blocks", { exact: false }).waitFor();
    const first = f.cli(["submit"], [doc("single", "One new finding")]);
    await index(page).getByRole("link", { name: /One new finding/ }).waitFor();
    expect(await links(page)).toEqual([`#${first.refs.single}`]);
    const rest = f.cli(["submit"], Array.from({ length: 999 }, (_, i) => doc(`finding-${i}`, `Finding ${i + 2}`)));
    await index(page).getByRole("link", { name: /Finding 1000 / }).waitFor();
    expect(await links(page)).toHaveLength(1000);
    expect(await links(page)).toEqual([`#${first.refs.single}`, ...Object.values(rest.refs).map(id => `#${id}`)]);
    await index(page).getByRole("link").last().click();
    expect(await page.locator(`#${rest.refs["finding-998"]}`).isVisible()).toBe(true);
    expect(await page.locator(`[data-reading="${rest.refs["finding-998"]}"]`).count()).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  } finally { await context.close(); await f.close(); }
}, 120_000);

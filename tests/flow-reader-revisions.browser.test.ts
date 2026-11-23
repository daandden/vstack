import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { ENV } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts");
type Receipt = { flow: string; stage: string; revision: number; refs: Record<string, string>; live: { url: string } };
const doc = (text: string, inserted = false) => ({ kind: "result", ref: "doc", shape: "document", title: "Recovery report", sections: [
  { heading: "Unchanged policy", blocks: [{ prose: "Keep all earlier evidence." }] },
  { heading: "Observed outcome", blocks: [{ prose: text }, ...(inserted ? [{ prose: "Verified queued requests independently." }] : []), { prose: "Same supporting paragraph." }] },
], citations: [{ ref: "run", source: "Local recovery run" }], limitations: ["Local evidence only."] });
const table = (value: string, added = false) => ({ kind: "result", ref: "table", shape: "table", title: "Recovery timings", columns: [{ label: "Route", type: "text" }, { label: "Latency", type: "number" }], rows: [
  ...(added ? [{ ref: "new", cells: ["New route", "0"] }] : []),
  { ref: "same", cells: ["Unchanged route", "100"] }, { ref: "changed", cells: ["Candidate", value] }, { ref: "throughput", cells: ["Throughput", added ? "1180" : "1210"] },
  ...(!added ? [{ ref: "removed", cells: ["Removed route", "42"] }] : []),
  ...Array.from({ length: 1000 }, (_, i) => ({ cells: [`operations/recovery/customer-feedback-from-enterprise-onboarding-${i}`, String(i)] })),
] });
const metrics = (value: number) => ({ kind: "result", ref: "metrics", shape: "metrics", title: "Recovery measurements", workload: "10 local reconnects", outcome: "Recorded fixture", series: [{ ref: "base", label: "Baseline", baseline: true }, { ref: "candidate", label: "Candidate" }], measurements: [{ ref: "latency", name: "Latency", unit: "ms", values: [{ series: "base", value: 100 }, { series: "candidate", value }] }] });

test("readers compare known Document and typed edits without losing snapshots or current links", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-reader-revisions-")));
  const home = join(root, "home"); mkdirSync(home);
  const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = socket.port; socket.stop(true);
  function cli(args: string[], items?: unknown[]): Receipt {
    const result = Bun.spawnSync([process.execPath, SCRIPT, ...args, "--home", home, "--session", "01a1cafe-75ab-7240-8f02-fa78a82d6123", "--agent", "Impl476"], {
      cwd: root, env: { ...ENV, HOME: join(root, "default-home"), VSTACK_FLOW_PORT: String(port) }, stdin: items ? new TextEncoder().encode(JSON.stringify({ version: 1, items })) : "ignore", stdout: "pipe", stderr: "pipe",
    });
    if (result.exitCode !== 0) throw new Error(`${args.join(" ")}: ${result.stdout} ${result.stderr}`);
    return JSON.parse(result.stdout.toString()) as Receipt;
  }
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const opened = cli(["open", "--skill", "research", "--title", "Revision comparison proof"]);
    const submit = (items: unknown[]) => cli(["submit"], items);
    const first = submit([doc("Recovered 9 requests [@run]."), table("9"), metrics(9)]);
    let page = await context.newPage();
    await page.goto(`${opened.live.url}#overview`);
    await page.getByText("First visit in this browser", { exact: false }).waitFor();
    await page.close();
    submit([{ ...doc("Recovered 10 requests [@run].", true), revises: first.refs.doc }, { ...table("10", true), revises: first.refs.table }, { ...metrics(10), revises: first.refs.metrics }]);
    const authored = cli(["show"]);
    page = await context.newPage();
    await page.goto(`${opened.live.url}#overview`);
    const index = page.getByRole("navigation", { name: "Changed since last visit", exact: true });
    const changed = index.getByRole("link", { name: /Recovery report/ });
    await changed.waitFor();
    await changed.focus(); await page.keyboard.press("Enter");
    expect(await page.evaluate(() => location.hash)).toBe(`#${first.refs.doc}-changes-${first.revision}`);
    const comparison = page.getByRole("region", { name: "Changes to Recovery report", exact: true });
    expect(await comparison.isVisible()).toBe(true);
    expect(await comparison.innerText()).toContain("Revision 1 → Revision 2");
    expect(await comparison.locator("del").allTextContents()).toContain("9");
    expect(await comparison.locator("ins").allTextContents()).toContain("10");
    expect(await comparison.locator("ins").allTextContents()).toContain("Verified queued requests independently.");
    expect(await comparison.innerText()).not.toContain("Keep all earlier evidence.");
    expect(await comparison.innerText()).not.toContain("Same supporting paragraph.");
    const proof = process.env.FLOW_READER_EVIDENCE;
    if (proof) { mkdirSync(proof, { recursive: true }); await comparison.screenshot({ path: join(proof, "document.png") }); writeFileSync(join(proof, "document.aria.txt"), await comparison.ariaSnapshot()); }
    await comparison.getByRole("link", { name: "Complete earlier snapshot", exact: true }).click();
    expect(await page.locator(`#${first.refs.doc}-r1`).getByText("Recovered 9 requests", { exact: false }).isVisible()).toBe(true);
    await page.goto(`${opened.live.url}#${first.refs.doc}`);
    expect(await page.locator(`#${first.refs.doc} > div`).getByText("Recovered 10 requests", { exact: false }).isVisible()).toBe(true);
    expect(await page.locator(`#${first.refs.doc}-c1`).getByText("Local recovery run", { exact: true }).isVisible()).toBe(true);
    for (const ref of ["table", "metrics"]) {
      await page.goto(`${opened.live.url}#${first.refs[ref]}-changes-${first.revision}`);
      const view = page.getByRole("region", { name: ref === "table" ? "Changes to Recovery timings" : "Changes to Recovery measurements", exact: true });
      await view.getByText("Only changed fields are shown.", { exact: false }).waitFor();
      expect(await view.isVisible()).toBe(true);
      expect(await view.locator("del").allTextContents()).toContain("9");
      expect(await view.locator("ins").allTextContents()).toContain("10");
      expect(await view.locator("ins").allTextContents()).not.toContain("100");
      if (ref === "table") {
        expect(await view.innerText()).toContain("Latency");
        expect(await view.innerText()).toContain("Removed route");
        expect(await view.innerText()).toContain("New route");
        expect(await view.innerText()).not.toContain("Unchanged route");
        expect(await view.locator("del").allTextContents()).toContain("1210");
        expect(await view.locator("ins").allTextContents()).toContain("1180");
      }
      if (proof) { await view.screenshot({ path: join(proof, `${ref}.png`) }); writeFileSync(join(proof, `${ref}.aria.txt`), await view.ariaSnapshot()); }
    }
    const second = submit([{ kind: "revise", result: first.refs.table, base: authored.revision, set: { title: "Recovery timings, checked" } }]);
    await page.goto(`${opened.live.url}#${first.refs.table}`);
    await page.getByRole("heading", { name: "Recovery timings, checked", exact: true }).waitFor();
    const changes = page.getByRole("region", { name: "Changes to Recovery timings, checked", exact: true });
    const selector = changes.getByRole("combobox", { name: "Earlier snapshot", exact: true });
    if (!await selector.isVisible()) await changes.getByText("Compare revisions", { exact: true }).click();
    const pick = async (snapshot: string | RegExp) => {
      await selector.click();
      await page.getByRole("option", { name: snapshot, exact: typeof snapshot === "string" }).click();
      await changes.locator("p.font-semibold").filter({ hasText: typeof snapshot === "string" ? new RegExp(`^${snapshot} →`) : snapshot }).waitFor();
    };
    await pick("Revision 2");
    expect(await changes.innerText()).toContain("Revision 2 → Revision 2 · Edit");
    expect(await changes.locator("ins").allTextContents()).not.toContain("10");
    await pick("Revision 1");
    expect(await changes.locator("ins").allTextContents()).toContain("10");
    const trigger = await selector.elementHandle();
    const snapshotStyle = () => trigger.evaluate(el => {
      const style = getComputedStyle(el);
      const { width, height } = el.getBoundingClientRect();
      return { width, height, border: style.borderColor, shadow: style.boxShadow, outline: style.outlineStyle, padding: style.padding, fontSize: style.fontSize };
    });
    await changes.getByText(/^Only changed fields are shown\./).click();
    const idleSnapshot = await snapshotStyle();
    await selector.focus();
    const focusedSnapshot = await snapshotStyle();
    await page.keyboard.press("Space");
    const options = page.getByRole("listbox");
    await options.getByRole("option", { name: "Revision 1", exact: true }).and(page.locator(":focus")).waitFor();
    const openSnapshot = await snapshotStyle();
    if (proof) writeFileSync(join(proof, "snapshot-open.styles.json"), JSON.stringify({ idleSnapshot, focusedSnapshot, openSnapshot }, null, 2));
    await page.keyboard.press("ArrowDown");
    await options.getByRole("option", { name: "Revision 2", exact: true }).and(page.locator(":focus")).waitFor();
    await page.keyboard.press("Space");
    await changes.getByText(/^Revision 2 → Revision 2 · Edit/).waitFor();
    expect(await selector.evaluate(el => el === document.activeElement)).toBe(true);
    await page.keyboard.press("Enter");
    await options.waitFor();
    await page.keyboard.press("Escape");
    await options.waitFor({ state: "hidden" });
    expect(await selector.evaluate(el => el === document.activeElement)).toBe(true);
    await pick("Revision 1");
    for (const theme of ["Light", "Dark"]) {
      await page.getByRole("button", { name: theme, exact: true }).click();
      for (const width of [320, 1280, 2560]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        if (proof) { mkdirSync(proof, { recursive: true }); await changes.screenshot({ path: join(proof, `${theme}-${width}.png`) }); writeFileSync(join(proof, `${theme}-${width}.aria.txt`), await changes.ariaSnapshot()); }
      }
    }
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(cli(["show"]).revision).toBe(second.revision);
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    const identical = submit([{ ...table("10", true), title: "Recovery timings, checked", revises: first.refs.table }]);
    await pick(/^Revision 2 · Edit/);
    await changes.getByText("No content changes between these snapshots.", { exact: true }).waitFor();
    expect(cli(["show"]).revision).toBe(identical.revision);
    expect(openSnapshot.border).not.toBe(idleSnapshot.border);
    expect(focusedSnapshot.border).toBe(openSnapshot.border);
    expect(focusedSnapshot.shadow).toBe("none");
    expect(focusedSnapshot.outline).toBe("none");
    expect(openSnapshot.shadow).toBe("none");
    expect(openSnapshot.outline).toBe("none");
    const touch = await browser.newContext({ hasTouch: true });
    try {
      const touchPage = await touch.newPage();
      await touchPage.goto(`${opened.live.url}#${first.refs.table}-changes-${first.revision}`);
      const snapshot = touchPage.getByRole("combobox", { name: "Earlier snapshot", exact: true });
      await snapshot.waitFor();
      expect(await touchPage.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      expect(await snapshot.evaluate(el => {
        const css = getComputedStyle(el);
        return [css.minBlockSize, css.paddingInlineStart];
      })).toEqual(["28px", "8px"]);
    } finally { await touch.close(); }
  } finally { await context.close(); await browser.close(); cli(["host", "stop"]); rmSync(root, { recursive: true, force: true }); }
}, 120_000);

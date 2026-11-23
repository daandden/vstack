import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Locator } from "playwright-core";
import { ENV } from "./support/fixture.ts";

const fieldStyle = (control: Locator) => control.evaluate(el => {
  const style = getComputedStyle(el);
  const { width, height } = el.getBoundingClientRect();
  return {
    width, height, color: style.color, background: style.backgroundColor,
    border: style.borderColor, shadow: style.boxShadow, outline: style.outlineStyle,
    outlineColor: style.outlineColor,
    padding: style.padding, fontSize: style.fontSize,
    radius: style.borderRadius, weight: style.fontWeight,
  };
});

const SCRIPT = join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts");
test("table readers sort, filter, and follow stable row links without persisting their choices", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-reader-tables-")));
  const home = join(root, "home");
  mkdirSync(home);
  const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = socket.port;
  socket.stop(true);
  function cli(args: string[], items?: object[]): any {
    const p = Bun.spawnSync([process.execPath, SCRIPT, ...args, "--home", home, "--session", "01a1c256-243a-73a5-9de5-66b7edb80d21", "--agent", "impl-437"], {
      cwd: root, env: { ...ENV, HOME: join(root, "default-home"), VSTACK_FLOW_PORT: String(port) },
      stdin: items ? new TextEncoder().encode(JSON.stringify({ version: 1, items })) : "ignore", stdout: "pipe", stderr: "pipe",
    });
    if (p.exitCode !== 0) throw new Error(`flow-page ${args.join(" ")}: ${p.stderr}`);
    return JSON.parse(p.stdout.toString());
  }
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light" });
  try {
    const opened = cli(["open", "--skill", "implement", "--title", "Typed table reader"]);
    const seeded = cli(["submit"], [
      { kind: "result", ref: "table", shape: "table", title: "Timing results", columns: [{ label: "Target", type: "text" }, { label: "Latency", type: "number" }, { label: "Status", type: "status" }], rows: [{ ref: "ten", cells: ["Zebra", "10", "Failed"] }, { ref: "nine", cells: ["Alpha", "9", "Passed"] }, { ref: "hundred", cells: ["Beta", "100", "Failed"] }, { ref: "negative", cells: ["Gamma", "-2.5", "Not failed"] }] },
      { kind: "result", ref: "legacy", shape: "table", title: "Untyped results", columns: ["Number as text"], rows: [{ cells: ["9"] }, { cells: ["10"] }] },
      { kind: "result", ref: "statuses", shape: "table", title: "Exact status values", columns: [{ label: "State", type: "status" }], rows: [{ cells: ["Failed"] }, { cells: ["failed"] }, { ref: "empty", cells: [""] }] },
      { kind: "result", ref: "wide", shape: "table", title: "Worker checkpoints", columns: [
        "Artifact", "Environment", "Test run", { label: "Duration", type: "number" }, { label: "Status", type: "status" }, "Notes",
      ], rows: [
        { cells: ["worker-startup-trace.json", "macOS development", "Cold host restart", "12", "Passed",
          "After the worker restarted, the reader recovered its open position and confirmed that previously saved entries were unchanged. The restart completed before the next scheduled request, and the reader continued to show the same revision without losing the selected Result."] },
        { cells: ["worker-reconnect.log", "macOS development", "Connection interrupted", "102.5", "Pending",
          "The browser reconnects once the worker is available again. Previously loaded content remains readable while the worker restarts."] },
      ] },
    ]);
    const rowAnchor = seeded.refs["table/nine"].replace("/", "-");
    const emptyAnchor = seeded.refs["statuses/empty"].replace("/", "-");
    cli(["submit"], [{ kind: "result", shape: "document", title: "Row references", sections: [{ heading: "Follow a row", blocks: [{ prose: `[Find Alpha](#${rowAnchor}). [Find empty status](#${emptyAnchor}).` }] }] }]);
    const before = cli(["show"]);
    const page = await context.newPage();
    const errors: string[] = [];
    const writes: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("request", r => { if (r.method() !== "GET") writes.push(`${r.method()} ${r.url()}`); });
    await page.goto(`${opened.live.url}#${seeded.refs.table}`);
    const table = page.locator(`#${seeded.refs.table}`);
    const cells = () => table.locator("tbody tr td:first-child").allTextContents();
    const latency = table.getByRole("button", { name: "Sort by Latency", exact: true });
    await latency.waitFor();
    expect(await cells()).toEqual(["Zebra", "Alpha", "Beta", "Gamma"]);
    await latency.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(id => document.querySelector(`#${id} th[aria-sort="ascending"]`) !== null, seeded.refs.table);
    expect(await cells()).toEqual(["Gamma", "Alpha", "Zebra", "Beta"]);
    await page.keyboard.press("Space");
    await page.waitForFunction(id => document.querySelector(`#${id} th[aria-sort="descending"]`) !== null, seeded.refs.table);
    expect(await cells()).toEqual(["Beta", "Zebra", "Alpha", "Gamma"]);
    await table.getByRole("button", { name: "Sort by Target", exact: true }).click();
    expect(await cells()).toEqual(["Alpha", "Beta", "Gamma", "Zebra"]);
    const search = table.getByRole("textbox", { name: "Filter rows", exact: true });
    const filters = table.getByRole("button", { name: "Filters", exact: true });
    expect(await table.getByRole("status").textContent()).toBe("4 of 4 rows");
    expect(await search.isVisible()).toBe(false);
    expect(await table.getByRole("combobox", { name: "Filter Status", exact: true }).isVisible()).toBe(false);
    await filters.press("Enter");
    expect(await search.isVisible()).toBe(true);
    await search.fill("a");
    const status = table.getByRole("combobox", { name: "Filter Status", exact: true });
    expect(await status.textContent()).toBe("All values");
    const idleStatus = await fieldStyle(status);
    await status.focus();
    await page.keyboard.press("Enter");
    const openedStatus = await fieldStyle(table.getByRole("combobox", { name: "Filter Status", exact: true, includeHidden: true }));
    if (process.env.FLOW_TABLE_EVIDENCE) {
      mkdirSync(process.env.FLOW_TABLE_EVIDENCE, { recursive: true });
      writeFileSync(join(process.env.FLOW_TABLE_EVIDENCE, "status-open.styles.json"), JSON.stringify({ idleStatus, openedStatus }, null, 2));
    }
    await page.getByRole("option", { name: "Failed", exact: true }).press("Enter");
    await page.waitForFunction(id => document.getElementById(id)?.textContent?.includes("2 of 4 rows"), seeded.refs.table);
    expect(await cells()).toEqual(["Beta", "Zebra"]);
    await search.fill("zeb");
    await page.waitForFunction(id => document.getElementById(id)?.textContent?.includes("1 of 4 rows"), seeded.refs.table);
    expect(await cells()).toEqual(["Zebra"]);
    await search.fill("no matching target");
    await page.waitForFunction(id => document.getElementById(id)?.textContent?.includes("0 of 4 rows"), seeded.refs.table);
    expect(await table.getByText("No matching rows.", { exact: true }).isVisible()).toBe(true);
    await page.getByRole("link", { name: "Find Alpha", exact: true }).click();
    await page.locator(`#${rowAnchor}`).waitFor({ state: "visible" });
    expect(await status.textContent()).toBe("All values");
    expect(await search.inputValue()).toBe("");
    expect(await cells()).toEqual(["Alpha", "Beta", "Gamma", "Zebra"]);
    expect(await page.evaluate(id => document.activeElement?.id === id, rowAnchor)).toBe(true);
    expect(await page.locator(`#${rowAnchor}`).evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; })).toBe(true);
    const legacy = page.locator(`#${seeded.refs.legacy}`);
    await legacy.getByRole("button", { name: "Sort by Number as text", exact: true }).click();
    const exact = page.locator(`#${seeded.refs.statuses}`);
    await exact.getByRole("button", { name: "Filters", exact: true }).click();
    await exact.getByRole("combobox", { name: "Filter State", exact: true }).click();
    await page.getByRole("option", { name: "Failed", exact: true }).click();
    await page.waitForFunction(id => document.getElementById(id)?.textContent?.includes("1 of 3 rows"), seeded.refs.statuses);
    expect(await exact.locator("tbody tr td").allTextContents()).toEqual(["Failed"]);
    await exact.getByRole("combobox", { name: "Filter State", exact: true }).click();
    await page.getByRole("option", { name: "(empty)", exact: true }).click();
    await page.waitForFunction(id => document.getElementById(id)?.textContent?.includes("1 of 3 rows"), seeded.refs.statuses);
    expect(await exact.locator("tbody tr td").allTextContents()).toEqual([""]);
    await exact.getByRole("combobox", { name: "Filter State", exact: true }).click();
    await page.getByRole("option", { name: "Failed", exact: true }).click();
    await exact.getByRole("button", { name: "Filters", exact: true }).click();
    expect(await exact.getByRole("combobox", { name: "Filter State", exact: true }).isVisible()).toBe(false);
    await page.getByRole("link", { name: "Find empty status", exact: true }).click();
    await page.locator(`#${emptyAnchor}`).waitFor({ state: "visible" });
    expect(await exact.getByRole("status").textContent()).toBe("3 of 3 rows");
    await exact.getByRole("button", { name: "Filters", exact: true }).click();
    expect(await exact.getByRole("combobox", { name: "Filter State", exact: true }).textContent()).toBe("All values");
    expect(await legacy.locator("tbody tr td:first-child").allTextContents()).toEqual(["10", "9"]);
    const wide = page.getByRole("table", { name: "Worker checkpoints" });
    await wide.waitFor();
    const lines = (cell: Locator) => cell.evaluate(el => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      const words: { word: string; lines: number }[] = [];
      while (walker.nextNode()) {
        const text = walker.currentNode;
        for (const match of text.textContent!.matchAll(/\S+/g)) {
          range.setStart(text, match.index);
          range.setEnd(text, match.index + match[0].length);
          words.push({ word: match[0], lines: range.getClientRects().length });
        }
      }
      range.selectNodeContents(el);
      return { words, lines: new Set([...range.getClientRects()].map(rect => rect.top)).size };
    });
    for (const name of ["worker-startup-trace.json", "Passed", "Pending"]) {
      expect((await lines(wide.getByRole("cell", { name, exact: true }))).words).toEqual([{ word: name, lines: 1 }]);
    }
    const notes = await lines(wide.getByRole("cell", { name: /^After the worker restarted/ }));
    expect(notes.lines).toBeGreaterThan(1);
    expect(notes.words.filter(word => word.lines !== 1)).toEqual([]);
    const geometry = await wide.evaluate(el => {
      const header = el.querySelector("th:nth-child(4)")!;
      const numbers = [...el.querySelectorAll("tbody td:nth-child(4)")];
      return [header, ...numbers].map(cell => {
        const css = getComputedStyle(cell);
        return { paddingBlock: css.paddingBlock, paddingInline: css.paddingInline, align: css.textAlign, numbers: css.fontVariantNumeric };
      });
    });
    expect(geometry).toEqual(Array(3).fill({ paddingBlock: "4px", paddingInline: "8px", align: "end", numbers: "tabular-nums" }));
    expect((await fieldStyle(wide.getByRole("cell", { name: "12", exact: true }))).fontSize).toBe("13px");
    expect((await fieldStyle(wide.getByRole("columnheader").first())).fontSize).toBe("12px");
    for (const theme of ["Light", "Dark"]) {
      await page.getByRole("button", { name: theme, exact: true }).click();
      for (const width of [320, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        if (process.env.FLOW_TABLE_EVIDENCE) {
          mkdirSync(process.env.FLOW_TABLE_EVIDENCE, { recursive: true });
          const name = join(process.env.FLOW_TABLE_EVIDENCE, `${theme.toLowerCase()}-${width}`);
          await table.screenshot({ path: `${name}.png` });
          writeFileSync(`${name}.aria.txt`, await table.ariaSnapshot());
          if (width === 1280) {
            await wide.screenshot({ path: `${name}-wide.png` });
            writeFileSync(`${name}-wide.styles.json`, JSON.stringify({ geometry, notes }, null, 2));
          }
          writeFileSync(`${name}.styles.json`, JSON.stringify({
            cell: await fieldStyle(table.getByRole("cell", { name: "Zebra", exact: true })),
            header: await fieldStyle(table.getByRole("columnheader").first()),
            sort: await fieldStyle(latency),
            search: await fieldStyle(search),
            status: await fieldStyle(status),
            filters: await fieldStyle(filters),
            panel: await fieldStyle(page.locator(`#${await filters.getAttribute("aria-controls")}`)),
          }, null, 2));
        }
        if (width === 1280) {
          await status.press("Enter");
          const popup = page.getByRole("listbox");
          await popup.waitFor();
          const selected = popup.getByRole("option", { name: "All values", exact: true });
          const highlighted = popup.getByRole("option", { name: "Failed", exact: true });
          await selected.and(page.locator(":focus")).waitFor();
          await page.keyboard.press("ArrowDown");
          await highlighted.and(page.locator(":focus")).waitFor();
          const menu = await fieldStyle(popup);
          const selectedStyle = await fieldStyle(selected);
          const highlightStyle = await fieldStyle(highlighted);
          const check = await selected.locator('[aria-hidden="true"]').evaluate(el => {
            const { color, maskImage } = getComputedStyle(el);
            return { color, maskImage };
          });
          expect(menu).toMatchObject({
            background: theme === "Light" ? "oklch(0.958 0.006 264.5)" : "oklch(0.243 0.03 283.9)",
            border: theme === "Light" ? "oklch(0.808 0.017 271.2)" : "oklch(0.404 0.032 280.2)",
            radius: "4px", shadow: "none",
          });
          expect(selectedStyle).toMatchObject({ height: 28, weight: "600", radius: "3px" });
          expect(highlightStyle).toMatchObject({ height: 28, radius: "3px" });
          expect(highlightStyle.background).not.toBe(selectedStyle.background);
          expect(check.color).toBe(theme === "Light" ? "oklch(0.559 0.226 262.1)" : "oklch(0.766 0.111 259.9)");
          expect(check.maskImage).not.toBe("none");
          if (process.env.FLOW_TABLE_EVIDENCE) {
            const name = join(process.env.FLOW_TABLE_EVIDENCE, `${theme.toLowerCase()}-${width}`);
            await table.screenshot({ path: `${name}-filters-with-menu.png` });
            await popup.screenshot({ path: `${name}-popup.png` });
            writeFileSync(`${name}-popup.aria.txt`, await popup.ariaSnapshot());
            writeFileSync(`${name}-popup.styles.json`, JSON.stringify({ menu, selectedStyle, highlightStyle, check: check.color }, null, 2));
          }
          await page.keyboard.press("Escape");
          await popup.waitFor({ state: "hidden" });
          expect(await status.evaluate(el => el === document.activeElement)).toBe(true);
        }
      }
    }
    await page.reload();
    await latency.waitFor();
    expect(await cells()).toEqual(["Zebra", "Alpha", "Beta", "Gamma"]);
    expect(await search.isVisible()).toBe(false);
    await filters.click();
    expect(await search.inputValue()).toBe("");
    const fresh = await browser.newContext();
    try {
      const other = await fresh.newPage();
      await other.goto(`${opened.live.url}#${seeded.refs.table}`);
      await other.locator(`#${seeded.refs.table} tbody tr`).first().waitFor();
      expect(await other.locator(`#${seeded.refs.table} tbody tr td:first-child`).allTextContents()).toEqual(["Zebra", "Alpha", "Beta", "Gamma"]);
    } finally { await fresh.close(); }
    expect(cli(["show"])).toEqual(before);
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
    expect(openedStatus.border).not.toBe(idleStatus.border);
    expect(openedStatus.shadow).toBe("none");
    expect(openedStatus.outline).toBe("solid");
    expect(openedStatus.outlineColor).toBe("rgba(0, 0, 0, 0)");
  } finally {
    await context.close();
    await browser.close();
    cli(["host", "stop"]);
    rmSync(root, { recursive: true, force: true });
  }
}, 120_000);

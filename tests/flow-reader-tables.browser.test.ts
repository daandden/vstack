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
    padding: style.padding, fontSize: style.fontSize,
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
    await search.fill("a");
    const status = table.getByRole("combobox", { name: "Filter Status", exact: true });
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
    expect(await search.inputValue()).toBe("");
    expect(await cells()).toEqual(["Alpha", "Beta", "Gamma", "Zebra"]);
    expect(await page.evaluate(id => document.activeElement?.id === id, rowAnchor)).toBe(true);
    expect(await page.locator(`#${rowAnchor}`).evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; })).toBe(true);
    const legacy = page.locator(`#${seeded.refs.legacy}`);
    await legacy.getByRole("button", { name: "Sort by Number as text", exact: true }).click();
    const exact = page.locator(`#${seeded.refs.statuses}`);
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
    await page.getByRole("link", { name: "Find empty status", exact: true }).click();
    await page.locator(`#${emptyAnchor}`).waitFor({ state: "visible" });
    expect(await exact.getByRole("status").textContent()).toBe("3 of 3 rows");
    expect(await legacy.locator("tbody tr td:first-child").allTextContents()).toEqual(["10", "9"]);
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
          writeFileSync(`${name}.styles.json`, JSON.stringify({
            cell: await fieldStyle(table.getByRole("cell", { name: "Zebra", exact: true })),
            header: await fieldStyle(table.getByRole("columnheader").first()),
            sort: await fieldStyle(latency),
            search: await fieldStyle(search),
            status: await fieldStyle(status),
          }, null, 2));
          if (width === 1280) {
            await status.click();
            const popup = page.getByRole("listbox");
            await popup.screenshot({ path: `${name}-popup.png` });
            writeFileSync(`${name}-popup.aria.txt`, await popup.ariaSnapshot());
            writeFileSync(`${name}-popup.styles.json`, JSON.stringify(await fieldStyle(popup), null, 2));
            await page.keyboard.press("Escape");
            await popup.waitFor({ state: "hidden" });
          }
        }
      }
    }
    await page.reload();
    await latency.waitFor();
    expect(await cells()).toEqual(["Zebra", "Alpha", "Beta", "Gamma"]);
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
    expect(openedStatus.outline).toBe("none");
  } finally {
    await context.close();
    await browser.close();
    cli(["host", "stop"]);
    rmSync(root, { recursive: true, force: true });
  }
}, 120_000);

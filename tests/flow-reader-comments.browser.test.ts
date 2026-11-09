import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { ENV } from "./support/fixture.ts";

test("readers select typed-table text and manage revision-bound comments across browsers", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-reader-comments-")));
  const home = join(root, "home");
  mkdirSync(home);
  const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = socket.port;
  socket.stop(true);
  function cli(args: string[], items?: object[]): any {
    const p = Bun.spawnSync([process.execPath, join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts"), ...args, "--home", home, "--session", "01a1c282-0e63-7477-9c2a-df76da2174f4", "--agent", "impl-441-retry"], {
      cwd: root, env: { ...ENV, HOME: home, VSTACK_FLOW_PORT: String(port) },
      stdin: items ? new TextEncoder().encode(JSON.stringify({ version: 1, items })) : "ignore", stdout: "pipe", stderr: "pipe",
    });
    if (p.exitCode !== 0) throw new Error(p.stderr.toString());
    return JSON.parse(p.stdout.toString());
  }
  const browser = await chromium.launch({ headless: true });
  try {
    cli(["open", "--title", "Reader comments", "--skill", "implement"]);
    const result = { kind: "result", ref: "evidence", shape: "table", title: "Restart evidence", columns: [{ label: "Check", type: "text" }], rows: [{ ref: "restart", cells: ["Host restart"] }, { ref: "other", cells: ["Earlier check"] }] };
    const sent = cli(["submit"], [result]);
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${sent.live.url}#${sent.stage}`);
    const comments = page.getByRole("region", { name: "Reader comments on Restart evidence" });
    await comments.getByRole("button", { name: "Add Reader comment" }).click({ timeout: 5000 });
    await comments.getByRole("textbox", { name: "Comment" }).fill("Keep this evidence <script>literal</script>.");
    await comments.getByRole("button", { name: "Save comment", exact: true }).click();
    await comments.getByText("Keep this evidence <script>literal</script>.", { exact: true }).waitFor();
    expect(await comments.textContent()).toContain("Whole Result block");
    await comments.getByRole("button", { name: "Add Reader comment" }).click();
    await comments.getByRole("combobox", { name: "Comment target" }).click();
    await page.getByRole("option", { name: "e1: Host restart", exact: true }).click();
    await comments.getByRole("textbox", { name: "Comment" }).fill("Confirm the host restart.");
    await comments.getByRole("button", { name: "Save comment", exact: true }).click();
    await comments.getByText("Confirm the host restart.", { exact: true }).waitFor();
    await page.reload();
    await comments.getByText("Confirm the host restart.", { exact: true }).waitFor();
    expect(await comments.textContent()).toContain("Stage stage-1");
    expect(await comments.textContent()).toContain("Result result-1");
    expect(await comments.textContent()).toContain("Entry e1");
    const other = await browser.newContext({ viewport: { width: 320, height: 800 }, colorScheme: "dark" });
    const otherPage = await other.newPage();
    await otherPage.goto(`${sent.live.url}#${sent.stage}`);
    await otherPage.getByText("Confirm the host restart.", { exact: true }).waitFor();
    expect(await otherPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Sort by Check", exact: true }).click();
    expect(await page.getByRole("cell").allTextContents()).toEqual(["Earlier check", "Host restart"]);
    await page.getByRole("textbox", { name: "Filter rows", exact: true }).fill("Host restart");
    await page.getByRole("status").filter({ hasText: "1 of 2 rows" }).waitFor();
    const cell = page.getByRole("cell", { name: "Host restart", exact: true });
    await cell.scrollIntoViewIfNeeded();
    const word = await cell.evaluate((element) => {
      const text = element.querySelector("span")!.firstChild!;
      const range = document.createRange();
      range.setStart(text, "Host ".length);
      range.setEnd(text, text.textContent!.length);
      const bounds = range.getBoundingClientRect();
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    });
    await page.mouse.dblclick(word.x, word.y);
    await comments.getByRole("button", { name: "Comment on selected text", exact: true }).click();
    expect(await comments.locator("form blockquote").textContent()).toBe("restart");
    await comments.getByRole("textbox", { name: "Comment" }).fill("Clarify this selected word.");
    await comments.getByRole("button", { name: "Save comment", exact: true }).click();
    await comments.getByText("Clarify this selected word.", { exact: true }).waitFor();
    await comments.getByRole("button", { name: "Select text to comment", exact: true }).focus();
    await page.keyboard.press("Enter");
    const passage = comments.getByRole("textbox", { name: "Result text for selection" });
    await passage.focus();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("ArrowRight");
    for (let i = 0; i < 12; i++) await page.keyboard.press("Shift+ArrowLeft");
    await page.keyboard.type("tamper");
    expect(await passage.inputValue()).toContain("Host restart");
    expect(await passage.inputValue()).not.toContain("tamper");
    expect(await comments.getByRole("button", { name: "Comment on selected text", exact: true }).isEnabled()).toBe(true);
    await comments.getByRole("button", { name: "Comment on selected text", exact: true }).focus();
    await page.keyboard.press("Enter");
    await comments.getByRole("textbox", { name: "Comment" }).fill("Explain this selected passage.");
    await comments.getByRole("button", { name: "Save comment", exact: true }).focus();
    await page.keyboard.press("Enter");
    await comments.getByText("Explain this selected passage.", { exact: true }).waitFor();
    const textComment = comments.getByRole("listitem").filter({ hasText: "Explain this selected passage." });
    expect(await textComment.locator("blockquote").textContent()).toBe("Host restart");
    await page.reload();
    await textComment.getByRole("button", { name: "Edit comment" }).focus();
    await page.keyboard.press("Enter");
    await comments.getByRole("textbox", { name: "Comment" }).fill("Keep the selected passage.");
    await comments.getByRole("button", { name: "Save comment", exact: true }).focus();
    await page.keyboard.press("Enter");
    await otherPage.getByText("Keep the selected passage.", { exact: true }).waitFor();
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: "Copy feedback", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("status").filter({ hasText: "Feedback copied" }).waitFor();
    const feedback = await page.evaluate(() => navigator.clipboard.readText());
    expect(feedback).toContain("Stage stage-1");
    expect(feedback).toContain("Result result-1");
    expect(feedback).toContain("Revision 1");
    expect(feedback).toContain("Host restart");
    expect(feedback).toContain("Keep the selected passage.");
    expect(feedback).toContain("Keep this evidence <script>literal</script>.");
    expect(feedback).toContain("Confirm the host restart.");
    cli(["submit"], [{ ...result, ref: "revised", revises: sent.refs.evidence, title: "Updated restart evidence" }]);
    await page.getByRole("heading", { name: "Updated restart evidence", exact: true }).waitFor();
    await page.getByText("Earlier revisions (1)", { exact: true }).click();
    await comments.getByText("Confirm the host restart.", { exact: true }).waitFor();
    expect(await comments.textContent()).toContain("Revision 1");
    expect(await page.getByRole("region", { name: "Reader comments on Updated restart evidence", exact: true }).textContent()).not.toContain("Confirm the host restart.");
    const historicalText = comments.getByRole("listitem").filter({ hasText: "Keep the selected passage." });
    expect(await historicalText.locator("blockquote").textContent()).toContain("Host restart");
    if (process.env.FLOW_READER_EVIDENCE) {
      mkdirSync(process.env.FLOW_READER_EVIDENCE, { recursive: true });
      writeFileSync(join(process.env.FLOW_READER_EVIDENCE, "selected-revision.aria.txt"), await page.locator("body").ariaSnapshot());
      await page.screenshot({ path: join(process.env.FLOW_READER_EVIDENCE, "selected-revision.png"), fullPage: true });
    }
    await historicalText.getByRole("button", { name: "Remove comment" }).focus();
    await page.keyboard.press("Enter");
    await historicalText.getByRole("button", { name: "Confirm removal" }).focus();
    await page.keyboard.press("Enter");
    await otherPage.getByText("Keep the selected passage.", { exact: true }).waitFor({ state: "hidden" });
    expect(await comments.textContent()).not.toContain("Keep the selected passage.");
    if (process.env.FLOW_READER_EVIDENCE) {
      const dir = process.env.FLOW_READER_EVIDENCE;
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "comments.aria.txt"), await page.locator("body").ariaSnapshot());
      await page.screenshot({ path: join(dir, "comments.png"), fullPage: true });
      await otherPage.screenshot({ path: join(dir, "comments-phone.png"), fullPage: true });
    }
  } finally {
    await browser.close();
    cli(["host", "stop"]);
    rmSync(root, { recursive: true, force: true });
  }
}, 120_000);

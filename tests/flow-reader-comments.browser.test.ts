import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { ENV } from "./support/fixture.ts";

test("readers save block and entry comments apart from authored content across browsers and reloads", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-reader-comments-")));
  const home = join(root, "home");
  mkdirSync(home);
  const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = socket.port;
  socket.stop(true);
  function cli(args: string[], items?: object[]): any {
    const p = Bun.spawnSync([process.execPath, join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts"), ...args, "--home", home, "--session", "01a1c256-253b-7669-8fec-323a138f5d94", "--agent", "impl-440"], {
      cwd: root, env: { ...ENV, HOME: home, VSTACK_FLOW_PORT: String(port) },
      stdin: items ? new TextEncoder().encode(JSON.stringify({ version: 1, items })) : "ignore", stdout: "pipe", stderr: "pipe",
    });
    if (p.exitCode !== 0) throw new Error(p.stderr.toString());
    return JSON.parse(p.stdout.toString());
  }
  const browser = await chromium.launch({ headless: true });
  try {
    cli(["open", "--title", "Reader comments", "--skill", "implement"]);
    const result = { kind: "result", ref: "evidence", shape: "table", title: "Restart evidence", columns: ["Check"], rows: [{ ref: "restart", cells: ["Host restart"] }] };
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
    cli(["submit"], [{ ...result, ref: "revised", revises: sent.refs.evidence, title: "Updated restart evidence" }]);
    await page.getByRole("heading", { name: "Updated restart evidence", exact: true }).waitFor();
    await page.getByText("Earlier revisions (1)", { exact: true }).click();
    await comments.getByText("Confirm the host restart.", { exact: true }).waitFor();
    expect(await comments.textContent()).toContain("Revision 1");
    expect(await page.getByRole("region", { name: "Reader comments on Updated restart evidence", exact: true }).textContent()).not.toContain("Confirm the host restart.");
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

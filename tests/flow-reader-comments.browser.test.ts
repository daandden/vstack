import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Locator } from "playwright-core";
import { ENV } from "./support/fixture.ts";

test("readers select typed-table text and manage revision-bound comments across browsers", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-reader-comments-")));
  const home = join(root, "home");
  mkdirSync(home);
  const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = socket.port;
  socket.stop(true);
  function cli(args: string[], items?: object[]): any {
    const p = Bun.spawnSync([process.execPath, join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts"), ...args, "--home", home, "--session", "01a1cafe-75ab-7240-8f02-fa78a82d6123", "--agent", "Impl476"], {
      cwd: root, env: { ...ENV, HOME: join(root, "default-home"), VSTACK_FLOW_PORT: String(port) },
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
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light" });
    const page = await context.newPage();
    await page.goto(`${sent.live.url}#${sent.stage}`);
    let comments = page.getByRole("region", { name: "Reader comments on Restart evidence" });
    const capture = async (state: string) => {
      const proof = process.env.FLOW_READER_EVIDENCE;
      if (!proof) return;
      const system = page.getByRole("button", { name: "System", exact: true });
      if (await system.getAttribute("aria-pressed") !== "true") await system.click();
      for (const theme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: theme });
        await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
        const path = join(proof, `${state}-${theme}`);
        await comments.screenshot({ path: `${path}.png` });
        writeFileSync(`${path}.aria.txt`, await comments.ariaSnapshot());
      }
      await page.emulateMedia({ colorScheme: "light" });
    };
    await capture("empty");
    await comments.getByRole("button", { name: "Add Reader comment" }).click({ timeout: 5000 });
    const draft = comments.getByRole("textbox", { name: "Comment" });
    const save = comments.getByRole("button", { name: "Save comment", exact: true });
    const tooLong = comments.getByText("Keep the comment to 4,096 characters.", { exact: true });
    const count = comments.getByText("4,097 / 4,096", { exact: true });
    await capture("composing");
    await draft.fill("Was the first restart flaky, or did the host recover between runs?");
    await capture("draft");
    await draft.fill(" \n\t ");
    expect(await save.isDisabled()).toBe(true);
    expect(await draft.getAttribute("aria-invalid")).not.toBe("true");
    expect(await tooLong.count()).toBe(0);
    const atLimit = ` ${"Restart check passed. ".repeat(200).slice(0, 4094)} `;
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate(text => navigator.clipboard.writeText(text), `${atLimit} `);
    await draft.selectText();
    await page.keyboard.press("ControlOrMeta+V");
    await page.waitForFunction(({ id, length }) => (document.getElementById(id) as HTMLTextAreaElement).value.length === length, { id: (await draft.getAttribute("id"))!, length: 4097 }, { timeout: 5000 });
    expect(await tooLong.isVisible()).toBe(false);
    await save.click();
    await tooLong.waitFor({ timeout: 5000 });
    await count.waitFor();
    expect(await draft.getAttribute("aria-invalid")).toBe("true");
    const errorId = await tooLong.evaluate(el => el.closest("[role=alert]")?.id ?? null);
    expect(errorId).toBeTruthy();
    expect(await draft.getAttribute("aria-describedby")).toBe(errorId);
    const icon = comments.getByRole("alert").filter({ hasText: "Keep the comment" }).locator('[aria-hidden="true"]');
    expect(await icon.count()).toBe(1);
    expect(await icon.evaluate(el => getComputedStyle(el).maskImage)).not.toBe("none");
    for (const theme of ["Light", "Dark"]) {
      await page.getByRole("button", { name: theme, exact: true }).click();
      const paint = () => draft.evaluate(el => {
        const css = getComputedStyle(el);
        return {
          border: css.borderTopColor, width: css.borderTopWidth, shadow: css.boxShadow,
          outline: css.outlineStyle, outlineColor: css.outlineColor,
          height: el.getBoundingClientRect().height,
        };
      });
      const target = comments.getByRole("combobox", { name: "Comment target" });
      await target.focus();
      const unfocused = await paint();
      await page.keyboard.press("Tab");
      expect(await draft.evaluate(el => el === document.activeElement)).toBe(true);
      const focused = await paint();
      expect(focused.border).toBe(unfocused.border);
      expect(focused.border).toBe(theme === "Light" ? "oklch(0.55 0.216 19.8)" : "oklch(0.756 0.13 2.8)");
      expect(unfocused.width).toBe("1px");
      expect(focused.width).toBe("2px");
      expect(focused.height).toBe(unfocused.height);
      expect(unfocused.shadow).toBe("none");
      expect(focused.shadow).toBe("none");
      expect(await count.evaluate(el => getComputedStyle(el).color)).toBe(focused.border);
      expect(await icon.evaluate(el => getComputedStyle(el).color)).toBe(focused.border);
      expect(focused.outline).toBe("solid");
      expect(focused.outlineColor).toBe("rgba(0, 0, 0, 0)");
      const proof = process.env.FLOW_READER_EVIDENCE;
      const name = theme.toLowerCase();
      if (proof) {
        mkdirSync(proof, { recursive: true });
        writeFileSync(join(proof, `comment-invalid-${name}.json`), JSON.stringify({ unfocused, focused }, null, 2));
        writeFileSync(join(proof, `comment-invalid-${name}.aria.txt`), await comments.ariaSnapshot());
        await comments.screenshot({ path: join(proof, `comment-invalid-${name}.png`) });
      }
      const panel = proof && await comments.elementHandle();
      const openTarget = await target.elementHandle();
      await target.press("Enter");
      const listbox = page.getByRole("listbox");
      await listbox.getByRole("option", { name: "Whole Result block", exact: true }).and(page.locator(":focus")).waitFor();
      const blue = theme === "Light" ? "oklch(0.559 0.226 262.1)" : "oklch(0.766 0.111 259.9)";
      expect(await openTarget.evaluate(el => {
        const css = getComputedStyle(el);
        return [css.borderTopColor, css.outlineStyle, css.outlineColor];
      })).toEqual([blue, "solid", "rgba(0, 0, 0, 0)"]);
      if (proof && panel) {
        await page.keyboard.press("ArrowDown");
        await listbox.getByRole("option", { name: "e1: Host restart", exact: true }).and(page.locator(":focus")).waitFor();
        await panel.screenshot({ path: join(proof, `comment-target-open-${name}.png`) });
        writeFileSync(join(proof, `comment-target-open-${name}.aria.txt`), await listbox.ariaSnapshot());
      }
      await page.keyboard.press("Escape");
      await listbox.waitFor({ state: "hidden" });
      await draft.fill(atLimit);
      await tooLong.waitFor({ state: "hidden" });
      const valid = await paint();
      expect(valid.border).toBe(blue);
      expect(valid.width).toBe("1px");
      expect(valid.shadow).toBe("none");
      expect(valid.outline).toBe("solid");
      expect(valid.outlineColor).toBe("rgba(0, 0, 0, 0)");
      if (theme === "Light") {
        await draft.fill(`${atLimit}x`);
        await save.click();
        await tooLong.waitFor();
      }
    }
    await draft.fill(atLimit);
    await tooLong.waitFor({ state: "hidden" });
    expect(await count.count()).toBe(0);
    expect(await draft.getAttribute("aria-invalid")).not.toBe("true");
    expect(await draft.getAttribute("aria-describedby")).toBeNull();
    const saveDraft = "Was the first restart flaky, or did the host recover between runs?";
    await draft.fill(saveDraft);
    const blockedSave = Promise.withResolvers<void>();
    const failSave = async (route: import("playwright-core").Route) => {
      if (route.request().method() !== "POST") return route.continue();
      await blockedSave.promise;
      await route.fulfill({ status: 503, json: { error: "The Local Flow host is unavailable." } });
    };
    await page.route("**/comments", failSave);
    try {
      await save.click();
      const cancel = comments.getByRole("button", { name: "Cancel", exact: true });
      const sort = page.getByRole("button", { name: "Sort by Check", exact: true });
      await cancel.and(comments.locator(":disabled")).waitFor({ timeout: 5000 });
      const paint = (button: Locator) => button.evaluate(el => {
        const { padding, fontSize, fontWeight, color, opacity } = getComputedStyle(el);
        return { padding, fontSize, fontWeight, color, opacity };
      });
      const label = { fontSize: "12px", fontWeight: "500", color: "oklch(0.879 0.043 272.3)" };
      expect({ cancel: await paint(cancel), sort: await paint(sort) }).toEqual({
        cancel: { ...label, padding: "2px 8px", opacity: "0.75" },
        sort: { ...label, padding: "2px 8px", opacity: "1" },
      });
    } finally {
      blockedSave.resolve();
    }
    const failed = comments.getByRole("alert").filter({ hasText: "The Local Flow host is unavailable." });
    await failed.waitFor();
    expect(await draft.inputValue()).toBe(saveDraft);
    expect(await failed.evaluate(el => Boolean(el.compareDocumentPosition(el.closest("form")!.querySelector("[type=submit]")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    if (process.env.FLOW_READER_EVIDENCE) {
      const dir = process.env.FLOW_READER_EVIDENCE;
      for (const theme of ["Dark", "Light"]) {
        await page.getByRole("button", { name: theme, exact: true }).click();
        await draft.focus();
        const name = `comment-save-failed-${theme.toLowerCase()}`;
        await comments.screenshot({ path: join(dir, `${name}.png`) });
        writeFileSync(join(dir, `${name}.aria.txt`), await comments.ariaSnapshot());
      }
    }
    await page.unroute("**/comments", failSave);
    await draft.fill(atLimit);
    await save.click();
    const savedAtLimit = comments.getByRole("listitem").filter({ hasText: atLimit.trim() });
    await savedAtLimit.waitFor();
    expect(await savedAtLimit.locator("p").allTextContents()).toContain(atLimit);
    await savedAtLimit.getByRole("button", { name: "Remove comment" }).click();
    await savedAtLimit.getByRole("button", { name: "Confirm removal" }).click();
    await savedAtLimit.waitFor({ state: "hidden" });
    await comments.getByRole("button", { name: "Add Reader comment" }).click();
    await comments.getByRole("textbox", { name: "Comment" }).fill("Keep this evidence <script>literal</script>.");
    await comments.getByRole("button", { name: "Save comment", exact: true }).click();
    await comments.getByText("Keep this evidence <script>literal</script>.", { exact: true }).waitFor();
    expect(await comments.textContent()).toContain("Whole Result block");
    await capture("saved");
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
    const other = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "dark", hasTouch: true });
    const otherPage = await other.newPage();
    await otherPage.goto(`${sent.live.url}#${sent.stage}`);
    await otherPage.getByText("Confirm the host restart.", { exact: true }).waitFor();
    expect(await otherPage.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const touchComments = otherPage.getByRole("region", { name: "Reader comments on Restart evidence" });
    const desktopSize = async (control: Locator) => {
      expect(await control.evaluate(el => {
        const css = getComputedStyle(el);
        return [css.minBlockSize, css.paddingInlineStart];
      })).toEqual(["28px", "8px"]);
    };
    const addComment = touchComments.getByRole("button", { name: "Add Reader comment" });
    await desktopSize(addComment);
    await desktopSize(otherPage.getByRole("button", { name: "Sort by Check", exact: true }));
    await desktopSize(touchComments.getByRole("button", { name: "Edit comment" }).first());
    await desktopSize(touchComments.getByRole("button", { name: "Remove comment" }).first());
    await addComment.tap();
    await desktopSize(touchComments.getByRole("button", { name: "Save comment" }));
    await desktopSize(touchComments.getByRole("combobox", { name: "Comment target" }));
    const cancelComment = touchComments.getByRole("button", { name: "Cancel" });
    await desktopSize(cancelComment);
    await cancelComment.tap();
    expect(await otherPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await otherPage.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    for (const fontFamily of ["", "monospace"]) {
      await otherPage.evaluate(font => { document.body.style.fontFamily = font; }, fontFamily);
      expect(await otherPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const touchButtons = otherPage.getByRole("button").filter({ hasText: /^(Edit comment|Remove comment|Add Reader comment|Select text to comment|Comment on selected text|Check)/ });
      for (const button of await touchButtons.all()) {
        const box = await button.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(28);
        expect(await button.evaluate(el => [...el.querySelectorAll("span")]
          .filter(label => label.scrollWidth > label.clientWidth)
          .map(label => ({ text: label.textContent, scrollWidth: label.scrollWidth, clientWidth: label.clientWidth })))).toEqual([]);
      }
    }
    await otherPage.evaluate(() => {
      document.documentElement.style.fontSize = "";
      document.body.style.fontFamily = "";
    });
    await page.getByRole("button", { name: "Sort by Check", exact: true }).click();
    expect(await page.getByRole("cell").allTextContents()).toEqual(["Earlier check", "Host restart"]);
    await page.getByRole("button", { name: "Filters", exact: true }).click();
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
    await capture("selecting");
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("ArrowRight");
    for (let i = 0; i < 12; i++) await page.keyboard.press("Shift+ArrowLeft");
    await page.keyboard.type("tamper");
    expect(await passage.inputValue()).toContain("Host restart");
    expect(await passage.inputValue()).not.toContain("tamper");
    expect(await comments.getByRole("button", { name: "Comment on selected text", exact: true }).isEnabled()).toBe(true);
    await comments.getByRole("button", { name: "Comment on selected text", exact: true }).focus();
    await page.keyboard.press("Enter");
    const quote = comments.locator("form blockquote");
    expect(await quote.evaluate(el => getComputedStyle(el).paddingInlineStart)).toBe("8px");
    await capture("quoting");
    await comments.getByRole("textbox", { name: "Comment" }).fill("Explain this selected passage.");
    await comments.getByRole("button", { name: "Save comment", exact: true }).focus();
    await page.keyboard.press("Enter");
    await comments.getByText("Explain this selected passage.", { exact: true }).waitFor();
    await capture("multiple-saved");
    const textComment = comments.getByRole("listitem").filter({ hasText: "Explain this selected passage." });
    expect(await textComment.locator("blockquote").textContent()).toBe("Host restart");
    await page.reload();
    await textComment.getByRole("button", { name: "Edit comment" }).focus();
    await page.keyboard.press("Enter");
    await capture("editing");
    await comments.getByRole("textbox", { name: "Comment" }).fill("Keep the selected passage.");
    await comments.getByRole("button", { name: "Save comment", exact: true }).focus();
    await page.keyboard.press("Enter");
    await otherPage.getByText("Keep the selected passage.", { exact: true }).waitFor();
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const copyFeedback = page.getByRole("contentinfo").getByRole("button", { name: "Copy feedback", exact: true });
    const pending = Promise.withResolvers<void>();
    await page.route("**/comments", async (route) => {
      await pending.promise;
      await route.continue();
    });
    try {
      await copyFeedback.focus();
      await page.keyboard.press("Enter");
      expect(await copyFeedback.getAttribute("aria-busy")).toBe("true");
      expect(await copyFeedback.isDisabled()).toBe(true);
      const icon = copyFeedback.locator("[aria-hidden=true]");
      expect(await icon.evaluate((el) => {
        const { width, height } = el.getBoundingClientRect();
        return width > 0 && height > 0 && getComputedStyle(el).maskImage !== "none";
      })).toBe(true);
    } finally {
      pending.resolve();
      await page.unrouteAll({ behavior: "wait" });
    }
    await page.getByRole("status").filter({ hasText: "Feedback copied" }).waitFor();
    const feedback = await page.evaluate(() => navigator.clipboard.readText());
    expect(feedback).toContain("Stage stage-1");
    expect(feedback).toContain("Result result-1");
    expect(feedback).toContain("Revision 1");
    expect(feedback).toContain("Host restart");
    expect(feedback).toContain("Keep the selected passage.");
    expect(feedback).toContain("Keep this evidence <script>literal</script>.");
    expect(feedback).toContain("Confirm the host restart.");
    await comments.getByRole("button", { name: "Add Reader comment", exact: true }).click();
    await comments.getByRole("textbox", { name: "Comment" }).fill("Saved after the focused edit.");
    const focused = cli(["submit"], [{ kind: "revise", result: sent.refs["evidence/restart"], base: sent.revision, set: { cells: ["Changed restart"] } }]);
    await page.getByRole("cell", { name: "Changed restart", exact: true }).waitFor();
    await comments.getByRole("button", { name: "Save comment", exact: true }).click();
    expect(await page.locator(`#${sent.refs.evidence} > [aria-label="Reader comments on Restart evidence"]`).innerText()).not.toContain("Confirm the host restart.");
    await page.getByText("Earlier revisions (1)", { exact: true }).click();
    comments = page.locator(`#${sent.refs.evidence}-r1`).getByRole("region", { name: "Reader comments on Restart evidence", exact: true });
    await comments.getByText("Saved after the focused edit.", { exact: true }).waitFor();
    const added = cli(["submit"], [{ kind: "revise", result: sent.refs.evidence, add: [{ ref: "added", cells: ["New proof"] }] }]);
    await page.getByRole("cell", { name: "New proof", exact: true }).waitFor();
    const currentComments = page.locator(`#${sent.refs.evidence} > [aria-label="Reader comments on Restart evidence"]`);
    await currentComments.getByRole("button", { name: "Add Reader comment", exact: true }).click();
    await currentComments.getByRole("textbox", { name: "Comment" }).fill("Comment on the appended version.");
    await currentComments.getByRole("button", { name: "Save comment", exact: true }).click();
    await currentComments.getByText("Comment on the appended version.", { exact: true }).waitFor();
    await copyFeedback.click();
    await page.getByRole("status").filter({ hasText: "Feedback copied" }).waitFor();
    const focusedFeedback = await page.evaluate(() => navigator.clipboard.readText());
    expect(focusedFeedback).toContain("> Host restart\nConfirm the host restart.");
    expect(focusedFeedback).not.toContain("> Changed restart\nConfirm the host restart.");
    expect(focusedFeedback).toContain(`Revision 1 · Edit ${added.revision}`);
    expect(focused.revision).not.toBe(added.revision);
    cli(["submit"], [{ ...result, ref: "revised", revises: sent.refs.evidence, title: "Updated restart evidence" }]);
    await page.getByRole("heading", { name: "Updated restart evidence", exact: true }).waitFor();
    if (!await comments.getByText("Confirm the host restart.", { exact: true }).isVisible()) await page.getByText("Earlier revisions (3)", { exact: true }).click();
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
    const confirm = historicalText.getByRole("button", { name: "Confirm removal" });
    expect(await confirm.evaluate(el => {
      const style = getComputedStyle(el);
      return style.borderColor === style.color;
    })).toBe(true);
    await capture("removing");
    await historicalText.getByRole("button", { name: "Confirm removal" }).focus();
    await page.keyboard.press("Enter");
    await historicalText.waitFor({ state: "hidden" });
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

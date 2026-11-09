import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { ENV } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "flow-page", "scripts", "flow-page.ts");

test("question context, choices, answers and figures keep their layout without legacy component rules", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-reader-questions-")));
  const home = join(root, "home");
  mkdirSync(home);
  const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = socket.port;
  socket.stop(true);
  function cli(args: string[], items?: object[]): any {
    const p = Bun.spawnSync([process.execPath, SCRIPT, ...args, "--home", home, "--session", "01a1c229-a432-72c7-8e1b-03ce9f58bdfc", "--agent", "impl-432"], {
      cwd: root, env: { ...ENV, HOME: home, VSTACK_FLOW_PORT: String(port) },
      stdin: items ? new TextEncoder().encode(JSON.stringify({ version: 1, items })) : "ignore", stdout: "pipe", stderr: "pipe",
    });
    if (p.exitCode !== 0) throw new Error(`flow-page ${args.join(" ")}: ${p.stderr}`);
    return JSON.parse(p.stdout.toString());
  }
  const proof = process.env.FLOW_READER_EVIDENCE;
  if (proof) mkdirSync(proof, { recursive: true });
  writeFileSync(join(root, "path.mmd"), 'flowchart LR\n  a[Read the context] --> b[Answer the question]\n');
  const browser = await chromium.launch({ headless: true });
  try {
    const opened = cli(["open", "--skill", "grill-me", "--title", "Questions and shared context"]);
    const published = cli(["submit"], [
      { kind: "attachment", ref: "path", type: "mermaid", caption: "Reading path", description: "Read `context` before answering.", origin: "path.mmd", path: "path.mmd", focus: ["b"] },
      { kind: "background", title: "Background", summary: "Two routes share the same context.", sections: [{ heading: "Today", body: "The reader keeps **authored content** separate from your answer." }], sources: ["GLOSSARY.md"] },
      { kind: "topic", ref: "context", title: "Shared context", summary: "A concept used by both questions.", body: "- Read the Background\n- Compare the options", sources: ["ADR 0067"] },
      { kind: "assumed", ref: "assumption", decision: "Keep stored revisions", pick: "Retain the original", why: "No authored record should move." },
      { kind: "round", questions: [
        { ref: "first", title: "Keep the reading path?", description: "Read the context and compare both routes.", topics: ["context"], terms: [{ term: "Flow", text: "Related work across Stages." }], today: [{ text: "The host serves the built reader.", source: "reader/ship.ts" }], example: "Read → compare → answer", needs: [{ need: "Follow the current path.", kind: "context-diagram" }], figures: [{ attachment: "path", kind: "context-diagram" }], options: [{ label: "Keep", does: "Retain the path.", gains: ["Familiar reading order"], costs: ["No new route"], recommended: "The path already works." }, { label: "Change", does: "Replace the path.", gains: ["Another route"], costs: ["Relearn the order"] }] },
        { ref: "second", title: "Read the next question?", description: "Keyboard navigation reaches this question.", needs: [{ need: "Understand the next choice.", kind: "prose" }], options: [{ label: "Continue", does: "Reads the next question.", gains: ["More context"], costs: ["More reading"] }] },
      ] },
    ]);
    cli(["submit"], [{ kind: "answer", question: published.refs.first, response: { status: "answered", picks: ["A"] } }]);
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${opened.live.url}#${published.refs.first}`);
    await page.getByRole("img", { name: "Reading path" }).locator("svg").waitFor();
    for (const theme of ["Light", "Dark"]) {
      await page.getByRole("button", { name: theme, exact: true }).click();
      await page.evaluate(async () => { await Promise.all(document.getAnimations().map((a) => a.finished)); });
      if (proof) {
        await page.screenshot({ path: join(proof, `${theme.toLowerCase()}.png`), fullPage: true });
        writeFileSync(join(proof, `${theme.toLowerCase()}.aria.txt`), await page.locator("body").ariaSnapshot());
      }
    }
    // Simulate the final stylesheet cutover while exercising the actual shipped reader.
    await page.evaluate(() => {
      const owned = /\.(?:question|qnum|refs|terms|example|visual|figure(?:-caption|-title|-description)?|diagram-measure|source|unavailable|download|options|option|star|trade|gain|cost|why|answer|background|topic|assumed|summary-block|summary|fields)(?![\w-])/;
      function strip(rules: CSSRuleList) {
        for (const rule of [...rules]) {
          if (rule instanceof CSSStyleRule && owned.test(rule.selectorText)) rule.style.cssText = "";
          else if ("cssRules" in rule) strip((rule as CSSGroupingRule).cssRules);
        }
      }
      for (const sheet of document.styleSheets) strip(sheet.cssRules);
    });
    const question = page.locator(`#${published.refs.first}`);
    expect(await question.evaluate((el) => ({ display: getComputedStyle(el).display, gap: getComputedStyle(el).gap }))).toEqual({ display: "grid", gap: "10px" });
    expect(await question.locator(".options").evaluate((el) => ({ display: getComputedStyle(el).display, list: getComputedStyle(el).listStyleType }))).toEqual({ display: "grid", list: "none" });
    expect(await question.locator(".answer").evaluate((el) => getComputedStyle(el).borderInlineStartWidth)).toBe("2px");
    const terms = question.locator("details").filter({ has: page.locator("summary", { hasText: /^Term notes/ }) });
    await terms.locator("summary").focus();
    await page.keyboard.press("Enter");
    expect(await terms.getByText("Related work across Stages.").isVisible()).toBe(true);
    await page.keyboard.press("Space");
    expect(await terms.getByText("Related work across Stages.").isVisible()).toBe(false);
    await page.locator("body").click({ position: { x: 1, y: 1 } });
    await page.keyboard.press("n");
    expect(new URL(page.url()).hash).toBe(`#${published.refs.second}`);
    await page.setViewportSize({ width: 320, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(cli(["show", "--flow", opened.flow]).revision).toBe(published.revision + 1);
  } finally {
    await browser.close();
    cli(["host", "stop"]);
    rmSync(root, { recursive: true, force: true });
  }
}, 120_000);

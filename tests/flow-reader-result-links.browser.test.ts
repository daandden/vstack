import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { ENV } from "./support/fixture.ts";
import { linkedQuestion, linkedResults } from "./support/result-links.ts";

const script = join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts");
test("whole Results link to question headers both ways while entries and earlier revisions stay precise", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-reader-result-links-")));
  const home = join(root, "home");
  mkdirSync(home);
  const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = listener.port;
  listener.stop(true);
  function cli(args: string[], items?: object[]) {
    const p = Bun.spawnSync(["bun", script, ...args, "--home", home, "--session", "01a1cad3-9dc5-7149-8e55-3ee9a2317ac5", "--agent", "Impl464"], {
      cwd: root, env: { ...ENV, HOME: join(root, "default-home"), VSTACK_FLOW_PORT: String(port) },
      stdin: items ? new TextEncoder().encode(JSON.stringify({ version: 1, items })) : "ignore", stdout: "pipe", stderr: "pipe",
    });
    if (p.exitCode !== 0) throw new Error(p.stderr.toString());
    return JSON.parse(p.stdout.toString()) as { flow: string; refs: Record<string, string>; live: { url: string } };
  }
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const opened = cli(["open", "--title", "Whole Result navigation", "--skill", "grill-me"]);
    if (!opened.live.url) throw new Error(`Reader host unavailable: ${JSON.stringify(opened.live)}`);
    const sent = cli(["submit"], [...linkedResults(), { kind: "round", questions: [linkedQuestion()] }]);
    cli(["submit"], [{ ...linkedResults()[0], revises: sent.refs.document, summary: "Current evidence" }]);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${opened.live.url}#${sent.refs.decision}`);
    const question = page.locator(`#${sent.refs.decision}`);
    await question.waitFor();
    for (const ref of ["document", "comparison", "metrics", "prototype", "quiz", "cards"]) {
      const id = sent.refs[ref];
      await question.locator(`a[href="#${id}"]`).click();
      expect(new URL(page.url()).hash).toBe(`#${id}`);
      const result = page.locator(`#${id}`);
      expect(await result.locator(":scope > div > header").innerText()).toContain("Asked in Q1");
      const y = await result.evaluate((el) => el.getBoundingClientRect().top);
      expect(y).toBeGreaterThanOrEqual(await page.locator(".bar").evaluate((el) => el.getBoundingClientRect().bottom) - 1);
      await result.locator(`:scope > div > header a[href="#${sent.refs.decision}"]`).click();
      expect(new URL(page.url()).hash).toBe(`#${sent.refs.decision}`);
    }
    expect(await question.innerText()).toContain("Before reconnect: saved response A");
    expect(await question.innerText()).toContain("Retained data needs storage.");
    await question.locator(`a[href="#${sent.refs.cards}-e1"]`).focus();
    await page.keyboard.press("Enter");
    expect(new URL(page.url()).hash).toBe(`#${sent.refs.cards}-e1`);
    await page.locator(`#${sent.refs.cards}-e1 a[href="#${sent.refs.decision}"]`).click();
    expect(new URL(page.url()).hash).toBe(`#${sent.refs.decision}`);
    const history = page.locator(`#${sent.refs.document} details`).filter({ has: page.locator("summary", { hasText: "Earlier revisions" }) });
    await history.locator(":scope > summary").click();
    expect(await page.locator(`#${sent.refs.document}-r1 header`).innerText()).not.toContain("Asked in");
    expect(await page.locator(`#${sent.refs.document}-r1`).innerText()).toContain("Saved responses survive reconnects");
    const again = cli(["submit"], [{ kind: "round", questions: [{ ...linkedQuestion([sent.refs.document!]), ref: "retry", again: sent.refs.decision }] }]);
    await page.goto(`${opened.live.url}#${sent.refs.document}`);
    const asked = page.locator(`#${sent.refs.document} > div > header`);
    await asked.getByRole("link", { name: "Q1 (attempt 2)", exact: true }).waitFor();
    expect(await asked.getByRole("link", { name: "Q1 (attempt 1)", exact: true }).getAttribute("href")).toBe(`#${sent.refs.decision}`);
    expect(await asked.getByRole("link", { name: "Q1 (attempt 2)", exact: true }).getAttribute("href")).toBe(`#${again.refs.retry}`);
    await page.goto(`${opened.live.url}#${again.refs.retry}`);
    await page.locator(`#${again.refs.retry}`).getByRole("heading", { name: /^Q1\s*:\s*Keep saved responses after reconnecting\?$/ }).waitFor();
    await page.goto(`${opened.live.url}#${sent.refs.cards}`);
    await page.locator(`#${sent.refs.cards}`).getByRole("heading", { name: /^e1\s*:\s*\S/ }).waitFor();
    for (const theme of ["Light", "Dark"]) {
      await page.getByRole("button", { name: theme, exact: true }).click();
      for (const width of [320, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await question.locator(`a[href="#${sent.refs.document}"]`).click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        const proof = process.env.FLOW_READER_EVIDENCE;
        if (proof) {
          mkdirSync(proof, { recursive: true });
          await page.screenshot({ path: join(proof, `links-${theme.toLowerCase()}-${width}.png`), fullPage: true });
          writeFileSync(join(proof, `links-${theme.toLowerCase()}-${width}.aria.txt`), await page.locator("body").ariaSnapshot());
        }
      }
    }
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await browser.close();
    cli(["host", "stop"]);
    rmSync(root, { recursive: true, force: true });
  }
}, 120_000);

import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { ENV } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "flow-page", "scripts", "flow-page.ts");

test("question context, choices, answers and figures keep their compact themed layout", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-reader-questions-")));
  const home = join(root, "home");
  mkdirSync(home);
  const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = socket.port;
  socket.stop(true);
  function cli(args: string[], items?: object[]): any {
    const p = Bun.spawnSync([process.execPath, SCRIPT, ...args, "--home", home, "--session", "01a1c243-9218-7214-af2f-363af599ca19", "--agent", "impl-434"], {
      cwd: root, env: { ...ENV, HOME: join(root, "default-home"), VSTACK_FLOW_PORT: String(port) },
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
        { ref: "noted", title: "Where should the cap live?", description: "The number sits in code today.", needs: [{ need: "Compare where the cap lives.", kind: "prose" }], options: [{ label: "Keep in code", does: "Keeps the constant.", gains: ["Reviewed with code"], costs: ["A deploy per change"] }, { label: "Move to config", does: "Reads it from settings.", gains: ["Ops can change it"], costs: ["Config drift"] }] },
        { ref: "worded", title: "Should the check run on the server?", description: "Only the browser checks today.", needs: [{ need: "Compare where the check runs.", kind: "prose" }], options: [{ label: "Server too", does: "The API rejects carts.", gains: ["Cannot be bypassed"], costs: ["One more lookup"] }, { label: "Browser only", does: "Keeps the client check.", gains: ["No API change"], costs: ["A crafted request skips it"] }] },
      ] },
    ]);
    cli(["submit"], [
      { kind: "answer", question: published.refs.first, response: { status: "answered", picks: ["A"] } },
      { kind: "answer", question: published.refs.noted, response: { status: "answered", picks: ["A"], text: "Config would be nice later.", note_on: "B" } },
      { kind: "answer", question: published.refs.worded, response: { status: "answered", text: "A server check worries me.", note_on: "A" }, reading: { outcome: "concern", unresolved: "Whether one more lookup fits the budget." } },
    ]);
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
    const question = page.locator(`#${published.refs.first}`);
    expect(await question.evaluate((el) => ({ display: getComputedStyle(el).display, gap: getComputedStyle(el).gap }))).toEqual({ display: "grid", gap: "10px" });
    expect(await question.locator(".options").evaluate((el) => ({ display: getComputedStyle(el).display, list: getComputedStyle(el).listStyleType }))).toEqual({ display: "grid", list: "none" });
    expect(await question.locator(".answer").count()).toBe(0);
    expect(await question.getByRole("heading", { name: /Keep.*\(your answer\)/ }).count()).toBe(1);
    const noted = page.locator(`#${published.refs.noted}`);
    const worded = page.locator(`#${published.refs.worded}`);
    const lineLabels = (q: typeof noted) => q.locator(".answer p").evaluateAll((ps) => ps.map((p) => p.firstElementChild!.textContent));
    expect(await lineLabels(noted)).toEqual(["Note on B"]);
    expect(await lineLabels(worded)).toEqual(["Words on A", "Concern", "Still to ask"]);
    const box = await worded.locator(".answer").evaluate((el) => {
      const s = getComputedStyle(el);
      const label = el.querySelector("p > :first-child")!;
      return { border: [s.borderBlockStartWidth, s.borderBlockEndWidth, s.borderInlineStartWidth, s.borderInlineEndWidth], radius: s.borderTopLeftRadius, sameColour: getComputedStyle(label).color === s.color && getComputedStyle(label.nextElementSibling!).color === s.color };
    });
    expect(box).toEqual({ border: ["1px", "1px", "1px", "1px"], radius: "4px", sameColour: true });
    const textStarts = async (q: typeof noted) => q.locator(".answer p").evaluateAll((ps) => ps.map((p) => Math.round(p.lastElementChild!.getBoundingClientRect().left - p.parentElement!.getBoundingClientRect().left)));
    const starts = [...(await textStarts(noted)), ...(await textStarts(worded))];
    expect(new Set(starts).size).toBe(1);
    const gaps = await worded.evaluate((el) => {
      const opts = [...el.querySelectorAll(".option")].map((o) => o.getBoundingClientRect());
      const answer = el.querySelector(".answer")!.getBoundingClientRect();
      return { lines: [...el.querySelectorAll(".option")].map((o) => getComputedStyle(o).borderBlockStartWidth), between: Math.round(opts[1]!.top - opts[0]!.bottom), toAnswer: Math.round(answer.top - opts[1]!.bottom) };
    });
    expect(gaps).toEqual({ lines: ["0px", "0px"], between: 16, toAnswer: 16 });
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

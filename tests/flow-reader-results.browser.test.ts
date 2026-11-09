import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import { ENV } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts");
const proof = process.env.FLOW_READER_EVIDENCE;
async function capture(page: Page, name: string) {
  if (!proof) return;
  mkdirSync(proof, { recursive: true });
  await page.evaluate(async () => { await Promise.all(document.getAnimations().map((a) => a.finished)); });
  await page.screenshot({ path: join(proof, `${name}.png`), fullPage: true });
  writeFileSync(join(proof, `${name}.aria.txt`), await page.locator("body").ariaSnapshot());
}
const finding = { ref: "finding", title: "Keep saved answers", label: "issue", blocking: true, impact: "A reader loses an answer.", action: "Keep it after reconnecting.", evidence: "Reconnect proof.", location: "answers.ts:42" };

test("all Results retain compact themed rendering, learning progress and isolated prototypes without legacy Result styles", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-reader-results-")));
  const home = join(root, "home");
  mkdirSync(home);
  const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = socket.port;
  socket.stop(true);
  function cli(args: string[], items?: object[]): any {
    const p = Bun.spawnSync([process.execPath, SCRIPT, ...args, "--home", home, "--session", "01a1c229-a486-74b8-a62d-03524f4b218c", "--agent", "impl-433"], {
      cwd: root, env: { ...ENV, HOME: home, VSTACK_FLOW_PORT: String(port) },
      stdin: items ? new TextEncoder().encode(JSON.stringify({ version: 1, items })) : "ignore", stdout: "pipe", stderr: "pipe",
    });
    if (p.exitCode !== 0) throw new Error(`flow-page ${args.join(" ")}: ${p.stderr}`);
    return JSON.parse(p.stdout.toString());
  }
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light" });
  try {
    const opened = cli(["open", "--skill", "implement", "--title", "Every Result"]);
    writeFileSync(join(root, "artifact.html"), '<!doctype html><button>Try prototype</button><script src="app.js"></script>');
    writeFileSync(join(root, "app.js"), 'document.querySelector("button").onclick = e => e.target.textContent = "Prototype works";');
    const seeded = cli(["submit"], [
      { kind: "attachment", ref: "app", type: "artifact", caption: "Captured prototype", origin: "Browser fixture", revision: "fixture-1", launch: "Open the captured viewer", runtime: "html", bundle: { entry: "index.html", files: [{ path: "index.html", source: "artifact.html" }, { path: "app.js", source: "app.js" }] } },
      { kind: "result", ref: "cards", shape: "cards", title: "Cards", entries: [{ ...finding, location: undefined }] },
      { kind: "result", ref: "review", shape: "review", title: "Review", axes: [{ axis: "standards", status: "findings" }, { axis: "spec", status: "clean", reason: "Covered." }, { axis: "blast-radius", status: "unavailable", reason: "No external caller." }], entries: [{ ...finding, axis: "standards" }] },
      { kind: "result", ref: "ledger", shape: "ledger", title: "Ledger", entries: [{ ref: "claim", claim: "Reconnect keeps answers.", status: "unproven", evidence: "One local run.", missing_proof: "Restart evidence.", consequence: "Do not claim persistence yet." }] },
      { kind: "result", ref: "table", shape: "table", title: "Table", columns: ["Target", "Status"], rows: [{ ref: "row", cells: ["reader/app/components/QuizBody.vue", "Covered"] }] },
      { kind: "result", ref: "document", shape: "document", title: "Document", sections: [{ heading: "Procedure", blocks: [{ prose: "Keep the answer [@source]." }, { list: ["Reconnect", "Read again"], ordered: true }, { code: "const saved = true;\n", language: "ts" }] }], citations: [{ ref: "source", source: "answers.ts:42" }], limitations: ["Local run only."], sources: ["GLOSSARY.md"] },
      { kind: "result", ref: "code", shape: "code", title: "Code and diff", entries: [{ ref: "source", file: "answers.ts", line: 10, language: "ts", code: "const saved = true;\n" }, { ref: "diff", file: "answers.ts", language: "ts", diff: "--- a/answers.ts\n+++ b/answers.ts\n@@ -1 +1 @@\n-const saved = false;\n+const saved = true;\n" }] },
      { kind: "result", ref: "timeline", shape: "timeline", title: "Timeline", entries: [{ ref: "red", title: "Missing persistence", outcome: "failed", time: "2026-11-10T10:00:00Z", detail: "The answer disappeared.", evidence: "Reconnect run." }, { ref: "green", title: "Answer retained", outcome: "succeeded" }] },
      { kind: "result", ref: "comparison", shape: "comparison", title: "Comparison", alternatives: [{ ref: "keep", name: "Keep" }, { ref: "drop", name: "Drop" }], criteria: [{ ref: "durability", name: "Durability" }], assessments: [{ alternative: "keep", criterion: "durability", finding: "Survives reconnect.", evidence: "Browser run." }], verdict: { outcome: "chosen", alternative: "keep", reason: "Readers keep their work." } },
      { kind: "result", ref: "metrics", shape: "metrics", title: "Metrics", workload: "30 reconnects", outcome: "No regression", series: [{ ref: "main", label: "main", baseline: true }, { ref: "branch", label: "branch" }, { ref: "missing", label: "missing" }], measurements: [{ ref: "latency", name: "Latency", unit: "ms", better: "lower", verdict: "better", values: [{ series: "main", value: 10, samples: 30, uncertainty: { plusminus: 1, of: "95% CI" } }, { series: "branch", value: 8, samples: 30 }, { series: "missing", missing: "Not measured" }] }] },
      { kind: "result", ref: "quiz", shape: "quiz", title: "Quiz", questions: [{ ref: "authority", prompt: "What authorizes work?", choices: [{ ref: "ask", label: "A real ask" }, { ref: "quiz", label: "A quiz click" }], answer: { choice: "ask" }, explanation: "A quiz grants no consent." }, { ref: "sum", prompt: "Two plus three?", answer: { number: 5 }, explanation: "Five." }, { ref: "word", prompt: "Type Flow", answer: { text: ["Flow"] }, explanation: "A learning answer." }] },
      { kind: "result", ref: "demo", shape: "prototype", title: "Declarative demo", demo: { values: [{ name: "items", label: "Items", initial: 0 }], states: [{ name: "ready", label: "Ready" }, { name: "full", label: "Full" }], start: "ready", actions: [{ name: "add", label: "Add item", transitions: [{ from: ["ready"], to: "full", set: { items: { add: 1 } } }] }] } },
      { kind: "result", ref: "artifact", shape: "prototype", title: "Isolated artifact", artifact: "app" },
    ]);
    cli(["submit"], [{ kind: "result", revises: seeded.refs.cards, shape: "cards", title: "Cards", entries: [{ ...finding, location: undefined, impact: "Returning readers keep their answers." }] }]);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${opened.live.url}#${seeded.refs.cards}`);
    await page.locator(`#${seeded.refs.artifact} iframe`).waitFor();
    for (const theme of ["Light", "Dark"]) {
      await page.getByRole("button", { name: theme, exact: true }).click();
      await capture(page, `${theme.toLowerCase()}-results`);
    }
    const retirement = await page.evaluate(() => {
      let removed = 0;
      const retire = (parent: CSSStyleSheet | CSSGroupingRule, legacy = false) => {
        for (let i = parent.cssRules.length - 1; i >= 0; i--) {
          const rule = parent.cssRules[i]!;
          if (legacy && rule instanceof CSSStyleRule && /\.(?:result|entries|card|claim|tag|asks|table|revisions|doc-section|limitations|cite|backlink|code|tok-|timeline|event|verdict|compare|measurement|bar-cell|demo|quiz|viewer|runnable)(?:[\s.:[>#-]|$)/.test(rule.selectorText)) { parent.deleteRule(i); removed++; }
          else if ("cssRules" in rule) retire(rule as CSSGroupingRule, legacy || ("name" in rule && rule.name === "components"));
        }
      };
      for (const sheet of document.styleSheets) retire(sheet);
      return removed;
    });
    if (proof) writeFileSync(join(proof, "retired-rules.json"), JSON.stringify({ removed: retirement }));
    expect(await page.locator(`#${seeded.refs.cards}`).evaluate((el) => getComputedStyle(el).rowGap)).toBe("10px");
    expect(await page.locator(`#${seeded.refs.quiz} form`).first().evaluate((el) => getComputedStyle(el).display)).toBe("grid");
    for (const ref of ["cards", "review", "ledger", "table", "document", "code", "timeline", "comparison", "metrics", "quiz", "demo", "artifact"]) expect(await page.locator(`#${seeded.refs[ref]}`).isVisible()).toBe(true);
    expect(await page.getByRole("table", { name: "Review summary" }).innerText()).toContain("Keep saved answers");
    expect(await page.locator(`#${seeded.refs.comparison}`).innerText()).toContain("Not assessed");
    expect(await page.locator(`#${seeded.refs.metrics}`).innerText()).toContain("-2 ms");
    expect(await page.locator(`#${seeded.refs.code} pre`).first().textContent()).toBe("const saved = true;\n");
    expect(await page.locator(`#${seeded.refs["code/source"].replace("/", "-")}-L10`).count()).toBe(1);
    const revisions = page.locator(`#${seeded.refs.cards} details`).filter({ has: page.locator("summary", { hasText: "Earlier revisions" }) });
    await revisions.locator(":scope > summary").focus();
    await page.keyboard.press("Enter");
    expect(await revisions.innerText()).toContain("A reader loses an answer.");
    const demo = page.locator(`#${seeded.refs.demo}`);
    await demo.getByRole("button", { name: "Add item", exact: true }).click();
    expect(await demo.locator("strong").innerText()).toBe("Full");
    expect(await demo.getByRole("button", { name: "Add item", exact: true }).getAttribute("aria-disabled")).toBe("true");
    const iframe = page.locator(`#${seeded.refs.artifact} iframe`);
    expect(new URL((await iframe.getAttribute("src"))!).origin).not.toBe(new URL(opened.live.url).origin);
    expect(await iframe.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin");
    await page.frameLocator(`#${seeded.refs.artifact} iframe`).getByRole("button", { name: "Try prototype" }).click();
    expect(await page.frameLocator(`#${seeded.refs.artifact} iframe`).getByRole("button", { name: "Prototype works" }).isVisible()).toBe(true);
    const quiz = page.locator(`#${seeded.refs.quiz}`);
    await page.route("**/learning", (route) => route.request().method() === "POST" ? route.abort() : route.continue());
    await quiz.getByLabel("A real ask", { exact: true }).check();
    await quiz.locator('form[data-question="authority"]').getByRole("button", { name: "Check answer" }).click();
    await quiz.getByRole("spinbutton").fill("5");
    await quiz.getByRole("spinbutton").press("Enter");
    await quiz.getByRole("textbox").fill("Flow");
    await quiz.getByRole("textbox").press("Enter");
    await page.waitForFunction((id) => document.getElementById(id)!.textContent!.includes("3 attempt(s) saved"), seeded.refs.quiz);
    expect(await quiz.innerText()).toContain("Lesson complete.");
    await page.reload();
    await quiz.waitFor();
    expect(await quiz.innerText()).toContain("Lesson complete.");
    expect(await demo.locator("strong").innerText()).toBe("Full");
    await page.unroute("**/learning");
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.waitForFunction((id) => document.getElementById(id)!.textContent!.includes("Progress saved with the Flow."), seeded.refs.quiz);
    cli(["host", "stop"]);
    const resumed = cli(["show", "--flow", opened.flow]);
    await page.reload();
    await quiz.waitFor();
    expect(await quiz.innerText()).toContain("Lesson complete.");
    expect(resumed.revision).toBe(seeded.revision + 1);
    const fresh = await browser.newContext();
    try {
      const restored = await fresh.newPage();
      await restored.goto(`${opened.live.url}#${seeded.refs.quiz}`);
      await restored.waitForFunction((id) => document.getElementById(id)?.textContent?.includes("Lesson complete."), seeded.refs.quiz);
      expect(await restored.locator(`#${seeded.refs.quiz}`).innerText()).toContain("Attempts: 1.");
    } finally { await fresh.close(); }
    await demo.getByRole("button", { name: "Reset", exact: true }).click();
    expect(await demo.locator("strong").innerText()).toBe("Ready");
    for (const width of [320, 360, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      await capture(page, `dark-${width}`);
    }
    const stress = cli(["open", "--flow", opened.flow, "--skill", "code-review"]);
    const adverse = cli(["submit"], [
      { kind: "result", ref: "empty", shape: "review", title: "No findings", axes: [{ axis: "standards", status: "clean", reason: "No standards findings." }, { axis: "spec", status: "skipped", reason: "No acceptance changes." }, { axis: "blast-radius", status: "unavailable", reason: "No external caller." }], entries: [] },
      { kind: "result", ref: "large", shape: "table", title: "Long source paths", columns: ["Source", "Status"], rows: Array.from({ length: 1000 }, (_, i) => ({ ref: `row-${i}`, cells: [`reader/app/components/recorded-review-of-reconnection-and-durable-learning-progress-${i}.vue`, i % 2 ? "Covered" : "Not yet measured"] })) },
    ]);
    await page.goto(`${opened.live.url}#${stress.stage}`);
    await page.locator(`#${adverse.refs.large} tbody tr`).nth(999).waitFor({ state: "attached" });
    expect(await page.locator(`#${adverse.refs.large} tbody tr`).count()).toBe(1000);
    expect(await page.locator(`#${adverse.refs.empty}`).innerText()).toContain("No finding recorded");
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    }
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await browser.close();
    cli(["host", "stop"]);
    rmSync(root, { recursive: true, force: true });
  }
}, 120_000);

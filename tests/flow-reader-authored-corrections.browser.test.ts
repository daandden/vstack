import { expect, test } from "bun:test";
import { decisionBrief } from "./support/decision-brief.ts";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { ENV } from "./support/fixture.ts";

const script = join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts");
const topic = (ref: string) => ({ kind: "topic", ref, title: ref, summary: "The source remains available", body: "No permission is implied by this note.", sources: ["Local evidence"] });
const background = (ref: string) => ({ kind: "background", ref, title: ref, summary: "The source remains uncertain", sections: [{ heading: "Evidence", body: "Keep the original record." }], sources: ["Local evidence"] });

test("authored corrections show current non-consent, retained raw words, historical summaries, and reciprocal links for every target kind", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "reader-authored-corrections-")));
  const home = join(root, "home");
  mkdirSync(home);
  const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = socket.port;
  socket.stop(true);
  function cli(args: string[], items?: object[]) {
    const child = Bun.spawnSync(["bun", script, ...args, "--home", home, "--session", "01a1cb40-9b3e-7780-ba29-caea28094b57", "--agent", "Impl466"], {
      cwd: root, env: { ...ENV, HOME: join(root, "default-home"), VSTACK_FLOW_PORT: String(port) },
      stdin: items ? new TextEncoder().encode(JSON.stringify({ version: 1, items })) : "ignore", stdout: "pipe", stderr: "pipe",
    });
    if (child.exitCode !== 0) throw new Error(child.stderr.toString());
    return JSON.parse(child.stdout.toString()) as { flow: string; stage: string; refs: Record<string, string>; live: { url: string } };
  }
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const opened = cli(["open", "--title", "Uncertain answer correction", "--skill", "research"]);
    const first = cli(["submit"], [background("original-background"), topic("original-topic"), { kind: "assumed", ref: "original-assumption", decision: "Keep `captured evidence` for review", pick: "Keep default", why: "Not a user answer" }, { kind: "round", now: "The team has not confirmed whether the shaft is technical.", questions: [{ ref: "permission", title: "May work proceed?", brief: decisionBrief("whether work can proceed"), description: "Is the shaft technical? Evidence is incomplete.", needs: [{ need: "Review uncertainty", kind: "prose" }], options: [{ label: "Proceed", does: "Starts work", gains: ["Progress"], costs: ["Premature action"] }, { label: "Wait", does: "Defers work", gains: ["Evidence first"], costs: ["Delay"] }] }] }]);
    const q = first.refs.permission;
    const close = cli(["submit"], [{ kind: "answer", question: q, response: { status: "answered", text: "possibly a technical shaft, not sure <script>alert(1)</script> &amp;" }, reading: { outcome: "resolved", decision: "Proceed with work", basis: "Misread uncertainty", maps_to: "A" } }, { kind: "close", ref: "original-summary", decisions: [{ question: q, text: "Work is authorized" }] }, { kind: "stage", state: "finished" }]);
    cli(["open", "--flow", opened.flow, "--skill", "implement"]);
    const reason = "The original account inferred permission from uncertainty. ".repeat(12) + "https://example.com/workspaces/review/evidence/9f8e7d6c5b4a <script>alert(1)</script>";
    const targets = [first.refs["original-background"], first.refs["original-topic"], `${q}/context`, first.refs["original-assumption"], `${close.refs["original-summary"]}/${q}`, `${q}/reading`];
    const replacements = ["new-background", "new-topic", "new-context/claim", "new-assumption", `new-summary/${q}`, "withdrawal"];
    const names = ["original-background", "original-topic", "Context for Q1", "Assumed: Keep captured evidence for review", "Summary decision for Q1", "Answer reading for Q1"];
    const sent = cli(["submit"], [background("new-background"), topic("new-topic"), { kind: "result", ref: "new-context", shape: "cards", title: "Corrected context", entries: [{ ref: "claim", title: "Replacement evidence", label: "Finding", blocking: false, impact: "No permission established", action: "Ask again", evidence: "The source remains uncertain." }] }, { kind: "assumed", ref: "new-assumption", decision: "Keep `reversible defaults` for review", pick: "Use another default", why: "Still not a user answer" }, { kind: "close", ref: "new-summary", decisions: [{ question: q, text: "The summary did not establish permission" }] }, { kind: "reading", ref: "withdrawal", question: q, reading: { outcome: "ambiguous", unresolved: "The uncertain source did not authorize work. Ask again if needed." } }, ...targets.map((target, i) => ({ kind: "corrects", target, replacement: replacements[i], reason }))]);
    const replacementNames = ["new-background", "new-topic", `Corrected context, entry ${sent.refs["new-context/claim"]!.split("/")[1]}`, "Assumed: Keep reversible defaults for review", "Summary decision for Q1", "Answer reading for Q1"];
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const response = await page.goto(`${opened.live.url}#overview`);
    expect(response!.status(), await response!.text()).toBe(200);
    await page.getByRole("region", { name: "Overview", exact: true }).getByText("All Stages", { exact: true }).click();
    await page.locator("#overview-stages").waitFor();
    expect(await page.locator("#overview-stages").innerText()).toContain("Unresolved after correction");
    expect(await page.locator("#overview-stages").innerText()).not.toContain("Proceed with work");
    for (const [i, target] of targets.entries()) {
      const anchor = target.replace("/", "-");
      await page.goto(`${opened.live.url}#${anchor}`);
      const original = page.locator(`#${anchor}`);
      await original.waitFor();
      const warning = original.getByRole("complementary", { name: "Correction notice", exact: true }).first();
      expect(await warning.isVisible()).toBe(true);
      expect(await warning.innerText()).toContain(reason);
      const forward = warning.getByRole("link", { name: /^Corrected by/ });
      expect(await forward.innerText()).toBe(`Corrected by ${replacementNames[i]}, revision 1`);
      expect(await forward.innerText()).not.toContain("`");
      if (i === 3) expect(await forward.locator("code").allInnerTexts()).toEqual(["reversible defaults"]);
      await forward.click();
      const replacement = (i === 4 ? `${sent.refs["new-summary"]}/${q}` : sent.refs[replacements[i]]!).replace("/", "-");
      expect(new URL(page.url()).hash).toBe(`#${replacement}`);
      const back = page.locator(`#${replacement}`).getByRole("complementary", { name: "Corrects earlier content", exact: true }).locator(`a[href="#${anchor}"]`);
      if (i === 3) {
        expect(await back.innerText()).not.toContain("`");
        expect(await back.locator("code").allInnerTexts()).toEqual(["captured evidence"]);
      }
      expect(await back.innerText()).toBe(names[i]);
      await back.click();
      expect(new URL(page.url()).hash).toBe(`#${anchor}`);
    }
    await page.goto(`${opened.live.url}#${q}`);
    expect(await page.locator(`#${q} .answer`).innerText()).toContain("possibly a technical shaft, not sure <script>alert(1)</script> &amp;");
    expect(await page.locator(`#${q} .answer`).innerText()).toContain("Still to ask");
    expect(await page.locator(`#${q} [data-picked]`).count()).toBe(0);
    await page.getByText("Original agent reading, no longer current", { exact: true }).click();
    expect(await page.locator(`#${q}-reading`).innerText()).toContain("Proceed with work");
    await page.goto(`${opened.live.url}#${close.refs["original-summary"]}`);
    const summary = page.locator(`#${close.refs["original-summary"]}`);
    expect(await summary.innerText()).toContain("historical summary affected by Correction");
    expect(await summary.innerText()).toContain("The uncertain source did not authorize work");
    expect(await summary.innerText()).toContain("Work is authorized");
    for (const theme of ["Light", "Dark"]) {
      await page.getByRole("button", { name: theme, exact: true }).click();
      for (const width of [320, 1280, 2560]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${opened.live.url}#${q}`);
        expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth - globalThis.document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        const proof = process.env.FLOW_READER_EVIDENCE;
        if (proof) {
          mkdirSync(proof, { recursive: true });
          await page.screenshot({ path: join(proof, `authored-corrections-${theme.toLowerCase()}-${width}.png`), fullPage: true });
          writeFileSync(join(proof, `authored-corrections-${theme.toLowerCase()}-${width}.aria.txt`), await page.locator("body").ariaSnapshot());
        }
      }
    }
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => { globalThis.document.documentElement.style.fontSize = "200%"; });
    expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth - globalThis.document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await browser.close();
    cli(["host", "stop"]);
    rmSync(root, { recursive: true, force: true });
  }
}, 120_000);

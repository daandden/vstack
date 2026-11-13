import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { ENV } from "./support/fixture.ts";

const script = join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts");
const report = (ref: string, title: string) => ({ kind: "result", shape: "document", ref, title, sections: [{ heading: "Evidence", blocks: [{ prose: "The stored source remains readable." }] }] });

test("corrected Results and every entry shape show warnings before original text with reciprocal and current-head navigation", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-reader-corrections-")));
  const home = join(root, "home");
  mkdirSync(home);
  const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = socket.port;
  socket.stop(true);
  function cli(args: string[], items?: object[]) {
    const p = Bun.spawnSync(["bun", script, ...args, "--home", home, "--session", "01a1cb0a-6de6-7226-b03b-92a07bf9e558", "--agent", "Impl465"], {
      cwd: root, env: { ...ENV, HOME: join(root, "default-home"), VSTACK_FLOW_PORT: String(port) },
      stdin: items ? new TextEncoder().encode(JSON.stringify({ version: 1, items })) : "ignore", stdout: "pipe", stderr: "pipe",
    });
    if (p.exitCode !== 0) throw new Error(p.stderr.toString());
    return JSON.parse(p.stdout.toString()) as { flow: string; stage: string; refs: Record<string, string>; live: { url: string } };
  }
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const opened = cli(["open", "--title", "Correction navigation fixture", "--skill", "research"]);
    const card = { ref: "claim", title: "Original claim", label: "Finding", blocking: false, impact: "Original impact", action: "Read the source", evidence: "Raw evidence remains." };
    const first = cli(["submit"], [
      report("document", "Original report"),
      { kind: "result", ref: "cards", shape: "cards", title: "Cards", entries: [card] },
      { kind: "result", ref: "review", shape: "review", title: "Review", axes: [{ axis: "standards", status: "findings" }, { axis: "spec", status: "clean", reason: "Local proof." }, { axis: "blast-radius", status: "clean", reason: "No additional callers." }], entries: [{ ...card, axis: "standards", location: "source.ts:1" }] },
      { kind: "result", ref: "ledger", shape: "ledger", title: "Ledger", entries: [{ ref: "claim", claim: "Original ledger claim", status: "unproven", evidence: "Raw source", missing_proof: "No measured sample", consequence: "Keep unresolved" }] },
      { kind: "result", ref: "table", shape: "table", title: "Table", columns: ["Claim"], rows: [{ ref: "claim", cells: ["Original table claim"] }] },
      { kind: "result", ref: "code", shape: "code", title: "Code", entries: [{ ref: "claim", file: "source.ts", code: "const original = true;\n", language: "ts" }] },
      { kind: "result", ref: "timeline", shape: "timeline", title: "Timeline", entries: [{ ref: "claim", title: "Original timeline claim", outcome: "noted" }] },
      { kind: "stage", state: "finished" },
    ]);
    cli(["open", "--flow", opened.flow, "--skill", "implement"]);
    const targets = ["document", "cards/claim", "review/claim", "ledger/claim", "table/claim", "code/claim", "timeline/claim"];
    const reason = "Withdraw the earlier conclusion because the source did not establish permission. ".repeat(12) + "<script>alert(1)</script> &amp; https://example.com/workspaces/review/evidence/9f8e7d6c5b4a";
    const sent = cli(["submit"], [
      ...targets.map((_, i) => report(`correction-${i}`, `Correction ${i + 1}`)),
      ...targets.map((target, i) => ({ kind: "corrects", target: first.refs[target], replacement: `correction-${i}`, reason })),
    ]);
    cli(["submit"], [{ ...report("revised", "Edited correction"), revises: sent.refs["correction-0"] }, { kind: "stage", state: "finished" }]);
    cli(["open", "--flow", opened.flow, "--skill", "code-review"]);
    const last = cli(["submit"], [report("final", "Current correction"), { kind: "corrects", target: sent.refs["correction-0"], replacement: "final", reason: "The final sample changes the conclusion." }]);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    for (const [i, target] of targets.entries()) {
      const anchor = first.refs[target].replace("/", "-");
      await page.goto(`${opened.live.url}#${anchor}`);
      const original = page.locator(`#${anchor}`);
      await original.waitFor();
      const warning = original.getByRole("complementary", { name: "Correction notice", exact: true }).first();
      expect(await warning.isVisible()).toBe(true);
      expect(await warning.innerText()).toContain(reason);
      const relation = warning.getByRole("link", { name: `Corrected by Correction ${i + 1}, revision 1`, exact: true });
      await relation.focus();
      await page.keyboard.press("Enter");
      const replacementAnchor = `${sent.refs[`correction-${i}`]}${i === 0 ? "-r1" : ""}`;
      expect(new URL(page.url()).hash).toBe(`#${replacementAnchor}`);
      const replacement = page.locator(`#${replacementAnchor}`);
      expect(await replacement.isVisible()).toBe(true);
      const titles = ["Original report", "Cards", "Review", "Ledger", "Table", "Code", "Timeline"];
      const named = i === 0 ? titles[0]! : `${titles[i]}, entry ${first.refs[target]!.split("/")[1]}`;
      const back = replacement.getByRole("complementary", { name: "Corrects earlier content", exact: true }).getByRole("link", { name: named, exact: true });
      await back.click();
      expect(new URL(page.url()).hash).toBe(`#${anchor}`);
      expect(await warning.evaluate(el => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(await page.locator(".bar").evaluate(el => el.getBoundingClientRect().bottom) - 1);
      expect(await original.evaluate(el => getComputedStyle(el).opacity)).toBe("1");
      if (i === 0) {
        await warning.getByRole("link", { name: "Current correction", exact: true }).click();
        expect(new URL(page.url()).hash).toBe(`#${last.refs.final}`);
      }
    }
    for (const theme of ["Light", "Dark"]) {
      await page.getByRole("button", { name: theme, exact: true }).click();
      for (const width of [320, 1280, 2560]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${opened.live.url}#${first.refs.document}`);
        const warning = page.locator(`#${first.refs.document}`).getByRole("complementary", { name: "Correction notice", exact: true }).first();
        await warning.waitFor();
        expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth - globalThis.document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        const colors = await warning.evaluate(el => ({ border: getComputedStyle(el).borderInlineStartColor, background: getComputedStyle(el).backgroundColor }));
        expect(colors.border).not.toBe("rgba(0, 0, 0, 0)");
        expect(colors.background).not.toBe("rgba(0, 0, 0, 0)");
        const proof = process.env.FLOW_READER_EVIDENCE;
        if (proof) {
          mkdirSync(proof, { recursive: true });
          await page.screenshot({ path: join(proof, `corrections-${theme.toLowerCase()}-${width}.png`), fullPage: true });
          writeFileSync(join(proof, `corrections-${theme.toLowerCase()}-${width}.aria.txt`), await page.locator("body").ariaSnapshot());
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

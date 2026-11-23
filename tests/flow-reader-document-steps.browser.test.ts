import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { ENV } from "./support/fixture.ts";
import { stagesButton } from "./support/reader-layout.ts";

const SCRIPT = join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts");

test("Documents show numbered joined steps with ordinary formatting and retain existing blocks", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-reader-steps-")));
  const home = join(root, "home");
  mkdirSync(home);
  const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = socket.port;
  socket.stop(true);
  function cli(args: string[], items?: unknown[]): any {
    const p = Bun.spawnSync([process.execPath, SCRIPT, ...args, "--home", home, "--session", "01a1c2c0-b8bd-7047-ac1f-33e7ca3c40d6", "--agent", "review-fix-428"], {
      cwd: root, env: { ...ENV, HOME: join(root, "default-home"), VSTACK_FLOW_PORT: String(port) },
      stdin: items ? new TextEncoder().encode(JSON.stringify({ version: 1, items })) : "ignore", stdout: "pipe", stderr: "pipe",
    });
    if (p.exitCode !== 0) throw new Error(`flow-page ${args.join(" ")}: ${p.stdout} ${p.stderr}`);
    return JSON.parse(p.stdout.toString());
  }
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light" });
  try {
    const opened = cli(["open", "--skill", "implement", "--title", "Document walkthrough"]);
    const seeded = cli(["submit"], [
      { kind: "result", ref: "runbook", shape: "document", title: "Recovery runbook", sections: [{ heading: "Restore service", blocks: [{ prose: "Before the procedure." }, { steps: [
        { title: "Inspect `service`", text: "Run `service status` and read [the runbook](https://example.com/runbook)." },
        { title: "Restore service", text: "Restart the worker [@manual].\n\nConfirm that requests succeed." },
      ] }] }], citations: [{ ref: "manual", source: "operations.md:12" }] },
      { kind: "result", ref: "single", shape: "document", title: "One step", sections: [{ heading: "A single action", blocks: [{ steps: [{ title: "Confirm the worker has recovered and all queued customer requests have completed", text: "Read `operations/worker/recovery/confirm-all-queued-customer-requests-completed-without-retries` and [the recovery instructions](https://example.com/recovery)." }] }] }] },
      { kind: "result", ref: "legacy", shape: "document", title: "Existing document", sections: [{ heading: "Notes", blocks: [{ prose: "Existing `text` and [link](https://example.com)." }, { list: ["Keep the worker", "Read the log"], ordered: true }, { code: "const saved = true;", language: "ts" }] }] },
    ]);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(`${opened.live.url}#${seeded.refs.runbook}`);
    const procedure = page.locator(`#${seeded.refs.runbook}`).getByRole("list", { name: "Procedure steps", exact: true });
    await procedure.waitFor();
    const steps = procedure.getByRole("listitem");
    expect(await steps.count()).toBe(2);
    expect(await steps.nth(0).innerText()).toMatch(/^1\s+Inspect service/);
    expect(await steps.nth(1).innerText()).toMatch(/^2\s+Restore service/);
    expect(await steps.nth(0).locator("code").allTextContents()).toEqual(["service", "service status"]);
    expect(await steps.nth(0).getByRole("link", { name: "the runbook" }).getAttribute("href")).toBe("https://example.com/runbook");
    expect(await steps.nth(1).locator("p").allTextContents()).toEqual(["Restart the worker [1].", "Confirm that requests succeed."]);
    const marker = (index: number) => steps.nth(index).getByText(String(index + 1), { exact: true });
    const firstMarker = (await marker(0).boundingBox())!;
    const nextMarker = (await marker(1).boundingBox())!;
    const connector = steps.nth(0).locator('[aria-hidden="true"]');
    expect(await connector.count()).toBe(1);
    const joint = (await connector.boundingBox())!;
    expect(await connector.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
    expect(joint.width).toBe(1);
    expect(joint.height).toBeGreaterThan(0);
    expect(joint.y).toBeCloseTo(firstMarker.y + firstMarker.height);
    expect(joint.y + joint.height).toBeCloseTo(nextMarker.y);
    expect(joint.x + joint.width / 2).toBeCloseTo(firstMarker.x + firstMarker.width / 2, 0);
    expect(nextMarker.x + nextMarker.width / 2).toBeCloseTo(firstMarker.x + firstMarker.width / 2);
    expect(await steps.nth(1).locator('[aria-hidden="true"]').count()).toBe(0);
    expect(await steps.nth(1).getByRole("link", { name: "Citation 1" }).count()).toBe(1);
    expect(await page.locator(`#${seeded.refs.runbook}`).getByRole("link", { name: "Cited in Restore service" }).count()).toBe(1);
    const legacy = page.locator(`#${seeded.refs.legacy}`);
    expect(await legacy.locator("p code").textContent()).toBe("text");
    expect(await legacy.locator("li").allTextContents()).toEqual(["Keep the worker", "Read the log"]);
    expect(await legacy.locator("pre").textContent()).toBe("const saved = true;");
    expect(await legacy.locator("ol").evaluate(el => getComputedStyle(el).listStyleType)).toBe("decimal");
    expect(await page.getByRole("region", { name: "Citations", exact: true }).locator("ol").evaluate(el => getComputedStyle(el).listStyleType)).toBe("decimal");
    await stagesButton(page).click();
    const stages = page.getByRole("tabpanel", { name: "Stages", exact: true });
    expect(await stages.getByText("In progress · 0 open", { exact: true }).isVisible()).toBe(true);
    await page.keyboard.press("Escape");
    await stages.waitFor({ state: "hidden" });
    const proof = process.env.FLOW_READER_EVIDENCE;
    for (const theme of ["Light", "Dark"]) {
      await page.getByRole("button", { name: theme, exact: true }).click();
      for (const width of [320, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        if (proof) {
          mkdirSync(proof, { recursive: true });
          await page.screenshot({ path: join(proof, `steps-${theme.toLowerCase()}-${width}.png`), fullPage: true });
          writeFileSync(join(proof, `steps-${theme.toLowerCase()}-${width}.aria.txt`), await page.locator("body").ariaSnapshot());
          if (width === 1280) await procedure.screenshot({ path: join(proof, `procedure-${theme.toLowerCase()}.png`) });
        }
      }
    }
    await page.reload();
    await procedure.waitFor();
    expect(await steps.count()).toBe(2);
    expect(await page.locator(`#${seeded.refs.single}`).getByRole("listitem").count()).toBe(1);
    expect(await page.locator(`#${seeded.refs.single}`).getByRole("listitem").locator('[aria-hidden="true"]').count()).toBe(0);
    const large = cli(["submit"], [{ kind: "result", ref: "large", shape: "document", title: "Long recovery procedure", sections: [{ heading: "Restore partitions", blocks: [{ steps: Array.from({ length: 1000 }, (_, i) => ({ title: `Restore partition ${i + 1}`, text: "Confirm the partition is healthy." })) }] }] }]);
    await page.goto(`${opened.live.url}#${large.refs.large}`);
    const largeSteps = page.locator(`#${large.refs.large}`).getByRole("listitem");
    await largeSteps.nth(999).waitFor({ state: "attached" });
    expect(await largeSteps.count()).toBe(1000);
    expect(await largeSteps.nth(999).innerText()).toContain("1000");
    const early = (await largeSteps.nth(0).getByText("1", { exact: true }).boundingBox())!;
    const late = (await largeSteps.nth(999).getByText("1000", { exact: true }).boundingBox())!;
    expect(early.x + early.width / 2).toBeCloseTo(late.x + late.width / 2);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await browser.close();
    cli(["host", "stop"]);
    rmSync(root, { recursive: true, force: true });
  }
}, 120_000);

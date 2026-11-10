import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { ENV } from "./support/fixture.ts";

const script = join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts");
const proof = process.env.FLOW_READER_EVIDENCE;

test("Metrics charts show exact data, baseline identity, keyboard values and live theme colors under the host CSP", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "reader-metrics-")));
  const home = join(root, "home");
  mkdirSync(home);
  const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = socket.port;
  socket.stop(true);
  const cli = (args: string[], items?: unknown[]) => {
    const p = Bun.spawnSync([process.execPath, script, ...args, "--home", home, "--session", "01a1c2c0-b8bd-7047-ac1f-33e7ca3c40d6", "--agent", "review-fix-428"], {
      cwd: root, env: { ...ENV, HOME: home, VSTACK_FLOW_PORT: String(port) }, stdin: items ? new TextEncoder().encode(JSON.stringify({ version: 1, items })) : "ignore", stdout: "pipe", stderr: "pipe",
    });
    if (p.exitCode) throw new Error(p.stderr.toString());
    return JSON.parse(p.stdout.toString());
  };
  const browser = await chromium.launch({ headless: true });
  try {
    const opened = cli(["open", "--skill", "implement", "--title", "Metrics charts"]);
    const seeded = cli(["submit"], [{
      kind: "result", ref: "metrics", shape: "metrics", title: "Measured charts", workload: "Local benchmark", outcome: "Reported only",
      series: [{ ref: "main", label: "Main", baseline: true }, { ref: "branch", label: "Branch" }],
      measurements: [
        { ref: "trend", name: "Latency trend", unit: "ms", better: "lower", verdict: "better", chart: "line", values: [{ series: "main", value: 12, points: [{ x: 1, y: 10 }, { x: 2, y: 12 }], uncertainty: { plusminus: 1, of: "95% CI" } }, { series: "branch", value: 9, points: [{ x: 1, y: 8 }, { x: 2, y: 9 }] }] },
        { ref: "relation", name: "Memory relation", unit: "MB", chart: "scatter", values: [{ series: "main", points: [{ x: -2, y: 3 }] }, { series: "branch", points: [{ x: 2, y: 6 }] }] },
        { ref: "distribution", name: "Latency distribution", unit: "ms", chart: "histogram", values: [{ series: "main", samples: [1, 1, 2, 3] }, { series: "branch", samples: [2, 3, 4] }] },
        { ref: "scalar", name: "Scalar latency", unit: "ms", values: [{ series: "main", value: 10 }, { series: "branch", value: 8 }] },
      ],
    }]);
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light" });
    const page = await context.newPage();
    const errors: string[] = [], external: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("request", r => { if (new URL(r.url()).origin !== new URL(opened.live.url).origin) external.push(r.url()); });
    await page.addInitScript(() => {
      (window as any).cspViolations = [];
      document.addEventListener("securitypolicyviolation", e => (window as any).cspViolations.push(`${e.violatedDirective}: ${e.blockedURI}`));
    });
    await page.goto(`${opened.live.url}#${seeded.refs.metrics}`);
    const result = page.locator(`#${seeded.refs.metrics}`);
    const charts = result.locator('[aria-roledescription="chart"]');
    await charts.nth(2).waitFor();
    expect(await charts.count()).toBe(3);
    expect(await result.getByRole("table", { name: "Latency trend chart data" }).innerText()).toContain("10");
    expect(await result.getByRole("table", { name: "Memory relation chart data" }).innerText()).toContain("-2");
    const samples = result.getByRole("table", { name: "Latency distribution chart data" });
    expect(await samples.locator("tbody tr").count()).toBe(7);
    expect(await result.innerText()).toContain("Main (baseline)");
    expect(await result.innerText()).toContain("95% CI");
    expect(await result.innerText()).toContain("-3 ms");
    expect(await result.innerText()).toContain("-2 ms");
    expect(await charts.nth(0).locator('path[stroke-dasharray="5 3"]').count()).toBeGreaterThan(0);
    expect(await charts.nth(1).locator("circle").count()).toBeGreaterThan(0);
    expect(await charts.nth(2).locator("rect").count()).toBeGreaterThan(0);
    for (let i = 0; i < 3; i++) {
      await charts.nth(i).focus();
      await page.keyboard.press("Home");
      const status = result.locator('[role="status"]').nth(i);
      await page.waitForFunction(el => !!el?.textContent?.includes("Main"), await status.elementHandle());
      expect(await status.innerText()).toContain("baseline");
      let reachedBranch = false;
      for (let next = 0; next < 20 && !reachedBranch; next++) {
        await page.keyboard.press("ArrowRight");
        reachedBranch = (await status.innerText()).includes("Branch");
      }
      expect(reachedBranch).toBe(true);
      await page.keyboard.press("End");
      expect(await status.innerText()).toMatch(/(Main|Branch).*(ms|MB)/);
    }
    const color = () => charts.nth(1).locator("circle").first().evaluate(el => getComputedStyle(el).fill);
    let previousColor = "";
    for (const theme of ["Light", "Dark"]) {
      await page.getByRole("button", { name: theme, exact: true }).click();
      const current = await color();
      if (previousColor) expect(current).not.toBe(previousColor);
      previousColor = current;
      for (const width of [360, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
        expect((await charts.first().boundingBox())!.width).toBeLessThanOrEqual(width);
        if (proof) {
          mkdirSync(proof, { recursive: true });
          await result.screenshot({ path: join(proof, `${theme.toLowerCase()}-${width}-metrics.png`) });
          writeFileSync(join(proof, `${theme.toLowerCase()}-${width}-metrics.aria.txt`), await result.ariaSnapshot());
        }
      }
    }
    expect(await page.evaluate(() => (window as any).cspViolations)).toEqual([]);
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
    cli(["submit"], [{
      kind: "result", revises: seeded.refs.metrics, shape: "metrics", title: "Boundary measurements", workload: "One and one thousand observations", outcome: "Boundary proof only",
      series: [{ ref: "main", label: "Main with a long benchmark configuration name and <script>literal text</script>", baseline: true }],
      measurements: [
        { ref: "large", name: "One thousand timing observations", unit: "ms", chart: "line", values: [{ series: "main", points: Array.from({ length: 1000 }, (_, x) => ({ x, y: x % 9 - 4 })) }] },
        { ref: "single", name: "One histogram sample", unit: "ms", chart: "histogram", values: [{ series: "main", samples: [0] }] },
        { ref: "large-value", name: "Large numeric values", unit: "bytes", chart: "scatter", values: [{ series: "main", points: [{ x: -1000000, y: 1000000000 }] }] },
      ],
    }]);
    await page.waitForFunction(id => document.getElementById(id)?.textContent?.includes("Boundary measurements"), seeded.refs.metrics);
    const largeTable = result.getByRole("table", { name: "One thousand timing observations chart data", exact: true }).first();
    expect(await largeTable.locator("tbody tr").count()).toBe(1000);
    expect(await result.getByRole("table", { name: "One histogram sample chart data" }).first().locator("tbody tr").count()).toBe(1);
    const singleHistogram = result.locator('[aria-roledescription="chart"]').nth(1);
    await singleHistogram.focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");
    expect(await result.getByRole("status").allTextContents()).toContainEqual(expect.stringMatching(/, 1 sample$/));
    expect(await result.locator("script").count()).toBe(0);
    for (const theme of ["Light", "Dark"]) {
      await page.getByRole("button", { name: theme, exact: true }).click();
      for (const width of [320, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      }
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => (window as any).cspViolations)).toEqual([]);
    await context.close();
  } finally {
    await browser.close();
    cli(["host", "stop"]);
    rmSync(root, { recursive: true, force: true });
  }
}, 120_000);

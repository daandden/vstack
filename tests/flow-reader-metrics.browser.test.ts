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
      cwd: root, env: { ...ENV, HOME: join(root, "default-home"), VSTACK_FLOW_PORT: String(port) }, stdin: items ? new TextEncoder().encode(JSON.stringify({ version: 1, items })) : "ignore", stdout: "pipe", stderr: "pipe",
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
    const response = await page.goto(`${opened.live.url}#${seeded.refs.metrics}`);
    const html = await response!.text();
    expect(html).toContain("Latency trend chart data</caption>");
    expect(html).not.toContain('aria-roledescription="chart"');
    const result = page.locator(`#${seeded.refs.metrics}`);
    const charts = result.locator('[aria-roledescription="chart"]');
    await charts.nth(2).waitFor({ timeout: 5_000 }).catch(error => {
      throw new Error(`Metrics plots did not mount. Browser errors: ${errors.join("; ")}`, { cause: error });
    });
    expect(await charts.count()).toBe(3);
    expect(await result.getByRole("table", { name: "Latency trend chart data" }).innerText()).toContain("10");
    expect(await result.getByRole("table", { name: "Memory relation chart data" }).innerText()).toContain("-2");
    const samples = result.getByRole("table", { name: "Latency distribution chart data" });
    expect(await samples.locator("tbody tr").count()).toBe(7);
    const captionPositions = await Promise.all(["Latency trend", "Memory relation", "Latency distribution"].map(async name => {
      const table = result.getByRole("table", { name: `${name} chart data`, exact: true });
      const aboveHeader = await table.evaluate((el: HTMLTableElement) => {
        const caption = el.caption!.getBoundingClientRect();
        const header = el.tHead!.getBoundingClientRect();
        return caption.height > 0 && header.height > 0 && caption.bottom <= header.top;
      });
      return [name, aboveHeader];
    }));
    expect(captionPositions).toEqual([["Latency trend", true], ["Memory relation", true], ["Latency distribution", true]]);
    expect(await result.innerText()).toContain("Main (baseline)");
    expect(await result.innerText()).toContain("95% CI");
    expect(await result.innerText()).toContain("-3 ms");
    expect(await result.innerText()).toContain("-2 ms");
    const scalar = result.getByRole("region", { name: "Scalar latency (ms)" });
    const branchValue = scalar.getByRole("row", { name: /Branch/ }).getByRole("cell", { name: "8 ms" });
    const scalarBar = branchValue.locator("progress");
    expect(await scalarBar.count()).toBe(1);
    expect(await scalarBar.evaluate((bar: HTMLProgressElement) => ({ position: bar.position, width: bar.getBoundingClientRect().width })))
      .toEqual({ position: 0.8, width: 96 });
    expect(await scalar.getByRole("progressbar").count()).toBe(0);
    const baselinePaint = (chart: number) => charts.nth(chart).evaluate(el => {
      const base = getComputedStyle(document.body).backgroundColor;
      const seriesColor = getComputedStyle(el.closest("section")!.querySelector("li span")!).color;
      const paths = Array.from(el.querySelectorAll("path"));
      const dots = Array.from(el.querySelectorAll("circle, path")).filter(mark => {
        const { width, height } = mark.getBoundingClientRect();
        return width >= 4 && width <= 10 && Math.abs(width - height) < 0.1;
      });
      return {
        base,
        seriesColor,
        dashed: paths.some(path => {
          const paint = getComputedStyle(path);
          return paint.stroke === seriesColor && paint.strokeDasharray !== "none";
        }),
        outlined: dots.some(dot => {
          const paint = getComputedStyle(dot);
          return paint.fill === base && paint.stroke === seriesColor;
        }),
        filled: dots.some(dot => {
          const paint = getComputedStyle(dot);
          return paint.fill === paint.stroke && paint.fill !== "none";
        }),
      };
    });
    expect(await baselinePaint(0)).toMatchObject({ dashed: true, outlined: true });
    expect(await baselinePaint(1)).toMatchObject({ outlined: true, filled: true });
    const bars = () => charts.nth(2).locator("rect").evaluateAll(rects =>
      rects.filter(rect => getComputedStyle(rect).fillOpacity === "0.25" && rect.getBoundingClientRect().height > 0).length,
    );
    expect(await bars()).toBeGreaterThan(0);
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
    let previousColor = "";
    for (const theme of ["Light", "Dark"]) {
      await page.getByRole("button", { name: theme, exact: true }).click();
      const paint = await Promise.all([baselinePaint(0), baselinePaint(1)]);
      const current = paint[1].seriesColor;
      if (previousColor) expect(current).not.toBe(previousColor);
      expect(paint[0]).toMatchObject({ dashed: true, outlined: true });
      expect(paint[1]).toMatchObject({ outlined: true });
      expect(await result.getByRole("heading", { name: /Latency trend/ }).evaluate(el => getComputedStyle(el).color))
        .toBe(theme === "Light" ? "oklch(0.435 0.043 279.3)" : "oklch(0.879 0.043 272.3)");
      if (proof) {
        mkdirSync(proof, { recursive: true });
        writeFileSync(join(proof, `${theme.toLowerCase()}-chart-paint.json`), JSON.stringify(paint, null, 2));
      }
      previousColor = current;
      for (const width of [360, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        expect((await charts.first().boundingBox())!.width).toBeLessThanOrEqual(width);
        if (proof) {
          await result.screenshot({ path: join(proof, `${theme.toLowerCase()}-${width}-metrics.png`) });
          writeFileSync(join(proof, `${theme.toLowerCase()}-${width}-metrics.aria.txt`), await result.ariaSnapshot());
        }
      }
    }
    const exactValues = result.getByRole("table", { name: "Latency trend chart data" });
    const alignment = await exactValues.getByRole("row").nth(1).getByRole("cell").evaluateAll(cells =>
      cells.map(cell => getComputedStyle(cell).textAlign),
    );
    expect(alignment).toEqual(["start", "end", "end", "end"]);
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
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      }
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => (window as any).cspViolations)).toEqual([]);
    await context.close();
  } finally {
    await browser.close();
    cli(["host", "stop"]);
    rmSync(root, { recursive: true, force: true });
  }
}, 120_000);

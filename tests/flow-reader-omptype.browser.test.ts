import { expect, test } from "bun:test";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { chromium, type Response as BrowserResponse } from "playwright-core";
import { ENV } from "./support/fixture.ts";

const SOURCE = resolve(import.meta.dir, "..");
const PROBE = "Nested schema CSP proof";
const EVIDENCE = process.env.FLOW_READER_EVIDENCE;
const OMIT = new Set(["node_modules", ".nuxt", ".output", ".data", ".cache"]);
type Violation = { blockedURI: string; directive: string };

function policy(response: BrowserResponse | null) {
  expect(response?.status()).toBe(200);
  const full = response!.headers()["content-security-policy"]!;
  const scripts = full.split(";").map(directive => directive.trim()).find(directive => directive.startsWith("script-src "))!;
  expect(scripts).toMatch(/^script-src 'self'( 'sha256-[\w+/=]+')+$/);
  expect(full).not.toContain("'unsafe-eval'");
  return full;
}

function fixtureHost(root: string, kind: string, assets: string, server: string) {
  const home = join(root, kind);
  mkdirSync(home);
  const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = socket.port;
  socket.stop(true);
  function cli(args: string[]): { live: { url: string } } {
    const result = Bun.spawnSync([process.execPath, join(SOURCE, "plugin/skills/flow-page/scripts/flow-page.ts"), ...args,
      "--home", home, "--session", "01a1cb92-178d-7ee2-b573-dc5c8764fa9a", "--agent", "OmptypeProof"], {
      cwd: root, env: { ...ENV, HOME: join(root, "default-home"), VSTACK_FLOW_PORT: String(port), FLOW_READER_ASSETS: assets, FLOW_READER_SERVER: server },
      stdout: "pipe", stderr: "pipe",
    });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
    return JSON.parse(result.stdout.toString());
  }
  return { open: () => cli(["open", "--title", "Reader CSP proof", "--skill", "implement"]).live.url, stop: () => cli(["host", "stop"]) };
}

test("nested Standard Schema errors and parsed output survive omptype compilation under the Local Flow host CSP", async () => {
  const normalAssets = process.env.FLOW_READER_ASSETS!;
  const normalServer = process.env.FLOW_READER_SERVER!;
  expect(normalAssets).toBeTruthy();
  expect(normalServer).toBeTruthy();
  const normalFiles = [...new Bun.Glob("**/*").scanSync({ cwd: normalAssets, absolute: true }), normalServer];
  expect(normalFiles.some(file => readFileSync(file).includes(PROBE))).toBe(false);

  const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-reader-omptype-")));
  const candidate = join(root, "reader");
  try {
    cpSync(join(SOURCE, "reader"), candidate, { recursive: true, filter: path => !OMIT.has(basename(path)) });
    symlinkSync(join(SOURCE, "node_modules"), join(candidate, "node_modules"), "dir");
    copyFileSync(join(import.meta.dir, "fixtures/flow-reader-omptype/app.vue"), join(candidate, "app/app.vue"));
    const build = Bun.spawn([process.execPath, join(SOURCE, "reader/build.ts"), candidate], {
      env: { ...ENV, FLOW_READER_SOURCE_ROOT: SOURCE }, stdout: "pipe", stderr: "pipe",
    });
    const [status, stdout, stderr] = await Promise.all([build.exited, new Response(build.stdout).text(), new Response(build.stderr).text()]);
    if (EVIDENCE) {
      mkdirSync(EVIDENCE, { recursive: true });
      writeFileSync(join(EVIDENCE, "csp-proof-build.log"), `${stdout}\n${stderr}`);
    }
    if (status !== 0) throw new Error(`${stdout}\n${stderr}`);

    const normal = fixtureHost(root, "normal-home", normalAssets, normalServer);
    const probe = fixtureHost(root, "probe-home", join(candidate, ".output/public"), join(candidate, ".output/server/flow.mjs"));
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const normalPolicy = policy(await page.goto(normal.open()));
      await page.addInitScript(() => {
        const violations: Violation[] = [];
        Object.assign(window, { omptypeViolations: violations });
        window.addEventListener("securitypolicyviolation", event => {
          violations.push({ blockedURI: event.blockedURI, directive: event.effectiveDirective });
        });
      });
      const pageErrors: string[] = [];
      page.on("pageerror", error => pageErrors.push(error.message));
      const response = await page.goto(probe.open());
      const probePolicy = policy(response);
      const normalize = (value: string) => value.replaceAll(/ 'sha256-[\w+/=]+'/g, "").replaceAll(/http:\/\/127\.0\.0\.1:\d+/g, "http://127.0.0.1:PORT");
      expect(normalize(probePolicy)).toBe(normalize(normalPolicy));
      expect(await response!.text()).toContain(PROBE);
      await page.getByRole("heading", { name: PROBE, exact: true }).waitFor();
      const label = page.getByRole("textbox", { name: "Record label", exact: true });
      const count = page.getByRole("textbox", { name: "Sample count", exact: true });
      const validate = page.getByRole("button", { name: "Validate nested input", exact: true });
      const submitted: string[] = [];
      for (let round = 1; round <= 6; round++) {
        await label.fill(" ");
        await count.fill("about three");
        await validate.click();
        await page.getByText("record.label: Enter a record label.", { exact: true }).waitFor({ timeout: 5000 });
        await page.getByText("record.count: Enter a sample count.", { exact: true }).waitFor({ timeout: 5000 });
        expect(await page.getByRole("status").textContent()).toBe(submitted.at(-1) ?? "No submission");
        if (round === 6 && EVIDENCE) await page.screenshot({ path: join(EVIDENCE, "csp-nested-errors.png") });
        await label.fill(`  Fixture ${round}  `);
        await count.fill(`0${round}.0`);
        await count.press("Enter");
        const expected = `{"record":{"label":"Fixture ${round}","count":${round}}}`;
        await page.getByText(expected, { exact: true }).waitFor({ timeout: 5000 });
        submitted.push(expected);
        expect(await page.getByRole("alert").count()).toBe(0);
      }
      const violations = await page.evaluate(() => (window as Window & { omptypeViolations?: Violation[] }).omptypeViolations);
      expect(violations).toEqual([{ blockedURI: "eval", directive: "script-src" }]);
      expect(pageErrors).toEqual([]);
      if (EVIDENCE) writeFileSync(join(EVIDENCE, "csp-probe.json"), JSON.stringify({ normalPolicy, probePolicy, checkedNormalFiles: normalFiles.length, violations, pageErrors, submitted }, null, 2));
    } finally {
      await browser.close();
      try { probe.stop(); } finally { normal.stop(); }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 120_000);

import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { GatePhase } from "../scripts/lib/gate-report.ts";
import { lifecycleFixture } from "./support/update-lifecycle-fixture.ts";
import { ENV, git, writeFiles } from "./support/fixture.ts";

const fixtures: ReturnType<typeof lifecycleFixture>[] = [];
const fixture = () => { const f = lifecycleFixture(); fixtures.push(f); return f; };
afterEach(() => { for (const f of fixtures.splice(0)) rmSync(f.dir, { recursive: true, force: true }); });
const json = (file: string) => JSON.parse(readFileSync(file, "utf8"));
function commands(f: ReturnType<typeof fixture>) {
  const file = join(f.dir, "gate-command.ts");
  writeFileSync(file, `const stage = process.argv[2];
console.log(stage + " stdout"); console.error(stage + " stderr");
await Bun.sleep(20);
if (process.env.INTERRUPT_STAGE === stage) { process.kill(process.ppid, process.env.INTERRUPT_SIGNAL || "SIGTERM"); await Bun.sleep(10000); }
if (process.env.FAIL_STAGE === stage) process.exit(7);`);
  return Object.fromEntries(["validate", "check", "test", "smoke"].map(name => [name, [process.execPath, file, name]]));
}

 test("gate timings retain command failures, diagnostics and revision identity without skipping later phases", async () => {
  const f = fixture(), injected = commands(f);
  writeFiles(f.root, { "plugin/skills/wording/SKILL.md": "Changed text.\n" });
  for (const failure of ["", "validate", "check", "test", "smoke"]) {
    const result = await f.run(f.root, ["gates", "--scratch", join(f.dir, "scratch")], { VSTACK_MAINTAIN_COMMANDS: JSON.stringify(injected), FAIL_STAGE: failure });
    const report = JSON.parse(result.stdout);
    expect(result.code).toBe(failure ? 2 : 0);
    expect(report.outcome).toBe(failure ? "failed" : "passed");
    expect(report.stages.map((stage: GatePhase) => stage.name)).toEqual(["validate", "check", "test", "smoke"]);
    expect(report.identity.revision.head).toBe(git(f.root, "rev-parse", "HEAD"));
    expect(report.identity.revision.base).toBe(git(f.root, "rev-parse", "HEAD"));
    expect(report.identity.environment.bun).toBe(Bun.version);
    expect(report.identity.environment.environmentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(report.durationMs).toBeGreaterThanOrEqual(report.phaseOccupancyMs);
    for (const logical of report.stages) {
      expect(logical.durationMs).toBeGreaterThan(0);
      expect(Date.parse(logical.finishedAt)).toBeGreaterThanOrEqual(Date.parse(logical.startedAt));
      const phase = logical.name === "check" ? logical.phases[0] : logical;
      expect(phase.command).toEqual(logical.name === "validate" ? [...injected.validate, join(f.root, "plugin/skills/wording")] : logical.name === "smoke" ? [...injected.smoke, join(f.root, "plugin"), phase.command.at(-1)] : injected[logical.name]);
      expect(phase.exitCode).toBe(logical.name === failure ? 7 : 0);
      expect(phase.outcome).toBe(logical.name === failure ? "failed" : "passed");
      expect(phase.shadow?.mode).toBe("shadow");
      expect(phase.shadow?.predictedReuse).toBe(false);
      expect(phase.shadow?.reusablePass).toBe(false);
      expect(phase.shadow?.unknown).toContain("command override");
      expect(readFileSync(phase.stdout, "utf8")).toContain(`${logical.name} stdout`);
      expect(readFileSync(phase.stderr, "utf8")).toContain(`${logical.name} stderr`);
    }
    expect(json(report.evidence)).toEqual(report);
  }
}, 30000);

 test("gate timings preserve cache preparation failure before register checking", async () => {
  const f = fixture(), injected = commands(f);
  delete injected.check;
  const result = await f.run(f.root, ["gates", "--scratch", join(f.dir, "scratch"), "--remote", `file://${join(f.dir, "missing")}`], { VSTACK_MAINTAIN_COMMANDS: JSON.stringify(injected) });
  const report = JSON.parse(result.stdout);
  expect(result.code).toBe(2);
  expect(report.outcome).toBe("failed");
  const check = report.stages.find((stage: GatePhase) => stage.name === "check");
  expect(check.ok).toBe(false);
  expect(check.durationMs).toBeGreaterThanOrEqual(check.phases[0].durationMs);
  expect(check.phases.map((phase: GatePhase) => phase.name)).toEqual(["cache"]);
  expect(check.phases[0].outcome).toBe("failed");
  expect(check.phases[0].output).toContain("fetching");
  expect(report.stages.some((phase: GatePhase) => phase.name === "test")).toBe(false);
  expect(json(report.evidence)).toEqual(report);
}, 30000);

 test("gate timings retain interrupted process evidence and never complete later phases", async () => {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    const f = fixture(), injected = commands(f);
    const result = await f.run(f.root, ["gates", "--scratch", join(f.dir, "scratch")], { VSTACK_MAINTAIN_COMMANDS: JSON.stringify(injected), INTERRUPT_STAGE: "test", INTERRUPT_SIGNAL: signal });
    const report = JSON.parse(result.stdout);
    expect(result.code).toBe(2);
    expect(report.ok).toBe(false);
    expect(report.outcome).toBe("interrupted");
    const phase = report.stages.find((stage: GatePhase) => stage.name === "test");
    expect(phase.outcome).toBe("interrupted");
    expect(phase.signal).toBe(signal);
    expect(phase.output).toContain("test stdout");
    expect(phase.durationMs).toBeGreaterThan(0);
    expect(report.stages.some((stage: GatePhase) => stage.name === "smoke")).toBe(false);
    expect(json(report.evidence)).toEqual(report);
    expect(existsSync(phase.stdout)).toBe(true);
  }
}, 30000);

 test("gate timings retain reported test subphases and refuse partial proof despite a zero runner exit", async () => {
  const f = fixture(), injected = commands(f);
  const runner = join(f.dir, "test-runner.ts");
  writeFileSync(runner, `import { writeFileSync } from "node:fs";
const phases = [];
for (const name of ["non-browser", "candidate-reader-build", "browser:fixture"]) {
  const startedAt = new Date().toISOString(), start = performance.now();
  const command = [process.execPath, "-e", "await Bun.sleep(20)"];
  const child = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
  const exitCode = await child.exited;
  phases.push({ name, command, cwd: process.cwd(), startedAt, finishedAt: new Date().toISOString(), durationMs: performance.now() - start, outcome: name === "candidate-reader-build" ? process.env.READER_OUTCOME : "passed", exitCode });
  writeFileSync(process.env.VSTACK_GATE_PHASE_REPORT, JSON.stringify(phases));
}`);
  injected.test = [process.execPath, runner];
  for (const outcome of ["passed", "failed", "interrupted", "running"]) {
    const result = await f.run(f.root, ["gates", "--scratch", join(f.dir, "scratch")], { VSTACK_MAINTAIN_COMMANDS: JSON.stringify(injected), READER_OUTCOME: outcome });
    const report = JSON.parse(result.stdout);
    expect(result.code).toBe(outcome === "passed" ? 0 : 2);
    const phase = report.stages.find((stage: GatePhase) => stage.name === "test");
    expect(phase.exitCode).toBe(0);
    expect(phase.ok).toBe(outcome === "passed");
    expect(phase.phases.map((child: GatePhase) => child.name)).toEqual(["non-browser", "candidate-reader-build", "browser:fixture"]);
    expect(phase.phases.every((child: GatePhase) => child.durationMs !== undefined && child.durationMs > 0)).toBe(true);
    expect(phase.phases[1].outcome).toBe(outcome);
    expect(json(report.evidence)).toEqual(report);
  }
}, 30000);

for (const failure of ["", "FAIL_NON_BROWSER", "FAIL_BROWSER"]) test(`gate timings measure real subprocesses and preserve ${failure || "successful"} propagation`, async () => {
  const f = fixture(), injected = commands(f);
  writeFiles(f.root, {
    "tests/unit.test.ts": 'import { test, expect } from "bun:test"; test("unit", () => expect(process.env.FAIL_NON_BROWSER).not.toBe("yes"));\n',
    "tests/first.browser.test.ts": 'import { test, expect } from "bun:test"; test("browser", () => expect(process.env.FAIL_BROWSER).not.toBe("yes"));\n',
    "tests/second.browser.test.ts": 'import { test } from "bun:test"; test("second browser", () => {});\n',
    "reader/nuxt.config.ts": "export default defineNuxtConfig({ ssr: false, telemetry: false, devtools: { enabled: false }, app: { buildAssetsDir: '/_flow-reader/' } });\n",
    "reader/app/app.vue": "<template><h1>Candidate gate fixture</h1></template>\n",
  });
  rmSync(join(f.root, "node_modules"), { recursive: true, force: true });
  writeFiles(f.root, {
    "node_modules/nuxt/package.json": JSON.stringify({ name: "nuxt", bin: { nuxt: "generate.mjs" } }),
    "node_modules/nuxt/generate.mjs": `
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
if (process.argv[2] !== "generate") throw new Error("Expected generate");
const output = join(process.argv[3], ".output/public");
mkdirSync(join(output, "_flow-reader"), { recursive: true });
writeFileSync(join(output, "index.html"), "<html>Gate timing fixture</html>");
writeFileSync(join(output, "_flow-reader/app.js"), "console.log('gate timing fixture');");
`,
  });
  symlinkSync(join(import.meta.dir, "../node_modules/playwright-core"), join(f.root, "node_modules/playwright-core"), "dir");
  injected.test = [process.execPath, join(import.meta.dir, "../scripts/test.ts")];
  const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH ?? (process.platform === "darwin" ? join(homedir(), "Library/Caches/ms-playwright") : join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "ms-playwright"));
  const result = await f.run(f.root, ["gates", "--scratch", join(f.dir, "scratch")], { VSTACK_MAINTAIN_COMMANDS: JSON.stringify(injected), PLAYWRIGHT_BROWSERS_PATH: browsers, ...(failure ? { [failure]: "yes" } : {}) });
  const report = JSON.parse(result.stdout);
  expect(result.code, result.stdout + result.stderr).toBe(failure ? 2 : 0);
  const tests = report.stages.find((phase: GatePhase) => phase.name === "test");
  expect(tests.ok).toBe(!failure);
  const preparation = ["candidate-reader-readiness", "candidate-reader-build"];
  expect(tests.phases.map((phase: GatePhase) => phase.name)).toEqual([...preparation, ...(failure === "FAIL_NON_BROWSER" ? ["non-browser"] : failure === "FAIL_BROWSER" ? ["non-browser", "browser:tests/first.browser.test.ts"] : ["non-browser", "browser:tests/first.browser.test.ts", "browser:tests/second.browser.test.ts"])]);
  expect(tests.phases[2].command).toEqual([process.execPath, "test", "--timeout", "30000", "--path-ignore-patterns", "**/*.browser.test.ts"]);
  expect(tests.phases.every((phase: GatePhase) => phase.durationMs !== undefined && phase.durationMs > 0)).toBe(true);
  expect(tests.output).toContain(failure ? "1 fail" : "1 pass");
  expect(report.stages.at(-1).name).toBe("smoke");
  if (!failure) {
    const store = git(f.root, "rev-parse", "--path-format=absolute", "--git-path", "vstack-gate-shadow");
    expect(existsSync(join(store, "report.json"))).toBe(true);
    expect(existsSync(join(store, "test-phases.json"))).toBe(false);
    const shared = ({ command: _c, environment: _e, readerAssets: _r, ...rest }: Record<string, string>) => rest;
    for (const phase of tests.phases as GatePhase[]) expect(shared(phase.shadow!.inputs)).toEqual(shared(tests.shadow.inputs));
  }
}, 30000);

test("a plain test run captures no shadow inputs and leaves no reuse pointer", () => {
  const f = fixture();
  writeFiles(f.root, { "tests/unit.test.ts": 'import { test } from "bun:test"; test("unit", () => {});\n' });
  const run = Bun.spawnSync([process.execPath, join(import.meta.dir, "../scripts/test.ts"), "tests/unit.test.ts"], { cwd: f.root, env: { ...ENV }, stdout: "pipe", stderr: "pipe" });
  expect(run.exitCode, run.stderr.toString()).toBe(0);
  expect(existsSync(git(f.root, "rev-parse", "--path-format=absolute", "--git-path", "vstack-gate-shadow"))).toBe(false);
}, 30000);

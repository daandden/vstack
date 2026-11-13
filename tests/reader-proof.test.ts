import { afterEach, expect, test } from "bun:test";
import { cpSync, existsSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { lifecycleFixture } from "./support/update-lifecycle-fixture.ts";
import { writeFiles } from "./support/fixture.ts";

type GateStage = { name: string; ok: boolean; output: string; phases: CommandPhase[] };
type GateReport = { stages: GateStage[] };
type ReaderProof = { source: { root: string; sha256: string }; assets: { root: string; sha256: string } };
type CommandPhase = { name: string; outcome: string; exitCode: number; durationMs: number; command: string[] };
function testStage(stdout: string): GateStage {
  const report: GateReport = JSON.parse(stdout);
  const stage = report.stages.find(stage => stage.name === "test");
  if (!stage) throw new Error("Maintainer gates omitted the required test stage");
  return stage;
}

const repo = join(import.meta.dir, "..");
const fixtures: ReturnType<typeof lifecycleFixture>[] = [];
afterEach(() => { for (const f of fixtures.splice(0)) rmSync(f.dir, { recursive: true, force: true }); });
function fixture(dependencies = true) {
  const f = lifecycleFixture(); fixtures.push(f);
  cpSync(join(repo, "plugin"), join(f.root, "plugin"), { recursive: true });
  const manifest: { scripts: { test: string } } = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));
  const script = manifest.scripts.test.replace("scripts/test.ts", join(repo, "scripts/test.ts"));
  writeFiles(f.root, {
    "package.json": JSON.stringify({ type: "module", scripts: { test: script } }),
    "reader/nuxt.config.ts": `export default defineNuxtConfig({ ssr: false, telemetry: false, devtools: { enabled: false }, app: { buildAssetsDir: '/_flow-reader/' } });`,
    "tests/control.test.ts": `import { test } from 'bun:test'; import { writeFileSync } from 'node:fs'; test('ordinary fixture phase runs', () => { writeFileSync('ordinary-ran', 'yes'); });`,
    "reader/app/app.vue": `<template><h1>Candidate reader behavior</h1></template>`,
    "plugin/skills/flow-page/reader/index.html": "<h1>Stale shipped behavior</h1>",
    "tests/candidate.browser.test.ts": `import { expect, test } from 'bun:test';
import { chromium } from ${JSON.stringify(join(repo, "node_modules/playwright-core/index.mjs"))};
import { join } from 'node:path';
const cli = (args) => {
  const result = Bun.spawnSync([process.execPath, ${JSON.stringify(join(f.root, "plugin/skills/flow-page/scripts/flow-page.ts"))}, ...args, '--home', join(process.cwd(), 'home'), '--session', '01a1ca17-22cb-71e8-8ccb-2a77d0525d76', '--agent', 'Impl469'], { env: { ...process.env, VSTACK_FLOW_PORT: process.env.PROOF_PORT }, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) throw new Error(result.stdout + result.stderr.toString());
  return JSON.parse(result.stdout.toString());
};
test('rendered behavior comes from candidate source', async () => {
  const socket = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } }); process.env.PROOF_PORT = String(socket.port); socket.stop(true);
  const opened = cli(['open', '--title', 'Candidate proof', '--skill', 'implement']);
  if (!opened.live.url) throw new Error(JSON.stringify(opened.live));
  const browser = await chromium.launch({ headless: true });
  try { const page = await browser.newPage(); await page.goto(opened.live.url); await expect(page.getByRole('heading').textContent()).resolves.toBe('Candidate reader behavior'); }
  finally { await browser.close(); cli(['host', 'stop']); }
});`,
    "pass.ts": "console.log('fixture boundary passed');",
  });
  rmSync(join(f.root, "node_modules"), { recursive: true, force: true });
  if (dependencies) symlinkSync(join(repo, "node_modules"), join(f.root, "node_modules"), "dir");
  const commands = Object.fromEntries(["validate", "check", "smoke"].map(name => [name, [process.execPath, join(f.root, "pass.ts")]]));
  const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH ?? (process.platform === "darwin" ? join(homedir(), "Library/Caches/ms-playwright") : join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "ms-playwright"));
  return { ...f, env: { VSTACK_MAINTAIN_COMMANDS: JSON.stringify(commands), PLAYWRIGHT_BROWSERS_PATH: browsers } };
}

test("maintainer gates render candidate source despite stale shipped assets and retain its identity", async () => {
  const f = fixture();
  const shipped = readFileSync(join(f.root, "plugin/skills/flow-page/reader/index.html"), "utf8");
  const result = await f.run(f.root, ["gates", "--scratch", join(f.dir, "scratch")], f.env);
  if (process.env.READER_PROOF_EVIDENCE) writeFileSync(join(process.env.READER_PROOF_EVIDENCE, "candidate-gates.json"), result.stdout);
  expect(result.code).toBe(0);
  const stage = testStage(result.stdout);
  expect(stage.ok).toBe(true);
  const { readerProof: receipt }: { readerProof: ReaderProof } = JSON.parse(stage.output.split("\n").find(line => line.startsWith('{"readerProof":'))!);
  expect(receipt.source.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(receipt.assets.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(receipt.source.root).toBe(join(realpathSync(f.root), "reader"));
  expect(existsSync(receipt.assets.root)).toBe(false);
  expect(existsSync(join(f.root, "reader/.nuxt"))).toBe(false);
  expect(existsSync(join(f.root, "reader/.output"))).toBe(false);
  expect(readFileSync(join(f.root, "plugin/skills/flow-page/reader/index.html"), "utf8")).toBe(shipped);
  expect(existsSync(join(f.root, "ordinary-ran"))).toBe(true);
  const phases = stage.phases;
  expect(phases.map(phase => phase.name)).toEqual(["candidate-reader-readiness", "candidate-reader-build", "non-browser", "browser:tests/candidate.browser.test.ts"]);
  for (const phase of phases) {
    expect(phase.outcome).toBe("passed");
    expect(phase.exitCode).toBe(0);
    expect(phase.durationMs).toBeGreaterThanOrEqual(0);
    expect(phase.command.length).toBeGreaterThan(0);
  }
}, 120_000);

test("maintainer gates name missing Nuxt and Chromium dependencies before browser execution", async () => {
  for (const missing of ["nuxt", "Chromium"]) {
    const f = fixture(missing !== "nuxt");
    const result = await f.run(f.root, ["gates", "--scratch", join(f.dir, "scratch")], {
      ...f.env, ...(missing === "Chromium" ? { PLAYWRIGHT_BROWSERS_PATH: join(f.dir, "missing-browser") } : {}),
    });
    if (process.env.READER_PROOF_EVIDENCE) writeFileSync(join(process.env.READER_PROOF_EVIDENCE, `missing-${missing}-gates.json`), result.stdout);
    expect(result.code).toBe(2);
    const stage = testStage(result.stdout);
    expect(stage.ok).toBe(false);
    expect(stage.output).toContain(missing);
    expect(stage.output).toContain("Reader proof requires");
    expect(stage.output).not.toContain("rendered behavior comes from candidate source");
    expect(existsSync(join(f.root, "reader/.nuxt"))).toBe(false);
  }
}, 60_000);

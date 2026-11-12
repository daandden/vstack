#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { GateReport } from "./lib/gate-report.ts";
import { browserPhase, browserTests, NON_BROWSER, READER_PREPARATION } from "./lib/test-phases.ts";
import { walkFiles } from "../plugin/skills/flow-page/scripts/files.ts";

const root = process.cwd();
const selected = process.argv.slice(2);
const browsers = selected.length ? selected.filter(file => file.endsWith(".browser.test.ts")) : browserTests(root);
const ordinary = selected.filter(file => !file.endsWith(".browser.test.ts"));
const temporary = process.env.VSTACK_GATE_PHASE_REPORT ? undefined : mkdtempSync(join(tmpdir(), "vstack-tests-"));
// Shadow reuse predictions belong to gates: a plain run captures nothing, and a run inside gates reuses the gate's capture.
const shadow = !process.env.VSTACK_GATE_PHASE_REPORT ? "off" : process.env.VSTACK_GATE_SHADOW ? { shared: process.env.VSTACK_GATE_SHADOW } : "own";
const report = new GateReport(root, process.env.VSTACK_GATE_PHASE_REPORT ?? join(temporary!, "phases.json"), undefined, true, undefined, shadow);
async function phase(name: string, command: string[], env = process.env) {
  const result = await report.command(name, command, undefined, env, true);
  if (!result.ok || report.interrupted) throw new Error(`${name} ${result.outcome}${result.exitCode === undefined ? "" : ` (exit ${result.exitCode})`}`);
}
const BUILD_DIRS = [".nuxt", ".output", "node_modules", ".data", ".cache"];
function digest(paths: string[]) {
  const hash = createHash("sha256");
  const walk = (path: string, label: string) => walkFiles(path, (rel, file) => {
    const bytes = readFileSync(file); hash.update(`${label}/${rel}\0${bytes.length}\0`).update(bytes);
  }, { order: (a, b) => a.localeCompare(b), skip: name => BUILD_DIRS.includes(name), follow: true });
  for (const path of paths) {
    const file = resolve(root, path);
    if (!existsSync(file)) continue;
    if (statSync(file).isFile()) {
      const bytes = readFileSync(file); hash.update(`${path}\0${bytes.length}\0`).update(bytes);
    } else walk(file, path.startsWith("/") ? "" : path);
  }
  return hash.digest("hex");
}
let out: string | undefined;
try {
  let env = process.env;
  if (browsers.length) {
    const require = createRequire(join(root, "package.json"));
    const needed = (name: string) => {
      try {
        if (!existsSync(join(root, "node_modules", name))) throw new Error("missing candidate dependency");
        return require.resolve(name);
      }
      catch { throw new Error(`Reader proof requires ${name}; run bun install --frozen-lockfile in ${root}`); }
    };
    const nuxtPackage = needed("nuxt/package.json");
    const playwright = needed("playwright-core");
    const cli = join(dirname(nuxtPackage), JSON.parse(readFileSync(nuxtPackage, "utf8")).bin.nuxt);
    if (!existsSync(cli)) throw new Error(`Reader proof requires the Nuxt CLI at ${cli}; run bun install --frozen-lockfile`);
    if (!existsSync(join(root, "reader/nuxt.config.ts"))) throw new Error(`Reader proof requires candidate input ${join(root, "reader/nuxt.config.ts")}`);
    await phase(READER_PREPARATION[0], [process.execPath, "--eval", `try { const { chromium } = await import(${JSON.stringify(pathToFileURL(playwright).href)}); const browser = await chromium.launch({ headless: true }); console.log(JSON.stringify({ chromium: chromium.executablePath(), version: browser.version() })); await browser.close(); } catch (error) { console.error('Reader proof requires working Playwright Chromium: ' + error.message); process.exit(1); }`]);
    out = mkdtempSync(join(tmpdir(), "vstack-reader-proof-"));
    const candidateReader = join(out, "reader");
    cpSync(join(root, "reader"), candidateReader, { recursive: true, dereference: true, filter: path => !BUILD_DIRS.includes(path.split("/").at(-1)!) });
    symlinkSync(join(root, "node_modules"), join(candidateReader, "node_modules"), "dir");
    const sourcePaths = ["reader", "plugin/skills/flow-page/scripts", "plugin/skills/vstack-figures/scripts", "package.json", "bun.lock"];
    const source = { root: join(root, "reader"), paths: sourcePaths, sha256: digest(sourcePaths) };
    env = { ...process.env, FLOW_READER_SOURCE_ROOT: root, FLOW_READER_ASSETS: join(candidateReader, ".output/public") };
    await phase(READER_PREPARATION[1], [process.execPath, cli, "generate", candidateReader], env);
    if (!existsSync(join(env.FLOW_READER_ASSETS!, "index.html")) || !existsSync(join(env.FLOW_READER_ASSETS!, "_flow-reader"))) throw new Error(`Reader proof requires generated index.html and _flow-reader assets in ${env.FLOW_READER_ASSETS}`);
    cpSync(env.FLOW_READER_ASSETS!, join(out, "assets"), { recursive: true, dereference: true });
    env.FLOW_READER_ASSETS = join(out, "assets");
    console.log(JSON.stringify({ readerProof: { source, assets: { root: env.FLOW_READER_ASSETS, sha256: digest([resolve(env.FLOW_READER_ASSETS!)]) }, bun: Bun.version } }));
  }
  if (!selected.length || ordinary.length) await phase(NON_BROWSER, [process.execPath, "test", "--timeout", "30000", "--path-ignore-patterns", "**/*.browser.test.ts", ...ordinary]);
  for (const file of browsers) await phase(browserPhase(file), [process.execPath, "test", "--timeout", "30000", file], env);
} catch (error) {
  console.error((error as Error).message);
  if (report.stages.every(stage => stage.ok)) await report.phase("test-runner", () => { throw error; });
} finally {
  if (out) rmSync(out, { recursive: true, force: true });
  const result = report.finish();
  process.exitCode = result.ok ? 0 : 1;
  if (temporary) rmSync(temporary, { recursive: true, force: true });
}

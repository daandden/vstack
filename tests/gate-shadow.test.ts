import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GatePhase } from "../scripts/lib/gate-report.ts";
import { lifecycleFixture } from "./support/update-lifecycle-fixture.ts";
import { ENV, git, writeFiles } from "./support/fixture.ts";

const fixtures: ReturnType<typeof lifecycleFixture>[] = [];
afterEach(() => { for (const fixture of fixtures.splice(0)) rmSync(fixture.dir, { recursive: true, force: true }); });
function fixture(phaseName = "non-browser") {
  const f = lifecycleFixture(); fixtures.push(f);
  mkdirSync(f.cache);
  symlinkSync(f.mattRepo, join(f.cache, "matt"), "dir");
  symlinkSync(f.pstackRepo, join(f.cache, "pstack"), "dir");
  writeFiles(f.root, { "README.md": "Original document.\n", "bun.lock": "fixture dependency identity\n" });
  const runner = join(f.dir, "shadow-runner.ts"), calls = join(f.dir, "executions.txt");
  const module = process.env.GATE_REPORT_MODULE ?? join(import.meta.dir, "../scripts/lib/gate-report.ts");
  writeFileSync(runner, `import { GateReport } from ${JSON.stringify(module)};
const report = new GateReport(process.cwd(), process.argv[2], process.env.SHADOW_BASE, false, ${JSON.stringify(f.cache)});
const command = [process.execPath, '-e', ${JSON.stringify(`import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'; appendFileSync(${JSON.stringify(calls)}, 'executed\\n'); console.log(readFileSync('README.md', 'utf8')); if (process.env.CHANGE_SOURCE) writeFileSync('README.md', 'Concurrent edit.'); if (process.env.FAIL_FRESH) process.exit(7);`)}];
await report.command(${JSON.stringify(phaseName)}, command);
await report.command('smoke', [process.execPath, '-e', 'console.log("fresh smoke")']);
console.log(JSON.stringify(report.finish()));`);
  let serial = 0;
  const run = async (env: Record<string, string | undefined> = {}) => {
    const evidence = join(f.dir, `run-${++serial}`, "report.json");
    const child = Bun.spawn([process.execPath, runner, evidence], { cwd: f.root, env: { ...ENV, PATH: `${f.dir}:${ENV.PATH}`, ...env }, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(code, stderr).toBe(0);
    return JSON.parse(stdout) as { ok: boolean; stages: GatePhase[]; evidence: string };
  };
  return { ...f, run, calls };
}

test("unchanged inputs predict reuse but every measured command executes afresh", async () => {
  const f = fixture();
  const first = await f.run(), second = await f.run();
  expect(first.stages.every(phase => phase.shadow?.reusablePass)).toBe(true);
  expect(first.stages.every(phase => phase.shadow?.predictedReuse === false)).toBe(true);
  expect(second.stages.every(phase => phase.shadow?.predictedReuse)).toBe(true);
  expect(second.stages[0]!.shadow?.previousEvidence).toBe(first.evidence);
  expect(second.stages[0]!.shadow?.evidence).toBe(second.evidence);
  expect(second.stages.every(phase => phase.exitCode === 0 && phase.shadow?.freshResult === "passed")).toBe(true);
  expect(readFileSync(f.calls, "utf8")).toBe("executed\nexecuted\n");
  expect(second.stages[0]!.shadow?.inputs.sourceInventory).toMatch(/^[a-f0-9]{64}$/);
}, 30000);

for (const change of ["document", "discovery", "base", "dependency", "runtime", "upstream", "evidence"] as const) test(`shadow refuses changed ${change} inputs`, async () => {
  const f = fixture(), first = await f.run();
  expect(first.stages[0]!.shadow?.reusablePass).toBe(true);
  const env: Record<string, string> = {};
  if (change === "document") writeFiles(f.root, { "README.md": "Changed consumed document.\n" });
  if (change === "discovery") writeFiles(f.root, { "examples/new-template.md": "Discovered example.\n" });
  if (change === "base") env.SHADOW_BASE = git(f.root, "rev-parse", "HEAD^");
  if (change === "dependency") writeFiles(f.root, { "node_modules/marker.txt": "Changed installed dependency.\n" });
  if (change === "runtime") writeFileSync(join(f.dir, "omp"), "#!/bin/sh\nexit 0\n");
  if (change === "upstream") git(f.mattRepo, "tag", "-f", "v1.1.0", "v1.2.0");
  if (change === "evidence") rmSync(first.stages[0]!.stdout!);
  const second = await f.run(env);
  expect(second.stages[0]!.shadow?.predictedReuse).toBe(false);
  expect(second.stages.every(phase => phase.shadow?.freshResult === "passed")).toBe(true);
  expect(readFileSync(f.calls, "utf8")).toBe("executed\nexecuted\n");
}, 30000);

for (const env of [{ CHANGE_SOURCE: "yes" }, { FAIL_FRESH: "yes" }, { VSTACK_MAINTAIN_COMMANDS: "{}" }]) test(`shadow never promotes invalid fresh proof ${Object.keys(env)[0]}`, async () => {
  const f = fixture(), result = await f.run(env);
  expect(result.stages.every(phase => phase.shadow?.reusablePass === false)).toBe(true);
  expect((await f.run()).stages.every(phase => phase.shadow?.predictedReuse === false)).toBe(true);
}, 30000);

test("missing installed dependencies and partial receipt evidence remain ineligible", async () => {
  const f = fixture(), first = await f.run();
  const partial = JSON.parse(readFileSync(first.evidence, "utf8"));
  delete partial.finishedAt;
  writeFileSync(first.evidence, JSON.stringify(partial));
  expect((await f.run()).stages.every(phase => phase.shadow?.predictedReuse === false)).toBe(true);
  rmSync(join(f.root, "node_modules"), { recursive: true });
  const missing = await f.run();
  expect(missing.stages.every(phase => phase.shadow?.reusablePass === false)).toBe(true);
  expect(missing.stages[0]!.shadow?.unknown.join("\n")).toContain("dependencies");
}, 30000);

test("prepared candidate reader bytes participate in the phase input identity", async () => {
  const f = fixture(), assets = join(f.dir, "prepared-reader");
  writeFiles(assets, { "index.html": "<h1>Candidate one</h1>" });
  const env = { FLOW_READER_ASSETS: assets };
  expect((await f.run(env)).stages[0]!.shadow?.reusablePass).toBe(true);
  expect((await f.run(env)).stages[0]!.shadow?.predictedReuse).toBe(true);
  writeFiles(assets, { "index.html": "<h1>Candidate two</h1>" });
  const changed = await f.run(env);
  expect(changed.stages[0]!.shadow?.predictedReuse).toBe(false);
  expect(changed.stages[0]!.shadow?.inputs.readerAssets).toMatch(/^[a-f0-9]{64}$/);
}, 30000);

test("a successful runner with missing required test phases is not reusable proof", async () => {
  const f = fixture("test");
  const first = await f.run(), second = await f.run();
  expect(first.stages.every(phase => phase.shadow?.reusablePass === false)).toBe(true);
  expect(second.stages.every(phase => phase.shadow?.predictedReuse === false)).toBe(true);
}, 30000);

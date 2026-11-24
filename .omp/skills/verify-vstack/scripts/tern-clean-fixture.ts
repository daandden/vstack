import { existsSync, mkdirSync, readFileSync, realpathSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { holdSessionLease, stopSessionLeaseHolders } from "../../../../tests/support/session-lease-holder.ts";
import { legacyFlowFixture, legacyFlow } from "../../../../tests/support/flow-store.ts";

const run = resolve(process.argv[2] ?? "."), checkout = resolve(import.meta.dir, "../../../..");
const data = join(run, "data"), home = join(data, "home");
if (process.argv.length !== 3 || realpathSync(home) !== home ||
    JSON.parse(readFileSync(join(data, "tern-fixture.json"), "utf8")).run !== run ||
    process.env.TERN_VERIFY_HOME !== home || existsSync(join(home, ".vstack"))) {
  throw new Error("Use a new isolated tern-verify run with TERN_VERIFY_HOME=RUN/data/home");
}
const scratch = join(home, ".vstack/tmp/verify-591");
const WITNESS = "019ac000-0000-7000-8000-000000000001";
const DELETED = "019ac001-0000-7000-8000-000000000002";
const SKIPPED = "019ac002-0000-7000-8000-000000000003";
const PARTIAL = "019ac003-0000-7000-8000-000000000004";
const bun = process.execPath;
const project = join(data, "project");
function exec(argv: string[], cwd = data) {
  const p = Bun.spawnSync(argv, { cwd, env: { ...process.env, HOME: join(data, "driver-home"), VSTACK_FLOW_HOST: "off" }, stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(p.stderr.toString() || `exit ${p.exitCode}`);
  return p.stdout.toString();
}
function file(path: string, text: string, days: number) {
  const date = new Date(Date.now() - days * 86_400_000);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  utimesSync(path, date, date);
}
for (const [session, title, kinds] of [
  [WITNESS, "Live verification witness", ["verify"]],
  [DELETED, "Done with diagnostic checks", ["verify", "explain"]],
  [SKIPPED, "Scratch changed after listing", ["verify"]],
  [PARTIAL, "Partly removable run", ["verify", "explain"]],
] as const) {
  for (const kind of kinds) {
    const dir = exec([bun, join(checkout, "plugin/skills/vstack-tmp/scripts/path.ts"), "--scratch-dir", scratch, "--session-id", session, kind]).trim();
    file(join(dir, "report.txt"), `${kind}\n`, 25);
  }
  file(join(home, ".omp/agent/sessions/project", `2026-10-22T12-00-00_${session}.jsonl`),
    `${JSON.stringify({ type: "title", title })}\n${JSON.stringify({ type: "session", id: session, cwd: project })}\n`, 25);
}
file(join(scratch, "to-tickets/native-fixture/approved.json"), "{}\n", 20);
mkdirSync(project);
exec(["git", "init", "-q"], project);
const open = legacyFlowFixture(home, project), closed = "closed-native-fixture";
legacyFlow(home, project, closed, {
  ...open.state, flow: { ...open.state.flow, id: closed, slug: closed, title: "Closed native fixture" },
  lifecycle: [{ event: "closed", time: new Date(Date.now() - 30 * 86_400_000).toISOString() }],
});
exec([bun, join(checkout, "plugin/skills/flow-page/scripts/flow-page.ts"), "show", "--session", "verify-seed", "--agent", "main", "--home", home, "--flow", closed], project);

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const bin = join(data, "bin"), qHome = quote(home);
mkdirSync(bin);
const fault = join(checkout, "tests/support/cleanup-fault.ts");
writeFileSync(join(bin, "bun"), `#!/bin/sh
set -eu
if [ "\${2:-}" != --home ] || [ "\${3:-}" != ${qHome} ]; then
  echo 'cleanup fixture refuses to run on a different home' >&2; exit 20
fi
printf '%s\\n' "$*" >> ${quote(join(run, "process-argv.txt"))}
if [ -f ${quote(join(data, "fault"))} ]; then
  export CLEAN_FAULT="$(cat ${quote(join(data, "fault"))})"
  export CLEAN_FAULT_PATH="$(cat ${quote(join(data, "fault-path"))})"
  exec ${quote(bun)} --preload ${quote(fault)} "$@"
fi
exec ${quote(bun)} "$@"
`, { mode: 0o755 });
writeFileSync(join(home, ".zprofile"), `export PATH=${quote(`${bin}:${dirname(bun)}:/usr/bin:/bin:/usr/sbin:/sbin`)}\n`);
const holder = await holdSessionLease(WITNESS, { home });
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, async () => {
  await stopSessionLeaseHolders([holder]);
  process.exit(0);
});
console.log(JSON.stringify({ home, scratch, ids: { WITNESS, DELETED, SKIPPED, PARTIAL }, holder: holder.pid }));
await holder.exited;

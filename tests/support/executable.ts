import { chmodSync, writeFileSync } from "node:fs";

const WARMUP = "FIXTURE_EXECUTABLE_WARMUP";
const GUARDS = {
  sh: `[ -z "$${WARMUP}" ] || exit 0`,
  bun: `if (process.env.${WARMUP}) process.exit(0);`,
};

/**
 * Writes a fixture executable, then runs it once with no time limit. On macOS the first exec of a new file waits
 * for a Gatekeeper scan, and that scan can queue behind other processes' scans for longer than the 15 s bound the
 * scripts under test put on their spawns. The warm-up run exits at a guard line placed before `body`, so it has no
 * side effects. A bun `body` that loads a fake must use `await import(...)`, because a static import runs before the guard.
 */
export function writeExecutable(path: string, interpreter: keyof typeof GUARDS, body: string): void {
  const shebang = interpreter === "sh" ? "/bin/sh" : process.execPath;
  writeFileSync(path, `#!${shebang}\n${GUARDS[interpreter]}\n${body}\n`);
  chmodSync(path, 0o755);
  const warm = Bun.spawnSync([path], { env: { ...process.env, [WARMUP]: "1" }, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const output = warm.stdout.toString() + warm.stderr.toString();
  if (warm.exitCode !== 0 || output) throw new Error(`warm-up of ${path} did not stop at its guard: exit ${warm.exitCode} ${output}`);
}

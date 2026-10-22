import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "vstack-hillclimb-log-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const script = join(import.meta.dir, "../plugin/skills/hillclimb/scripts/log.sh");
const log = join(dir, "scratch/hillclimb/run/attempts.tsv");
function run(...args: string[]) {
  return Bun.spawnSync(["bash", script, ...args], { stdout: "pipe", stderr: "pipe" });
}
test("creates nested Scratch log with one header and appends sanitized rows without changing history", () => {
  expect(run(log, "start", "began", "unattended", "omp session 12345678", "open").exitCode).toBe(0);
  const first = readFileSync(log, "utf8");
  expect(first).toMatch(/^ts\tphase\tdecision\twhy\tevidence\tresult\n\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\tstart\tbegan\tunattended\tomp session 12345678\topen\n$/);
  expect(run(log, "=phase", "+decision\tline\nnext", "-why\rnext", "@evidence", "done").exitCode).toBe(0);
  const text = readFileSync(log, "utf8");
  expect(text.startsWith(first)).toBe(true);
  expect(text.split("\n")).toHaveLength(4);
  expect(text.split("\n")[2].split("\t").slice(1)).toEqual(["'=phase", "'+decision line next", "'-why next", "'@evidence", "done"]);
});
test("rejects incomplete rows without changing the existing log", () => {
  const before = readFileSync(log, "utf8");
  const result = run(log, "phase");
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain("usage: log.sh");
  expect(readFileSync(log, "utf8")).toBe(before);
});

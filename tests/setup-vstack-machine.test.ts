// setup-vstack's machine check script run as a process over a throwaway HOME (spec #63, Testing Decisions,
// Seam 1). The script asks the real `omp` for settings and credentials, so these cases need omp on PATH;
// without it (CI) they skip, except the case that proves the script names the missing binary.
// The env holds only PATH, HOME, and TERM, so no PI_* or OMP_* setting of a parent omp session leaks in.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "setup-vstack", "scripts", "machine.ts");
const HAS_OMP = Bun.which("omp") !== null;

let dir: string;
beforeAll(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "vstack-machine-test-")));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
/** A throwaway home whose omp user config is `configYml`, plus a project dir outside the real home. */
function makeHome(configYml: string): { home: string; cwd: string } {
  const root = join(dir, `case-${++n}`);
  const home = join(root, "home");
  const cwd = join(root, "proj");
  mkdirSync(join(home, ".omp", "agent"), { recursive: true });
  mkdirSync(cwd, { recursive: true });
  writeFileSync(join(home, ".omp", "agent", "config.yml"), configYml);
  return { home, cwd };
}

function run(h: { home: string; cwd: string }, args: string[], extraEnv: Record<string, string> = {}) {
  const env = { PATH: process.env.PATH ?? "", HOME: h.home, TERM: "dumb", ...extraEnv };
  const r = Bun.spawnSync([process.execPath, SCRIPT, ...args], { cwd: h.cwd, env, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}

const lines = (s: string) => s.split("\n").filter((l) => l.trim() !== "");

const CONFIGURED = `modelRoles:
  judge: typesafe/jev-latest
task:
  isolation:
    enabled: true
`;
const KEY = { TYPESAFE_API_KEY: "fake-typesafe-key" };

test.skipIf(!HAS_OMP)("a configured machine prints exactly one OK line and exits 0", () => {
  const r = run(makeHome(CONFIGURED), ["--extension-loaded", "yes"], KEY);
  expect(r.code).toBe(0);
  const out = lines(r.stdout);
  expect(out).toHaveLength(1);
  expect(out[0]).toStartWith("OK ");
  expect(r.stdout).not.toContain("fake-typesafe-key");
});

test.skipIf(!HAS_OMP)("a vstack agent override is a NOTE that names the agent and its model, and the machine still passes", () => {
  const h = makeHome(`${CONFIGURED}  agentModelOverrides:
    vstack-explorer: smoke/smoke-model
    reviewer: smoke/other-model
`);
  const r = run(h, ["--extension-loaded", "yes"], KEY);
  expect(r.code).toBe(0);
  const out = lines(r.stdout);
  expect(out).toHaveLength(2);
  expect(out[0]).toStartWith("OK ");
  expect(out[1]).toStartWith("NOTE 3 ");
  expect(out[1]).toContain("vstack-explorer (smoke/smoke-model)");
  expect(out[1]).not.toContain("reviewer");
  expect(out[1]).not.toContain("Remedy");
});

test.skipIf(!HAS_OMP)("an unconfigured machine prints one line per failing check, each with a remedy, and exits 1", () => {
  const h = makeHome(`modelRoles:
  default: smoke/smoke-model
task:
  agentModelOverrides:
    vstack-explorer: smoke/smoke-model
    reviewer: smoke/smoke-model
disabledExtensions:
  - extension-module:vstack
eval:
  py: false
worktree:
  clone: false
`);
  const r = run(h, ["--extension-loaded", "no"]);
  expect(r.code).toBe(1);
  const out = lines(r.stdout);
  expect(out.map((l) => l.split(" ").slice(0, 2).join(" "))).toEqual([
    "FAIL 1",
    "FAIL 2",
    "NOTE 3",
    "FAIL 4",
    "WARN 5",
    "FAIL 6",
    "FAIL 7",
  ]);
  for (const l of out) if (!l.startsWith("NOTE ")) expect(l).toContain("Remedy: ");
  const byId = (id: string) => out.find((l) => l.split(" ")[1] === id)!;
  expect(byId("1")).toContain("/login typesafe");
  expect(byId("3")).toContain("vstack-explorer");
  expect(byId("3")).not.toContain("reviewer");
  // Listed in disabledExtensions: a new session alone does not fix it, so the remedy removes the entry first.
  expect(byId("4")).toContain("disabledExtensions");
  expect(byId("4")).toContain("extension-module:vstack");
  expect(byId("5")).toContain("eval.py");
});

test.skipIf(!HAS_OMP)("an enabled extension that this session did not load needs a new session", () => {
  const r = run(makeHome(CONFIGURED), ["--extension-loaded", "no"], KEY);
  expect(r.code).toBe(1);
  const out = lines(r.stdout);
  expect(out).toHaveLength(1);
  expect(out[0]).toStartWith("FAIL 4 ");
  expect(out[0]).toContain("new session");
  expect(out[0]).not.toContain("disabledExtensions");
});

test.skipIf(!HAS_OMP)("a Python interpreter that omp cannot run warns and points at omp setup python", () => {
  const r = run(makeHome(`${CONFIGURED}python:\n  interpreter: ${join(dir, "no-such-python")}\n`), ["--extension-loaded", "yes"], KEY);
  expect(r.code).toBe(0);
  const out = lines(r.stdout);
  expect(out).toHaveLength(1);
  expect(out[0]).toStartWith("WARN 5 ");
  expect(out[0]).toContain("omp setup python");
});

test.skipIf(!HAS_OMP)("--set writes the judge role, isolation, and clone to the user config and keeps the other roles", () => {
  const h = makeHome(`modelRoles:
  default: smoke/smoke-model
worktree:
  clone: false
`);
  const before = run(h, ["--extension-loaded", "yes"], KEY);
  expect(lines(before.stdout).map((l) => l.slice(0, 6))).toEqual(["FAIL 2", "FAIL 6", "FAIL 7"]);

  const set = run(h, ["--set", "judge", "isolation", "clone"], KEY);
  expect(set.code).toBe(0);
  const config = Bun.YAML.parse(readFileSync(join(h.home, ".omp", "agent", "config.yml"), "utf8")) as any;
  expect(config.modelRoles).toEqual({ default: "smoke/smoke-model", judge: "typesafe/jev-latest" });
  expect(config.task.isolation.enabled).toBe(true);
  expect(config.worktree.clone).toBe(true);

  const after = run(h, ["--extension-loaded", "yes"], KEY);
  expect(after.code).toBe(0);
  expect(lines(after.stdout)).toHaveLength(1);
  expect(after.stdout).toStartWith("OK ");
});

test.skipIf(!HAS_OMP)("checking never changes the omp config", () => {
  const h = makeHome("worktree:\n  clone: false\n");
  run(h, ["--extension-loaded", "yes"]);
  expect(readFileSync(join(h.home, ".omp", "agent", "config.yml"), "utf8")).toBe("worktree:\n  clone: false\n");
});

test("usage errors and a missing omp exit 2 and say why", () => {
  const h = makeHome(CONFIGURED);
  const noFlag = run(h, []);
  expect(noFlag.code).toBe(2);
  expect(noFlag.stderr).toContain("--extension-loaded");

  const badSet = run(h, ["--set", "everything"]);
  expect(badSet.code).toBe(2);
  expect(badSet.stderr).toContain("everything");

  const noOmp = run(h, ["--extension-loaded", "yes"], { PATH: join(dir, "empty-path") });
  expect(noOmp.code).toBe(2);
  expect(noOmp.stderr).toContain("omp");
});

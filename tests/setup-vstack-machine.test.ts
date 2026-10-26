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
ratchet:
  enabled: true
task:
  isolation:
    enabled: true
`;
const KEY = { TYPESAFE_API_KEY: "fake-typesafe-key" };

test.skipIf(!HAS_OMP)("a configured machine prints one OK line and the extension NOTE, and exits 0", () => {
  const r = run(makeHome(CONFIGURED), [], KEY);
  expect(r.code).toBe(0);
  const out = lines(r.stdout);
  expect(out).toHaveLength(2);
  expect(out[0]).toStartWith("OK ");
  expect(out[0]).toContain("8 ratchet.enabled");
  expect(out[1]).toStartWith("NOTE 4 ");
  expect(r.stdout).not.toContain("fake-typesafe-key");
});

test.skipIf(!HAS_OMP)("a vstack agent override is a NOTE that names the agent and its model, and the machine still passes", () => {
  const h = makeHome(`${CONFIGURED}  agentModelOverrides:
    vstack-explorer: smoke/smoke-model
    reviewer: smoke/other-model
`);
  const r = run(h, [], KEY);
  expect(r.code).toBe(0);
  const out = lines(r.stdout);
  expect(out).toHaveLength(3);
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
  const r = run(h, []);
  expect(r.code).toBe(1);
  const out = lines(r.stdout);
  expect(out.map((l) => l.split(" ").slice(0, 2).join(" "))).toEqual([
    "FAIL 2",
    "NOTE 3",
    "FAIL 4",
    "WARN 5",
    "FAIL 6",
    "FAIL 7",
    "FAIL 8",
  ]);
  for (const l of out) if (!l.startsWith("NOTE ")) expect(l).toContain("Remedy: ");
  const byId = (id: string) => out.find((l) => l.split(" ")[1] === id)!;
  expect(byId("3")).toContain("vstack-explorer");
  expect(byId("3")).not.toContain("reviewer");
  // Listed in disabledExtensions: a new session alone does not fix it, so the remedy removes the entry first.
  expect(byId("4")).toContain("disabledExtensions");
  expect(byId("4")).toContain("extension-module:vstack");
  expect(byId("4")).toContain("remove it first");
  expect(byId("5")).toContain("eval.py");
});

test.skipIf(!HAS_OMP)("disabled Ratchet fails check 8 with an approved global-setting remedy and checking leaves it disabled", () => {
  const configYml = CONFIGURED.replace("ratchet:\n  enabled: true", "ratchet:\n  enabled: false");
  const h = makeHome(configYml);
  const r = run(h, [], KEY);
  expect(r.code).toBe(1);
  const out = lines(r.stdout);
  expect(out.map((l) => l.slice(0, 6))).toEqual(["NOTE 4", "FAIL 8"]);
  expect(out[1]).toContain("ratchet.enabled is off");
  expect(out[1]).toContain("Remedy: setup-vstack sets ratchet.enabled to true once you approve");
  expect(readFileSync(join(h.home, ".omp", "agent", "config.yml"), "utf8")).toBe(configYml);
});

test.skipIf(!HAS_OMP)("an enabled extension is a NOTE to start a new session after linking or pulling, and the machine still passes", () => {
  const r = run(makeHome(CONFIGURED), [], KEY);
  expect(r.code).toBe(0);
  const note = lines(r.stdout).find((l) => l.startsWith("NOTE 4 "))!;
  expect(note).toContain("/new");
  expect(note).toContain("session start");
  expect(note).not.toContain("disabledExtensions");
  expect(note).not.toContain("Remedy");
});

test.skipIf(!HAS_OMP)("a Python interpreter that omp cannot run warns and points at omp setup python", () => {
  const r = run(makeHome(`${CONFIGURED}python:\n  interpreter: ${join(dir, "no-such-python")}\n`), [], KEY);
  expect(r.code).toBe(0);
  const out = lines(r.stdout);
  expect(out.map((l) => l.slice(0, 6))).toEqual(["NOTE 4", "WARN 5"]);
  expect(out[1]).toContain("omp setup python");
});

test.skipIf(!HAS_OMP)("--set writes the judge role, isolation, clone, and Ratchet globally and keeps unrelated settings", () => {
  const h = makeHome(`modelRoles:
  default: smoke/smoke-model
worktree:
  clone: false
ratchet:
  enabled: false
task:
  agentModelOverrides:
    reviewer: smoke/reviewer-model
theme:
  dark: catppuccin-mocha
`);
  const before = run(h, [], KEY);
  expect(lines(before.stdout).map((l) => l.slice(0, 6))).toEqual(["FAIL 2", "NOTE 4", "FAIL 6", "FAIL 7", "FAIL 8"]);

  const set = run(h, ["--set", "judge", "isolation", "clone", "ratchet"], KEY);
  expect(set.code).toBe(0);
  const config = Bun.YAML.parse(readFileSync(join(h.home, ".omp", "agent", "config.yml"), "utf8")) as any;
  expect(config.modelRoles).toEqual({ default: "smoke/smoke-model", judge: "typesafe/jev-latest" });
  expect(config.task.isolation.enabled).toBe(true);
  expect(config.worktree.clone).toBe(true);
  expect(config.ratchet.enabled).toBe(true);
  expect(config.task.agentModelOverrides).toEqual({ reviewer: "smoke/reviewer-model" });
  expect(config.theme).toEqual({ dark: "catppuccin-mocha" });

  const after = run(h, [], KEY);
  expect(after.code).toBe(0);
  const out = lines(after.stdout);
  expect(out).toHaveLength(2);
  expect(out[0]).toStartWith("OK ");
  expect(out[1]).toStartWith("NOTE 4 ");
});

test.skipIf(!HAS_OMP)("another judge provider passes with a NOTE that vstack calibrates against jev, without TypeSafe credentials", () => {
  const other = run(makeHome(CONFIGURED.replace("typesafe/jev-latest", "openrouter/typesafe-ai/jev-1.13")), []);
  expect(lines(other.stdout).map((l) => l.slice(0, 6))).toEqual(["OK vst", "NOTE 2", "NOTE 4"]);
  expect(other.stdout).not.toContain("FAIL 1");
  expect(other.code).toBe(0);

  const r = run(makeHome(CONFIGURED.replace("typesafe/jev-latest", "openrouter/decisions-model")), []);
  expect(r.code).toBe(0);
  const out = lines(r.stdout);
  expect(out.map((l) => l.slice(0, 6))).toEqual(["OK vst", "NOTE 2", "NOTE 4"]);
  expect(out[0]).toContain("1 TypeSafe credentials");
  expect(out[1]).toContain("openrouter/decisions-model");
  expect(out[1]).toContain("jev");
  expect(out[1]).not.toContain("Remedy");
});

test.skipIf(!HAS_OMP).each([
  [" openrouter/typesafe-ai/jev-1.13 , typesafe/jev-1.13.0 ", 0],
  [" typesafe/jev-1.13.0 , openrouter/decisions-model ", 1],
])("the first candidate's provider controls the credential check for %s", (judge, code) => {
  const r = run(makeHome(CONFIGURED.replace("typesafe/jev-latest", JSON.stringify(judge))), []);
  expect(r.code).toBe(code);
  const out = lines(r.stdout);
  expect(out.map((l) => l.slice(0, 6))).toEqual([code === 0 ? "OK vst" : "FAIL 1", "NOTE 2", "NOTE 4"]);
});

test.skipIf(!HAS_OMP)("a pinned TypeSafe judge without credentials fails check 1", () => {
  const r = run(makeHome(CONFIGURED.replace("typesafe/jev-latest", "typesafe/jev-1.13.0")), []);
  expect(r.code).toBe(1);
  const out = lines(r.stdout);
  expect(out.map((l) => l.slice(0, 6))).toEqual(["FAIL 1", "NOTE 2", "NOTE 4"]);
  expect(out[0]).toContain("/login typesafe");
});

test.skipIf(!HAS_OMP)("an unset judge role fails only check 2, and its remedy offers typesafe/jev-latest through --set judge", () => {
  const r = run(makeHome("ratchet:\n  enabled: true\ntask:\n  isolation:\n    enabled: true\n"), []);
  expect(r.code).toBe(1);
  const out = lines(r.stdout);
  expect(out.map((l) => l.slice(0, 6))).toEqual(["FAIL 2", "NOTE 4"]);
  expect(out[0]).toContain("not set");
  expect(out[0]).toContain("typesafe/jev-latest");
});

test.skipIf(!HAS_OMP)("checking never changes the omp config", () => {
  const h = makeHome("worktree:\n  clone: false\n");
  run(h, []);
  expect(readFileSync(join(h.home, ".omp", "agent", "config.yml"), "utf8")).toBe("worktree:\n  clone: false\n");
});

test("usage errors and a missing omp exit 2 and say why", () => {
  const h = makeHome(CONFIGURED);
  const oldFlag = run(h, ["--extension-loaded", "yes"]);
  expect(oldFlag.code).toBe(2);
  expect(oldFlag.stderr).toContain("--extension-loaded");

  const badSet = run(h, ["--set", "everything"]);
  expect(badSet.code).toBe(2);
  expect(badSet.stderr).toContain("everything");

  const noOmp = run(h, [], { PATH: join(dir, "empty-path") });
  expect(noOmp.code).toBe(2);
  expect(noOmp.stderr).toContain("omp");
});

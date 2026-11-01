import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ENV, git } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin/skills/vstack-fan-out/scripts/worker-clone.ts");
const FAKE_OMP = join(import.meta.dir, "support/fake-omp-worktree.ts");
let dir: string;
let repo: string;
let sourceRepo: string;
let base: string;

beforeEach(() => {
  const sourceDir = mkdtempSync(join(process.platform === "darwin" ? "/var/tmp" : tmpdir(), "worker-clone-test-"));
  dir = realpathSync(sourceDir);
  repo = join(dir, "repo");
  sourceRepo = process.platform === "darwin" ? join(sourceDir, "repo") : repo;
  base = join(dir, "wt");
  mkdirSync(repo);
  mkdirSync(base);
  git(repo, "init", "-q");
  mkdirSync(join(dir, "bin"));
  writeFileSync(join(dir, "bin/omp"), `#!/bin/sh\nexec bun ${JSON.stringify(FAKE_OMP)} "$@"\n`, { mode: 0o755 });
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

function status(ids: string[], env: Record<string, string | undefined> = {}) {
  const r = Bun.spawnSync(["bun", SCRIPT, "status", ...ids], {
    cwd: repo,
    env: { ...ENV, PATH: `${join(dir, "bin")}:${ENV.PATH}`, OMP_WORKTREE_DIR: base, ...env },
    stdout: "pipe", stderr: "pipe",
  });
  expect(r.exitCode).toBe(0);
  return JSON.parse(r.stdout.toString());
}

function clone(id: string, suffix = "", owner: unknown = { id }) {
  const wrapper = join(base, `t${Bun.hash(`${sourceRepo}\0${id}`).toString(16).padStart(16, "0").slice(-9)}${suffix}`);
  mkdirSync(join(wrapper, "m"), { recursive: true });
  writeFileSync(join(wrapper, ".omp-isolation-owner.json"), JSON.stringify(owner));
  writeFileSync(join(wrapper, "m/useful.patch"), "keep this work\n");
  return wrapper;
}

test("status locates a present worker without deleting its useful work or unrelated clones", () => {
  const wrapper = clone("Implementer");
  const unrelated = clone("Other");
  const result = status(["Implementer"]);
  expect(result).toMatchObject({ repo, base, listing: { ok: true }, workers: [{ id: "Implementer", clone: join(wrapper, "m"), state: "present", retained: [] }] });
  expect(readFileSync(join(wrapper, "m/useful.patch"), "utf8")).toBe("keep this work\n");
  expect(existsSync(unrelated)).toBe(true);
});

test.skipIf(process.platform !== "darwin")("status locates omp workers whose /var source root differs from Git's /private/var root", () => {
  expect(sourceRepo.startsWith("/var/tmp/")).toBe(true);
  expect(repo).toBe(`/private${sourceRepo}`);
  const present = clone("MacPresent");
  const retained = clone("MacHeld", ".retained-20261102-mac");
  expect(status(["MacPresent", "MacHeld"]).workers).toMatchObject([
    { id: "MacPresent", clone: join(present, "m"), state: "present", retained: [] },
    { id: "MacHeld", state: "retained", retained: [retained] },
  ]);
  expect(readFileSync(join(present, "m/useful.patch"), "utf8")).toBe("keep this work\n");
  expect(readFileSync(join(retained, "m/useful.patch"), "utf8")).toBe("keep this work\n");
});

test("status distinguishes an absent worker from a surviving retained sibling in one batch", () => {
  const retained = clone("Failed", ".retained-20261102-abc");
  const result = status(["Gone", "Failed"]);
  expect(result.workers).toMatchObject([
    { id: "Gone", state: "absent", retained: [] },
    { id: "Failed", state: "retained", retained: [retained] },
  ]);
  expect(readFileSync(join(retained, "m/useful.patch"), "utf8")).toBe("keep this work\n");
});

test("unknown wrapper naming never proves a surviving worker absent", () => {
  const wrapper = clone("Moved");
  renameSync(wrapper, join(base, "new-omp-layout"));
  expect(status(["Moved"]).workers[0].state).toBe("unknown");
  expect(existsSync(join(base, "new-omp-layout/m/useful.patch"))).toBe(true);
});

test("an uninspectable task listing under an unfamiliar layout is unknown, not absent", () => {
  const result = status(["Missing"], { FAKE_OMP_LISTING: JSON.stringify([{ path: join(base, "new-layout"), kind: "task-isolation" }]) });
  expect(result.workers[0].state).toBe("unknown");
});

test("malformed listing entries cannot establish absence", () => {
  const result = status(["Missing"], { FAKE_OMP_LISTING: JSON.stringify([{ path: join(base, "new-layout"), kind: 17 }]) });
  expect(result.listing.ok).toBe(false);
  expect(result.workers[0].state).toBe("unknown");
});

test.each([
  ["foreign", JSON.stringify({ id: "SomeoneElse" })],
  ["malformed", "{broken"],
  ["missing identity", "{}"],
  ["missing marker", null],
])("%s ownership is unknown and leaves work intact", (_label, marker) => {
  const wrapper = clone("Held");
  const path = join(wrapper, ".omp-isolation-owner.json");
  if (marker === null) rmSync(path);
  else writeFileSync(path, marker);
  expect(status(["Held"]).workers[0].state).toBe("unknown");
  expect(readFileSync(join(wrapper, "m/useful.patch"), "utf8")).toBe("keep this work\n");
});

test.each([
  { FAKE_OMP_FAIL: "1" },
  { FAKE_OMP_LISTING: "{" },
  { FAKE_OMP_LISTING: "{}" },
  { FAKE_OMP_LISTING: "[null]" },
  { FAKE_OMP_LISTING: '[{"path":"relative"}]' },
])("failed or malformed listing %j never means removed", (env) => {
  const wrapper = clone("Held");
  const result = status(["Held", "Missing"], env);
  expect(result.listing.ok).toBe(false);
  expect(result.workers.map((worker: { state: string }) => worker.state)).toEqual(["unknown", "unknown"]);
  expect(existsSync(wrapper)).toBe(true);
});

test("disk and listing disagreement remains unknown", () => {
  const wrapper = clone("Held");
  expect(status(["Held"], { FAKE_OMP_HIDE: wrapper.split("/").at(-1) }).workers[0].state).toBe("unknown");
  rmSync(wrapper, { recursive: true });
  expect(status(["Held"], { FAKE_OMP_LISTING: JSON.stringify([{ path: wrapper, kind: "task-isolation" }]) }).workers[0].state).toBe("unknown");
});

test("retained siblings prevent removal proof even when the original survives or the listing omits them", () => {
  const original = clone("Held");
  const retained = clone("Held", ".retained-20261102-xyz");
  expect(status(["Held"]).workers[0]).toMatchObject({ state: "retained", retained: [retained] });
  rmSync(original, { recursive: true });
  expect(status(["Held"], { FAKE_OMP_HIDE: retained.split("/").at(-1) }).workers[0].state).toBe("retained");
  writeFileSync(join(retained, ".omp-isolation-owner.json"), '{"id":"Foreign"}');
  expect(status(["Held"]).workers[0].state).toBe("unknown");
  expect(existsSync(retained)).toBe(true);
});

test("uninspectable base and symlinked wrappers are unknown", () => {
  const blocked = join(dir, "not-a-directory");
  writeFileSync(blocked, "blocked");
  expect(status(["Missing"], { OMP_WORKTREE_DIR: blocked }).workers[0].state).toBe("unknown");
  const wrapper = clone("Held");
  const moved = join(dir, "held");
  renameSync(wrapper, moved);
  symlinkSync(moved, wrapper);
  expect(status(["Held"]).workers[0].state).toBe("unknown");
  expect(existsSync(join(moved, "m/useful.patch"))).toBe(true);
});

test("configured base and canonical aliases use the same inventory", () => {
  const wrapper = clone("Held");
  const alias = join(dir, "alias");
  symlinkSync(base, alias);
  expect(status(["Held"], { OMP_WORKTREE_DIR: undefined, FAKE_OMP_BASE: alias })).toMatchObject({
    base, workers: [{ state: "present", clone: join(wrapper, "m") }],
  });
  expect(status(["Held"], { OMP_WORKTREE_DIR: alias }).workers[0].state).toBe("present");
});

test("unset configuration uses the home worktree base without creating it", () => {
  const home = join(dir, "home");
  mkdirSync(home);
  const fallback = join(home, ".omp/wt");
  expect(status(["Missing"], { OMP_WORKTREE_DIR: undefined, FAKE_OMP_BASE: "(not set)", HOME: home })).toMatchObject({
    base: fallback, workers: [{ state: "absent" }],
  });
  expect(existsSync(fallback)).toBe(false);
});

test("listing without checkout kinds cannot establish absence under an unknown layout", () => {
  const result = status(["Missing"], { FAKE_OMP_LISTING: JSON.stringify([{ path: join(base, "new-layout") }]) });
  expect(result.listing.ok).toBe(false);
  expect(result.workers[0].state).toBe("unknown");
});

test("a base that cannot be canonicalized reports unknown without claiming removal", () => {
  const loop = join(dir, "loop");
  symlinkSync(loop, loop);
  const result = status(["Missing"], { OMP_WORKTREE_DIR: loop });
  expect(result.workers[0].state).toBe("unknown");
});

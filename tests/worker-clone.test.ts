import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeExecutable } from "./support/executable.ts";
import { ENV, git } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin/skills/vstack-fan-out/scripts/worker-clone.ts");
const FAKE = join(import.meta.dir, "support/fake-ovnfs.ts");
let dir: string;
let repo: string;
let sourceRepo: string;
let base: string;
let entries: { name: string; path: string; source: string; dirty: boolean }[];

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
  for (const name of ["ovnfs", "omp"]) writeExecutable(join(dir, "bin", name), "bun", `await import(${JSON.stringify(FAKE)});`);
  entries = [];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function status(ids: string[], before?: string, env: Record<string, string | undefined> = {}) {
  writeFileSync(join(dir, "checkouts.json"), JSON.stringify(entries));
  const r = Bun.spawnSync(["bun", SCRIPT, "status", ...ids, ...(before ? ["--before", before] : [])], {
    cwd: repo,
    env: { ...ENV, PATH: `${join(dir, "bin")}:${ENV.PATH}`, OMP_WORKTREE_DIR: base, FAKE_OVNFS_ROOT: dir, ...env },
    stdout: "pipe", stderr: "pipe",
  });
  expect(r.exitCode).toBe(0);
  return JSON.parse(r.stdout.toString());
}
function worker(id: string) {
  const wrapper = join(base, `t${Bun.hash(`${sourceRepo}\0${id}`).toString(16).padStart(16, "0").slice(-9)}`);
  const record = join(wrapper, ".omp-ovnfs-checkout.json");
  const name = `omp-${id.toLowerCase()}-abc123`;
  const path = join(dir, "mount", name);
  mkdirSync(wrapper, { recursive: true });
  mkdirSync(path, { recursive: true });
  writeFileSync(record, JSON.stringify({ command: join(dir, "bin/ovnfs"), checkout: name }));
  writeFileSync(join(path, "useful.patch"), "keep this work\n");
  entries.push({ name, path, source: repo, dirty: true });
  return { name, path, record };
}

test("status finds the ovnfs checkout named by the worker run record without touching work", () => {
  const identity = worker("Implementer");
  const other = worker("Other");
  expect(status(["Implementer"])).toMatchObject({ repo, base, listing: { ok: true }, workers: [{ id: "Implementer", clone: identity.path, identity, state: "present" }] });
  expect(readFileSync(join(identity.path, "useful.patch"), "utf8")).toBe("keep this work\n");
  expect(existsSync(other.path)).toBe(true);
});

test("status keeps a worker present when a different ovnfs is on PATH", () => {
  const identity = worker("Configured");
  const configured = join(dir, "configured-ovnfs");
  writeExecutable(configured, "bun", `await import(${JSON.stringify(FAKE)});`);
  writeExecutable(join(dir, "bin/ovnfs"), "bun", `console.log('{"checkouts":[]}');`);
  expect(status(["Configured"], undefined, { FAKE_OVNFS_PATH: configured })).toMatchObject({
    listing: { ok: true, command: configured }, workers: [{ state: "present", identity }],
  });
});

test("status proves absence only against a saved present identity after both items disappear", () => {
  const identity = worker("Gone");
  const before = join(dir, "before.json");
  writeFileSync(before, JSON.stringify(status(["Gone"])));
  entries = [];
  rmSync(identity.record);
  rmSync(identity.path, { recursive: true });
  expect(status(["Gone"], before).workers[0]).toMatchObject({ state: "absent", identity, clone: identity.path });
  expect(status(["Gone"]).workers[0].state).toBe("unknown");
});

test.each(["record", "checkout", "directory"])("missing %s before release stays unknown and preserves other work", (missing) => {
  const identity = worker("Held");
  if (missing === "record") rmSync(identity.record);
  if (missing === "checkout") entries = [];
  if (missing === "directory") rmSync(identity.path, { recursive: true });
  expect(status(["Held"]).workers[0].state).toBe("unknown");
  if (missing !== "directory") expect(readFileSync(join(identity.path, "useful.patch"), "utf8")).toBe("keep this work\n");
});

test.each(["record", "checkout", "both"])("%s surviving release cannot prove removal", (survivor) => {
  const identity = worker("Held");
  const before = join(dir, "before.json");
  writeFileSync(before, JSON.stringify(status(["Held"])));
  if (survivor !== "record" && survivor !== "both") rmSync(identity.record);
  if (survivor !== "checkout" && survivor !== "both") entries = [];
  rmSync(identity.path, { recursive: true });
  expect(status(["Held"], before).workers[0]).toMatchObject({ state: "unknown", identity });
});

test("the successful ovnfs listing and missing run record prove removal even if an empty mount directory remains", () => {
  const identity = worker("Gone");
  const before = join(dir, "before.json");
  writeFileSync(before, JSON.stringify(status(["Gone"])));
  entries = [];
  rmSync(identity.record);
  rmSync(join(identity.path, "useful.patch"));
  expect(status(["Gone"], before).workers[0]).toMatchObject({ state: "absent", identity });
});

test.each([
  { FAKE_OVNFS_LIST_FAIL: "1" },
  { FAKE_OVNFS_LISTING: "{" },
  { FAKE_OVNFS_LISTING: "{}" },
  { FAKE_OVNFS_LISTING: '{"checkouts":[null]}' },
  { FAKE_OVNFS_LISTING: '{"checkouts":[{\"name\":\"omp-held\",\"path\":\"relative\",\"source\":\"/repo\"}]}' },
])("failed listing %j cannot prove presence or removal", (env) => {
  const identity = worker("Held");
  const before = join(dir, "before.json");
  writeFileSync(before, JSON.stringify(status(["Held"])));
  for (const prior of [undefined, before]) {
    const result = status(["Held"], prior, env);
    expect(result.listing.ok).toBe(false);
    expect(result.workers[0].state).toBe("unknown");
  }
  expect(existsSync(identity.path)).toBe(true);
});

test.each(["{", "{}", '{"command":"ovnfs","checkout":"foreign"}'])("invalid run record %s stays unknown", (value) => {
  const identity = worker("Held");
  writeFileSync(identity.record, value);
  expect(status(["Held"]).workers[0].state).toBe("unknown");
  expect(existsSync(identity.path)).toBe(true);
});

test("a listing from another source cannot identify this worker", () => {
  worker("Held");
  entries[0].source = dir;
  expect(status(["Held"]).workers[0].state).toBe("unknown");
});

test("an unknown saved status cannot become an absence proof", () => {
  const before = join(dir, "before.json");
  writeFileSync(before, JSON.stringify(status(["Missing"])));
  expect(status(["Missing"], before).workers[0].state).toBe("unknown");
});

import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupOvnfsLocations, scanCheckoutLocations } from "../plugin/skills/vstack-fan-out/scripts/checkout-locator.ts";
import { git } from "./support/fixture.ts";

let dir: string;
let base: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "checkout-locator-cleanup-")));
  base = join(dir, "wt");
  mkdirSync(base);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("every native omp entry remains accounted for without making unsupported entries actionable", () => {
  const linked = join(base, "linked");
  mkdirSync(linked);
  writeFileSync(join(linked, ".git"), "gitdir: /unused-fixture-gitdir\n");
  const clone = join(base, "repo", "clone");
  mkdirSync(join(clone, ".git"), { recursive: true });
  const task = join(base, "task");
  mkdirSync(join(task, "m", ".git"), { recursive: true });
  writeFileSync(join(task, ".omp-isolation-owner.json"), JSON.stringify({ id: "task-1" }));
  const wrapper = join(base, "metadata-only");
  mkdirSync(wrapper);
  writeFileSync(join(wrapper, ".omp-ovnfs-checkout.json"), JSON.stringify({ checkout: "omp-old", command: "ovnfs" }));
  const markerOnly = join(base, "marker-only");
  mkdirSync(markerOnly);
  writeFileSync(join(markerOnly, ".omp-isolation-owner.json"), JSON.stringify({ id: "task-2" }));
  const unsupported = join(base, "unsupported");
  mkdirSync(unsupported);
  const missing = join(base, "missing");
  const foreign = join(dir, "outside-base");
  mkdirSync(join(foreign, ".git"), { recursive: true });
  const deep = join(base, "group", "nested", "too-deep");
  mkdirSync(join(deep, ".git"), { recursive: true });

  const locations = scanCheckoutLocations(base, {
    ok: true,
    paths: new Set([linked, clone, task, wrapper, markerOnly, unsupported, missing, foreign, deep]),
  });
  expect(new Set(locations.map((location) => location.entry))).toEqual(new Set([
    linked, clone, task, wrapper, markerOnly, unsupported, missing, foreign, deep,
  ]));
  expect(locations.filter((location) => [linked, clone, task].includes(location.entry))).toEqual([
    { path: linked, entry: linked, kind: "worktree", gaps: [] },
    { path: clone, entry: clone, kind: "standalone-clone", gaps: [] },
    { path: join(task, "m"), entry: task, kind: "task-isolation", gaps: [] },
  ]);
  for (const entry of [wrapper, markerOnly, unsupported, missing, foreign, deep]) {
    const location = locations.find((location) => location.entry === entry);
    expect(location).toMatchObject({ path: entry, entry, kind: "excluded" });
    expect(location!.gaps.length).toBeGreaterThan(0);
    expect(location!.gaps.every((gap) => gap.trim().length > 0)).toBe(true);
  }
});

test("every native ovnfs entry is visible while named, verifier, foreign and missing entries stay protected", () => {
  const source = join(dir, "source");
  const foreignSource = join(dir, "foreign-source");
  mkdirSync(source);
  mkdirSync(foreignSource);
  git(foreignSource, "init", "-q", "-b", "main");
  const checkouts = [
    { name: "omp-supported", path: join(dir, "supported"), source },
    { name: "personal", path: join(dir, "personal"), source },
    { name: "verifier-507", path: join(dir, "verifier"), source },
    { name: "omp-foreign", path: join(dir, "foreign"), source: foreignSource },
    { name: "omp-unknown", path: join(dir, "unknown"), source: join(dir, "missing-source") },
    { name: "omp-missing", path: join(dir, "missing-checkout"), source },
  ];
  for (const checkout of checkouts.slice(0, -1)) mkdirSync(checkout.path);
  const record = join(base, "t-supported", ".omp-ovnfs-checkout.json");
  mkdirSync(join(base, "t-supported"));
  writeFileSync(record, JSON.stringify({ checkout: "omp-supported", command: "ovnfs" }));

  const locations = cleanupOvnfsLocations(base, { ok: true, checkouts }, new Set([source]));
  expect(locations.map((location) => location.name)).toEqual([
    "omp-supported", "personal", "verifier-507", "omp-foreign", "omp-unknown", "omp-missing",
  ]);
  expect(locations[0]).toEqual({
    path: checkouts[0]!.path, entry: checkouts[0]!.path, kind: "ovnfs", name: "omp-supported",
    source, record, gaps: [],
  });
  for (const location of locations.slice(1)) {
    expect(location.gaps.length).toBeGreaterThan(0);
    expect(location.gaps.every(({ message }) => message.trim().length > 0)).toBe(true);
  }
  expect(locations.find((location) => location.name === "personal")!.gaps).toContainEqual(
    expect.objectContaining({ kind: "scope", message: expect.stringContaining("outside") }),
  );
  expect(locations.find((location) => location.name === "omp-foreign")!.gaps).toContainEqual(
    expect.objectContaining({ kind: "origin", message: expect.stringContaining("origin") }),
  );
  expect(locations.find((location) => location.name === "omp-missing")!.gaps).toContainEqual(
    expect.objectContaining({ kind: "directory", message: expect.stringContaining("directory is missing") }),
  );
});

test("an unavailable native listing retains supported local discovery with an explicit evidence gap", () => {
  const linked = join(base, "linked");
  mkdirSync(linked);
  writeFileSync(join(linked, ".git"), "gitdir: /unused-fixture-gitdir\n");
  const nested = join(base, "project", "clone");
  mkdirSync(join(nested, ".git"), { recursive: true });
  const task = join(base, "task");
  mkdirSync(join(task, "merged", ".git"), { recursive: true });
  writeFileSync(join(task, ".omp-isolation-owner.json"), JSON.stringify({ id: "local-task" }));
  writeFileSync(join(task, "design.md"), "preserve this wrapper artifact\n");
  const listing = { ok: false, paths: new Set<string>(), reason: "native omp listing is unavailable in this fixture" };

  const locations = scanCheckoutLocations(base, listing);
  expect(locations.map((location) => [location.path, location.entry, location.kind])).toEqual([
    [linked, linked, "worktree"],
    [nested, nested, "standalone-clone"],
    [join(task, "merged"), task, "task-isolation"],
  ]);
  for (const location of locations) expect(location.gaps.join(" ")).toContain(listing.reason);
  expect(locations.find((location) => location.entry === task)!.gaps.join(" ")).toContain("design.md");
});

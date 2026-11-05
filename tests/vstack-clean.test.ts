// vstack-clean's script run as a process (spec #63, Testing Decisions, Seam 1): retention by the newest mtime
// anywhere in an entry, no symlink following, and empty-parent pruning. The fake home goes in through --home only.

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, lstatSync, lutimesSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ENV } from "./support/fixture.ts";

const CLEAN = join(import.meta.dir, "..", "plugin", "skills", "vstack-tmp", "scripts", "clean.ts");
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

let dir: string;
let home: string;
let root: string;
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "vstack-clean-test-")));
  home = join(dir, "home");
  root = join(home, ".vstack", "tmp");
  mkdirSync(root, { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

interface Listed {
  path: string;
  repo_key: string;
  kind: string;
  entry: string;
  newest_mtime: string;
  age_days: number;
  size: number;
}

function clean(...args: string[]) {
  const r = Bun.spawnSync(["bun", CLEAN, ...args], { cwd: dir, env: ENV, stdout: "pipe", stderr: "pipe" });
  const stdout = r.stdout.toString();
  return { code: r.exitCode, stdout, stderr: r.stderr.toString(), json: r.exitCode === 0 ? JSON.parse(stdout) : undefined };
}
const list = (olderThan = "14d") => clean("--home", home, "--older-than", olderThan);
const listedPaths = (olderThan?: string) => (list(olderThan).json.entries as Listed[]).map((e) => e.path).sort();

/** Writes a file, creating parents, and sets its mtime. */
function file(rel: string, content: string, age: number) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  utimesSync(p, daysAgo(age), daysAgo(age));
  return p;
}
/** Sets a directory's mtime after its children were written (writing a child moves it). */
function age(rel: string, days: number) {
  utimesSync(join(root, rel), daysAgo(days), daysAgo(days));
}

test("lists entries at depth 3 older than the TTL, with their size, and leaves newer ones out", () => {
  file("shop-aaaaaa/explain/old.html", "12345", 20);
  file("shop-aaaaaa/verify/run1/notes.md", "abc", 30);
  file("shop-aaaaaa/verify/run1/shots/a.png", "1234567", 30);
  age("shop-aaaaaa/verify/run1/shots", 30);
  age("shop-aaaaaa/verify/run1", 30);
  file("shop-aaaaaa/explain/new.html", "x", 2);
  file("_global/handoff/recent.md", "x", 13);

  const r = list();
  expect(r.code).toBe(0);
  const byEntry = Object.fromEntries((r.json.entries as Listed[]).map((e) => [e.entry, e]));
  expect(Object.keys(byEntry).sort()).toEqual(["old.html", "run1"]);
  expect(byEntry["run1"]).toMatchObject({ repo_key: "shop-aaaaaa", kind: "verify", path: join(root, "shop-aaaaaa/verify/run1"), size: 10, age_days: 30 });
  expect(byEntry["old.html"]).toMatchObject({ repo_key: "shop-aaaaaa", kind: "explain", size: 5, age_days: 20 });
  expect(r.json.kept).toBe(2);
});

test("one recent file anywhere inside an entry keeps the whole entry", () => {
  file("shop-aaaaaa/hillclimb/log/old.tsv", "a", 40);
  file("shop-aaaaaa/hillclimb/log/deep/er/still-written.tsv", "b", 1);
  for (const d of ["log/deep/er", "log/deep", "log"]) age(`shop-aaaaaa/hillclimb/${d}`, 40);
  expect(listedPaths()).toEqual([]);
  // Once that file is old too, the entry expires.
  utimesSync(join(root, "shop-aaaaaa/hillclimb/log/deep/er/still-written.tsv"), daysAgo(40), daysAgo(40));
  age("shop-aaaaaa/hillclimb/log/deep/er", 40);
  expect(listedPaths()).toEqual([join(root, "shop-aaaaaa/hillclimb/log")]);
});

test("--older-than overrides the 90-day TTL, and the default is 90 days", () => {
  file("k-000000/explain/a.html", "a", 60);
  expect(listedPaths("90d")).toEqual([]);
  expect(listedPaths("30d")).toEqual([join(root, "k-000000/explain/a.html")]);
  expect(listedPaths("4w")).toEqual([join(root, "k-000000/explain/a.html")]);
  expect(listedPaths("30")).toEqual([join(root, "k-000000/explain/a.html")]);
  expect(listedPaths("2000h")).toEqual([]);
  const r = clean("--home", home);
  expect(r.code).toBe(0);
  expect(r.json.older_than).toBe("90d");
  expect(r.json.entries).toEqual([]);
  file("k-000000/explain/b.html", "b", 91);
  expect((clean("--home", home).json.entries as Listed[]).map((e) => e.entry)).toEqual(["b.html"]);
});

test("a paused flow folder is kept for 90 days by default, then listed and deleted as one entry", () => {
  const flow = "shop-aaaaaa/grilling/shop-151";
  const files = ["state.jsonl", "state.html", "flow.json", "figures/flow.svg"];
  const setAge = (days: number) => {
    for (const f of files) file(`${flow}/${f}`, "x", days);
    age(`${flow}/figures`, days);
    age(flow, days);
  };
  setAge(60);
  expect(clean("--home", home).json.entries).toEqual([]);

  setAge(100);
  const listed = clean("--home", home).json.entries as Listed[];
  expect(listed).toHaveLength(1);
  expect(listed[0]).toMatchObject({ path: join(root, flow), kind: "grilling", entry: "shop-151", size: files.length });
  const r = clean("--home", home, "--delete", join(root, flow));
  expect(r.code).toBe(0);
  expect(r.json.deleted).toEqual([join(root, flow)]);
  expect(existsSync(join(root, flow))).toBe(false);
});

test("a home with no Scratch lists nothing", () => {
  rmSync(join(home, ".vstack"), { recursive: true });
  const r = list();
  expect(r.code).toBe(0);
  expect(r.json.entries).toEqual([]);
});

test("symlinks are never followed: not for the newest mtime, the size, or the delete", () => {
  const outside = join(dir, "outside");
  mkdirSync(outside);
  writeFileSync(join(outside, "precious.txt"), "fresh and big ".repeat(100));
  // An entry dir holding a link to a fresh outside dir.
  file("shop-aaaaaa/verify/run2/notes.md", "abc", 30);
  const inner = join(root, "shop-aaaaaa/verify/run2/data");
  symlinkSync(outside, inner);
  lutimesSync(inner, daysAgo(30), daysAgo(30));
  age("shop-aaaaaa/verify/run2", 30);
  // An entry that is itself a link to the same outside dir.
  mkdirSync(join(root, "shop-aaaaaa/explorer"), { recursive: true });
  const linkEntry = join(root, "shop-aaaaaa/explorer/session-link");
  symlinkSync(outside, linkEntry);
  lutimesSync(linkEntry, daysAgo(30), daysAgo(30));

  const listed = list().json.entries as Listed[];
  expect(listed.map((e) => e.path).sort()).toEqual([linkEntry, join(root, "shop-aaaaaa/verify/run2")]);
  writeFileSync(join(outside, "precious.txt"), "fresh and big ".repeat(10000));
  const enlarged = list().json.entries as Listed[];
  for (const entry of listed) expect(enlarged.find((e) => e.path === entry.path)!.size).toBe(entry.size);

  const r = clean("--home", home, "--older-than", "14d", "--delete", linkEntry, join(root, "shop-aaaaaa/verify/run2"));
  expect(r.code).toBe(0);
  expect(r.json.deleted.sort()).toEqual([linkEntry, join(root, "shop-aaaaaa/verify/run2")]);
  expect(existsSync(join(root, "shop-aaaaaa/verify/run2"))).toBe(false);
  expect(() => lstatSync(linkEntry)).toThrow();
  expect(readdirSync(outside)).toEqual(["precious.txt"]);
});

test("a linked key or kind dir is not walked", () => {
  const outside = join(dir, "outside-key");
  mkdirSync(join(outside, "explain"), { recursive: true });
  writeFileSync(join(outside, "explain", "old.html"), "x");
  utimesSync(join(outside, "explain", "old.html"), daysAgo(30), daysAgo(30));
  symlinkSync(outside, join(root, "linked-key"));
  expect(listedPaths()).toEqual([]);
});

test.each(["Scratch root", "Scratch ancestor"])("a linked %s cannot lead deletion outside home", (component) => {
  const outside = join(dir, "outside");
  const linked = component === "Scratch root" ? root : dirname(root);
  const outsideRoot = component === "Scratch root" ? outside : join(outside, "tmp");
  const precious = join(outsideRoot, "shop-aaaaaa", "explain", "old.html");
  mkdirSync(dirname(precious), { recursive: true });
  writeFileSync(precious, "keep me");
  utimesSync(precious, daysAgo(30), daysAgo(30));
  rmSync(linked, { recursive: true });
  symlinkSync(outside, linked);

  const result = clean("--home", home, "--delete", join(root, "shop-aaaaaa", "explain", "old.html"));
  expect(result.code).toBe(2);
  expect(existsSync(precious)).toBe(true);
});

test("deleting prunes the kind and key dirs it empties, and keeps the Scratch root", () => {
  file("shop-aaaaaa/explain/a.html", "a", 30);
  file("shop-aaaaaa/explain/b.html", "b", 30);
  file("shop-aaaaaa/verify/run1/notes.md", "n", 30);
  age("shop-aaaaaa/verify/run1", 30);
  file("other-bbbbbb/handoff/h.md", "h", 30);
  file("other-bbbbbb/handoff/keep.md", "k", 1);

  const r = clean("--home", home, "--older-than", "14d", "--delete", ...listedPaths());
  expect(r.code).toBe(0);
  expect(r.json.deleted).toHaveLength(4);
  expect(existsSync(join(root, "shop-aaaaaa"))).toBe(false);
  expect(r.json.pruned.sort()).toEqual([join(root, "shop-aaaaaa"), join(root, "shop-aaaaaa/explain"), join(root, "shop-aaaaaa/verify")]);
  expect(readdirSync(join(root, "other-bbbbbb/handoff"))).toEqual(["keep.md"]);
  expect(existsSync(root)).toBe(true);
});

test("an entry written to since the listing is skipped, not deleted", () => {
  const p = file("shop-aaaaaa/explain/a.html", "a", 30);
  const [listed] = listedPaths();
  utimesSync(p, new Date(), new Date());
  const r = clean("--home", home, "--older-than", "14d", "--delete", listed);
  expect(r.code).toBe(0);
  expect(r.json.deleted).toEqual([]);
  expect(r.json.skipped).toEqual([{ path: p, reason: "newer than the TTL" }]);
  expect(existsSync(p)).toBe(true);
});

test("a delete path that is not an entry under the Scratch root exits 2 and deletes nothing", () => {
  const p = file("shop-aaaaaa/explain/a.html", "a", 30);
  for (const bad of [join(root, "shop-aaaaaa"), join(root, "shop-aaaaaa/explain"), join(dir, "elsewhere"), join(root, "shop-aaaaaa/explain/../../x/y/z/w"), "relative/a/b"]) {
    const r = clean("--home", home, "--older-than", "14d", "--delete", p, bad);
    expect(r.code).toBe(2);
  }
  expect(existsSync(p)).toBe(true);
});

test("a listing larger than a pipe buffer reaches a reader that starts after the script exits", async () => {
  for (let i = 0; i < 400; i++) file(`shop-aaaaaa/explain/entry-${String(i).padStart(3, "0")}.html`, "x", 30);
  const proc = Bun.spawn(["sh", "-c", 'bun "$0" --home "$1" --older-than 14d | (sleep 1; cat)', CLEAN, home], { cwd: dir, env: ENV, stdout: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  expect(await proc.exited).toBe(0);
  expect(JSON.parse(stdout).entries).toHaveLength(400);
});

test("--home is required and --older-than must be a duration", () => {
  expect(clean("--older-than", "14d").code).toBe(2);
  expect(clean("--home", home, "--older-than", "soon").code).toBe(2);
  expect(clean("--home", home, "--older-than", "-3d").code).toBe(2);
});

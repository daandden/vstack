// vstack-tmp's path script run as a process (spec #63, Testing Decisions, Seam 1): the repo-key rule.
// The fake home goes in through --home only; nothing touches the real home.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ENV, git } from "./support/fixture.ts";

const PATH_SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "vstack-tmp", "scripts", "path.ts");

let dir: string;
let home: string;
beforeAll(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "vstack-tmp-test-")));
  home = join(dir, "home");
  mkdirSync(home);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function runPath(cwd: string, ...args: string[]) {
  const r = Bun.spawnSync(["bun", PATH_SCRIPT, "--home", home, ...args], { cwd, env: ENV, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}

/** A repo with one commit at `dir/<name>`. */
function makeRepo(parent: string, name: string): string {
  const repo = join(parent, name);
  mkdirSync(repo, { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  git(repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init");
  return repo;
}

const scratchRoot = () => join(home, ".vstack", "tmp");

test("no argument prints and creates the project Scratch dir: main checkout basename plus 6 hex chars", () => {
  const repo = makeRepo(join(dir, "a"), "shop");
  const r = runPath(repo);
  expect(r.code).toBe(0);
  const printed = r.stdout.trim();
  expect(printed).toMatch(new RegExp(`^${scratchRoot()}/shop-[0-9a-f]{6}/$`));
  expect(statSync(printed).isDirectory()).toBe(true);
});

test("a subdirectory of the checkout gets the same key", () => {
  const repo = makeRepo(join(dir, "b"), "shop");
  mkdirSync(join(repo, "src", "lib"), { recursive: true });
  expect(runPath(join(repo, "src", "lib")).stdout).toBe(runPath(repo).stdout);
});

test("linked worktrees share the main checkout's key, whatever their own dir name", () => {
  const repo = makeRepo(join(dir, "c"), "shop");
  const wt = join(dir, "c", "elsewhere", "shop-feature-x");
  git(repo, "worktree", "add", "-q", "-b", "feat", wt);
  const main = runPath(repo);
  const linked = runPath(wt);
  expect(linked.code).toBe(0);
  expect(linked.stdout).toBe(main.stdout);
  expect(linked.stdout.trim()).toMatch(/\/shop-[0-9a-f]{6}\/$/);
});

test("two repos with the same basename get different keys", () => {
  const one = makeRepo(join(dir, "d1"), "app");
  const two = makeRepo(join(dir, "d2"), "app");
  const k1 = runPath(one).stdout.trim();
  const k2 = runPath(two).stdout.trim();
  expect(k1).toMatch(/\/app-[0-9a-f]{6}\/$/);
  expect(k2).toMatch(/\/app-[0-9a-f]{6}\/$/);
  expect(k1).not.toBe(k2);
});

test("outside a git repo the key is _global", () => {
  const plain = join(dir, "not-a-repo");
  mkdirSync(plain);
  const r = runPath(plain);
  expect(r.code).toBe(0);
  expect(r.stdout.trim()).toBe(`${scratchRoot()}/_global/`);
  expect(statSync(r.stdout.trim()).isDirectory()).toBe(true);
});

test("a kind prints and creates that kind's dir under the Scratch dir", () => {
  const repo = makeRepo(join(dir, "e"), "shop");
  const scratch = runPath(repo).stdout.trim();
  const r = runPath(repo, "explain");
  expect(r.code).toBe(0);
  expect(r.stdout.trim()).toBe(`${scratch}explain/`);
  expect(statSync(r.stdout.trim()).isDirectory()).toBe(true);
});

test("a kind that is not one lowercase path segment exits 2 and creates nothing", () => {
  const plain = join(dir, "bad-kind");
  mkdirSync(plain);
  for (const kind of ["../escape", "a/b", "Explain", ""]) {
    const r = runPath(plain, kind);
    expect(r.code).toBe(2);
    expect(r.stdout).toBe("");
  }
  expect(existsSync(join(scratchRoot(), "escape"))).toBe(false);
  expect(existsSync(join(scratchRoot(), "_global", "a"))).toBe(false);
});

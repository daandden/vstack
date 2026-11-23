// vstack-tmp's path script run as a process (spec #63, Testing Decisions, Seam 1): the repo-key rule.
// The fake home goes in through --home only; nothing touches the real home.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ENV, git } from "./support/fixture.ts";

const PATH_SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "vstack-tmp", "scripts", "path.ts");
const PUBLISH_SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "to-tickets", "scripts", "publish.ts");
const EMPTY_GIT_CAPTURE = join(import.meta.dir, "support", "empty-git-capture.ts");
const PAUSE_SCRATCH_MARK = join(import.meta.dir, "support", "pause-scratch-mark.ts");
const SESSION = "019abcde-1234-7abc-8def-000000000001";

let dir: string;
let home: string;
beforeAll(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "vstack-tmp-test-")));
  home = join(dir, "home");
  mkdirSync(home);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function invokePath(cwd: string, isolatedHome: string, id?: string, ...args: string[]) {
  const r = Bun.spawnSync([process.execPath, PATH_SCRIPT, "--home", isolatedHome, ...args], {
    cwd, env: { ...ENV, PI_SESSION_ID: id }, stdout: "pipe", stderr: "pipe",
  });
  return { code: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}

function runPath(cwd: string, ...args: string[]) {
  return invokePath(cwd, home, undefined, ...args);
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

test.each(["repository", "outside-repository"] as const)("real Git %s replies survive empty returned capture buffers", (location) => {
  const fixture = join(dir, `capture-${location}`);
  const cwd = location === "repository" ? makeRepo(fixture, "shop") : join(fixture, "plain");
  mkdirSync(cwd, { recursive: true });
  const isolatedHome = join(fixture, "home");
  const temporary = join(fixture, "temporary");
  mkdirSync(isolatedHome);
  mkdirSync(temporary);
  const invoke = (preload: boolean) => Bun.spawnSync([
    "bun", ...(preload ? ["--preload", EMPTY_GIT_CAPTURE] : []), PATH_SCRIPT, "--home", isolatedHome,
  ], { cwd, env: { ...ENV, TMPDIR: temporary }, stdout: "pipe", stderr: "pipe" });
  const baseline = invoke(false);
  expect(baseline.exitCode).toBe(0);
  const expected = baseline.stdout.toString();
  if (location === "repository") expect(expected).toMatch(/\/shop-[0-9a-f]{6}\/\n$/);
  else expect(expected).toBe(`${join(isolatedHome, ".vstack", "tmp", "_global")}/\n`);
  const result = invoke(true);
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe(expected);
  expect(statSync(result.stdout.toString().trim()).isDirectory()).toBe(true);
  expect(readdirSync(join(isolatedHome, ".vstack", "tmp"))).toEqual([expected.trim().split("/").at(-2)!]);
  expect(readdirSync(temporary)).toEqual([]);
});

test.each([
  ["empty-success", 0, false],
  ["operational-failure", 73, false],
  ["operational-exit128", 128, false],
  ["empty-worktree-success", 0, true],
  ["worktree-operational-failure", 73, true],
] as const)("Git %s cannot select a storage namespace", (name, exit, worktree) => {
  const fixture = join(dir, name);
  const repo = makeRepo(fixture, "shop");
  const isolatedHome = join(fixture, "home");
  const bin = join(fixture, "bin");
  mkdirSync(isolatedHome);
  mkdirSync(bin);
  const fakeGit = join(bin, "git");
  writeFileSync(fakeGit, `#!/bin/sh\n${worktree ? 'if [ "$1" = rev-parse ]; then printf \'%s\\n\' "$IDENTITY_TEST_COMMON"; exit 0; fi\n' : ""}exit ${exit}\n`);
  chmodSync(fakeGit, 0o755);
  const r = Bun.spawnSync(["bun", PATH_SCRIPT, "--home", isolatedHome], {
    cwd: repo,
    env: { ...ENV, PATH: `${bin}:${ENV.PATH}`, IDENTITY_TEST_COMMON: join(repo, ".git") },
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(r.exitCode).not.toBe(0);
  expect(r.stdout.toString()).toBe("");
  expect(existsSync(join(isolatedHome, ".vstack"))).toBe(false);
});

test("a Git spawn failure leaves no temporary files or storage namespace", () => {
  const fixture = join(dir, "spawn-failure");
  const repo = makeRepo(fixture, "shop");
  const isolatedHome = join(fixture, "home");
  const temporary = join(fixture, "temporary");
  mkdirSync(isolatedHome);
  mkdirSync(temporary);
  const result = Bun.spawnSync([process.execPath, PATH_SCRIPT, "--home", isolatedHome], {
    cwd: repo, env: { ...ENV, PATH: temporary, TMPDIR: temporary }, stdout: "pipe", stderr: "pipe",
  });
  expect(result.exitCode).not.toBe(0);
  expect(result.stdout.toString()).toBe("");
  expect(existsSync(join(isolatedHome, ".vstack"))).toBe(false);
  expect(readdirSync(temporary)).toEqual([]);
});

test("default mode creates and reopens only a marked session folder for an ordinary kind", () => {
  const repo = makeRepo(dir, "default-mode");
  const isolatedHome = join(repo, "scratch-home");
  const run = (id?: string) => invokePath(repo, isolatedHome, id, "explain");
  for (const id of [undefined, "", "../escape", `${SESSION}\n`]) {
    const result = run(id);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("PI_SESSION_ID");
    expect(result.stdout).toBe("");
    expect(existsSync(isolatedHome)).toBe(false);
  }
  const scratch = invokePath(repo, isolatedHome).stdout.trim();
  const session = join(scratch, "explain", SESSION);
  mkdirSync(session, { recursive: true });
  const emptyInode = statSync(session).ino;
  expect(run(SESSION)).toMatchObject({ code: 2, stdout: "" });
  expect(statSync(session).ino).toBe(emptyInode);
  expect(readdirSync(session)).toEqual([]);
  writeFileSync(join(session, "keep.txt"), "old scratch");
  const refused = run(SESSION);
  expect(refused.code).toBe(2);
  expect(refused.stderr).toContain("unmarked");
  expect(readdirSync(session)).toEqual(["keep.txt"]);
  expect(readFileSync(join(session, "keep.txt"), "utf8")).toBe("old scratch");
  rmSync(session, { recursive: true });

  expect(run(SESSION)).toMatchObject({ code: 0, stdout: `${session}/\n` });
  expect(readFileSync(join(session, ".vstack-scratch-session"), "utf8")).toBe(`${SESSION}\n`);
  writeFileSync(join(session, "notes.md"), "live scratch");
  expect(run(SESSION)).toMatchObject({ code: 0, stdout: `${session}/\n` });
  expect(readFileSync(join(session, "notes.md"), "utf8")).toBe("live scratch");
});

test("subagent mode uses only the supplied Scratch dir and parent session id", () => {
  const repo = makeRepo(dir, "isolated-clone");
  const isolatedHome = join(repo, "scratch-home");
  const scratch = join(dir, "parent-scratch");
  const bin = join(repo, "bin");
  const gitLog = join(repo, "git-invoked");
  mkdirSync(bin);
  writeFileSync(join(bin, "git"), '#!/bin/sh\nprintf invoked > "$GIT_INVOCATION_LOG"\nexit 73\n', { mode: 0o755 });
  const run = (id?: string) => {
    const r = Bun.spawnSync([
      process.execPath, PATH_SCRIPT, "--home", isolatedHome, "--scratch-dir", scratch, "verify",
      ...(id === undefined ? [] : ["--session-id", id]),
    ], {
      cwd: repo, env: { ...ENV, PI_SESSION_ID: "019abcde-1234-7abc-8def-000000000002", PATH: bin, GIT_INVOCATION_LOG: gitLog },
      stdout: "pipe", stderr: "pipe",
    });
    return { code: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
  };
  for (const id of [undefined, "", "../escape", `${SESSION}\n`]) {
    const result = run(id);
    expect(result).toMatchObject({ code: 2, stdout: "" });
    expect(result.stderr).toContain("parent session id");
    expect(existsSync(scratch)).toBe(false);
  }

  const session = join(scratch, "verify", SESSION);
  mkdirSync(session, { recursive: true });
  writeFileSync(join(session, "keep.txt"), "old scratch");
  const refused = run(SESSION);
  expect(refused.code).toBe(2);
  expect(refused.stderr).toContain("unmarked");
  expect(readdirSync(session)).toEqual(["keep.txt"]);
  expect(readFileSync(join(session, "keep.txt"), "utf8")).toBe("old scratch");
  rmSync(session, { recursive: true });

  expect(run(SESSION)).toMatchObject({ code: 0, stdout: `${session}/\n` });
  expect(readFileSync(join(session, ".vstack-scratch-session"), "utf8")).toBe(`${SESSION}\n`);
  expect(existsSync(isolatedHome)).toBe(false);
  expect(existsSync(gitLog)).toBe(false);
});

test("overlapping writers publish and reuse one fully marked session folder", async () => {
  const repo = makeRepo(dir, "concurrent-writers");
  const isolatedHome = join(dir, "concurrent-home");
  const scratch = invokePath(repo, isolatedHome).stdout.trim();
  const session = join(scratch, "explain", SESSION);
  const release = join(dir, "release-mark");
  const first = Bun.spawn([process.execPath, "--preload", PAUSE_SCRATCH_MARK, PATH_SCRIPT, "--home", isolatedHome, "explain"], {
    cwd: repo, env: { ...ENV, PI_SESSION_ID: SESSION, VSTACK_MARK_RELEASE: release }, stdout: "pipe", stderr: "pipe",
  });
  const stderr = first.stderr.getReader();
  try {
    const paused = await stderr.read();
    expect(new TextDecoder().decode(paused.value)).toBe("Scratch mark paused\n");
    expect(invokePath(repo, isolatedHome, undefined, "--scratch-dir", scratch, "--session-id", SESSION, "explain"))
      .toMatchObject({ code: 0, stdout: `${session}/\n` });
  } finally {
    writeFileSync(release, "");
    await first.exited;
  }
  expect(first.exitCode).toBe(0);
  expect(await new Response(first.stdout).text()).toBe(`${session}/\n`);
  expect(readFileSync(join(session, ".vstack-scratch-session"), "utf8")).toBe(`${SESSION}\n`);
  expect(readdirSync(join(scratch, "explain"))).toEqual([SESSION]);
});

test("to-tickets resume derives the same reserved record path in another session", () => {
  const repo = makeRepo(dir, "publication-repo");
  const isolatedHome = join(repo, "scratch-home");
  const project = invokePath(repo, isolatedHome).stdout;
  expect(project).toEndWith("/\n");
  const ticketsDir = `${project.trim()}to-tickets/`;
  const recordDir = (sessionId?: string) => {
    const path = invokePath(repo, isolatedHome, sessionId, "to-tickets");
    expect(path).toMatchObject({ code: 0, stdout: `${ticketsDir}\n` });
    return join(path.stdout.trim(), "feature", "publication.json");
  };

  const record = recordDir(SESSION);
  mkdirSync(join(ticketsDir, "feature"));
  const input = join(ticketsDir, "feature", "approved.json");
  writeFileSync(input, JSON.stringify({
    version: 1,
    tracker: { mode: "local", directory: join(repo, "issues"), readiness: "available" },
    tickets: [{ key: "the-ticket", title: "Test publication", body: "Approved content.", labels: ["task"] }],
  }));
  const run = (sessionId: string, ...args: string[]) => {
    const r = Bun.spawnSync([process.execPath, PUBLISH_SCRIPT, ...args], {
      cwd: repo, env: { ...ENV, PI_SESSION_ID: sessionId }, stdout: "pipe", stderr: "pipe",
    });
    expect(r.stderr.toString()).toBe("");
    expect(r.exitCode).toBe(0);
    return JSON.parse(r.stdout.toString());
  };
  const published = run(SESSION, "publish", "--input", input, "--record", record);
  const nextSession = "019abcde-1234-7abc-8def-000000000003";
  const resumed = run(nextSession, "resume", "--record", recordDir(nextSession));
  expect(resumed).toMatchObject({ status: "complete", tickets: published.tickets });
  expect(recordDir()).toBe(record);
  expect(readdirSync(ticketsDir)).toEqual(["feature"]);
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

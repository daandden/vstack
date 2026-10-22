import { afterEach, beforeEach, expect, test } from "bun:test";
import type { Subprocess } from "bun";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ENV, git } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "clean-wt", "scripts", "clean-wt.ts");
const FAKE_OMP = join(import.meta.dir, "support", "fake-omp-worktree.ts");
const OWN = "own-session-0001";

let dir: string;
let base: string;
let sessions: string;
let owners: string;
let repo: string;
let holders: Subprocess[];

beforeEach(async () => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "clean-wt-test-")));
  base = join(dir, "wt");
  sessions = join(dir, "sessions");
  owners = join(dir, "owners");
  repo = join(dir, "repo");
  holders = [];
  mkdirSync(base);
  mkdirSync(sessions);
  mkdirSync(owners, { mode: 0o700 });
  mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "README.md"), "hello\n");
  writeFileSync(join(repo, ".gitignore"), ".env\nnode_modules/\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "init");
  mkdirSync(join(dir, "bin"));
  writeFileSync(join(dir, "bin", "omp"), `#!/bin/sh\nexec bun ${JSON.stringify(FAKE_OMP)} "$@"\n`, { mode: 0o755 });
  session(OWN, dir);
  await holdLease(OWN);
});

afterEach(() => {
  for (const h of holders) h.kill();
  rmSync(dir, { recursive: true, force: true });
});

/** The name omp's Linux file lock binds in the abstract socket namespace for a lock path. */
function abstractLockName(lockPath: string): string {
  const high = Bun.hash.xxHash64(lockPath, 0x4f4d502d4c4f434bn);
  const low = Bun.hash.xxHash64(lockPath, 0x50492d46494c454cn);
  return `omp-file-lock-${high.toString(16).padStart(16, "0")}${low.toString(16).padStart(16, "0")}`;
}

/** Starts a process that holds a session lease the way omp does on this platform, optionally with its session file open as omp keeps it. */
async function holdLease(id: string, sessionFile?: string) {
  const lockPath = `${resolve(owners, id)}.lock`;
  const keepOpen = "\nfor p in sys.argv[2:]: open(p)";
  const code =
    process.platform === "linux"
      ? `import socket,sys,time\ns=socket.socket(socket.AF_UNIX,socket.SOCK_DGRAM)\ns.bind('\\0'+sys.argv[1])${keepOpen}\nprint('ready',flush=True)\ntime.sleep(3600)`
      : `import fcntl,sys,time\nf=open(sys.argv[1],'a')\nfcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)\nkept=[open(p) for p in sys.argv[2:]]\nprint('ready',flush=True)\ntime.sleep(3600)`;
  const arg = process.platform === "linux" ? abstractLockName(lockPath) : lockPath;
  const p = Bun.spawn(["python3", "-c", code, arg, ...(sessionFile ? [sessionFile] : [])], { stdout: "pipe", stderr: "inherit" });
  holders.push(p);
  const reader = p.stdout.getReader();
  const { value } = await reader.read();
  reader.releaseLock();
  expect(new TextDecoder().decode(value)).toContain("ready");
  return p;
}

function session(id: string, cwd: string, rel = `-${id}/2026-10-21T00-00-00-000Z_${id}.jsonl`, extra: Record<string, unknown> = {}) {
  const file = join(sessions, rel);
  mkdirSync(dirname(file), { recursive: true });
  const title = JSON.stringify({ type: "title", v: 1, title: `session ${id}` });
  const header = JSON.stringify({ type: "session", version: 3, id, timestamp: "2026-10-21T00:00:00.000Z", cwd, ...extra });
  writeFileSync(file, `${title}\n${header}\n`);
  return file;
}

function cleanWt(args: string[], env: Record<string, string | undefined> = {}) {
  const merged: Record<string, string> = { ...ENV, PI_SESSION_ID: OWN, PATH: `${join(dir, "bin")}:${ENV.PATH}` };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete merged[k];
    else merged[k] = v;
  }
  const r = Bun.spawnSync(["bun", SCRIPT, ...args, "--base", base, "--sessions", sessions, "--session-owners", owners], {
    cwd: dir,
    env: merged,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = r.stdout.toString();
  return { code: r.exitCode, stdout, stderr: r.stderr.toString(), json: r.exitCode === 0 ? JSON.parse(stdout) : undefined };
}

interface Checkout {
  path: string;
  entry: string;
  kind: string;
  verdict: string;
  reasons: string[];
  owners: { type: string; id?: string; pid?: number }[];
  state: string;
  changes: Record<string, string[]>;
  unique_history: { ref: string; sha: string }[];
  fingerprint: string;
  branch: string | null;
  sessions: { id: string; file: string; live: boolean }[];
}

function inventory(env: Record<string, string | undefined> = {}): Record<string, Checkout> {
  const r = cleanWt(["inventory"], env);
  expect(r.stderr).toBe("");
  expect(r.code).toBe(0);
  return Object.fromEntries((r.json.checkouts as Checkout[]).map((c) => [c.path, c]));
}

function linkedWorktree(name: string, branch = `wt/${name}`) {
  const path = join(base, name);
  git(repo, "worktree", "add", "-q", "-b", branch, path);
  return path;
}

test("an unused clean linked worktree is listed as unused and clean, with its branch", () => {
  const path = linkedWorktree("wt-a");
  const c = inventory()[path];
  expect(c).toMatchObject({ entry: path, kind: "linked-worktree", verdict: "unused", state: "clean", branch: "wt/wt-a", reasons: [], owners: [] });
  expect(c.fingerprint).toMatch(/^[0-9a-f]{64}$/);
});

test("a held session lease protects its checkout, and a session whose lease is free does not", async () => {
  const idle = linkedWorktree("wt-idle");
  const old = linkedWorktree("wt-old");
  session("idle-session-01", idle);
  await holdLease("idle-session-01");
  const oldFile = session("old-session-01", old);
  const inv = inventory();
  expect(inv[idle]).toMatchObject({ verdict: "owned", owners: [{ type: "session", id: "idle-session-01" }] });
  expect(inv[old]).toMatchObject({ verdict: "unused", owners: [], sessions: [{ id: "old-session-01", file: oldFile, live: false }] });
});

test("without proof that lease detection works, an unowned checkout is uncertain, never unused", async () => {
  const path = linkedWorktree("wt-a");
  const noId = inventory({ PI_SESSION_ID: undefined })[path];
  expect(noId.verdict).toBe("uncertain");
  expect(noId.reasons.join(" ")).toContain("PI_SESSION_ID");
  for (const h of holders) h.kill();
  await Promise.all(holders.map((h) => h.exited));
  const withoutOwnLease = inventory()[path];
  expect(withoutOwnLease.verdict).toBe("uncertain");
  expect(withoutOwnLease.reasons.join(" ")).toContain(OWN);
});

/** A process's start token as omp records it: /proc stat field 22 on Linux, `ps -o lstart` elsewhere. */
function startToken(pid: number): string {
  if (process.platform === "linux") {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
  }
  return Bun.spawnSync(["ps", "-o", "lstart=", "-p", String(pid)]).stdout.toString().trim();
}

/** A task-isolation sandbox: a wrapper dir with omp's owner marker and a clone of the repo in `m`. */
function taskSandbox(name: string, marker: unknown) {
  const entry = join(base, name);
  mkdirSync(entry);
  writeFileSync(join(entry, ".omp-isolation-owner.json"), typeof marker === "string" ? marker : JSON.stringify(marker));
  git(dir, "clone", "-q", "--shared", repo, join(entry, "m"));
  return entry;
}

test("a task sandbox is owned only while its marker's pid runs with the recorded start token", () => {
  const sleeper = Bun.spawn(["sleep", "600"]);
  holders.push(sleeper);
  const token = startToken(sleeper.pid);
  const dead = Bun.spawnSync(["true"]).pid;
  const live = taskSandbox("t-live", { pid: sleeper.pid, id: "Live1", startToken: token });
  const recycled = taskSandbox("t-recycled", { pid: sleeper.pid, id: "Recycled1", startToken: `${token} (an earlier process)` });
  const gone = taskSandbox("t-gone", { pid: dead, id: "Gone1", startToken: "Thu Jan  1 00:00:00 1970" });
  const broken = taskSandbox("t-broken", "{not json");
  const inv = inventory();
  expect(inv[join(live, "m")]).toMatchObject({ entry: live, kind: "task-isolation", verdict: "owned", owners: [{ type: "task", id: "Live1", pid: sleeper.pid }] });
  expect(inv[join(recycled, "m")]).toMatchObject({ entry: recycled, verdict: "unused", owners: [] });
  expect(inv[join(gone, "m")]).toMatchObject({ entry: gone, verdict: "unused", owners: [] });
  expect(inv[join(broken, "m")].verdict).toBe("uncertain");
  expect(inv[join(broken, "m")].reasons.join(" ")).toContain(".omp-isolation-owner.json");
});

test("a running process whose working directory is inside a checkout protects it", () => {
  const path = linkedWorktree("wt-shell");
  mkdirSync(join(path, "sub"));
  const shell = Bun.spawn(["sleep", "600"], { cwd: join(path, "sub") });
  holders.push(shell);
  expect(inventory()[path]).toMatchObject({ verdict: "owned", owners: [{ type: "process", pid: shell.pid }] });
});

test("staged, unstaged, and untracked changes make a checkout dirty, and each is listed", () => {
  const path = linkedWorktree("wt-dirty");
  writeFileSync(join(path, "staged.txt"), "s\n");
  git(path, "add", "staged.txt");
  writeFileSync(join(path, "README.md"), "changed\n");
  mkdirSync(join(path, "notes"));
  writeFileSync(join(path, "notes", "draft.md"), "d\n");
  const c = inventory()[path];
  expect(c.state).toBe("dirty");
  expect(c.changes).toMatchObject({ staged: ["staged.txt"], unstaged: ["README.md"], untracked: ["notes/draft.md"] });
});

test("an ignored or excluded file counts as dirty unless the main checkout holds the same bytes or link target", () => {
  // The main checkout's own ignored and excluded files, which omp's clone carries into a new worktree.
  writeFileSync(join(repo, ".env"), "TOKEN=1\n");
  mkdirSync(join(repo, "node_modules", "pkg"), { recursive: true });
  writeFileSync(join(repo, "node_modules", "pkg", "index.js"), "x\n");
  mkdirSync(join(repo, ".omp", "skills"), { recursive: true });
  symlinkSync(join(dir, "verify-app"), join(repo, ".omp", "skills", "verify-app"));
  writeFileSync(join(repo, ".git", "info", "exclude"), ".omp/skills/verify-*\n");

  const same = linkedWorktree("wt-same");
  writeFileSync(join(same, ".env"), "TOKEN=1\n");
  mkdirSync(join(same, "node_modules", "pkg"), { recursive: true });
  writeFileSync(join(same, "node_modules", "pkg", "index.js"), "x\n");
  mkdirSync(join(same, ".omp", "skills"), { recursive: true });
  symlinkSync(join(dir, "verify-app"), join(same, ".omp", "skills", "verify-app"));

  const edited = linkedWorktree("wt-edited");
  writeFileSync(join(edited, ".env"), "TOKEN=2\n");
  mkdirSync(join(edited, "node_modules", "pkg"), { recursive: true });
  writeFileSync(join(edited, "node_modules", "pkg", "index.js"), "x\n");
  writeFileSync(join(edited, "node_modules", "pkg", "patched.js"), "local fix\n");
  mkdirSync(join(edited, ".omp", "skills"), { recursive: true });
  symlinkSync(join(dir, "elsewhere"), join(edited, ".omp", "skills", "verify-app"));

  const inv = inventory();
  expect(inv[same]).toMatchObject({ state: "clean" });
  expect(inv[edited].state).toBe("dirty");
  expect(inv[edited].changes.ignored_unique.sort()).toEqual([".env", ".omp/skills/verify-app", "node_modules/pkg/patched.js"]);
});

test("commits and stashes that exist only in a checkout are listed as unique history", () => {
  const dead = Bun.spawnSync(["true"]).pid;
  const m = join(taskSandbox("t-work", { pid: dead, id: "Work1" }), "m");
  git(m, "checkout", "-q", "-b", "task/work");
  writeFileSync(join(m, "feature.txt"), "f\n");
  git(m, "add", "feature.txt");
  git(m, "commit", "-q", "-m", "task work");
  const taskCommit = git(m, "rev-parse", "HEAD");
  writeFileSync(join(m, "README.md"), "wip\n");
  git(m, "stash", "-q");
  const stash = git(m, "rev-parse", "stash@{0}");

  const detached = join(base, "wt-detached");
  git(repo, "worktree", "add", "-q", "--detach", detached);
  writeFileSync(join(detached, "spike.txt"), "s\n");
  git(detached, "add", "spike.txt");
  git(detached, "commit", "-q", "-m", "spike");
  const spike = git(detached, "rev-parse", "HEAD");

  const plain = linkedWorktree("wt-plain");

  const inv = inventory();
  expect(inv[m].unique_history).toEqual([
    { ref: "refs/heads/task/work", sha: taskCommit },
    { ref: "stash@{0}", sha: stash },
  ]);
  expect(inv[detached].unique_history).toEqual([{ ref: "HEAD", sha: spike }]);
  expect(inv[plain].unique_history).toEqual([]);
});

test("a linked worktree whose registration is gone has an unknown state", () => {
  const path = linkedWorktree("wt-orphan");
  rmSync(join(repo, ".git", "worktrees", "wt-orphan"), { recursive: true });
  const c = inventory()[path];
  expect(c).toMatchObject({ kind: "orphaned-worktree", state: "unknown", unique_history: [] });
  expect(c.changes.unreadable.join(" ")).toContain("registration");
});

function remove(...args: string[]) {
  const r = cleanWt(["remove", ...args]);
  expect(r.stderr).toBe("");
  expect(r.code).toBe(0);
  return r.json as { removed: { path: string; method: string }[]; skipped: { path: string; reason: string }[]; failed: { path: string; error: string }[] };
}

test("remove takes an unused clean linked worktree out of git and off disk, and keeps its branch", () => {
  const path = linkedWorktree("wt-a");
  const c = inventory()[path];
  const out = remove(`${path}=${c.fingerprint}`);
  expect(out).toEqual({ removed: [{ path, method: "git worktree remove" }], skipped: [], failed: [] });
  expect(existsSync(path)).toBe(false);
  expect(git(repo, "worktree", "list", "--porcelain")).not.toContain(path);
  expect(git(repo, "rev-parse", "--verify", "refs/heads/wt/wt-a")).toMatch(/^[0-9a-f]{40}$/);
});

test("remove skips a checkout that changed or came into use after the inventory", () => {
  const changed = linkedWorktree("wt-changed");
  const used = linkedWorktree("wt-used");
  const inv = inventory();
  writeFileSync(join(changed, "late.txt"), "written after the inventory\n");
  const shell = Bun.spawn(["sleep", "600"], { cwd: used });
  holders.push(shell);
  const out = remove(`${changed}=${inv[changed].fingerprint}`, `${used}=${inv[used].fingerprint}`);
  expect(out.removed).toEqual([]);
  expect(out.skipped.map((s) => s.path)).toEqual([changed, used]);
  expect(out.skipped[0].reason).toContain("changed since the inventory");
  expect(out.skipped[1].reason).toContain("in use");
  expect(existsSync(changed) && existsSync(used)).toBe(true);
});

test("dirty work is removed only with --approve, and unique history is never removed", () => {
  const dirty = linkedWorktree("wt-dirty");
  writeFileSync(join(dirty, "draft.md"), "draft\n");
  const dead = Bun.spawnSync(["true"]).pid;
  const sandbox = taskSandbox("t-work", { pid: dead, id: "Work1" });
  const m = join(sandbox, "m");
  git(m, "checkout", "-q", "-b", "task/work");
  git(m, "commit", "-q", "--allow-empty", "-m", "task work");
  let inv = inventory();
  const unapproved = remove(`${dirty}=${inv[dirty].fingerprint}`, `${m}=${inv[m].fingerprint}`);
  expect(unapproved.removed).toEqual([]);
  expect(unapproved.skipped.map((s) => s.reason)).toEqual([
    "it holds dirty work, and removing it needs --approve",
    "it holds commits or stashes that exist nowhere else (refs/heads/task/work); push or branch them first",
  ]);
  inv = inventory();
  const approved = remove("--approve", dirty, "--approve", m, `${dirty}=${inv[dirty].fingerprint}`, `${m}=${inv[m].fingerprint}`);
  expect(approved.removed).toEqual([{ path: dirty, method: "git worktree remove --force" }]);
  expect(approved.skipped.map((s) => s.path)).toEqual([m]);
  expect(existsSync(dirty)).toBe(false);
  expect(existsSync(m)).toBe(true);
  expect(git(repo, "rev-parse", "--verify", "refs/heads/wt/wt-dirty")).toMatch(/^[0-9a-f]{40}$/);
}, 30000);

test("remove refuses an argument that names no checkout, before it removes anything", () => {
  const path = linkedWorktree("wt-a");
  const c = inventory()[path];
  const r = cleanWt(["remove", `${path}=${c.fingerprint}`, `${join(base, "nope")}=${c.fingerprint}`]);
  expect(r.code).toBe(2);
  expect(r.stderr).toContain("is not a checkout");
  expect(existsSync(path)).toBe(true);
});

test("a standalone clone is told apart from a linked worktree, and its removal deletes the clone's dir", () => {
  const clone = join(base, "clone-a");
  git(dir, "clone", "-q", repo, clone);
  const c = inventory()[clone];
  expect(c).toMatchObject({ kind: "standalone-clone", entry: clone, verdict: "unused", state: "clean", unique_history: [] });
  expect(remove(`${clone}=${c.fingerprint}`).removed).toEqual([{ path: clone, method: "rm -r" }]);
  expect(existsSync(clone)).toBe(false);
});

test("a retained task workspace on a mount backend stays uncertain, because only omp can tear it down", () => {
  const dead = Bun.spawnSync(["true"]).pid;
  const sandbox = taskSandbox("t-retained", { pid: dead, id: "Kept1" });
  writeFileSync(join(sandbox, ".omp-retained-backend.json"), JSON.stringify({ backend: 4, retainedAt: "2026-10-21T00:00:00.000Z" }));
  const c = inventory()[join(sandbox, "m")];
  expect(c.verdict).toBe("uncertain");
  expect(c.reasons.join(" ")).toContain("native teardown");
});

test("a live session protects the extra workspace dirs it records, and a session that moved away is still linked", async () => {
  const extra = linkedWorktree("wt-extra");
  session("multi-session-1", repo, undefined, { additionalDirectories: [extra] });
  await holdLease("multi-session-1");
  const left = linkedWorktree("wt-left");
  // omp names a session dir after its cwd; this session moved from wt-left's dir back to the main checkout.
  const slug = `-tmp-${left.slice(realpathSync(tmpdir()).length + 1).replaceAll("/", "-")}`;
  const moved = session("moved-session-1", repo, undefined, { previousSessionFiles: [join(sessions, slug, "2026-10-20T00-00-00-000Z_moved-session-1.jsonl")] });
  const inv = inventory();
  expect(inv[extra]).toMatchObject({ verdict: "owned", owners: [{ type: "session", id: "multi-session-1" }] });
  expect(inv[left]).toMatchObject({ verdict: "unused", sessions: [], moved_sessions: [{ id: "moved-session-1", file: moved, live: false }] });
});

test("a task clone that copied the source repo's git dir is compared with the checkout its parent session ran in", () => {
  git(repo, "branch", "local-only");
  writeFileSync(join(repo, ".env"), "TOKEN=1\n");
  const dead = Bun.spawnSync(["true"]).pid;
  const sandbox = join(base, "t-copied");
  mkdirSync(sandbox);
  writeFileSync(join(sandbox, ".omp-isolation-owner.json"), JSON.stringify({ pid: dead, id: "Copy1" }));
  // A copy backend duplicates the source checkout, .git dir included, with no alternates back to it.
  expect(Bun.spawnSync(["cp", "-R", repo, join(sandbox, "m")]).exitCode).toBe(0);
  const parent = session("parent-session-1", repo, "-repo/2026-10-21T00-00-00-000Z_parent-session-1.jsonl");
  session("task-session-1", join(sandbox, "m"), `${parent.slice(sessions.length + 1, -".jsonl".length)}/Copy1.jsonl`);
  const c = inventory()[join(sandbox, "m")];
  expect(c).toMatchObject({ kind: "task-isolation", verdict: "unused", state: "clean", unique_history: [] });
});

test("a base dir that does not exist yet is an empty inventory", () => {
  rmSync(base, { recursive: true });
  const r = cleanWt(["inventory"]);
  expect(r.code).toBe(0);
  expect(r.json.checkouts).toEqual([]);
});

test("only entries that omp lists are inventoried, and without omp's listing nothing is unused", () => {
  const listed = linkedWorktree("wt-listed");
  const hidden = linkedWorktree("wt-hidden");
  const inv = inventory({ FAKE_OMP_HIDE: "wt-hidden" });
  expect(Object.keys(inv)).toEqual([listed]);
  const r = cleanWt(["remove", `${hidden}=${"0".repeat(64)}`], { FAKE_OMP_HIDE: "wt-hidden" });
  expect(r.code).toBe(2);
  expect(existsSync(hidden)).toBe(true);
  const failing = inventory({ FAKE_OMP_FAIL: "1" });
  expect(failing[listed].verdict).toBe("uncertain");
  expect(failing[listed].reasons.join(" ")).toContain("omp worktree list");
});

test("a task sandbox with no owner marker is uncertain", () => {
  const sandbox = join(base, "t-unmarked");
  mkdirSync(sandbox);
  git(dir, "clone", "-q", "--shared", repo, join(sandbox, "m"));
  const c = inventory()[join(sandbox, "m")];
  expect(c.verdict).toBe("uncertain");
  expect(c.reasons.join(" ")).toContain(".omp-isolation-owner.json");
});

// On Linux a held lease is an abstract socket named by a hash, so held leases cannot be listed back to their ids.
test.skipIf(process.platform === "linux")("a held session lease with no readable session file makes unowned checkouts uncertain", async () => {
  const path = linkedWorktree("wt-a");
  await holdLease("ghost-session-1");
  const c = inventory()[path];
  expect(c.verdict).toBe("uncertain");
  expect(c.reasons.join(" ")).toContain("ghost-session-1");
});

test("an ignored link counts as preserved only when it resolves to the same target", () => {
  mkdirSync(join(repo, "node_modules", "pkg"), { recursive: true });
  writeFileSync(join(repo, "node_modules", "pkg", "cli.js"), "x\n");
  mkdirSync(join(repo, "node_modules", ".bin"));
  symlinkSync("../pkg/cli.js", join(repo, "node_modules", ".bin", "cli"));
  symlinkSync("../../repo-notes", join(repo, "node_modules", "notes"));
  const path = linkedWorktree("wt-links");
  mkdirSync(join(path, "node_modules", "pkg"), { recursive: true });
  writeFileSync(join(path, "node_modules", "pkg", "cli.js"), "x\n");
  mkdirSync(join(path, "node_modules", ".bin"));
  symlinkSync("../pkg/cli.js", join(path, "node_modules", ".bin", "cli"));
  // The same link text leaves each checkout, so it points at two different dirs.
  symlinkSync("../../repo-notes", join(path, "node_modules", "notes"));
  const c = inventory()[path];
  expect(c.changes.ignored_unique).toEqual(["node_modules/notes"]);
});

test.skipIf(process.platform === "linux")("a held lease's session file outside the session dirs is found through the process that holds it", async () => {
  const path = linkedWorktree("wt-elsewhere");
  const file = join(dir, "other-agent-dir", "sessions", "x", "2026-10-21T00-00-00-000Z_far-session-1.jsonl");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ type: "session", version: 3, id: "far-session-1", cwd: path })}\n`);
  await holdLease("far-session-1", file);
  expect(inventory()[path]).toMatchObject({ verdict: "owned", reasons: [], owners: [{ type: "session", id: "far-session-1", file }] });
});

test("a sandbox with both an m and a merged checkout is uncertain, so removing one never deletes the other", () => {
  const dead = Bun.spawnSync(["true"]).pid;
  const sandbox = taskSandbox("t-two", { pid: dead, id: "Two1" });
  const m = join(sandbox, "m");
  const merged = join(sandbox, "merged");
  git(dir, "clone", "-q", "--shared", repo, merged);
  git(merged, "checkout", "-q", "-b", "task/only-here");
  git(merged, "commit", "-q", "--allow-empty", "-m", "only in merged");
  const inv = inventory();
  for (const path of [m, merged]) {
    expect(inv[path].verdict).toBe("uncertain");
    expect(inv[path].reasons.join(" ")).toContain("both m and merged");
  }
  const r = remove(`${m}=${inv[m].fingerprint || "0".repeat(64)}`);
  expect(r.removed).toEqual([]);
  expect(existsSync(merged)).toBe(true);
});

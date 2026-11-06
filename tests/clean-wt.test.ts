import { afterEach, beforeEach, expect, test } from "bun:test";
import type { Subprocess } from "bun";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ENV, git } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "clean-wt", "scripts", "clean-wt.ts");
const FAKE_OMP = join(import.meta.dir, "support", "fake-omp-worktree.ts");
const FAKE_OVNFS = join(import.meta.dir, "support", "fake-ovnfs.ts");
const OWN = "own-session-0001";

let dir: string;
let base: string;
let sessions: string;
let owners: string;
let repo: string;
let holders: Subprocess[];
let ovnfsRoot: string;

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
  ovnfsRoot = join(dir, "checkouts");
  mkdirSync(ovnfsRoot);
  writeFileSync(join(ovnfsRoot, "checkouts.json"), "[]");
  writeFileSync(join(dir, "bin", "ovnfs"), `#!/bin/sh\nexec bun ${JSON.stringify(FAKE_OVNFS)} "$@"\n`, { mode: 0o755 });
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
  const merged: Record<string, string> = { ...ENV, PI_SESSION_ID: OWN, PATH: `${join(dir, "bin")}:${ENV.PATH}`, FAKE_OVNFS_ROOT: ovnfsRoot, FAKE_GIT: Bun.which("git")! };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete merged[k];
    else merged[k] = v;
  }
  const r = Bun.spawnSync(["bun", SCRIPT, ...args, "--base", base, "--sessions", sessions, "--session-owners", owners], {
    cwd: repo,
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
  automatic?: boolean;
  integration?: { status: string; ref?: string; reason?: string };
  source_git_dir?: string;
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

test("a task clone whose parent session's directory was removed takes its source from alternates", () => {
  const dead = Bun.spawnSync(["true"]).pid;
  const sandbox = taskSandbox("t-orphaned", { pid: dead, id: "Orphan1" });
  const removed = join(dir, "removed-checkout");
  mkdirSync(removed);
  const parent = session("parent-session-2", removed, "-removed/2026-10-21T00-00-00-000Z_parent-session-2.jsonl");
  session("task-session-2", join(sandbox, "m"), `${parent.slice(sessions.length + 1, -".jsonl".length)}/Orphan1.jsonl`);
  rmSync(removed, { recursive: true });
  const c = inventory()[join(sandbox, "m")];
  expect(c).toMatchObject({ kind: "task-isolation", verdict: "unused", source_git_dir: join(repo, ".git") });
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

test("uncertain ownership leaves contents uninspected, just like a live owner", () => {
  const path = linkedWorktree("wt-uncertain");
  writeFileSync(join(path, "private-draft.txt"), "not inspected\n");
  const c = inventory({ PI_SESSION_ID: undefined })[path];
  expect(c).toMatchObject({ verdict: "uncertain", state: "not checked", changes: {}, fingerprint: "" });
});

test("remove inspects only requested targets even when an unrelated checkout cannot be read", () => {
  const path = linkedWorktree("wt-target");
  const c = inventory()[path];
  const unrelated = linkedWorktree("wt-unrelated");
  const privateFiles = join(unrelated, ".git");
  chmodSync(privateFiles, 0);
  try {
    const r = cleanWt(["remove", `${path}=${c.fingerprint}`]);
    expect(r.code).toBe(0);
    expect(r.json.removed.map((c: { path: string }) => c.path)).toEqual([path]);
    expect(existsSync(unrelated)).toBe(true);
  } finally {
    chmodSync(privateFiles, 0o700);
  }
});

function publishDefault(branch: string) {
  const remote = join(dir, "remote.git");
  git(dir, "clone", "-q", "--bare", repo, remote);
  git(remote, "symbolic-ref", "HEAD", `refs/heads/${branch}`);
  git(repo, "remote", "add", "origin", remote);
  return remote;
}

test("squash-equivalent tracked drafts use remote HEAD rather than the source checkout branch and remove automatically", () => {
  const path = linkedWorktree("wt-integrated");
  writeFileSync(join(path, "feature.txt"), "first\n");
  git(path, "add", ".");
  git(path, "commit", "-q", "-m", "first");
  writeFileSync(join(path, "feature.txt"), "finished\n");
  git(path, "commit", "-qam", "finish");
  writeFileSync(join(path, "README.md"), "landed draft\n");
  git(path, "add", "README.md");
  git(repo, "checkout", "-qb", "release");
  git(repo, "merge", "--squash", "wt/wt-integrated");
  writeFileSync(join(repo, "README.md"), "landed draft\n");
  writeFileSync(join(repo, "upstream-only.txt"), "unrelated upstream work\n");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "squashed review");
  publishDefault("release");
  git(repo, "checkout", "-q", "main");
  const c = comparedCheckout(path);
  expect(c).toMatchObject({ state: "dirty", integration: { status: "verified", ref: "refs/heads/release" }, automatic: true });
  expect(remove(`${path}=${c.fingerprint}`).removed.map((c) => c.path)).toEqual([path]);
  expect(existsSync(path)).toBe(false);
  expect(git(repo, "rev-parse", "--verify", "wt/wt-integrated")).toMatch(/^[0-9a-f]{40}$/);
});

test("approval cannot discard replaced untracked bytes even when file metadata is restored", () => {
  const path = linkedWorktree("wt-stale-bytes");
  const file = join(path, "notes.txt");
  writeFileSync(file, "first\n");
  utimesSync(file, 1_700_000_000, 1_700_000_000);
  const before = statSync(file);
  const c = inventory()[path];
  writeFileSync(file, "other\n");
  utimesSync(file, before.atime, before.mtime);
  const out = remove("--approve", path, `${path}=${c.fingerprint}`);
  expect(out.removed).toEqual([]);
  expect(existsSync(path)).toBe(true);
});

function integratedDraft() {
  const path = linkedWorktree("wt-draft");
  git(repo, "checkout", "-qb", "release");
  writeFileSync(join(repo, "README.md"), "integrated\n");
  git(repo, "commit", "-qam", "landed");
  const remote = publishDefault("release");
  git(repo, "checkout", "-q", "main");
  writeFileSync(join(path, "README.md"), "integrated\n");
  return { path, remote };
}

function comparedCheckout(path: string): Checkout {
  const discovered = inventory()[path];
  const prepared = cleanWt(["inventory", "--prepare-source", discovered.source_git_dir!]);
  expect(prepared.code).toBe(0);
  const file = join(dir, "source-facts.json");
  writeFileSync(file, JSON.stringify(prepared.json));
  const compared = cleanWt(["inventory", "--target", path, "--source-facts", file]);
  expect(compared.code).toBe(0);
  return compared.json.checkouts[0];
}

test.each(["untracked", "ignored", "index"])("integrated tracked work does not authorize unique %s contents", (kind) => {
  const { path } = integratedDraft();
  if (kind === "index") {
    writeFileSync(join(path, "README.md"), "unique staged version\n");
    git(path, "add", "README.md");
    writeFileSync(join(path, "README.md"), "integrated\n");
  } else {
    writeFileSync(join(path, kind === "ignored" ? ".env" : "notes.txt"), "only here\n");
  }
  const c = comparedCheckout(path);
  expect(c.automatic).toBe(false);
  expect(remove(`${path}=${c.fingerprint}`).removed).toEqual([]);
  expect(existsSync(path)).toBe(true);
});

test("a changed advertised default invalidates both automatic removal and an old approval", () => {
  const { path, remote } = integratedDraft();
  const c = comparedCheckout(path);
  expect(c.automatic).toBe(true);
  git(remote, "symbolic-ref", "HEAD", "refs/heads/main");
  const out = remove("--approve", path, `${path}=${c.fingerprint}`);
  expect(out.removed).toEqual([]);
  expect(out.skipped.map((s) => s.path)).toEqual([path]);
});

test("missing remote HEAD evidence leaves a tracked draft unresolved", () => {
  const { path, remote } = integratedDraft();
  git(remote, "symbolic-ref", "HEAD", "refs/heads/absent");
  const c = comparedCheckout(path);
  expect(c).toMatchObject({ automatic: false, integration: { status: "unresolved" } });
  expect(remove(`${path}=${c.fingerprint}`).removed).toEqual([]);
});

test("a newly held idle session with an extra workspace protects an integrated draft", async () => {
  const { path } = integratedDraft();
  const c = comparedCheckout(path);
  session("new-idle-owner", repo, undefined, { additionalDirectories: [path] });
  await holdLease("new-idle-owner");
  expect(remove(`${path}=${c.fingerprint}`).removed).toEqual([]);
  expect(existsSync(path)).toBe(true);
});

test("new unique history prevents even approved integrated task removal", () => {
  const dead = Bun.spawnSync(["true"]).pid;
  const path = join(taskSandbox("t-integrated-history", { pid: dead }), "m");
  const c = inventory()[path];
  git(path, "checkout", "-qb", "only-here");
  git(path, "commit", "-q", "--allow-empty", "-m", "new history");
  const out = remove("--approve", path, `${path}=${c.fingerprint}`);
  expect(out.removed).toEqual([]);
  expect(existsSync(path)).toBe(true);
});

test("one approval does not authorize another unresolved checkout", () => {
  const first = linkedWorktree("wt-first");
  const second = linkedWorktree("wt-second");
  writeFileSync(join(first, "notes.txt"), "first\n");
  writeFileSync(join(second, "notes.txt"), "second\n");
  const inv = inventory();
  const out = remove("--approve", first, `${first}=${inv[first].fingerprint}`, `${second}=${inv[second].fingerprint}`);
  expect(out.removed.map((c) => c.path)).toEqual([first]);
  expect(out.skipped.map((c) => c.path)).toEqual([second]);
  expect(existsSync(second)).toBe(true);
});

test("an integrated draft with a shared external skill link removes only the checkout", () => {
  const { path } = integratedDraft();
  const external = join(dir, "verify-app");
  mkdirSync(external);
  writeFileSync(join(external, "SKILL.md"), "keep me\n");
  for (const checkout of [repo, path]) {
    mkdirSync(join(checkout, ".omp", "skills"), { recursive: true });
    symlinkSync(external, join(checkout, ".omp", "skills", "verify-app"));
  }
  writeFileSync(join(repo, ".git", "info", "exclude"), ".omp/skills/verify-*\n");
  const c = comparedCheckout(path);
  expect(c.automatic).toBe(true);
  expect(remove(`${path}=${c.fingerprint}`).removed.map((c) => c.path)).toEqual([path]);
  expect(readFileSync(join(external, "SKILL.md"), "utf8")).toBe("keep me\n");
});

test("task wrapper artifacts are not discarded with their checkout", () => {
  const dead = Bun.spawnSync(["true"]).pid;
  const entry = taskSandbox("t-wrapper-artifact", { pid: dead });
  writeFileSync(join(entry, "design.md"), "unique design outside m\n");
  const path = join(entry, "m");
  const c = inventory()[path];
  expect(c.verdict).toBe("uncertain");
  const out = remove("--approve", path, `${path}=${c.fingerprint || "0".repeat(64)}`);
  expect(out.removed).toEqual([]);
  expect(readFileSync(join(entry, "design.md"), "utf8")).toBe("unique design outside m\n");
});

test("an unlanded rename deletion remains unresolved even when the new filename exists remotely", () => {
  const path = linkedWorktree("wt-rename");
  git(path, "mv", "README.md", "renamed.md");
  git(repo, "checkout", "-qb", "release");
  writeFileSync(join(repo, "renamed.md"), "hello\n");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "copy rather than rename");
  publishDefault("release");
  git(repo, "checkout", "-q", "main");
  const c = comparedCheckout(path);
  expect(c.automatic).toBe(false);
  expect(remove(`${path}=${c.fingerprint}`).removed).toEqual([]);
});

test("removal refreshes a live session's changed workspace list between targets", async () => {
  const first = linkedWorktree("wt-first-removed");
  const second = linkedWorktree("wt-new-workspace");
  const file = session("workspace-owner", repo);
  await holdLease("workspace-owner");
  const inv = inventory();
  const header = JSON.stringify({ type: "session", id: "workspace-owner", cwd: repo, additionalDirectories: [second] });
  const observer = Bun.spawn(["python3", "-c", "import os,sys,time\nprint('ready',flush=True)\nwhile os.path.exists(sys.argv[1]): time.sleep(0.002)\nopen(sys.argv[2],'w').write(sys.argv[3]+'\\n')", first, file, header], { stdout: "pipe", stderr: "inherit" });
  holders.push(observer);
  const reader = observer.stdout.getReader();
  const { value } = await reader.read();
  reader.releaseLock();
  expect(new TextDecoder().decode(value)).toContain("ready");
  const out = remove(`${first}=${inv[first].fingerprint}`, `${second}=${inv[second].fingerprint}`);
  expect(out.removed.map((c) => c.path)).toEqual([first]);
  expect(out.skipped.map((c) => c.path)).toEqual([second]);
  expect(existsSync(second)).toBe(true);
});

test("an unreadable ignored artifact keeps otherwise integrated work unresolved", () => {
  const { path } = integratedDraft();
  writeFileSync(join(repo, ".env"), "same bytes but unreadable copy\n");
  const file = join(path, ".env");
  writeFileSync(file, "same bytes but unreadable copy\n");
  chmodSync(file, 0);
  try {
    const c = comparedCheckout(path);
    expect(c.automatic).toBe(false);
    expect(c.changes.ignored_unverified).toEqual([".env"]);
    expect(remove(`${path}=${c.fingerprint}`).removed).toEqual([]);
    expect(existsSync(path)).toBe(true);
  } finally {
    chmodSync(file, 0o600);
  }
});

test("approval cannot remove an orphan whose Git history cannot be verified", () => {
  const path = linkedWorktree("wt-orphan-approval");
  rmSync(join(repo, ".git", "worktrees", "wt-orphan-approval"), { recursive: true });
  const c = inventory()[path];
  const out = remove("--approve", path, `${path}=${c.fingerprint}`);
  expect(out.removed).toEqual([]);
  expect(out.skipped.map((c) => c.path)).toEqual([path]);
  expect(existsSync(path)).toBe(true);
});

test.each(["--skip-worktree", "--assume-unchanged"])("automatic removal retains tracked bytes hidden by %s after inventory", (flag) => {
  writeFileSync(join(repo, "local-config.txt"), "defaults\n");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "tracked configuration");
  const path = join(base, "hidden-clone");
  git(dir, "clone", "-q", "--shared", repo, path);
  git(repo, "checkout", "-qb", "release");
  writeFileSync(join(repo, "README.md"), "integrated\n");
  git(repo, "commit", "-qam", "landed");
  publishDefault("release");
  git(repo, "checkout", "-q", "main");
  writeFileSync(join(path, "README.md"), "integrated\n");
  git(path, "update-index", flag, "local-config.txt");
  const c = comparedCheckout(path);
  expect(c.automatic).toBe(true);
  writeFileSync(join(path, "local-config.txt"), "unique bytes after inventory\n");
  const out = remove(`${path}=${c.fingerprint}`);
  expect(out.removed).toEqual([]);
  expect(out.skipped.map((row) => row.path)).toEqual([path]);
  expect(readFileSync(join(path, "local-config.txt"), "utf8")).toBe("unique bytes after inventory\n");
});

test("discovery leaves integration for targeted comparisons after clean removal", () => {
  const { path } = integratedDraft();
  const clean = linkedWorktree("wt-clean-first");
  const initial = cleanWt(["inventory"]);
  expect(initial.code).toBe(0);
  const records = Object.fromEntries(initial.json.checkouts.map((c: Checkout) => [c.path, c]));
  expect(records[path]).toMatchObject({ state: "dirty", automatic: false });
  expect(records[path].integration).toBeUndefined();
  expect(remove(`${clean}=${records[clean].fingerprint}`).removed.map((c) => c.path)).toEqual([clean]);
  const source = join(repo, ".git");
  const prepared = cleanWt(["inventory", "--prepare-source", source]);
  expect(prepared.code).toBe(0);
  expect(prepared.json.source_facts).toMatchObject([{ source_git_dir: source, ref: "refs/heads/release" }]);
  const file = join(dir, "source-facts.json");
  writeFileSync(file, JSON.stringify(prepared.json));
  const compared = cleanWt(["inventory", "--target", path, "--source-facts", file]);
  expect(compared.code).toBe(0);
  expect(compared.json.checkouts).toHaveLength(1);
  expect(compared.json.checkouts[0]).toMatchObject({ path, automatic: true, integration: { status: "verified" } });
  expect(remove(`${path}=${compared.json.checkouts[0].fingerprint}`).removed.map((c) => c.path)).toEqual([path]);
});

test("a verified untracked landed file and link can be removed automatically", () => {
  const path = linkedWorktree("wt-untracked-landed");
  git(repo, "checkout", "-qb", "release");
  writeFileSync(join(repo, "landed.txt"), "landed contents\n", { mode: 0o755 });
  symlinkSync("landed.txt", join(repo, "landed-link"));
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "landed new files");
  publishDefault("release");
  git(repo, "checkout", "-q", "main");
  writeFileSync(join(path, "landed.txt"), "landed contents\n", { mode: 0o755 });
  symlinkSync("landed.txt", join(path, "landed-link"));
  const c = comparedCheckout(path);
  expect(c).toMatchObject({ automatic: true, integration: { status: "verified" } });
  expect(remove(`${path}=${c.fingerprint}`).removed.map((row) => row.path)).toEqual([path]);
  expect(existsSync(path)).toBe(false);
});

test.each(["--skip-worktree", "--assume-unchanged"])("unique or unreadable tracked bytes hidden by %s are protected at inventory", (flag) => {
  const path = linkedWorktree("wt-hidden-initial");
  git(path, "update-index", flag, "README.md");
  writeFileSync(join(path, "README.md"), "unique hidden draft\n");
  const c = inventory()[path];
  expect(c).toMatchObject({ state: "dirty", automatic: false, changes: { unstaged: ["README.md"] } });
  expect(remove(`${path}=${c.fingerprint}`).removed).toEqual([]);
  chmodSync(join(path, "README.md"), 0);
  try {
    const unavailable = inventory()[path];
    expect(unavailable).toMatchObject({ state: "unknown", automatic: false });
    expect(remove("--approve", path, `${path}=${unavailable.fingerprint}`).removed).toEqual([]);
  } finally {
    chmodSync(join(path, "README.md"), 0o644);
  }
  expect(readFileSync(join(path, "README.md"), "utf8")).toBe("unique hidden draft\n");
});

test.each(["bytes", "mode", "link", "ignored", "unreadable"])("untracked integration cannot discard %s artifacts", (kind) => {
  const path = linkedWorktree("wt-untracked-protected");
  git(repo, "checkout", "-qb", "release");
  writeFileSync(join(repo, "landed.txt"), "landed\n");
  symlinkSync("landed.txt", join(repo, "landed-link"));
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "landed copies");
  publishDefault("release");
  git(repo, "checkout", "-q", "main");
  const file = join(path, "landed.txt");
  writeFileSync(file, kind === "bytes" ? "unique\n" : "landed\n");
  symlinkSync(kind === "link" ? "elsewhere" : "landed.txt", join(path, "landed-link"));
  if (kind === "mode") chmodSync(file, 0o755);
  if (kind === "ignored") writeFileSync(join(path, ".env"), "unique ignored\n");
  if (kind === "unreadable") chmodSync(file, 0);
  try {
    const c = comparedCheckout(path);
    expect(c.automatic).toBe(false);
    expect(remove(`${path}=${c.fingerprint}`).removed).toEqual([]);
    expect(existsSync(path)).toBe(true);
  } finally {
    chmodSync(file, 0o644);
  }
});

test("new unique bytes invalidate verified untracked integration even with approval", () => {
  const path = linkedWorktree("wt-untracked-replaced");
  git(repo, "checkout", "-qb", "release");
  writeFileSync(join(repo, "landed.txt"), "landed\n");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "landed copy");
  publishDefault("release");
  git(repo, "checkout", "-q", "main");
  const file = join(path, "landed.txt");
  writeFileSync(file, "landed\n");
  const c = comparedCheckout(path);
  expect(c.automatic).toBe(true);
  const before = statSync(file);
  writeFileSync(file, "unique\n");
  utimesSync(file, before.atime, before.mtime);
  expect(remove("--approve", path, `${path}=${c.fingerprint}`).removed).toEqual([]);
  expect(readFileSync(file, "utf8")).toBe("unique\n");
});

test("shared prepared source facts support separate target comparisons but never replace fresh removal evidence", () => {
  const { path, remote } = integratedDraft();
  const second = linkedWorktree("wt-second-draft");
  writeFileSync(join(second, "README.md"), "integrated\n");
  const prepared = cleanWt(["inventory", "--prepare-source", join(repo, ".git")]);
  expect(prepared.code).toBe(0);
  const file = join(dir, "shared-source-facts.json");
  writeFileSync(file, JSON.stringify(prepared.json));
  const unrelated = linkedWorktree("wt-unreadable");
  chmodSync(join(unrelated, ".git"), 0);
  try {
    const records = [path, second].map((target) => {
      const compared = cleanWt(["inventory", "--target", target, "--source-facts", file]);
      expect(compared.code).toBe(0);
      expect(compared.json.checkouts).toHaveLength(1);
      expect(compared.json.checkouts[0]).toMatchObject({ path: target, automatic: true });
      return compared.json.checkouts[0];
    });
    git(remote, "symbolic-ref", "HEAD", "refs/heads/main");
    const out = remove(...records.flatMap((c) => ["--approve", c.path, `${c.path}=${c.fingerprint}`]));
    expect(out.removed).toEqual([]);
    expect(out.skipped.map((c) => c.path)).toEqual([path, second]);
    expect(existsSync(path) && existsSync(second)).toBe(true);
  } finally {
    chmodSync(join(unrelated, ".git"), 0o644);
  }
});

function ovnfsCheckout(name: string, source = repo) {
  const path = join(ovnfsRoot, name);
  const gitDir = join(ovnfsRoot, `${name}.git-private`);
  git(dir, "clone", "-q", "--no-hardlinks", "--separate-git-dir", gitDir, repo, path);
  const file = join(ovnfsRoot, "checkouts.json");
  const entries = JSON.parse(readFileSync(file, "utf8"));
  entries.push({ name, path, source, dirty: false, git: gitDir });
  writeFileSync(file, JSON.stringify(entries));
  return path;
}

test("inventory finds omp ovnfs checkouts outside the base and protects unknown origins", () => {
  const path = ovnfsCheckout("omp-kept-123");
  const unknown = ovnfsCheckout("omp-unknown-456", join(dir, "missing-source"));
  const custom = ovnfsCheckout("personal-checkout");
  const inv = inventory();
  expect(inv[path]).toMatchObject({ kind: "ovnfs", entry: path, verdict: "unused", state: "clean", automatic: true });
  expect(inv[unknown]).toMatchObject({ kind: "ovnfs", verdict: "uncertain", state: "not checked" });
  expect(inv[custom]).toBeUndefined();
});

test("clean unused ovnfs checkouts are removed through ovnfs rm", () => {
  const path = ovnfsCheckout("omp-clean-123");
  const c = inventory()[path];
  const out = remove(`${path}=${c.fingerprint}`);
  expect(out).toEqual({ removed: [{ path, method: "ovnfs rm" }], skipped: [], failed: [] });
  expect(existsSync(path)).toBe(false);
  expect(JSON.parse(readFileSync(join(ovnfsRoot, "checkouts.json"), "utf8"))).toEqual([]);
  const calls = readFileSync(join(ovnfsRoot, "calls.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  expect(calls.some((call) => call.args.join(" ") === "--json rm omp-clean-123")).toBe(true);
  expect(git(repo, "status", "--porcelain")).toBe("");
});

test("ovnfs origin follows project worktrees and archived isolated sources, not other projects", () => {
  const linked = linkedWorktree("source-worktree");
  const fromWorktree = ovnfsCheckout("omp-from-worktree", linked);
  const ancestor = ovnfsCheckout("omp-old-worker");
  const nested = ovnfsCheckout("omp-nested", ancestor);
  const oldPath = join(ovnfsRoot, "omp-removed-source");
  const parentFile = session("project-session", repo);
  session("old-worker", oldPath, `${parentFile.slice(sessions.length + 1, -6)}/worker.jsonl`);
  const fromRemoved = ovnfsCheckout("omp-from-removed", oldPath);
  rmSync(linked, { recursive: true });
  const other = join(dir, "other");
  mkdirSync(other);
  git(other, "init", "-q", "-b", "main");
  const foreign = ovnfsCheckout("omp-foreign", other);
  const inv = inventory();
  for (const path of [fromWorktree, nested, fromRemoved]) expect(inv[path]).toMatchObject({ kind: "ovnfs", verdict: "unused", state: "clean" });
  expect(inv[foreign]).toBeUndefined();
});

test("ovnfs removal binds its checkout identity as well as work bytes", () => {
  const path = ovnfsCheckout("omp-original");
  const c = inventory()[path];
  const state = join(ovnfsRoot, "checkouts.json");
  const entries = JSON.parse(readFileSync(state, "utf8"));
  entries[0].name = "omp-replacement";
  writeFileSync(state, JSON.stringify(entries));
  const out = remove(`${path}=${c.fingerprint}`);
  expect(out.removed).toEqual([]);
  expect(out.skipped).toEqual([{ path, reason: "it changed since the inventory" }]);
  expect(existsSync(path)).toBe(true);
});

test("ovnfs guards protect live owners, private Git work, ignored files, stashes and unique commits despite an empty diff", async () => {
  const owned = ovnfsCheckout("omp-owned");
  session("ovnfs-live", owned);
  await holdLease("ovnfs-live");
  const dirty = ovnfsCheckout("omp-dirty");
  writeFileSync(join(dirty, "README.md"), "unstaged\n");
  writeFileSync(join(dirty, "staged.txt"), "staged\n");
  git(dirty, "add", "staged.txt");
  writeFileSync(join(dirty, "draft.txt"), "untracked\n");
  writeFileSync(join(dirty, ".env"), "unique ignored\n");
  const gitDir = git(dirty, "rev-parse", "--absolute-git-dir");
  writeFileSync(join(gitDir, "info", "exclude"), "private.txt\n");
  writeFileSync(join(dirty, "private.txt"), "unique excluded\n");
  const history = ovnfsCheckout("omp-history");
  writeFileSync(join(history, "only.txt"), "commit\n");
  git(history, "add", "only.txt");
  git(history, "commit", "-qm", "unique");
  const commit = git(history, "rev-parse", "HEAD");
  writeFileSync(join(history, "README.md"), "stash\n");
  git(history, "stash", "-q");
  const stash = git(history, "rev-parse", "stash@{0}");
  const diff = Bun.spawnSync(["bun", FAKE_OVNFS, "--json", "diff", "omp-dirty"], { env: { ...ENV, FAKE_OVNFS_ROOT: ovnfsRoot } });
  expect(JSON.parse(diff.stdout.toString())).toEqual({ changes: [] });
  const inv = inventory();
  expect(inv[owned]).toMatchObject({ verdict: "owned", state: "not checked" });
  expect(inv[dirty]).toMatchObject({ verdict: "unused", state: "dirty", automatic: false, changes: {
    staged: ["staged.txt"], unstaged: ["README.md"], untracked: ["draft.txt"], ignored_unique: [".env", "private.txt"],
  } });
  expect(inv[history].unique_history).toEqual([{ ref: "refs/heads/main", sha: commit }, { ref: "stash@{0}", sha: stash }]);
  const blocked = remove(`${dirty}=${inv[dirty].fingerprint}`, "--approve", history, `${history}=${inv[history].fingerprint}`);
  expect(blocked.removed).toEqual([]);
  expect(blocked.skipped.map((entry) => entry.path)).toEqual([dirty, history]);
  expect(existsSync(owned) && existsSync(dirty) && existsSync(history)).toBe(true);
  const approved = remove("--approve", dirty, `${dirty}=${inv[dirty].fingerprint}`);
  expect(approved.removed).toEqual([{ path: dirty, method: "ovnfs rm" }]);
  expect(existsSync(gitDir)).toBe(false);
});

test("ovnfs ownership and byte guards are refreshed before removal", () => {
  const owned = ovnfsCheckout("omp-late-owner");
  const changed = ovnfsCheckout("omp-late-edit");
  const inv = inventory();
  const owner = Bun.spawn(["sleep", "600"], { cwd: owned });
  holders.push(owner);
  writeFileSync(join(changed, "README.md"), "new bytes\n");
  const out = remove("--approve", changed, `${owned}=${inv[owned].fingerprint}`, `${changed}=${inv[changed].fingerprint}`);
  expect(out.removed).toEqual([]);
  expect(out.skipped[0]).toMatchObject({ path: owned });
  expect(out.skipped[0].reason).toContain("in use");
  expect(out.skipped[1]).toEqual({ path: changed, reason: "it changed since the inventory" });
  expect(readFileSync(join(changed, "README.md"), "utf8")).toBe("new bytes\n");
});

test("ovnfs reports missing checkout directories as uncertain instead of trusting the listing", () => {
  const path = ovnfsCheckout("omp-stale-listing");
  rmSync(path, { recursive: true });
  expect(inventory()[path]).toMatchObject({ kind: "ovnfs", verdict: "uncertain", state: "not checked" });
});

test("ovnfs unmerged contents remain protected even with approval and an empty diff", () => {
  const path = ovnfsCheckout("omp-unmerged");
  git(path, "checkout", "-qb", "side");
  writeFileSync(join(path, "README.md"), "side\n");
  git(path, "commit", "-qam", "side");
  git(path, "checkout", "-q", "main");
  writeFileSync(join(path, "README.md"), "main\n");
  git(path, "commit", "-qam", "main");
  Bun.spawnSync(["git", "merge", "side"], { cwd: path, env: ENV, stdout: "pipe", stderr: "pipe" });
  const c = inventory()[path];
  expect(c.changes.unmerged).toEqual(["README.md"]);
  expect(c.automatic).toBe(false);
  expect(remove("--approve", path, `${path}=${c.fingerprint}`).removed).toEqual([]);
  expect(existsSync(path)).toBe(true);
});

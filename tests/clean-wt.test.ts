import { afterEach, beforeEach, expect, test } from "bun:test";
import type { Subprocess } from "bun";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { writeExecutable } from "./support/executable.ts";
import { ENV, git } from "./support/fixture.ts";
import { holdSessionLease, stopSessionLeaseHolders } from "./support/session-lease-holder.ts";

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
  writeFileSync(join(repo, ".gitignore"), ".env\nnode_modules/\nbuild/\n*.tsbuildinfo\nlocal-cache/\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "init");
  mkdirSync(join(dir, "bin"));
  writeExecutable(join(dir, "bin", "omp"), "sh", `exec bun ${JSON.stringify(FAKE_OMP)} "$@"`);
  ovnfsRoot = join(dir, "checkouts");
  mkdirSync(ovnfsRoot);
  writeFileSync(join(ovnfsRoot, "checkouts.json"), "[]");
  writeExecutable(join(dir, "bin", "ovnfs"), "sh", `exec bun ${JSON.stringify(FAKE_OVNFS)} "$@"`);
  session(OWN, dir);
  await holdLease(OWN);
});

afterEach(async () => {
  await stopSessionLeaseHolders(holders);
  rmSync(dir, { recursive: true, force: true });
});

async function holdLease(id: string, sessionFile?: string) {
  const holder = await holdSessionLease(id, { ownersDir: owners, sessionFile });
  holders.push(holder);
  return holder;
}

function session(id: string, cwd: string, rel = `-${id}/2026-10-21T00-00-00-000Z_${id}.jsonl`, extra: Record<string, unknown> = {}) {
  const file = join(sessions, rel);
  mkdirSync(dirname(file), { recursive: true });
  const title = JSON.stringify({ type: "title", v: 1, title: `session ${id}` });
  const header = JSON.stringify({ type: "session", version: 3, id, timestamp: "2026-10-21T00:00:00.000Z", cwd, ...extra });
  writeFileSync(file, `${title}\n${header}\n`);
  return file;
}

function cleanWt(args: string[], env: Record<string, string | undefined> = {}, cwd = repo, bunArgs: string[] = []) {
  const merged: Record<string, string> = { ...ENV, PI_SESSION_ID: OWN, PATH: `${join(dir, "bin")}:${ENV.PATH}`, FAKE_OMP_PARENT: repo, FAKE_OVNFS_ROOT: ovnfsRoot, FAKE_GIT: Bun.which("git")! };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete merged[k];
    else merged[k] = v;
  }
  const r = Bun.spawnSync(["bun", ...bunArgs, SCRIPT, ...args, "--base", base, "--sessions", sessions, "--session-owners", owners], {
    cwd,
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

function inventory(env: Record<string, string | undefined> = {}, expectGaps = false): Record<string, Checkout> {
  const r = cleanWt(["inventory"], env);
  expect(r.stderr).toBe("");
  expect(r.code).toBe(0);
  if (expectGaps) expect(r.json.evidence_gaps).not.toEqual([]);
  else expect(r.json.evidence_gaps).toEqual([]);
  return Object.fromEntries((r.json.checkouts as Checkout[]).map((c) => [c.path, c]));
}

function linkedWorktree(name: string, branch = `wt/${name}`) {
  const path = join(base, name);
  git(repo, "worktree", "add", "-q", "-b", branch, path);
  return path;
}

function verificationInput(discovered: unknown, investigations: unknown[] = []) {
  const records = join(dir, "summary-records.json");
  writeFileSync(join(dir, "discovery.json"), JSON.stringify(discovered));
  writeFileSync(records, JSON.stringify({
    version: 2, inventory: { exit_code: 0, file: "discovery.json" }, investigations,
  }));
  return records;
}

function writeListedIgnoredTree(path: string) {
  const tree = join(path, "node_modules");
  mkdirSync(tree);
  writeFileSync(join(tree, "local-patch.js"), "hand edit\n");
  return tree;
}

test("an unused clean linked worktree is listed as unused and clean, with its branch", () => {
  const path = linkedWorktree("wt-a");
  const c = inventory()[path];
  expect(c).toMatchObject({ entry: path, kind: "linked-worktree", verdict: "unused", state: "clean", branch: "wt/wt-a", reasons: [], owners: [] });
  expect(c.fingerprint).toMatch(/^v1:discovery:[0-9a-f]{64}$/);
});

test("v1 discovery fingerprint preserves ignored-file entries with and without stat metadata", () => {
  const date = "2000-01-01T00:00:00Z";
  const commit = Bun.spawnSync(["git", "commit", "-q", "--amend", "--no-edit", `--date=${date}`], {
    cwd: repo, env: { ...ENV, GIT_COMMITTER_DATE: date }, stderr: "pipe",
  });
  expect(commit.exitCode).toBe(0);
  const path = linkedWorktree("wt-fingerprint");
  for (const root of [repo, path]) writeFileSync(join(root, ".env"), "same ignored bytes\n");
  const gone = join(path, "local-cache", "gone");
  mkdirSync(dirname(gone));
  writeFileSync(gone, "gone by inspection\n");
  writeExecutable(join(dir, "bin", "git"), "sh", `
if [ "$PWD" = ${JSON.stringify(path)} ] && [ "$1" = status ]; then
  "$FAKE_GIT" "$@" || exit $?
  /bin/rm ${JSON.stringify(gone)}
  exit $?
fi
exec "$FAKE_GIT" "$@"
`);
  const preload = join(dir, "fingerprint-stats.ts");
  const fixedStats = {
    [path]: { dev: 1, ino: 2, birthtimeMs: 3 },
    [join(path, ".git")]: { dev: 1, ino: 4, birthtimeMs: 5 },
    [join(path, ".env")]: { ino: 6, mode: 0o100644, mtimeMs: 7, ctimeMs: 8 },
  };
  writeFileSync(preload, `
import { mock } from "bun:test";
import * as fs from "node:fs";
const actual = fs.lstatSync;
const stamps = ${JSON.stringify(fixedStats)};
mock.module("node:fs", () => ({
  ...fs, lstatSync(file, ...args) {
    const stat = actual(file, ...args);
    return Object.hasOwn(stamps, file) ? Object.assign(stat, stamps[file]) : stat;
  },
}));
`);
  const result = cleanWt(["inventory"], {}, repo, ["--preload", preload]);
  expect(result.stderr).toBe("");
  expect(result.code).toBe(0);
  expect(result.json.checkouts).toEqual([expect.objectContaining({
    path, changes: { ignored_unverified: ["local-cache/gone"] },
  })]);
  expect(result.json.checkouts[0].fingerprint).toBe("v1:discovery:0d3f3d4b6f6867c30e2d0527865733a9fc7368c71549f89ee2e6eae4d31685f8");
});

test("listed ignored content is not read and does not stop automatic cleanup even when it changes", () => {
  const dependencies = linkedWorktree("wt-dependencies");
  const monorepo = linkedWorktree("wt-monorepo");
  const control = linkedWorktree("wt-control");
  const buildTree = join(monorepo, "packages", "web", "build");
  const dependencyTree = writeListedIgnoredTree(dependencies);
  mkdirSync(buildTree, { recursive: true });
  const dependency = join(dependencyTree, "local-patch.js");
  writeFileSync(join(monorepo, "packages", "web", "web.tsbuildinfo"), "cache\n");
  writeFileSync(join(buildTree, "old.js"), "one-off artifact\n");
  writeFileSync(join(repo, ".env"), "TOKEN=1\n");
  writeFileSync(join(control, ".env"), "TOKEN=2\n");

  const paths = [dependencies, monorepo];
  const before = inventory();
  const progress = cleanWt(["inventory", "--progress"]);
  expect(progress.code).toBe(0);
  expect(progress.json.checkouts).toEqual(Object.values(before));
  const reads = progress.stderr.trim().split("\n").map(line => JSON.parse(line));
  for (const path of paths) {
    expect(before[path]).toMatchObject({ state: "clean", automatic: true });
    expect(before[path].changes).toEqual({});
    expect(reads).toContainEqual({ phase: "contents", stage: "complete", path, files: 0, bytes: 0 });
  }
  expect(before[control]).toMatchObject({ state: "dirty", automatic: false, changes: { ignored_unique: [".env"] } });
  const controlReads = reads.find(r => r.phase === "contents" && r.stage === "complete" && r.path === control);
  expect(controlReads.files).toBeGreaterThan(0);
  expect(controlReads.bytes).toBeGreaterThan(0);

  const ignoredStatus = (path: string) => git(path, "status", "--porcelain=v2", "-z", "--untracked-files=all", "--ignored");
  const statuses = paths.map(ignoredStatus);
  writeFileSync(dependency, "different hand edit\n");
  writeFileSync(join(dependencyTree, "added.js"), "new artifact\n");
  renameSync(join(buildTree, "old.js"), join(buildTree, "renamed.js"));
  rmSync(join(monorepo, "packages", "web", "web.tsbuildinfo"));
  const after = inventory();
  paths.forEach((path, i) => {
    expect(ignoredStatus(path)).not.toBe(statuses[i]);
    expect(after[path].fingerprint).toBe(before[path].fingerprint);
  });

  const result = remove(...paths.map(path => `${path}=${before[path].fingerprint}`));
  expect(result).toEqual({ removed: paths.map(path => ({ path, method: "git worktree remove" })), skipped: [], failed: [] });
  for (const path of paths) {
    expect(existsSync(path)).toBe(false);
    expect(git(repo, "rev-parse", "--verify", `refs/heads/${before[path].branch}`)).toMatch(/^[0-9a-f]{40}$/);
  }
  expect(readFileSync(join(control, ".env"), "utf8")).toBe("TOKEN=2\n");
});

test("discovery defers contents for Git-dirty work that targeted inventory still reads", () => {
  const path = linkedWorktree("wt-deferred");
  const control = linkedWorktree("wt-ignored-only");
  const unlisted = Buffer.alloc(2 * 1024 * 1024, 0x61);
  const draft = join(path, "draft.txt");
  writeFileSync(draft, "uncommitted work\n");
  const listed = writeListedIgnoredTree(path);
  writeFileSync(join(listed, "generated.bin"), Buffer.alloc(unlisted.length * 2, 0x62));
  mkdirSync(join(path, "local-cache"));
  writeFileSync(join(path, "local-cache", "unique.bin"), unlisted);
  writeFileSync(join(control, ".env"), "TOKEN=local\n");

  const discovery = cleanWt(["inventory", "--progress"]);
  expect(discovery.code).toBe(0);
  expect(discovery.json.checkouts).toContainEqual(expect.objectContaining({
    path, outcome: "contents deferred", state: "dirty", automatic: false, fingerprint: "",
    source_git_dir: join(repo, ".git"), changes: { untracked: ["draft.txt"] },
  }));
  expect(discovery.json.checkouts).toContainEqual(expect.objectContaining({
    path: control, outcome: "inspected", automatic: false, changes: { ignored_unique: [".env"] },
  }));
  const discoveryReads = discovery.stderr.trim().split("\n").map(line => JSON.parse(line));
  expect(discoveryReads).toContainEqual({ phase: "contents", stage: "complete", path, files: 0, bytes: 0 });
  expect(discoveryReads).toContainEqual({ phase: "contents", stage: "complete", path: control, files: 1, bytes: 12 });

  const sourceFacts = cleanWt(["inventory", "--prepare-source", join(repo, ".git")]);
  expect(sourceFacts.code).toBe(0);
  expect(sourceFacts.stderr).toBe("");
  const facts = join(dir, "deferred-source-facts.json");
  writeFileSync(facts, sourceFacts.stdout);
  const targeted = cleanWt(["inventory", "--progress", "--target", path, "--source-facts", facts]);
  expect(targeted.code).toBe(0);
  expect(targeted.json.checkouts).toEqual([expect.objectContaining({
    path, outcome: "inspected", state: "dirty", automatic: false, fingerprint: expect.stringMatching(/^v1:targeted:[0-9a-f]{64}$/),
    changes: { untracked: ["draft.txt"], ignored_unique: ["local-cache/unique.bin"] },
  })]);
  const targetedReads = targeted.stderr.trim().split("\n").map(line => JSON.parse(line));
  expect(targetedReads).toContainEqual({ phase: "contents", stage: "complete", path, files: 2, bytes: unlisted.length + 17 });
  expect(readFileSync(draft, "utf8")).toBe("uncommitted work\n");
  expect(statSync(join(listed, "generated.bin")).size).toBe(unlisted.length * 2);
  expect(statSync(join(path, "local-cache", "unique.bin")).size).toBe(unlisted.length);
});

test("tracked and non-ignored untracked build paths still block automatic cleanup", () => {
  const tracked = "packages/web/build/manifest";
  mkdirSync(join(repo, dirname(tracked)), { recursive: true });
  writeFileSync(join(repo, tracked), "committed\n");
  git(repo, "add", "-f", tracked);
  git(repo, "commit", "-qm", "track build manifest");
  const path = linkedWorktree("wt-build-work");
  writeFileSync(join(path, tracked), "edited\n");
  writeFileSync(join(path, "build"), "untracked\n");
  writeFileSync(join(path, "packages", "web", "build", "generated"), "ignored\n");
  const checkout = inventory()[path];
  expect(checkout).toMatchObject({ outcome: "contents deferred", state: "dirty", automatic: false, changes: {
    unstaged: [tracked], untracked: ["build"],
  } });
  const investigated = comparedCheckout(path);
  expect(investigated.changes.ignored_unique).toBeUndefined();
  const result = remove(`${path}=${investigated.fingerprint}`);
  expect(result.removed).toEqual([]);
  expect(result.skipped).toEqual([{ path, reason: "it holds dirty work, and removing it needs --approve" }]);
  expect(readFileSync(join(path, tracked), "utf8")).toBe("edited\n");
  expect(readFileSync(join(path, "build"), "utf8")).toBe("untracked\n");
});

function gitDuring(cwd: string, condition: string, action: string) {
  writeExecutable(join(dir, "bin", "git"), "sh", `
if [ "$PWD" = ${JSON.stringify(cwd)} ] && ${condition} && [ ! -f ${JSON.stringify(join(dir, "git-triggered"))} ]; then
  : > ${JSON.stringify(join(dir, "git-triggered"))}
  ${action}
fi
exec "$FAKE_GIT" "$@"
`);
}

test.each(["linked", "ovnfs"])("inventory accounts for a %s checkout deleted during a sibling inspection", (kind) => {
  const survivor = linkedWorktree("wt-a");
  const removed = kind === "linked" ? linkedWorktree("wt-z") : ovnfsCheckout("omp-gone");
  const later = join(base, "late");
  const state = JSON.stringify(join(ovnfsRoot, "checkouts.json"));
  const prior = inventory();
  rmSync(join(ovnfsRoot, "calls.jsonl"));
  writeExecutable(join(dir, "bin", "omp"), "sh", `
if [ "$1 $2 $3" = "worktree list --json" ]; then echo list >> ${JSON.stringify(join(dir, "omp-calls"))}; fi
exec bun ${JSON.stringify(FAKE_OMP)} "$@"
`);
  gitDuring(survivor, '[ "$1" = status ]', `
    ${kind === "linked" ? `"$FAKE_GIT" -C "$FAKE_OMP_PARENT" worktree remove ${JSON.stringify(removed)}` :
      `/bin/rm -r ${JSON.stringify(removed)}; echo '[]' > ${state}`}
    /bin/mkdir ${JSON.stringify(later)}
`);
  const r = cleanWt(["inventory", "--progress"]);
  expect(r.code).toBe(0);
  const report = Object.fromEntries(r.json.checkouts.map((record: Checkout) => [record.path, record]));
  expect(Object.keys(report)).toEqual([survivor, removed]);
  expect(report[survivor]).toEqual(prior[survivor]);
  expect(report[removed]).toMatchObject({
    outcome: "vanished", verdict: "uncertain", automatic: false, fingerprint: "",
    failure: { stage: kind === "linked" ? "layout" : "inspection", error: expect.stringContaining("ENOENT") },
  });
  expect(r.stderr.split("\n").filter(Boolean).map((line) => JSON.parse(line))).toContainEqual(
    expect.objectContaining({ phase: "checkout", stage: "vanished", path: removed }),
  );
  expect(readFileSync(join(dir, "omp-calls"), "utf8").trim().split("\n")).toHaveLength(2);
  expect(readFileSync(join(ovnfsRoot, "calls.jsonl"), "utf8").trim().split("\n").filter((line) => JSON.parse(line).args.includes("ls"))).toHaveLength(2);
  expect(existsSync(removed)).toBe(false);
  expect(existsSync(survivor)).toBe(true);
  expect(existsSync(later)).toBe(true);
});

test.each(["linked", "ovnfs"])("inventory distinguishes a known %s replacement at the listed path", (kind) => {
  const survivor = linkedWorktree("wt-a");
  const replaced = kind === "linked" ? linkedWorktree("wt-z") : ovnfsCheckout("omp-reused");
  const before = inventory()[replaced];
  expect(before.automatic).toBe(true);
  gitDuring(survivor, '[ "$1" = status ]', kind === "linked"
    ? `"$FAKE_GIT" -C "$FAKE_OMP_PARENT" worktree remove ${JSON.stringify(replaced)}
      "$FAKE_GIT" -C "$FAKE_OMP_PARENT" worktree add -q ${JSON.stringify(replaced)} wt/wt-z`
    : `/bin/mv ${JSON.stringify(replaced)} ${JSON.stringify(join(dir, "previous"))}
      "$FAKE_GIT" clone -q --no-hardlinks "$FAKE_OMP_PARENT" ${JSON.stringify(replaced)}`);
  const r = cleanWt(["inventory", "--progress"]);
  expect(r.code).toBe(0);
  expect(r.json.checkouts).toEqual([
    expect.objectContaining({ path: survivor, outcome: "inspected", automatic: true }),
    expect.objectContaining({ path: replaced, outcome: "replaced", verdict: "uncertain", automatic: false, fingerprint: "" }),
  ]);
  expect(r.stderr).not.toContain("confirm absence");
  expect(existsSync(replaced)).toBe(true);
  const removal = remove("--approve", replaced, `${replaced}=${before.fingerprint}`);
  expect(removal.removed).toEqual([]);
  expect(removal.skipped).toEqual([{ path: replaced, reason: "it changed since the inventory" }]);
  expect(existsSync(replaced)).toBe(true);
});

test("inventory reports an ovnfs name reused at a different path without adding the replacement", () => {
  const survivor = linkedWorktree("wt-a");
  const path = ovnfsCheckout("omp-reused");
  const replacement = join(ovnfsRoot, "replacement");
  git(dir, "clone", "-q", "--no-hardlinks", repo, replacement);
  const state = join(ovnfsRoot, "checkouts.json");
  const updated = join(dir, "replacement-list.json");
  const [entry] = JSON.parse(readFileSync(state, "utf8"));
  writeFileSync(updated, JSON.stringify([{ ...entry, path: replacement }]));
  gitDuring(survivor, '[ "$1" = status ]', `
    /bin/mv ${JSON.stringify(path)} ${JSON.stringify(join(dir, "retired-checkout"))}
    /bin/mv ${JSON.stringify(updated)} ${JSON.stringify(state)}
  `);

  const report = inventory();
  expect(Object.keys(report)).toEqual([survivor, path]);
  expect(report[survivor]).toMatchObject({ outcome: "inspected", automatic: true });
  expect(report[path]).toMatchObject({ outcome: "replaced", verdict: "uncertain", automatic: false, fingerprint: "" });
  expect(existsSync(path)).toBe(false);
  expect(existsSync(replacement)).toBe(true);
});

test("inventory protects a native checkout replaced during the ovnfs listing", () => {
  const survivor = linkedWorktree("wt-a");
  const path = linkedWorktree("wt-recreated");
  writeExecutable(join(dir, "bin", "ovnfs"), "sh", `
if [ "$1 $2" = "--json ls" ] && [ ! -f ${JSON.stringify(join(dir, "recreated"))} ]; then
  "$FAKE_GIT" -C "$FAKE_OMP_PARENT" worktree remove ${JSON.stringify(path)} &&
  "$FAKE_GIT" -C "$FAKE_OMP_PARENT" worktree add -q ${JSON.stringify(path)} wt/wt-recreated || exit 1
  : > ${JSON.stringify(join(dir, "recreated"))}
fi
exec bun ${JSON.stringify(FAKE_OVNFS)} "$@"
`);
  const report = inventory();
  expect(Object.keys(report)).toEqual([survivor, path]);
  expect(report[survivor]).toMatchObject({ outcome: "inspected", automatic: true });
  expect(existsSync(join(dir, "recreated"))).toBe(true);
  expect(existsSync(path)).toBe(true);
  const removal = cleanWt(["remove", `${path}=${report[path].fingerprint}`]);
  expect({ present: existsSync(path), exit: removal.code, removed: removal.json?.removed }).toEqual({
    present: true, exit: 2, removed: undefined,
  });
  expect(removal.stderr).toContain("is not <path>=<fingerprint>");
  expect(report[path]).toMatchObject({ outcome: "replaced", verdict: "uncertain", automatic: false, fingerprint: "" });
  expect(existsSync(survivor)).toBe(true);
});

function replaceAfterListing(kind: "omp" | "ovnfs", path: string, replacement: string, skipFirst = false) {
  const listing = kind === "omp" ? "worktree list --json" : "--json ls";
  const script = kind === "omp" ? FAKE_OMP : FAKE_OVNFS;
  const first = join(dir, "first-list");
  const retired = join(dir, "retired-after-list");
  writeExecutable(join(dir, "bin", kind), "sh", `
bun ${JSON.stringify(script)} "$@" || exit $?
if [ "$*" = ${JSON.stringify(listing)} ] && [ ! -d ${JSON.stringify(retired)} ]; then
  ${skipFirst ? `if [ ! -f ${JSON.stringify(first)} ]; then : > ${JSON.stringify(first)}; exit 0; fi` : ""}
  /bin/mv ${JSON.stringify(path)} ${JSON.stringify(retired)} &&
  /bin/mv ${JSON.stringify(replacement)} ${JSON.stringify(path)} || exit 1
fi
`);
  return retired;
}

test.each(["omp", "ovnfs"] as const)("discovery cannot authorize removal of a replacement made before the %s lister exits", (kind) => {
  const path = kind === "omp" ? linkedWorktree("wt-recreated") : ovnfsCheckout("omp-recreated");
  const replacement = join(dir, "replacement");
  cpSync(path, replacement, { recursive: true });
  const retired = replaceAfterListing(kind, path, replacement);

  const checkout = inventory()[path];
  expect(existsSync(retired)).toBe(true);
  const result = cleanWt(["remove", `${path}=${checkout.fingerprint}`]);
  expect({ survives: existsSync(path), code: result.code, removed: result.json?.removed }).toEqual({
    survives: true, code: 2, removed: undefined,
  });
  expect(checkout).toMatchObject({ outcome: "replaced", automatic: false, fingerprint: "" });
});

test.each(["omp", "ovnfs"] as const)("removal skips a matching fingerprint if the checkout changed during its fresh %s listing", (kind) => {
  const path = kind === "omp" ? linkedWorktree("wt-recreated") : ovnfsCheckout("omp-recreated");
  const checkout = inventory()[path];
  expect(checkout.automatic).toBe(true);
  const replacement = join(dir, "previously-inventoried");
  renameSync(path, replacement);
  cpSync(replacement, path, { recursive: true });
  const retired = replaceAfterListing(kind, path, replacement, true);

  const result = remove(`${path}=${checkout.fingerprint}`);
  expect(existsSync(retired)).toBe(true);
  expect({ survives: existsSync(path), ...result }).toMatchObject({
    survives: true, removed: [], failed: [],
    skipped: [{ path, reason: expect.stringContaining("different checkout instance") }],
  });
});

test("inventory protects a listed ovnfs path whose initial instance could not be observed", () => {
  const survivor = linkedWorktree("wt-a");
  const path = ovnfsCheckout("omp-invisible");
  const hidden = join(dir, "hidden");
  renameSync(path, hidden);
  gitDuring(survivor, '[ "$1" = status ]', `/bin/mv ${JSON.stringify(hidden)} ${JSON.stringify(path)}`);
  const r = cleanWt(["inventory", "--progress"]);
  expect(r.code).toBe(0);
  expect(r.json.checkouts[1]).toMatchObject({ path, verdict: "uncertain", automatic: false, fingerprint: "" });
  expect(r.json.checkouts[1].outcome).not.toBe("vanished");
  expect(r.json.checkouts[1].outcome).not.toBe("replaced");
  expect(r.stderr).toContain("confirm absence");
  expect(existsSync(path)).toBe(true);
});

test.each(["git file", "disk", "listing"])("inventory does not infer absence from a missing %s alone", (missing) => {
  const survivor = linkedWorktree("wt-a");
  const path = missing === "git file" ? linkedWorktree("wt-z") : ovnfsCheckout("omp-gone");
  const removeGit = `/bin/rm ${JSON.stringify(join(path, ".git"))}`;
  gitDuring(survivor, '[ "$1" = status ]', missing === "git file" ? removeGit :
    missing === "disk" ? `/bin/rm -r ${JSON.stringify(path)}` :
      `${removeGit}; echo '[]' > ${JSON.stringify(join(ovnfsRoot, "checkouts.json"))}`);
  const r = cleanWt(["inventory", "--progress"]);
  expect(r.code).toBe(0);
  expect(r.json.checkouts[1]).toMatchObject({
    path, outcome: "inspection failed", fingerprint: "", automatic: false, verdict: "uncertain",
    failure: { stage: missing === "git file" ? "layout" : "inspection", error: expect.stringMatching(/ENOENT|not a git repository/) },
  });
  expect(r.stderr).toContain("confirm absence");
  const refused = cleanWt(["remove", `${path}=${r.json.checkouts[1].fingerprint}`]);
  expect(refused.code).toBe(2);
  expect(refused.stderr).toContain("is not <path>=<fingerprint>");
  expect(existsSync(path)).toBe(missing !== "disk");
});

test("inventory reports missing Git without mistaking it for a missing checkout", () => {
  const path = linkedWorktree("wt-a");
  const bins = join(dir, "bin");
  symlinkSync(process.execPath, join(bins, "bun"));
  if (process.platform === "darwin") symlinkSync(Bun.which("lsof")!, join(bins, "lsof"));
  const r = cleanWt(["inventory", "--progress"], { PATH: bins });
  expect(r.code).toBe(0);
  expect(r.json.checkouts).toEqual([expect.objectContaining({
    path, outcome: "inspection failed", fingerprint: "", automatic: false, verdict: "uncertain",
    failure: { stage: "source resolution", error: expect.stringMatching(/ENOENT|not found/) },
  })]);
  expect(r.stderr).toContain("confirm absence");
  expect(existsSync(path)).toBe(true);
});

test("inventory accounts for failed source resolution and protects all dependents without affecting other checkouts", () => {
  const unrelated = linkedWorktree("wt-a");
  const broken = join(dir, "broken-source");
  git(dir, "clone", "-q", repo, broken);
  const first = ovnfsCheckout("omp-first", broken);
  const second = ovnfsCheckout("omp-second", first);
  writeExecutable(join(dir, "bin", "git"), "sh", `
if [ "$PWD" = ${JSON.stringify(broken)} ] && [ "$1" = rev-parse ]; then
  echo 'fixture source evidence failure' >&2
  exit 71
fi
exec "$FAKE_GIT" "$@"
`);
  const r = cleanWt(["inventory", "--progress"]);
  expect(r.code).toBe(0);
  expect(r.json.checkouts).toEqual([
    expect.objectContaining({ path: unrelated, outcome: "inspected", automatic: true }),
    ...[first, second].map((path) => expect.objectContaining({
      path, outcome: "inspection failed", verdict: "uncertain", automatic: false, fingerprint: "",
      failure: { stage: "source resolution", error: expect.stringContaining("fixture source evidence failure") },
    })),
  ]);
  expect(r.stderr).toContain("confirm absence");
  expect([first, second, unrelated].every(existsSync)).toBe(true);
});

test("a vanished unrelated Git registration does not block a task clone's alternates", () => {
  const survivor = linkedWorktree("wt-a");
  const unrelated = linkedWorktree("wt-b");
  const registration = git(unrelated, "rev-parse", "--absolute-git-dir").trim();
  const gitFile = join(unrelated, ".git");
  const entry = taskSandbox("wt-z", { pid: Bun.spawnSync(["true"]).pid, id: "Alternates" });
  const task = join(entry, "m");
  gitDuring(survivor, '[ "$1" = status ]', `
    /bin/mv ${JSON.stringify(registration)} ${JSON.stringify(join(dir, "retired-registration"))}
    /bin/chmod 000 ${JSON.stringify(gitFile)}
  `);
  try {
    const report = inventory();
    expect(existsSync(registration)).toBe(false);
    expect(report[unrelated]).toMatchObject({
      outcome: "inspection failed", automatic: false, fingerprint: "",
      failure: { stage: "layout", error: expect.stringContaining("EACCES") },
    });
    expect(report[task]).toMatchObject({
      kind: "task-isolation", outcome: "inspected", automatic: true, source_git_dir: join(repo, ".git"),
    });
  } finally {
    chmodSync(gitFile, 0o644);
  }
});

test("machine-wide inventory resolves two repositories equally from Git and non-Git directories", () => {
  const first = linkedWorktree("wt-first");
  const other = join(dir, "other");
  git(dir, "clone", "-q", repo, other);
  const second = join(base, "wt-second");
  git(other, "worktree", "add", "-q", "-b", "other-work", second);
  const child = ovnfsCheckout("omp-other", second);
  const nested = ovnfsCheckout("omp-other-nested", child);
  const unknown = ovnfsCheckout("omp-unknown", join(dir, "missing-source"));
  const standalone = join(base, "pr-copy");
  git(dir, "clone", "-q", repo, standalone);
  const env = { FAKE_OMP_LISTING: JSON.stringify([
    { path: first, parentRepo: repo },
    { path: second, parentRepo: other },
    { path: standalone, parentRepo: repo },
  ]) };
  const inventories = [repo, other, dir].map((cwd) => {
    const result = cleanWt(["inventory", "--progress"], env, cwd);
    expect(result.code).toBe(0);
    expect(result.json.evidence_gaps).toEqual([]);
    const records = result.json.checkouts as Checkout[];
    expect(records.map((record) => record.path).sort()).toEqual([first, second, standalone, child, nested, unknown].sort());
    expect(records.find((record) => record.path === standalone)).toMatchObject({ source_git_dir: join(repo, ".git"), automatic: true });
    expect(records.find((record) => record.path === child)).toMatchObject({ verdict: "uncertain" });
    expect(records.find((record) => record.path === nested)).toMatchObject({ source_git_dir: join(other, ".git"), automatic: true });
    expect(records.find((record) => record.path === second)?.reasons.join(" ")).toContain("omp-other");
    expect(records.find((record) => record.path === child)?.reasons.join(" ")).toContain("omp-other-nested");
    expect(records.find((record) => record.path === unknown)).toMatchObject({ verdict: "uncertain", state: "not checked" });
    expect(records.find((record) => record.path === unknown)?.reasons.join(" ")).toContain("missing-source");
    const progress = result.stderr.trim().split("\n").map((line) => JSON.parse(line));
    expect(progress.filter((event) => event.stage === "native listing")).toHaveLength(1);
    expect(progress.filter((event) => event.stage === "ovnfs listing")).toHaveLength(1);
    expect(progress.filter((event) => event.phase === "checkout" && event.stage === "ownership").map((event) => event.path).sort()).toEqual(records.map((record) => record.path).sort());
    return records;
  });
  expect(inventories[1]).toEqual(inventories[0]);
  expect(inventories[2]).toEqual(inventories[0]);
  const prepared = cleanWt(["inventory", "--prepare-source", join(repo, ".git"), "--prepare-source", join(other, ".git")], env, dir);
  expect(prepared.code).toBe(0);
  expect(prepared.json.source_facts.map((fact: { source_git_dir: string }) => fact.source_git_dir).sort()).toEqual([join(repo, ".git"), join(other, ".git")].sort());
  const candidate = inventories[0]!.find((record) => record.path === standalone)!;
  const removed = cleanWt(["remove", `${standalone}=${candidate.fingerprint}`], env, dir);
  expect(removed.code).toBe(0);
  expect(removed.json.removed).toEqual([{ path: standalone, method: "rm -r" }]);
  expect(existsSync(standalone)).toBe(false);
  expect(git(other, "worktree", "list", "--porcelain")).toContain(second);
});

test("opt-in progress reports scan work and the actual ownership blocker without changing JSON stdout", () => {
  const path = linkedWorktree("wt-progress");
  for (const root of [repo, path]) {
    mkdirSync(join(root, "local-cache"));
    writeFileSync(join(root, "local-cache", "same.bin"), Buffer.alloc(4096, 7));
  }
  const scanned = cleanWt(["inventory", "--progress"]);
  expect(scanned.code).toBe(0);
  expect(scanned.json.checkouts.find((c: Checkout) => c.path === path)).toMatchObject({ verdict: "unused", state: "clean" });
  const events = scanned.stderr.trim().split("\n").map(line => JSON.parse(line));
  expect(events).toContainEqual({ phase: "evidence", stage: "native listing" });
  expect(events).toContainEqual({ phase: "checkout", stage: "contents", path });
  const contents = events.find(event => event.phase === "contents" && event.stage === "complete" && event.path === path);
  expect(contents.files).toBeGreaterThan(0);
  expect(contents.bytes).toBeGreaterThanOrEqual(8192);
  const blocked = cleanWt(["inventory", "--progress"], { PI_SESSION_ID: undefined });
  expect(blocked.code).toBe(0);
  const blockedEvents = blocked.stderr.trim().split("\n").map(line => JSON.parse(line));
  expect(blockedEvents).toContainEqual({ phase: "evidence", stage: "complete", blockers: blocked.json.evidence_gaps });
  expect(blockedEvents.find(event => event.phase === "checkout" && event.stage === "protected" && event.path === path).blockers.join(" ")).toContain("run clean-wt from an omp session");
  expect(blockedEvents.some(event => event.phase === "contents")).toBe(false);
});

test("large ignored trees keep fresh cleanup guards within a bounded content-read workload", () => {
  const { path } = integratedDraft();
  const survivor = linkedWorktree("wt-verify-survivor");
  const groups = 64;
  const filesPerGroup = 32;
  const fileCount = groups * filesPerGroup;
  const fileBytes = 1024;
  const writeTree = (root: string) => {
    const contents = Buffer.alloc(fileBytes);
    for (let group = 0; group < groups; group++) {
      const folder = join(root, "local-cache", `package-${group}`);
      mkdirSync(folder, { recursive: true });
      for (let file = 0; file < filesPerGroup; file++) {
        writeFileSync(join(folder, `${file}.bin`), contents.fill(group + file));
      }
      const disposable = join(folder, "build");
      mkdirSync(disposable);
      writeFileSync(join(disposable, "generated.bin"), "not compared");
    }
  };
  for (const root of [repo, path, survivor]) writeTree(root);
  const measured: Record<string, number | string>[] = [];
  const measure = (operation: string, args: string[], width?: string) => {
    const started = performance.now();
    const result = cleanWt([...args, "--progress"], { VSTACK_CLEAN_WT_READER_WIDTH: width });
    expect(result.code).toBe(0);
    const events = result.stderr.trim().split("\n").map(line => JSON.parse(line));
    const reads = events.filter(event => event.phase === "contents" && event.stage === "complete");
    const reader = events.find(event => event.phase === "reader" && event.stage === "complete");
    expect(reader).toMatchObject({
      files: reads.reduce((sum, event) => sum + event.files, 0),
      bytes: reads.reduce((sum, event) => sum + event.bytes, 0),
    });
    expect(reader.open_file_limit).toBe(reader.width);
    expect(reader.buffer_byte_limit).toBe(reader.width * 64 * 1024);
    expect(reader.peak_open_files).toBeLessThanOrEqual(reader.open_file_limit);
    expect(reader.peak_buffer_bytes).toBeLessThanOrEqual(reader.buffer_byte_limit);
    measured.push({ operation, inspections: reads.length, elapsed_ms: Math.round(performance.now() - started), ...reader });
    return result.json;
  };
  const serial = measure("discovery width 1", ["inventory"], "1");
  const discovered = measure("discovery default", ["inventory"]);
  expect(discovered).toEqual(serial);
  const record = discovered.checkouts.find((c: Checkout) => c.path === path);
  expect(record).toMatchObject({ outcome: "contents deferred", state: "dirty", automatic: false, fingerprint: "" });
  expect(discovered.checkouts.find((c: Checkout) => c.path === survivor)).toMatchObject({
    outcome: "inspected", state: "clean", automatic: true, fingerprint: expect.stringMatching(/^v1:discovery:[a-f0-9]{64}$/),
  });
  const ignoredReads = { files: 2 * fileCount, bytes: 2 * fileCount * fileBytes };
  expect(measured[0]).toMatchObject({ ...ignoredReads, width: 1, peak_open_files: 1, peak_buffer_bytes: 64 * 1024 });
  expect(measured[1]).toMatchObject(ignoredReads);
  expect(measured[1].width).toBeGreaterThan(1);
  expect(measured[1].peak_open_files).toBeGreaterThan(1);
  const prepared = measure("prepare source", ["inventory", "--prepare-source", record.source_git_dir]);
  const facts = join(dir, "large-tree-source.json");
  writeFileSync(facts, JSON.stringify(prepared));
  const investigated = measure("investigation", ["inventory", "--target", path, "--source-facts", facts]).checkouts[0];
  expect(investigated).toMatchObject({ state: "dirty", automatic: true, integration: { status: "verified" } });
  const investigation = measured.find(item => item.operation === "investigation")!;
  expect(investigation).toMatchObject({ files: ignoredReads.files + 1, bytes: ignoredReads.bytes + Buffer.byteLength("integrated\n") });
  const removed = measure("removal", ["remove", `${path}=${investigated.fingerprint}`]);
  expect(removed).toEqual({ removed: [{ path, method: "git worktree remove --force" }], skipped: [], failed: [] });
  expect(measured.find(item => item.operation === "removal")).toMatchObject({
    inspections: 1, files: investigation.files, bytes: investigation.bytes,
  });
  const survivingFile = join(survivor, "local-cache", "package-0", "0.bin");
  const records = verificationInput(discovered, [{ path, status: "complete", checkout: investigated }]);
  const verified = measure("final verification", ["inventory", "--verify", records]);
  expect(verified.checkouts).toEqual([{ path: survivor, verdict: "unused", owners: [], reasons: [] }]);
  expect(verified.observations).toEqual(expect.arrayContaining([
    expect.objectContaining({ path, omp_listed: false, ovnfs_listed: false, disk: "absent", git_registered: false, branch_preserved: true }),
    expect.objectContaining({ path: survivor, omp_listed: true, disk: "present" }),
  ]));
  expect(measured.at(-1)).toMatchObject({ inspections: 0, files: 0, bytes: 0, peak_open_files: 0, peak_buffer_bytes: 0 });
  expect(existsSync(path)).toBe(false);
  expect(readFileSync(survivingFile)).toEqual(Buffer.alloc(fileBytes));
  console.log(JSON.stringify({ workload: { files_per_tree: fileCount, bytes_per_tree: fileCount * fileBytes }, measured }));
}, 30000);

test("content-free commands ignore an invalid reader width", () => {
  const path = linkedWorktree("wt-reader");
  mkdirSync(join(path, "local-cache"));
  writeFileSync(join(path, "local-cache", "draft"), "read me\n");
  const discovered = cleanWt(["inventory"]);
  expect(discovered.code).toBe(0);
  const records = verificationInput(discovered.json);
  git(repo, "remote", "add", "origin", repo);
  const invalidWidth = { VSTACK_CLEAN_WT_READER_WIDTH: "not-a-width" };

  const verified = cleanWt(["inventory", "--verify", records, "--progress"], invalidWidth);
  expect(verified.code).toBe(0);
  expect(verified.json.observations).toEqual([expect.objectContaining({ path, disk: "present", instance: "same" })]);
  expect(verified.stderr.trim().split("\n").map((line) => JSON.parse(line))).toContainEqual(
    expect.objectContaining({ phase: "reader", files: 0, bytes: 0 }),
  );
  const prepared = cleanWt(["inventory", "--prepare-source", join(repo, ".git")], invalidWidth);
  expect(prepared.code).toBe(0);
  expect(prepared.json.source_facts).toEqual([expect.objectContaining({ source_git_dir: join(repo, ".git"), ref: "refs/heads/main" })]);
  const reading = cleanWt(["inventory"], invalidWidth);
  expect(reading.code).toBe(2);
  expect(reading.stderr).toContain("VSTACK_CLEAN_WT_READER_WIDTH must be an integer");
});

test("verification checks the full branch ref when a tag has the same name", () => {
  const branch = "draft";
  const path = linkedWorktree("wt-branch-tag-collision", branch);
  git(repo, "tag", branch);
  const discovered = cleanWt(["inventory"]);
  expect(discovered.code).toBe(0);
  const records = verificationInput(discovered.json);
  const [target] = discovered.json.checkouts;
  const removed = cleanWt(["remove", `${path}=${target.fingerprint}`]);
  expect(removed.json.removed).toEqual([{ path, method: "git worktree remove" }]);

  const verify = () => {
    const result = cleanWt(["inventory", "--verify", records]);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.json.observations).toEqual([expect.objectContaining({
      path, omp_listed: false, ovnfs_listed: false, disk: "absent", git_registered: false,
    })]);
    return result.json.observations[0].branch_preserved;
  };
  expect(verify()).toBe(true);
  expect(target.branch).toBe(branch);
  git(repo, "branch", "-D", branch);
  expect(git(repo, "tag", "--list", branch).trim()).toBe(branch);
  expect(verify()).toBe(false);
});

test("verification distinguishes a replacement between discovery and verification", () => {
  const path = linkedWorktree("wt-recreated");
  const unconfirmed = linkedWorktree("wt-no-discovery-identity");
  const stable = linkedWorktree("wt-unchanged");
  const discovered = cleanWt(["inventory"]);
  expect(discovered.code).toBe(0);
  delete discovered.json.checkouts.find((c: Checkout) => c.path === unconfirmed).instance_id;
  const records = verificationInput(discovered.json);
  git(repo, "worktree", "remove", path);
  git(repo, "worktree", "add", "-q", path, "wt/wt-recreated");

  const result = cleanWt(["inventory", "--verify", records]);
  expect(result.stderr).toBe("");
  expect(result.code).toBe(0);
  expect(result.json.observations).toEqual([
    expect.objectContaining({ path: unconfirmed, disk: "present", omp_listed: true, instance: "unknown" }),
    expect.objectContaining({ path, disk: "present", omp_listed: true, git_registered: true, instance: "replaced" }),
    expect.objectContaining({ path: stable, disk: "present", omp_listed: true, instance: "same" }),
  ]);
});

test("verification reports live owners separately from missing ownership proof and cannot authorize removal", async () => {
  const owned = linkedWorktree("wt-gained-owner");
  const uncertain = linkedWorktree("wt-unknown-owner");
  const records = verificationInput(cleanWt(["inventory"]).json);
  session("new-owner", owned);
  await holdLease("new-owner");

  const verified = cleanWt(["inventory", "--verify", records, "--progress"], { PI_SESSION_ID: undefined });
  expect(verified.code).toBe(0);
  expect(verified.json.evidence_gaps).toEqual([]);
  expect(verified.json.ownership_gaps).toEqual([expect.stringContaining("PI_SESSION_ID")]);
  expect(verified.json.checkouts).toEqual([
    { path: owned, verdict: "owned", owners: [expect.objectContaining({ type: "session", id: "new-owner" })], reasons: [] },
    { path: uncertain, verdict: "uncertain", owners: [], reasons: verified.json.ownership_gaps },
  ]);
  expect(verified.stdout).not.toContain('"fingerprint"');
  const rejected = cleanWt(["remove", `${owned}=${verified.json.checkouts[0].fingerprint ?? ""}`]);
  expect(rejected.code).toBe(2);
  expect(rejected.stdout).toBe("");
  expect(rejected.stderr).toContain("is not <path>=<fingerprint>");
  expect(existsSync(owned)).toBe(true);
  expect(existsSync(uncertain)).toBe(true);
  const events = verified.stderr.trim().split("\n").map((line) => JSON.parse(line));
  expect(events.filter((event) => event.phase === "contents")).toEqual([]);
  expect(events).toContainEqual({ phase: "verification", stage: "complete", files: 0, bytes: 0 });
});

test("verification uses ovnfs run-record gaps without treating unknown origins as ownership gaps", () => {
  const invalid = ovnfsCheckout("omp-invalid-run");
  const valid = ovnfsCheckout("omp-valid-run");
  const records = verificationInput(cleanWt(["inventory"]).json);
  const wrapper = join(base, "t-invalid");
  mkdirSync(wrapper);
  const record = join(wrapper, ".omp-ovnfs-checkout.json");
  writeFileSync(record, JSON.stringify({ checkout: "omp-invalid-run" }));

  const result = cleanWt(["inventory", "--verify", records]);
  expect(result.stderr).toBe("");
  expect(result.code).toBe(0);
  expect(result.json.checkouts).toEqual([
    { path: invalid, verdict: "uncertain", owners: [], reasons: [`invalid ovnfs run record: ${record}`] },
    { path: valid, verdict: "unused", owners: [], reasons: [] },
  ]);
});

test("verification reports disk changes and native listing disagreement without collapsing the facts", () => {
  const vanished = linkedWorktree("wt-vanished");
  const unlisted = linkedWorktree("wt-unlisted");
  const absentAfterStart = linkedWorktree("wt-absent-after-start");
  const records = verificationInput(cleanWt(["inventory"]).json);
  writeExecutable(join(dir, "bin", "ovnfs"), "sh", `
if [ "$1 $2" = "--json ls" ]; then
  "$FAKE_GIT" -C "$FAKE_OMP_PARENT" worktree remove ${JSON.stringify(vanished)}
  "$FAKE_GIT" -C "$FAKE_OMP_PARENT" worktree remove ${JSON.stringify(absentAfterStart)}
fi
exec bun ${JSON.stringify(FAKE_OVNFS)} "$@"
`);
  const result = cleanWt(["inventory", "--verify", records], { FAKE_OMP_HIDE: "wt-unlisted,wt-absent-after-start" });
  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.json.observations).toEqual([
    expect.objectContaining({ path: absentAfterStart, omp_listed: false, disk: "absent", disk_changed: true, git_registered: false, branch_preserved: true }),
    expect.objectContaining({ path: unlisted, omp_listed: false, disk: "present", git_registered: true }),
    expect.objectContaining({ path: vanished, omp_listed: true, disk: "absent", disk_changed: true, git_registered: false }),
  ]);
  expect(existsSync(vanished)).toBe(false);
  expect(existsSync(absentAfterStart)).toBe(false);
  expect(existsSync(unlisted)).toBe(true);
});

test("a held session lease protects its checkout, and a session whose lease is free does not", async () => {
  const idle = linkedWorktree("wt-idle");
  writeListedIgnoredTree(idle);
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
  const noId = inventory({ PI_SESSION_ID: undefined }, true)[path];
  expect(noId.verdict).toBe("uncertain");
  expect(noId.reasons.join(" ")).toContain("PI_SESSION_ID");
  for (const h of holders) h.kill();
  await Promise.all(holders.map((h) => h.exited));
  const withoutOwnLease = inventory({}, true)[path];
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

test.skipIf(process.platform === "linux" || process.platform === "win32")("one native ownership scan protects both lease and cwd owners without treating open files as cwd owners", async () => {
  const leased = linkedWorktree("wt-leased");
  const active = linkedWorktree("wt-active");
  const inactive = linkedWorktree("wt-inactive");
  for (const holder of holders) holder.kill();
  await Promise.all(holders.map(holder => holder.exited));
  holders = [];
  owners = join(inactive, "leases");
  mkdirSync(owners);
  await holdLease(OWN);
  session("leased-session", leased);
  await holdLease("leased-session", join(inactive, "README.md"));
  const shell = Bun.spawn(["sleep", "600"], { cwd: active });
  holders.push(shell);
  const lsof = Bun.which("lsof")!;
  const calls = join(dir, "lsof-calls.jsonl");
  writeExecutable(join(dir, "bin", "lsof"), "bun", `import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(calls)}, JSON.stringify(process.argv.slice(2)) + "\\n");
const result = Bun.spawnSync([${JSON.stringify(lsof)}, ...process.argv.slice(2)], { stdout: "inherit", stderr: "inherit" });
process.exit(result.exitCode);`);
  const inv = inventory();
  expect(inv[leased]).toMatchObject({ verdict: "owned", owners: [{ type: "session", id: "leased-session" }] });
  expect(inv[active]).toMatchObject({ verdict: "owned", owners: [{ type: "process", pid: shell.pid }] });
  expect(inv[inactive]).toMatchObject({ verdict: "unused", owners: [] });
  expect(readFileSync(calls, "utf8").trim().split("\n")).toHaveLength(1);
});

test("staged, unstaged, and untracked changes make a checkout dirty, and each is listed", () => {
  const path = linkedWorktree("wt-dirty");
  writeFileSync(join(path, "staged.txt"), "s\n");
  git(path, "add", "staged.txt");
  writeFileSync(join(path, "README.md"), "changed\n");
  mkdirSync(join(path, "notes"));
  writeFileSync(join(path, "notes", "draft.md"), "d\n");
  const c = inventory()[path];
  expect(c).toMatchObject({ outcome: "contents deferred", state: "dirty", automatic: false, fingerprint: "" });
  expect(c.changes).toMatchObject({ staged: ["staged.txt"], unstaged: ["README.md"], untracked: ["notes/draft.md"] });
});

test("an ignored or excluded file counts as dirty unless the main checkout holds the same bytes or link target", () => {
  // The main checkout's own ignored and excluded files, which omp's clone carries into a new worktree.
  writeFileSync(join(repo, ".env"), "TOKEN=1\n");
  mkdirSync(join(repo, "local-cache", "pkg"), { recursive: true });
  writeFileSync(join(repo, "local-cache", "pkg", "index.js"), "x\n");
  mkdirSync(join(repo, ".omp", "skills"), { recursive: true });
  symlinkSync(join(dir, "verify-app"), join(repo, ".omp", "skills", "verify-app"));
  writeFileSync(join(repo, ".git", "info", "exclude"), ".omp/skills/verify-*\n");

  const same = linkedWorktree("wt-same");
  writeFileSync(join(same, ".env"), "TOKEN=1\n");
  mkdirSync(join(same, "local-cache", "pkg"), { recursive: true });
  writeFileSync(join(same, "local-cache", "pkg", "index.js"), "x\n");
  mkdirSync(join(same, ".omp", "skills"), { recursive: true });
  symlinkSync(join(dir, "verify-app"), join(same, ".omp", "skills", "verify-app"));

  const edited = linkedWorktree("wt-edited");
  writeFileSync(join(edited, ".env"), "TOKEN=2\n");
  mkdirSync(join(edited, "local-cache", "pkg"), { recursive: true });
  writeFileSync(join(edited, "local-cache", "pkg", "index.js"), "x\n");
  writeFileSync(join(edited, "local-cache", "pkg", "patched.js"), "local fix\n");
  mkdirSync(join(edited, ".omp", "skills"), { recursive: true });
  symlinkSync(join(dir, "elsewhere"), join(edited, ".omp", "skills", "verify-app"));

  const inv = inventory();
  expect(inv[same]).toMatchObject({ state: "clean" });
  expect(inv[edited].state).toBe("dirty");
  expect(inv[edited].changes.ignored_unique.sort()).toEqual([".env", ".omp/skills/verify-app", "local-cache/pkg/patched.js"]);
});

test.each([
  { approve: false, targeted: false },
  { approve: true, targeted: false },
  { approve: true, targeted: true },
])("changed source bytes invalidate a preservation fingerprint: %j", ({ approve, targeted }) => {
  const path = linkedWorktree("wt-source-changed");
  const source = join(repo, ".env");
  const target = join(path, ".env");
  writeFileSync(source, "TOKEN=1\n");
  writeFileSync(target, "TOKEN=1\n");
  if (targeted) writeFileSync(join(path, "draft.txt"), "uncommitted work\n");
  const before = targeted ? comparedCheckout(path) : inventory()[path];
  expect(before).toMatchObject({ state: targeted ? "dirty" : "clean", automatic: !targeted });
  expect(before.changes).not.toHaveProperty("ignored_unique");

  writeFileSync(source, "TOKEN=2\n");
  const result = remove(...(approve ? ["--approve", path] : []), `${path}=${before.fingerprint}`);
  expect(result).toEqual({
    removed: [], skipped: [{ path, reason: "it changed since the inventory" }], failed: [],
  });
  expect(readFileSync(target, "utf8")).toBe("TOKEN=1\n");
  expect(readFileSync(source, "utf8")).toBe("TOKEN=2\n");
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

test.each(["nonzero", "empty"])("remove reports a registration check failure (%s) without repeating Git teardown", (kind) => {
  const path = linkedWorktree("wt-verify-failed");
  const { fingerprint } = inventory()[path];
  const log = join(dir, "git-remove-calls");
  writeExecutable(join(dir, "bin", "git"), "sh", `
if [ "$2 $3" = "worktree remove" ]; then
  echo remove >> ${JSON.stringify(log)}
elif [ "$2 $3" = "worktree list" ] && [ -f ${JSON.stringify(log)} ]; then
  ${kind === "nonzero" ? "echo 'fixture: cannot verify Git registration' >&2; exit 1" : "exit 0"}
fi
exec "$FAKE_GIT" "$@"
`);
  const error = kind === "nonzero" ? "fixture: cannot verify Git registration" : "git worktree list returned no registrations after removal";

  expect(remove(`${path}=${fingerprint}`)).toEqual({
    removed: [], skipped: [], failed: [{ path, error }],
  });
  expect(readFileSync(log, "utf8")).toBe("remove\n");
  expect(existsSync(path)).toBe(false);
  expect(git(repo, "rev-parse", "--verify", "refs/heads/wt/wt-verify-failed")).toMatch(/^[0-9a-f]{40}$/);
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
  writeListedIgnoredTree(m);
  const inv = inventory();
  const investigated = comparedCheckout(dirty);
  const unapproved = remove(`${dirty}=${investigated.fingerprint}`, `${m}=${inv[m].fingerprint}`);
  expect(unapproved.removed).toEqual([]);
  expect(unapproved.skipped.map((s) => s.reason)).toEqual([
    "it holds dirty work, and removing it needs --approve",
    "it holds commits or stashes that exist nowhere else (refs/heads/task/work); push or branch them first",
  ]);
  const approved = remove("--approve", dirty, "--approve", m, `${dirty}=${investigated.fingerprint}`, `${m}=${inv[m].fingerprint}`);
  expect(approved.removed).toEqual([{ path: dirty, method: "git worktree remove --force" }]);
  expect(approved.skipped.map((s) => s.path)).toEqual([m]);
  expect(existsSync(dirty)).toBe(false);
  expect(existsSync(m)).toBe(true);
  expect(git(repo, "rev-parse", "--verify", "refs/heads/wt/wt-dirty")).toMatch(/^[0-9a-f]{40}$/);
}, 30000);

test("remove refuses a present path that names no checkout, before it removes anything", () => {
  const path = linkedWorktree("wt-a");
  const c = inventory()[path];
  const unknown = join(base, "not-a-checkout");
  mkdirSync(unknown);
  const r = cleanWt(["remove", `${path}=${c.fingerprint}`, `${unknown}=${c.fingerprint}`]);
  expect(r.code).toBe(2);
  expect(r.stderr).toContain("is not a checkout");
  expect(existsSync(path)).toBe(true);
});

test("remove requires a new inventory for old-format fingerprints before removing anything", () => {
  const first = linkedWorktree("wt-current-format");
  const second = linkedWorktree("wt-old-format");
  const { fingerprint } = inventory()[first];
  const r = cleanWt(["remove", `${first}=${fingerprint}`, "--approve", second, `${second}=${"0".repeat(64)}`]);
  expect(r.code).toBe(2);
  expect(r.stdout).toBe("");
  expect(r.stderr).toContain("run a new inventory");
  expect(existsSync(first) && existsSync(second)).toBe(true);
});

test("remove refuses duplicate checkout paths before any teardown", () => {
  const path = linkedWorktree("wt-duplicate");
  const { fingerprint } = inventory()[path];
  const r = cleanWt(["remove", `${path}=${fingerprint}`, `${path}/=${fingerprint}`]);
  expect(r.code).toBe(2);
  expect(r.stdout).toBe("");
  expect(r.stderr).toContain("more than once");
  expect(existsSync(path)).toBe(true);
});

test.each(["linked", "ovnfs"])("remove skips a vanished %s target and continues the validated batch", (kind) => {
  const survivor = linkedWorktree("wt-a");
  const gone = kind === "linked" ? linkedWorktree("wt-z") : ovnfsCheckout("omp-gone");
  const prior = inventory();
  if (kind === "linked") git(repo, "worktree", "remove", gone);
  else {
    rmSync(gone, { recursive: true });
    writeFileSync(join(ovnfsRoot, "checkouts.json"), "[]");
  }
  const targets = [`${gone}=${prior[gone].fingerprint}`, `${survivor}=${prior[survivor].fingerprint}`];
  const unmatched = cleanWt(["remove", "--approve", join(base, "unmatched"), ...targets]);
  expect(unmatched.code).toBe(2);
  expect(unmatched.stderr).toContain("names no checkout in this removal");
  expect(existsSync(survivor)).toBe(true);
  const malformed = cleanWt(["remove", ...targets, `=${prior[gone].fingerprint}`]);
  expect(malformed.code).toBe(2);
  expect(malformed.stderr).toContain("is not <path>=<fingerprint>");
  expect(existsSync(survivor)).toBe(true);

  const result = cleanWt(["remove", "--progress", ...targets]);
  expect(result.code).toBe(0);
  expect(result.json).toEqual({
    skipped: [{ path: gone, reason: expect.stringContaining("vanished") }],
    removed: [{ path: survivor, method: "git worktree remove" }],
    failed: [],
  });
  expect(result.stderr).toContain('"stage":"skipped"');
  expect(existsSync(gone)).toBe(false);
  expect(existsSync(survivor)).toBe(false);
  expect(git(repo, "branch", "--list", "wt/wt-a")).toContain("wt/wt-a");
});

test.each(["vanished", "replaced", "inspection failed"])("the approval planner refuses a %s discovery outcome", (outcome) => {
  const path = linkedWorktree("wt-a");
  writeFileSync(join(path, "draft.txt"), "draft");
  const checkout = inventory()[path];
  const target = {
    checkout: { ...checkout, outcome }, repository: "fixture", verdict: "Uncommitted draft",
    contents: [{ category: "source", detail: "draft.txt" }], integration: { gap: "No integrated copy" },
    classification: "unique unfinished work", risk: "Loses the draft", recommendation: { action: "keep", reason: "Only copy" },
  };
  const r = Bun.spawnSync([process.execPath, join(dirname(SCRIPT), "approval.ts"), "-"], {
    cwd: repo, stdin: Buffer.from(JSON.stringify({ version: 1, targets: [target] })), stdout: "pipe", stderr: "pipe",
  });
  expect(r.exitCode).not.toBe(0);
  expect(r.stdout.toString()).toBe("");
  expect(r.stderr.toString()).toContain(outcome);
  expect(readFileSync(join(path, "draft.txt"), "utf8")).toBe("draft");
});

test("inventory exits nonzero when two memberships claim the same checkout path", () => {
  const path = linkedWorktree("wt-a");
  writeFileSync(join(ovnfsRoot, "checkouts.json"), JSON.stringify([{ path, name: "omp-same-path", source: repo }]));
  const r = cleanWt(["inventory"]);
  expect(r.code).not.toBe(0);
  expect(r.stdout).toBe("");
  expect(r.stderr).toContain("duplicate checkout path");
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
  const r = cleanWt(["remove", `${hidden}=v1:discovery:${"0".repeat(64)}`], { FAKE_OMP_HIDE: "wt-hidden" });
  expect(r.code).toBe(2);
  expect(r.stderr).toContain("is not a checkout");
  expect(existsSync(hidden)).toBe(true);
  const failing = inventory({ FAKE_OMP_FAIL: "1" }, true);
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
  const c = inventory({}, true)[path];
  expect(c.verdict).toBe("uncertain");
  expect(c.reasons.join(" ")).toContain("ghost-session-1");
});

test("an ignored link counts as preserved only when it resolves to the same target", () => {
  mkdirSync(join(repo, "local-cache", "pkg"), { recursive: true });
  writeFileSync(join(repo, "local-cache", "pkg", "cli.js"), "x\n");
  mkdirSync(join(repo, "local-cache", ".bin"));
  symlinkSync("../pkg/cli.js", join(repo, "local-cache", ".bin", "cli"));
  symlinkSync("../../repo-notes", join(repo, "local-cache", "notes"));
  const path = linkedWorktree("wt-links");
  mkdirSync(join(path, "local-cache", "pkg"), { recursive: true });
  writeFileSync(join(path, "local-cache", "pkg", "cli.js"), "x\n");
  mkdirSync(join(path, "local-cache", ".bin"));
  symlinkSync("../pkg/cli.js", join(path, "local-cache", ".bin", "cli"));
  // The same link text leaves each checkout, so it points at two different dirs.
  symlinkSync("../../repo-notes", join(path, "local-cache", "notes"));
  const c = inventory()[path];
  expect(c.changes.ignored_unique).toEqual(["local-cache/notes"]);
});

test.skipIf(process.platform === "linux")("a held lease's session file outside the session dirs is found through the process that holds it", async () => {
  const path = linkedWorktree("wt-elsewhere");
  const file = join(dir, "other-agent-dir", "sessions", "x", "2026-10-21T00-00-00-000Z_far-session-1.jsonl");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ type: "session", version: 3, id: "far-session-1", cwd: path })}\n`);
  await holdLease("far-session-1", file);
  expect(inventory()[path]).toMatchObject({ verdict: "owned", reasons: [], owners: [{ type: "session", id: "far-session-1", file }] });
});

test.skipIf(process.platform === "linux")("saved leased child headers are recovered beside an open external verifier session", async () => {
  const path = linkedWorktree("wt-saved-child");
  const unused = linkedWorktree("wt-unrelated");
  const external = join(dir, "verifier-run", "sessions");
  const parentFile = join(external, "verifier.jsonl");
  const childFile = join(external, "verifier", "saved-child.jsonl");
  mkdirSync(dirname(childFile), { recursive: true });
  writeFileSync(parentFile, `${JSON.stringify({ type: "session", version: 3, id: "external-verifier", cwd: repo })}\n`);
  writeFileSync(childFile, `${JSON.stringify({ type: "session", version: 3, id: "saved-child", cwd: path })}\n`);
  writeFileSync(join(external, "archived.jsonl"), `${JSON.stringify({ type: "session", version: 3, id: "archived-child", cwd: unused })}\n`);
  await holdLease("external-verifier", parentFile);
  await holdLease("saved-child");
  const inv = inventory();
  expect(inv[path]).toMatchObject({ verdict: "owned", state: "not checked", owners: [{ type: "session", id: "saved-child", file: childFile }] });
  expect(inv[unused]).toMatchObject({ verdict: "unused", state: "clean" });
});

test.skipIf(process.platform === "linux")("an external current-session header is recovered, while an unreadable header still protects checkouts", async () => {
  const path = linkedWorktree("wt-external-current");
  for (const holder of holders) holder.kill();
  await Promise.all(holders.map(holder => holder.exited));
  holders = [];
  rmSync(sessions, { recursive: true });
  mkdirSync(sessions);
  const file = join(dir, "external-current", "current.jsonl");
  mkdirSync(dirname(file));
  writeFileSync(file, `${JSON.stringify({ type: "session", version: 3, id: OWN, cwd: path })}\n`);
  await holdLease(OWN, file);
  expect(inventory()[path]).toMatchObject({ verdict: "owned", state: "not checked", owners: [{ type: "session", id: OWN, file }] });
  chmodSync(file, 0);
  try {
    const protectedCheckout = inventory({}, true)[path];
    expect(protectedCheckout).toMatchObject({ verdict: "uncertain", state: "not checked", fingerprint: "" });
    expect(protectedCheckout.reasons.join(" ")).toContain("--sessions");
  } finally {
    chmodSync(file, 0o600);
  }
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
  const r = remove(`${m}=v1:discovery:${"0".repeat(64)}`);
  expect(r.removed).toEqual([]);
  expect(existsSync(merged)).toBe(true);
});

test("uncertain ownership leaves contents uninspected, just like a live owner", () => {
  const path = linkedWorktree("wt-uncertain");
  writeFileSync(join(path, "private-draft.txt"), "not inspected\n");
  const c = inventory({ PI_SESSION_ID: undefined }, true)[path];
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
  const c = comparedCheckout(path);
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
  expect(prepared.json.evidence_gaps).toEqual([]);
  const file = join(dir, "source-facts.json");
  writeFileSync(file, JSON.stringify(prepared.json));
  const compared = cleanWt(["inventory", "--target", path, "--source-facts", file]);
  expect(compared.code).toBe(0);
  expect(compared.json.evidence_gaps).toEqual([]);
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
  const investigated = [first, second].map(comparedCheckout);
  const out = remove("--approve", first, ...investigated.map(({ path, fingerprint }) => `${path}=${fingerprint}`));
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
  const out = remove("--approve", path, `${path}=v1:discovery:${"0".repeat(64)}`);
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
  expect(records[path]).toMatchObject({ outcome: "contents deferred", state: "dirty", automatic: false, fingerprint: "" });
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

test.each(["discovery", "targeted"] as const)("remove follows the %s fingerprint's remote refresh policy", (kind) => {
  const path = linkedWorktree(`wt-${kind}`);
  publishDefault("main");
  const before = kind === "discovery" ? inventory()[path] : comparedCheckout(path);
  expect(before).toMatchObject({ state: "clean", automatic: true });
  const log = join(dir, "git-removal-order");
  writeExecutable(join(dir, "bin", "git"), "sh", `
if [ "$2" = ls-remote ]; then
  echo remote >> ${JSON.stringify(log)}
elif [ "$1" = status ] && [ "$PWD" = ${JSON.stringify(path)} ]; then
  echo status >> ${JSON.stringify(log)}
fi
exec "$FAKE_GIT" "$@"
`);

  if (kind === "discovery") {
    const late = join(path, "late.txt");
    writeFileSync(late, "new work\n");
    expect(remove(`${path}=${before.fingerprint}`)).toEqual({
      removed: [], skipped: [{ path, reason: "it changed since the inventory" }], failed: [],
    });
    expect(readFileSync(late, "utf8")).toBe("new work\n");
  } else {
    expect(remove(`${path}=${before.fingerprint}`)).toEqual({
      removed: [{ path, method: "git worktree remove" }], skipped: [], failed: [],
    });
    expect(existsSync(path)).toBe(false);
  }
  expect(readFileSync(log, "utf8").trim().split("\n")).toEqual(kind === "targeted" ? ["remote", "status"] : ["status"]);
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
  expect(remove(`${path}=${comparedCheckout(path).fingerprint}`).removed).toEqual([]);
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
  expect(inv[custom]).toMatchObject({ kind: "ovnfs", verdict: "uncertain", state: "not checked", fingerprint: "" });
  expect(inv[custom].reasons.length).toBeGreaterThan(0);
});

test("clean unused ovnfs checkouts are removed through the public CLI and keep their snapshots", () => {
  const path = ovnfsCheckout("omp-clean-123");
  const snapshot = { id: "s1", checkout: "omp-clean-123" };
  writeFileSync(join(ovnfsRoot, "snapshots.json"), JSON.stringify([snapshot]));
  const c = inventory()[path];
  const out = cleanWt(["remove", `${path}=${c.fingerprint}`]);
  expect(out.json).toEqual({ removed: [{ path, method: "ovnfs rm" }], skipped: [], failed: [] });
  expect(existsSync(path)).toBe(false);
  expect(JSON.parse(readFileSync(join(ovnfsRoot, "checkouts.json"), "utf8"))).toEqual([]);
  expect(JSON.parse(readFileSync(join(ovnfsRoot, "snapshots.json"), "utf8"))).toEqual([snapshot]);
  expect(git(repo, "status", "--porcelain")).toBe("");
});

test("a verified ovnfs squash draft with history saved outside its direct source is eligible and keeps its snapshot", () => {
  const name = "omp-squash-draft";
  const directSource = join(base, "wt-standalone");
  git(repo, "clone", "-q", "--shared", repo, directSource);
  git(directSource, "remote", "remove", "origin");
  const path = ovnfsCheckout(name, directSource);
  const snapshot = { id: "squash-snapshot", checkout: name };
  writeFileSync(join(ovnfsRoot, "snapshots.json"), JSON.stringify([snapshot]));
  writeFileSync(join(path, "feature.txt"), "feature\n");
  git(path, "add", "feature.txt");
  git(path, "commit", "-qm", "draft");
  const draft = git(path, "rev-parse", "HEAD");
  git(repo, "fetch", "-q", path, "HEAD:refs/tags/saved-draft");
  git(repo, "merge", "--squash", "saved-draft");
  writeFileSync(join(path, "README.md"), "landed draft\n");
  git(path, "add", "README.md");
  writeFileSync(join(repo, "README.md"), "landed draft\n");
  git(repo, "add", "README.md");
  git(repo, "commit", "-qm", "squashed review");
  publishDefault("main");
  expect(git(directSource, "for-each-ref", "--contains", draft)).toBe("");
  expect(git(repo, "rev-parse", "saved-draft")).toBe(draft);
  const plain = Bun.spawnSync(["bun", FAKE_OVNFS, "--json", "rm", "--sticky-snapshots", name], {
    env: { ...ENV, FAKE_OVNFS_ROOT: ovnfsRoot, FAKE_GIT: Bun.which("git")!, FAKE_OVNFS_PROTECT_COMMITS: "1" },
  });
  expect(plain.exitCode).toBe(1);
  expect(plain.stderr.toString()).toContain("unsaved commits");
  const c = comparedCheckout(path);
  expect(c).toMatchObject({ automatic: true, unique_history: [], integration: { status: "verified" } });
  const out = cleanWt(["remove", `${path}=${c.fingerprint}`], { FAKE_OVNFS_PROTECT_COMMITS: "1" });
  expect(out.json).toEqual({ removed: [{ path, method: "ovnfs rm" }], skipped: [], failed: [] });
  expect(existsSync(path)).toBe(false);
  expect(JSON.parse(readFileSync(join(ovnfsRoot, "snapshots.json"), "utf8"))).toEqual([snapshot]);
});

test("unsupported ovnfs rm flags fail closed without retrying or dropping a snapshot", () => {
  const name = "omp-unsupported-rm";
  const path = ovnfsCheckout(name);
  const snapshot = { id: "saved-snapshot", checkout: name };
  writeFileSync(join(ovnfsRoot, "snapshots.json"), JSON.stringify([snapshot]));
  const c = inventory()[path];
  const out = cleanWt(["remove", `${path}=${c.fingerprint}`], { FAKE_OVNFS_UNSUPPORTED_RM_FLAGS: "1" });
  expect(out.code).toBe(0);
  expect(out.json).toEqual({ removed: [], skipped: [], failed: [{ path, error: "fixture: unknown flag --force" }] });
  expect(existsSync(path)).toBe(true);
  expect(JSON.parse(readFileSync(join(ovnfsRoot, "checkouts.json"), "utf8"))).toMatchObject([{ name, path }]);
  expect(JSON.parse(readFileSync(join(ovnfsRoot, "snapshots.json"), "utf8"))).toEqual([snapshot]);
  const calls = readFileSync(join(ovnfsRoot, "calls.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
  expect(calls.filter(call => call.args.includes("rm")).map(call => call.args))
    .toEqual([["--json", "rm", "--force", "--sticky-snapshots", name]]);
});

test("ovnfs removal waits for mounted directory visibility without repeating deletion", async () => {
  const name = "omp-delayed-visibility";
  const path = ovnfsCheckout(name);
  const snapshot = { id: "delayed-snapshot", checkout: name };
  writeFileSync(join(ovnfsRoot, "snapshots.json"), JSON.stringify([snapshot]));
  const c = inventory()[path];
  const observer = Bun.spawn(["python3", "-c", "import json,sys,time,shutil\nprint('ready',flush=True)\nwhile any(e['name']==sys.argv[2] for e in json.load(open(sys.argv[1]))): time.sleep(0.002)\ntime.sleep(0.2)\nshutil.rmtree(sys.argv[3])", join(ovnfsRoot, "checkouts.json"), name, path], { stdout: "pipe", stderr: "inherit" });
  holders.push(observer);
  const reader = observer.stdout.getReader();
  const { value } = await reader.read();
  reader.releaseLock();
  expect(new TextDecoder().decode(value)).toContain("ready");
  const out = cleanWt(["remove", `${path}=${c.fingerprint}`], { FAKE_OVNFS_RETAIN_DIRECTORY: "1" });
  expect(out.json).toEqual({ removed: [{ path, method: "ovnfs rm" }], skipped: [], failed: [] });
  expect(existsSync(path)).toBe(false);
  expect(await observer.exited).toBe(0);
  expect(JSON.parse(readFileSync(join(ovnfsRoot, "snapshots.json"), "utf8"))).toEqual([snapshot]);
  const calls = readFileSync(join(ovnfsRoot, "calls.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
  expect(calls.filter(call => call.args.includes("rm")).map(call => call.args))
    .toEqual([["--json", "rm", "--force", "--sticky-snapshots", name]]);
}, 30000);

test("approved ovnfs removal waits through stale mount errors for ENOENT", () => {
  const name = "omp-stale-mount";
  const path = ovnfsCheckout(name);
  writeFileSync(join(path, "draft.txt"), "approved dirty work\n");
  const c = comparedCheckout(path);
  expect(c).toMatchObject({ automatic: false, state: "dirty" });
  const preload = join(dir, "stale-mount.ts");
  const probes = join(dir, "mount-probes.txt");
  writeFileSync(preload, `
import { mock } from "bun:test";
import * as fs from "node:fs";
const actual = fs.lstatSync;
let stale = 2;
mock.module("node:fs", () => ({
  ...fs, lstatSync(file, ...args) {
    try {
      return actual(file, ...args);
    } catch (error) {
      if (file === ${JSON.stringify(path)} && error.code === "ENOENT") {
        const code = stale-- > 0 ? "ESTALE" : "ENOENT";
        fs.appendFileSync(${JSON.stringify(probes)}, code + "\\n");
        if (code === "ESTALE") throw Object.assign(new Error("stale file handle"), { code });
      }
      throw error;
    }
  },
}));
`);
  const out = cleanWt(["remove", "--approve", path, `${path}=${c.fingerprint}`], {}, repo, ["--preload", preload]);
  expect(out.code).toBe(0);
  expect(out.json).toEqual({ removed: [{ path, method: "ovnfs rm" }], skipped: [], failed: [] });
  expect(readFileSync(probes, "utf8").split("\n").slice(0, 3)).toEqual(["ESTALE", "ESTALE", "ENOENT"]);
  const calls = readFileSync(join(ovnfsRoot, "calls.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
  expect(calls.filter(call => call.args.includes("rm")).map(call => call.args))
    .toEqual([["--json", "rm", "--force", "--sticky-snapshots", name]]);
});

test("ovnfs inventory and removal use the configured executable despite a different PATH binary", () => {
  const path = ovnfsCheckout("omp-configured-123");
  const configured = join(dir, "configured-ovnfs");
  writeExecutable(configured, "bun", `await import(${JSON.stringify(FAKE_OVNFS)});`);
  writeExecutable(join(dir, "bin/ovnfs"), "bun", `console.log('{"checkouts":[]}');`);
  const env = { FAKE_OVNFS_PATH: configured };
  const c = inventory(env)[path];
  expect(c).toMatchObject({ kind: "ovnfs", verdict: "unused", automatic: true });
  const out = cleanWt(["remove", `${path}=${c.fingerprint}`], env);
  expect(out.code).toBe(0);
  expect(out.json).toEqual({ removed: [{ path, method: "ovnfs rm" }], skipped: [], failed: [] });
  expect(existsSync(path)).toBe(false);
  const calls = readFileSync(join(ovnfsRoot, "calls.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
  expect(calls.find(call => call.args.includes("rm"))).toMatchObject({ cli: "configured-ovnfs" });
});

test("ovnfs origin follows archived sessions across repositories and retains missing sources", () => {
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
  for (const path of [nested, fromRemoved, foreign]) expect(inv[path]).toMatchObject({ kind: "ovnfs", verdict: "unused", state: "clean" });
  expect(inv[ancestor].reasons.join(" ")).toContain("omp-nested");
  expect(inv[fromWorktree]).toMatchObject({ kind: "ovnfs", verdict: "uncertain", state: "not checked", fingerprint: "" });
  expect(inv[fromWorktree].reasons.join(" ")).toContain(linked);
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
  expect(inv[dirty]).toMatchObject({ outcome: "contents deferred", verdict: "unused", state: "dirty", automatic: false, fingerprint: "", changes: {
    staged: ["staged.txt"], unstaged: ["README.md"], untracked: ["draft.txt"],
  } });
  expect(inv[history].unique_history).toEqual([{ ref: "refs/heads/main", sha: commit }, { ref: "stash@{0}", sha: stash }]);
  const investigated = comparedCheckout(dirty);
  expect(investigated.changes.ignored_unique).toEqual([".env", "private.txt"]);
  const blocked = remove(`${dirty}=${investigated.fingerprint}`, "--approve", history, `${history}=${inv[history].fingerprint}`);
  expect(blocked.removed).toEqual([]);
  expect(blocked.skipped.map((entry) => entry.path)).toEqual([dirty, history]);
  expect(existsSync(owned) && existsSync(dirty) && existsSync(history)).toBe(true);
  const approved = remove("--approve", dirty, `${dirty}=${investigated.fingerprint}`);
  expect(approved.removed).toEqual([{ path: dirty, method: "ovnfs rm" }]);
  expect(existsSync(gitDir)).toBe(false);
});

function ovnfsRemote(name: string) {
  git(repo, "config", `remote.ovnfs/${name}.url`, join(ovnfsRoot, `${name}.git-private`));
  git(repo, "config", `remote.ovnfs/${name}.fetch`, `+HEAD:refs/remotes/ovnfs/${name}/HEAD`);
}

test("a fetched ovnfs checkout remote never counts as a copy of a checkout's commits", () => {
  const fetched = ovnfsCheckout("omp-fetched");
  writeFileSync(join(fetched, "only.txt"), "commit\n");
  git(fetched, "add", "only.txt");
  git(fetched, "commit", "-qm", "unique");
  const commit = git(fetched, "rev-parse", "HEAD");
  const sibling = ovnfsCheckout("omp-sibling");
  git(sibling, "fetch", "-q", join(ovnfsRoot, "omp-fetched.git-private"), "HEAD");
  git(sibling, "reset", "-q", "--hard", "FETCH_HEAD");
  const kept = ovnfsCheckout("omp-kept");
  writeFileSync(join(kept, "kept.txt"), "kept\n");
  git(kept, "add", "kept.txt");
  git(kept, "commit", "-qm", "kept");
  for (const name of ["omp-fetched", "omp-sibling", "omp-kept"]) ovnfsRemote(name);
  git(repo, "fetch", "-q", "--all");
  git(repo, "branch", "kept", "refs/remotes/ovnfs/omp-kept/HEAD");
  const inv = inventory();
  expect(inv[fetched].unique_history).toEqual([{ ref: "refs/heads/main", sha: commit }]);
  expect(inv[sibling].unique_history).toEqual([{ ref: "refs/heads/main", sha: commit }]);
  expect(inv[kept].unique_history).toEqual([]);
  const out = remove("--approve", fetched, "--approve", sibling, `${fetched}=${inv[fetched].fingerprint}`, `${sibling}=${inv[sibling].fingerprint}`);
  expect(out.removed).toEqual([]);
  expect(existsSync(fetched) && existsSync(sibling)).toBe(true);
});

test("a detached linked worktree reachable only through an ovnfs tracking ref keeps its unique history", () => {
  const path = linkedWorktree("wt-ovnfs-only");
  git(path, "checkout", "-q", "--detach");
  writeFileSync(join(path, "spike.txt"), "spike\n");
  git(path, "add", "spike.txt");
  git(path, "commit", "-qm", "spike");
  const spike = git(path, "rev-parse", "HEAD");
  git(repo, "update-ref", "refs/remotes/ovnfs/omp-spike/HEAD", spike);
  expect(inventory()[path].unique_history).toEqual([{ ref: "HEAD", sha: spike }]);
});

test("an ovnfs checkout remote is never the source's remote default", () => {
  const { path } = integratedDraft();
  ovnfsCheckout("omp-beside");
  ovnfsRemote("omp-beside");
  const verified = { integration: { status: "verified", ref: "refs/heads/release" }, automatic: true };
  expect(comparedCheckout(path)).toMatchObject(verified);
  git(repo, "remote", "rename", "origin", "upstream");
  expect(comparedCheckout(path)).toMatchObject(verified);
  git(repo, "remote", "remove", "upstream");
  expect(comparedCheckout(path)).toMatchObject({ integration: { status: "unresolved", reason: "the source has no unambiguous remote" }, automatic: false });
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
  writeListedIgnoredTree(path);
  git(path, "checkout", "-qb", "side");
  writeFileSync(join(path, "README.md"), "side\n");
  git(path, "commit", "-qam", "side");
  git(path, "checkout", "-q", "main");
  writeFileSync(join(path, "README.md"), "main\n");
  git(path, "commit", "-qam", "main");
  Bun.spawnSync(["git", "merge", "side"], { cwd: path, env: ENV, stdout: "pipe", stderr: "pipe" });
  const c = inventory()[path];
  expect(c).toMatchObject({ outcome: "contents deferred", automatic: false, fingerprint: "", changes: { unmerged: ["README.md"] } });
  expect(remove("--approve", path, `${path}=${comparedCheckout(path).fingerprint}`).removed).toEqual([]);
  expect(existsSync(path)).toBe(true);
});

test.each(["linked", "task", "ovnfs"])("a %s source stays protected by every ovnfs dependent, including one added after inventory", (kind) => {
  const entry = kind === "task"
    ? taskSandbox("t-source", { pid: Bun.spawnSync(["true"]).pid, id: "source-task" })
    : kind === "ovnfs" ? ovnfsCheckout("omp-source") : linkedWorktree("wt-source");
  const path = kind === "task" ? join(entry, "m") : entry;
  writeListedIgnoredTree(path);
  const before = inventory()[path];
  expect(before.automatic).toBe(true);
  const source = kind === "task" ? join(path, "nested") : path;
  if (kind === "task") mkdirSync(source);
  const name = kind === "linked" ? "personal-dependent" : kind === "task" ? "verifier-dependent" : "omp-dependent";
  const dependent = ovnfsCheckout(name, source);
  const protectedRecord = inventory()[path];
  expect(protectedRecord.automatic).not.toBe(true);
  expect(protectedRecord.reasons.join(" ")).toContain(name);
  const out = remove("--approve", path, `${path}=${before.fingerprint}`);
  expect(out.removed).toEqual([]);
  expect(out.skipped).toHaveLength(1);
  expect(out.skipped[0].reason).toContain(name);
  expect(existsSync(path) && existsSync(dependent)).toBe(true);
  if (kind === "linked") {
    expect(git(repo, "worktree", "list", "--porcelain")).toContain(path);
    expect(git(repo, "branch", "--list", "wt/wt-source")).toContain("wt/wt-source");
  }
});

test("cyclic or missing origin evidence keeps native and ovnfs checkouts uncertain", () => {
  const first = linkedWorktree("wt-origin-first");
  writeListedIgnoredTree(first);
  const second = linkedWorktree("wt-origin-second");
  const before = inventory()[first];
  const mounted = ovnfsCheckout("omp-cycle-first");
  const nested = ovnfsCheckout("omp-cycle-second", mounted);
  const file = join(ovnfsRoot, "checkouts.json");
  const entries = JSON.parse(readFileSync(file, "utf8"));
  entries.find((entry: { path: string }) => entry.path === mounted).source = nested;
  writeFileSync(file, JSON.stringify(entries));
  const unknown = join(base, "pr-unknown");
  git(dir, "clone", "-q", repo, unknown);
  const env = { FAKE_OMP_LISTING: JSON.stringify([
    { path: first, parentRepo: second },
    { path: second, parentRepo: first },
    { path: unknown },
  ]) };
  const result = cleanWt(["inventory"], env, dir);
  expect(result.code).toBe(0);
  for (const path of [first, second, mounted, nested, unknown]) {
    const record = result.json.checkouts.find((record: Checkout) => record.path === path);
    expect(record).toMatchObject({ verdict: "uncertain", state: "not checked", fingerprint: "" });
    expect(record.automatic).not.toBe(true);
    expect(record.reasons.join(" ")).toContain("source");
  }
  const out = cleanWt(["remove", "--approve", first, `${first}=${before.fingerprint}`], env, dir);
  expect(out.code).toBe(0);
  expect(out.json.removed).toEqual([]);
  expect(out.json.skipped[0].reason).toContain("source");
  expect(existsSync(first) && existsSync(second) && existsSync(unknown)).toBe(true);
});

test.each([
  ["ovnfs", "session"],
  ["ovnfs", "alternates"],
  ["task", "session"],
  ["task", "alternates"],
])("a task from an %s source resolves its %s evidence to the established repository", (kind, evidence) => {
  const dead = Bun.spawnSync(["true"]).pid;
  const parent = kind === "ovnfs" ? ovnfsCheckout("omp-task-parent")
    : join(taskSandbox("t-parent", { pid: dead, id: "parent-task" }), "m");
  writeFileSync(join(parent, ".env"), "CHAIN=preserved-by-immediate-source\n");
  const entry = join(base, "t-chain-child");
  const path = join(entry, "m");
  mkdirSync(entry);
  writeFileSync(join(entry, ".omp-isolation-owner.json"), JSON.stringify({ pid: dead, id: "chain-child" }));
  git(dir, "clone", "-q", ...(evidence === "alternates" ? ["--shared"] : []), parent, path);
  writeFileSync(join(path, ".env"), "CHAIN=preserved-by-immediate-source\n");
  if (evidence === "session") {
    const file = session("chain-parent", parent);
    session("chain-child", path, `${file.slice(sessions.length + 1, -6)}/child.jsonl`);
  }
  const record = inventory()[path];
  expect(record).toMatchObject({ verdict: "unused", state: "clean", source_git_dir: join(repo, ".git"), unique_history: [], automatic: true });
  if (kind === "ovnfs") {
    const file = join(ovnfsRoot, "checkouts.json");
    const entries = JSON.parse(readFileSync(file, "utf8"));
    entries[0].source = join(dir, "missing-upstream-source");
    writeFileSync(file, JSON.stringify(entries));
  } else {
    writeFileSync(join(parent, ".git", "objects", "info", "alternates"), join(dir, "missing-upstream-source", "objects") + "\n");
  }
  const unresolved = inventory()[path];
  expect(unresolved).toMatchObject({ verdict: "uncertain", state: "not checked", fingerprint: "" });
  expect(unresolved.reasons.join(" ")).toContain("source");
  expect(existsSync(path)).toBe(true);
});

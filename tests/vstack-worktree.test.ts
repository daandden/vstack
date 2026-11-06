import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve(import.meta.dir, "../plugin/skills/vstack-worktree/scripts/worktree.ts");
const fake = resolve(import.meta.dir, "support/fake-ovnfs.ts");
const temps: string[] = [];
afterEach(() => { for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function fixture(ovnfs = true, blockedRecord = false, repoName = "repo") {
  const dir = mkdtempSync(join(tmpdir(), "vstack-worktree-")); temps.push(dir);
  const repo = join(dir, repoName), bin = join(dir, "bin"), record = join(dir, blockedRecord ? "blocked/record.json" : "record.json");
  if (blockedRecord) writeFileSync(join(dir, "blocked"), "not a directory");
  mkdirSync(repo); mkdirSync(bin);
  const gitBin = Bun.which("git")!;
  const env = { ...process.env, PATH: bin, FAKE_OVNFS_ROOT: dir, FAKE_GIT: gitBin, OMP_WORKTREE_DIR: join(dir, "fallback"), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
  symlinkSync(gitBin, join(bin, "git"));
  for (const name of ovnfs ? ["ovnfs", "omp"] : ["omp"]) writeFileSync(join(bin, name), `#!${process.execPath}\nimport ${JSON.stringify(fake)};\n`, { mode: 0o755 });
  const git = (...args: string[]) => {
    const p = Bun.spawnSync([gitBin, ...args], { cwd: repo, env });
    if (p.exitCode) throw new Error(p.stderr.toString());
    return p.stdout.toString().trim();
  };
  git("init", "-b", "main"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.test");
  writeFileSync(join(repo, ".gitignore"), "node_modules/\n"); writeFileSync(join(repo, "tracked"), "base\n");
  git("add", "."); git("commit", "-qm", "base"); const base = git("rev-parse", "HEAD");
  writeFileSync(join(repo, "tracked"), "head\n"); git("commit", "-qam", "head");
  mkdirSync(join(repo, "node_modules")); writeFileSync(join(repo, "node_modules/input"), "ignored input");
  function run(command: string, args: string[] = [], extra: Record<string, string> = {}, recordPath = record) {
    const p = Bun.spawnSync([process.execPath, script, command, "--record", recordPath, ...args], { cwd: repo, env: { ...env, ...extra } });
    return { code: p.exitCode, stdout: p.stdout.toString(), stderr: p.stderr.toString(), record: p.stdout.length ? JSON.parse(p.stdout.toString()) : null };
  }
  const open = (args = ["--commit", base], extra: Record<string, string> = {}) => run("open", ["--repo", repo, "--purpose", "test", ...args], extra);
  const calls = () => readFileSync(join(dir, "calls.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
  return { dir, repo, record, bin, base, git, run, open, calls };
}

test("opens a detached revision with ignored inputs and removes it through ovnfs", () => {
  const f = fixture(); const before = f.git("rev-parse", "HEAD");
  const r = f.open(); expect(r.code).toBe(0);
  expect(r.record).toMatchObject({ backend: "ovnfs", fallback: false, fallbackReason: null, cloned: null, branchCreated: false });
  expect(readFileSync(join(r.record.path, "tracked"), "utf8")).toBe("base\n");
  expect(readFileSync(join(r.record.path, "node_modules/input"), "utf8")).toBe("ignored input");
  expect(JSON.parse(readFileSync(f.record, "utf8"))).toEqual(r.record);
  expect(Bun.spawnSync([Bun.which("git")!, "rev-parse", "HEAD"], { cwd: r.record.path }).stdout.toString().trim()).toBe(f.base);
  expect(f.git("rev-parse", "HEAD")).toBe(before);
  const removed = f.run("remove"); expect(removed.code).toBe(0); expect(removed.record.path).toBe(r.record.path);
  expect(existsSync(r.record.path)).toBe(false); expect(f.calls().at(-1).args).toContain("rm");
});

test("creates a branch without moving the source and deletes only that branch on removal", () => {
  const f = fixture(); const before = f.git("rev-parse", "HEAD");
  writeFileSync(join(f.repo, "tracked"), "uncommitted source edit\n");
  const r = f.open(["--new-branch", "research/test", "--ref", f.base]);
  expect(r.code).toBe(0);
  expect(r.record).toMatchObject({ branch: "research/test", branchCreated: true, backend: "ovnfs" });
  expect(f.git("rev-parse", "research/test")).toBe(f.base);
  expect(f.git("rev-parse", "HEAD")).toBe(before);
  expect(Bun.spawnSync(["git", "symbolic-ref", "--short", "HEAD"], { cwd: r.record.path }).stdout.toString().trim()).toBe("research/test");
  expect(readFileSync(join(r.record.path, "tracked"), "utf8")).toBe("base\n");
  expect(f.run("remove").code).toBe(0);
  expect(f.git("branch", "--list", "research/test")).toBe("");
  expect(f.git("branch", "--list", "main")).not.toBe("");
});

test("checks out an existing branch without deleting it", () => {
  const f = fixture(); f.git("branch", "existing", f.base);
  const r = f.open(["--branch", "existing"]); expect(r.code).toBe(0);
  expect(r.record.branchCreated).toBe(false);
  expect(readFileSync(join(r.record.path, "tracked"), "utf8")).toBe("base\n");
  expect(f.run("remove").code).toBe(0);
  expect(f.git("rev-parse", "existing")).toBe(f.base);
});

test("falls back on a failed ovnfs new, reports clone status, and removes with git", () => {
  for (const cloned of [false, true]) {
    const f = fixture();
    const extra = { FAKE_OVNFS_FAIL: "1", ...(cloned ? { FAKE_OMP_CLONED: "1" } : {}) };
    const r = f.open(["--new-branch", "fallback-test", "--ref", f.base], extra);
    expect(r.code).toBe(0);
    expect(r.record).toMatchObject({ backend: "omp-wt", fallback: true, fallbackReason: "fixture daemon unavailable", cloned, branchCreated: true });
    expect(readFileSync(join(r.record.path, "tracked"), "utf8")).toBe("base\n");
    expect(f.run("remove").code).toBe(0);
    expect(existsSync(r.record.path)).toBe(false);
    expect(f.git("branch", "--list", "fallback-test")).toBe("");
    expect(f.calls().some(c => c.args.includes("rm"))).toBe(false);
    expect(f.git("worktree", "list", "--porcelain")).not.toContain(r.record.path);
  }
});

test("stops without ovnfs before creating a checkout or branch", () => {
  const f = fixture(false);
  const r = f.open(["--new-branch", "must-not-exist"]);
  expect(r.code).toBe(2); expect(r.record.error).toContain("/skill:setup-vstack");
  expect(existsSync(f.record)).toBe(false); expect(f.git("branch", "--list", "must-not-exist")).toBe("");
  expect(f.calls().some(c => c.args.includes("add"))).toBe(false);
});

test("uses omp's configured ovnfs binary when it is not on PATH", () => {
  const f = fixture(false); const binary = join(f.dir, "configured-ovnfs");
  writeFileSync(binary, `#!${process.execPath}\nimport ${JSON.stringify(fake)};\n`, { mode: 0o755 });
  const r = f.open(["--commit", f.base], { FAKE_OVNFS_PATH: binary });
  expect(r.code).toBe(0); expect(r.record.backend).toBe("ovnfs");
  expect(f.run("remove", [], { FAKE_OVNFS_PATH: binary }).code).toBe(0);
});

test("prefers the configured ovnfs executable over a different one on PATH", () => {
  const f = fixture(); const binary = join(f.dir, "configured-ovnfs");
  writeFileSync(binary, `#!${process.execPath}\nimport ${JSON.stringify(fake)};\n`, { mode: 0o755 });
  writeFileSync(join(f.bin, "ovnfs"), `#!${process.execPath}\nconsole.error("wrong ovnfs");process.exit(1);\n`, { mode: 0o755 });
  const r = f.open(["--commit", f.base], { FAKE_OVNFS_PATH: binary });
  expect(r.code).toBe(0); expect(r.record.backend).toBe("ovnfs");
  expect(f.calls().find(c => c.args.includes("new")).cli).toBe("configured-ovnfs");
  expect(f.run("remove", [], { FAKE_OVNFS_PATH: binary }).code).toBe(0);
  expect(existsSync(r.record.path)).toBe(false);
});

test("an invalid configured ovnfs does not use the PATH executable", () => {
  const f = fixture();
  const r = f.open(["--commit", f.base], { FAKE_OVNFS_PATH: join(f.dir, "missing") });
  expect(r.code).toBe(2);
  expect(f.calls().some(c => c.args.includes("new") || c.args.includes("add"))).toBe(false);
});

test("preserves existing records and branches on collisions", () => {
  const f = fixture(); f.git("branch", "existing");
  expect(f.open(["--new-branch", "existing"]).code).toBe(2);
  expect(f.git("branch", "--list", "existing")).not.toBe("");
  writeFileSync(f.record, "owned by another run");
  expect(f.open().code).toBe(2);
  expect(readFileSync(f.record, "utf8")).toBe("owned by another run");
});

test.each([false, true])("record persistence failure rolls back the checkout and new branch, fallback=%s", (fallback) => {
  const f = fixture(true, true);
  const r = f.open(["--new-branch", "must-roll-back"], fallback ? { FAKE_OVNFS_FAIL: "1" } : {});
  expect(r.code).toBe(2);
  expect(r.record.cleanup.checkout.removed).toBe(true);
  expect(r.record.cleanup.branch).toMatchObject({ name: "must-roll-back", removed: true });
  expect(existsSync(r.record.cleanup.checkout.path)).toBe(false);
  expect(f.git("branch", "--list", "must-roll-back")).toBe("");
  expect(f.git("worktree", "list", "--porcelain")).not.toContain(r.record.cleanup.checkout.path);
  if (!fallback) expect(JSON.parse(readFileSync(join(f.dir, "checkouts.json"), "utf8"))).toEqual([]);
});

test("opens an older detached revision from an ovnfs parent with a private git dir and ignored inputs", () => {
  const f = fixture(); const parent = f.open(["--commit", "HEAD"]);
  expect(parent.code).toBe(0);
  writeFileSync(join(parent.record.path, "tracked"), "dirty parent\n");
  const record = join(f.dir, "nested.json");
  const nested = f.run("open", ["--repo", parent.record.path, "--purpose", "nested", "--commit", f.base], {}, record);
  expect(nested.code).toBe(0);
  expect(nested.record).toMatchObject({ backend: "ovnfs", fallback: false });
  expect(readFileSync(join(nested.record.path, "tracked"), "utf8")).toBe("base\n");
  expect(readFileSync(join(nested.record.path, "node_modules/input"), "utf8")).toBe("ignored input");
  const git = (path: string, ...args: string[]) => Bun.spawnSync([Bun.which("git")!, ...args], { cwd: path });
  expect(git(nested.record.path, "rev-parse", "HEAD").stdout.toString().trim()).toBe(f.base);
  expect(git(nested.record.path, "symbolic-ref", "-q", "HEAD").exitCode).toBe(1);
  expect(git(nested.record.path, "rev-parse", "--path-format=absolute", "--git-common-dir").stdout.toString())
    .not.toBe(git(parent.record.path, "rev-parse", "--path-format=absolute", "--git-common-dir").stdout.toString());
  expect(readFileSync(join(parent.record.path, "tracked"), "utf8")).toBe("dirty parent\n");
  expect(f.run("remove", [], {}, record).code).toBe(0);
  expect(f.run("remove").code).toBe(0);
});

test("opens an uppercase long repository with a bounded backend-valid unique name", () => {
  const f = fixture(true, false, "My Repo+".repeat(16));
  const opened = [];
  for (const index of [1, 2]) {
    const record = join(f.dir, `long-${index}.json`);
    const result = f.run("open", ["--repo", f.repo, "--purpose", "LongPurpose".repeat(8), "--commit", f.base], {}, record);
    expect(result.code).toBe(0);
    expect(result.record.backend).toBe("ovnfs");
    expect(result.record.name).toMatch(/^[a-z0-9][a-z0-9._-]{0,63}$/);
    expect(result.record.name).toMatch(/-[0-9a-f]{8}$/);
    expect(readFileSync(join(result.record.path, "tracked"), "utf8")).toBe("base\n");
    opened.push(result.record.name);
    expect(f.run("remove", [], {}, record).code).toBe(0);
  }
  expect(opened[0]).not.toBe(opened[1]);
});

test("failed creation from an ovnfs source cannot fall back to a shared Git directory", () => {
  const f = fixture(); const parent = f.open();
  expect(parent.code).toBe(0);
  const record = join(f.dir, "failed-nested.json");
  const result = f.run("open", ["--repo", parent.record.path, "--purpose", "nested", "--new-branch", "must-not-exist"], { FAKE_OVNFS_FAIL: "1" }, record);
  expect(result.code).toBe(2);
  expect(result.record.error).toContain("refusing a fallback");
  expect(existsSync(record)).toBe(false);
  expect(f.calls().some(call => call.args.includes("add"))).toBe(false);
  expect(Bun.spawnSync([Bun.which("git")!, "branch", "--list", "must-not-exist"], { cwd: parent.record.path }).stdout.toString().trim()).toBe("");
  expect(f.run("remove").code).toBe(0);
});

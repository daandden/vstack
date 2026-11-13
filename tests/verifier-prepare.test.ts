import { afterEach, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { writeExecutable } from "./support/executable.ts";

const script = resolve(import.meta.dir, "../plugin/skills/ship/scripts/prepare-verifier.ts");
const temps: string[] = [];
afterEach(() => { for (const path of temps.splice(0)) rmSync(path, { recursive: true, force: true }); });
function git(cwd: string, ...args: string[]) {
  const p = Bun.spawnSync(["git", ...args], { cwd, env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_OPTIONAL_LOCKS: "0" } });
  if (p.exitCode) throw new Error(p.stderr.toString());
  return p.stdout.toString().trim();
}
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "verifier-prepare-")); temps.push(dir);
  const shared = join(dir, "shared"); mkdirSync(shared);
  git(shared, "init", "-b", "main"); git(shared, "config", "user.name", "Fixture"); git(shared, "config", "user.email", "fixture@example.test");
  writeFileSync(join(shared, ".gitignore"), "node_modules/\n.env\ncache/deps/\n");
  writeFileSync(join(shared, "app.ts"), "base\n"); git(shared, "add", "."); git(shared, "commit", "-qm", "base");
  const base = git(shared, "rev-parse", "HEAD");
  writeFileSync(join(shared, "app.ts"), "head\n"); git(shared, "commit", "-qam", "head");
  const head = git(shared, "rev-parse", "HEAD");
  const clone = join(dir, "clone"); git(shared, "clone", "--no-hardlinks", shared, clone);
  let worktree = join(dir, "verify-head");
  const recordPath = join(dir, "checkout-record.json");
  const inputsPath = join(dir, "inputs.json"); writeFileSync(inputsPath, "[]");
  const declare = (inputs: string[]) => writeFileSync(inputsPath, JSON.stringify(inputs));
  const args = ["--repo", clone, "--shared", shared, "--head", head, "--base", base, "--record", recordPath, "--inputs", inputsPath];
  function run(command: string, options = args) {
    const p = Bun.spawnSync(["bun", script, command, ...options], { cwd: clone, env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } });
    return { code: p.exitCode, record: JSON.parse(p.stdout.toString()) };
  }
  function create(revision = head, cloned = true, inputs: string[] = []) {
    declare(inputs);
    const bin = join(dir, "bin"); mkdirSync(bin);
    const fake = resolve(import.meta.dir, "support/fake-ovnfs.ts");
    for (const name of ["ovnfs", "omp"]) writeExecutable(join(bin, name), "bun", `await import(${JSON.stringify(fake)});`);
    symlinkSync(Bun.which("git")!, join(bin, "git"));
    const p = Bun.spawnSync([process.execPath, resolve(import.meta.dir, "../plugin/skills/vstack-worktree/scripts/worktree.ts"), "open",
      "--repo", clone, "--purpose", "verify", "--commit", revision, "--record", recordPath, ...(cloned ? ["--inputs", inputsPath] : [])], {
      env: { ...process.env, PATH: bin, FAKE_OVNFS_ROOT: dir, FAKE_GIT: Bun.which("git")!, OMP_WORKTREE_DIR: dir,
        FAKE_OVNFS_FAIL: "1", FAKE_OMP_CLONED: cloned ? "1" : "", GIT_CONFIG_GLOBAL: "/dev/null" },
    });
    if (p.exitCode) throw new Error(JSON.parse(p.stdout.toString()).error ?? p.stderr.toString());
    worktree = JSON.parse(p.stdout.toString()).path;
  }
  const snapshot = (repo: string) => [git(repo, "rev-parse", "HEAD"), git(repo, "status", "--porcelain=v1", "--untracked-files=all"), readFileSync(join(repo, ".git/index"))];
  return { dir, shared, clone, get worktree() { return worktree; }, recordPath, inputsPath, declare, base, head, args, run, create, snapshot };
}

test("validates an ovnfs head checkout opened and removed through the worktree CLI", () => {
  const f = fixture();
  const bin = join(f.dir, "bin"); mkdirSync(bin);
  const fake = resolve(import.meta.dir, "support/fake-ovnfs.ts");
  for (const name of ["ovnfs", "omp"]) writeExecutable(join(bin, name), "bun", `await import(${JSON.stringify(fake)});`);
  symlinkSync(Bun.which("git")!, join(bin, "git"));
  mkdirSync(join(f.clone, "node_modules"));
  writeFileSync(join(f.clone, "node_modules/input"), "ignored dependency");
  const env = { ...process.env, PATH: bin, FAKE_OVNFS_ROOT: f.dir, FAKE_GIT: Bun.which("git")!, GIT_CONFIG_GLOBAL: "/dev/null" };
  const record = join(f.dir, "checkout.json");
  const checkoutScript = resolve(import.meta.dir, "../plugin/skills/vstack-worktree/scripts/worktree.ts");
  const before = [f.snapshot(f.shared), f.snapshot(f.clone)];
  f.declare(["node_modules/input"]);
  const open = Bun.spawnSync([process.execPath, checkoutScript, "open", "--repo", f.clone, "--purpose", "verify", "--commit", f.head, "--record", record, "--inputs", f.inputsPath], { env });
  expect(open.exitCode).toBe(0);
  const checkout = JSON.parse(open.stdout.toString());
  expect(checkout.backend).toBe("ovnfs");
  const args = ["--repo", f.clone, "--shared", f.shared, "--head", f.head, "--base", f.base, "--record", record, "--inputs", f.inputsPath];
  const result = f.run("clean-head", args);
  expect(result.code).toBe(0);
  expect(result.record.worktree).toBe(realpathSync(checkout.path));
  expect(readFileSync(join(checkout.path, "app.ts"), "utf8")).toBe("head\n");
  expect(git(f.clone, "worktree", "list", "--porcelain")).not.toContain(checkout.path);
  expect([f.snapshot(f.shared), f.snapshot(f.clone)]).toEqual(before);
  const removal = Bun.spawnSync([process.execPath, checkoutScript, "remove", "--record", record], { env });
  expect(removal.exitCode).toBe(0);
  expect(existsSync(checkout.path)).toBe(false);
});

test("preflight refuses missing or same Shared checkout without mutation", () => {
  const f = fixture(); const before = f.snapshot(f.clone);
  for (const args of [f.args.filter((_, i) => i !== 2 && i !== 3), f.args.map(x => x === f.shared ? f.clone : x)]) {
    const r = f.run("preflight", args);
    expect(r.code).toBe(2); expect(r.record.verdict).toBe("REFUSED");
    expect(r.record.notes.join(" ")).toContain("Shared checkout");
    expect(r.record.patch_id).toBeNull(); expect(f.snapshot(f.clone)).toEqual(before);
    expect(existsSync(f.worktree)).toBe(false);
  }
});

test("preflight canonicalizes aliases and refuses record collisions and invalid commits", () => {
  const f = fixture(); const before = f.snapshot(f.clone);
  const alias = join(f.dir, "alias"); symlinkSync(f.clone, alias);
  const aliased = f.run("preflight", f.args.map(x => x === f.shared ? alias : x));
  expect(aliased.code).toBe(2); expect(aliased.record.notes.join(" ")).toContain("Shared checkout");
  writeFileSync(f.recordPath, "mine");
  expect(f.run("preflight").code).toBe(2);
  expect(readFileSync(f.recordPath, "utf8")).toBe("mine");
  rmSync(f.recordPath);
  const invalid = f.run("preflight", f.args.map(x => x === f.head ? "bad-head" : x));
  expect(invalid.code).toBe(2); expect(invalid.record.verdict).toBe("REFUSED");
  expect(invalid.record.notes.join(" ")).toContain("head");
  expect(f.snapshot(f.clone)).toEqual(before);
});

test("cleanup leaves only the committed tree and declared inputs, including Shared checkout excludes", () => {
  const f = fixture();
  writeFileSync(join(f.shared, ".git/info/exclude"), ".omp/skills/verify-app\n");
  writeFileSync(join(f.clone, "app.ts"), "carried tracked edit\n");
  writeFileSync(join(f.clone, "untracked-source.ts"), "not in head\n");
  git(f.clone, "add", "app.ts");
  const inputs = [".env", ".omp/skills/verify-app", "cache/deps", "node_modules"];
  for (const name of [".omp/skills/verify-app", "cache/deps", "node_modules"]) {
    mkdirSync(join(f.clone, name), { recursive: true });
    writeFileSync(join(f.clone, name, "runtime"), "required runtime input");
  }
  writeFileSync(join(f.clone, ".env"), "TOKEN=local");
  const parentBefore = f.snapshot(f.shared); const cloneBefore = f.snapshot(f.clone);
  f.declare(inputs);
  const preflight = f.run("preflight");
  expect(preflight.code).toBe(0); expect(preflight.record.patch_id).toMatch(/^[a-f0-9]{40}$/);
  f.create(f.head, true, inputs);
  mkdirSync(join(f.worktree, "cache/deps"), { recursive: true });
  mkdirSync(join(f.worktree, "node_modules/pkg"), { recursive: true });
  mkdirSync(join(f.worktree, ".omp/skills"), { recursive: true });
  const verify = join(f.dir, "private-verify"); mkdirSync(verify); writeFileSync(join(verify, "SKILL.md"), "Drive real app");
  rmSync(join(f.worktree, ".omp/skills/verify-app"), { recursive: true });
  symlinkSync(verify, join(f.worktree, ".omp/skills/verify-app"));
  writeFileSync(join(f.worktree, ".env"), "TOKEN=local");
  writeFileSync(join(f.worktree, "cache/deps/keep"), "dependency");
  writeFileSync(join(f.worktree, "node_modules/pkg/index.js"), "dependency");
  writeFileSync(join(f.worktree, "cache/extra test\nfile.ts"), "not in head");
  cpSync(join(f.clone, "untracked-source.ts"), join(f.worktree, "untracked-source.ts"));
  const result = f.run("clean-head");
  expect(result.code).toBe(0);
  expect(result.record.removed).toEqual(["cache/extra test\nfile.ts", "untracked-source.ts"]);
  expect(existsSync(join(f.worktree, "untracked-source.ts"))).toBe(false);
  expect(readFileSync(join(f.worktree, "cache/deps/keep"), "utf8")).toBe("dependency");
  expect(readFileSync(join(f.worktree, "node_modules/pkg/index.js"), "utf8")).toBe("dependency");
  expect(readFileSync(join(f.worktree, ".env"), "utf8")).toBe("TOKEN=local");
  expect(readFileSync(join(f.worktree, ".omp/skills/verify-app/SKILL.md"), "utf8")).toBe("Drive real app");
  expect(git(f.worktree, "rev-parse", "HEAD")).toBe(f.head);
  expect(git(f.worktree, "status", "--porcelain", "--untracked-files=no")).toBe("");
  expect(readFileSync(join(f.worktree, "app.ts"), "utf8")).toBe("head\n");
  expect(f.snapshot(f.shared)).toEqual(parentBefore); expect(f.snapshot(f.clone)).toEqual(cloneBefore);
});

test("cleanup refuses wrong head, dirty tracked files, and unregistered trees before deleting files", () => {
  for (const kind of ["wrong-head", "dirty", "unregistered"]) {
    const f = fixture();
    if (kind === "unregistered") git(f.clone, "clone", f.clone, f.worktree);
    else f.create(kind === "wrong-head" ? f.base : f.head);
    if (kind === "dirty") writeFileSync(join(f.worktree, "app.ts"), "dirty");
    writeFileSync(join(f.worktree, "extra.ts"), "keep on refusal");
    const parentBefore = f.snapshot(f.shared); const cloneBefore = f.snapshot(f.clone);
    const result = f.run("clean-head");
    expect(result.code).toBe(2); expect(result.record.verdict).toBe("REFUSED");
    expect(result.record.notes.join(" ")).toMatch(/head|tracked|registered|record/i);
    expect(readFileSync(join(f.worktree, "extra.ts"), "utf8")).toBe("keep on refusal");
    expect(f.snapshot(f.shared)).toEqual(parentBefore); expect(f.snapshot(f.clone)).toEqual(cloneBefore);
  }
});

test("cleanup honors global excludes and the original common-dir exclusions of a Shared linked worktree", () => {
  const f = fixture(); const linked = join(f.dir, "shared-linked");
  git(f.shared, "worktree", "add", "--detach", linked, f.head);
  writeFileSync(join(f.shared, ".git/info/exclude"), "private-link\n");
  const global = join(f.dir, "global-excludes"); writeFileSync(global, "global-input\n");
  git(f.clone, "config", "core.excludesFile", global);
  for (const input of ["private-link", "global-input"]) writeFileSync(join(f.clone, input), "runtime");
  f.create(f.head, true, ["private-link", "global-input"]);
  writeFileSync(join(f.worktree, "private-link"), "private");
  writeFileSync(join(f.worktree, "global-input"), "global");
  writeFileSync(join(f.worktree, "extra.ts"), "remove");
  const result = f.run("clean-head", f.args.map(x => x === f.shared ? linked : x));
  expect(result.code).toBe(0); expect(result.record.removed).toEqual(["extra.ts"]);
  expect(readFileSync(join(f.worktree, "private-link"), "utf8")).toBe("private");
  expect(readFileSync(join(f.worktree, "global-input"), "utf8")).toBe("global");
});

test("cleanup refuses nonignored nested repositories and submodules without silently deleting them", () => {
  for (const kind of ["nested", "submodule"]) {
    const f = fixture(); let head = f.head;
    if (kind === "submodule") {
      git(f.clone, "config", "user.name", "Fixture"); git(f.clone, "config", "user.email", "fixture@example.test");
      git(f.clone, "update-index", "--add", "--cacheinfo", `160000,${f.head},nested`);
      git(f.clone, "commit", "-qm", "gitlink"); head = git(f.clone, "rev-parse", "HEAD");
    }
    f.create(head);
    if (kind === "nested") git(f.worktree, "clone", f.shared, "nested");
    const result = f.run("clean-head", f.args.map(x => x === f.head ? head : x));
    expect(result.code).toBe(2); expect(result.record.verdict).toBe("REFUSED");
    expect(result.record.notes.join(" ")).toMatch(/nested|Submodule/);
    expect(existsSync(join(f.worktree, "nested"))).toBe(true);
  }
});

test("cleanup refuses a changed tracked file even when Git marks it assume-unchanged", () => {
  const f = fixture(); f.create();
  git(f.worktree, "update-index", "--assume-unchanged", "app.ts");
  writeFileSync(join(f.worktree, "app.ts"), "hidden dirty\n");
  const result = f.run("clean-head");
  expect(result.code).toBe(2); expect(result.record.notes.join(" ")).toContain("Dirty tracked content");
});

test("cleanup refuses untracked ignore rules that could hide carried source", () => {
  const f = fixture(); f.create();
  mkdirSync(join(f.worktree, "carried"));
  writeFileSync(join(f.worktree, "carried/.gitignore"), "*\n");
  writeFileSync(join(f.worktree, "carried/source.ts"), "must not reach verification");
  const result = f.run("clean-head");
  expect(result.code).toBe(2); expect(result.record.verdict).toBe("REFUSED");
  expect(result.record.notes.join(" ")).toContain("Untracked ignore");
});

test("clone-local exclusions cannot mask untracked ignore rules that hide carried tests", () => {
  const f = fixture();
  const excludes = join(f.clone, ".git/info/exclude");
  writeFileSync(excludes, "carried/\n");
  f.create();
  mkdirSync(join(f.worktree, "carried"));
  writeFileSync(join(f.worktree, "carried/.gitignore"), "*\n");
  writeFileSync(join(f.worktree, "carried/test.ts"), "must not reach verification");
  const sharedBefore = f.snapshot(f.shared); const cloneBefore = f.snapshot(f.clone);
  const excludesBefore = readFileSync(excludes);
  const result = f.run("clean-head");
  expect(result.code).toBe(2); expect(result.record.verdict).toBe("REFUSED");
  expect(result.record.notes.join(" ")).toContain("Untracked ignore");
  expect(readFileSync(join(f.worktree, "carried/test.ts"), "utf8")).toBe("must not reach verification");
  expect(readFileSync(excludes)).toEqual(excludesBefore);
  expect(f.snapshot(f.shared)).toEqual(sharedBefore); expect(f.snapshot(f.clone)).toEqual(cloneBefore);
  expect(git(f.worktree, "rev-parse", "HEAD")).toBe(f.head);
  expect(git(f.worktree, "status", "--porcelain", "--untracked-files=no")).toBe("");
});

test("cleanup refuses when a declared Verify link disappears after construction", () => {
  const f = fixture();
  writeFileSync(join(f.shared, ".git/info/exclude"), ".omp/skills/verify-app\n");
  const target = join(f.dir, "verify-app"); mkdirSync(target); writeFileSync(join(target, "SKILL.md"), "Drive");
  mkdirSync(join(f.clone, ".omp/skills"), { recursive: true }); symlinkSync(target, join(f.clone, ".omp/skills/verify-app"));
  f.create(f.head, true, [".omp/skills/verify-app"]);
  rmSync(join(f.worktree, ".omp/skills/verify-app"));
  const result = f.run("clean-head");
  expect(result.code).toBe(2); expect(result.record.verdict).toBe("REFUSED");
  expect(result.record.notes.join(" ")).toContain("worktree.clone");
  expect(result.record.notes.join(" ")).toContain("/skill:setup-vstack");
  expect(readFileSync(join(f.clone, ".omp/skills/verify-app/SKILL.md"), "utf8")).toBe("Drive");
});

test("refuses a plain fallback even when its tracked tree is valid", () => {
  const f = fixture(); f.create(f.head, false);
  writeFileSync(join(f.worktree, "extra.ts"), "keep on refusal");
  const result = f.run("clean-head");
  expect(result.code).toBe(2); expect(result.record.verdict).toBe("REFUSED");
  expect(result.record.notes.join(" ")).toContain("worktree.clone");
  expect(readFileSync(join(f.worktree, "extra.ts"), "utf8")).toBe("keep on refusal");
});

test("committed-input construction omits an unrelated active tool cache before validation", () => {
  const f = fixture();
  mkdirSync(join(f.clone, ".ruff_cache")); writeFileSync(join(f.clone, ".ruff_cache/.gitignore"), "*\n");
  writeFileSync(join(f.clone, ".ruff_cache/state"), "unrelated tool state");
  mkdirSync(join(f.clone, "node_modules/pkg"), { recursive: true }); writeFileSync(join(f.clone, "node_modules/pkg/runtime.js"), "runtime");
  writeFileSync(join(f.clone, ".env"), "TOKEN=local");
  writeFileSync(join(f.clone, "app.ts"), "dirty author source\n");
  const before = [f.snapshot(f.shared), f.snapshot(f.clone)];
  f.create(f.head, true, ["node_modules", ".env"]);
  const result = f.run("clean-head");
  expect(result.code).toBe(0);
  expect(existsSync(join(f.worktree, ".ruff_cache"))).toBe(false);
  expect(readFileSync(join(f.worktree, "node_modules/pkg/runtime.js"), "utf8")).toBe("runtime");
  expect(readFileSync(join(f.worktree, ".env"), "utf8")).toBe("TOKEN=local");
  expect(readFileSync(join(f.worktree, "app.ts"), "utf8")).toBe("head\n");
  expect([f.snapshot(f.shared), f.snapshot(f.clone)]).toEqual(before);
});

test("undeclared ignored source still refuses even under committed ignore rules", () => {
  const f = fixture(); f.create();
  mkdirSync(join(f.worktree, "cache/deps"), { recursive: true });
  writeFileSync(join(f.worktree, "cache/deps/source.ts"), "undeclared hidden source");
  const result = f.run("clean-head");
  expect(result.code).toBe(2); expect(result.record.verdict).toBe("REFUSED");
  expect(result.record.notes.join(" ")).toContain("Undeclared ignored input");
  expect(readFileSync(join(f.worktree, "cache/deps/source.ts"), "utf8")).toBe("undeclared hidden source");
});

test("construction refuses missing declared input and preserves both source repositories", () => {
  const f = fixture(); const before = [f.snapshot(f.shared), f.snapshot(f.clone)];
  expect(() => f.create(f.head, true, ["node_modules/missing"])).toThrow('Required runtime input "node_modules/missing" is missing');
  expect(existsSync(f.recordPath)).toBe(false);
  expect([f.snapshot(f.shared), f.snapshot(f.clone)]).toEqual(before);
});

test("changed declarations and committed-source declarations cannot widen carried inputs", () => {
  const f = fixture(); f.create();
  f.declare(["cache/deps"]);
  expect(f.run("clean-head").record.notes.join(" ")).toContain("same declared --inputs");
  const other = fixture();
  expect(() => other.create(other.head, true, ["app.ts"])).toThrow("overlaps committed source");
});

test("preflight refuses a declared input that overlaps committed source at the head commit", () => {
  const f = fixture();
  mkdirSync(join(f.shared, "plugin")); writeFileSync(join(f.shared, "plugin/run.ts"), "committed\n");
  git(f.shared, "add", "."); git(f.shared, "commit", "-qm", "plugin");
  const head = git(f.shared, "rev-parse", "HEAD"); git(f.clone, "fetch", "-q", "origin");
  const args = f.args.map(x => x === f.head ? head : x);
  for (const inputs of [["node_modules", "plugin"], ["plugin/run.ts"], ["plugin/run.ts/cache"]]) {
    f.declare(inputs);
    const result = f.run("preflight", args);
    expect(result.code).toBe(2); expect(result.record.verdict).toBe("REFUSED");
    expect(result.record.notes.join(" ")).toContain(`Runtime input ${JSON.stringify(inputs.at(-1))} overlaps committed source`);
  }
  for (const inputs of [["node_modules"], ["node_modules", "plugin/cache"]]) {
    f.declare(inputs);
    const allowed = f.run("preflight", args);
    expect(allowed.code).toBe(0); expect(allowed.record.inputs).toEqual(inputs);
  }
});

test.each(["../outside", ".git/info/exclude", ".", "", "/absolute", "cache//deps"])("preflight refuses unsafe runtime declaration %j", input => {
  const f = fixture(); f.declare([input]);
  const result = f.run("preflight");
  expect(result.code).toBe(2); expect(result.record.verdict).toBe("REFUSED");
  expect(existsSync(f.recordPath)).toBe(false);
});

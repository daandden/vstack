import { afterAll, beforeAll, expect, test } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { ENV as BASE_ENV } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "../plugin/skills/setup-vstack/scripts/private-mcp.ts");
const dirs: string[] = [];
const GIT = Bun.which("git");
if (!GIT) throw new Error("Private MCP tests require Git 2.54 or later with configuration-hook support on PATH.");
const ENV = { ...BASE_ENV, PATH: dirname(GIT) + ":" + BASE_ENV.PATH };
function git(cwd: string, ...args: string[]) {
  const result = Bun.spawnSync([GIT!, ...args], { cwd, env: ENV, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.toString().trim();
}
beforeAll(() => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "vstack-mcp-prerequisite-"))); dirs.push(base);
  const template = join(base, "empty-template"); mkdirSync(template);
  git(base, "init", "--template", template, "-q");
  const version = git(base, "--version");
  const match = /^git version (\d+)\.(\d+)(?:\.|$)/.exec(version);
  const result = Bun.spawnSync([GIT!, "-c", "hook.fixture-capability.event=post-checkout", "-c",
    "hook.fixture-capability.command=printf fixture-config-hook", "hook", "run", "--ignore-missing", "post-checkout", "--", "0".repeat(40), "0".repeat(40), "1"],
    { cwd: base, env: { ...ENV, HOME: base }, stdout: "pipe", stderr: "pipe" });
  if (!match || !(+match[1]! > 2 || (+match[1]! === 2 && +match[2]! >= 54)) ||
      result.exitCode !== 0 || result.stderr.toString() !== "fixture-config-hook") {
    throw new Error(`Private MCP tests require configuration-hook-capable Git 2.54 or later. Selected ${GIT}: ${version}. See docs/maintainer.md test prerequisites.`);
  }
});
afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })));
function put(path: string, text: string) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); }
function repo() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "vstack-mcp-")));
  dirs.push(base);
  const root = join(base, "app"); mkdirSync(root);
  mkdirSync(join(base, "home"));
  const template = join(base, "empty-template"); mkdirSync(template);
  git(root, "init", "--template", template, "-q", "-b", "main");
  put(join(root, "README"), "fixture\n");
  git(root, "add", "README"); git(root, "commit", "-qm", "initial");
  mkdirSync(join(root, ".git/vstack/config"), { recursive: true });
  return root;
}
function run(root: string, ...args: string[]) {
  const p = Bun.spawnSync([process.execPath, SCRIPT, ...args], { cwd: root, env: { ...ENV, HOME: join(dirname(root), "home") }, stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode, stdout: p.stdout.toString(), stderr: p.stderr.toString(), json: () => JSON.parse(p.stdout.toString()) };
}
function plan(root: string) {
  const result = run(root, "plan"); expect(result.code).toBe(0);
  const path = join(root, ".git/approved-mcp.json"); put(path, result.stdout);
  return { path, value: result.json() };
}
function apply(root: string) { return run(root, "apply", "--plan", plan(root).path); }

test("fresh Private setup shares an absolute link and preserves unrelated local exclusions", () => {
  const root = repo(); const exclude = join(root, ".git/info/exclude");
  put(exclude, "# own rules\nprivate-stuff\n");
  const result = apply(root); expect(result.code).toBe(0);
  const shared = result.json().shared;
  expect(lstatSync(join(root, ".omp/mcp.json")).isSymbolicLink()).toBe(true);
  expect(readlinkSync(join(root, ".omp/mcp.json"))).toBe(shared);
  expect(shared).toBe(join(root, ".git/vstack/mcp/mcp.json"));
  expect(JSON.parse(readFileSync(shared, "utf8"))).toEqual({ mcpServers: {} });
  expect(readFileSync(exclude, "utf8")).toBe("# own rules\nprivate-stuff\n/.omp/mcp.json\n");
  expect(git(root, "status", "--porcelain")).toBe("");
});

test("raw reconciliation preserves disjoint settings, literal references and recoverable bytes on reruns", () => {
  const root = repo(); const main = join(root, ".omp/mcp.json"); const shared = join(root, ".git/vstack/mcp/mcp.json");
  const mainBytes = '{ "mcpServers": { "one": { "command": "${SECRET}", "args": ["b", "a"] } }, "unknown": { "first": true } }\n';
  const sharedBytes = '{"mcpServers":{"two":{"url":"https://example.invalid"}},"unknown":{"second":42}}\n';
  put(main, mainBytes); put(shared, sharedBytes);
  const result = apply(root); expect(result.code).toBe(0);
  expect(JSON.parse(readFileSync(shared, "utf8"))).toEqual({
    mcpServers: { one: { command: "${SECRET}", args: ["b", "a"] }, two: { url: "https://example.invalid" } },
    unknown: { first: true, second: 42 },
  });
  expect(result.json().backups.map((p: string) => readFileSync(p, "utf8")).sort()).toEqual([mainBytes, sharedBytes].sort());
  const before = readFileSync(shared, "utf8");
  expect(apply(root).code).toBe(0);
  expect(readFileSync(shared, "utf8")).toBe(before);
  expect(readlinkSync(main)).toBe(shared);
});

test("conflict choices bind to raw inputs, disclose no values and require every explicit answer", () => {
  const root = repo(); const main = join(root, ".omp/mcp.json"); const shared = join(root, ".git/vstack/mcp/mcp.json");
  const mainBytes = '{"mcpServers":{"same":{"env":{"TOKEN":"private-main-value"},"args":["b","a"]}},"keepMain":true}\n';
  const sharedBytes = '{"mcpServers":{"same":{"env":{"TOKEN":"private-shared-value"},"args":["a","b"]}},"keepShared":true}\n';
  put(main, mainBytes); put(shared, sharedBytes);
  const p = plan(root);
  expect(p.value.conflicts).toEqual(["/mcpServers/same/env/TOKEN", "/mcpServers/same/args"]);
  expect(JSON.stringify(p.value)).not.toContain("private-main-value");
  expect(JSON.stringify(p.value)).not.toContain("private-shared-value");
  for (const choices of [undefined, {}, { "/mcpServers/same/env/TOKEN": "decline" }, { "/wrong": "main" }]) {
    const file = join(root, ".git/choices.json"); put(file, JSON.stringify(choices ?? {}));
    const result = run(root, "apply", "--plan", p.path, ...(choices === undefined ? [] : ["--choices", file]));
    expect(result.code).toBe(2); expect(result.stderr).not.toContain("private-main-value");
    expect(readFileSync(main, "utf8")).toBe(mainBytes); expect(readFileSync(shared, "utf8")).toBe(sharedBytes);
  }
  const choices = join(root, ".git/choices.json");
  put(choices, JSON.stringify({ "/mcpServers/same/env/TOKEN": "shared", "/mcpServers/same/args": "main" }));
  put(main, mainBytes + " ");
  expect(run(root, "apply", "--plan", p.path, "--choices", choices).code).toBe(2);
  expect(readFileSync(main, "utf8")).toBe(mainBytes + " ");
  put(main, mainBytes);
  const result = run(root, "apply", "--plan", p.path, "--choices", choices); expect(result.code).toBe(0);
  expect(JSON.parse(readFileSync(shared, "utf8"))).toEqual({
    mcpServers: { same: { env: { TOKEN: "private-shared-value" }, args: ["b", "a"] } }, keepMain: true, keepShared: true,
  });
  expect(result.json().backups.map((p: string) => readFileSync(p, "utf8")).sort()).toEqual([mainBytes, sharedBytes].sort());
});

test("tracked project MCP paths are refused even after staging their deletion", () => {
  const root = repo(); const main = join(root, ".omp/mcp.json");
  put(main, '{"mcpServers":{"tracked":{"command":"keep"}}}\n');
  git(root, "add", "-f", ".omp/mcp.json"); git(root, "commit", "-qm", "tracked config");
  const before = readFileSync(main, "utf8");
  expect(run(root, "plan").code).toBe(2);
  expect(readFileSync(main, "utf8")).toBe(before);
  git(root, "rm", "--cached", ".omp/mcp.json");
  expect(run(root, "plan").code).toBe(2);
  expect(readFileSync(main, "utf8")).toBe(before);
  expect(existsSync(join(root, ".git/vstack/mcp/mcp.json"))).toBe(false);
});

test("creator-selected unsupported Git leaves setup incomplete without configuration writes", () => {
  const root = repo();
  const boundary = join(dirname(root), "unsupported-git"); mkdirSync(boundary);
  const executable = join(boundary, "git");
  put(executable, `#!/bin/sh\nif test "$1" = --version; then\n  printf 'version capability unavailable\\n' >&2\n  exit 1\nfi\nexec '${GIT!.replaceAll("'", "'\\''")}' "$@"\n`);
  chmodSync(executable, 0o755);
  const env = { ...ENV, HOME: join(dirname(root), "home"), PATH: boundary + ":" + ENV.PATH };
  const p = Bun.spawnSync([process.execPath, SCRIPT, "plan"], {
    cwd: root, env, stdout: "pipe", stderr: "pipe",
  });
  expect(p.exitCode).toBe(0);
  const result = JSON.parse(p.stdout.toString());
  expect(result.git.executable).toBe(executable);
  expect(result.git.supported).toBe(false);
  expect(result.git.remedy).toContain("2.54");
  const file = join(root, ".git/unsupported-plan.json"); put(file, p.stdout.toString());
  const applied = Bun.spawnSync([process.execPath, SCRIPT, "apply", "--plan", file], {
    cwd: root, env, stdout: "pipe", stderr: "pipe",
  });
  expect(applied.exitCode).toBe(2);
  expect(existsSync(join(root, ".omp/mcp.json"))).toBe(false);
  expect(existsSync(join(root, ".git/vstack/mcp/mcp.json"))).toBe(false);
});

function hook(root: string, old = "0".repeat(40)) {
  const p = Bun.spawnSync(["git", "hook", "run", "--ignore-missing", "post-checkout", "--", old, git(root, "rev-parse", "HEAD"), "1"], {
    cwd: root, env: { ...ENV, HOME: join(dirname(root), "home") }, stdout: "pipe", stderr: "pipe",
  });
  return { code: p.exitCode, stderr: p.stderr.toString() };
}
test("installed named hook links future worktrees while traditional and unrelated named hooks coexist", () => {
  const root = repo(); const log = join(dirname(root), "hooks.log");
  const legacy = join(root, ".git/custom-hooks/post-checkout");
  const legacyBytes = `#!/bin/sh\nprintf 'legacy\\n' >> '${log}'\n`;
  put(legacy, legacyBytes); chmodSync(legacy, 0o755);
  git(root, "config", "core.hooksPath", dirname(legacy));
  git(root, "config", "hook.unrelated.command", `printf 'named\\n' >> '${log}'`);
  git(root, "config", "hook.unrelated.event", "post-checkout");
  expect(apply(root).code).toBe(0);
  const future = join(dirname(root), "future");
  git(root, "worktree", "add", "-q", "-b", "future", future);
  expect(lstatSync(join(future, ".omp/mcp.json")).isSymbolicLink()).toBe(true);
  expect(readlinkSync(join(future, ".omp/mcp.json"))).toBe(join(root, ".git/vstack/mcp/mcp.json"));
  expect(hook(future).code).toBe(0);
  expect(readFileSync(log, "utf8").split("\\n").join("\n")).toContain("legacy\nnamed\n");
  expect(apply(root).code).toBe(0);
  expect(git(root, "config", "--get-all", "hook.vstack-private-mcp.event")).toBe("post-checkout");
  expect(git(root, "config", "core.hooksPath")).toBe(dirname(legacy));
  expect(readFileSync(legacy, "utf8")).toBe(legacyBytes);
});

test("worktrees present at first setup stay excluded, but their reused paths can hold eligible new worktrees", () => {
  const root = repo(); const old = join(dirname(root), "old"); const missing = join(dirname(root), "missing");
  git(root, "worktree", "add", "-q", "-b", "old", old);
  git(root, "worktree", "add", "-q", "-b", "missing", missing);
  put(join(old, ".omp/mcp.json"), '{"keep":"old"}\n');
  expect(apply(root).code).toBe(0);
  expect(hook(old).code).toBe(0); expect(readFileSync(join(old, ".omp/mcp.json"), "utf8")).toBe('{"keep":"old"}\n');
  expect(hook(missing).code).toBe(0); expect(existsSync(join(missing, ".omp/mcp.json"))).toBe(false);
  expect(apply(root).code).toBe(0);
  expect(hook(missing).code).toBe(0); expect(existsSync(join(missing, ".omp/mcp.json"))).toBe(false);
  git(root, "worktree", "remove", "--force", old);
  git(root, "worktree", "add", "-q", "-b", "reused", old);
  expect(readlinkSync(join(old, ".omp/mcp.json"))).toBe(join(root, ".git/vstack/mcp/mcp.json"));
  unlinkSync(join(old, ".omp/mcp.json"));
  expect(apply(root).code).toBe(0);
  expect(hook(old).code).toBe(0);
  expect(lstatSync(join(old, ".omp/mcp.json")).isSymbolicLink()).toBe(true);
});

test("unowned or altered hook definitions are refused without changing files or hook settings", () => {
  for (const owned of [false, true]) {
    const root = repo();
    if (owned) expect(apply(root).code).toBe(0);
    git(root, "config", "hook.vstack-private-mcp.command", "printf foreign");
    git(root, "config", "hook.vstack-private-mcp.event", "post-checkout");
    const before = readFileSync(join(root, ".git/config"), "utf8");
    const source = join(root, ".omp/mcp.json");
    if (!owned) put(source, '{"preserve":"main"}\n');
    const bytes = readFileSync(source, "utf8");
    const result = run(root, "plan");
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("hook");
    expect(readFileSync(join(root, ".git/config"), "utf8")).toBe(before);
    expect(readFileSync(source, "utf8")).toBe(bytes);
  }
});

test("complete Markdown setup still reports pending Private MCP setup and clears it only after installation", () => {
  const root = repo();
  for (const name of ["issue-tracker", "code-host", "triage-labels", "domain", "ci"]) {
    put(join(root, `.git/vstack/config/${name}.md`), name === "code-host" ? "- Host: GitHub\n- Default End state: commit\n- Landing method: merge\n" : "# config\n");
  }
  const project = join(import.meta.dir, "../plugin/skills/setup-vstack/scripts/project.ts");
  const state = () => {
    const p = Bun.spawnSync([process.execPath, project, "state"], { cwd: root, env: { ...ENV, HOME: join(dirname(root), "home") }, stdout: "pipe", stderr: "pipe" });
    expect(p.exitCode).toBe(0); return JSON.parse(p.stdout.toString());
  };
  expect(state().missing_config).toEqual([]);
  expect(state().private_mcp.pending).toBe(true);
  expect(apply(root).code).toBe(0);
  expect(state().private_mcp.pending).toBe(false);
  unlinkSync(join(root, ".omp/mcp.json"));
  expect(state().private_mcp.pending).toBe(true);
});

test("invalid JSON, foreign main links and changed shared inputs preserve source configuration", () => {
  const root = repo(); const main = join(root, ".omp/mcp.json"); const shared = join(root, ".git/vstack/mcp/mcp.json");
  for (const bytes of ["{ invalid", "[]", "null"]) {
    put(main, bytes); expect(run(root, "plan").code).toBe(2); expect(readFileSync(main, "utf8")).toBe(bytes);
  }
  put(main, '{"mcpServers":{}}\n'); put(shared, '{"extra":1}\n');
  const p = plan(root); put(shared, '{"extra":2}\n');
  expect(run(root, "apply", "--plan", p.path).code).toBe(2);
  expect(readFileSync(main, "utf8")).toBe('{"mcpServers":{}}\n');
  expect(readFileSync(shared, "utf8")).toBe('{"extra":2}\n');
  const foreign = join(dirname(root), "foreign.json"); put(foreign, '{"foreign":true}\n');
  unlinkSync(main); symlinkSync(foreign, main);
  expect(run(root, "plan").code).toBe(2);
  expect(readlinkSync(main)).toBe(foreign); expect(readFileSync(foreign, "utf8")).toBe('{"foreign":true}\n');
});

test("installed hook preserves regular and foreign configurations and exposes failures without deleting the checkout", () => {
  const root = repo(); expect(apply(root).code).toBe(0);
  const future = join(dirname(root), "conflict");
  git(root, "worktree", "add", "-q", "-b", "conflict", future);
  const destination = join(future, ".omp/mcp.json"); const shared = join(root, ".git/vstack/mcp/mcp.json");
  writeFileSync(destination, '{"sharedEdit":true}\n');
  expect(JSON.parse(readFileSync(join(root, ".omp/mcp.json"), "utf8"))).toEqual({ sharedEdit: true });
  unlinkSync(destination); put(destination, '{"private":"preserve"}\n');
  expect(hook(future).code).not.toBe(0); expect(hook(future).stderr).toContain("conflict");
  expect(readFileSync(destination, "utf8")).toBe('{"private":"preserve"}\n');
  expect(existsSync(join(future, ".git"))).toBe(true);
  const foreign = join(dirname(root), "another.json"); put(foreign, '{"foreign":1}\n');
  unlinkSync(destination); symlinkSync(foreign, destination);
  expect(hook(future).code).not.toBe(0);
  expect(readlinkSync(destination)).toBe(foreign); expect(readFileSync(foreign, "utf8")).toBe('{"foreign":1}\n');
  unlinkSync(destination);
  expect(hook(future, git(root, "rev-parse", "HEAD")).code).toBe(0);
  expect(existsSync(destination)).toBe(false);
  expect(hook(future).code).toBe(0); expect(readlinkSync(destination)).toBe(shared);
});

test("Standard setup never creates shared MCP configuration or modifies user configuration", () => {
  const root = repo(); rmSync(join(root, ".git/vstack"), { recursive: true });
  const user = join(dirname(root), "home/.omp/mcp.json"); put(user, '{"userOnly":true}\n');
  put(join(root, ".omp/mcp.json"), '{"projectOnly":true}\n');
  const config = readFileSync(join(root, ".git/config"), "utf8");
  expect(run(root, "plan").code).toBe(2);
  expect(readFileSync(user, "utf8")).toBe('{"userOnly":true}\n');
  expect(readFileSync(join(root, ".omp/mcp.json"), "utf8")).toBe('{"projectOnly":true}\n');
  expect(readFileSync(join(root, ".git/config"), "utf8")).toBe(config);
});

test("fresh Private setup works before the repository has its first commit", () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "vstack-mcp-unborn-"))); dirs.push(base);
  const root = join(base, "app"); mkdirSync(root); mkdirSync(join(base, "home"));
  const template = join(base, "empty-template"); mkdirSync(template);
  git(root, "init", "--template", template, "-q", "-b", "main"); mkdirSync(join(root, ".git/vstack/config"), { recursive: true });
  const result = apply(root); expect(result.code).toBe(0);
  expect(readlinkSync(join(root, ".omp/mcp.json"))).toBe(join(root, ".git/vstack/mcp/mcp.json"));
  expect(git(root, "status", "--porcelain")).toBe("");
});

test("eligible hooks refuse tracked destinations and missing canonical configuration", () => {
  const root = repo(); expect(apply(root).code).toBe(0);
  const future = join(dirname(root), "tracked-future");
  git(root, "worktree", "add", "-q", "-b", "tracked-future", future);
  const destination = join(future, ".omp/mcp.json");
  unlinkSync(destination); put(destination, '{"tracked":"keep"}\n');
  git(future, "add", "-f", ".omp/mcp.json"); git(future, "commit", "-qm", "track destination");
  unlinkSync(destination);
  expect(hook(future).code).not.toBe(0); expect(existsSync(destination)).toBe(false);
  const other = join(dirname(root), "missing-shared");
  git(root, "worktree", "add", "-q", "-b", "missing-shared", other);
  unlinkSync(join(other, ".omp/mcp.json"));
  unlinkSync(join(root, ".git/vstack/mcp/mcp.json"));
  expect(hook(other).code).not.toBe(0); expect(existsSync(join(other, ".omp/mcp.json"))).toBe(false);
});

test("setup refuses symlinked parent or exclusion paths instead of writing outside repository metadata", () => {
  for (const location of [".omp", ".git/vstack/mcp", ".git/info/exclude"]) {
    const root = repo(); const foreign = join(dirname(root), "foreign");
    if (location.endsWith("exclude")) { put(foreign, "# preserve\n"); rmSync(join(root, location), { force: true }); }
    else mkdirSync(foreign);
    mkdirSync(dirname(join(root, location)), { recursive: true });
    symlinkSync(foreign, join(root, location));
    expect(run(root, "plan").code).toBe(2);
    expect(readlinkSync(join(root, location))).toBe(foreign);
    if (location.endsWith("exclude")) expect(readFileSync(foreign, "utf8")).toBe("# preserve\n");
    else expect(existsSync(join(foreign, "mcp.json"))).toBe(false);
  }
});

test("repeated complete setup creates no new backups or registration writes", () => {
  const root = repo(); expect(apply(root).code).toBe(0);
  const before = [".git/config", ".git/vstack/mcp/setup.json", ".git/info/exclude"].map(path => readFileSync(join(root, path), "utf8"));
  const result = apply(root); expect(result.code).toBe(0); expect(result.json().backups).toEqual([]);
  expect([".git/config", ".git/vstack/mcp/setup.json", ".git/info/exclude"].map(path => readFileSync(join(root, path), "utf8"))).toEqual(before);
});

test("apply refuses input drift during actual Git prerequisites without activating new or changed conflicts", () => {
  for (const trigger of ["--version", "check-ignore"]) for (const initial of ['{"other":true}\n', '{"setting":"approved-shared"}\n']) {
    const root = repo(); const main = join(root, ".omp/mcp.json"); const shared = join(root, ".git/vstack/mcp/mcp.json");
    const mainBytes = '{"setting":"main"}\n'; const edited = '{"other":true,"setting":"unapproved-shared"}\n';
    put(main, mainBytes); put(shared, initial);
    const boundary = join(dirname(root), "rendezvous"); mkdirSync(boundary);
    const executable = join(boundary, "git");
    const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
    put(executable, `#!/bin/sh\nif test "$1" = "$MCP_FIXTURE_TRIGGER" && test "$MCP_FIXTURE_EDIT" = 1; then\n  printf '%s' ${quote(edited)} > ${quote(shared)}\nfi\nexec ${quote(GIT!)} "$@"\n`);
    chmodSync(executable, 0o755);
    const env = { ...ENV, HOME: join(dirname(root), "home"), PATH: boundary + ":" + ENV.PATH, MCP_FIXTURE_TRIGGER: trigger };
    const planned = Bun.spawnSync([process.execPath, SCRIPT, "plan"], { cwd: root, env, stdout: "pipe", stderr: "pipe" });
    expect(planned.exitCode).toBe(0);
    const approval = join(root, ".git/rendezvous-plan.json"); put(approval, planned.stdout.toString());
    const choices = join(root, ".git/choices.json");
    put(choices, initial.includes("setting") ? '{"/setting":"shared"}' : "{}");
    const config = readFileSync(join(root, ".git/config"), "utf8");
    const result = Bun.spawnSync([process.execPath, SCRIPT, "apply", "--plan", approval, "--choices", choices],
      { cwd: root, env: { ...env, MCP_FIXTURE_EDIT: "1" }, stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString()).not.toContain("unapproved-shared");
    expect(readFileSync(main, "utf8")).toBe(mainBytes);
    expect(readFileSync(shared, "utf8")).toBe(edited);
    expect(readFileSync(join(root, ".git/config"), "utf8")).toBe(config);
    expect(existsSync(join(root, ".git/info/exclude"))).toBe(false);
    expect(existsSync(join(root, ".git/vstack/mcp/setup.json"))).toBe(false);
    const settled = plan(root); put(choices, '{"/setting":"shared"}');
    expect(run(root, "apply", "--plan", settled.path, "--choices", choices).code).toBe(0);
    expect(JSON.parse(readFileSync(shared, "utf8"))).toEqual({ setting: "unapproved-shared", other: true });
  }
});

test("numeric reconciliation preserves exact persisted values and distinguishes adjacent integers without formatting conflicts", () => {
  const root = repo(); const main = join(root, ".omp/mcp.json"); const shared = join(root, ".git/vstack/mcp/mcp.json");
  const mainBytes = '{"large":9007199254740993,"equivalent":1.0,"ordered":[-0,1e0,true,null,"${SECRET}"],"ordinary":{"rawJSON":"user-owned"},"shape":2}\n';
  const sharedBytes = '{"second":9007199254740995,"equivalent":1e0,"ordered":[0.0,1,true,null,"${SECRET}"],"ordinary":{"extra":false},"shape":{"rawJSON":"2"}}\n';
  put(main, mainBytes); put(shared, sharedBytes);
  const p = plan(root);
  expect(p.value.conflicts).toEqual(["/shape"]);
  const choices = join(root, ".git/numeric-choices.json"); put(choices, '{"/shape":"shared"}');
  const result = run(root, "apply", "--plan", p.path, "--choices", choices); expect(result.code).toBe(0);
  const consumer = () => {
    const observed = Bun.spawnSync([process.execPath, "-e",
      'const fs=require("node:fs"); console.log(JSON.stringify(JSON.parse(fs.readFileSync(process.argv[1],"utf8"),(key,value,context)=>typeof value==="number"?context.source:value)))', shared],
      { cwd: root, env: { ...ENV, HOME: join(dirname(root), "home") }, stdout: "pipe", stderr: "pipe" });
    expect(observed.exitCode).toBe(0); return JSON.parse(observed.stdout.toString());
  };
  expect(consumer()).toEqual({
    large: "9007199254740993", second: "9007199254740995", equivalent: "1.0",
    ordered: ["-0", "1e0", true, null, "${SECRET}"], ordinary: { rawJSON: "user-owned", extra: false }, shape: { rawJSON: "2" },
  });
  expect(result.json().backups.map((path: string) => readFileSync(path, "utf8")).sort()).toEqual([mainBytes, sharedBytes].sort());
  unlinkSync(main);
  const adjacentMain = '{"large":9007199254740992}\n'; const adjacentShared = '{"large":9007199254740993}\n';
  put(main, adjacentMain); put(shared, adjacentShared);
  const adjacent = plan(root); expect(adjacent.value.conflicts).toEqual(["/large"]);
  expect(JSON.stringify(adjacent.value)).not.toContain("9007199254740993");
  expect(run(root, "apply", "--plan", adjacent.path).code).toBe(2);
  expect(readFileSync(main, "utf8")).toBe(adjacentMain); expect(readFileSync(shared, "utf8")).toBe(adjacentShared);
  put(choices, '{"/large":"shared"}');
  expect(run(root, "apply", "--plan", adjacent.path, "--choices", choices).code).toBe(0);
  expect(consumer()).toEqual({ large: "9007199254740993" });
});

function privateState(root: string) {
  const project = join(import.meta.dir, "../plugin/skills/setup-vstack/scripts/project.ts");
  const result = Bun.spawnSync([process.execPath, project, "state"], {
    cwd: root, env: { ...ENV, HOME: join(dirname(root), "home") }, stdout: "pipe", stderr: "pipe",
  });
  expect(result.exitCode).toBe(0); return JSON.parse(result.stdout.toString()).private_mcp;
}

test("setup refuses higher-priority re-inclusion before creating a private link or replacing sources", () => {
  const root = repo(); const ignore = join(root, ".gitignore");
  put(ignore, "!/.omp/mcp.json\n"); git(root, "add", ".gitignore"); git(root, "commit", "-qm", "re-include");
  const exclude = join(root, ".git/info/exclude"); put(exclude, "# unrelated\nkeep-local\n");
  const config = readFileSync(join(root, ".git/config"), "utf8");
  const result = apply(root);
  expect(result.code).toBe(2); expect(result.stderr).toContain("exclusion");
  expect(existsSync(join(root, ".omp/mcp.json"))).toBe(false);
  expect(existsSync(join(root, ".git/vstack/mcp/mcp.json"))).toBe(false);
  expect(readFileSync(ignore, "utf8")).toBe("!/.omp/mcp.json\n");
  expect(readFileSync(exclude, "utf8")).toBe("# unrelated\nkeep-local\n");
  expect(readFileSync(join(root, ".git/config"), "utf8")).toBe(config);
  expect(privateState(root).pending).toBe(true);
  git(root, "add", "-A"); expect(git(root, "diff", "--cached", "--name-only")).toBe("");
});

test("state reports pending after ignore drift despite an installed link and local exclusion line", () => {
  const root = repo(); expect(apply(root).code).toBe(0); expect(privateState(root).pending).toBe(false);
  put(join(root, ".gitignore"), "!/.omp/mcp.json\n");
  git(root, "add", ".gitignore"); git(root, "commit", "-qm", "ignore drift");
  const state = privateState(root); expect(state.pending).toBe(true); expect(state.diagnostic).toContain("exclusion");
  expect(apply(root).code).toBe(2);
  expect(readlinkSync(join(root, ".omp/mcp.json"))).toBe(join(root, ".git/vstack/mcp/mcp.json"));
});

test("eligible future worktrees refuse branch re-inclusion before installing the private link", () => {
  const root = repo();
  git(root, "checkout", "-qb", "reinclude");
  put(join(root, ".gitignore"), "!/.omp/mcp.json\n");
  git(root, "add", ".gitignore"); git(root, "commit", "-qm", "branch ignore rules");
  git(root, "checkout", "-q", "main"); expect(apply(root).code).toBe(0);
  const future = join(dirname(root), "unignored-future");
  const result = Bun.spawnSync([GIT!, "worktree", "add", future, "reinclude"], {
    cwd: root, env: { ...ENV, HOME: join(dirname(root), "home") }, stdout: "pipe", stderr: "pipe",
  });
  expect(result.exitCode).not.toBe(0); expect(result.stderr.toString()).toContain("exclusion");
  expect(existsSync(join(future, ".git"))).toBe(true);
  expect(existsSync(join(future, ".omp/mcp.json"))).toBe(false);
  expect(readFileSync(join(future, ".gitignore"), "utf8")).toBe("!/.omp/mcp.json\n");
  expect(hook(future).code).not.toBe(0);
  git(future, "add", "-A"); expect(git(future, "diff", "--cached", "--name-only")).toBe("");
  expect(privateState(root).pending).toBe(false);
});

test("failed exclusion preflight preserves independent edits, deletion and foreign replacement during rollback", () => {
  for (const mutation of ["append", "delete", "replace", "symlink"]) {
    const root = repo(); const exclude = join(root, ".git/info/exclude");
    const original = "# unrelated\noriginal-keep\n"; const candidate = original + "/.omp/mcp.json\n";
    put(exclude, original);
    put(join(root, ".gitignore"), "!/.omp/mcp.json\n");
    git(root, "add", ".gitignore"); git(root, "commit", "-qm", "re-include");
    const foreign = join(dirname(root), "foreign-exclude"); put(foreign, "# foreign\nforeign-keep\n");
    const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
    const edit = {
      append: `printf 'concurrent-keep\\n' >> ${quote(exclude)}`,
      delete: `rm ${quote(exclude)}`,
      replace: `cp ${quote(exclude)} ${quote(foreign)}; mv ${quote(foreign)} ${quote(exclude)}`,
      symlink: `rm ${quote(exclude)}; ln -s ${quote(foreign)} ${quote(exclude)}`,
    }[mutation]!;
    const boundary = join(dirname(root), "rollback-rendezvous"); mkdirSync(boundary);
    const executable = join(boundary, "git");
    put(executable, `#!/bin/sh\nif test "$1" = check-ignore && test "$MCP_ROLLBACK_EDIT" = 1; then\n  ${edit}\nfi\nexec ${quote(GIT!)} "$@"\n`);
    chmodSync(executable, 0o755);
    const env = { ...ENV, HOME: join(dirname(root), "home"), PATH: boundary + ":" + ENV.PATH };
    const planned = Bun.spawnSync([process.execPath, SCRIPT, "plan"], { cwd: root, env, stdout: "pipe", stderr: "pipe" });
    expect(planned.exitCode).toBe(0);
    const approval = join(root, ".git/rollback-plan.json"); put(approval, planned.stdout.toString());
    const config = readFileSync(join(root, ".git/config"), "utf8");
    const applied = Bun.spawnSync([process.execPath, SCRIPT, "apply", "--plan", approval], {
      cwd: root, env: { ...env, MCP_ROLLBACK_EDIT: "1" }, stdout: "pipe", stderr: "pipe",
    });
    expect(applied.exitCode).toBe(2);
    if (mutation === "delete") expect(existsSync(exclude)).toBe(false);
    else if (mutation === "symlink") {
      expect(readlinkSync(exclude)).toBe(foreign);
      expect(readFileSync(foreign, "utf8")).toBe("# foreign\nforeign-keep\n");
    } else expect(readFileSync(exclude, "utf8")).toBe(candidate + (mutation === "append" ? "concurrent-keep\n" : ""));
    expect(applied.stderr.toString()).toContain("exclusion");
    expect(applied.stderr.toString()).toContain("preserved");
    expect(existsSync(join(root, ".omp/mcp.json"))).toBe(false);
    expect(existsSync(join(root, ".git/vstack/mcp/mcp.json"))).toBe(false);
    expect(readFileSync(join(root, ".git/config"), "utf8")).toBe(config);
    expect(privateState(root).pending).toBe(true);
  }
});

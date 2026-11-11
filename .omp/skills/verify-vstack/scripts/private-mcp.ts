import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const [checkoutArg, evidenceArg] = process.argv.slice(2);
if (!checkoutArg || !evidenceArg || process.argv.length !== 4) throw new Error("Usage: private-mcp.ts <checkout> <new evidence directory>");
const checkout = realpathSync(checkoutArg); const evidence = resolve(evidenceArg);
if (existsSync(evidence)) throw new Error("Evidence directory already exists. Choose a new directory to preserve earlier proof.");
mkdirSync(evidence, { recursive: true });
const outside = realpathSync(mkdtempSync(join(tmpdir(), "vstack-private-mcp-verify-")));
mkdirSync(join(evidence, "data")); symlinkSync(outside, join(evidence, "data/outside"));
const home = join(outside, "home"); const repo = join(outside, "app"); mkdirSync(home); mkdirSync(repo);
const env: Record<string, string> = {
  PATH: process.env.PATH!, HOME: home, TERM: "dumb", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Private MCP fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Private MCP fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};
const setup = join(checkout, "plugin/skills/setup-vstack/scripts/private-mcp.ts");
let sequence = 0;
const commands: unknown[] = [];
function command(name: string, argv: string[], cwd = repo, extra: Record<string, string> = {}, expected = 0) {
  const start = Date.now();
  const p = Bun.spawnSync(argv, { cwd, env: { ...env, ...extra }, stdout: "pipe", stderr: "pipe", timeout: 180_000 });
  const result = { name, command: argv, cwd, exit_code: p.exitCode, stdout: p.stdout.toString(), stderr: p.stderr.toString(), duration_ms: Date.now() - start };
  const path = join(evidence, `${String(++sequence).padStart(2, "0")}-${name}.json`);
  writeFileSync(path, JSON.stringify(result, null, 2) + "\n"); commands.push({ name, path, exit_code: p.exitCode });
  if (result.duration_ms >= 180_000) throw new Error(`Costly seam reached 180 seconds. Stop and obtain approval before another use. Evidence: ${path}`);
  if (p.exitCode !== expected) throw new Error(`${name} expected exit ${expected}, observed ${p.exitCode}. Evidence: ${path}`);
  return result;
}
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function link(path: string) {
  const st = lstatSync(path);
  return { path, symlink: st.isSymbolicLink(), target: st.isSymbolicLink() ? readlinkSync(path) : null, identity: `${st.dev}:${st.ino}`, resolved: realpathSync(path) };
}
let summary: Record<string, unknown> = { ok: false, checkout, evidence, home, repo };
try {
  command("omp-version", ["omp", "--version"]); command("git-version", ["git", "--version"]);
  const template = join(outside, "empty-template"); mkdirSync(template);
  command("git-init", ["git", "init", "--template", template, "-q", "-b", "main"]);
  writeFileSync(join(repo, "README"), "Private MCP fixture\n");
  command("git-add", ["git", "add", "README"]); command("git-commit", ["git", "commit", "-qm", "fixture"]);
  command("enable-clone", ["omp", "config", "set", "worktree.clone", "true"]);
  command("clone-setting", ["omp", "config", "get", "worktree.clone", "--json"]);
  mkdirSync(join(repo, ".git/vstack/config"), { recursive: true });
  if (process.platform === "darwin" && existsSync("/usr/bin/git")) {
    command("apple-git-version", ["/usr/bin/git", "--version"]);
    const configBefore = readFileSync(join(repo, ".git/config"), "utf8");
    const apple = command("apple-git-plan", [process.execPath, setup, "plan"], repo, { PATH: "/usr/bin:/bin" });
    const selected = JSON.parse(apple.stdout).git;
    assert(selected.executable === "/usr/bin/git", "Apple Git inspection selected a different executable.");
    summary = { ...summary, apple_git: selected };
    if (!selected.supported) {
      const applePlan = join(outside, "apple-plan.json"); writeFileSync(applePlan, apple.stdout);
      command("apple-git-incomplete", [process.execPath, setup, "apply", "--plan", applePlan], repo, { PATH: "/usr/bin:/bin" }, 2);
      assert(readFileSync(join(repo, ".git/config"), "utf8") === configBefore &&
        !existsSync(join(repo, ".omp/mcp.json")) && !existsSync(join(repo, ".git/vstack/mcp/mcp.json")) &&
        !existsSync(join(repo, ".git/info/exclude")), "Unsupported Apple Git changed Private MCP configuration.");
    }
  } else summary = { ...summary, apple_git: { skipped: "Apple Git is not installed on this platform." } };
  const injector = join(outside, "conflict.sh");
  writeFileSync(injector, '#!/bin/sh\nif test "$VSTACK_MCP_SMOKE_CONFLICT" = 1; then\n  rm -f .omp/mcp.json\n  printf \'{"conflict":"preserve"}\\n\' > .omp/mcp.json\nfi\n');
  command("injector-command", ["git", "config", "--local", "hook.fixture-conflict.command", `sh '${injector.replaceAll("'", "'\\''")}'`]);
  command("injector-event", ["git", "config", "--local", "hook.fixture-conflict.event", "post-checkout"]);
  const plan = command("fresh-plan", [process.execPath, setup, "plan"]); const planPath = join(outside, "approved.json"); writeFileSync(planPath, plan.stdout);
  command("fresh-apply", [process.execPath, setup, "apply", "--plan", planPath]);
  const shared = join(repo, ".git/vstack/mcp/mcp.json"); const main = join(repo, ".omp/mcp.json");
  const freshLink = link(main); assert(freshLink.symlink && freshLink.target === shared, "Main MCP link is not the expected absolute link.");
  const ignored = command("ignored-link", ["git", "check-ignore", ".omp/mcp.json"]); assert(ignored.stdout.includes(".omp/mcp.json"), "MCP link must be ignored before cloning.");
  const future = join(outside, "cloned");
  const clone = command("omp-cloned-creation", ["omp", "worktree", "add", future, "--branch", "cloned"]);
  assert(/Cloned from .+ via .+/.test(clone.stdout + clone.stderr), "Plain checkout is not clone proof. Require Cloned from ... via ... output.");
  const newLink = link(join(future, ".omp/mcp.json")); assert(newLink.symlink && newLink.target === shared, "Cloned worktree MCP link is not the expected absolute link.");
  writeFileSync(main, '{"mcpServers":{},"sharedFixtureValue":"edited-through-existing-link"}\n');
  const edited = [main, shared, join(future, ".omp/mcp.json")].map(path => ({ path, value: JSON.parse(readFileSync(path, "utf8")), link: path === shared ? null : link(path) }));
  assert(edited.every(item => item.value.sharedFixtureValue === "edited-through-existing-link"), "Shared edit did not reach every managed link.");
  const rerun = command("repeat-plan", [process.execPath, setup, "plan"]); writeFileSync(planPath, rerun.stdout);
  command("repeat-apply", [process.execPath, setup, "apply", "--plan", planPath]);
  const conflict = join(outside, "conflict");
  const failed = command("omp-conflict-preservation", ["omp", "worktree", "add", conflict, "--branch", "conflict"], repo, { VSTACK_MCP_SMOKE_CONFLICT: "1" }, 2);
  const conflictPath = join(conflict, ".omp/mcp.json");
  assert(existsSync(join(conflict, ".git")), "Hook failure deleted the created worktree.");
  assert(!lstatSync(conflictPath).isSymbolicLink() && readFileSync(conflictPath, "utf8") === '{"conflict":"preserve"}\n', "Hook conflict did not preserve the regular file.");
  assert((failed.stdout + failed.stderr).includes("conflict"), "Hook failure was not observable.");
  const status = command("tracked-state", ["git", "status", "--porcelain"]); assert(status.stdout === "", "Private setup changed tracked or unexcluded state.");
  summary = { ...summary, ok: true, fresh_link: freshLink, cloned_link: newLink, clone_output: clone.stdout + clone.stderr, shared_edits: edited, conflict: { path: conflictPath, bytes: readFileSync(conflictPath, "utf8"), symlink: false, checkout_preserved: true, exit_code: failed.exit_code }, commands };
} catch (error) {
  summary = { ...summary, error: error instanceof Error ? error.message : String(error), commands }; process.exitCode = 1;
} finally {
  writeFileSync(join(evidence, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  rmSync(outside, { recursive: true, force: true }); rmSync(join(evidence, "data"), { recursive: true, force: true });
}
console.log(JSON.stringify(summary, null, 2));

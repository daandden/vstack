import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

async function run(cwd: string, command: string[]) {
  const p = Bun.spawn(command, { cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return { stdout, stderr, code };
}
async function checked(cwd: string, command: string[]) {
  const result = await run(cwd, command);
  if (result.code) throw new Error(`${command[0]} failed (${result.code}): ${result.stderr.trim() || result.stdout.trim()}`);
  return result.stdout.trim();
}
async function ovnfs(repo: string) {
  const onPath = Bun.which("ovnfs");
  if (onPath) return onPath;
  const omp = Bun.which("omp");
  if (omp) {
    const cfg = await run(repo, [omp, "config", "get", "ovnfs.path"]);
    const value = cfg.stdout.trim().replace(/^"|"$/g, "");
    if (!cfg.code && value && value !== "(not set)") {
      const binary = Bun.which(value.startsWith("~/") ? join(homedir(), value.slice(2)) : value);
      if (binary) return binary;
    }
  }
  throw new Error("ovnfs is required. Run /skill:setup-vstack to install and configure it.");
}

type Record = {
  repo: string; path: string; name: string; purpose: string; backend: "ovnfs" | "omp-wt";
  fallback: boolean; fallbackReason: string | null; cloned: boolean | null;
  branch: string | null; branchCreated: boolean; removed: boolean;
};
const args = process.argv.slice(2);
const command = args.shift();
const flags = new Map<string, string>();
try {
  while (args.length) {
    const key = args.shift()!; const value = args.shift();
    if (!["--repo", "--purpose", "--commit", "--branch", "--new-branch", "--ref", "--record"].includes(key) || !value || flags.has(key)) throw new Error(`Invalid argument ${key}`);
    flags.set(key, value);
  }
  const recordArg = flags.get("--record");
  if (!recordArg || !isAbsolute(recordArg)) throw new Error("--record requires an absolute path outside the checkout");
  const recordPath = resolve(recordArg);
  if (command === "open") {
    if (existsSync(recordPath)) throw new Error(`Record already exists: ${recordPath}`);
    const repo = realpathSync(flags.get("--repo") ?? process.cwd());
    const purpose = flags.get("--purpose");
    if (!purpose || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(purpose)) throw new Error("--purpose requires a checkout slug");
    const branch = flags.get("--new-branch") ?? flags.get("--branch") ?? null;
    const branchCreated = flags.has("--new-branch");
    if (["--commit", "--branch", "--new-branch"].filter(key => flags.has(key)).length !== 1 || (flags.has("--ref") && !branchCreated)) throw new Error("Choose --commit, --branch, or --new-branch with an optional --ref");
    const binary = await ovnfs(repo);
    if (branch) await checked(repo, ["git", "check-ref-format", "--branch", branch]);
    if (branchCreated && !(await run(repo, ["git", "show-ref", "--verify", `refs/heads/${branch}`])).code) throw new Error(`Branch already exists: ${branch}`);
    const ref = branchCreated ? flags.get("--ref") ?? "HEAD" : branch ? `refs/heads/${branch}` : flags.get("--commit")!;
    const revision = await checked(repo, ["git", "rev-parse", "--verify", `${ref}^{commit}`]);
    const name = `vstack-${basename(repo)}-${purpose}-${randomUUID().slice(0, 8)}`;
    const result = await run(repo, [binary, "--json", "new", repo, "--name", name, "--rev", revision]);
    let record: Record;
    if (!result.code) {
      const checkout = JSON.parse(result.stdout).checkout;
      if (checkout?.name !== name || typeof checkout.path !== "string" || !isAbsolute(checkout.path)) throw new Error(`Invalid ovnfs new reply: ${result.stdout}`);
      record = { repo, purpose, name, path: checkout.path, backend: "ovnfs", fallback: false, fallbackReason: null, cloned: null, branch, branchCreated, removed: false };
      if (branch) {
        try {
          await checked(record.path, ["git", "checkout", "--detach", revision]);
          await checked(record.path, ["git", "checkout", "-B", branch, revision]);
          if (branchCreated) await checked(repo, ["git", "branch", branch, revision]);
        } catch (error) {
          await checked(repo, [binary, "--json", "rm", name]);
          throw error;
        }
      }
    } else {
      let base = process.env.OMP_WORKTREE_DIR;
      if (!base) {
        const cfg = await run(repo, ["omp", "config", "get", "worktree.base"]);
        if (!cfg.code && cfg.stdout.trim() !== "(not set)") base = cfg.stdout.trim();
      }
      base = base || join(homedir(), ".omp", "wt");
      base = resolve(base.startsWith("~/") ? join(homedir(), base.slice(2)) : base);
      const path = join(base, name);
      if (existsSync(path)) throw new Error(`Checkout already exists: ${path}`);
      mkdirSync(base, { recursive: true });
      const checkoutArgs = branchCreated ? ["-b", branch!, path, revision] : branch ? [path, branch] : ["--detach", path, revision];
      const stdout = await checked(repo, ["omp", "wt", "add", ...checkoutArgs]);
      record = { repo, purpose, name, path, backend: "omp-wt", fallback: true, fallbackReason: result.stderr.trim() || result.stdout.trim() || `ovnfs new exited ${result.code}`, cloned: /^Cloned from .+ via .+$/m.test(stdout), branch, branchCreated, removed: false };
    }
    mkdirSync(dirname(recordPath), { recursive: true });
    writeFileSync(recordPath, `${JSON.stringify(record)}\n`, { flag: "wx" });
    console.log(JSON.stringify(record));
  } else if (command === "remove") {
    const record = JSON.parse(readFileSync(recordPath, "utf8")) as Record;
    if (record.removed) throw new Error("Checkout is already removed");
    if (record.backend === "ovnfs") await checked(record.repo, [await ovnfs(record.repo), "--json", "rm", record.name]);
    else if (record.backend === "omp-wt") await checked(record.repo, ["git", "worktree", "remove", "--force", record.path]);
    else throw new Error("Unknown checkout backend");
    if (record.branchCreated && record.branch) await checked(record.repo, ["git", "branch", "-D", record.branch]);
    record.removed = true;
    writeFileSync(recordPath, `${JSON.stringify(record)}\n`);
    console.log(JSON.stringify(record));
  } else throw new Error("Usage: worktree.ts open --repo <repo> --purpose <slug> --commit <ref> --record <path>; worktree.ts remove --record <path>");
} catch (error) {
  console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 2;
}

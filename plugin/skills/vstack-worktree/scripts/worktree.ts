import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { resolveOvnfs } from "./ovnfs.ts";
import { declaredInput, readInputs } from "./inputs.ts";

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

type Record = {
  repo: string; path: string; name: string; purpose: string; backend: "ovnfs" | "omp-wt";
  fallback: boolean; fallbackReason: string | null; cloned: boolean | null;
  branch: string | null; branchCreated: boolean; removed: boolean;
  inputs?: string[];
};
const args = process.argv.slice(2);
const command = args.shift();
const flags = new Map<string, string>();
let pending: { repo: string; name: string; path?: string; backend: "ovnfs" | "omp-wt"; binary: string; branch: string | null } | undefined;
try {
  while (args.length) {
    const key = args.shift()!; const value = args.shift();
    if (!["--repo", "--purpose", "--commit", "--branch", "--new-branch", "--ref", "--record", "--inputs"].includes(key) || !value || flags.has(key)) throw new Error(`Invalid argument ${key}`);
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
    const inputs = flags.has("--inputs") ? readInputs(flags.get("--inputs")) : undefined;
    if (inputs && !flags.has("--commit")) throw new Error("--inputs requires a detached --commit checkout.");
    const binary = resolveOvnfs(undefined, repo);
    if (branch) await checked(repo, ["git", "check-ref-format", "--branch", branch]);
    if (branchCreated && !(await run(repo, ["git", "show-ref", "--verify", `refs/heads/${branch}`])).code) throw new Error(`Branch already exists: ${branch}`);
    const ref = branchCreated ? flags.get("--ref") ?? "HEAD" : branch ? `refs/heads/${branch}` : flags.get("--commit")!;
    const revision = await checked(repo, ["git", "rev-parse", "--verify", `${ref}^{commit}`]);
    const prefix = `vstack-${basename(repo)}-${purpose}`.toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 55);
    const name = `${prefix}-${randomUUID().slice(0, 8)}`;
    const result = await run(repo, [binary, "--json", "new", repo, "--name", name]);
    let record: Record;
    if (!result.code) {
      pending = { repo, name, backend: "ovnfs", binary, branch: null };
      const checkout = JSON.parse(result.stdout).checkout;
      if (checkout?.name !== name || typeof checkout.path !== "string" || !isAbsolute(checkout.path)) throw new Error(`Invalid ovnfs new reply: ${result.stdout}`);
      record = { repo, purpose, name, path: checkout.path, backend: "ovnfs", fallback: false, fallbackReason: null, cloned: null, branch, branchCreated, removed: false };
      pending.path = record.path;
      const sourceGit = realpathSync(await checked(repo, ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"]));
      const checkoutGit = realpathSync(await checked(record.path, ["git", "rev-parse", "--absolute-git-dir"]));
      const checkoutCommon = realpathSync(await checked(record.path, ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"]));
      if (checkoutGit !== checkoutCommon || checkoutCommon === sourceGit) throw new Error("ovnfs checkout does not have an independent private Git directory");
      await checked(record.path, ["git", "checkout", "--force", "--detach", revision]);
      if (await checked(record.path, ["git", "rev-parse", "HEAD"]) !== revision) throw new Error("ovnfs checkout is not at the requested revision");
      await checked(record.path, ["git", "diff", "--exit-code", revision, "--"]);
      if ((await run(record.path, ["git", "symbolic-ref", "-q", "HEAD"])).code !== 1) throw new Error("ovnfs checkout is not detached");
      if (branch) {
        await checked(record.path, ["git", "checkout", "-B", branch, revision]);
        if (branchCreated) {
          pending.branch = branch;
          await checked(repo, ["git", "branch", branch, revision]);
        }
      }
    } else {
      const listing = JSON.parse(await checked(repo, [binary, "--json", "ls"]));
      if (!Array.isArray(listing?.checkouts)) throw new Error("Cannot establish checkout origin before fallback");
      if (listing.checkouts.some((checkout: { path: string }) => realpathSync(checkout.path) === repo)) {
        throw new Error(`ovnfs new failed for an ovnfs source; refusing a fallback that could share its private Git directory: ${result.stderr.trim() || result.stdout.trim()}`);
      }
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
      pending = { repo, name, path, backend: "omp-wt", binary, branch: branchCreated ? branch : null };
      const stdout = await checked(repo, ["omp", "wt", "add", ...checkoutArgs]);
      record = { repo, purpose, name, path, backend: "omp-wt", fallback: true, fallbackReason: result.stderr.trim() || result.stdout.trim() || `ovnfs new exited ${result.code}`, cloned: /^Cloned from .+ via .+$/m.test(stdout), branch, branchCreated, removed: false };
    }
    if (inputs) {
      if (record.backend === "omp-wt" && record.cloned !== true) throw new Error("Committed-input preparation requires worktree.clone and /skill:setup-vstack; never install dependencies as a fallback.");
      const tracked = (await checked(record.path, ["git", "ls-files", "-z"])).split("\0").filter(Boolean);
      for (const input of inputs) {
        if (tracked.some(name => name === input || name.startsWith(input + "/"))) throw new Error(`Runtime input ${JSON.stringify(input)} overlaps committed source. Declare only untracked dependency or runtime inputs.`);
        if (!existsSync(resolve(record.path, input))) throw new Error(`Required runtime input ${JSON.stringify(input)} is missing from the created head. Proof is unavailable; check worktree.clone and /skill:setup-vstack.`);
      }
      const paths = await run(record.path, ["git", "ls-files", "--others", "-z", "--", ".", ...inputs.map(input => `:(exclude,literal)${input}`)]);
      if (paths.code) throw new Error(`Cannot enumerate carried inputs: ${paths.stderr.trim()}`);
      const unwanted = paths.stdout.split("\0").filter(Boolean);
      for (const path of unwanted) {
        if (declaredInput(path, inputs)) throw new Error(`Cannot exclude declared input ${JSON.stringify(path)} safely.`);
        const stat = lstatSync(resolve(record.path, path));
        if (path.split("/").some(part => part.toLowerCase() === ".git") || (!stat.isFile() && !stat.isSymbolicLink())) {
          throw new Error(`Untracked nested repository or directory ${JSON.stringify(path)} cannot be cleaned safely.`);
        }
      }
      for (const path of unwanted) {
        unlinkSync(resolve(record.path, path));
        for (let parent = dirname(resolve(record.path, path)); parent !== record.path; parent = dirname(parent)) {
          try { rmdirSync(parent); } catch (error) {
            if (["ENOTEMPTY", "EEXIST", "ENOENT"].includes((error as NodeJS.ErrnoException).code ?? "")) break;
            throw error;
          }
        }
      }
      for (const input of inputs) {
        if (!existsSync(resolve(record.path, input))) throw new Error(`Required runtime input ${JSON.stringify(input)} is unavailable after preparation. Declare the symlink itself, not a path beneath it.`);
      }
      record.inputs = inputs;
    }
    mkdirSync(dirname(recordPath), { recursive: true });
    writeFileSync(recordPath, `${JSON.stringify(record)}\n`, { flag: "wx" });
    pending = undefined;
    console.log(JSON.stringify(record));
  } else if (command === "remove") {
    const record = JSON.parse(readFileSync(recordPath, "utf8")) as Record;
    if (record.removed) throw new Error("Checkout is already removed");
    if (record.backend === "ovnfs") await checked(record.repo, [resolveOvnfs(undefined, record.repo), "--json", "rm", record.name]);
    else if (record.backend === "omp-wt") await checked(record.repo, ["git", "worktree", "remove", "--force", record.path]);
    else throw new Error("Unknown checkout backend");
    if (record.branchCreated && record.branch) await checked(record.repo, ["git", "branch", "-D", record.branch]);
    record.removed = true;
    writeFileSync(recordPath, `${JSON.stringify(record)}\n`);
    console.log(JSON.stringify(record));
  } else throw new Error("Usage: worktree.ts open --repo <repo> --purpose <slug> --commit <ref> --record <path>; worktree.ts remove --record <path>");
} catch (error) {
  const cleanup = pending ? {
    checkout: { name: pending.name, path: pending.path, backend: pending.backend, removed: false, error: null as string | null },
    branch: pending.branch ? { name: pending.branch, removed: false, error: null as string | null } : null,
  } : undefined;
  if (pending && cleanup) {
    try {
      await checked(pending.repo, pending.backend === "ovnfs"
        ? [pending.binary, "--json", "rm", pending.name]
        : ["git", "worktree", "remove", "--force", pending.path!]);
      cleanup.checkout.removed = true;
    } catch (failure) { cleanup.checkout.error = String(failure); }
    if (pending.branch && cleanup.branch) {
      try {
        const exists = await run(pending.repo, ["git", "show-ref", "--verify", `refs/heads/${pending.branch}`]);
        if (!exists.code) await checked(pending.repo, ["git", "branch", "-D", pending.branch]);
        cleanup.branch.removed = true;
      } catch (failure) { cleanup.branch.error = String(failure); }
    }
  }
  console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error), cleanup }));
  process.exitCode = 2;
}

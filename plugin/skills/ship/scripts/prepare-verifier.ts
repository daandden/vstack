import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { declaredInput, readInputs, refuseCommittedOverlap } from "../../vstack-worktree/scripts/inputs.ts";

const record = { verdict: "REFUSED", head_sha: null as string | null, base_sha: null as string | null, patch_id: null as string | null, evidence: [] as string[], notes: [] as string[], proof_steps: [] };
const removed: string[] = [];
function git(repo: string, args: string[], stdin?: Uint8Array): string {
  const p = Bun.spawnSync(["git", "-C", repo, ...args], { stdin, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
  if (p.exitCode) throw new Error(p.stderr.toString().trim() || `git ${args[0]} failed`);
  return new TextDecoder("utf-8", { fatal: true }).decode(p.stdout);
}
function inside(path: string, parent: string): boolean {
  return path === parent || path.startsWith(parent + sep);
}
function safeLeaf(root: string, path: string): string {
  const full = resolve(root, path);
  if (!inside(full, root) || full === root || path.split("/").includes(".git")) throw new Error(`Unsafe Git path ${JSON.stringify(path)}`);
  for (let parent = dirname(full); parent !== root; parent = dirname(parent)) {
    if (!lstatSync(parent).isDirectory() || lstatSync(parent).isSymbolicLink()) throw new Error(`Unsafe parent of ${JSON.stringify(path)}`);
  }
  return full;
}
try {
  const [command, ...args] = process.argv.slice(2);
  const options = new Map<string, string>();
  let requiredInputs: string[] = [];
  for (let i = 0; i < args.length; i += 2) {
    if (!["--repo", "--shared", "--head", "--base", "--record", "--inputs"].includes(args[i]) || !args[i + 1] || options.has(args[i])) throw new Error("Use preflight or clean-head with --repo, --shared, --head, --base, --record, and --inputs.");
    options.set(args[i], args[i + 1]);
  }
  const repo = realpathSync(options.get("--repo") ?? process.cwd());
  const sharedArg = options.get("--shared");
  if (!sharedArg || !isAbsolute(sharedArg)) throw new Error("Shared checkout absolute path is required in the brief.");
  const shared = realpathSync(sharedArg);
  const top = realpathSync(git(repo, ["rev-parse", "--show-toplevel"]).trim());
  if (repo !== top || shared === top) throw new Error("Shared checkout must differ from the verifier's own Git toplevel. Use an isolated eval agent and /skill:setup-vstack.");
  if (realpathSync(git(shared, ["rev-parse", "--show-toplevel"]).trim()) !== shared) throw new Error("Shared checkout must name its Git toplevel.");
  requiredInputs = readInputs(options.get("--inputs"));
  if (command !== "preflight" && command !== "clean-head") throw new Error("Unknown command. Use preflight or clean-head.");
  const recordPath = options.get("--record");
  if (!recordPath || !isAbsolute(recordPath)) throw new Error("Checkout record absolute path is required.");
  const checkout = command === "clean-head" ? JSON.parse(readFileSync(recordPath, "utf8")) : null;
  if (command === "clean-head" && (!checkout || checkout.removed !== false || checkout.branch !== null ||
      typeof checkout.repo !== "string" || realpathSync(checkout.repo) !== repo ||
      typeof checkout.path !== "string" || !isAbsolute(checkout.path))) throw new Error("A live detached checkout record from vstack-worktree is required.");
  if (command === "preflight" && existsSync(recordPath)) throw new Error("Checkout record collision. Never reuse an existing record.");
  const worktree = checkout ? realpathSync(checkout.path) : null;
  if (worktree && (inside(worktree, repo) || inside(worktree, shared) || inside(repo, worktree) || inside(shared, worktree))) throw new Error("Head worktree must be outside the isolated clone and Shared checkout.");
  for (const [key, field] of [["--head", "head_sha"], ["--base", "base_sha"]] as const) {
    const sha = options.get(key);
    if (!sha || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sha) || git(repo, ["rev-parse", "--verify", `${sha}^{commit}`]).trim() !== sha) throw new Error(`A full valid ${key.slice(2)} commit SHA is required.`);
    record[field] = sha;
  }
  refuseCommittedOverlap(git(repo, ["ls-tree", "-r", "-z", "--name-only", "--full-tree", record.head_sha!]).split("\0").filter(Boolean), requiredInputs);
  const diff = git(repo, ["diff", "--no-ext-diff", "--no-textconv", `${record.base_sha}...${record.head_sha}`]);
  record.patch_id = git(repo, ["patch-id", "--stable"], Buffer.from(diff)).trim().split(/\s+/)[0];
  const common = realpathSync(git(repo, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim());
  const sharedCommon = realpathSync(git(shared, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim());
  const excludes = resolve(sharedCommon, "info/exclude");
  if (command === "clean-head") {
    if (!worktree || !existsSync(worktree) || realpathSync(git(worktree, ["rev-parse", "--show-toplevel"]).trim()) !== worktree) throw new Error("Head checkout is not a Git toplevel.");
    const headCommon = realpathSync(git(worktree, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim());
    if (checkout.backend === "omp-wt") {
      if (checkout.cloned !== true) throw new Error("Fallback is a plain checkout. Check worktree.clone and /skill:setup-vstack; do not install dependencies as a fallback.");
      const registered = git(repo, ["worktree", "list", "--porcelain", "-z"]).split("\0").includes(`worktree ${worktree}`);
      if (!registered || headCommon !== common) throw new Error("Head worktree is not registered in the verifier repository.");
    } else if (checkout.backend === "ovnfs") {
      if (headCommon === common || headCommon === sharedCommon) throw new Error("ovnfs head checkout must have a private Git directory.");
    } else throw new Error("Unknown checkout backend.");
    if (git(worktree, ["rev-parse", "HEAD"]).trim() !== record.head_sha || git(worktree, ["rev-parse", "--abbrev-ref", "HEAD"]).trim() !== "HEAD") throw new Error("Head worktree must be detached at the requested head SHA.");
    if (!Array.isArray(checkout.inputs) || JSON.stringify(checkout.inputs) !== JSON.stringify(requiredInputs)) throw new Error("Head checkout must be constructed with the same declared --inputs through vstack-worktree.");
    function validateTracked(worktree: string) {
      git(worktree, ["diff", "--exit-code", "--no-ext-diff", "--no-textconv", "--cached", record.head_sha!, "--"]);
      for (const entry of git(worktree, ["ls-files", "--stage", "-z"]).split("\0").filter(Boolean)) {
        const match = /^(\d+) ([a-f0-9]+) 0\t([\s\S]+)$/.exec(entry);
        if (!match) throw new Error("Unmerged tracked index in head worktree.");
        const [, mode, expected, name] = match;
        if (mode === "160000") throw new Error(`Submodule ${JSON.stringify(name)} cannot establish the head tracked tree. Refuse rather than test carried nested state.`);
        const full = safeLeaf(worktree, name); const stat = lstatSync(full);
        let actual: string;
        if (mode === "120000" && stat.isSymbolicLink()) actual = git(worktree, ["hash-object", "--stdin"], Buffer.from(readlinkSync(full))).trim();
        else if ((mode === "100644" || mode === "100755") && stat.isFile()) {
          if (Boolean(stat.mode & 0o111) !== (mode === "100755")) throw new Error(`Dirty tracked mode at ${JSON.stringify(name)}`);
          actual = git(worktree, ["hash-object", `--path=${name}`, "--", full]).trim();
        } else throw new Error(`Unexpected tracked file type at ${JSON.stringify(name)}`);
        if (actual !== expected) throw new Error(`Dirty tracked content at ${JSON.stringify(name)}`);
      }
    }
    const globalDefault = resolve(process.env.XDG_CONFIG_HOME ?? resolve(homedir(), ".config"), "git/ignore");
    const globalExcludes = resolve(worktree, git(worktree, ["config", "--path", "--default", globalDefault, "--get", "core.excludesFile"]).trim());
    const excludeArgs = ["--exclude-per-directory=.gitignore", ...[globalExcludes, excludes].filter(existsSync).map(path => `--exclude-from=${path}`)];
    const others = () => git(worktree, ["ls-files", "--others", ...excludeArgs, "-z"]).split("\0").filter(Boolean);
    validateTracked(worktree);
    const tracked = new Set(git(worktree, ["ls-files", "-z"]).split("\0").filter(Boolean));
    for (const input of requiredInputs) {
      if (!existsSync(resolve(worktree, input))) throw new Error(`Required runtime input ${JSON.stringify(input)} is missing. Proof is unavailable; check worktree.clone and /skill:setup-vstack.`);
    }
    const runtimeExclusions = [".", ...requiredInputs.map(input => `:(exclude,literal)${input}`)];
    const rawOthers = git(worktree, ["ls-files", "--others", "-z", "--", ...runtimeExclusions]);
    if (rawOthers) {
      const check = Bun.spawnSync(["git", "-C", worktree, "check-ignore", "--verbose", "--non-matching", "-z", "--stdin"], {
        stdin: Buffer.from(rawOthers), env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      });
      if (check.exitCode !== 0 && check.exitCode !== 1) throw new Error(`Cannot validate untracked ignore rules: ${check.stderr.toString()}`);
      const matches = new TextDecoder("utf-8", { fatal: true }).decode(check.stdout).split("\0");
      for (let i = 0; i + 3 < matches.length; i += 4) {
        const source = matches[i];
        const name = matches[i + 3];
        const cloneExcludedIgnore = (name === ".gitignore" || name.endsWith("/.gitignore")) &&
          (source === ".git/info/exclude" || resolve(worktree, source) === resolve(headCommon, "info/exclude"));
        if (cloneExcludedIgnore) throw new Error(`Untracked ignore rules in ${JSON.stringify(name)} are masked by clone-local exclusions. Establish a head tree without those rules.`);
        if (source && !isAbsolute(source) && source !== ".git/info/exclude" && !tracked.has(source)) throw new Error(`Untracked ignore rules in ${JSON.stringify(source)} could hide carried source. Establish a head tree without those rules.`);
      }
    }
    const unwanted = others().filter(name => !declaredInput(name, requiredInputs));
    const unwantedSet = new Set(unwanted);
    const ignoredUndeclared = rawOthers.split("\0").filter(name => name && !unwantedSet.has(name));
    if (ignoredUndeclared.length) throw new Error(`Undeclared ignored input ${JSON.stringify(ignoredUndeclared[0])} could hide carried source. Establish a committed head with only declared runtime inputs.`);
    for (const name of unwanted) {
      const stat = lstatSync(safeLeaf(worktree, name));
      if (!stat.isFile() && !stat.isSymbolicLink()) throw new Error(`Untracked nested repository or directory ${JSON.stringify(name)} cannot be cleaned safely.`);
    }
    for (const name of unwanted) { unlinkSync(safeLeaf(worktree, name)); removed.push(name); }
    validateTracked(worktree);
    if (others().some(name => !declaredInput(name, requiredInputs))) throw new Error("Untracked nonignored inputs remain in the head worktree.");
  }
  console.log(JSON.stringify({ ok: true, head_sha: record.head_sha, base_sha: record.base_sha, patch_id: record.patch_id, repo, shared, worktree, shared_excludes: excludes, inputs: requiredInputs, removed }));
} catch (error) {
  record.notes.push(error instanceof Error ? error.message : String(error));
  if (removed.length) record.notes.push(`Removed untracked paths: ${JSON.stringify(removed)}`);
  console.log(JSON.stringify(record));
  process.exitCode = 2;
}

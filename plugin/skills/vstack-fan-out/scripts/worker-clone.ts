import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

function run(args: string[], env = process.env) {
  const r = Bun.spawnSync(args, { env, stdout: "pipe", stderr: "pipe", timeout: 15_000 });
  if (r.error) throw r.error;
  if (r.exitCode !== 0) throw new Error(r.stderr.toString().trim() || `exit ${r.exitCode}`);
  return r.stdout.toString().trim();
}

function canonical(path: string) {
  try { return realpathSync(path); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    return resolve(path);
  }
}

function ompSourceRoot(repo: string) {
  if (process.platform !== "darwin" || !repo.startsWith("/private/")) return repo;
  const stripped = repo.slice("/private".length);
  try {
    if (realpathSync(repo) === realpathSync(stripped)) return stripped;
  } catch {}
  return repo;
}

function stat(path: string) {
  try { return lstatSync(path); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    return undefined;
  }
}

function defaultBase() {
  if (process.env.OMP_WORKTREE_DIR) return process.env.OMP_WORKTREE_DIR;
  let value = "";
  try { value = run(["omp", "config", "get", "worktree.base"]); } catch {}
  return value && value !== "(not set)" ? value.replace(/^~(?=$|\/)/, homedir()) : join(homedir(), ".omp", "wt");
}

const [command, ...ids] = process.argv.slice(2);
if (command !== "status" || !ids.length || ids.some((id) => !id.trim() || id.startsWith("-"))) {
  console.error("usage: worker-clone.ts status <agent-id>...");
  process.exit(2);
}

try {
  const repo = resolve(run(["git", "rev-parse", "--show-toplevel"]));
  const sourceRepo = ompSourceRoot(repo);
  let base = resolve(defaultBase());
  let baseError: unknown;
  try { base = canonical(base); } catch (e) { baseError = e; }
  let listing: { ok: boolean; paths: string[]; reason?: string };
  let tasks: string[] = [];
  try {
    const entries: unknown = JSON.parse(run(["omp", "worktree", "list", "--json"], { ...process.env, OMP_WORKTREE_DIR: base }));
    if (baseError) throw baseError;
    if (!Array.isArray(entries) || !entries.every((entry) =>
      typeof entry?.path === "string" && entry.path.startsWith("/") &&
      typeof entry.kind === "string" && entry.kind.length > 0
    )) throw new Error("invalid listing");
    listing = { ok: true, paths: entries.map((entry) => canonical(entry.path)) };
    tasks = entries.filter((entry) => entry.kind === "task-isolation").map((entry) => canonical(entry.path));
  } catch (e) {
    listing = { ok: false, paths: [], reason: String(e) };
  }
  const workers = ids.map((id) => {
    const wrapper = join(base, `t${Bun.hash(`${sourceRepo}\0${id}`).toString(16).padStart(16, "0").slice(-9)}`);
    const clone = join(wrapper, "m");
    const worker = { id, clone, state: "unknown", retained: [] as string[], reason: "" };
    try {
      if (!listing.ok) throw new Error(listing.reason);
      let names: string[];
      try { names = readdirSync(base); }
      catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        names = [];
      }
      worker.retained = names.filter((name) => name.startsWith(wrapper.slice(base.length + 1) + ".retained-")).sort().map((name) => join(base, name));
      const original = stat(wrapper);
      for (const path of [...(original ? [wrapper] : []), ...worker.retained]) {
        if (!stat(path)?.isDirectory() || !stat(join(path, "m"))?.isDirectory()) throw new Error(`clone is not a directory: ${path}`);
        const owner = JSON.parse(readFileSync(join(path, ".omp-isolation-owner.json"), "utf8"));
        if (owner?.id !== id) throw new Error(`owner identity does not match: ${path}`);
      }
      for (const name of names) {
        const path = join(base, name);
        if (path === wrapper || worker.retained.includes(path)) continue;
        const marker = join(path, ".omp-isolation-owner.json");
        if (!stat(path)?.isDirectory() || !stat(marker)) continue;
        const owner = JSON.parse(readFileSync(marker, "utf8"));
        if (typeof owner?.id !== "string" || !owner.id) throw new Error(`unrecognized owner: ${path}`);
        if (owner.id === id) throw new Error(`worker found under unsupported naming: ${path}`);
      }
      for (const task of tasks) {
        const path = basename(task) === "m" ? dirname(task) : task;
        const owner = JSON.parse(readFileSync(join(path, ".omp-isolation-owner.json"), "utf8"));
        if (typeof owner?.id !== "string" || !owner.id) throw new Error(`unrecognized listed owner: ${path}`);
        if (owner.id === id && path !== wrapper && !worker.retained.includes(path)) throw new Error(`listed worker uses unsupported naming: ${path}`);
      }
      const listed = listing.paths.some((path) => path === wrapper || path === clone || path.startsWith(wrapper + ".retained-"));
      if (worker.retained.length) {
        worker.state = "retained";
      } else if (original && listed) {
        worker.state = "present";
      } else if (!original && !listed) {
        worker.state = "absent";
      } else {
        throw new Error("disk and listing disagree");
      }
    } catch (e) { worker.reason = String(e); }
    return worker;
  });
  console.log(JSON.stringify({ repo, base, listing, workers }, null, 2));
} catch (e) {
  console.error(String(e));
  process.exit(2);
}

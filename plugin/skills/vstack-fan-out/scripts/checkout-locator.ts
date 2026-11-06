import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";

const TASK_MARKER = ".omp-isolation-owner.json";
const TASK_MOUNTS = ["m", "merged"];
const RETAINED_BACKEND = ".omp-retained-backend.json";

function run(args: string[], env = process.env, timeout = 15_000) {
  const r = Bun.spawnSync(args, { env, stdout: "pipe", stderr: "pipe", timeout });
  if ("error" in r && r.error) throw r.error;
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

export function defaultCheckoutBase(timeout = 15_000) {
  if (process.env.OMP_WORKTREE_DIR) return process.env.OMP_WORKTREE_DIR;
  let value = "";
  try { value = run(["omp", "config", "get", "worktree.base"], process.env, timeout); } catch {}
  return value && value !== "(not set)" ? value.replace(/^~(?=$|\/)/, homedir()) : join(homedir(), ".omp", "wt");
}

export function locateWorkers(repo: string, ids: string[]) {
  const sourceRepo = ompSourceRoot(repo);
  let base = resolve(defaultCheckoutBase());
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
        const owner = JSON.parse(readFileSync(join(path, TASK_MARKER), "utf8"));
        if (owner?.id !== id) throw new Error(`owner identity does not match: ${path}`);
      }
      for (const name of names) {
        const path = join(base, name);
        if (path === wrapper || worker.retained.includes(path)) continue;
        const marker = join(path, TASK_MARKER);
        if (!stat(path)?.isDirectory() || !stat(marker)) continue;
        const owner = JSON.parse(readFileSync(marker, "utf8"));
        if (typeof owner?.id !== "string" || !owner.id) throw new Error(`unrecognized owner: ${path}`);
        if (owner.id === id) throw new Error(`worker found under unsupported naming: ${path}`);
      }
      for (const task of tasks) {
        const path = basename(task) === "m" ? dirname(task) : task;
        const owner = JSON.parse(readFileSync(join(path, TASK_MARKER), "utf8"));
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
  return { repo, base, listing, workers };
}

const lstat = (path: string) => {
  try { return lstatSync(path); } catch { return undefined; }
};
const realpath = (path: string) => {
  try { return realpathSync(path); } catch { return ""; }
};

/** The entries that `omp worktree list --json` reports for the base. Nothing else under the base is a checkout of this run. */
export function cleanupListing(base: string): { ok: boolean; reason?: string; paths: Set<string> } {
  const r = Bun.spawnSync(["omp", "worktree", "list", "--json"], { env: { ...process.env, OMP_WORKTREE_DIR: base }, stdout: "pipe", stderr: "pipe" });
  try {
    if (r.exitCode !== 0) throw new Error(r.stderr.toString().trim() || `exit ${r.exitCode}`);
    const entries: unknown = JSON.parse(r.stdout.toString());
    if (!Array.isArray(entries) || !entries.every((e) => typeof e?.path === "string")) throw new Error("unrecognized output");
    return { ok: true, paths: new Set(entries.map((e: { path: string }) => realpath(e.path) || resolve(e.path))) };
  } catch (e) {
    return { ok: false, reason: `cannot read omp worktree list --json for ${base}: ${(e as Error).message}`, paths: new Set() };
  }
}

type TaskMarker = { pid?: unknown; id?: unknown; startToken?: unknown };

export function taskMarker(entry: string): { file: string; marker?: TaskMarker; gap?: string } {
  const file = join(entry, TASK_MARKER);
  if (!lstat(file)) return { file, gap: `${file} is missing, so the run cannot tell whether a task still owns the sandbox` };
  try {
    return { file, marker: JSON.parse(readFileSync(file, "utf8")) };
  } catch (e) {
    return { file, gap: `${file} is unreadable or malformed (${(e as Error).message})` };
  }
}

/** A retained task workspace on a mount backend needs omp's native teardown, which a plain removal would break. */
function retainedMountGap(entry: string): string | undefined {
  const file = join(entry, RETAINED_BACKEND);
  if (!lstat(file)) return undefined;
  try {
    const backend = JSON.parse(readFileSync(file, "utf8"))?.backend;
    if (!Number.isInteger(backend)) return `${file} is malformed`;
    // omp's IsoBackendKind: Btrfs 1, Overlayfs 4, Projfs 6.
    if ([1, 4, 6].includes(backend)) return `${file} records a mount backend that needs omp's native teardown; remove it with omp worktree clear`;
    return undefined;
  } catch (e) {
    return `${file} is unreadable (${(e as Error).message})`;
  }
}

export interface CheckoutLocation {
  path: string;
  entry: string;
  kind: "worktree" | "task-isolation" | "standalone-clone";
  gaps: string[];
}

export function checkoutLocations(path: string): CheckoutLocation[] | undefined {
  const git = lstat(join(path, ".git"));
  if (git?.isFile()) return [{ path, entry: path, kind: "worktree", gaps: [] }];
  const mounts = TASK_MOUNTS.filter((m) => lstat(join(path, m))?.isDirectory());
  if (lstat(join(path, TASK_MARKER)) || mounts.length > 0) {
    const multiMount = mounts.length > 1 ? `${path} holds both m and merged, and removing one would delete the other; check both before removing the sandbox by hand` : undefined;
    const known = new Set([...TASK_MOUNTS, TASK_MARKER, RETAINED_BACKEND]);
    const artifacts = readdirSync(path).filter((name) => !known.has(name));
    const wrapperGap = artifacts.length > 0 ? `${path} holds unverified files outside its checkout (${artifacts.join(", ")})` : undefined;
    const gaps = [retainedMountGap(path), multiMount, wrapperGap].filter((g): g is string => !!g);
    return mounts.map((mount) => ({ path: join(path, mount), entry: path, kind: "task-isolation", gaps }));
  }
  if (git?.isDirectory()) return [{ path, entry: path, kind: "standalone-clone", gaps: [] }];
  return undefined;
}

export function scanCheckoutLocations(base: string, listing: { ok: boolean; paths: Set<string> }): CheckoutLocation[] {
  const out: CheckoutLocation[] = [];
  if (!lstat(base)?.isDirectory()) return out;
  const listed = (path: string) => !listing.ok || listing.paths.has(path);
  for (const name of readdirSync(base).sort()) {
    const path = join(base, name);
    if (!lstat(path)?.isDirectory()) continue;
    const locations = listed(path) ? checkoutLocations(path) : undefined;
    if (locations) { out.push(...locations); continue; }
    for (const child of readdirSync(path).sort()) {
      const childPath = join(path, child);
      if (listed(childPath) && lstat(childPath)?.isDirectory()) out.push(...(checkoutLocations(childPath) ?? []));
    }
  }
  return out;
}

export function checkoutEntry(path: string, base: string, listing: { ok: boolean; paths: Set<string> }): string | undefined {
  if (!path.startsWith(base + sep)) return undefined;
  const entry = TASK_MOUNTS.includes(basename(path)) && listing.paths.has(dirname(path)) ? dirname(path) : path;
  const relative = entry.slice(base.length + 1).split(sep);
  if (relative.length > 2 || !lstat(entry)?.isDirectory() || (listing.ok && !listing.paths.has(entry))) return undefined;
  return lstat(join(path, ".git")) ? entry : undefined;
}

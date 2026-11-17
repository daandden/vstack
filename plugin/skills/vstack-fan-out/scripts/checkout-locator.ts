import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { resolveOvnfs } from "../../vstack-worktree/scripts/ovnfs.ts";

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

export interface OvnfsCheckout {
  name: string;
  path: string;
  source: string;
}

export function ovnfsListing(): { ok: boolean; checkouts: OvnfsCheckout[]; command?: string; reason?: string } {
  try {
    const binary = resolveOvnfs();
    const value = JSON.parse(run([binary, "--json", "ls"]));
    if (!Array.isArray(value?.checkouts) || !value.checkouts.every((entry: OvnfsCheckout) =>
      entry && typeof entry.name === "string" && entry.name.length > 0 &&
      typeof entry.path === "string" && entry.path.startsWith("/") &&
      typeof entry.source === "string" && entry.source.startsWith("/")
    )) throw new Error("invalid ovnfs listing");
    const checkouts: OvnfsCheckout[] = value.checkouts.map((entry: OvnfsCheckout) => ({
      name: entry.name, path: canonical(entry.path), source: canonical(entry.source),
    }));
    if (new Set(checkouts.map((entry) => entry.name)).size !== checkouts.length) throw new Error("duplicate ovnfs checkout names");
    return { ok: true, checkouts, command: binary };
  } catch (error) {
    return { ok: false, checkouts: [], reason: String(error) };
  }
}

export interface WorkerIdentity {
  name: string;
  path: string;
  record: string;
}

interface WorkerSnapshot {
  repo: string;
  base: string;
  listing: { ok: boolean };
  workers: { id: string; state: string; identity: WorkerIdentity | null }[];
}

export function locateWorkers(repo: string, ids: string[], before?: WorkerSnapshot) {
  const sourceRepo = ompSourceRoot(repo);
  const base = canonical(resolve(defaultCheckoutBase()));
  const listing = ovnfsListing();
  const workers = ids.map((id) => {
    const record = join(base, `t${Bun.hash(`${sourceRepo}\0${id}`).toString(16).padStart(16, "0").slice(-9)}`, ".omp-ovnfs-checkout.json");
    const worker = { id, clone: null as string | null, identity: null as WorkerIdentity | null, state: "unknown", reason: "" };
    try {
      if (!listing.ok) throw new Error(listing.reason);
      if (before) {
        const previous = before.workers?.find((entry) => entry.id === id);
        const identity = previous?.identity;
        if (before.repo !== repo || before.base !== base || before.listing?.ok !== true || previous?.state !== "present" ||
          !identity || typeof identity.name !== "string" || !identity.name.startsWith("omp-") ||
          typeof identity.path !== "string" || !identity.path.startsWith("/") || identity.record !== record) {
          throw new Error("saved status does not prove this worker was present");
        }
        worker.identity = identity;
        worker.clone = identity.path;
        const survivors = listing.checkouts.filter((entry) => entry.name === identity.name || entry.path === identity.path);
        if (!survivors.length && !stat(identity.record)) {
          worker.state = "absent";
          return worker;
        }
        throw new Error("worker checkout or run record survives release; retain the worker");
      }
      if (!stat(record)?.isFile()) throw new Error(`worker run record is missing or not a file: ${record}`);
      const value = JSON.parse(readFileSync(record, "utf8"));
      if (typeof value?.checkout !== "string" || !value.checkout.startsWith("omp-") || typeof value.command !== "string" || !value.command) throw new Error(`invalid worker run record: ${record}`);
      const checkout = listing.checkouts.find((entry) => entry.name === value.checkout);
      if (!checkout) throw new Error(`worker checkout is not listed: ${value.checkout}`);
      if (checkout.source !== canonical(repo)) throw new Error(`worker checkout source does not match: ${checkout.source}`);
      if (!stat(checkout.path)?.isDirectory()) throw new Error(`worker checkout is not a directory: ${checkout.path}`);
      worker.clone = checkout.path;
      worker.identity = { name: checkout.name, path: checkout.path, record };
      worker.state = "present";
    } catch (error) { worker.reason = String(error); }
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

export function ompWorktreeListing(base: string): { ok: boolean; reason?: string; paths: Set<string>; parentRepos: Map<string, string> } {
  const r = Bun.spawnSync(["omp", "worktree", "list", "--json"], { env: { ...process.env, OMP_WORKTREE_DIR: base }, stdout: "pipe", stderr: "pipe" });
  try {
    if (r.exitCode !== 0) throw new Error(r.stderr.toString().trim() || `exit ${r.exitCode}`);
    const entries: unknown = JSON.parse(r.stdout.toString());
    if (!Array.isArray(entries) || !entries.every((e) => typeof e?.path === "string")) throw new Error("unrecognized output");
    const paths = new Set<string>();
    const parentRepos = new Map<string, string>();
    for (const entry of entries) {
      const path = realpath(entry.path) || resolve(entry.path);
      paths.add(path);
      if (typeof entry.parentRepo === "string" && entry.parentRepo.startsWith("/")) {
        parentRepos.set(path, realpath(entry.parentRepo) || resolve(entry.parentRepo));
      }
    }
    return { ok: true, paths, parentRepos };
  } catch (e) {
    return { ok: false, reason: `cannot read omp worktree list --json for ${base}: ${(e as Error).message}`, paths: new Set(), parentRepos: new Map() };
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
  kind: "worktree" | "task-isolation" | "standalone-clone" | "excluded";
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

export function scanCheckoutLocations(base: string, listing: { ok: boolean; reason?: string; paths: Set<string> }): CheckoutLocation[] {
  const out: CheckoutLocation[] = [];
  if (listing.ok) {
    for (const path of [...listing.paths].sort()) {
      const exclude = (reason: string) => out.push({ path, entry: path, kind: "excluded", gaps: [reason] });
      const depth = path.startsWith(base + sep) ? path.slice(base.length + 1).split(sep).length : 0;
      if (depth < 1 || depth > 2) {
        exclude(`native omp entry is outside the supported cleanup base or layout: ${path}`);
        continue;
      }
      if (!lstat(path)?.isDirectory()) {
        exclude(`native omp entry directory is missing or not a directory: ${path}`);
        continue;
      }
      try {
        const locations = checkoutLocations(path);
        if (locations?.length) out.push(...locations);
        else exclude(`native omp entry has no supported checkout layout; retain its metadata and contents: ${path}`);
      } catch (error) {
        exclude(`cannot inspect native omp entry layout: ${path}: ${(error as Error).message}`);
      }
    }
    return out;
  }
  if (!lstat(base)?.isDirectory()) return out;
  for (const name of readdirSync(base).sort()) {
    const path = join(base, name);
    if (!lstat(path)?.isDirectory()) continue;
    const locations = checkoutLocations(path);
    if (locations) { out.push(...locations); continue; }
    for (const child of readdirSync(path).sort()) {
      const childPath = join(path, child);
      if (lstat(childPath)?.isDirectory()) out.push(...(checkoutLocations(childPath) ?? []));
    }
  }
  const gap = listing.reason || `cannot read native omp listing for ${base}; local discovery cannot confirm cleanup eligibility`;
  for (const location of out) location.gaps = [gap, ...location.gaps];
  return out;
}

export function checkoutEntry(path: string, base: string, listing: { ok: boolean; paths: Set<string> }): string | undefined {
  if (!path.startsWith(base + sep)) return undefined;
  const entry = TASK_MOUNTS.includes(basename(path)) && listing.paths.has(dirname(path)) ? dirname(path) : path;
  const relative = entry.slice(base.length + 1).split(sep);
  if (relative.length > 2 || !lstat(entry)?.isDirectory() || (listing.ok && !listing.paths.has(entry))) return undefined;
  return lstat(join(path, ".git")) ? entry : undefined;
}

export interface OvnfsCleanupLocation {
  path: string;
  entry: string;
  kind: "ovnfs";
  gaps: string[];
  name: string;
  source: string;
  record?: string;
}

export function cleanupOvnfsLocations(
  base: string,
  listing: ReturnType<typeof ovnfsListing>,
  sourcePaths: Set<string>,
): OvnfsCleanupLocation[] {
  const records = new Map<string, { file: string; gap?: string }>();
  if (lstat(base)?.isDirectory()) {
    for (const name of readdirSync(base)) {
      const file = join(base, name, ".omp-ovnfs-checkout.json");
      if (!lstat(file)?.isFile()) continue;
      try {
        const value = JSON.parse(readFileSync(file, "utf8"));
        if (typeof value.checkout !== "string") continue;
        const gap = typeof value.command !== "string" || !value.command ? `invalid ovnfs run record: ${file}` : undefined;
        records.set(value.checkout, { file, gap });
      } catch {}
    }
  }
  const known = new Set([...sourcePaths].map(canonical));
  let changed: boolean;
  do {
    changed = false;
    for (const checkout of listing.checkouts) {
      if (known.has(checkout.source) && !known.has(checkout.path)) {
        known.add(checkout.path);
        changed = true;
      }
    }
  } while (changed);
  return listing.checkouts.map((checkout) => {
    const record = records.get(checkout.name);
    const belongs = known.has(checkout.source);
    return {
      path: checkout.path, entry: checkout.path, kind: "ovnfs" as const, name: checkout.name,
      source: checkout.source, record: record?.file,
      gaps: [
        ...(!checkout.name.startsWith("omp-") ? [`ovnfs checkout is outside omp cleanup scope; retain named and verifier checkouts: ${checkout.name}`] : []),
        ...(!belongs ? [`cannot establish ovnfs checkout origin: ${checkout.source}`] : []),
        ...(!lstat(checkout.path)?.isDirectory() ? [`ovnfs checkout directory is missing: ${checkout.path}`] : []),
        ...(record?.gap ? [record.gap] : []),
      ],
    };
  });
}

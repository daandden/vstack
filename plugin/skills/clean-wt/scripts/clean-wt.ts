import { closeSync, existsSync, lstatSync, openSync, readdirSync, readFileSync, readlinkSync, readSync, realpathSync, rmSync } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { checkoutEntry, checkoutInstance, cleanupOvnfsLocations, defaultCheckoutBase, ompWorktreeListing, ovnfsListing, scanCheckoutLocations, taskMarker, type CheckoutLocation, type OvnfsCleanupLocation } from "../../vstack-fan-out/scripts/checkout-locator.ts";
import { isOvnfsRemote } from "../../vstack-worktree/scripts/ovnfs.ts";
import { fingerprintKind, makeFingerprint, type Fingerprint } from "./fingerprint.ts";
import { requireSummaryRecordsVersion } from "./summary-records.ts";

function usage(message: string): never {
  process.stderr.write(`clean-wt: ${message}\n`);
  process.exit(2);
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      base: { type: "string" },
      sessions: { type: "string", multiple: true },
      "session-owners": { type: "string" },
      approve: { type: "string", multiple: true },
      target: { type: "string", multiple: true },
      "prepare-source": { type: "string", multiple: true },
      "source-facts": { type: "string" },
      verify: { type: "string" },
      progress: { type: "boolean" },
    },
  });
} catch (e) {
  usage((e as Error).message);
}
const { values, positionals } = parsed;
const command = positionals[0];
if (command !== "inventory" && command !== "remove") usage("the first argument must be inventory or remove");
if (command === "inventory" && (positionals.length > 1 || values.approve)) usage("inventory takes only the evidence flags");
if (values.verify !== undefined && (command !== "inventory" || values.target || values["prepare-source"] || values["source-facts"])) {
  usage("--verify requires inventory and cannot accompany integration evidence flags");
}
if (command === "remove" && (values.target || values["prepare-source"] || values["source-facts"])) usage("integration evidence options belong to inventory");
if (values.target && (!values["source-facts"] || values["prepare-source"])) usage("--target requires --source-facts and cannot accompany --prepare-source");
if (values["source-facts"] && !values.target) usage("--source-facts requires --target");

function run(cmd: string[], cwd?: string, env?: Record<string, string | undefined>): { code: number; out: string; err: string } {
  const r = Bun.spawnSync(cmd, { cwd, env, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

function requireGit(result: ReturnType<typeof run>, operation: string): string {
  if (result.code !== 0) throw new Error(result.err.trim() || result.out.trim() || `git ${operation} exit ${result.code}`);
  return result.out;
}

function progress(phase: string, details: Record<string, unknown>) {
  if (values.progress) process.stderr.write(`${JSON.stringify({ phase, ...details })}\n`);
}

const DEFAULT_READER_WIDTH = 8;
const MAX_READER_WIDTH = 32;
const CONTENT_BUFFER_BYTES = 64 * 1024;
const readerWidth = values.verify !== undefined || values["prepare-source"] ? DEFAULT_READER_WIDTH : configuredReaderWidth();

function configuredReaderWidth(): number {
  const configured = process.env.VSTACK_CLEAN_WT_READER_WIDTH;
  if (configured === undefined) return DEFAULT_READER_WIDTH;
  const width = Number(configured);
  if (!/^[1-9][0-9]*$/.test(configured) || width > MAX_READER_WIDTH) {
    usage(`VSTACK_CLEAN_WT_READER_WIDTH must be an integer from 1 to ${MAX_READER_WIDTH}`);
  }
  return width;
}

const contentReads = { files: 0, bytes: 0 };
const contentBuffers: Buffer[] = [];
let openContentFiles = 0;
let peakOpenContentFiles = 0;
let reportedBytes = 0;
function countContentBytes(file: string, bytes: number) {
  contentReads.bytes += bytes;
  if (values.progress && contentReads.bytes - reportedBytes >= (1 << 26)) {
    progress("contents", { stage: "reading", path: file, ...contentReads });
    reportedBytes = contentReads.bytes;
  }
}

function reportReader() {
  progress("reader", {
    stage: "complete",
    width: readerWidth,
    open_file_limit: readerWidth,
    buffer_byte_limit: readerWidth * CONTENT_BUFFER_BYTES,
    peak_open_files: peakOpenContentFiles,
    peak_buffer_bytes: contentBuffers.length * CONTENT_BUFFER_BYTES,
    ...contentReads,
  });
}

async function readInOrder<T>(items: T[], read: (item: T, slot: number, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  async function worker(slot: number) {
    while (next < items.length) {
      const index = next++;
      await read(items[index], slot, index);
    }
  }
  const settled = await Promise.allSettled(Array.from({ length: Math.min(readerWidth, items.length) }, (_, slot) => worker(slot)));
  for (const result of settled) if (result.status === "rejected") throw result.reason;
}

const lstat = (p: string) => {
  try {
    return lstatSync(p);
  } catch {
    return undefined;
  }
};

const realpath = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return "";
  }
};



const requestedBase = resolve(values.base ?? defaultCheckoutBase(0));
const base = realpath(requestedBase) || requestedBase;
const ownersDir = resolve(values["session-owners"] ?? join(homedir(), ".omp", "run", "session-owners"));
const sessionRoots = (values.sessions ?? [join(process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".omp", "agent"), "sessions")]).map((p) => resolve(p));
const inside = (p: string, dir: string) => p === dir || p.startsWith(dir + sep);


interface SessionHeader {
  id: string;
  cwd: string;
  file: string;
  dirs: string[];
  previous: string[];
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function readHeader(p: string, buf: Buffer): SessionHeader | undefined {
  let n = 0;
  try {
    const fd = openSync(p, "r");
    n = readSync(fd, buf, 0, buf.length, 0);
    closeSync(fd);
  } catch {
    return undefined;
  }
  for (const line of buf.subarray(0, n).toString("utf8").split("\n").slice(0, 3)) {
    let rec: { type?: unknown; id?: unknown; cwd?: unknown; additionalDirectories?: unknown; previousSessionFiles?: unknown };
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    if (rec.type === "session" && typeof rec.id === "string" && typeof rec.cwd === "string") {
      const dirs = [rec.cwd, ...strings(rec.additionalDirectories)].flatMap((d) => [...new Set([d, realpath(d) || d])]);
      return { id: rec.id, cwd: realpath(rec.cwd) || rec.cwd, file: p, dirs, previous: strings(rec.previousSessionFiles) };
    }
  }
  return undefined;
}

const sessionDirectories = new Map<string, { stamp: string; children: string[]; files: string[] }>();
const headersByFile = new Map<string, SessionHeader>();

function readSessions(): SessionHeader[] {
  const buf = Buffer.alloc(1 << 16);
  const update = (file: string) => {
    const header = readHeader(file, buf);
    if (header) headersByFile.set(file, header);
    else headersByFile.delete(file);
  };
  const walk = (dir: string) => {
    const st = lstat(dir);
    if (!st?.isDirectory()) {
      const old = sessionDirectories.get(dir);
      for (const file of old?.files ?? []) headersByFile.delete(file);
      for (const child of old?.children ?? []) walk(child);
      sessionDirectories.delete(dir);
      return;
    }
    const stamp = `${st.ino}:${st.mtimeMs}:${st.ctimeMs}`;
    let cached = sessionDirectories.get(dir);
    if (cached?.stamp !== stamp) {
      let names: string[];
      try {
        names = readdirSync(dir);
      } catch {
        return;
      }
      const children: string[] = [];
      const files: string[] = [];
      for (const name of names) {
        const file = join(dir, name);
        const stat = lstat(file);
        if (stat?.isDirectory()) children.push(file);
        else if (stat?.isFile() && name.endsWith(".jsonl")) {
          files.push(file);
          update(file);
        }
      }
      for (const file of cached?.files ?? []) if (!files.includes(file)) headersByFile.delete(file);
      for (const child of cached?.children ?? []) if (!children.includes(child)) walk(child);
      cached = { stamp, children, files };
      sessionDirectories.set(dir, cached);
    }
    for (const child of cached.children) walk(child);
  };
  for (const root of sessionRoots) walk(root);
  return [...headersByFile.values()];
}

function discoverHolderSessions(pids: number[]): SessionHeader[] {
  const r = run(["lsof", "-a", "-p", pids.join(","), "-Fn"]);
  const files = new Set(r.out.split("\n").filter((l) => l.startsWith("n") && l.endsWith(".jsonl")).map((l) => l.slice(1)));
  const buf = Buffer.alloc(1 << 16);
  for (const file of files) {
    if (!readHeader(file, buf)) continue;
    const root = dirname(file);
    if (!sessionRoots.some((existing) => inside(root, existing))) sessionRoots.push(root);
  }
  return readSessions();
}

/** The lock path of omp's session lease for an id: plain ids name the file, other ids are hashed first. */
function leasePath(id: string): string {
  const name = /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : `h-${Bun.hash.wyhash(id).toString(16).padStart(16, "0")}`;
  return `${resolve(ownersDir, name)}.lock`;
}

/** omp's Linux file lock binds an abstract Unix socket named after two xxHash64 hashes of the lock path. */
function abstractLockName(lockPath: string): string {
  const high = Bun.hash.xxHash64(lockPath, 0x4f4d502d4c4f434bn).toString(16).padStart(16, "0");
  const low = Bun.hash.xxHash64(lockPath, 0x50492d46494c454cn).toString(16).padStart(16, "0");
  return `omp-file-lock-${high}${low}`;
}

interface Leases {
  ok: boolean;
  reason?: string;
  held: Map<string, number | null>;
  /** Held lease names, with their holder pid, that no readable session header names. Linux leases cannot be listed, so this stays empty there. */
  unknown: Map<string, number | null>;
}

function heldLeases(ids: string[], native: ReturnType<typeof run> | undefined): Leases {
  const held = new Map<string, number | null>();
  const unknown = new Map<string, number | null>();
  if (process.platform === "linux") {
    let table: string;
    try {
      table = readFileSync("/proc/net/unix", "utf8");
    } catch (e) {
      return { ok: false, reason: `cannot read /proc/net/unix: ${(e as Error).message}`, held, unknown };
    }
    const bound = new Set<string>();
    for (const line of table.split("\n")) {
      const name = line.trim().split(/\s+/)[7];
      if (name?.startsWith("@")) bound.add(name.slice(1));
    }
    for (const id of ids) if (bound.has(abstractLockName(leasePath(id)))) held.set(id, null);
    return { ok: true, held, unknown };
  }
  if (process.platform === "win32") return { ok: false, reason: "omp's session leases are named mutexes on Windows, which this script cannot read", held, unknown };
  const r = native!;
  if (r.code !== 0 && r.code !== 1) return { ok: false, reason: `lsof failed on ${ownersDir}: ${r.err.trim() || `exit ${r.code}`}`, held, unknown };
  const wanted = new Map(ids.map((id) => [leasePath(id), id]));
  let pid: number | null = null;
  let descriptor = "";
  for (const line of r.out.split("\n")) {
    if (line.startsWith("p")) { pid = Number(line.slice(1)); descriptor = ""; }
    else if (line.startsWith("f")) descriptor = line.slice(1);
    else if (line.startsWith("n") && descriptor !== "cwd" && dirname(line.slice(1)) === ownersDir && line.endsWith(".lock")) {
      const id = wanted.get(line.slice(1));
      if (id !== undefined) held.set(id, pid);
      else unknown.set(basename(line.slice(1), ".lock"), pid);
    }
  }
  return { ok: true, held, unknown };
}


const ownSession = process.env.PI_SESSION_ID;
let sessionHeaders: SessionHeader[] = [];
let leases: Leases = { ok: false, held: new Map(), unknown: new Map() };
let cwds: { ok: boolean; reason?: string; list: ProcessCwd[] } = { ok: false, list: [] };
let listing: ReturnType<typeof ompWorktreeListing> = { ok: false, paths: new Set(), parentRepos: new Map() };
let ovnfs: ReturnType<typeof ovnfsListing> = { ok: false, checkouts: [] };
let ovnfsLocations: OvnfsCleanupLocation[] = [];
let nativeLocations: CheckoutLocation[] = [];
const sources = new Map<string, Source | null | Error>();
const plainInventory = command === "inventory" && !values.target && !values["prepare-source"] && values.verify === undefined;
const startingInstances = new Map<string, Instance>();
let evidenceGaps: string[] = [];

/** Why the run cannot trust a free lease: it must see its own session's held lease and session file, and every held lease's session. */
function leaseDetectionGap(): string | undefined {
  if (!leases.ok) return leases.reason;
  if (!ownSession) return "PI_SESSION_ID is not set, so the run cannot prove it sees session leases; run clean-wt from an omp session";
  if (!leases.held.has(ownSession)) return `the running session's own lease (${ownSession}) does not show as held under ${ownersDir}`;
  if (!sessionHeaders.some((s) => s.id === ownSession)) return `the running session ${ownSession} has no session file under ${sessionRoots.join(", ")}, so other sessions may be missing too; supply its readable session directory with --sessions`;
  const missing = [...leases.held.keys()].filter((id) => !sessionHeaders.some((s) => s.id === id));
  if (missing.length > 0) return `live sessions have no readable current header (${missing.join(", ")}), so their checkouts are unknown; restore header access or supply their session directories with --sessions`;
  if (leases.unknown.size > 0) return `live sessions hold leases with no readable session file (${[...leases.unknown.keys()].join(", ")}), so their checkouts are unknown; inspect lease-holder processes (${[...new Set(leases.unknown.values())].join(", ")}) and supply their readable session directories with --sessions; retain unowned checkouts until ownership is resolved`;
  return undefined;
}

function gatherOwnership(): string | undefined {
  try {
    progress("evidence", { stage: "session headers" });
    sessionHeaders = readSessions();
    progress("evidence", { stage: "live ownership" });
    // lsof unions file selections unless -a is supplied, so one scan covers both ownership guards.
    const native = process.platform === "linux" || process.platform === "win32"
      ? undefined
      : run(["lsof", "-d", "cwd", "+d", ownersDir, "-Fpcfn"]);
    leases = heldLeases([...sessionHeaders.map((s) => s.id), ...(ownSession ? [ownSession] : [])], native);
    const buf = Buffer.alloc(1 << 16);
    sessionHeaders = sessionHeaders.flatMap((header) => {
      if (!leases.held.has(header.id)) return [header];
      const current = readHeader(header.file, buf);
      if (current) headersByFile.set(header.file, current);
      else headersByFile.delete(header.file);
      return current ? [current] : [];
    });
    const known = new Set(sessionHeaders.map((s) => s.id));
    const holders = [...new Set([...leases.unknown.values(), ...[...leases.held].filter(([id]) => !known.has(id)).map(([, pid]) => pid)])].filter((p): p is number => p !== null);
    if (holders.length > 0) {
      for (const h of discoverHolderSessions(holders)) {
        const name = basename(leasePath(h.id), ".lock");
        if (known.has(h.id) || (!leases.held.has(h.id) && !leases.unknown.has(name))) continue;
        known.add(h.id);
        sessionHeaders.push(h);
        leases.held.set(h.id, leases.held.get(h.id) ?? leases.unknown.get(name) ?? null);
        leases.unknown.delete(name);
      }
    }
    cwds = processCwds(native);
    return undefined;
  } catch (error) {
    leases = { ok: false, held: new Map(), unknown: new Map() };
    cwds = { ok: false, list: [] };
    return `cannot establish shared ownership evidence: ${String(error)}`;
  }
}

function refreshLocalCheckoutEvidence() {
  progress("evidence", { stage: "native listing" });
  listing = ompWorktreeListing(base);
  if (plainInventory) {
    nativeLocations = scanCheckoutLocations(base, listing);
    for (const location of nativeLocations) startingInstances.set(location.path, observeInstance(location));
  }
  const ownershipFailure = gatherOwnership();
  progress("evidence", { stage: "ovnfs listing" });
  ovnfs = ovnfsListing();
  if (!plainInventory) nativeLocations = scanCheckoutLocations(base, listing);
  const paths = new Set<string>();
  for (const { path } of [...nativeLocations, ...ovnfs.checkouts]) {
    if (paths.has(path)) throw new Error(`cannot account for duplicate checkout path: ${path}`);
    paths.add(path);
  }
  if (plainInventory) {
    for (const { path } of ovnfs.checkouts) startingInstances.set(path, observeInstance({ path, kind: "ovnfs" }));
  }
  sources.clear();
  const sourcePaths = new Set<string>();
  for (const { source } of ovnfs.checkouts) {
    const result = sourceResult(source);
    if (result && !(result instanceof Error)) sourcePaths.add(source);
  }
  ovnfsLocations = cleanupOvnfsLocations(base, ovnfs, sourcePaths);
  evidenceGaps = [ownershipFailure, leaseDetectionGap(), cwds.ok ? undefined : cwds.reason, listing.ok ? undefined : listing.reason, ovnfs.ok ? undefined : ovnfs.reason].filter((g): g is string => !!g);
  progress("evidence", { stage: "complete", blockers: evidenceGaps });
}

interface Owner {
  type: "session" | "task" | "process";
  id?: string;
  pid?: number | null;
  file?: string;
  command?: string;
}

type Kind = "linked-worktree" | "orphaned-worktree" | "task-isolation" | "standalone-clone" | "ovnfs" | "excluded";
type Verdict = "owned" | "uncertain" | "unused";
type State = "clean" | "dirty" | "unknown" | "not checked";
type Outcome = "inspected" | "protected" | "contents deferred" | "inspection failed" | "vanished" | "replaced";
type Failure = { stage: "layout" | "source resolution" | "inspection"; error: string };

interface Checkout {
  path: string;
  entry: string;
  kind: Kind;
  outcome: Outcome;
  instance_id?: string;
  failure?: Failure;
  verdict: Verdict;
  reasons: string[];
  owners: Owner[];
  state: State;
  changes: Record<string, string[]>;
  unique_history: Tip[];
  branch: string | null;
  fingerprint: "" | Fingerprint;
  sessions: SessionLink[];
  moved_sessions: SessionLink[];
  integration?: Integration;
  automatic?: boolean;
  source_git_dir?: string;
  git_common_dir?: string;
  branch_ref?: string;
  ovnfs?: { name: string; source: string; record?: string };
}

/** An owner keeps a checkout. Without one, any missing evidence keeps it as uncertain. */
function verdictOf(owners: Owner[], gaps: string[]): { verdict: Verdict; reasons: string[] } {
  if (owners.length > 0) return { verdict: "owned", reasons: [] };
  return gaps.length > 0 ? { verdict: "uncertain", reasons: gaps } : { verdict: "unused", reasons: [] };
}

interface ProcessCwd {
  pid: number;
  command: string;
  cwd: string;
}

function processCwds(native: ReturnType<typeof run> | undefined): { ok: boolean; reason?: string; list: ProcessCwd[] } {
  const list: ProcessCwd[] = [];
  if (process.platform === "linux") {
    for (const name of readdirSync("/proc")) {
      if (!/^\d+$/.test(name)) continue;
      try {
        const cwd = readlinkSync(`/proc/${name}/cwd`);
        const command = readFileSync(`/proc/${name}/comm`, "utf8").trim();
        list.push({ pid: Number(name), command, cwd });
      } catch {
      }
    }
    return { ok: true, list };
  }
  if (process.platform === "win32") return { ok: false, reason: "process working directories are not readable on Windows", list };
  const r = native!;
  if (!r.out && r.code !== 0) return { ok: false, reason: `lsof could not list process working directories: ${r.err.trim() || `exit ${r.code}`}`, list };
  let cur: Partial<ProcessCwd> = {};
  let descriptor = "";
  for (const line of r.out.split("\n")) {
    if (line.startsWith("p")) { cur = { pid: Number(line.slice(1)) }; descriptor = ""; }
    else if (line.startsWith("c")) cur.command = line.slice(1);
    else if (line.startsWith("f")) descriptor = line.slice(1);
    else if (line.startsWith("n") && descriptor === "cwd" && cur.pid) list.push({ pid: cur.pid, command: cur.command ?? "", cwd: line.slice(1) });
  }
  return { ok: true, list };
}


/** A process's start token, read the way omp records it in a task marker, or null when the OS cannot report it. */
function processStartToken(pid: number): string | null {
  if (process.platform === "linux") {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      const token = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
      return token || null;
    } catch {
      return null;
    }
  }
  const r = run(["ps", "-o", "lstart=", "-p", String(pid)]);
  return r.code === 0 && r.out.trim() ? r.out.trim() : null;
}

/** Only "no such process" counts as dead: EPERM means a live process this user cannot signal. */
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/** The live task that owns a sandbox, as omp's marker records it. A pid wearing a different start token is recycled. */
function taskOwner(entry: string): { owner?: Owner; gap?: string } {
  const { file, marker, gap } = taskMarker(entry);
  if (gap) return { gap };
  const { pid, id, startToken } = marker ?? {};
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) return { gap: `${file} names no valid pid` };
  if (!pidAlive(pid)) return {};
  if (typeof startToken === "string" && startToken.length > 0) {
    const current = processStartToken(pid);
    if (current !== null && current !== startToken) return {};
  }
  return { owner: { type: "task", id: typeof id === "string" ? id : undefined, pid } };
}

interface Source {
  commonDir: string;
  checkout: string | null;
}

function mainCheckout(commonDir: string): string | null {
  const lines = requireGit(run(["git", `--git-dir=${commonDir}`, "worktree", "list", "--porcelain"]), "worktree list").split("\n");
  return lines[0]?.startsWith("worktree ") && !lines.includes("bare") ? lines[0].slice("worktree ".length) : null;
}

function sourceOf(path: string, entry: string, kind: Kind, visiting: Set<string>): Source | null {
  const parent = listing.parentRepos.get(entry);
  if (parent && !inside(parent, entry)) return sourceRepository(parent, visiting);
  if (kind === "linked-worktree") {
    const commonDir = requireGit(run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], path), "rev-parse --git-common-dir").trim();
    const main = commonDir ? mainCheckout(commonDir) : null;
    return commonDir && lstat(commonDir)?.isDirectory() && !inside(commonDir, entry)
      ? { commonDir, checkout: main === path ? null : main } : null;
  }
  if (kind === "task-isolation") {
    for (const s of sessionHeaders.filter((h) => inside(h.cwd, entry))) {
      let parent: SessionHeader | undefined = s;
      while (parent && inside(parent.cwd, entry)) {
        const file: string = `${parent.file.slice(0, parent.file.lastIndexOf(sep))}.jsonl`;
        parent = sessionHeaders.find((h): boolean => h.file === file);
      }
      if (!parent || !existsSync(parent.cwd)) continue;
      const top = requireGit(run(["git", "rev-parse", "--show-toplevel"], parent.cwd), "rev-parse --show-toplevel").trim();
      if (!top) continue;
      const source = sourceRepository(top, visiting);
      return source ? { commonDir: source.commonDir, checkout: top } : null;
    }
  }
  let objects: string;
  try {
    objects = readFileSync(join(path, ".git", "objects", "info", "alternates"), "utf8").split("\n")[0].trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (!objects) return null;
  const commonDir = resolve(join(path, ".git", "objects"), objects, "..");
  if (!lstat(commonDir)?.isDirectory() || inside(commonDir, entry)) return null;
  const sourceGitDir = realpath(commonDir);
  if (!sourceGitDir) return null;
  const checkout = [...ovnfs.checkouts, ...nativeLocations].find(({ path }) => {
    try {
      const git = join(path, ".git");
      const metadata = lstat(git);
      const gitdir = metadata?.isDirectory() ? git : metadata?.isFile() ? registeredGitDir(path).gitdir : "";
      return !!gitdir && realpath(gitdir) === sourceGitDir;
    } catch {
      return false;
    }
  })?.path ?? mainCheckout(commonDir);
  if (!checkout) return null;
  const top = requireGit(run(["git", "rev-parse", "--show-toplevel"], checkout), "rev-parse --show-toplevel").trim();
  if (!top) return null;
  const source = sourceRepository(top, visiting);
  return source ? { commonDir: source.commonDir, checkout: top } : null;
}

function sourceRepository(path: string, visiting = new Set<string>()): Source | null {
  const result = sourceResult(path, visiting);
  if (result instanceof Error) throw result;
  return result;
}

function sourceResult(path: string, visiting = new Set<string>()): Source | null | Error {
  path = realpath(path) || resolve(path);
  const previous = sources.get(path);
  if (previous !== undefined) return previous;
  if (visiting.has(path)) return null;
  visiting.add(path);
  try {
    const source = resolveSource(path, visiting);
    sources.set(path, source);
    return source;
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    sources.set(path, failure);
    return failure;
  } finally {
    visiting.delete(path);
  }
}

function resolveSource(path: string, visiting: Set<string>): Source | null {
  let source: Source | null = null;
  const mounted = ovnfs.checkouts.find((checkout) => inside(path, checkout.path));
  const native = nativeLocations.find((location) => inside(path, location.path));
  if (mounted) source = sourceRepository(mounted.source, visiting);
  else if (native) {
    if (native.layoutError) throw native.layoutError;
    if (native.kind !== "excluded") {
      source = sourceOf(native.path, native.entry, native.kind === "worktree" ? "linked-worktree" : native.kind, visiting);
    }
  } else if (lstat(path)?.isDirectory()) {
    const result = run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir", "--is-bare-repository"], path);
    const [commonDir, bare] = requireGit(result, "rev-parse --git-common-dir").trim().split("\n");
    const checkout = bare === "true" ? null
      : requireGit(run(["git", "rev-parse", "--show-toplevel"], path), "rev-parse --show-toplevel").trim();
    source = { commonDir, checkout };
  }
  if (!source) {
    for (const header of sessionHeaders.filter((header) => header.cwd === path)) {
      const parent = sessionHeaders.find((candidate) => candidate.file === `${dirname(header.file)}.jsonl`);
      if (parent) source = sourceRepository(parent.cwd, visiting);
      if (source) break;
    }
  }
  return source;
}

const DISPOSABLE_IGNORED_NAMES = new Set([
  "node_modules", ".venv", "build", "out", "dist", "target", ".gradle", ".nuxt", ".output",
  ".next", ".wrangler", "__pycache__", ".pytest_cache", ".DS_Store", ".idea", ".settings",
  ".project", ".classpath", ".factorypath",
]);

function isDisposableIgnoredName(name: string): boolean {
  return DISPOSABLE_IGNORED_NAMES.has(name) || name.endsWith(".tsbuildinfo");
}

function expandIgnored(root: string, rel: string, paths: string[]) {
  if (lstat(join(root, rel))?.isDirectory()) {
    let names: string[];
    try {
      names = readdirSync(join(root, rel)).sort();
    } catch {
      paths.push(rel);
      return;
    }
    for (const name of names) {
      if (!isDisposableIgnoredName(name)) expandIgnored(root, `${rel}/${name}`, paths);
    }
  } else paths.push(rel);
}


/** Where a link points: its path inside its own checkout when it stays inside, else its absolute target. */
function linkTarget(root: string, rel: string, text: string): string {
  const target = resolve(dirname(join(root, rel)), text);
  return inside(target, root) ? `checkout:${target.slice(root.length)}` : target;
}

type IgnoredPreservation = readonly [result: "same" | "unique" | "unverified", source?: string];

async function compareIgnored(path: string, ref: string | null, rel: string, target: ReturnType<typeof lstat>, content: string, slot: number): Promise<IgnoredPreservation> {
  if (!ref || !target || content === "missing" || content === "unverified") return ["unverified"];
  try {
    const file = join(ref, rel);
    const source = lstat(file);
    if (target.isSymbolicLink()) {
      if (!source?.isSymbolicLink()) return ["unique"];
      const preserved = linkTarget(ref, rel, readlinkSync(file));
      return [linkTarget(path, rel, content.slice("link:".length)) === preserved ? "same" : "unique", preserved];
    }
    if (!target.isFile()) return ["unverified"];
    if (!source?.isFile() || target.size !== source.size) return ["unique"];
    const preserved = await contentStamp(file, source, slot);
    if (preserved === "missing" || preserved === "unverified") return ["unverified"];
    return [content === preserved ? "same" : "unique", preserved];
  } catch {
    return ["unverified"];
  }
}

interface WorkState {
  state: "clean" | "dirty" | "unknown";
  changes: Record<string, string[]>;
  stamp: unknown[] | null;
}

async function contentStamp(file: string, st: ReturnType<typeof lstat>, slot: number): Promise<string> {
  let handle: FileHandle | undefined;
  try {
    if (!st) return "missing";
    if (st.isSymbolicLink()) return `link:${readlinkSync(file)}`;
    if (!st.isFile()) return "unverified";
    const hash = createHash("sha256");
    handle = await open(file, "r");
    contentReads.files++;
    peakOpenContentFiles = Math.max(peakOpenContentFiles, ++openContentFiles);
    const buf = contentBuffers[slot] ??= Buffer.allocUnsafe(CONTENT_BUFFER_BYTES);
    for (;;) {
      const { bytesRead } = await handle.read(buf, 0, buf.length, null);
      if (bytesRead === 0) break;
      countContentBytes(file, bytesRead);
      hash.update(buf.subarray(0, bytesRead));
    }
    return hash.digest("hex");
  } catch {
    return "unverified";
  } finally {
    if (handle) {
      try {
        await handle.close();
      } finally {
        openContentFiles--;
      }
    }
  }
}

function workingEntry(path: string, rel: string): string | undefined {
  try {
    const st = lstatSync(join(path, rel));
    if (!st.isFile() && !st.isSymbolicLink()) return undefined;
    const hash = st.isSymbolicLink()
      ? Bun.spawnSync(["git", "hash-object", "--stdin"], { cwd: path, stdin: Buffer.from(readlinkSync(join(path, rel))), stdout: "pipe", stderr: "pipe" })
      : Bun.spawnSync(["git", "--literal-pathspecs", "hash-object", "--no-filters", "--", rel], { cwd: path, stdout: "pipe", stderr: "pipe" });
    if (hash.exitCode !== 0) return undefined;
    const mode = st.isSymbolicLink() ? "120000" : st.mode & 0o111 ? "100755" : "100644";
    return `${mode} ${hash.stdout.toString().trim()}`;
  } catch {
    return undefined;
  }
}

async function workState(path: string, ref: string | null): Promise<WorkState> {
  const status = requireGit(run(["git", "status", "--porcelain=v2", "-z", "--untracked-files=all", "--ignored"], path), "status");
  const changes: Record<string, string[]> = { staged: [], unstaged: [], unmerged: [], untracked: [], ignored_unique: [], ignored_unverified: [] };
  const ignoredTokens: number[] = [];
  const tokens = status.split("\0");
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith("! ")) ignoredTokens.push(i);
    else if (t.startsWith("? ")) changes.untracked.push(t.slice(2));
    else if (t.startsWith("1 ") || t.startsWith("2 ")) {
      const fields = t.split(" ");
      const file = fields.slice(t.startsWith("1 ") ? 8 : 9).join(" ");
      if (fields[1][0] !== ".") changes.staged.push(file);
      if (fields[1][1] !== ".") changes.unstaged.push(file);
      if (t.startsWith("2 ")) {
        const original = tokens[++i];
        if (fields[1][0] !== ".") changes.staged.push(original);
        if (fields[1][1] !== ".") changes.unstaged.push(original);
      }
    } else if (t.startsWith("u ")) changes.unmerged.push(t.split(" ").slice(10).join(" "));
  }
  if (plainInventory && (changes.staged.length || changes.unstaged.length || changes.unmerged.length || changes.untracked.length)) {
    for (const key of Object.keys(changes)) if (changes[key].length === 0) delete changes[key];
    return { state: "dirty", changes, stamp: null };
  }
  const ignored: string[] = [];
  const discarded = new Set<number>();
  for (const i of ignoredTokens) {
    const rel = tokens[i].slice(2).replace(/\/$/, "");
    const before = ignored.length;
    if (!rel.split("/").some(isDisposableIgnoredName)) expandIgnored(path, rel, ignored);
    if (ignored.length === before) discarded.add(i);
  }
  const stampedStatus = discarded.size ? tokens.filter((_, i) => !discarded.has(i)).join("\0") : status;
  const flags = requireGit(run(["git", "ls-files", "-v", "-z"], path), "ls-files");
  const hidden = flags.split("\0").filter((line) => line[0] === "S" || /^[a-z]/.test(line)).map((line) => line.slice(2));
  let hiddenUnknown = false;
  if (hidden.length > 0) {
    const index = requireGit(run(["git", "--literal-pathspecs", "ls-files", "--stage", "-z", "--", ...hidden], path), "ls-files --stage");
    const entries = new Map(index.split("\0").filter(Boolean).map((line) => {
      const at = line.indexOf("\t");
      const [mode, sha, stage] = line.slice(0, at).split(" ");
      return [line.slice(at + 1), stage === "0" ? `${mode} ${sha}` : "unmerged"];
    }));
    for (const rel of hidden) {
      const actual = workingEntry(path, rel);
      if (!actual || !entries.has(rel)) {
        (changes.unreadable ??= []).push(rel);
        hiddenUnknown = true;
      } else if (actual !== entries.get(rel) && !changes.unstaged.includes(rel)) changes.unstaged.push(rel);
    }
  }
  const ignoredPaths = new Set(ignored);
  const paths = [...new Set([...Object.values(changes).flat(), ...ignored, ...hidden])];
  const evidence = {
    stamps: new Array<unknown>(paths.length + 2),
    preservation: new Array<IgnoredPreservation | undefined>(paths.length),
  };
  evidence.stamps[0] = stampedStatus;
  evidence.stamps[1] = flags;
  await readInOrder(paths, async (rel, slot, index) => {
    const file = join(path, rel);
    const st = lstat(file);
    const content = await contentStamp(file, st, slot);
    const preservation = ignoredPaths.has(rel) ? await compareIgnored(path, ref, rel, st, content, slot) : undefined;
    evidence.stamps[index + 2] = st ? [rel, st.size, st.mtimeMs, st.ctimeMs, st.ino, st.mode, content, preservation] : [rel, preservation];
    evidence.preservation[index] = preservation;
  });
  for (let index = 0; index < paths.length; index++) {
    const preservation = evidence.preservation[index];
    if (!preservation) continue;
    const [result] = preservation;
    if (result === "unique") changes.ignored_unique.push(paths[index]);
    else if (result === "unverified") changes.ignored_unverified.push(paths[index]);
  }
  const listed = Object.values(changes).flat();
  for (const k of Object.keys(changes)) if (changes[k].length === 0) delete changes[k];
  return { state: hiddenUnknown ? "unknown" : listed.length > 0 ? "dirty" : "clean", changes, stamp: evidence.stamps };
}

interface Tip {
  ref: string;
  sha: string;
}

function unreached(gitArgs: string[], tips: Tip[], not: string[]): Set<string> {
  const shas = [...new Set(tips.map((t) => t.sha))];
  if (shas.length === 0) return new Set();
  const check = Bun.spawnSync(["git", ...gitArgs, "cat-file", "--batch-check=%(objectname) %(objecttype)"], { stdin: Buffer.from(`${shas.join("\n")}\n`), stdout: "pipe", stderr: "pipe" });
  if (check.exitCode !== 0) throw new Error(check.stderr.toString().trim() || `git cat-file exit ${check.exitCode}`);
  const present = check.stdout.toString().split("\n").filter((l) => l.endsWith(" commit")).map((l) => l.split(" ")[0]);
  const missing = shas.filter((s) => !present.includes(s));
  if (present.length === 0) return new Set(missing);
  const listed = new Set(requireGit(run(["git", ...gitArgs, "rev-list", ...present, "--not", ...not]), "rev-list").split("\n"));
  return new Set([...missing, ...present.filter((s) => listed.has(s))]);
}

// git matches `--exclude` before `--remotes` against the name below `refs/remotes/`, and before `--all` against the full ref.
const REMOTES_EXCEPT_OVNFS = ["--exclude=ovnfs/*", "--remotes"];
const ALL_REFS_EXCEPT_OVNFS = ["--exclude=refs/remotes/ovnfs/*", "--all"];

function uniqueHistory(path: string, kind: Kind, source: Source, head: string, detached: boolean): Tip[] {
  if (kind === "linked-worktree") {
    if (!detached) return [];
    const tips = [{ ref: "HEAD", sha: head }];
    const lost = unreached(["-C", path], tips, ["--branches", "--tags", ...REMOTES_EXCEPT_OVNFS, ...stashShas(["-C", path])]);
    return tips.filter((t) => lost.has(t.sha));
  }
  const tips: Tip[] = requireGit(run(["git", "for-each-ref", "--format=%(if)%(*objectname)%(then)%(*objectname)%(else)%(objectname)%(end) %(refname)", "refs/heads", "refs/tags"], path), "for-each-ref")
    .split("\n")
    .filter(Boolean)
    .map((l) => ({ sha: l.slice(0, l.indexOf(" ")), ref: l.slice(l.indexOf(" ") + 1) }));
  if (detached) tips.push({ ref: "HEAD", sha: head });
  stashShas(["-C", path]).forEach((sha, i) => tips.push({ ref: `stash@{${i}}`, sha }));
  const lost = unreached(["-C", path], tips, REMOTES_EXCEPT_OVNFS);
  const inSource = unreached([`--git-dir=${source.commonDir}`], tips.filter((t) => lost.has(t.sha)), ALL_REFS_EXCEPT_OVNFS);
  const sourceStashes = new Set(stashShas([`--git-dir=${source.commonDir}`]));
  return tips.filter((t) => inSource.has(t.sha) && !sourceStashes.has(t.sha));
}

function stashShas(gitArgs: string[]): string[] {
  // An exact glob expands to no revisions when the stash ref is absent.
  return requireGit(run(["git", ...gitArgs, "log", "-g", "--format=%H", "--glob=refs/stas[h]", "--"]), "log refs/stash").split("\n").filter(Boolean);
}

function treeStamp(root: string, rel = ""): unknown[] {
  const st = lstat(join(root, rel));
  if (!st) return [];
  const own = [rel, st.size, st.mtimeMs, st.mode];
  if (!st.isDirectory()) return [own];
  return [own, ...readdirSync(join(root, rel)).sort().flatMap((n) => treeStamp(root, rel ? `${rel}/${n}` : n))];
}

function registeredGitDir(path: string): { gitdir: string; exists: boolean } {
  const text = readFileSync(join(path, ".git"), "utf8");
  const m = /^gitdir:\s*(.+?)\s*$/m.exec(text);
  const gitdir = m ? resolve(path, m[1]) : "";
  return { gitdir, exists: !!gitdir && !!lstat(gitdir)?.isDirectory() };
}

/** The session dir names omp gives a cwd: home-relative, temp-relative, or absolute. */
function sessionDirNames(path: string): string[] {
  const enc = (s: string) => s.replace(/[/\\:]/g, "-");
  const names = [`--${enc(path.replace(/^[/\\]/, ""))}--`];
  for (const [root, prefix] of [[realpath(tmpdir()), "-tmp-"], [realpath(homedir()), "-"]] as const) {
    if (root && inside(path, root)) names.push(path === root ? prefix.replace(/-$/, "") || "-" : `${prefix}${enc(path.slice(root.length + 1))}`);
  }
  return names;
}

interface SessionLink {
  id: string;
  file: string;
  live: boolean;
}

function sessionLinks(entry: string): { sessions: SessionLink[]; moved: SessionLink[] } {
  const link = (s: SessionHeader): SessionLink => ({ id: s.id, file: s.file, live: leases.held.has(s.id) });
  const here = sessionHeaders.filter((s) => s.dirs.some((d) => inside(d, entry)));
  const names = new Set(sessionDirNames(entry));
  const moved = sessionHeaders.filter((s) => !here.includes(s) && s.previous.some((f) => names.has(basename(dirname(f)))));
  return { sessions: here.map(link), moved: moved.map(link) };
}

function inspectOrphan(path: string, gitdir: string, gaps: string[], inspection: Inspection): Checkout {
  const { sessions, moved } = sessionLinks(path);
  const owners = ownersOf(path, [], sessions);
  const { verdict, reasons } = verdictOf(owners, [...evidenceGaps, ...gaps]);
  const fingerprint = verdict !== "unused" ? "" : makeFingerprint(inspection.kind, treeStamp(path));
  const unreadable = [`the repo no longer has this worktree's registration (${gitdir || "no gitdir line"}), so git cannot read its changes`];
  return { path, entry: path, kind: "orphaned-worktree", outcome: "protected", verdict, reasons, owners, state: "unknown", changes: { unreadable }, unique_history: [], branch: null, fingerprint, sessions, moved_sessions: moved };
}

function ownersOf(entry: string, entryOwners: Owner[], sessions: SessionLink[]): Owner[] {
  const processOwners = cwds.list.filter((p) => inside(p.cwd, entry)).map((p): Owner => ({ type: "process", pid: p.pid, command: p.command }));
  return [...entryOwners, ...processOwners, ...sessions.filter((s) => s.live).map((s): Owner => ({ type: "session", id: s.id, file: s.file, pid: leases.held.get(s.id) ?? null }))];
}

interface RemoteDefault {
  source_git_dir: string;
  remote: string;
  url: string;
  ref: string;
  sha: string;
}

interface Integration {
  status: "verified" | "unresolved";
  reason?: string;
  default?: RemoteDefault;
  ref?: string;
  paths?: string[];
}

type RemoteFact = RemoteDefault | string;
type Inspection = { kind: "discovery" } | { kind: "targeted"; remoteFact: (commonDir: string) => RemoteFact };

const discoveryInspection: Inspection = { kind: "discovery" };
const remoteDefaults = new Map<string, RemoteFact>();
const targetedInspection: Inspection = {
  kind: "targeted",
  remoteFact: (commonDir) => remoteDefaults.get(commonDir) ?? "no prepared remote-default facts were supplied for this source",
};

function remoteDefault(commonDir: string): RemoteFact {
  const cached = remoteDefaults.get(commonDir);
  const git = ["git", `--git-dir=${commonDir}`];
  const remotes = run([...git, "remote"]).out.trim().split("\n").filter((name) => name && !isOvnfsRemote(name));
  const remote = remotes.includes("origin") ? "origin" : remotes.length === 1 ? remotes[0] : undefined;
  let fact: RemoteDefault | string = "the source has no unambiguous remote";
  if (remote) {
    const url = run([...git, "remote", "get-url", remote]).out.trim();
    const advertised = run([...git, "ls-remote", "--symref", remote, "HEAD"]);
    const ref = /^ref: (refs\/heads\/[^\t\n]+)\tHEAD$/m.exec(advertised.out)?.[1];
    const sha = /^([0-9a-f]{40,64})\tHEAD$/m.exec(advertised.out)?.[1];
    if (advertised.code !== 0 || !url || !ref || !sha) fact = "the source remote HEAD could not be verified";
    else if (typeof cached === "object" && cached.url === url && cached.remote === remote && cached.ref === ref && cached.sha === sha) fact = cached;
    else {
      const fetch = run([...git, "fetch", "--no-tags", "--no-write-fetch-head", remote, sha]);
      fact = fetch.code === 0 ? { source_git_dir: commonDir, remote, url, ref, sha } : "the advertised remote default commit could not be fetched";
    }
  }
  remoteDefaults.set(commonDir, fact);
  return fact;
}

function integrated(path: string, commonDir: string, work: WorkState, fact: RemoteFact): Integration {
  if (typeof fact === "string") return { status: "unresolved", reason: fact };
  const unresolved = (reason: string): Integration => ({ status: "unresolved", default: fact, ref: fact.ref, reason });
  if (run(["git", `--git-dir=${commonDir}`, "remote", "get-url", fact.remote]).out.trim() !== fact.url) return unresolved("the source remote identity changed after preparation");
  if (work.state !== "dirty" || work.changes.unmerged?.length) return unresolved("the tracked contents cannot be verified");
  if (run(["git", "cat-file", "-e", `${fact.sha}^{commit}`], path).code !== 0) {
    if (run(["git", "fetch", "--no-tags", "--no-write-fetch-head", fact.url, fact.sha], path).code !== 0) return unresolved("the remote default commit is unavailable in this checkout");
  }
  const base = run(["git", "merge-base", "HEAD", fact.sha], path);
  if (base.code !== 0) return unresolved("the checkout and remote default have no verified common base");
  const committed = run(["git", "diff", "--no-renames", "--name-only", "-z", base.out.trim(), "HEAD"], path);
  if (committed.code !== 0) return unresolved("the checkout's committed changes could not be read");
  const paths = [...new Set([...committed.out.split("\0").filter(Boolean), ...(work.changes.staged ?? []), ...(work.changes.unstaged ?? []), ...(work.changes.untracked ?? [])])].sort();
  if (paths.length === 0) return unresolved("there are no changed files to compare");
  const tree = run(["git", "--literal-pathspecs", "ls-tree", "-z", fact.sha, "--", ...paths], path);
  const index = run(["git", "--literal-pathspecs", "ls-files", "--stage", "-z", "--", ...paths], path);
  if (tree.code !== 0 || index.code !== 0) return unresolved("the remote tree or checkout index could not be read");
  const remoteEntries = new Map(tree.out.split("\0").filter(Boolean).map((line) => {
    const at = line.indexOf("\t");
    const name = line.slice(at + 1);
    const [mode, , sha] = line.slice(0, at).split(" ");
    return [name, `${mode} ${sha}`];
  }));
  const indexEntries = new Map(index.out.split("\0").filter(Boolean).map((line) => {
    const at = line.indexOf("\t");
    const [mode, sha, stage] = line.slice(0, at).split(" ");
    return [line.slice(at + 1), stage === "0" ? `${mode} ${sha}` : "unmerged"];
  }));
  for (const rel of paths) {
    const expected = remoteEntries.get(rel);
    if (work.changes.staged?.includes(rel) && indexEntries.get(rel) !== expected) return unresolved(`the staged version of ${rel} differs from the remote default`);
    const st = lstat(join(path, rel));
    if (!st) {
      if (expected !== undefined) return unresolved(`${rel} is missing locally but exists on the remote default`);
      continue;
    }
    const actual = workingEntry(path, rel);
    if (!actual || actual !== expected) return unresolved(`${rel} differs from the remote default`);
  }
  return { status: "verified", default: fact, ref: fact.ref, paths };
}

async function inspect(path: string, entry: string, kind: Kind, source: Source | null, instance: string, entryOwners: Owner[], entryGaps: string[], inspection: Inspection, ovnfsIdentity?: Checkout["ovnfs"]): Promise<Checkout> {
  progress("checkout", { stage: "ownership", path });
  const branch: string | null = null;
  const { sessions, moved } = sessionLinks(entry);
  const owners = ownersOf(entry, entryOwners, sessions);
  const { verdict, reasons } = verdictOf(owners, [...evidenceGaps, ...entryGaps]);
  const common: Pick<Checkout, "path" | "entry" | "kind" | "verdict" | "reasons" | "owners" | "branch" | "sessions" | "moved_sessions" | "git_common_dir" | "branch_ref"> = { path, entry, kind, verdict, reasons, owners, branch, sessions, moved_sessions: moved };
  if (verdict !== "unused" || !source) {
    progress("checkout", { stage: "protected", path, blockers: reasons, owners });
    return { ...common, outcome: "protected", state: "not checked", changes: {}, unique_history: [], fingerprint: "" };
  }
  const symbolicRef = run(["git", "symbolic-ref", "-q", "HEAD"], path);
  const headRef = symbolicRef.code === 1 && !symbolicRef.err ? null : requireGit(symbolicRef, "symbolic-ref HEAD").trim();
  common.branch = headRef?.replace(/^refs\/heads\//, "") ?? null;
  if (kind === "linked-worktree" && headRef !== null) common.branch_ref = headRef;
  const headArgs = kind === "linked-worktree" ? ["--path-format=absolute", "--git-common-dir", "HEAD"] : ["HEAD"];
  const revision = requireGit(run(["git", "rev-parse", ...headArgs], path), "rev-parse HEAD").trimEnd();
  const headOffset = revision.lastIndexOf("\n") + 1;
  if (kind === "linked-worktree" && headOffset) common.git_common_dir = revision.slice(0, headOffset - 1);
  const head = revision.slice(headOffset);
  progress("checkout", { stage: "contents", path });
  const before = { ...contentReads };
  const work = await workState(path, source.checkout);
  progress("contents", { stage: "complete", path, files: contentReads.files - before.files, bytes: contentReads.bytes - before.bytes });
  progress("checkout", { stage: "history", path });
  const unique_history = uniqueHistory(path, kind, source, head, common.branch === null);
  if (work.stamp === null) {
    progress("checkout", { stage: "complete", path, state: "dirty", automatic: false, blockers: unique_history.map(tip => `unique history: ${tip.ref}`) });
    return { ...common, outcome: "contents deferred", state: "dirty", changes: work.changes, unique_history, fingerprint: "", automatic: false, source_git_dir: source.commonDir };
  }
  const remoteFact = inspection.kind === "targeted" ? inspection.remoteFact(source.commonDir) : undefined;
  if (remoteFact !== undefined && work.state === "dirty") progress("checkout", { stage: "integration", path });
  const integration = remoteFact !== undefined && work.state === "dirty" ? integrated(path, source.commonDir, work, remoteFact) : undefined;
  const artifacts = ["ignored_unique", "ignored_unverified", "unmerged"].some((key) => work.changes[key]?.length);
  const automatic = unique_history.length === 0 && (work.state === "clean" || (integration?.status === "verified" && !artifacts));
  const fingerprint = makeFingerprint(inspection.kind, [
    instance, head, common.branch, work.stamp, unique_history, remoteFact, integration,
    ovnfsIdentity, ovnfsIdentity?.record ? await contentStamp(ovnfsIdentity.record, lstat(ovnfsIdentity.record), 0) : null,
  ]);
  const source_git_dir = source.commonDir;
  progress("checkout", { stage: "complete", path, state: work.state, automatic, blockers: [...(work.changes.unreadable ?? []), ...(integration?.reason ? [integration.reason] : []), ...unique_history.map(tip => `unique history: ${tip.ref}`)] });
  return { ...common, outcome: work.state === "unknown" ? "protected" : "inspected", state: work.state, changes: work.changes, unique_history, fingerprint, integration, automatic, source_git_dir };
}

function removeTree(entry: string) {
  const st = lstat(entry);
  if (!st?.isDirectory() || !inside(entry, base) || entry === base) throw new Error(`refusing to remove ${entry}: not a dir under ${base}`);
  rmSync(entry, { recursive: true });
}

type Location = CheckoutLocation | OvnfsCleanupLocation;
type Instance = { id: string } | { error: unknown };

function observeInstance({ path, kind }: { path: string; kind: Location["kind"] | Kind }): Instance {
  try {
    if (kind === "excluded") {
      const directory = lstatSync(path);
      if (!directory.isDirectory() || !directory.ino) throw new Error(`cannot establish checkout identity: ${path}`);
      return { id: `${directory.dev}:${directory.ino}:${directory.birthtimeMs}` };
    }
    return { id: checkoutInstance(path) };
  } catch (error) {
    return { error };
  }
}

async function inspectLocation(location: Location, inspection: Inspection): Promise<Checkout> {
  if ("layoutError" in location && location.layoutError) return failedInspection(location, "layout", location.layoutError);
  const instance = startingInstances.get(location.path) ?? observeInstance(location);
  if ("error" in instance) return failedInspection(location, "layout", instance.error);
  let stage: Failure["stage"] = "source resolution";
  let checkout: Checkout;
  try {
    checkout = await inspectLocatedCheckout(location, instance.id, inspection, (next) => { stage = next; });
  } catch (error) {
    checkout = failedInspection(location, stage, error);
  }
  return plainInventory ? checkout : verifyInstance(location, instance, checkout);
}

function verifyInstance(location: Location, before: Instance, checkout: Checkout): Checkout {
  if ("error" in before) return checkout;
  const after = observeInstance(location);
  if ("error" in after) return checkout.failure ? checkout : failedInspection(location, "layout", after.error);
  if (before.id === after.id) return plainInventory ? { ...checkout, instance_id: before.id } : checkout;
  progress("checkout", { stage: "replaced", path: location.path });
  return protectedLocation(location, "replaced", ["a different checkout instance now occupies the listed path"]);
}

function failedInspection(location: Location, stage: Failure["stage"], error: unknown): Checkout {
  const { path } = location;
  const failure = { stage, error: String(error) };
  progress("checkout", { stage: "inspection failed", path, failure });
  return protectedLocation(location, "inspection failed", [`${stage}: ${failure.error}`], failure);
}

function protectedLocation(location: Location, outcome: "replaced" | "inspection failed", reasons: string[], failure?: Failure): Checkout {
  const { path, entry, kind } = location;
  return {
    path, entry, kind: kind === "worktree" ? "linked-worktree" : kind, outcome, failure,
    verdict: "uncertain", reasons, owners: [], state: "not checked", changes: {}, unique_history: [],
    fingerprint: "", automatic: false, branch: null, sessions: [], moved_sessions: [],
    ...(kind === "ovnfs" ? { ovnfs: { name: location.name, source: location.source, record: location.record } } : {}),
  };
}

async function inspectLocatedCheckout(location: Location, instance: string, inspection: Inspection, atStage: (stage: Failure["stage"]) => void): Promise<Checkout> {
  const { path, entry, kind } = location;
  atStage("layout");
  const registered = kind === "worktree" ? registeredGitDir(path) : undefined;
  atStage("source resolution");
  const dependents = ovnfs.checkouts.filter((checkout) => inside(checkout.source, entry));
  const source = kind === "excluded" || (registered?.exists === false && !listing.parentRepos.has(entry))
    ? null : sourceRepository(path);
  const gaps = [
    ...(kind === "ovnfs" ? location.gaps.map(({ message }) => message) : location.gaps),
    ...(kind !== "excluded" && !source ? [`cannot establish source repository for ${path}: missing or unreadable parentRepo, source chain, session ancestry, or Git alternates`] : []),
    ...(dependents.length ? [`source for ovnfs checkouts: ${dependents.map((checkout) => checkout.name).join(", ")}`] : []),
  ];
  atStage("inspection");
  if (kind === "ovnfs") {
    const recordEntry = location.record ? dirname(location.record) : undefined;
    const task = recordEntry && lstat(join(recordEntry, ".omp-isolation-owner.json")) ? taskOwner(recordEntry) : {};
    const ovnfsIdentity = { name: location.name, source: location.source, record: location.record };
    const checkout = await inspect(path, entry, kind, source, instance, task.owner ? [task.owner] : [], [...gaps, ...(task.gap ? [task.gap] : [])], inspection, ovnfsIdentity);
    checkout.ovnfs = ovnfsIdentity;
    return checkout;
  }
  if (kind === "worktree") {
    return registered!.exists ? inspect(path, entry, "linked-worktree", source, instance, [], gaps, inspection) : inspectOrphan(path, registered!.gitdir, gaps, inspection);
  }
  if (kind === "task-isolation") {
    const { owner, gap } = taskOwner(entry);
    return inspect(path, entry, kind, source, instance, owner ? [owner] : [], [...(gap ? [gap] : []), ...gaps], inspection);
  }
  return inspect(path, entry, kind, source, instance, [], gaps, inspection);
}

function missingPath(path: string): boolean {
  try {
    lstatSync(path);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}

async function scan(): Promise<Checkout[]> {
  const locations = [...nativeLocations, ...ovnfsLocations];
  const inspected = [];
  for (const location of locations) inspected.push(await inspectLocation(location, discoveryInspection));
  const checkouts = inspected.map((checkout, i) => verifyInstance(locations[i], startingInstances.get(checkout.path)!, checkout));
  if (!checkouts.some((checkout) => checkout.failure)) return checkouts;

  progress("evidence", { stage: "confirm absence" });
  const nativeAfter = ompWorktreeListing(base);
  const ovnfsAfter = ovnfsListing();
  const pathsByName = new Map(ovnfsAfter.checkouts.map(({ name, path }) => [name, path]));
  const namesByPath = new Map(ovnfsAfter.checkouts.map(({ name, path }) => [path, name]));
  return checkouts.map((checkout, i) => {
    const name = checkout.ovnfs?.name;
    const currentPath = name && pathsByName.get(name);
    const currentName = namesByPath.get(checkout.path);
    if ((currentPath && currentPath !== checkout.path) || (currentName && name && currentName !== name)) {
      progress("checkout", { stage: "replaced", path: checkout.path });
      return protectedLocation(locations[i], "replaced", ["a different checkout instance now occupies the listed path or ovnfs name"]);
    }
    if (!checkout.failure) return checkout;
    if (!nativeAfter.ok || !ovnfsAfter.ok || nativeAfter.paths.has(checkout.entry) || nativeAfter.paths.has(checkout.path) ||
      currentName || currentPath || !missingPath(checkout.path)) return checkout;
    progress("checkout", { stage: "vanished", path: checkout.path });
    return { ...checkout, outcome: "vanished", reasons: ["the checkout is absent from the fresh listings and disk"] };
  });
}

async function rescan(entry: string, path: string, inspection: Inspection): Promise<Checkout | undefined> {
  const ovnfsLocation = ovnfsLocations.find((location) => location.path === path && location.entry === entry);
  if (ovnfsLocation) return inspectLocation(ovnfsLocation, inspection);
  const location = nativeLocations.find((candidate) => candidate.path === path && candidate.entry === entry);
  return location ? inspectLocation(location, inspection) : undefined;
}

function entryFor(path: string): string | undefined {
  if (ovnfsLocations.some((location) => location.path === path)) return path;
  return checkoutEntry(path, base, listing);
}

function unavailableTarget(path: string, entry = path): string {
  if (!missingPath(path)) return "it is no longer a checkout that omp lists for cleanup";
  if (!listing.ok || !ovnfs.ok || listing.paths.has(entry) || listing.paths.has(path) ||
    ovnfs.checkouts.some((checkout) => checkout.path === path)) {
    return "the requested path is missing on disk, but native absence could not be confirmed";
  }
  return "it vanished since inventory";
}

function print(v: unknown) {
  process.stdout.write(`${JSON.stringify(v, null, 2)}\n`);
}

function refreshRemoteDefault(path: string): { commonDir: string; fact: RemoteFact } | undefined {
  try {
    const source = sourceRepository(path);
    if (source) return { commonDir: source.commonDir, fact: remoteDefault(source.commonDir) };
  } catch (error) {
    progress("evidence", { stage: "remote refresh failed", path, error: String(error) });
  }
}

async function removeAll() {
  if (positionals.length < 2) usage("remove needs at least one <path>=<fingerprint>");
  const approved = new Set((values.approve ?? []).map((p) => realpath(p) || resolve(p)));
  const targetPaths = new Set<string>();
  const targets = positionals.slice(1).map((arg) => {
    const at = arg.lastIndexOf("=");
    if (at <= 0) usage(`${arg} is not <path>=<fingerprint>`);
    const fingerprint = arg.slice(at + 1);
    const kind = fingerprintKind(fingerprint);
    if (!kind) usage(`${arg} is not <path>=<fingerprint> with a current fingerprint; run a new inventory`);
    const requestedPath = arg.slice(0, at);
    const path = realpath(requestedPath) || resolve(requestedPath);
    if (targetPaths.has(path)) usage(`${path} names the same checkout more than once`);
    targetPaths.add(path);
    const entry = entryFor(path);
    if (!entry && !missingPath(path)) usage(`${path} is not a checkout under ${base}`);
    return { path, entry, fingerprint, kind };
  });
  for (const p of approved) if (!targetPaths.has(p)) usage(`--approve ${p} names no checkout in this removal`);

  const removed: { path: string; method: string }[] = [];
  const skipped: { path: string; reason: string }[] = [];
  const failed: { path: string; error: string }[] = [];
  for (const t of targets) {
    refreshLocalCheckoutEvidence();
    if (!t.entry) {
      const reason = unavailableTarget(t.path);
      progress("remove", { stage: "skipped", path: t.path, blocker: reason });
      skipped.push({ path: t.path, reason });
      continue;
    }
    let inspection: Inspection = discoveryInspection;
    let refreshed: ReturnType<typeof refreshRemoteDefault>;
    if (t.kind === "targeted") {
      refreshed = refreshRemoteDefault(t.path);
      refreshLocalCheckoutEvidence();
      inspection = {
        kind: "targeted",
        remoteFact: (commonDir) => refreshed?.commonDir === commonDir ? refreshed.fact : "the source repository could not be refreshed before removal",
      };
    }
    const c = await rescan(t.entry, t.path, inspection);
    const needsApproval = !!c && !c.automatic;
    let reason: string | undefined;
    if (!c) reason = unavailableTarget(t.path, t.entry);
    else if (c.outcome === "inspection failed" || c.outcome === "replaced") reason = c.reasons.join("; ");
    else if (c.verdict === "owned") reason = `it is in use now: ${c.owners.map((o) => [o.type, o.id, o.pid].filter((v) => v !== undefined && v !== null).join(" ")).join(", ")}`;
    else if (c.verdict !== "unused") reason = `its ownership is uncertain: ${c.reasons.join("; ")}`;
    else if (t.kind === "targeted" && c.source_git_dir && c.source_git_dir !== refreshed?.commonDir) {
      reason = "the source repository could not be refreshed before removal";
    }
    else if (c.fingerprint !== t.fingerprint) reason = "it changed since the inventory";
    else if (c.unique_history.length > 0) reason = `it holds commits or stashes that exist nowhere else (${c.unique_history.map((h) => h.ref).join(", ")}); push or branch them first`;
    else if (c.state === "unknown") reason = "its Git state and history cannot be verified; repair the checkout before removal";
    else if (needsApproval && !approved.has(t.path)) reason = `it holds ${c.state} work, and removing it needs --approve`;
    if (reason || !c) {
      progress("remove", { stage: "skipped", path: t.path, blocker: reason });
      skipped.push({ path: t.path, reason: reason! });
      continue;
    }
    try {
      let method: string;
      if (c.kind === "ovnfs") {
        if (!ovnfs.ok || !ovnfs.command || !c.ovnfs) throw new Error("ovnfs identity is unavailable");
        method = "ovnfs rm";
        // The Git guards can verify a squash draft that ovnfs still considers unsaved.
        const result = run([ovnfs.command, "--json", "rm", "--force", "--sticky-snapshots", c.ovnfs.name]);
        if (result.code !== 0) throw new Error(result.err.trim() || result.out.trim() || `ovnfs rm exit ${result.code}`);
        const after = ovnfsListing();
        if (!after.ok || after.checkouts.some((checkout) => checkout.name === c.ovnfs!.name || checkout.path === c.path)) throw new Error("ovnfs removal could not be verified");
        if (lstat(c.entry)) {
          progress("remove", { stage: "waiting for mounted directory disappearance", path: c.path });
          const deadline = performance.now() + 65_000;
          while (lstat(c.entry)) {
            if (performance.now() >= deadline) throw new Error("ovnfs removed the checkout, but its mounted directory is still visible after 65 seconds; inspect the path without repeating removal");
            Bun.sleepSync(50);
          }
          const visible = ovnfsListing();
          if (!visible.ok || visible.checkouts.some((checkout) => checkout.name === c.ovnfs!.name || checkout.path === c.path)) throw new Error("ovnfs removal identity changed while waiting for its mounted directory");
        }
      } else if (c.kind === "linked-worktree") {
        const commonDir = requireGit(run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], c.path), "rev-parse --git-common-dir").trim();
        const force = c.state !== "clean";
        method = force ? "git worktree remove --force" : "git worktree remove";
        const r = run(["git", `--git-dir=${commonDir}`, "worktree", "remove", ...(force ? ["--force"] : []), c.path]);
        if (r.code !== 0) throw new Error(r.err.trim() || `git worktree remove exit ${r.code}`);
        const registrations = requireGit(run(["git", `--git-dir=${commonDir}`, "worktree", "list", "--porcelain", "-z"]), "worktree list");
        if (!registrations.startsWith("worktree ")) throw new Error("git worktree list returned no registrations after removal");
        if (registrations.split("\0").includes(`worktree ${c.path}`)) {
          throw new Error("git still registers the worktree after removal");
        }
      } else {
        method = c.entry === c.path ? "rm -r" : `rm -r ${c.entry}`;
        removeTree(c.entry);
      }
      if (!missingPath(c.entry)) throw new Error("the directory's absence could not be verified after removal");
      removed.push({ path: c.path, method });
    } catch (e) {
      failed.push({ path: c.path, error: (e as Error).message });
    }
  }
  return { removed, skipped, failed };
}

type VerificationTarget = Pick<Checkout, "path" | "entry" | "kind" | "instance_id" | "branch" | "branch_ref" | "git_common_dir" | "ovnfs">;

function verificationTargets(file: string): VerificationTarget[] {
  try {
    const records = JSON.parse(readFileSync(file, "utf8"));
    requireSummaryRecordsVersion(records?.version);
    if (records.inventory?.exit_code !== 0 || typeof records.inventory.file !== "string") {
      throw new Error("expected a successful discovery inventory in summary records");
    }
    const { checkouts } = JSON.parse(readFileSync(resolve(dirname(file), records.inventory.file), "utf8"));
    if (!Array.isArray(checkouts)) throw new Error("expected a discovery checkouts array");
    const targets = new Map<string, VerificationTarget>();
    for (const checkout of checkouts) {
      if (!checkout || typeof checkout.path !== "string" || !isAbsolute(checkout.path) ||
        typeof checkout.entry !== "string" || !isAbsolute(checkout.entry) ||
        typeof checkout.kind !== "string" || targets.has(checkout.path)) {
        throw new Error("expected distinct discovery checkouts with absolute paths and entries");
      }
      targets.set(checkout.path, checkout);
    }
    for (const item of records.investigations ?? []) {
      const target = targets.get(item?.path);
      if (target && item.status === "complete" && item.checkout?.path === target.path && item.checkout.kind === target.kind) {
        targets.set(target.path, {
          ...target, branch: item.checkout.branch, branch_ref: item.checkout.branch_ref, git_common_dir: item.checkout.git_common_dir,
        });
      }
    }
    return [...targets.values()];
  } catch (error) {
    usage(`cannot read --verify: ${(error as Error).message}`);
  }
}

function diskDirectory(path: string) {
  try {
    const stat = lstatSync(path);
    return stat.isDirectory() ? stat : undefined;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? null : undefined;
  }
}

type DiskDirectory = ReturnType<typeof diskDirectory>;
const diskPresence = (directory: DiskDirectory) => directory ? "present" : directory === null ? "absent" : "unknown";

function diskChanged(before: DiskDirectory, after: DiskDirectory): boolean {
  if (before === undefined || after === undefined) return false;
  if (before === null || after === null) return before !== after;
  return before.dev !== after.dev || before.ino !== after.ino || before.birthtimeMs !== after.birthtimeMs;
}

function gitMetadata(commonDir: string, args: string[]): string | null {
  try {
    const result = run(["git", `--git-dir=${commonDir}`, ...args]);
    return result.code === 0 ? result.out : null;
  } catch {
    return null;
  }
}

function verificationInstance(expected: unknown, before: Instance | undefined, after: Instance | undefined, mappingChanged: boolean) {
  if (mappingChanged) return "replaced";
  if (typeof expected !== "string") return "unknown";
  const first = before && "id" in before ? before.id : undefined;
  const last = after && "id" in after ? after.id : undefined;
  if ((first !== undefined && first !== expected) || (last !== undefined && last !== expected)) return "replaced";
  return first === expected && last === expected ? "same" : "unknown";
}

function verification(file: string) {
  const targets = verificationTargets(file);
  const initialDisk = targets.map((target) => {
    const { path, entry } = target;
    const directory = diskDirectory(path);
    return {
      path: directory, entry: entry === path ? undefined : diskDirectory(entry),
      instance: directory ? observeInstance(target) : undefined,
    };
  });
  progress("evidence", { stage: "native listing" });
  const native = ompWorktreeListing(base);
  progress("evidence", { stage: "ovnfs listing" });
  const virtual = ovnfsListing();
  const ownershipFailure = gatherOwnership();
  const ownership_gaps = [ownershipFailure, leaseDetectionGap(), cwds.ok ? undefined : cwds.reason].filter((g): g is string => !!g);
  const evidence_gaps = [native.ok ? undefined : native.reason, virtual.ok ? undefined : virtual.reason].filter((g): g is string => !!g);
  const virtualPaths = new Map(virtual.checkouts.map((checkout) => [checkout.path, checkout.name]));
  const virtualNames = new Map(virtual.checkouts.map((checkout) => [checkout.name, checkout.path]));
  const virtualLocations = new Map(virtual.ok && virtual.checkouts.length
    ? cleanupOvnfsLocations(base, virtual, new Set()).map((location) => [location.path, location]) : []);
  const checkouts: Pick<Checkout, "path" | "verdict" | "owners" | "reasons">[] = [];
  const registrations = new Map<string, Set<string> | null>();
  const branches = new Map<string, Set<string> | null>();
  const listed = targets.map(({ path, entry, kind, branch, branch_ref, git_common_dir, ovnfs }) => {
    progress("checkout", { stage: "verification", path });
    const omp_listed = native.ok ? native.paths.has(entry) || native.paths.has(path) : null;
    const ovnfs_listed = virtual.ok ? virtualPaths.has(path) || (!!ovnfs?.name && virtualNames.has(ovnfs.name)) : null;
    if (kind === "ovnfs" ? virtualPaths.has(path) && virtualPaths.get(path) === ovnfs?.name : omp_listed) {
      const location = virtualLocations.get(path);
      const recordEntry = location?.record ? dirname(location.record) : undefined;
      const task = kind === "task-isolation" ? taskOwner(entry)
        : kind === "ovnfs" && recordEntry && lstat(join(recordEntry, ".omp-isolation-owner.json")) ? taskOwner(recordEntry) : {};
      const recordGaps = location?.gaps.filter(({ kind }) => kind === "run-record").map(({ message }) => message) ?? [];
      const owners = ownersOf(entry, task.owner ? [task.owner] : [], sessionLinks(entry).sessions);
      const gaps = [...ownership_gaps, ...recordGaps, ...(task.gap ? [task.gap] : [])];
      checkouts.push({ path, owners, ...verdictOf(owners, gaps) });
    }
    if (kind !== "linked-worktree") return { path, entry, omp_listed, ovnfs_listed };
    let git_registered: boolean | null = null;
    let branch_preserved: boolean | null = null;
    if (typeof git_common_dir === "string" && isAbsolute(git_common_dir)) {
      if (!registrations.has(git_common_dir)) {
        const output = gitMetadata(git_common_dir, ["worktree", "list", "--porcelain", "-z"]);
        const paths = output?.split("\0").filter((field) => field.startsWith("worktree ")).map((field) => field.slice("worktree ".length));
        registrations.set(git_common_dir, paths?.length ? new Set(paths) : null);
      }
      git_registered = registrations.get(git_common_dir)?.has(path) ?? null;
      if (typeof branch_ref === "string") {
        if (!branches.has(git_common_dir)) {
          const output = gitMetadata(git_common_dir, ["for-each-ref", "--format=%(refname)", "refs/heads/"]);
          branches.set(git_common_dir, output === null ? null : new Set(output.split("\n")));
        }
        branch_preserved = branches.get(git_common_dir)?.has(branch_ref) ?? null;
      }
    }
    return { path, entry, omp_listed, ovnfs_listed, git_registered, ...(branch ? { branch_preserved } : {}) };
  });
  const observations = listed.map(({ path, entry, ...facts }, i) => {
    const pathAfter = diskDirectory(path);
    const entryAfter = entry === path ? undefined : diskDirectory(entry);
    const target = targets[i];
    const mounted = virtualPaths.get(path);
    const named = target.ovnfs && virtualNames.get(target.ovnfs.name);
    const mappingChanged = target.kind === "ovnfs" &&
      ((mounted !== undefined && mounted !== target.ovnfs?.name) || (named !== undefined && named !== path));
    const instance = verificationInstance(target.instance_id, initialDisk[i].instance, pathAfter ? observeInstance(target) : undefined, mappingChanged);
    const changed = diskChanged(initialDisk[i].path, pathAfter) || diskChanged(initialDisk[i].entry, entryAfter);
    return {
      path, ...facts, disk: diskPresence(pathAfter), instance,
      ...(entry === path ? {} : { entry_disk: diskPresence(entryAfter) }),
      ...(changed ? { disk_changed: true } : {}),
    };
  });
  progress("verification", { stage: "complete", ...contentReads });
  return { base, evidence_gaps, ownership_gaps, checkouts, observations };
}

if (values.verify !== undefined) {
  print(verification(values.verify));
  reportReader();
  process.exit(0);
}

refreshLocalCheckoutEvidence();
if (command === "remove") print(await removeAll());
else if (values["prepare-source"]) {
  const source_facts = [...new Set(values["prepare-source"].map((p) => realpath(p) || resolve(p)))].map((source_git_dir) => {
    const fact = remoteDefault(source_git_dir);
    return typeof fact === "string" ? { source_git_dir, reason: fact } : fact;
  });
  print({ base, evidence_gaps: evidenceGaps, checkouts: [], source_facts });
} else if (values.target) {
  try {
    const prepared = JSON.parse(readFileSync(values["source-facts"]!, "utf8"));
    if (!Array.isArray(prepared.source_facts)) throw new Error("expected a source_facts array");
    for (const fact of prepared.source_facts) {
      if (typeof fact.source_git_dir !== "string") throw new Error("source_git_dir must be a string");
      if (typeof fact.reason === "string") remoteDefaults.set(fact.source_git_dir, fact.reason);
      else {
        if (![fact.remote, fact.url, fact.ref, fact.sha].every((v) => typeof v === "string" && v.length > 0) || !/^refs\/heads\/.+/.test(fact.ref) || !/^[0-9a-f]{40,64}$/.test(fact.sha)) throw new Error("invalid remote-default fact");
        remoteDefaults.set(fact.source_git_dir, { source_git_dir: fact.source_git_dir, remote: fact.remote, url: fact.url, ref: fact.ref, sha: fact.sha });
      }
    }
  } catch (e) {
    usage(`cannot read --source-facts: ${(e as Error).message}`);
  }
  const targets = [...new Set(values.target.map((p) => realpath(p) || resolve(p)))].map((path) => {
    const entry = entryFor(path);
    if (!entry) usage(`${path} is not a checkout under ${base}`);
    return { path, entry };
  });
  const checkouts: Checkout[] = [];
  for (const { path, entry } of targets) {
    const checkout = await rescan(entry, path, targetedInspection);
    if (checkout) checkouts.push(checkout);
  }
  print({ base, evidence_gaps: evidenceGaps, checkouts });
} else print({ base, evidence_gaps: evidenceGaps, checkouts: await scan() });
reportReader();

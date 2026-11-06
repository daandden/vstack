import { closeSync, existsSync, lstatSync, openSync, readdirSync, readFileSync, readlinkSync, readSync, realpathSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { checkoutEntry, checkoutLocations, cleanupOvnfsLocations, defaultCheckoutBase, ompWorktreeListing, ovnfsListing, scanCheckoutLocations, taskMarker, type CheckoutLocation, type OvnfsCleanupLocation } from "../../vstack-fan-out/scripts/checkout-locator.ts";

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
    },
  });
} catch (e) {
  usage((e as Error).message);
}
const { values, positionals } = parsed;
const command = positionals[0];
if (command !== "inventory" && command !== "remove") usage("the first argument must be inventory or remove");
if (command === "inventory" && (positionals.length > 1 || values.approve)) usage("inventory takes only the evidence flags");
if (command === "remove" && (values.target || values["prepare-source"] || values["source-facts"])) usage("integration evidence options belong to inventory");
if (values.target && (!values["source-facts"] || values["prepare-source"])) usage("--target requires --source-facts and cannot accompany --prepare-source");
if (values["source-facts"] && !values.target) usage("--source-facts requires --target");

function run(cmd: string[], cwd?: string, env?: Record<string, string | undefined>): { code: number; out: string; err: string } {
  const r = Bun.spawnSync(cmd, { cwd, env, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
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

/** Session headers from the `.jsonl` files that the given processes hold open, which finds sessions saved outside the session dirs. */
function openSessionFiles(pids: number[]): SessionHeader[] {
  const r = run(["lsof", "-a", "-p", pids.join(","), "-Fn"]);
  const files = new Set(r.out.split("\n").filter((l) => l.startsWith("n") && l.endsWith(".jsonl")).map((l) => l.slice(1)));
  const buf = Buffer.alloc(1 << 16);
  return [...files].map((f) => readHeader(f, buf)).filter((h): h is SessionHeader => !!h);
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

function heldLeases(ids: string[]): Leases {
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
  const r = run(["lsof", "-Fpn", "+d", ownersDir]);
  if (r.code !== 0 && r.code !== 1) return { ok: false, reason: `lsof failed on ${ownersDir}: ${r.err.trim() || `exit ${r.code}`}`, held, unknown };
  const wanted = new Map(ids.map((id) => [leasePath(id), id]));
  let pid: number | null = null;
  for (const line of r.out.split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    else if (line.startsWith("n") && line.endsWith(".lock")) {
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
let listing: { ok: boolean; reason?: string; paths: Set<string> } = { ok: false, paths: new Set() };
let ovnfs: ReturnType<typeof ovnfsListing> = { ok: false, checkouts: [] };
let ovnfsLocations: OvnfsCleanupLocation[] = [];
let evidenceGaps: string[] = [];

/** Why the run cannot trust a free lease: it must see its own session's held lease and session file, and every held lease's session. */
function leaseDetectionGap(): string | undefined {
  if (!leases.ok) return leases.reason;
  if (!ownSession) return "PI_SESSION_ID is not set, so the run cannot prove it sees session leases; run clean-wt from an omp session";
  if (!leases.held.has(ownSession)) return `the running session's own lease (${ownSession}) does not show as held under ${ownersDir}`;
  if (!sessionHeaders.some((s) => s.id === ownSession)) return `the running session ${ownSession} has no session file under ${sessionRoots.join(", ")}, so other sessions may be missing too`;
  const missing = [...leases.held.keys()].filter((id) => !sessionHeaders.some((s) => s.id === id));
  if (missing.length > 0) return `live sessions have no readable current header (${missing.join(", ")}), so their checkouts are unknown`;
  if (leases.unknown.size > 0) return `live sessions hold leases with no readable session file (${[...leases.unknown.keys()].join(", ")}), so their checkouts are unknown`;
  return undefined;
}

function gatherEvidence() {
  listing = ompWorktreeListing(base);
  sessionHeaders = readSessions();
  leases = heldLeases([...sessionHeaders.map((s) => s.id), ...(ownSession ? [ownSession] : [])]);
  const buf = Buffer.alloc(1 << 16);
  sessionHeaders = sessionHeaders.flatMap((header) => {
    if (!leases.held.has(header.id)) return [header];
    const current = readHeader(header.file, buf);
    if (current) headersByFile.set(header.file, current);
    return current ? [current] : [];
  });
  const holders = [...new Set(leases.unknown.values())].filter((p): p is number => p !== null);
  if (holders.length > 0) {
    const known = new Set(sessionHeaders.map((s) => s.id));
    for (const h of openSessionFiles(holders)) {
      const name = basename(leasePath(h.id), ".lock");
      if (known.has(h.id) || !leases.unknown.has(name)) continue;
      known.add(h.id);
      sessionHeaders.push(h);
      leases.held.set(h.id, leases.unknown.get(name) ?? null);
      leases.unknown.delete(name);
    }
  }
  cwds = processCwds();
  ovnfs = ovnfsListing();
  const projectPaths = new Set(run(["git", "worktree", "list", "--porcelain"]).out.split("\n").filter((line) => line.startsWith("worktree ")).map((line) => realpath(line.slice(9)) || resolve(line.slice(9))));
  let added: boolean;
  do {
    added = false;
    for (const header of sessionHeaders) {
      if (projectPaths.has(header.cwd)) continue;
      const parentFile = `${dirname(header.file)}.jsonl`;
      const parent = sessionHeaders.find((candidate) => candidate.file === parentFile);
      if (parent && projectPaths.has(parent.cwd)) {
        projectPaths.add(header.cwd);
        added = true;
      }
    }
  } while (added);
  ovnfsLocations = cleanupOvnfsLocations(base, ovnfs, projectPaths);
  evidenceGaps = [leaseDetectionGap(), cwds.ok ? undefined : cwds.reason, listing.ok ? undefined : listing.reason, ovnfs.ok ? undefined : ovnfs.reason].filter((g): g is string => !!g);
}

interface Owner {
  type: "session" | "task" | "process";
  id?: string;
  pid?: number | null;
  file?: string;
  command?: string;
}

type Kind = "linked-worktree" | "orphaned-worktree" | "task-isolation" | "standalone-clone" | "ovnfs";
type Verdict = "owned" | "uncertain" | "unused";
type State = "clean" | "dirty" | "unknown" | "not checked";

interface Checkout {
  path: string;
  entry: string;
  kind: Kind;
  verdict: Verdict;
  reasons: string[];
  owners: Owner[];
  state: State;
  changes: Record<string, string[]>;
  unique_history: Tip[];
  branch: string | null;
  fingerprint: string;
  sessions: SessionLink[];
  moved_sessions: SessionLink[];
  integration?: Integration;
  automatic?: boolean;
  source_git_dir?: string;
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

function processCwds(): { ok: boolean; reason?: string; list: ProcessCwd[] } {
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
  const r = run(["lsof", "-a", "-d", "cwd", "-Fpcn"]);
  if (!r.out && r.code !== 0) return { ok: false, reason: `lsof could not list process working directories: ${r.err.trim() || `exit ${r.code}`}`, list };
  let cur: Partial<ProcessCwd> = {};
  for (const line of r.out.split("\n")) {
    if (line.startsWith("p")) cur = { pid: Number(line.slice(1)) };
    else if (line.startsWith("c")) cur.command = line.slice(1);
    else if (line.startsWith("n") && cur.pid) list.push({ pid: cur.pid, command: cur.command ?? "", cwd: line.slice(1) });
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
  const lines = run(["git", `--git-dir=${commonDir}`, "worktree", "list", "--porcelain"]).out.split("\n");
  return lines[0]?.startsWith("worktree ") && !lines.includes("bare") ? lines[0].slice("worktree ".length) : null;
}

function sourceOf(path: string, entry: string, kind: Kind): Source | null {
  if (kind === "ovnfs") {
    const location = ovnfsLocations.find((location) => location.path === path);
    if (!location) return null;
    const candidates = [location.source, ...run(["git", "worktree", "list", "--porcelain"]).out.split("\n").filter((line) => line.startsWith("worktree ")).map((line) => line.slice(9))];
    for (const checkout of candidates) {
      if (!lstat(checkout)?.isDirectory()) continue;
      const result = run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], checkout);
      if (result.code === 0) return { commonDir: result.out.trim(), checkout };
    }
    return null;
  }
  if (kind === "linked-worktree") {
    const commonDir = run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], path).out.trim();
    const main = commonDir ? mainCheckout(commonDir) : null;
    return commonDir ? { commonDir, checkout: main === path ? null : main } : null;
  }
  if (kind === "task-isolation") {
    for (const s of sessionHeaders.filter((h) => inside(h.cwd, entry))) {
      let parent: SessionHeader | undefined = s;
      while (parent && inside(parent.cwd, entry)) {
        const file: string = `${parent.file.slice(0, parent.file.lastIndexOf(sep))}.jsonl`;
        parent = sessionHeaders.find((h): boolean => h.file === file);
      }
      if (!parent || !existsSync(parent.cwd)) continue;
      const top = run(["git", "rev-parse", "--show-toplevel"], parent.cwd).out.trim();
      const commonDir = run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], parent.cwd).out.trim();
      if (top && commonDir) return { commonDir, checkout: top };
    }
  }
  try {
    const objects = readFileSync(join(path, ".git", "objects", "info", "alternates"), "utf8").split("\n")[0].trim();
    if (!objects) return null;
    const commonDir = resolve(join(path, ".git", "objects"), objects, "..");
    return { commonDir, checkout: mainCheckout(commonDir) };
  } catch {
    return null;
  }
}

function expand(root: string, rel: string): string[] {
  const clean = rel.replace(/\/$/, "");
  const st = lstat(join(root, clean));
  if (!st?.isDirectory()) return [clean];
  try {
    return readdirSync(join(root, clean)).sort().flatMap((n) => expand(root, `${clean}/${n}`));
  } catch {
    return [clean];
  }
}

function sameBytes(a: string, b: string): boolean {
  const fa = openSync(a, "r");
  const fb = openSync(b, "r");
  try {
    const ba = Buffer.alloc(1 << 20);
    const bb = Buffer.alloc(1 << 20);
    for (;;) {
      const na = readSync(fa, ba, 0, ba.length, null);
      const nb = readSync(fb, bb, 0, bb.length, null);
      if (na !== nb || !ba.subarray(0, na).equals(bb.subarray(0, nb))) return false;
      if (na === 0) return true;
    }
  } finally {
    closeSync(fa);
    closeSync(fb);
  }
}

/** Where a link points: its path inside its own checkout when it stays inside, else its absolute target. */
function linkTarget(root: string, rel: string): string {
  const target = resolve(dirname(join(root, rel)), readlinkSync(join(root, rel)));
  return inside(target, root) ? `checkout:${target.slice(root.length)}` : target;
}

function compareIgnored(path: string, ref: string | null, rel: string): "same" | "unique" | "unverified" {
  if (!ref) return "unverified";
  try {
    const a = lstatSync(join(path, rel));
    const b = lstat(join(ref, rel));
    if (a.isSymbolicLink()) return b?.isSymbolicLink() && linkTarget(path, rel) === linkTarget(ref, rel) ? "same" : "unique";
    if (!a.isFile()) return "unverified";
    return b?.isFile() && a.size === b.size && sameBytes(join(path, rel), join(ref, rel)) ? "same" : "unique";
  } catch {
    return "unverified";
  }
}

interface WorkState {
  state: "clean" | "dirty" | "unknown";
  changes: Record<string, string[]>;
  stamp: unknown[];
}

function contentStamp(file: string): string {
  let fd: number | undefined;
  try {
    const st = lstat(file);
    if (!st) return "missing";
    if (st.isSymbolicLink()) return `link:${readlinkSync(file)}`;
    if (!st.isFile()) return "unverified";
    const hash = createHash("sha256");
    const buf = Buffer.alloc(1 << 16);
    fd = openSync(file, "r");
    for (;;) {
      const n = readSync(fd, buf, 0, buf.length, null);
      if (n === 0) break;
      hash.update(buf.subarray(0, n));
    }
    return hash.digest("hex");
  } catch {
    return "unverified";
  } finally {
    if (fd !== undefined) closeSync(fd);
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

function workState(path: string, ref: string | null): WorkState {
  const r = run(["git", "status", "--porcelain=v2", "-z", "--untracked-files=all", "--ignored"], path);
  if (r.code !== 0) return { state: "unknown", changes: { unreadable: [r.err.trim() || `git status exit ${r.code}`] }, stamp: [r.err] };
  const changes: Record<string, string[]> = { staged: [], unstaged: [], unmerged: [], untracked: [], ignored_unique: [], ignored_unverified: [] };
  const ignored: string[] = [];
  const tokens = r.out.split("\0");
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t) continue;
    if (t.startsWith("? ")) changes.untracked.push(t.slice(2));
    else if (t.startsWith("! ")) ignored.push(...expand(path, t.slice(2)));
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
  const flags = run(["git", "ls-files", "-v", "-z"], path);
  if (flags.code !== 0) return { state: "unknown", changes: { unreadable: ["the index flags could not be read"] }, stamp: [r.out, flags.err] };
  const hidden = flags.out.split("\0").filter((line) => line[0] === "S" || /^[a-z]/.test(line)).map((line) => line.slice(2));
  let hiddenUnknown = false;
  if (hidden.length > 0) {
    const index = run(["git", "--literal-pathspecs", "ls-files", "--stage", "-z", "--", ...hidden], path);
    const entries = new Map(index.out.split("\0").filter(Boolean).map((line) => {
      const at = line.indexOf("\t");
      const [mode, sha, stage] = line.slice(0, at).split(" ");
      return [line.slice(at + 1), stage === "0" ? `${mode} ${sha}` : "unmerged"];
    }));
    for (const rel of hidden) {
      const actual = workingEntry(path, rel);
      if (index.code !== 0 || !actual || !entries.has(rel)) {
        (changes.unreadable ??= []).push(rel);
        hiddenUnknown = true;
      } else if (actual !== entries.get(rel) && !changes.unstaged.includes(rel)) changes.unstaged.push(rel);
    }
  }
  for (const rel of ignored) {
    const verdict = compareIgnored(path, ref, rel);
    if (verdict === "unique") changes.ignored_unique.push(rel);
    else if (verdict === "unverified") changes.ignored_unverified.push(rel);
  }
  const listed = Object.values(changes).flat();
  const stamp = [r.out, flags.out, ...[...new Set([...listed, ...ignored, ...hidden])].map((rel) => {
    const st = lstat(join(path, rel));
    return st ? [rel, st.size, st.mtimeMs, st.ctimeMs, st.ino, st.mode, contentStamp(join(path, rel))] : [rel];
  })];
  for (const k of Object.keys(changes)) if (changes[k].length === 0) delete changes[k];
  return { state: hiddenUnknown ? "unknown" : listed.length > 0 ? "dirty" : "clean", changes, stamp };
}

interface Tip {
  ref: string;
  sha: string;
}

function unreached(gitArgs: string[], tips: Tip[], not: string[]): Set<string> {
  const shas = [...new Set(tips.map((t) => t.sha))];
  if (shas.length === 0) return new Set();
  const check = Bun.spawnSync(["git", ...gitArgs, "cat-file", "--batch-check=%(objectname) %(objecttype)"], { stdin: Buffer.from(`${shas.join("\n")}\n`), stdout: "pipe", stderr: "pipe" });
  const present = check.stdout.toString().split("\n").filter((l) => l.endsWith(" commit")).map((l) => l.split(" ")[0]);
  const missing = shas.filter((s) => !present.includes(s));
  if (present.length === 0) return new Set(missing);
  const r = run(["git", ...gitArgs, "rev-list", ...present, "--not", ...not]);
  if (r.code !== 0) return new Set(shas);
  const listed = new Set(r.out.split("\n"));
  return new Set([...missing, ...present.filter((s) => listed.has(s))]);
}

function uniqueHistory(path: string, kind: Kind, source: Source | null): Tip[] {
  const detached = run(["git", "symbolic-ref", "-q", "HEAD"], path).code !== 0;
  const head = run(["git", "rev-parse", "HEAD"], path).out.trim();
  if (kind === "linked-worktree") {
    if (!detached || !head) return [];
    const tips = [{ ref: "HEAD", sha: head }];
    const lost = unreached(["-C", path], tips, ["--branches", "--tags", "--remotes", ...stashShas(["-C", path])]);
    return tips.filter((t) => lost.has(t.sha));
  }
  const tips: Tip[] = run(["git", "for-each-ref", "--format=%(if)%(*objectname)%(then)%(*objectname)%(else)%(objectname)%(end) %(refname)", "refs/heads", "refs/tags"], path)
    .out.split("\n")
    .filter(Boolean)
    .map((l) => ({ sha: l.slice(0, l.indexOf(" ")), ref: l.slice(l.indexOf(" ") + 1) }));
  if (detached && head) tips.push({ ref: "HEAD", sha: head });
  stashShas(["-C", path]).forEach((sha, i) => tips.push({ ref: `stash@{${i}}`, sha }));
  let lost = unreached(["-C", path], tips, ["--remotes"]);
  if (source) {
    const inSource = unreached([`--git-dir=${source.commonDir}`], tips.filter((t) => lost.has(t.sha)), ["--all"]);
    const sourceStashes = new Set(stashShas([`--git-dir=${source.commonDir}`]));
    lost = new Set([...inSource].filter((s) => !sourceStashes.has(s)));
  }
  return tips.filter((t) => lost.has(t.sha));
}

function stashShas(gitArgs: string[]): string[] {
  const r = run(["git", ...gitArgs, "log", "-g", "--format=%H", "refs/stash", "--"]);
  return r.code === 0 ? r.out.split("\n").filter(Boolean) : [];
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

function inspectOrphan(path: string, gitdir: string): Checkout {
  const { sessions, moved } = sessionLinks(path);
  const owners = ownersOf(path, [], sessions);
  const { verdict, reasons } = verdictOf(owners, evidenceGaps);
  const fingerprint = verdict !== "unused" ? "" : createHash("sha256").update(JSON.stringify(treeStamp(path))).digest("hex");
  const unreadable = [`the repo no longer has this worktree's registration (${gitdir || "no gitdir line"}), so git cannot read its changes`];
  return { path, entry: path, kind: "orphaned-worktree", verdict, reasons, owners, state: "unknown", changes: { unreadable }, unique_history: [], branch: null, fingerprint, sessions, moved_sessions: moved };
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

const remoteDefaults = new Map<string, RemoteDefault | string>();
let refreshRemote = false;
let compareIntegration = false;

function remoteDefault(commonDir: string): RemoteDefault | string {
  const cached = remoteDefaults.get(commonDir);
  if (cached && !refreshRemote) return cached;
  const git = ["git", `--git-dir=${commonDir}`];
  const remotes = run([...git, "remote"]).out.trim().split("\n").filter(Boolean);
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

function integrated(path: string, source: Source | null, work: WorkState): Integration {
  const commonDir = source?.commonDir ?? run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], path).out.trim();
  const fact = values["source-facts"]
    ? remoteDefaults.get(commonDir) ?? "no prepared remote-default facts were supplied for this source"
    : remoteDefault(commonDir);
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

function inspect(path: string, entry: string, kind: Kind, entryOwners: Owner[], entryGaps: string[]): Checkout {
  const branch: string | null = null;
  const { sessions, moved } = sessionLinks(entry);
  const owners = ownersOf(entry, entryOwners, sessions);
  const { verdict, reasons } = verdictOf(owners, [...evidenceGaps, ...entryGaps]);
  const common: Pick<Checkout, "path" | "entry" | "kind" | "verdict" | "reasons" | "owners" | "branch" | "sessions" | "moved_sessions"> = { path, entry, kind, verdict, reasons, owners, branch, sessions, moved_sessions: moved };
  if (verdict !== "unused") return { ...common, state: "not checked", changes: {}, unique_history: [], fingerprint: "" };
  common.branch = run(["git", "symbolic-ref", "-q", "--short", "HEAD"], path).out.trim() || null;
  const source = sourceOf(path, entry, kind);
  const head = run(["git", "rev-parse", "HEAD"], path).out.trim();
  const work = workState(path, source?.checkout ?? null);
  const unique_history = uniqueHistory(path, kind, source);
  const integration = compareIntegration && work.state === "dirty" ? integrated(path, source, work) : undefined;
  const artifacts = ["ignored_unique", "ignored_unverified", "unmerged"].some((key) => work.changes[key]?.length);
  const automatic = unique_history.length === 0 && (work.state === "clean" || (integration?.status === "verified" && !artifacts));
  const fingerprint = createHash("sha256").update(JSON.stringify([head, common.branch, work.stamp, unique_history, integration])).digest("hex");
  const source_git_dir = source?.commonDir ?? run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], path).out.trim();
  return { ...common, state: work.state, changes: work.changes, unique_history, fingerprint, integration, automatic, source_git_dir };
}

function removeTree(entry: string) {
  const st = lstat(entry);
  if (!st?.isDirectory() || !inside(entry, base) || entry === base) throw new Error(`refusing to remove ${entry}: not a dir under ${base}`);
  rmSync(entry, { recursive: true });
}

function inspectLocation(location: CheckoutLocation | OvnfsCleanupLocation): Checkout {
  const { path, entry, kind, gaps } = location;
  if (kind === "ovnfs") {
    const recordEntry = location.record ? dirname(location.record) : undefined;
    const task = recordEntry && lstat(join(recordEntry, ".omp-isolation-owner.json")) ? taskOwner(recordEntry) : {};
    const checkout = inspect(path, entry, kind, task.owner ? [task.owner] : [], [...gaps, ...(task.gap ? [task.gap] : [])]);
    checkout.ovnfs = { name: location.name, source: location.source, record: location.record };
    if (checkout.fingerprint) checkout.fingerprint = createHash("sha256").update(JSON.stringify([checkout.fingerprint, checkout.ovnfs, location.record ? contentStamp(location.record) : null])).digest("hex");
    return checkout;
  }
  if (kind === "worktree") {
    const { gitdir, exists } = registeredGitDir(path);
    return exists ? inspect(path, entry, "linked-worktree", [], gaps) : inspectOrphan(path, gitdir);
  }
  if (kind === "task-isolation") {
    const { owner, gap } = taskOwner(entry);
    return inspect(path, entry, kind, owner ? [owner] : [], [...(gap ? [gap] : []), ...gaps]);
  }
  return inspect(path, entry, kind, [], gaps);
}

function scan(): Checkout[] {
  return [...scanCheckoutLocations(base, listing), ...ovnfsLocations].map(inspectLocation);
}

function rescan(entry: string, path: string): Checkout | undefined {
  const ovnfsLocation = ovnfsLocations.find((location) => location.path === path && location.entry === entry);
  if (ovnfsLocation) return inspectLocation(ovnfsLocation);
  if (listing.ok && !listing.paths.has(entry)) return undefined;
  if (!lstat(entry)?.isDirectory()) return undefined;
  const location = checkoutLocations(entry)?.find((location) => location.path === path);
  return location ? inspectLocation(location) : undefined;
}

function entryFor(path: string): string | undefined {
  if (ovnfsLocations.some((location) => location.path === path)) return path;
  return checkoutEntry(path, base, listing);
}

function print(v: unknown) {
  process.stdout.write(`${JSON.stringify(v, null, 2)}\n`);
}

function removeAll() {
  if (positionals.length < 2) usage("remove needs at least one <path>=<fingerprint>");
  const approved = new Set((values.approve ?? []).map((p) => realpath(p) || resolve(p)));
  const targets = positionals.slice(1).map((arg) => {
    const at = arg.lastIndexOf("=");
    const path = realpath(arg.slice(0, at)) || resolve(arg.slice(0, at));
    const fingerprint = arg.slice(at + 1);
    if (at < 0 || !/^[0-9a-f]{64}$/.test(fingerprint)) usage(`${arg} is not <path>=<fingerprint>`);
    const entry = entryFor(path);
    if (!entry) usage(`${path} is not a checkout under ${base}`);
    return { path, entry, fingerprint };
  });
  for (const p of approved) if (!targets.some((t) => t.path === p)) usage(`--approve ${p} names no checkout in this removal`);

  const removed: { path: string; method: string }[] = [];
  const skipped: { path: string; reason: string }[] = [];
  const failed: { path: string; error: string }[] = [];
  for (const t of targets) {
    gatherEvidence();
    compareIntegration = false;
    const discovered = rescan(t.entry, t.path);
    compareIntegration = discovered?.state === "dirty" && discovered.fingerprint !== t.fingerprint;
    refreshRemote = true;
    if (compareIntegration) rescan(t.entry, t.path);
    refreshRemote = false;
    gatherEvidence();
    const c = rescan(t.entry, t.path);
    const needsApproval = !!c && !c.automatic;
    let reason: string | undefined;
    if (!c) reason = "it is no longer a checkout that omp lists under the base";
    else if (c.verdict === "owned") reason = `it is in use now: ${c.owners.map((o) => [o.type, o.id, o.pid].filter((v) => v !== undefined && v !== null).join(" ")).join(", ")}`;
    else if (c.verdict !== "unused") reason = `its ownership is uncertain: ${c.reasons.join("; ")}`;
    else if (c.fingerprint !== t.fingerprint) reason = "it changed since the inventory";
    else if (c.unique_history.length > 0) reason = `it holds commits or stashes that exist nowhere else (${c.unique_history.map((h) => h.ref).join(", ")}); push or branch them first`;
    else if (c.state === "unknown") reason = "its Git state and history cannot be verified; repair the checkout before removal";
    else if (needsApproval && !approved.has(t.path)) reason = `it holds ${c.state} work, and removing it needs --approve`;
    if (reason || !c) {
      skipped.push({ path: t.path, reason: reason! });
      continue;
    }
    try {
      let method: string;
      if (c.kind === "ovnfs") {
        if (!ovnfs.ok || !ovnfs.command || !c.ovnfs) throw new Error("ovnfs identity is unavailable");
        method = "ovnfs rm";
        const result = run([ovnfs.command, "--json", "rm", c.ovnfs.name]);
        if (result.code !== 0) throw new Error(result.err.trim() || `ovnfs rm exit ${result.code}`);
        const after = ovnfsListing();
        if (!after.ok || after.checkouts.some((checkout) => checkout.name === c.ovnfs!.name || checkout.path === c.path)) throw new Error("ovnfs removal could not be verified");
      } else if (c.kind === "linked-worktree") {
        const commonDir = run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], c.path).out.trim();
        const force = c.state !== "clean";
        method = force ? "git worktree remove --force" : "git worktree remove";
        const r = run(["git", `--git-dir=${commonDir}`, "worktree", "remove", ...(force ? ["--force"] : []), c.path]);
        if (r.code !== 0) throw new Error(r.err.trim() || `git worktree remove exit ${r.code}`);
        if (run(["git", `--git-dir=${commonDir}`, "worktree", "list", "--porcelain"]).out.split("\n").includes(`worktree ${c.path}`)) {
          throw new Error("git still registers the worktree after removal");
        }
      } else {
        method = c.entry === c.path ? "rm -r" : `rm -r ${c.entry}`;
        removeTree(c.entry);
      }
      if (lstat(c.entry)) throw new Error("the directory still exists after removal");
      removed.push({ path: c.path, method });
    } catch (e) {
      failed.push({ path: c.path, error: (e as Error).message });
    }
  }
  return { removed, skipped, failed };
}

gatherEvidence();
if (command === "remove") print(removeAll());
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
        remoteDefaults.set(fact.source_git_dir, fact);
      }
    }
  } catch (e) {
    usage(`cannot read --source-facts: ${(e as Error).message}`);
  }
  compareIntegration = true;
  const targets = [...new Set(values.target.map((p) => realpath(p) || resolve(p)))].map((path) => {
    const entry = entryFor(path);
    if (!entry) usage(`${path} is not a checkout under ${base}`);
    return { path, entry };
  });
  print({ base, evidence_gaps: evidenceGaps, checkouts: targets.map(({ path, entry }) => rescan(entry, path)).filter(Boolean) });
} else print({ base, evidence_gaps: evidenceGaps, checkouts: scan() });

import { closeSync, lstatSync, openSync, readdirSync, readFileSync, readlinkSync, readSync, realpathSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";

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
    },
  });
} catch (e) {
  usage((e as Error).message);
}
const { values, positionals } = parsed;
const command = positionals[0];
if (command !== "inventory" && command !== "remove") usage("the first argument must be inventory or remove");
if (command === "inventory" && (positionals.length > 1 || values.approve)) usage("inventory takes only the evidence flags");

function run(cmd: string[], cwd?: string, env?: Record<string, string | undefined>) {
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

function defaultBase(): string {
  if (process.env.OMP_WORKTREE_DIR) return process.env.OMP_WORKTREE_DIR;
  const r = run(["omp", "config", "get", "worktree.base"]);
  const v = r.out.trim();
  if (r.code === 0 && v && v !== "(not set)") return v.replace(/^~(?=$|\/)/, homedir());
  return join(homedir(), ".omp", "wt");
}

const requestedBase = resolve(values.base ?? defaultBase());
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

function readSessions(): SessionHeader[] {
  const found: SessionHeader[] = [];
  const buf = Buffer.alloc(1 << 16);
  const walk = (d: string) => {
    let names: string[];
    try {
      names = readdirSync(d);
    } catch {
      return;
    }
    for (const name of names) {
      const p = join(d, name);
      const st = lstat(p);
      if (st?.isDirectory()) walk(p);
      else if (st?.isFile() && name.endsWith(".jsonl")) {
        const header = readHeader(p, buf);
        if (header) found.push(header);
      }
    }
  };
  for (const root of sessionRoots) walk(root);
  return found;
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

/** The entries that `omp worktree list --json` reports for the base. Nothing else under the base is a checkout of this run. */
function ompListing(): { ok: boolean; reason?: string; paths: Set<string> } {
  const r = run(["omp", "worktree", "list", "--json"], undefined, { ...process.env, OMP_WORKTREE_DIR: base });
  try {
    if (r.code !== 0) throw new Error(r.err.trim() || `exit ${r.code}`);
    const entries: unknown = JSON.parse(r.out);
    if (!Array.isArray(entries) || !entries.every((e) => typeof e?.path === "string")) throw new Error("unrecognized output");
    return { ok: true, paths: new Set(entries.map((e: { path: string }) => realpath(e.path) || resolve(e.path))) };
  } catch (e) {
    return { ok: false, reason: `cannot read omp worktree list --json for ${base}: ${(e as Error).message}`, paths: new Set() };
  }
}

const ownSession = process.env.PI_SESSION_ID;
let sessionHeaders: SessionHeader[] = [];
let leases: Leases = { ok: false, held: new Map(), unknown: new Map() };
let cwds: { ok: boolean; reason?: string; list: ProcessCwd[] } = { ok: false, list: [] };
let listing: { ok: boolean; reason?: string; paths: Set<string> } = { ok: false, paths: new Set() };
let evidenceGaps: string[] = [];

/** Why the run cannot trust a free lease: it must see its own session's held lease and session file, and every held lease's session. */
function leaseDetectionGap(): string | undefined {
  if (!leases.ok) return leases.reason;
  if (!ownSession) return "PI_SESSION_ID is not set, so the run cannot prove it sees session leases; run clean-wt from an omp session";
  if (!leases.held.has(ownSession)) return `the running session's own lease (${ownSession}) does not show as held under ${ownersDir}`;
  if (!sessionHeaders.some((s) => s.id === ownSession)) return `the running session ${ownSession} has no session file under ${sessionRoots.join(", ")}, so other sessions may be missing too`;
  if (leases.unknown.size > 0) return `live sessions hold leases with no readable session file (${[...leases.unknown.keys()].join(", ")}), so their checkouts are unknown`;
  return undefined;
}

function gatherEvidence() {
  sessionHeaders = readSessions();
  leases = heldLeases([...sessionHeaders.map((s) => s.id), ...(ownSession ? [ownSession] : [])]);
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
  listing = ompListing();
  evidenceGaps = [leaseDetectionGap(), cwds.ok ? undefined : cwds.reason, listing.ok ? undefined : listing.reason].filter((g): g is string => !!g);
}

interface Owner {
  type: "session" | "task" | "process";
  id?: string;
  pid?: number | null;
  file?: string;
  command?: string;
}

type Kind = "linked-worktree" | "orphaned-worktree" | "task-isolation" | "standalone-clone";
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

const TASK_MARKER = ".omp-isolation-owner.json";

/** The live task that owns a sandbox, as omp's marker records it. A pid wearing a different start token is recycled. */
function taskOwner(entry: string): { owner?: Owner; gap?: string } {
  const file = join(entry, TASK_MARKER);
  if (!lstat(file)) return { gap: `${file} is missing, so the run cannot tell whether a task still owns the sandbox` };
  let marker: { pid?: unknown; id?: unknown; startToken?: unknown };
  try {
    marker = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    return { gap: `${file} is unreadable or malformed (${(e as Error).message})` };
  }
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
      if (!parent) continue;
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
  return readdirSync(join(root, clean)).sort().flatMap((n) => expand(root, `${clean}/${n}`));
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
      if (t.startsWith("2 ")) i++; // the rename's original path
    } else if (t.startsWith("u ")) changes.unmerged.push(t.split(" ").slice(10).join(" "));
  }
  for (const rel of ignored) {
    const verdict = compareIgnored(path, ref, rel);
    if (verdict === "unique") changes.ignored_unique.push(rel);
    else if (verdict === "unverified") changes.ignored_unverified.push(rel);
  }
  const listed = Object.values(changes).flat();
  const stamp = [r.out, ...[...listed, ...ignored].map((rel) => {
    const st = lstat(join(path, rel));
    return st ? [rel, st.size, st.mtimeMs, st.ino, st.mode] : [rel];
  })];
  for (const k of Object.keys(changes)) if (changes[k].length === 0) delete changes[k];
  return { state: listed.length > 0 ? "dirty" : "clean", changes, stamp };
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
  const fingerprint = verdict === "owned" ? "" : createHash("sha256").update(JSON.stringify(treeStamp(path))).digest("hex");
  const unreadable = [`the repo no longer has this worktree's registration (${gitdir || "no gitdir line"}), so git cannot read its changes`];
  return { path, entry: path, kind: "orphaned-worktree", verdict, reasons, owners, state: "unknown", changes: { unreadable }, unique_history: [], branch: null, fingerprint, sessions, moved_sessions: moved };
}

function ownersOf(entry: string, entryOwners: Owner[], sessions: SessionLink[]): Owner[] {
  const processOwners = cwds.list.filter((p) => inside(p.cwd, entry)).map((p): Owner => ({ type: "process", pid: p.pid, command: p.command }));
  return [...entryOwners, ...processOwners, ...sessions.filter((s) => s.live).map((s): Owner => ({ type: "session", id: s.id, file: s.file, pid: leases.held.get(s.id) ?? null }))];
}

function inspect(path: string, entry: string, kind: Kind, entryOwners: Owner[], entryGaps: string[]): Checkout {
  const branch = run(["git", "symbolic-ref", "-q", "--short", "HEAD"], path).out.trim() || null;
  const { sessions, moved } = sessionLinks(entry);
  const owners = ownersOf(entry, entryOwners, sessions);
  const { verdict, reasons } = verdictOf(owners, [...evidenceGaps, ...entryGaps]);
  const common = { path, entry, kind, verdict, reasons, owners, branch, sessions, moved_sessions: moved };
  if (verdict === "owned") return { ...common, state: "not checked", changes: {}, unique_history: [], fingerprint: "" };
  const source = sourceOf(path, entry, kind);
  const head = run(["git", "rev-parse", "HEAD"], path).out.trim();
  const work = workState(path, source?.checkout ?? null);
  const unique_history = uniqueHistory(path, kind, source);
  const fingerprint = createHash("sha256").update(JSON.stringify([head, work.stamp, unique_history])).digest("hex");
  return { ...common, state: work.state, changes: work.changes, unique_history, fingerprint };
}

const TASK_MOUNTS = ["m", "merged"];

/** A retained task workspace on a mount backend needs omp's native teardown, which a plain removal would break. */
function retainedMountGap(entry: string): string | undefined {
  const file = join(entry, ".omp-retained-backend.json");
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

function removeTree(entry: string) {
  const st = lstat(entry);
  if (!st?.isDirectory() || !inside(entry, base) || entry === base) throw new Error(`refusing to remove ${entry}: not a dir under ${base}`);
  rmSync(entry, { recursive: true });
}

function classify(path: string, out: Checkout[]): boolean {
  const git = lstat(join(path, ".git"));
  if (git?.isFile()) {
    const { gitdir, exists } = registeredGitDir(path);
    out.push(exists ? inspect(path, path, "linked-worktree", [], []) : inspectOrphan(path, gitdir));
    return true;
  }
  const mounts = TASK_MOUNTS.filter((m) => lstat(join(path, m))?.isDirectory());
  if (lstat(join(path, TASK_MARKER)) || mounts.length > 0) {
    const { owner, gap } = taskOwner(path);
    const gaps = [gap, retainedMountGap(path)].filter((g): g is string => !!g);
    for (const m of mounts) out.push(inspect(join(path, m), path, "task-isolation", owner ? [owner] : [], gaps));
    return true;
  }
  if (git?.isDirectory()) {
    out.push(inspect(path, path, "standalone-clone", [], []));
    return true;
  }
  return false;
}

/**
 * Inspects every checkout among the entries omp lists for the base, including omp's legacy layout one level down:
 * <base>/<encoded-project>/<branch-or-id>. Without omp's listing every dir is inspected, and the evidence gap keeps each one uncertain.
 */
function scan(): Checkout[] {
  const out: Checkout[] = [];
  if (!lstat(base)?.isDirectory()) return out;
  const listed = (p: string) => !listing.ok || listing.paths.has(p);
  for (const name of readdirSync(base).sort()) {
    const path = join(base, name);
    if (!lstat(path)?.isDirectory()) continue;
    if (listed(path) && classify(path, out)) continue;
    for (const child of readdirSync(path).sort()) {
      const childPath = join(path, child);
      if (listed(childPath) && lstat(childPath)?.isDirectory()) classify(childPath, out);
    }
  }
  return out;
}

function rescan(entry: string, path: string): Checkout | undefined {
  const out: Checkout[] = [];
  if (listing.ok && !listing.paths.has(entry)) return undefined;
  if (lstat(entry)?.isDirectory()) classify(entry, out);
  return out.find((c) => c.path === path);
}

function print(v: unknown) {
  process.stdout.write(`${JSON.stringify(v, null, 2)}\n`);
}

function removeAll() {
  if (positionals.length < 2) usage("remove needs at least one <path>=<fingerprint>");
  const known = new Map(scan().map((c) => [c.path, c]));
  const approved = new Set((values.approve ?? []).map((p) => realpath(p) || resolve(p)));
  const targets = positionals.slice(1).map((arg) => {
    const at = arg.lastIndexOf("=");
    const path = realpath(arg.slice(0, at)) || resolve(arg.slice(0, at));
    const fingerprint = arg.slice(at + 1);
    if (at < 0 || !/^[0-9a-f]{64}$/.test(fingerprint)) usage(`${arg} is not <path>=<fingerprint>`);
    const c = known.get(path);
    if (!c) usage(`${path} is not a checkout under ${base}`);
    return { path, entry: c.entry, fingerprint };
  });
  for (const p of approved) if (!targets.some((t) => t.path === p)) usage(`--approve ${p} names no checkout in this removal`);

  const removed: { path: string; method: string }[] = [];
  const skipped: { path: string; reason: string }[] = [];
  const failed: { path: string; error: string }[] = [];
  for (const t of targets) {
    gatherEvidence();
    const c = rescan(t.entry, t.path);
    const needsApproval = !!c && c.state !== "clean";
    let reason: string | undefined;
    if (!c) reason = "it is no longer a checkout that omp lists under the base";
    else if (c.verdict === "owned") reason = `it is in use now: ${c.owners.map((o) => [o.type, o.id, o.pid].filter((v) => v !== undefined && v !== null).join(" ")).join(", ")}`;
    else if (c.verdict !== "unused") reason = `its ownership is uncertain: ${c.reasons.join("; ")}`;
    else if (c.fingerprint !== t.fingerprint) reason = "it changed since the inventory";
    else if (c.unique_history.length > 0) reason = `it holds commits or stashes that exist nowhere else (${c.unique_history.map((h) => h.ref).join(", ")}); push or branch them first`;
    else if (needsApproval && !approved.has(t.path)) reason = `it holds ${c.state} work, and removing it needs --approve`;
    if (reason || !c) {
      skipped.push({ path: t.path, reason: reason! });
      continue;
    }
    try {
      let method: string;
      if (c.kind === "linked-worktree") {
        const commonDir = run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], c.path).out.trim();
        method = needsApproval ? "git worktree remove --force" : "git worktree remove";
        const r = run(["git", `--git-dir=${commonDir}`, "worktree", "remove", ...(needsApproval ? ["--force"] : []), c.path]);
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
print(command === "inventory" ? { base, evidence_gaps: evidenceGaps, checkouts: scan() } : removeAll());

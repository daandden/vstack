import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, readFileSync, readlinkSync, readSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, normalize } from "node:path";

type Owner = "worker" | "omp" | "other" | "unproven";
type Outcome = "omp-managed" | "held" | "exited" | "skipped-reused" | "terminated" | "killed" | "survived";
type Identity = { ppid: number; started: string; zombie: boolean };
type Match = { path: string; identity: Identity | "unreadable" | undefined };
type Inspection = { identity?: Identity; owner: Owner; outcome: "held" | "exited" | "skipped-reused" };
type ProcessArguments = { tag?: string; argv?: string[] };
type ProcessPaths = { cwd: string | undefined; exe: string | undefined };
type Candidate = {
  pid: number;
  ppid: number | null;
  started: string | null;
  command: string | null;
  path: string;
  owner: Owner;
  service: boolean;
  outcome: Outcome;
};
type Worker = {
  id: string;
  checkout: string | null;
  session: string | null;
  release: "hold" | "proceed";
  reason: string | null;
  candidates: Candidate[];
};
type Scan = { ok: true } | { ok: false; reason: string };
type SavedStatus = { workers?: { id: string; state: string; identity?: { path?: unknown } | null }[] };

const LINUX = process.platform === "linux";
const TAG = "OMP_BASH_SESSION=";
const PYTHON_RUNNER_HEADER = Buffer.from('"""OMP Python runner — subprocess wrapper used by the coding-agent host.\n');
const darwinFfi = process.platform === "darwin" ? await import("bun:ffi").catch(() => undefined) : undefined;
const DARWIN_ESRCH = 3;
const CTL_KERN = 1;
const KERN_PROCARGS2 = 49;
const PROC_PIDTBSDINFO = 3;
const PROC_BSDINFO_SIZE = 136;
const SZOMB = 5;
const PROC_PIDVNODEPATHINFO = 9;
const PROC_VNODEPATHINFO_SIZE = 2352;
const PROC_VNODEPATHINFO_CWD_OFFSET = 152;
const MAXPATHLEN = 1024;
const PROC_PIDPATHINFO_MAXSIZE = 4 * MAXPATHLEN;
const PROC_LISTALLPIDS_MAX_BYTES = 0x7fff_ffff;

function requireDarwinFfi() {
  if (!darwinFfi) throw new Error("Darwin process probes are unavailable");
  return darwinFfi;
}

function canonical(path: string): string {
  try { return realpathSync(path); } catch { return path; }
}

function workerSession(id: string, checkout: string): string {
  const parent = process.env.PI_SESSION_FILE;
  if (!parent?.endsWith(".jsonl")) throw new Error("PI_SESSION_FILE does not name a parent .jsonl session");
  const path = join(parent.slice(0, -".jsonl".length), `${id}.jsonl`);
  const fd = openSync(path, "r");
  try {
    const prefix = Buffer.alloc(64 * 1024);
    const length = readSync(fd, prefix, 0, prefix.length, null);
    for (const line of prefix.toString("utf8", 0, length).split("\n", 8)) {
      let record: { type?: unknown; id?: unknown; cwd?: unknown };
      try { record = JSON.parse(line); } catch { continue; }
      if (record?.type !== "session") continue;
      if (typeof record.cwd !== "string" || !isAbsolute(record.cwd) || canonical(record.cwd) !== canonical(checkout)) {
        throw new Error(`worker session cwd does not match the saved checkout: ${path}`);
      }
      if (typeof record.id === "string" && record.id) return record.id;
      break;
    }
    throw new Error(`worker session identity is missing from the session prefix: ${path}`);
  } finally { closeSync(fd); }
}

function native(args: string[], timeout = 2_000) {
  const result = Bun.spawnSync(args, {
    env: { ...process.env, LC_ALL: "C" }, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout,
  });
  if (result.signalCode) throw new Error(`${args[0]} ended with ${result.signalCode}`);
  if ("error" in result && result.error) throw result.error;
  return { out: result.stdout.toString(), err: result.stderr.toString().trim(), code: result.exitCode };
}

function scanPaths(visit: (pid: number, path: string) => void): Scan {
  const scanPid = (pid: number) => {
    if (pid <= 0 || pid === process.pid) return;
    const cwd = processWorkingDirectory(pid);
    if (cwd) visit(pid, cwd);
    const exe = processExecutable(pid);
    if (exe && exe !== cwd) visit(pid, exe);
  };
  try {
    if (LINUX) {
      for (const entry of readdirSync("/proc")) {
        if (/^\d+$/.test(entry)) scanPid(Number(entry));
      }
    } else {
      for (const pid of listDarwinPids()) scanPid(pid);
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: `Could not scan process working directories and executables: ${String(error)}` };
  }
}

function processCommands(pids: number[]): Map<number, string> {
  const commands = new Map<number, string>();
  if (!pids.length) return commands;
  const { out, err, code } = native(["ps", "-ww", "-o", "pid=,command=", "-p", pids.join(",")]);
  // ps exits 1 without a diagnostic when none of the requested PIDs are present.
  if (code !== 0 && !(code === 1 && !out.trim() && !err)) throw new Error(err || `ps exited ${code}`);
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const row = /^\s*(\d+)(?:\s+(.*))?$/.exec(line);
    if (!row) throw new Error("ps returned an unreadable process command row");
    const [, pid, command = ""] = row;
    commands.set(Number(pid), command);
  }
  return commands;
}

function serviceAncestors(services: ReadonlySet<number>): (pid: number) => boolean {
  const { out, err, code } = native(["ps", "-axo", "pid=,ppid="]);
  if (code !== 0 || !out.trim()) throw new Error(err || `ps could not list process parents (exit ${code})`);
  const parents = new Map<number, number>();
  for (const line of out.trim().split("\n")) {
    const row = /^\s*(\d+)\s+(\d+)\s*$/.exec(line);
    if (!row) throw new Error("ps returned an unreadable process parent row");
    parents.set(Number(row[1]), Number(row[2]));
  }
  return (pid) => {
    const seen = new Set<number>();
    while (pid > 0 && !seen.has(pid)) {
      if (services.has(pid)) return true;
      seen.add(pid);
      pid = parents.get(pid) ?? 0;
    }
    return false;
  };
}

function openDarwinKernel() {
  const { dlopen } = requireDarwinFfi();
  return dlopen("/usr/lib/libSystem.B.dylib", {
    sysctl: { args: ["ptr", "u32", "ptr", "ptr", "ptr", "u64"], returns: "i32" },
    __error: { args: [], returns: "ptr" },
    kill: { args: ["i32", "i32"], returns: "i32" },
  });
}

let darwinKernel: ReturnType<typeof openDarwinKernel> | undefined;

function darwinProcessArguments(pid: number, readArgv: boolean): ProcessArguments | undefined {
  const { sysctl } = (darwinKernel ??= openDarwinKernel()).symbols;
  const mib = new Int32Array([CTL_KERN, KERN_PROCARGS2, pid]);
  const size = new BigUint64Array(1);
  if (sysctl(mib, mib.length, null, size, null, 0n) !== 0 || size[0] < 4n || size[0] > 16_777_216n) return;
  const raw = Buffer.alloc(Number(size[0]));
  if (sysctl(mib, mib.length, raw, size, null, 0n) !== 0 || size[0] < 4n || size[0] > raw.length) return;
  const buffer = raw.subarray(0, Number(size[0]));

  // KERN_PROCARGS2 packs argc, the exec path, NUL padding, then argv and environ.
  const argc = buffer.readInt32LE(0);
  const execEnd = buffer.indexOf(0, 4);
  if (argc < 0 || argc > buffer.length || execEnd <= 4) return;
  let at = execEnd + 1;
  while (at < buffer.length && buffer[at] === 0) at++;
  const argv: string[] | undefined = readArgv && (argc === 2 || argc === 3) ? [] : undefined;
  for (let i = 0; i < argc; i++) {
    const end = buffer.indexOf(0, at);
    if (end < 0) return;
    argv?.push(buffer.toString("utf8", at, end));
    at = end + 1;
  }

  let tag: string | undefined;
  while (at < buffer.length && buffer[at] !== 0) {
    const end = buffer.indexOf(0, at);
    if (end < 0) return;
    const equal = buffer.indexOf(0x3d, at);
    if (equal <= at || equal >= end) return;
    if (equal - at === TAG.length - 1 && buffer.toString("latin1", at, equal + 1) === TAG) {
      tag = buffer.toString("utf8", equal + 1, end);
    }
    at = end + 1;
  }
  return { tag, argv };
}

function processArguments(pid: number, readArgv: boolean): ProcessArguments | undefined {
  if (LINUX) {
    const tag = readFileSync(`/proc/${pid}/environ`, "utf8").split("\0").findLast((part) => part.startsWith(TAG))?.slice(TAG.length);
    if (tag !== undefined || !readArgv) return { tag };
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf8");
    if (cmdline.endsWith("\0")) return { argv: cmdline.slice(0, -1).split("\0") };
  } else if (process.platform === "darwin") {
    return darwinProcessArguments(pid, readArgv);
  }
}

function openDarwinProcessInfo() {
  const { dlopen, toBuffer } = requireDarwinFfi();
  const errno = (darwinKernel ??= openDarwinKernel()).symbols.__error();
  if (errno === null) throw new Error("Darwin native errno is unreadable");
  return {
    lib: dlopen("/usr/lib/libproc.dylib", {
      proc_listallpids: { args: ["ptr", "i32"], returns: "i32" },
      proc_pidinfo: { args: ["i32", "i32", "u64", "ptr", "i32"], returns: "i32" },
      proc_pidpath: { args: ["i32", "ptr", "u32"], returns: "i32" },
    }),
    buffer: Buffer.alloc(PROC_BSDINFO_SIZE),
    pathBuffer: Buffer.alloc(PROC_PIDPATHINFO_MAXSIZE),
    errno: toBuffer(errno, 0, 4),
  };
}

let darwinProcessInfo: ReturnType<typeof openDarwinProcessInfo> | undefined;

function listDarwinPids(): Int32Array {
  const { lib, errno } = darwinProcessInfo ??= openDarwinProcessInfo();
  const { proc_listallpids } = lib.symbols;
  errno.writeInt32LE(0);
  let capacity = proc_listallpids(null, 0);
  if (capacity <= 0) throw new Error(`proc_listallpids could not size the PID list (errno ${errno.readInt32LE()})`);
  while (capacity * Int32Array.BYTES_PER_ELEMENT <= PROC_LISTALLPIDS_MAX_BYTES) {
    const pids = new Int32Array(capacity);
    errno.writeInt32LE(0);
    const count = proc_listallpids(pids, pids.byteLength);
    if (count <= 0) throw new Error(`proc_listallpids could not read the PID list (errno ${errno.readInt32LE()})`);
    if (count < capacity) return pids.subarray(0, count);
    capacity = Math.max(count + 1, capacity * 2);
  }
  throw new Error("proc_listallpids could not fit the PID list in its buffer");
}

function linuxProcessIdentity(pid: number): Identity | undefined {
  let stat: string;
  try { stat = readFileSync(`/proc/${pid}/stat`, "utf8"); }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ESRCH") return;
    throw error;
  }
  // The comm field can contain spaces or parentheses. The state follows its final ")".
  const end = stat.lastIndexOf(")");
  const fields = stat.slice(end + 2).split(" ", 20);
  if (end < 0 || fields[0]?.length !== 1 || !/^\d+$/.test(fields[1] ?? "") || !/^\d+$/.test(fields[19] ?? "")) {
    throw new Error(`Unreadable process identity for PID ${pid}`);
  }
  return { zombie: fields[0] === "Z", ppid: Number(fields[1]), started: fields[19] };
}

function darwinLookupMeansNotRunning(pid: number, code: number, errno: Buffer): boolean {
  if (code !== DARWIN_ESRCH) return false;
  // proc_pidinfo omits zombies. Signal 0 succeeds for a zombie without delivering a signal.
  errno.writeInt32LE(0);
  const result = darwinKernel!.symbols.kill(pid, 0);
  const killError = errno.readInt32LE();
  return result === 0 || (result === -1 && killError === DARWIN_ESRCH);
}

function darwinProcessIdentity(pid: number): Identity | undefined {
  const { lib, buffer, errno } = darwinProcessInfo ??= openDarwinProcessInfo();
  errno.writeInt32LE(0);
  const bytes = lib.symbols.proc_pidinfo(pid, PROC_PIDTBSDINFO, 0n, buffer, buffer.length);
  const code = errno.readInt32LE();
  if (bytes !== buffer.length) {
    if (darwinLookupMeansNotRunning(pid, code, errno)) return;
    throw new Error(`Unreadable process identity for PID ${pid}`);
  }
  const sec = buffer.readBigUInt64LE(120);
  const usec = buffer.readBigUInt64LE(128);
  if (buffer.readUInt32LE(12) !== pid || usec > 999_999n) throw new Error(`Invalid process identity for PID ${pid}`);
  return {
    zombie: buffer.readUInt32LE(4) === SZOMB,
    ppid: buffer.readUInt32LE(16),
    started: `${sec}.${String(usec).padStart(6, "0")}`,
  };
}

function processIdentity(pid: number): Identity | undefined {
  if (LINUX) return linuxProcessIdentity(pid);
  if (process.platform === "darwin") return darwinProcessIdentity(pid);
}

function nulPath(buffer: Buffer, start: number, limit: number): string | undefined {
  const end = buffer.indexOf(0, start);
  if (end > start && end < limit) {
    const path = buffer.toString("utf8", start, end);
    if (isAbsolute(path)) return path;
  }
}

function linuxProcessPath(pid: number, name: "cwd" | "exe"): string | undefined {
  try { return readlinkSync(`/proc/${pid}/${name}`); } catch { return; }
}

function processWorkingDirectory(pid: number): string | undefined {
  if (LINUX) return linuxProcessPath(pid, "cwd");
  const { lib, pathBuffer } = darwinProcessInfo ??= openDarwinProcessInfo();
  if (lib.symbols.proc_pidinfo(pid, PROC_PIDVNODEPATHINFO, 0n, pathBuffer, PROC_VNODEPATHINFO_SIZE) !== PROC_VNODEPATHINFO_SIZE) return;
  return nulPath(pathBuffer, PROC_VNODEPATHINFO_CWD_OFFSET, PROC_VNODEPATHINFO_CWD_OFFSET + MAXPATHLEN);
}

function processExecutable(pid: number): string | undefined {
  if (LINUX) return linuxProcessPath(pid, "exe");
  const { lib, pathBuffer } = darwinProcessInfo ??= openDarwinProcessInfo();
  const length = lib.symbols.proc_pidpath(pid, pathBuffer, pathBuffer.length);
  if (length > 0 && length <= pathBuffer.length) {
    return nulPath(pathBuffer, 0, Math.min(length + 1, pathBuffer.length));
  }
}

function checkoutProcessPaths(pid: number, checkout: string, real: string): ProcessPaths | undefined {
  const cwd = processWorkingDirectory(pid);
  const exe = processExecutable(pid);
  if ((cwd && matchesCheckout(cwd, checkout, real)) || (exe && matchesCheckout(exe, checkout, real))) {
    return { cwd, exe };
  }
}

function hasPythonRunnerHeader(path: string): boolean {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const file = fstatSync(fd);
    if (!file.isFile() || file.uid !== process.getuid?.()) return false;
    const byte = Buffer.allocUnsafe(1);
    for (const expected of PYTHON_RUNNER_HEADER) {
      if (readSync(fd, byte, 0, 1, null) !== 1 || byte[0] !== expected) return false;
    }
    return true;
  } finally {
    closeSync(fd);
  }
}

function isOmpEvalKernel(argv: string[], parent: number, { cwd, exe }: ProcessPaths, checkout: string, real: string): boolean {
  if (!exe) return false;
  if (argv.length === 2 && argv[1] === "__omp_worker_js_eval_process") return exe === processExecutable(parent);
  if (argv.length !== 3 || argv[1] !== "-u") return false;
  if (matchesCheckout(exe, checkout, real) || matchesCheckout(canonical(exe), checkout, real)) return false;

  const runner = isAbsolute(argv[2]) ? argv[2] : cwd && `${cwd}/${argv[2]}`;
  const interpreter = isAbsolute(argv[0]) ? argv[0] : cwd && `${cwd}/${argv[0]}`;
  if (!runner || !interpreter) return false;
  const runnerName = basename(runner);
  const runnerDir = dirname(runner);
  const dirName = basename(runnerDir);
  if (!/^omp-python-runner-\d+$/.test(dirName) || !/^runner-[a-z0-9]+\.py$/.test(runnerName)) return false;

  if (matchesCheckout(normalize(runner), checkout, real) || matchesCheckout(normalize(interpreter), checkout, real) ||
      matchesCheckout(canonical(interpreter), checkout, real)) return false;

  const uid = process.getuid?.();
  const directory = lstatSync(runnerDir);
  if (!directory.isDirectory() || directory.uid !== uid || (directory.mode & 0o7777) !== 0o700) return false;
  const file = lstatSync(runner);
  if (!file.isFile() || file.uid !== uid) return false;

  const realRunner = realpathSync(runner);
  if (realRunner !== join(realpathSync(tmpdir()), dirName, runnerName) || matchesCheckout(realRunner, checkout, real)) return false;
  return hasPythonRunnerHeader(realRunner);
}

function discoveryIdentity(pid: number): Match["identity"] {
  try { return processIdentity(pid); } catch { return "unreadable"; }
}

function inspectCandidate(pid: number, discovered: Match["identity"], session: string | null, checkout: string, real: string): Inspection {
  if (discovered === "unreadable") return { owner: "unproven", outcome: "held" };
  if (!discovered || discovered.zombie) return { identity: discovered, owner: "unproven", outcome: "exited" };
  let identity: Identity | undefined;
  try {
    const current = processIdentity(pid);
    if (!current || current.zombie) return { identity: discovered, owner: "unproven", outcome: "exited" };
    if (current.started !== discovered.started) return { identity: discovered, owner: "unproven", outcome: "skipped-reused" };
    identity = current;
    const parent = process.ppid;
    const sameParent = identity.ppid === parent;
    if (session || sameParent) {
      const paths = checkoutProcessPaths(pid, checkout, real);
      if (paths) {
        const args = processArguments(pid, sameParent);
        const ompKernel = sameParent && args?.tag === undefined && args?.argv && isOmpEvalKernel(args.argv, parent, paths, checkout, real);
        const confirmed = processIdentity(pid);
        if (confirmed && !confirmed.zombie && confirmed.started === identity.started) {
          if (session && args?.tag !== undefined) return { identity, owner: args.tag === session ? "worker" : "other", outcome: "held" };
          if (ompKernel && confirmed.ppid === parent) return { identity, owner: "omp", outcome: "held" };
        }
      }
    }
  } catch {}
  return { identity, owner: "unproven", outcome: "held" };
}

function pathInside(path: string, checkout: string): boolean {
  return path === checkout || path.startsWith(checkout.endsWith("/") ? checkout : `${checkout}/`);
}

function matchesCheckout(path: string, checkout: string, real: string): boolean {
  return pathInside(path, checkout) || (checkout !== real && pathInside(path, real));
}

function recheckCandidate(candidate: Candidate, afterTerm = false): boolean {
  const current = processIdentity(candidate.pid);
  if (!current || current.zombie) candidate.outcome = afterTerm ? "terminated" : "exited";
  else if (current.started !== candidate.started) candidate.outcome = afterTerm ? "terminated" : "skipped-reused";
  else return true;
  return false;
}

function preflight(candidates: Candidate[]): boolean {
  let readable = true;
  for (const candidate of candidates) {
    if (candidate.outcome !== "held") continue;
    try { recheckCandidate(candidate); }
    catch {
      candidate.owner = "unproven";
      readable = false;
    }
  }
  return readable;
}

function signalCandidates(
  candidates: Iterable<Candidate>,
  signal: "SIGTERM" | "SIGKILL",
  waitMs: number,
) {
  const afterTerm = signal === "SIGKILL";
  const done = afterTerm ? "killed" : "terminated";
  const pending = new Map<number, Candidate>();
  let stoppedAt: number | null = null;
  for (const candidate of candidates) {
    if (signal === "SIGTERM" && candidate.outcome !== "held") continue;
    const { pid } = candidate;
    try {
      if (!recheckCandidate(candidate, afterTerm)) continue;
    } catch {
      if (signal === "SIGTERM") candidate.owner = "unproven";
      stoppedAt = pid;
      break;
    }
    try {
      process.kill(pid, signal);
      candidate.outcome = "survived";
      pending.set(pid, candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") {
        candidate.outcome = afterTerm ? "terminated" : "exited";
      } else {
        candidate.outcome = "survived";
      }
    }
  }
  const deadline = performance.now() + waitMs;
  while (pending.size && performance.now() < deadline) {
    for (const [pid, candidate] of pending) {
      let current: Identity | undefined;
      try { current = processIdentity(pid); } catch { continue; }
      if (current && !current.zombie && current.started === candidate.started) continue;
      candidate.outcome = done;
      pending.delete(pid);
    }
    if (pending.size) Bun.sleepSync(Math.max(0, Math.min(20, deadline - performance.now())));
  }
  return { pending, stoppedAt };
}

export function workerProcesses(ids: string[], before: SavedStatus | null, services: ReadonlySet<number>) {
  const savedWorkers = Array.isArray(before?.workers) ? before.workers : [];
  const workers: Worker[] = ids.map((id) => {
    const saved = savedWorkers.find((entry) => entry?.id === id);
    const path = saved?.identity?.path;
    const checkout = saved?.state === "present" && typeof path === "string" && isAbsolute(path) ? path : null;
    const worker: Worker = { id, checkout, session: null, release: "hold", reason: null, candidates: [] };
    if (!checkout) worker.reason = "Saved status does not prove this worker was present";
    else {
      try { worker.session = workerSession(id, checkout); }
      catch (error) { worker.reason = String(error); }
    }
    return worker;
  });
  const targets = workers.flatMap((worker) => worker.checkout ? [{
    worker, path: worker.checkout, real: canonical(worker.checkout), matches: new Map<number, Match>(),
  }] : []);
  let scan = scanPaths((pid, path) => {
    let match: Match | undefined;
    for (const target of targets) {
      if (!target.matches.has(pid) && matchesCheckout(path, target.path, target.real)) {
        target.matches.set(pid, match ??= { path, identity: discoveryIdentity(pid) });
      }
    }
  });
  let commands = new Map<number, string>();
  let isService: (pid: number) => boolean = () => false;
  if (scan.ok) {
    try {
      const pids = new Set<number>();
      for (const { matches } of targets) for (const pid of matches.keys()) pids.add(pid);
      commands = processCommands([...pids]);
      if (services.size && pids.size) isService = serviceAncestors(services);
    } catch (error) {
      scan = { ok: false, reason: `Could not read candidate process facts: ${String(error)}` };
    }
  }
  for (const { worker, matches, path: checkout, real } of targets) {
    for (const [pid, { path, identity: discovered }] of matches) {
      const { identity, owner, outcome }: Inspection = scan.ok
        ? inspectCandidate(pid, discovered, worker.session, checkout, real)
        : { owner: "unproven", outcome: "held" };
      worker.candidates.push({
        pid, path, owner, service: outcome === "held" && owner !== "omp" && isService(pid),
        outcome: owner === "omp" ? "omp-managed" : outcome, command: commands.get(pid) ?? null,
        ppid: identity?.ppid ?? null, started: identity?.started ?? null,
      });
    }
  }
  if (!scan.ok) {
    for (const worker of workers) worker.reason = scan.reason;
    return { scan, workers };
  }
  for (const { worker } of targets) {
    if (worker.candidates.some(({ service }) => service)) {
      worker.reason = "A candidate is part of a retained service";
      continue;
    }
    if (worker.candidates.some(({ owner, outcome }) => outcome === "held" && owner !== "worker")) {
      worker.reason ??= worker.candidates.some(({ owner }) => owner === "other")
        ? "A candidate belongs to another session"
        : "A candidate's worker ownership is unproven";
      continue;
    }
    if (!preflight(worker.candidates)) {
      worker.reason = "A candidate's identity could not be read during preflight";
      continue;
    }
    const term = signalCandidates(worker.candidates, "SIGTERM", 2_000);
    const stoppedAt = term.stoppedAt ?? signalCandidates(term.pending.values(), "SIGKILL", 1_000).stoppedAt;
    if (stoppedAt !== null) {
      worker.reason = `Signaling stopped partway through the worker batch: could not recheck PID ${stoppedAt}`;
      continue;
    }
    if (worker.candidates.some(({ outcome }) => outcome === "survived")) {
      worker.reason = "A candidate did not exit after signaling";
      continue;
    }
    worker.release = "proceed";
  }
  return { scan, workers };
}

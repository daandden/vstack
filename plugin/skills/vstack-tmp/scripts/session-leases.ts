import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

type SessionLease =
  | { state: "held"; pid: number | null }
  | { state: "free" }
  | { state: "unknown"; reason: string };

type UnnamedHolders = { holders: Map<string, number | null> } & (
  | { available: true }
  | { available: false; reason: string }
);

interface NativeScan {
  code: number;
  out: string;
  err: string;
}

interface LeaseObservations {
  sessions: Map<string, SessionLease>;
  unnamed: UnnamedHolders;
  scanError?: string;
}

export function sessionOwnersDir(home: string): string {
  return resolve(home, ".omp", "run", "session-owners");
}

/** omp hashes ids that cannot be used as plain lock names. */
export function sessionLeaseName(id: string): string {
  return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : `h-${Bun.hash.wyhash(id).toString(16).padStart(16, "0")}`;
}

function leasePath(ownersDir: string, id: string): string {
  return resolve(ownersDir, `${sessionLeaseName(id)}.lock`);
}

/** On Linux, omp binds an abstract Unix socket named by two xxHash64 hashes of the lock path. */
function abstractLockName(lockPath: string): string {
  const high = Bun.hash.xxHash64(lockPath, 0x4f4d502d4c4f434bn).toString(16).padStart(16, "0");
  const low = Bun.hash.xxHash64(lockPath, 0x50492d46494c454cn).toString(16).padStart(16, "0");
  return `omp-file-lock-${high}${low}`;
}

function scanNative(ownersDir: string): NativeScan {
  const r = Bun.spawnSync(["lsof", "+d", ownersDir, "-Fpcfn"], { stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

/** An absent id is free only if this scan saw the witness held. Positive observations do not need a witness. */
export function readSessionLeases(
  ids: Iterable<string>,
  witness: string | undefined,
  home: string,
  options: { ownersDir?: string; nativeScan?: NativeScan } = {},
): LeaseObservations {
  const ownersDir = options.ownersDir ?? sessionOwnersDir(home);
  const requested = new Set(ids);
  const sessions = new Map<string, SessionLease>();
  const holders = new Map<string, number | null>();
  const failed = (reason: string): LeaseObservations => {
    for (const id of requested) sessions.set(id, { state: "unknown", reason });
    return { sessions, unnamed: { available: false, reason, holders }, scanError: reason };
  };
  let witnessed = false;
  if (process.platform === "linux") {
    let table: string;
    try {
      table = readFileSync("/proc/net/unix", "utf8");
    } catch (e) {
      return failed(`cannot read /proc/net/unix: ${(e as Error).message}`);
    }
    const bound = new Set<string>();
    for (const line of table.split("\n")) {
      const name = line.trim().split(/\s+/)[7];
      if (name?.startsWith("@omp-file-lock-")) bound.add(name.slice(1));
    }
    const isHeld = (id: string) => bound.has(abstractLockName(leasePath(ownersDir, id)));
    witnessed = !!witness && isHeld(witness);
    for (const id of requested) if (id === witness ? witnessed : isHeld(id)) sessions.set(id, { state: "held", pid: null });
  } else if (process.platform === "win32") {
    return failed("omp's session leases are named mutexes on Windows, which this script cannot read");
  } else {
    let scan: NativeScan;
    try {
      scan = options.nativeScan ?? scanNative(ownersDir);
    } catch (e) {
      return failed(`lsof failed on ${ownersDir}: ${(e as Error).message}`);
    }
    if (scan.code !== 0 && scan.code !== 1) return failed(`lsof failed on ${ownersDir}: ${scan.err.trim() || `exit ${scan.code}`}`);
    const wanted = new Map<string, string>();
    for (const id of requested) wanted.set(leasePath(ownersDir, id), id);
    const witnessPath = witness ? leasePath(ownersDir, witness) : undefined;
    let pid: number | null = null;
    let descriptor = "";
    for (const line of scan.out.split("\n")) {
      if (line.startsWith("p")) { pid = Number(line.slice(1)); descriptor = ""; }
      else if (line.startsWith("f")) descriptor = line.slice(1);
      else if (line.startsWith("n") && descriptor !== "cwd" && line.endsWith(".lock")) {
        const path = line.slice(1);
        if (dirname(path) !== ownersDir) continue;
        const id = wanted.get(path);
        if (id !== undefined) sessions.set(id, { state: "held", pid });
        else if (path !== witnessPath) holders.set(basename(path, ".lock"), pid);
        if (path === witnessPath) witnessed = true;
      }
    }
  }
  const gap = !witness ? "no witness session id was supplied"
    : witnessed ? undefined
    : `the running session's own lease (${witness}) does not show as held under ${ownersDir}`;
  for (const id of requested) {
    if (!sessions.has(id)) sessions.set(id, gap ? { state: "unknown", reason: gap } : { state: "free" });
  }
  const reason = process.platform === "linux" ? "unnamed lease holders cannot be enumerated on Linux" : gap;
  return { sessions, unnamed: reason ? { available: false, reason, holders } : { available: true, holders } };
}

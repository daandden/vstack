import type { Subprocess } from "bun";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

type LeaseLocation = ({ home: string } | { ownersDir: string }) & { sessionFile?: string };

export async function holdSessionLease(id: string, location: LeaseLocation) {
  const ownersDir = "home" in location ? resolve(location.home, ".omp", "run", "session-owners") : location.ownersDir;
  mkdirSync(ownersDir, { recursive: true, mode: 0o700 });
  const name = /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : `h-${Bun.hash.wyhash(id).toString(16).padStart(16, "0")}`;
  const lockPath = resolve(ownersDir, `${name}.lock`);
  let arg = lockPath;
  let code: string;
  if (process.platform === "linux") {
    const high = Bun.hash.xxHash64(lockPath, 0x4f4d502d4c4f434bn).toString(16).padStart(16, "0");
    const low = Bun.hash.xxHash64(lockPath, 0x50492d46494c454cn).toString(16).padStart(16, "0");
    arg = `omp-file-lock-${high}${low}`;
    code = `import socket,sys,time
s=socket.socket(socket.AF_UNIX,socket.SOCK_DGRAM)
s.bind(chr(0)+sys.argv[1])`;
  } else {
    code = `import fcntl,sys,time
f=open(sys.argv[1],'a')
fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)`;
  }
  code += `
kept=[open(p) for p in sys.argv[2:]]
print('ready',flush=True)
time.sleep(3600)`;
  const child = Bun.spawn(["python3", "-c", code, arg, ...(location.sessionFile ? [location.sessionFile] : [])], {
    stdout: "pipe", stderr: "inherit",
  });
  const reader = child.stdout.getReader();
  try {
    const { value } = await reader.read();
    if (new TextDecoder().decode(value).trim() !== "ready") throw new Error(`lease holder did not start for ${id}`);
    return child;
  } catch (error) {
    await stopSessionLeaseHolders([child]);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export async function stopSessionLeaseHolders(holders: readonly Subprocess[]) {
  for (const holder of holders) holder.kill();
  await Promise.all(holders.map((holder) => holder.exited));
}

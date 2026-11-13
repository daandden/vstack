import { homedir } from "node:os";

export function resolveOvnfs(configured?: string | null, cwd = process.cwd()): string {
  if (configured === undefined) {
    const omp = Bun.which("omp");
    if (omp) {
      const result = Bun.spawnSync([omp, "config", "get", "ovnfs.path"], { cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 15_000 });
      if (result.exitCode !== 0) throw new Error(`Cannot read omp ovnfs.path: ${result.stderr.toString().trim() || result.exitCode}`);
      configured = result.stdout.toString().trim().replace(/^"|"$/g, "");
    }
  }
  const path = configured?.trim() && configured !== "(not set)" ? configured.replace(/^~(?=\/)/, homedir()) : "ovnfs";
  const binary = Bun.which(path, { cwd });
  if (!binary) throw new Error(`ovnfs is not executable at ${path}. Run /skill:setup-vstack to install and configure it.`);
  return binary;
}

/** From v0.4.0, ovnfs gives a source repository one remote `ovnfs/NAME` per live checkout of it. */
export function isOvnfsRemote(name: string): boolean {
  return name.startsWith("ovnfs/");
}

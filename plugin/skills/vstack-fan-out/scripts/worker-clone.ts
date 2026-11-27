import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { locateWorkers } from "./checkout-locator.ts";

function run(args: string[], env = process.env) {
  const r = Bun.spawnSync(args, { env, stdout: "pipe", stderr: "pipe", timeout: 15_000 });
  if ("error" in r && r.error) throw r.error;
  if (r.exitCode !== 0) throw new Error(r.stderr.toString().trim() || `exit ${r.exitCode}`);
  return r.stdout.toString().trim();
}

function parseServices(args: string[]): Set<number> | undefined {
  const pids = new Set<number>();
  for (let i = 0; i < args.length; i += 2) {
    const value = args[i + 1];
    const pid = Number(value);
    if (args[i] !== "--service" || !value || !/^\d+$/.test(value) || pid < 1 || pid > 0x7fffffff) return;
    pids.add(pid);
  }
  return pids;
}

const [command, ...args] = process.argv.slice(2);
const beforeIndex = args.indexOf("--before");
const beforePath = beforeIndex >= 0 ? args[beforeIndex + 1] : undefined;
const ids = beforeIndex >= 0 ? args.slice(0, beforeIndex) : args;
const statusArgs = command === "status" && (beforeIndex < 0 || (beforePath && beforeIndex === args.length - 2));
const services = command === "processes" && beforePath && !beforePath.startsWith("-") &&
  ids.every((id) => !/[\\/]/.test(id)) ? parseServices(args.slice(beforeIndex + 2)) : undefined;
if (!ids.length || ids.some((id) => !id.trim() || id.startsWith("-")) || (!statusArgs && !services)) {
  console.error("usage: worker-clone.ts status <agent-id>... [--before <saved-status.json>] | processes <agent-id>... --before <saved-status.json> [--service <pid>]...");
  process.exit(2);
}

try {
  if (command === "processes") {
    const { workerProcesses } = await import("./worker-processes.ts");
    const before = JSON.parse(readFileSync(beforePath!, "utf8"));
    console.log(JSON.stringify(workerProcesses(ids, before, services!), null, 2));
  } else {
    const repo = resolve(run(["git", "rev-parse", "--show-toplevel"]));
    const before = beforePath ? JSON.parse(readFileSync(beforePath, "utf8")) : undefined;
    console.log(JSON.stringify(locateWorkers(repo, ids, before), null, 2));
  }
} catch (e) {
  console.error(String(e));
  process.exit(2);
}

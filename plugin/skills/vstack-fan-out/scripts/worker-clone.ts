import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { locateWorkers } from "./checkout-locator.ts";

function run(args: string[], env = process.env) {
  const r = Bun.spawnSync(args, { env, stdout: "pipe", stderr: "pipe", timeout: 15_000 });
  if ("error" in r && r.error) throw r.error;
  if (r.exitCode !== 0) throw new Error(r.stderr.toString().trim() || `exit ${r.exitCode}`);
  return r.stdout.toString().trim();
}

const [command, ...args] = process.argv.slice(2);
const beforeIndex = args.indexOf("--before");
const beforePath = beforeIndex >= 0 ? args[beforeIndex + 1] : undefined;
const ids = beforeIndex >= 0 ? args.slice(0, beforeIndex) : args;
if (command !== "status" || !ids.length || ids.some((id) => !id.trim() || id.startsWith("-")) ||
  (beforeIndex >= 0 && (!beforePath || beforeIndex !== args.length - 2))) {
  console.error("usage: worker-clone.ts status <agent-id>... [--before <saved-status.json>]");
  process.exit(2);
}

try {
  const repo = resolve(run(["git", "rev-parse", "--show-toplevel"]));
  const before = beforePath ? JSON.parse(readFileSync(beforePath, "utf8")) : undefined;
  console.log(JSON.stringify(locateWorkers(repo, ids, before), null, 2));
} catch (e) {
  console.error(String(e));
  process.exit(2);
}

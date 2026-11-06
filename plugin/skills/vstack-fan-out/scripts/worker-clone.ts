import { resolve } from "node:path";
import { locateWorkers } from "./checkout-locator.ts";

function run(args: string[], env = process.env) {
  const r = Bun.spawnSync(args, { env, stdout: "pipe", stderr: "pipe", timeout: 15_000 });
  if ("error" in r && r.error) throw r.error;
  if (r.exitCode !== 0) throw new Error(r.stderr.toString().trim() || `exit ${r.exitCode}`);
  return r.stdout.toString().trim();
}

const [command, ...ids] = process.argv.slice(2);
if (command !== "status" || !ids.length || ids.some((id) => !id.trim() || id.startsWith("-"))) {
  console.error("usage: worker-clone.ts status <agent-id>...");
  process.exit(2);
}

try {
  const repo = resolve(run(["git", "rev-parse", "--show-toplevel"]));
  console.log(JSON.stringify(locateWorkers(repo, ids), null, 2));
} catch (e) {
  console.error(String(e));
  process.exit(2);
}

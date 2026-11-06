import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const dir = join(process.env.HOME!, ".omp", "agent");
const file = join(dir, "config.yml");
const config = (Bun.YAML.parse(readFileSync(file, "utf8")) ?? {}) as Record<string, any>;
const defaults: Record<string, unknown> = {
  "modelRoles": {},
  "task.agentModelOverrides": {},
  "disabledExtensions": [],
  "eval.py": true,
  "task.isolation.enabled": false,
  "worktree.clone": true,
  "ratchet.enabled": false,
  "isolation.backend": "auto",
  "bash.gitGuard": false,
  "ovnfs.path": undefined,
};
if (args.join(" ") === "config list --json") {
  const entries: Record<string, { value?: unknown }> = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = key.split(".").reduce((value, part) => value?.[part], config) ?? fallback;
    entries[key] = value === undefined ? {} : { value };
  }
  console.log(JSON.stringify(entries));
} else if (args.join(" ") === "config path") {
  console.log(dir);
} else if (args[0] === "config" && args[1] === "set" && args.length === 4) {
  const parts = args[2]!.split(".");
  let target = config;
  for (const part of parts.slice(0, -1)) target = target[part] ??= {};
  target[parts.at(-1)!] = Bun.YAML.parse(args[3]!);
  writeFileSync(file, Bun.YAML.stringify(config));
  appendFileSync(join(dir, "writes.jsonl"), `${JSON.stringify(args.slice(2))}\n`);
} else if (args.join(" ") === "setup python --check --json") {
  console.log(JSON.stringify({ pythonPath: "/fake/python" }));
  if (process.env.FAKE_OMP_PYTHON_FAIL) process.exit(1);
} else if (args.join(" ") === "token typesafe") {
  process.exit(process.env.TYPESAFE_API_KEY ? 0 : 1);
} else {
  console.error(`fake omp cannot run: ${args.join(" ")}`);
  process.exit(1);
}

import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SMOKE = join(import.meta.dir, "..", "scripts", "load-smoke.sh");
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const STUB = `#!/usr/bin/env bash
mkdir -p "$HOME/.omp/natives/1.0.0" && echo addon >"$HOME/.omp/natives/1.0.0/pi_natives.node"
case "$1" in
  plugin) echo linked ;;
  --mode) cat >/dev/null
    echo '{"type":"response","id":"s","data":{"systemPrompt":["<skills>\\n- one: One.\\n</skills>"],"dumpTools":[]}}'
    echo '{"type":"response","id":"c","data":{"commands":[{"source":"skill","name":"skill:one"}]}}' ;;
  skill) echo '{"skills":[],"warnings":[]}' ;;
esac
`;

test("load smoke keeps its evidence and the home's config but removes the home's native cache", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "load-smoke-test-"))); dirs.push(dir);
  const bin = join(dir, "bin"), plugin = join(dir, "plugin"), out = join(dir, "out");
  mkdirSync(bin); mkdirSync(plugin);
  writeFileSync(join(bin, "omp"), STUB); chmodSync(join(bin, "omp"), 0o755);
  const r = Bun.spawnSync(["bash", SMOKE, plugin, out], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, stdout: "pipe", stderr: "pipe" });
  expect(r.exitCode).toBe(0);
  expect(JSON.parse(readFileSync(join(out, "summary.json"), "utf8")).skillCommands).toEqual(["one"]);
  expect(existsSync(join(out, "home", ".omp", "agent", "models.yml"))).toBe(true);
  expect(existsSync(join(out, "home", ".omp", "natives"))).toBe(false);
});

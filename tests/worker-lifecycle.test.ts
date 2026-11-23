import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { writeExecutable } from "./support/executable.ts";

const checkout = resolve(import.meta.dir, "..");
const script = join(checkout, ".omp/skills/verify-vstack/scripts/worker-lifecycle.ts");

test.each([false, true])("worker-lifecycle discovers the ovnfs namespace under the calling home, overrides=%s", overrides => {
  const fixture = mkdtempSync(join(tmpdir(), "lifecycle-ovnfs-"));
  try {
    const bin = join(fixture, "bin"), home = join(fixture, "caller"), run = join(fixture, "run");
    const configured = { state: join(fixture, "configured's state"), mount: join(fixture, "configured $mount") };
    const override = { state: join(fixture, "override's state"), mount: join(fixture, "override $mount") };
    const expected = overrides ? override : configured;
    const calls = join(fixture, "ovnfs.log");
    mkdirSync(bin); mkdirSync(home);
    writeExecutable(join(bin, "ovnfs"), "bun", `
      import { appendFileSync } from "node:fs";
      const args = Bun.argv.slice(2);
      const env = process.env;
      appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ args, home: env.HOME, state: env.OVNFS_STATE, mount: env.OVNFS_MOUNT }) + "\\n");
      console.log(JSON.stringify({ state: env.OVNFS_STATE ?? ${JSON.stringify(configured.state)}, mount: env.OVNFS_MOUNT ?? ${JSON.stringify(configured.mount)} }));
    `);
    writeExecutable(join(bin, "omp"), "bun", `
      const [command, set, key, value] = Bun.argv.slice(2);
      if (command === "config" && set === "set" && key === "ovnfs.path") {
        const probe = Bun.spawnSync([value, "--json", "status"], { env: process.env });
        if (probe.exitCode) process.exit(probe.exitCode);
        console.error("fixture stopped before live drive");
        process.exit(1);
      }
    `);
    const proc = Bun.spawnSync([process.execPath, script, checkout, run], {
      env: { PATH: `${bin}:${process.env.PATH}`, HOME: home, ...(overrides ? { OVNFS_STATE: override.state, OVNFS_MOUNT: override.mount } : {}) },
    });
    expect(proc.exitCode).toBe(1);
    expect(proc.stderr.toString()).toContain("fixture stopped before live drive");
    expect(readFileSync(calls, "utf8").trim().split("\n").map(line => JSON.parse(line))).toEqual([
      { args: ["--json", "status"], home, ...(overrides ? override : {}) },
      { args: ["--json", "status"], home: join(run, "data", "home"), ...expected },
    ]);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

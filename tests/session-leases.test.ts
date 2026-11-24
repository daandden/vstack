import { afterEach, beforeEach, expect, test } from "bun:test";
import type { Subprocess } from "bun";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeExecutable } from "./support/executable.ts";
import { holdSessionLease, stopSessionLeaseHolders } from "./support/session-lease-holder.ts";

const MODULE = join(import.meta.dir, "../plugin/skills/vstack-tmp/scripts/session-leases.ts");
const WITNESS = "fixture-witness";
const HELD = "held/session";
const FREE = "free-session";
const UNNAMED = "unnamed-session";
let home: string;
let holders: Subprocess[];

beforeEach(() => {
  home = realpathSync(mkdtempSync(join(tmpdir(), "session-leases-test-")));
  holders = [];
});

afterEach(async () => {
  await stopSessionLeaseHolders(holders);
  rmSync(home, { recursive: true, force: true });
});

function observe(witness: string, path = process.env.PATH) {
  const proc = Bun.spawnSync([process.execPath, "-e", `
    import { readSessionLeases } from ${JSON.stringify(MODULE)};
    const result = readSessionLeases(${JSON.stringify([HELD, FREE])}, ${JSON.stringify(witness)}, ${JSON.stringify(home)});
    console.log(JSON.stringify({
      sessions: Object.fromEntries(result.sessions),
      unnamed: { ...result.unnamed, holders: Object.fromEntries(result.unnamed.holders) },
    }));
  `], {
    env: { ...process.env, HOME: join(home, "wrong-home"), USERPROFILE: join(home, "wrong-home"), PI_SESSION_ID: "wrong-witness", PATH: path },
    stdout: "pipe", stderr: "pipe",
  });
  expect(proc.stderr.toString()).toBe("");
  expect(proc.exitCode).toBe(0);
  return JSON.parse(proc.stdout.toString());
}

test.skipIf(process.platform === "win32")("a lease witness under the supplied home distinguishes held, verified free, and unverified ids", async () => {
  holders.push(await holdSessionLease(WITNESS, { home }));
  const held = await holdSessionLease(HELD, { home });
  holders.push(held);
  const unnamed = await holdSessionLease(UNNAMED, { home });
  holders.push(unnamed);

  const observed = observe(WITNESS);
  expect(observed.sessions).toEqual({
    [HELD]: { state: "held", pid: process.platform === "linux" ? null : held.pid },
    [FREE]: { state: "free" },
  });
  if (process.platform === "linux") {
    expect(observed.unnamed).toEqual({ available: false, reason: expect.stringMatching(/Linux/), holders: {} });
  } else {
    expect(observed.unnamed).toEqual({ available: true, holders: { [UNNAMED]: unnamed.pid } });
  }

  const unverified = observe("absent-witness");
  expect(unverified.sessions[HELD]).toEqual(observed.sessions[HELD]);
  expect(unverified.sessions[FREE]).toEqual({ state: "unknown", reason: expect.stringContaining("absent-witness") });
  expect(unverified.unnamed.available).toBe(false);
  expect(unverified.unnamed.reason).toBeTruthy();
});

test.skipIf(process.platform !== "darwin")("unreadable native lease evidence reports unknown with the scan failure", async () => {
  holders.push(await holdSessionLease(WITNESS, { home }));
  const bin = join(home, "bin");
  mkdirSync(bin);
  writeExecutable(join(bin, "lsof"), "sh", "echo 'lease state unreadable' >&2; exit 2");

  const observed = observe(WITNESS, `${bin}:${process.env.PATH}`);
  expect(observed.sessions[FREE]).toEqual({ state: "unknown", reason: expect.stringContaining("lease state unreadable") });
  expect(observed.unnamed).toEqual({ available: false, reason: expect.stringContaining("lease state unreadable"), holders: {} });
});

test.skipIf(process.platform !== "win32")("Windows reports lease detection unavailable with a reason", () => {
  const observed = observe(WITNESS);
  expect(observed.sessions[FREE]).toEqual({ state: "unknown", reason: expect.stringMatching(/Windows/) });
  expect(observed.unnamed).toEqual({ available: false, reason: expect.stringMatching(/Windows/), holders: {} });
});

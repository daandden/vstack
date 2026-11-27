import { appendFileSync, writeFileSync } from "node:fs";
import "./worker-identity-reuse.ts";

const pid = Number(process.env.VSTACK_FIXTURE_REUSE_PID);
const attempts = process.env.VSTACK_FIXTURE_SIGNAL_ATTEMPTS!;
const replaced = process.env.VSTACK_FIXTURE_REUSE_ON_READ !== undefined;
const exitGate = process.env.VSTACK_FIXTURE_EXIT_GATE;
const kill = process.kill.bind(process);
const now = performance.now.bind(performance);
const FIRST_POLL_CLOCK_READ = 2;
let termDelivered = false;
let clockReadsAfterTerm = 0;

function waitForExit() {
  for (let i = 0; i < 400; i++) {
    const ps = Bun.spawnSync(["/bin/ps", "-o", "stat=", "-p", String(pid)]);
    if (ps.exitCode === 1 || ps.stdout.toString().trim().startsWith("Z")) return;
    Bun.sleepSync(5);
  }
  throw new Error("SIGTERM fixture did not exit");
}

process.kill = (target, signal) => {
  appendFileSync(attempts, `${target} ${signal}\n`);
  if (target === pid && signal === "SIGKILL" && termDelivered && exitGate) {
    writeFileSync(exitGate, "");
    waitForExit();
    throw Object.assign(new Error("fixture process no longer exists"), { code: "ESRCH" });
  }
  if (target !== pid || signal !== "SIGTERM" || termDelivered) throw new Error("Unexpected fixture signal");
  const result = kill(target, signal);
  termDelivered = true;
  return result;
};

performance.now = () => {
  if (!termDelivered || ++clockReadsAfterTerm !== FIRST_POLL_CLOCK_READ) return now();
  if (!replaced && !exitGate) waitForExit();
  return now() + 2_001;
};

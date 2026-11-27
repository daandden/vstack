import { mock } from "bun:test";
import * as fs from "node:fs";
import * as ffi from "bun:ffi";

const target = Number(process.env.VSTACK_FIXTURE_REUSE_PID);
const firstReplacement = Number(process.env.VSTACK_FIXTURE_REUSE_ON_READ);
const failure = process.env.VSTACK_FIXTURE_IDENTITY_FAILURE;
const reuseAfterDiscovery = process.env.VSTACK_FIXTURE_REUSE_AFTER_DISCOVERY;
const attempts = process.env.VSTACK_FIXTURE_SIGNAL_ATTEMPTS;
if (attempts && reuseAfterDiscovery) {
  const kill = process.kill.bind(process);
  process.kill = (pid, signal) => {
    fs.appendFileSync(attempts, `${pid} ${signal}\n`);
    return kill(pid, signal);
  };
}
let reads = 0;
const replacement = (pid: number) => pid === target && (reuseAfterDiscovery
  ? fs.existsSync(reuseAfterDiscovery)
  : ++reads >= firstReplacement);

if (process.platform === "linux") {
  const { readFileSync } = fs;
  mock.module("node:fs", () => ({
    ...fs,
    readFileSync(...args: Parameters<typeof readFileSync>) {
      const value = readFileSync(...args);
      if (args[0] !== `/proc/${target}/stat` || typeof value !== "string" || !replacement(target)) return value;
      if (failure) {
        const code = failure === "permission" ? "EPERM" : failure === "invalid" ? "EINVAL" : failure === "exited" ? "ESRCH" : undefined;
        throw Object.assign(new Error("fixture process identity unavailable"), { code });
      }
      const suffix = value.lastIndexOf(")") + 2;
      const fields = value.slice(suffix).split(" ");
      fields[19] = String(BigInt(fields[19]) + 1n);
      return value.slice(0, suffix) + fields.join(" ");
    },
  }));
} else if (process.platform === "darwin") {
  const { dlopen } = ffi;
  const kernel = failure ? dlopen("/usr/lib/libSystem.B.dylib", { __error: { args: [], returns: "ptr" } }) : undefined;
  mock.module("bun:ffi", () => ({
    ...ffi,
    dlopen(...args: Parameters<typeof dlopen>) {
      const library = dlopen(...args);
      const { proc_pidinfo } = library.symbols;
      if (!proc_pidinfo) return library;
      Reflect.set(library.symbols, "proc_pidinfo", (...params: Parameters<typeof proc_pidinfo>) => {
        const result = proc_pidinfo(...params);
        const buffer = (params as unknown[])[3];
        if (result === 136 && Buffer.isBuffer(buffer) && replacement(Number(params[0]))) {
          if (failure && kernel) {
            const errno = kernel.symbols.__error();
            if (errno === null) throw new Error("fixture could not read native errno");
            ffi.toBuffer(errno, 0, 4).writeInt32LE(failure === "permission" ? 1 : failure === "invalid" ? 22 : failure === "exited" ? 3 : 0);
            return 0;
          }
          const changed = (buffer.readBigUInt64LE(128) + 1n) % 1_000_000n;
          buffer.writeBigUInt64LE(changed, 128);
        }
        return result;
      });
      return library;
    },
  }));
}

import { mock } from "bun:test";
import * as fs from "node:fs";
import * as ffi from "bun:ffi";
import "./worker-identity-reuse.ts";

const pidList = process.env.VSTACK_FIXTURE_PID_LIST?.split(",").map(Number);
const failList = process.env.VSTACK_FIXTURE_FAIL_PID_LIST === "1";
const pathPid = Number(process.env.VSTACK_FIXTURE_NATIVE_PATH_PID);
const unreadable = process.env.VSTACK_FIXTURE_UNREADABLE_PATH;
const outside = process.env.VSTACK_FIXTURE_NATIVE_OUTSIDE_PATH;
let cwdReads = 0;
const changedCwd = () => ++cwdReads > 1 ? outside : undefined;

if (process.platform === "linux" && pathPid) {
  const { readlinkSync } = fs;
  mock.module("node:fs", () => ({
    ...fs,
    readlinkSync(...args: Parameters<typeof readlinkSync>) {
      if (args[0] === `/proc/${pathPid}/${unreadable}`) {
        throw Object.assign(new Error("fixture process path unavailable"), { code: "EACCES" });
      }
      if (args[0] === `/proc/${pathPid}/cwd`) {
        const path = changedCwd();
        if (path) return path;
      }
      return readlinkSync(...args);
    },
  }));
} else if (process.platform === "darwin" && (pidList || pathPid)) {
  const { dlopen } = ffi;
  mock.module("bun:ffi", () => ({
    ...ffi,
    dlopen(...args: Parameters<typeof dlopen>) {
      const library = dlopen(...args);
      const { proc_listallpids, proc_pidinfo, proc_pidpath } = library.symbols;
      if (typeof proc_listallpids === "function" && pidList) {
        Reflect.set(library.symbols, "proc_listallpids", (pids: Int32Array | null) => {
          if (!pids) return 1;
          const count = Math.min(pids.length, pidList.length);
          for (let i = 0; i < count; i++) pids[i] = pidList[i];
          return failList ? 0 : count;
        });
      }
      if (typeof proc_pidinfo === "function" && pathPid) {
        Reflect.set(library.symbols, "proc_pidinfo", (...params: Parameters<typeof proc_pidinfo>) => {
          if (params[0] !== pathPid || params[1] !== 9) return proc_pidinfo(...params);
          if (unreadable === "cwd") return 0;
          const path = changedCwd();
          const result = proc_pidinfo(...params);
          const buffer = (params as unknown[])[3];
          if (path && result === 2352 && Buffer.isBuffer(buffer)) {
            buffer.fill(0, 152, 1176);
            buffer.write(path, 152, 1023, "utf8");
          }
          return result;
        });
      }
      if (typeof proc_pidpath === "function" && unreadable === "exe") {
        Reflect.set(library.symbols, "proc_pidpath", (...params: Parameters<typeof proc_pidpath>) =>
          params[0] === pathPid ? 0 : proc_pidpath(...params));
      }
      return library;
    },
  }));
}

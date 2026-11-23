import { mock } from "bun:test";
import * as fs from "node:fs";

const fault = process.env.CLEAN_FAULT;
const path = process.env.CLEAN_FAULT_PATH;
if (fault === "lease" && process.platform !== "linux") {
  const spawnSync = Bun.spawnSync;
  Bun.spawnSync = ((...args: Parameters<typeof spawnSync>) => {
    if (Array.isArray(args[0]) && args[0][0] === "lsof") throw new Error("Injected lease scan failure");
    return Reflect.apply(spawnSync, Bun, args);
  }) as typeof spawnSync;
}
const { appendFileSync, lstatSync, openSync, readFileSync, unlinkSync } = fs;
mock.module("node:fs", () => ({
  ...fs,
  lstatSync: (...args: Parameters<typeof lstatSync>) => {
    if (fault === "measure" && args[0] === path) throw new Error("Injected unreadable child");
    return Reflect.apply(lstatSync, fs, args);
  },
  openSync: (...args: Parameters<typeof openSync>) => {
    if (fault === "archive-read" && args[0] === path) appendFileSync(`${path}.opens`, "opened\n");
    return Reflect.apply(openSync, fs, args);
  },
  readFileSync: (...args: Parameters<typeof readFileSync>) => {
    if (fault === "lease" && args[0] === "/proc/net/unix") throw new Error("Injected lease scan failure");
    return Reflect.apply(readFileSync, fs, args);
  },
  unlinkSync: (...args: Parameters<typeof unlinkSync>) => {
    if (args[0] === path) {
      if (fault === "remove") throw new Error("Injected removal failure");
      if (fault === "interrupt") process.exit(17);
    }
    return Reflect.apply(unlinkSync, fs, args);
  },
}));

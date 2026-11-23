import { mock } from "bun:test";
import * as fs from "node:fs";
import { dirname } from "node:path";

const fault = process.env.CLEAN_FAULT;
const path = process.env.CLEAN_FAULT_PATH;
let mentioned = false;
function appendLateMention() {
  if (mentioned) return;
  const archive = process.env.CLEAN_LATE_ARCHIVE!;
  const { atime, mtime } = lstatSync(archive);
  appendFileSync(archive, `${JSON.stringify({ type: "message", text: process.env.CLEAN_LATE_PATH })}\n`);
  fs.utimesSync(archive, atime, mtime);
  mentioned = true;
}

if ((fault === "lease" || fault === "late-lease-mention") && process.platform !== "linux") {
  const spawnSync = Bun.spawnSync;
  Bun.spawnSync = ((...args: Parameters<typeof spawnSync>) => {
    if (Array.isArray(args[0]) && args[0][0] === "lsof") {
      if (fault === "lease") throw new Error("Injected lease scan failure");
      appendLateMention();
    }
    return Reflect.apply(spawnSync, Bun, args);
  }) as typeof spawnSync;
}
const { appendFileSync, lstatSync, openSync, readFileSync, readdirSync, unlinkSync } = fs;
mock.module("node:fs", () => ({
  ...fs,
  lstatSync: (...args: Parameters<typeof lstatSync>) => {
    if (fault === "measure" && args[0] === path) throw new Error("Injected unreadable child");
    return Reflect.apply(lstatSync, fs, args);
  },
  openSync: (...args: Parameters<typeof openSync>) => {
    if (fault === "archive-read" && args[0] === path) appendFileSync(`${path}.opens`, "opened\n");
    if (fault === "late-archive-mention" && args[0] === path) appendLateMention();
    return Reflect.apply(openSync, fs, args);
  },
  readFileSync: (...args: Parameters<typeof readFileSync>) => {
    if (args[0] === "/proc/net/unix") {
      if (fault === "lease") throw new Error("Injected lease scan failure");
      if (fault === "late-lease-mention") appendLateMention();
    }
    return Reflect.apply(readFileSync, fs, args);
  },
  readdirSync: (...args: Parameters<typeof readdirSync>) => {
    if (fault === "inventory" && args[0] === path) throw new Error("Injected unreadable Scratch folder");
    const entries = Reflect.apply(readdirSync, fs, args);
    if (fault === "late-archive-mention" && args[0] === dirname(path!)) {
      entries.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    }
    return entries;
  },
  unlinkSync: (...args: Parameters<typeof unlinkSync>) => {
    if (args[0] === path) {
      if (fault === "remove") throw new Error("Injected removal failure");
      if (fault === "interrupt") process.exit(17);
    }
    return Reflect.apply(unlinkSync, fs, args);
  },
}));

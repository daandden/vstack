import { mock } from "bun:test";
import * as fs from "node:fs";

const { existsSync, writeFileSync } = fs;
mock.module("node:fs", () => ({
  ...fs,
  writeFileSync(...args: Parameters<typeof writeFileSync>) {
    if (String(args[0]).endsWith("/.vstack-scratch-session")) {
      process.stderr.write("Scratch mark paused\n");
      const deadline = Date.now() + 5000;
      while (!existsSync(process.env.VSTACK_MARK_RELEASE!)) {
        if (Date.now() >= deadline) throw new Error("Timed out waiting to write Scratch mark");
        Bun.sleepSync(5);
      }
    }
    return writeFileSync(...args);
  },
}));

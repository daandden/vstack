import { mock } from "bun:test";
import * as fs from "node:fs";
import * as ffi from "bun:ffi";

const { dlopen } = ffi;
const { existsSync, renameSync, writeFileSync } = fs;
const competingFolder = process.env.VSTACK_COMPETING_SCRATCH;
function compete(destination: string) {
  if (destination === competingFolder) fs.mkdirSync(destination);
}

mock.module("node:fs", () => ({
  ...fs,
  renameSync(source: string, destination: string) {
    compete(destination);
    return renameSync(source, destination);
  },
  writeFileSync(...args: Parameters<typeof writeFileSync>) {
    if (process.env.VSTACK_MARK_RELEASE && String(args[0]).endsWith("/.vstack-scratch-session")) {
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

if (competingFolder) {
  mock.module("bun:ffi", () => ({
    ...ffi,
    dlopen(...args: Parameters<typeof ffi.dlopen>) {
      const library = dlopen(...args);
      for (const name of ["renamex_np", "renameat2"]) {
        const rename = library.symbols[name];
        if (!rename) continue;
        const destination = name === "renamex_np" ? 1 : 3;
        Reflect.set(library.symbols, name, (...parameters: Parameters<typeof rename>) => {
          compete(new ffi.CString(ffi.ptr(parameters[destination]! as Buffer)).toString());
          return rename(...parameters);
        });
      }
      return library;
    },
  }));
}

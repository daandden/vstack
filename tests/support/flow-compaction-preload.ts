import { Database } from "bun:sqlite";
import { dlopen } from "bun:ffi";

// SQLite signals VACUUM's overwrite after taking the write lock. Preserve its I/O and busy handler.
const loaded = new WeakSet<Database>();
const exec = Database.prototype.exec;
const native = dlopen(process.env.FLOW_COMPACTION_LIBRARY!, { compaction_gate_install: { args: ["ptr"], returns: "void" } });
const SQLITE_FCNTL_FILE_POINTER = 7;
Database.prototype.exec = function (...args) {
  const result = exec.apply(this, args);
  if (!loaded.has(this) && args[0] === "PRAGMA busy_timeout = 10000") {
    const pointer = Buffer.alloc(8);
    if (this.fileControl("main", SQLITE_FCNTL_FILE_POINTER, pointer) !== 0) throw new Error("could not read SQLite file pointer");
    native.symbols.compaction_gate_install(pointer.readBigUInt64LE());
    loaded.add(this);
  }
  return result;
};

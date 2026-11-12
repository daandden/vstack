import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

const codeUnits = (a: string, b: string) => (a < b ? -1 : 1);
export type Walk = {
  /** Sibling order; UTF-16 code-unit order by default. */
  order?: (a: string, b: string) => number;
  /** Names of files and directories to leave out. */
  skip?: (name: string) => boolean;
  /** Classify entries through symbolic links instead of by the entry itself. */
  follow?: boolean;
  /** Called for an entry that is neither a directory nor a regular file; ignored by default. */
  other?: (path: string) => void;
};

/** Calls `visit` with each regular file's slash-joined path relative to `dir` and its full path, depth first in `order`. */
export function walkFiles(dir: string, visit: (path: string, full: string) => void, { order = codeUnits, skip, follow, other }: Walk = {}): void {
  const walk = (rel: string) => {
    for (const entry of readdirSync(join(dir, rel), { withFileTypes: true }).sort((a: { name: string }, b: { name: string }) => order(a.name, b.name))) {
      if (skip?.(entry.name)) continue;
      const path = rel ? `${rel}/${entry.name}` : entry.name, full = join(dir, path);
      const kind = follow ? statSync(full) : entry;
      if (kind.isDirectory()) walk(path);
      else if (kind.isFile() || follow) visit(path, full);
      else other?.(path);
    }
  };
  walk("");
}

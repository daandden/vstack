// Prints the project Scratch dir, or one kind dir inside it, and creates it.
//
//   bun path.ts [--home <dir>] [<kind>]
//
// No kind: <home>/.vstack/tmp/<repo-key>/ for the repo that holds the current directory.
// A kind:  <home>/.vstack/tmp/<repo-key>/<kind>/.
// --home defaults to the user's home. Exit 0 prints the absolute dir with a trailing slash; exit 2 is a usage error.

import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { KIND, repoKey, scratchRoot } from "./scratch.ts";

function usage(message: string): never {
  process.stderr.write(`path.ts: ${message}\nusage: bun path.ts [--home <dir>] [<kind>]\n`);
  process.exit(2);
}

let parsed;
try {
  parsed = parseArgs({ args: Bun.argv.slice(2), options: { home: { type: "string" } }, allowPositionals: true });
} catch (e) {
  usage((e as Error).message);
}
const { values, positionals } = parsed;
if (positionals.length > 1) usage("give at most one kind");
const kind = positionals[0];
if (kind !== undefined && !KIND.test(kind)) usage(`kind must be one lowercase path segment such as explain or blast-radius, got ${JSON.stringify(kind)}`);

const scratchDir = join(scratchRoot(resolve(values.home ?? homedir())), repoKey(process.cwd()));
const dir = kind === undefined ? scratchDir : join(scratchDir, kind);
mkdirSync(dir, { recursive: true });
process.stdout.write(`${dir}/\n`);

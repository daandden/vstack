// Creates and prints the project Scratch dir, an ordinary kind's session folder, or the to-tickets kind dir.

import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createScratchSession, isScratchSessionId, KIND, repoKey, scratchRoot, TICKETS_KIND } from "./scratch.ts";

function usage(message: string): never {
  process.stderr.write(`path.ts: ${message}\nusage: bun path.ts [--home <dir>] [<kind>]\n       bun path.ts --scratch-dir <absolute dir> --session-id <id> <kind>\n`);
  process.exit(2);
}

let parsed;
try {
  parsed = parseArgs({
    args: Bun.argv.slice(2),
    options: { home: { type: "string" }, "scratch-dir": { type: "string" }, "session-id": { type: "string" } },
    allowPositionals: true,
  });
} catch (e) {
  usage((e as Error).message);
}
const { values, positionals } = parsed;
if (positionals.length > 1) usage("give at most one kind");
const kind = positionals[0];
if (kind !== undefined && !KIND.test(kind)) usage(`kind must be one lowercase path segment such as explain or blast-radius, got ${JSON.stringify(kind)}`);

const suppliedScratch = values["scratch-dir"];
const suppliedSession = values["session-id"];
const subagent = suppliedScratch !== undefined;
const ordinaryKind = kind !== undefined && kind !== TICKETS_KIND;
if (!subagent && suppliedSession !== undefined) usage("pass the parent's absolute Scratch dir with --scratch-dir");
if (subagent && !isAbsolute(suppliedScratch)) usage("--scratch-dir needs the parent's absolute project Scratch dir");
if (subagent && !ordinaryKind) usage("subagent mode needs an ordinary Scratch kind");

const sessionId = ordinaryKind ? (subagent ? suppliedSession : process.env.PI_SESSION_ID) : undefined;
if (ordinaryKind && !isScratchSessionId(sessionId)) {
  usage(subagent ? "pass the parent session id with --session-id" : "run from an omp session with a valid PI_SESSION_ID");
}

const scratchDir = subagent ? resolve(suppliedScratch) : join(scratchRoot(resolve(values.home ?? homedir())), repoKey(process.cwd()));
if (kind !== undefined && sessionId !== undefined) {
  const dir = createScratchSession(scratchDir, kind, sessionId);
  if (dir === undefined) usage(`will not adopt unmarked Scratch at ${join(scratchDir, kind, sessionId)}; move the existing entry before retrying`);
  process.stdout.write(`${dir}/\n`);
} else {
  const dir = kind === undefined ? scratchDir : join(scratchDir, kind);
  mkdirSync(dir, { recursive: true });
  process.stdout.write(`${dir}/\n`);
}

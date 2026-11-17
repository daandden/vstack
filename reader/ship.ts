import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { sealRuntime } from "../plugin/skills/flow-page/scripts/generation.ts";

const out = join(import.meta.dir, ".output", "public");
const server = join(import.meta.dir, ".output", "server");
const shipped = join(import.meta.dir, "..", "plugin", "skills", "flow-page", "reader");
if (!existsSync(join(out, "index.html")) || !existsSync(join(out, "_flow-reader")) || !existsSync(join(server, "flow.mjs"))) throw new Error(`no complete Flow app in ${out}; run reader:build first`);
rmSync(shipped, { recursive: true, force: true });
mkdirSync(shipped, { recursive: true });
cpSync(join(out, "index.html"), join(shipped, "index.html"));
cpSync(join(out, "_flow-reader"), join(shipped, "_flow-reader"), { recursive: true });
mkdirSync(join(shipped, "server"));
cpSync(join(server, "flow.mjs"), join(shipped, "server/index.mjs"));
sealRuntime();

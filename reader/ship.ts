import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { sealRuntime } from "../plugin/skills/flow-page/scripts/generation.ts";

const out = join(import.meta.dir, ".output", "public");
const shipped = join(import.meta.dir, "..", "plugin", "skills", "flow-page", "reader");
if (!existsSync(join(out, "index.html")) || !existsSync(join(out, "_flow-reader"))) throw new Error(`no generated reader in ${out}; run nuxt generate reader first`);
rmSync(shipped, { recursive: true, force: true });
mkdirSync(shipped, { recursive: true });
cpSync(join(out, "index.html"), join(shipped, "index.html"));
cpSync(join(out, "_flow-reader"), join(shipped, "_flow-reader"), { recursive: true });
sealRuntime();

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const output = join(root, "plugin/skills/flow-page/scripts/database-runtime.js");
const built = await Bun.build({ entrypoints: [join(root, "plugin/skills/flow-page/scripts/database.ts")], target: "bun", minify: true });
if (!built.success || built.outputs.length !== 1) throw new Error(built.logs.join("\n"));
const source = await built.outputs[0]!.text();
if (Bun.argv.includes("--check")) {
  if (readFileSync(output, "utf8") !== source) throw new Error("Flow database bundle is stale; run bun scripts/build-flow-store.ts");
} else writeFileSync(output, source);

import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { readerDir } from "./live.ts";

const entry = process.env.FLOW_READER_SERVER ?? join(readerDir, "server", "index.mjs");
if (!existsSync(entry)) throw new Error("the Flow Nitro server is not built; run bun run reader:build in the vstack checkout");
process.env.VSTACK_FLOW_MODULE = new URL("./host-runtime.ts", import.meta.url).href;
await import(pathToFileURL(entry).href);

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// Persist only runtime-generated metadata. No user message or model turn is needed.
export default function (pi) {
  pi.on("session_start", (_event, ctx) => {
    const file = ctx.sessionManager.getSessionFile();
    if (!file || existsSync(file)) return;
    mkdirSync(dirname(file), { recursive: true });
    const rows = [ctx.sessionManager.getHeader(), ...ctx.sessionManager.getEntries()];
    writeFileSync(file, rows.map(row => JSON.stringify(row)).join("\n") + "\n");
  });
}

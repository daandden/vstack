import { closeSync, existsSync, openSync, readSync } from "node:fs";
import { resolve } from "node:path";

const env = { ...process.env };
for (const key of ["TERN_PANE", "TERN_PANE_SOCKET", "PI_SESSION_ID", "PI_SESSION_FILE"]) delete env[key];
const tern = env.TERN_EXE && existsSync(env.TERN_EXE) ? env.TERN_EXE : "tern";
const inspect = Bun.spawn([tern, "inspect", "--json"], { env, stdout: "pipe", stderr: "pipe" });
const inspection = await new Response(inspect.stdout).json();
if (await inspect.exited !== 0) throw new Error("Tern inspection failed");
const wanted = new Set(process.argv.slice(2).map(Number));
const cli = resolve(import.meta.dir, "../../skills/flow-page/scripts/flow-page.ts");
const rows = await Promise.all(inspection.panes.filter((pane: { pane: number }) => wanted.has(pane.pane)).map(async (pane: { pane: number; omp_session_file?: string }) => {
  if (!pane.omp_session_file) return { pane: pane.pane };
  const identity = { pane: pane.pane, session_file: pane.omp_session_file };
  try {
    const fd = openSync(pane.omp_session_file, "r");
    const header = Buffer.alloc(65536);
    let length: number;
    try { length = readSync(fd, header); } finally { closeSync(fd); }
    const session = header.toString("utf8", 0, length).split("\n").filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).find(row => row?.type === "session");
    if (typeof session?.id !== "string" || typeof session.cwd !== "string") return identity;
    const query = Bun.spawn([process.execPath, cli, "target", "--session", session.id], {
      cwd: session.cwd, env, stdout: "pipe", stderr: "pipe",
    });
    const text = await new Response(query.stdout).text();
    if (await query.exited !== 0) return { ...identity, session: session.id };
    return { ...identity, session: session.id, queried: true, ...JSON.parse(text) };
  } catch {
    return identity;
  }
}));
process.stdout.write(JSON.stringify(rows));

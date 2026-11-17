import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { canonical, installedSkills, isNormalHome } from "./home.ts";

try {
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { home: { type: "string" } }, strict: false, allowPositionals: true });
  if (typeof values.home === "string" && !isNormalHome(values.home)) {
    await import("./cli.ts");
  } else {
    const installed = join(installedSkills(canonical(homedir())), "flow-page", "scripts", "flow-page.ts");
    let entry: string;
    try { entry = realpathSync(installed); }
    catch { throw new Error("the installed vstack Flow runtime is missing; install or link vstack in omp before using the normal host. Test worktree code with --home <isolated-directory> and a separate VSTACK_FLOW_PORT"); }
    if (entry === canonical(import.meta.path)) {
      const { coherentRuntime } = await import("./generation.ts");
      coherentRuntime();
      await import("./cli.ts");
    }
    else await import(pathToFileURL(entry).href);
  }
} catch (error) {
  process.stderr.write(`flow-page.ts: ${(error as Error).message}\n`);
  process.exitCode = (error as NodeJS.ErrnoException).code?.startsWith("ERR_PARSE_ARGS_") ? 2 : 1;
}

#!/usr/bin/env bun
// check-register: proves that decision-register.yaml, pins.yaml, plugin/, and the Upstreams agree.
// Exit 0: pass. Exit 1: register failures, one `FAIL <class> <item>: <message>` line each.
// Exit 2: the check could not run (bad arguments, unreadable pins or register, Upstream source error).

import { parseArgs } from "node:util";
import { join } from "node:path";
import { checks, failureClasses } from "./lib/checks/index.ts";
import { rowProblems } from "./lib/checks/rows.ts";
import type { CheckContext, Failure } from "./lib/checks/types.ts";
import { cloneSource, defaultUpstreamsDir, githubSource, UpstreamError } from "./lib/upstreams.ts";
import { ConfigError, listPluginArtifacts, loadPins, loadRegister } from "./lib/vstack-repo.ts";

const USAGE = `Usage: bun scripts/check-register.ts [options]

  --root <dir>       vstack checkout to check (default: the repo holding this script)
  --source <name>    clones | github (default: $VSTACK_UPSTREAM_SOURCE, else github under
                     GitHub Actions, else clones)
  --upstreams <dir>  clone cache for --source clones (default: $VSTACK_UPSTREAMS,
                     else ~/.cache/vstack/upstreams)
  --base <ref>       commit the version-bump check compares plugin/ with (default:
                     $VSTACK_BASE_REF, else the merge base of HEAD and origin/HEAD, else HEAD)
  --json             print {"ok", "notes", "failures": [{"class", "item", "message"}]}
  --list-classes     print every failure class, one per line, and exit
  -h, --help         show this text`;

async function main(): Promise<number> {
  let args;
  try {
    args = parseArgs({
      options: {
        root: { type: "string" },
        source: { type: "string" },
        upstreams: { type: "string" },
        base: { type: "string" },
        json: { type: "boolean" },
        "list-classes": { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    }).values;
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  if (args["list-classes"]) {
    console.log(failureClasses.join("\n"));
    return 0;
  }

  const root = args.root ?? join(import.meta.dir, "..");
  const sourceName = args.source ?? process.env.VSTACK_UPSTREAM_SOURCE ?? (process.env.GITHUB_ACTIONS === "true" ? "github" : "clones");
  if (sourceName !== "clones" && sourceName !== "github") {
    console.error(`--source must be clones or github, not ${sourceName}`);
    return 2;
  }
  const source = sourceName === "github" ? githubSource() : cloneSource(args.upstreams ?? defaultUpstreamsDir());

  let failures: Failure[] = [];
  const notes: string[] = [`upstream source: ${sourceName}`];
  try {
    const pins = loadPins(root);
    const register = loadRegister(root);
    const seen = new Set<string>();
    const validRows = register.rows.filter((row) => {
      const ok = rowProblems(row, pins, seen).length === 0;
      if (typeof row.raw.id === "string") seen.add(row.raw.id);
      return ok;
    });
    const ctx: CheckContext = {
      root,
      pins,
      register,
      validRows,
      pluginArtifacts: listPluginArtifacts(root),
      source,
      baseRef: args.base ?? process.env.VSTACK_BASE_REF,
      notes,
    };
    for (const check of checks) failures.push(...(await check.run(ctx)));
    notes.push(`${register.rows.length} rows, ${register.originals.length} originals, ${ctx.pluginArtifacts.length} plugin artifacts`);
  } catch (e) {
    if (e instanceof ConfigError || e instanceof UpstreamError) {
      console.error(`check-register: cannot run: ${e.message}`);
      return 2;
    }
    throw e;
  }

  if (args.json) {
    console.log(JSON.stringify({ ok: failures.length === 0, notes, failures }, null, 2));
  } else {
    for (const n of notes) console.log(`check-register: ${n}`);
    for (const f of failures) console.log(`FAIL ${f.class} ${f.item}: ${f.message}`);
    console.log(failures.length === 0 ? "check-register: OK" : `check-register: ${failures.length} failure(s)`);
  }
  return failures.length === 0 ? 0 : 1;
}

process.exit(await main());

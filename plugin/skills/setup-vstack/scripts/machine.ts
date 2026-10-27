//   bun machine.ts                              check; prints one OK line or one line per failing check, plus NOTE lines
//   bun machine.ts --set judge|isolation|clone…  write those settings to the user's omp config
//
// Every fact comes from the `omp` on PATH, so the checks see what omp itself resolves for this HOME and cwd.
// Checking never writes. `--set` runs only after the user approved the change through `ask`.
// Exit codes: 0 no FAIL line (OK, WARN, or NOTE only) or `--set` done; 1 a FAIL line; 2 usage error or omp missing.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const JUDGE = "typesafe/jev-latest";
/** The id omp gives the vstack extension module (`plugin/extensions/vstack.ts`) in `disabledExtensions`. */
const EXTENSION_ID = "extension-module:vstack";
/** Every vstack agent's name starts with this prefix. */
const AGENT_PREFIX = "vstack-";

type Result =
  | { id: number; name: string; status: "ok" }
  | { id: number; name: string; status: "fail" | "warn"; detail: string; remedy: string }
  /** Passes, but tells the user a fact about their setup. */
  | { id: number; name: string; status: "note"; detail: string };
type Problem = Extract<Result, { status: "fail" | "warn" }>;
const isProblem = (r: Result): r is Problem => r.status === "fail" || r.status === "warn";

function usage(message: string): never {
  console.error(`${message}\nUsage: machine.ts\n       machine.ts --set judge|isolation|clone...`);
  process.exit(2);
}

const OMP = Bun.which("omp");

async function omp(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const p = Bun.spawn([OMP!, ...args], { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const [stdout, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return { code, stdout, stderr };
}

async function ompOrDie(...args: string[]): Promise<string> {
  const r = await omp(...args);
  if (r.code !== 0) {
    console.error(`omp ${args.join(" ")} failed (exit ${r.code}): ${r.stderr.trim() || r.stdout.trim()}`);
    process.exit(2);
  }
  return r.stdout;
}

/** Effective omp settings for this HOME and cwd, by dotted key. Unset keys have no entry. */
async function settings(): Promise<Map<string, unknown>> {
  const list = JSON.parse(await ompOrDie("config", "list", "--json")) as Record<string, { value?: unknown }>;
  const map = new Map<string, unknown>();
  for (const [key, entry] of Object.entries(list)) if (entry && "value" in entry) map.set(key, entry.value);
  return map;
}

async function check(): Promise<Result[]> {
  const [cfg, python] = await Promise.all([settings(), omp("setup", "python", "--check", "--json")]);
  const results: Result[] = [];
  const roles = (cfg.get("modelRoles") ?? {}) as Record<string, unknown>;
  const judge = roles.judge;
  const judgeText = typeof judge === "string" ? judge : JSON.stringify(judge);
  const judgeProvider = typeof judge === "string" ? judge.split(",", 1)[0].trim().split("/", 1)[0] : undefined;

  // 1. TypeSafe credentials. `omp token` walks omp's credential cascade (login store, then env). Its stdout holds the
  // key, so it is never printed.
  const tokenOk = judgeProvider !== "typesafe" || (await omp("token", "typesafe")).code === 0;
  results.push(
    tokenOk
      ? { id: 1, name: "TypeSafe credentials", status: "ok" }
      : {
          id: 1,
          name: "TypeSafe credentials",
          status: "fail",
          detail: "omp has no TypeSafe credentials, so the vstack extension skips principle selection",
          remedy: "run /login typesafe with an API key from https://console.typesafe.ai/ (only you can do this), then run /skill:setup-vstack again",
        },
  );

  // 2. The judge role (ADR 0036).
  results.push(
    judge === undefined
      ? {
          id: 2,
          name: "judge role",
          status: "fail",
          detail: "modelRoles.judge is not set, so the vstack extension skips principle selection",
          remedy: `setup-vstack sets modelRoles.judge to ${JUDGE} once you approve`,
        }
      : judge === JUDGE
        ? { id: 2, name: "judge role", status: "ok" }
        : {
            id: 2,
            name: "judge role",
            status: "note",
            detail: `modelRoles.judge is ${judgeText}, but vstack calibrates the Addon judge against jev (${JUDGE}), so principle picks from another model are not calibrated`,
          },
  );

  // 3. Model overrides on vstack agents. vstack agents use the Session model unless the user sets a key (ADR 0004).
  const overrides = (cfg.get("task.agentModelOverrides") ?? {}) as Record<string, unknown>;
  const vstackOverrides = Object.keys(overrides)
    .filter((name) => name.startsWith(AGENT_PREFIX))
    .sort();
  results.push(
    vstackOverrides.length === 0
      ? { id: 3, name: "agent model overrides", status: "ok" }
      : {
          id: 3,
          name: "agent model overrides",
          status: "note",
          detail: `vstack agents use the Session model by default; task.agentModelOverrides overrides it for ${vstackOverrides.map((name) => `${name} (${String(overrides[name])})`).join(", ")}`,
        },
  );

  const disabled = (cfg.get("disabledExtensions") ?? []) as unknown[];
  if (disabled.includes(EXTENSION_ID)) {
    const rest = JSON.stringify(disabled.filter((id) => id !== EXTENSION_ID));
    results.push({
      id: 4,
      name: "extension",
      status: "fail",
      detail: `disabledExtensions lists ${EXTENSION_ID}, so the vstack extension never loads and a new session alone does not fix it`,
      remedy: `remove it first (omp config set disabledExtensions '${rest}'), then start a new session with /new and run /skill:setup-vstack again`,
    });
  } else {
    results.push({
      id: 4,
      name: "extension",
      status: "note",
      detail: "the vstack extension loads only at session start, so after linking or pulling vstack, start a new session with /new",
    });
  }

  // 5. eval Python.
  if (cfg.get("eval.py") === false) {
    results.push({
      id: 5,
      name: "eval Python",
      status: "warn",
      detail: "eval.py is off, so eval cannot run Python cells and the Grilling page visual judge cannot run",
      remedy: "turn it on with omp config set eval.py true, then run omp setup python --check",
    });
  } else if (python.code !== 0) {
    let found = "";
    try {
      const pythonPath = (JSON.parse(python.stdout) as { pythonPath?: string }).pythonPath;
      if (pythonPath) found = ` (tried ${pythonPath})`;
    } catch {}
    results.push({
      id: 5,
      name: "eval Python",
      status: "warn",
      detail: `omp setup python --check fails${found}, so eval cannot run Python cells and the Grilling page visual judge cannot run`,
      remedy: "run omp setup python and fix what it reports",
    });
  } else {
    results.push({ id: 5, name: "eval Python", status: "ok" });
  }

  results.push(
    cfg.get("task.isolation.enabled") === true
      ? { id: 6, name: "task isolation", status: "ok" }
      : {
          id: 6,
          name: "task isolation",
          status: "fail",
          detail: "task.isolation.enabled is off, so vstack skills that need an isolated subagent stop",
          remedy: "setup-vstack sets task.isolation.enabled to true once you approve",
        },
  );

  results.push(
    cfg.get("worktree.clone") === true
      ? { id: 7, name: "worktree clone", status: "ok" }
      : {
          id: 7,
          name: "worktree clone",
          status: "fail",
          detail: "worktree.clone is off, so omp wt add makes plain checkouts and prototype cannot mount in Private mode",
          remedy: "setup-vstack sets worktree.clone to true once you approve",
        },
  );

  return results;
}

/** The settings `--set` may write, each to the value its check wants. */
const SETTERS: Record<string, () => Promise<[key: string, value: string]>> = {
  async judge() {
    // `omp config set` replaces the whole record, so merge into the roles the user config already has.
    const dir = (await ompOrDie("config", "path")).trim();
    let roles: Record<string, unknown> = {};
    try {
      const doc = Bun.YAML.parse(readFileSync(join(dir, "config.yml"), "utf8")) as { modelRoles?: Record<string, unknown> } | null;
      roles = { ...(doc?.modelRoles ?? {}) };
    } catch {}
    return ["modelRoles", JSON.stringify({ ...roles, judge: JUDGE })];
  },
  isolation: async () => ["task.isolation.enabled", "true"],
  clone: async () => ["worktree.clone", "true"],
};

async function main(argv: string[]) {
  if (argv[0] === "--set") {
    const names = argv.slice(1);
    if (names.length === 0) usage("--set needs at least one of: judge, isolation, clone");
    for (const name of names) if (!(name in SETTERS)) usage(`unknown setting for --set: ${name}`);
    if (!OMP) usage("omp is not on PATH; setup-vstack needs the omp CLI");
    for (const name of new Set(names)) {
      const [key, value] = await SETTERS[name]!();
      await ompOrDie("config", "set", key, value);
      console.log(`SET ${key} = ${value}`);
    }
    return 0;
  }

  if (argv.length !== 0) usage(`unknown arguments: ${argv.join(" ")}`);
  if (!OMP) usage("omp is not on PATH; setup-vstack needs the omp CLI");

  const results = await check();
  const problems = results.filter(isProblem);
  if (problems.length === 0) {
    console.log(`OK vstack machine checks pass: ${results.map((r) => `${r.id} ${r.name}`).join(", ")}.`);
  }
  for (const r of results) {
    if (isProblem(r)) console.log(`${r.status.toUpperCase()} ${r.id} ${r.name}: ${r.detail}. Remedy: ${r.remedy}.`);
    else if (r.status === "note") console.log(`NOTE ${r.id} ${r.name}: ${r.detail}.`);
  }
  return problems.some((r) => r.status === "fail") ? 1 : 0;
}

process.exit(await main(process.argv.slice(2)));

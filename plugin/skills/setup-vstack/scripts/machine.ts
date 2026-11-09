// omp settings come from the `omp` on PATH; the optional Tern check reads its plugin link.
// Exit codes: 0 no FAIL line (OK, WARN, or NOTE only) or `--set` done; 1 a FAIL line; 2 usage error or omp missing.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { resolveOvnfs } from "../../vstack-worktree/scripts/ovnfs.ts";

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
  console.error(`${message}\nUsage: machine.ts [--json]\n       machine.ts --set judge|isolation|clone|ratchet|backend|gitGuard|tern...`);
  process.exit(2);
}

const OMP = Bun.which("omp");

const TERN = Bun.which("tern");
const TERN_PLUGIN = join(import.meta.dir, "..", "..", "..", "tern", "vstack-flow");
const ternLinkCommand = `tern plugin link '${TERN_PLUGIN.replaceAll("'", "'\\''")}'`;

async function tern(...args: string[]): Promise<string> {
  if (!TERN) throw new Error("tern is not on PATH");
  const p = Bun.spawn([TERN, "plugin", ...args, "--json"], { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const [stdout, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  if (code !== 0) throw new Error(`tern plugin ${args.join(" ")} failed (exit ${code}): ${stderr.trim() || stdout.trim()}`);
  return stdout;
}

async function ternLinkFile(): Promise<string> {
  const { dir } = JSON.parse(await tern("dir")) as { dir: string };
  return join(dir, "vstack-flow.path");
}

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
  // `config list` runs first and alone: on a HOME with no agent.db yet, two omp processes that start together
  // can both create its tables, and the loser fails with "table settings already exists".
  const cfg = await settings();
  const python = await omp("setup", "python", "--check", "--json");
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
      detail: "eval.py is off, so eval cannot run Python cells",
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
      detail: `omp setup python --check fails${found}, so eval cannot run Python cells`,
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

  results.push(
    cfg.get("ratchet.enabled") === true
      ? { id: 8, name: "ratchet.enabled", status: "ok" }
      : cfg.has("ratchet.enabled")
        ? {
            id: 8,
            name: "ratchet.enabled",
            status: "warn",
            detail: "ratchet.enabled is off, so optional Ratchet tuning is unavailable",
            remedy: "setup-vstack sets ratchet.enabled to true once you approve, or choose Leave it to keep Ratchet disabled",
          }
        : {
            id: 8,
            name: "ratchet.enabled",
            status: "warn",
            detail: "this omp has no ratchet.enabled setting, so optional Ratchet tuning is unavailable",
            remedy: "upgrade omp to 18.4.5 or later, then run /skill:setup-vstack again",
          },
  );

  const configuredOvnfs = cfg.get("ovnfs.path");
  let ovnfsError = "";
  try { resolveOvnfs(typeof configuredOvnfs === "string" ? configuredOvnfs : null); }
  catch (error) { ovnfsError = (error as Error).message; }
  results.push(
    !ovnfsError
      ? { id: 9, name: "ovnfs", status: "ok" }
      : {
          id: 9,
          name: "ovnfs",
          status: "fail",
          detail: `${ovnfsError} vstack cannot run isolated roles or open separate checkouts`,
          remedy: "install ovnfs and put it on PATH or set omp config set ovnfs.path /absolute/path/to/ovnfs, then run /skill:setup-vstack again",
        },
  );
  results.push(
    cfg.get("isolation.backend") === "auto"
      ? { id: 10, name: "isolation backend", status: "ok" }
      : {
          id: 10,
          name: "isolation backend",
          status: "fail",
          detail: `isolation.backend is ${String(cfg.get("isolation.backend"))}, so omp does not use ovnfs for isolated subagents`,
          remedy: "setup-vstack sets isolation.backend to auto once you approve",
        },
  );
  results.push(
    cfg.get("bash.gitGuard") === true
      ? { id: 11, name: "bash.gitGuard", status: "ok" }
      : {
          id: 11,
          name: "bash.gitGuard",
          status: "warn",
          detail: "bash.gitGuard is off, so a non-isolated subagent can stash, reset, or switch away work in a main checkout",
          remedy: "setup-vstack sets bash.gitGuard to true once you approve; this machine-wide setting also refuses those git commands in non-vstack sessions in a main checkout, or choose Leave it to keep it unchanged",
        },
  );

  if (TERN) {
    let detail = "";
    try {
      const target = readFileSync(await ternLinkFile(), "utf8").trim();
      if (realpathSync(target) !== realpathSync(TERN_PLUGIN)) detail = `vstack-flow links to ${target}, not vstack's copy`;
    } catch (error) {
      detail = `vstack-flow has no readable link to vstack's copy: ${(error as Error).message}`;
    }
    results.push(detail
      ? { id: 12, name: "Tern vstack-flow", status: "warn", detail, remedy: `run ${ternLinkCommand} through setup-vstack's tern setter once you approve` }
      : { id: 12, name: "Tern vstack-flow", status: "ok" });
  }

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
  ratchet: async () => ["ratchet.enabled", "true"],
  backend: async () => ["isolation.backend", "auto"],
  gitGuard: async () => ["bash.gitGuard", "true"],
};

async function main(argv: string[]) {
  if (argv[0] === "--set") {
    const names = argv.slice(1);
    if (names.length === 0) usage(`--set needs at least one of: ${Object.keys(SETTERS).join(", ")}, tern`);
    for (const name of names) if (name !== "tern" && !(name in SETTERS)) usage(`unknown setting for --set: ${name}`);
    if (!OMP) usage("omp is not on PATH; setup-vstack needs the omp CLI");
    if (names.includes("tern") && !TERN) usage("tern is not on PATH; no settings were written");
    if (names.includes("ratchet") && !(await settings()).has("ratchet.enabled")) {
      console.error("Ratchet requires omp 18.4.5 or later. Upgrade omp, then run /skill:setup-vstack again; no settings were written.");
      return 2;
    }
    for (const name of new Set(names)) {
      if (name === "tern") {
        try {
          if (existsSync(await ternLinkFile())) await tern("unlink", "vstack-flow");
          await tern("link", TERN_PLUGIN);
        } catch (error) {
          console.error((error as Error).message);
          return 2;
        }
        console.log(`SET Tern vstack-flow = ${TERN_PLUGIN}`);
        continue;
      }
      const [key, value] = await SETTERS[name]!();
      await ompOrDie("config", "set", key, value);
      console.log(`SET ${key} = ${value}`);
    }
    return 0;
  }

  const json = argv.length === 1 && argv[0] === "--json";
  if (argv.length !== 0 && !json) usage(`unknown arguments: ${argv.join(" ")}`);
  if (!OMP) usage("omp is not on PATH; setup-vstack needs the omp CLI");

  const results = await check();
  const problems = results.filter(isProblem);
  if (json) {
    console.log(JSON.stringify({ checks: results }));
    return problems.some((r) => r.status === "fail") ? 1 : 0;
  }
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

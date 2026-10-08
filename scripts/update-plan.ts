#!/usr/bin/env bun
// update-plan: the mechanical part of the Update (spec #63 "vstack update"; #38 §2-3 and corrections; #56).
// 1. Clones or fetches each Upstream under the clone cache and finds its newest Pin (or takes <upstream>@<ref>).
// 2. Nothing moved: prints {"schema", "moved": false, "upstreams"} and exits 0. No worktree is made.
// 3. Else makes the Update worktree with `omp wt add` (never -q), installs deps on a plain checkout, builds the
//    plan from the worktree's register and House style, writes plan.json and the staged files under --out,
//    and prints the plan. The README ("update-plan") documents the plan JSON.
// Exit 0: done. Exit 2: could not run; a worktree this run made is removed again.

import { parseArgs } from "node:util";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { rowProblems } from "./lib/checks/rows.ts";
import { addWorktree, ensureDeps, mainCheckoutName, removeWorktree, worktreeBase, WorktreeError, type AddedWorktree } from "./lib/omp-worktree.ts";
import { buildPlan, PLAN_SCHEMA, type UpstreamRun } from "./lib/update-plan.ts";
import {
  cloneSource,
  compareSemverTags,
  defaultUpstreamRemote,
  defaultUpstreamsDir,
  hasTag,
  isAncestor,
  newestCommit,
  newestTag,
  resolveRef,
  syncClone,
  UpstreamError,
} from "./lib/upstreams.ts";
import { ConfigError, isHeld, loadHouseStyle, loadRegister, parsePins, type Pin } from "./lib/vstack-repo.ts";

const USAGE = `Usage: bun scripts/update-plan.ts [options] [<upstream>|<upstream>@<ref> ...]

Plans an Update of the named Upstreams (default: every key in pins.yaml on main). <upstream>@<ref> moves
that Upstream to <ref> (a tag for pin_kind tag, a commit for pin_kind commit) instead of its newest Pin.

  --root <dir>       vstack checkout to plan from (default: the repo holding this script)
  --upstreams <dir>  clone cache (default: $VSTACK_UPSTREAMS, else ~/.cache/vstack/upstreams)
  --remote <url>     clones come from <url>/<owner>/<name>.git (default: $VSTACK_UPSTREAM_REMOTE,
                     else https://github.com)
  --omp <cmd>        omp executable for \`omp wt add\` and \`omp config get\` (default: $VSTACK_OMP, else omp)
  --out <dir>        where plan.json, staged adopt copies, and sides go (default: vstack-update/ in the
                     worktree's own git dir, so removing the worktree removes it)
  -h, --help         show this text`;

const MAIN = "main";

class UsageError extends Error {}

function git(cwd: string, args: string[]): string {
  const r = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new ConfigError(`git ${args.join(" ")} failed in ${cwd}: ${r.stderr.toString().trim()}`);
  return r.stdout.toString();
}

/** pins.yaml as committed on main: the Update branches from main, so main's Pins are the old Pins. */
function mainPins(root: string): Map<string, Pin> {
  const text = git(root, ["show", `${MAIN}:pins.yaml`]);
  let doc;
  try {
    doc = Bun.YAML.parse(text);
  } catch (e) {
    throw new ConfigError(`${MAIN}:pins.yaml: ${(e as Error).message}`);
  }
  return parsePins(doc, `${MAIN}:pins.yaml`);
}

function selection(args: string[], pins: Map<string, Pin>): Map<string, string | undefined> {
  const sel = new Map<string, string | undefined>();
  for (const a of args) {
    const at = a.indexOf("@");
    const [key, ref] = at < 0 ? [a, undefined] : [a.slice(0, at), a.slice(at + 1)];
    if (!pins.has(key)) throw new UsageError(`unknown upstream ${key}; pins.yaml has ${[...pins.keys()].join(", ")}`);
    if (ref === "") throw new UsageError(`${a}: empty ref`);
    if (sel.has(key)) throw new UsageError(`${key} is named twice`);
    sel.set(key, ref);
  }
  if (sel.size === 0) for (const key of pins.keys()) sel.set(key, undefined);
  return sel;
}

/** The Pin an Upstream moves to: the given ref, else the newest tag or commit; never backwards. */
function target(pin: Pin, clone: string, ref: string | undefined): { new: string; moved: boolean } {
  if (pin.pin_kind === "tag") {
    if (ref !== undefined) {
      if (!hasTag(clone, ref)) throw new UpstreamError(`${pin.key} has no tag ${ref}`);
      return { new: ref, moved: ref !== pin.pin };
    }
    const tag = newestTag(clone);
    if (!tag) throw new UpstreamError(`${pin.key} has no v<semver> tag`);
    return compareSemverTags(tag, pin.pin) > 0 ? { new: tag, moved: true } : { new: pin.pin, moved: false };
  }
  if (ref !== undefined) {
    const sha = resolveRef(clone, ref);
    if (!sha) throw new UpstreamError(`${pin.key} has no commit ${ref}`);
    return { new: sha, moved: sha !== pin.pin };
  }
  const sha = newestCommit(clone, pin.path);
  const moved = sha !== pin.pin && !isAncestor(clone, sha, pin.pin);
  return moved ? { new: sha, moved } : { new: pin.pin, moved };
}

async function main(): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        root: { type: "string" },
        upstreams: { type: "string" },
        remote: { type: "string" },
        omp: { type: "string" },
        out: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }
  const args = parsed.values;
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  const root = args.root ?? join(import.meta.dir, "..");
  const upstreamsDir = args.upstreams ?? defaultUpstreamsDir();
  const remote = args.remote ?? defaultUpstreamRemote();
  const omp = args.omp ?? process.env.VSTACK_OMP ?? "omp";
  const note = (s: string) => console.error(`update-plan: ${s}`);

  let wt: AddedWorktree | undefined;
  try {
    const pins = mainPins(root);
    const runs: UpstreamRun[] = [];
    for (const [key, ref] of selection(parsed.positionals, pins)) {
      const pin = pins.get(key)!;
      const { clone } = syncClone(upstreamsDir, pin, remote);
      const t = target(pin, clone, ref);
      runs.push({ pin, clone, ...t });
      note(`${key} ${pin.pin} -> ${t.new}${t.moved ? "" : " (not moved)"}`);
    }
    if (!runs.some((r) => r.moved)) {
      note("nothing moved");
      const upstreams = runs.map((r) => ({ key: r.pin.key, repo: r.pin.repo, pin_kind: r.pin.pin_kind, clone: r.clone, old: r.pin.pin, new: r.new, moved: false }));
      console.log(JSON.stringify({ schema: PLAN_SCHEMA, moved: false, upstreams }, null, 2));
      return 0;
    }

    // update/<matt-tag>+<pstack-sha7>, from the new Pins (the current Pin of an Upstream left out of this run).
    const newPin = (key: string) => {
      const p = runs.find((r) => r.pin.key === key)?.new ?? pins.get(key)?.pin;
      if (!p) throw new ConfigError(`${MAIN}:pins.yaml has no ${key}; the Update branch is named update/<matt-tag>+<pstack-sha7>`);
      return p;
    };
    const name = `${newPin("matt")}+${newPin("pstack").slice(0, 7)}`;
    const base = worktreeBase(omp, root);
    const path = join(base, `vstack-${mainCheckoutName(root)}-update-${name}`);
    wt = addWorktree({ omp, root, branch: `update/${name}`, path, ref: MAIN });
    const deps = wt.cloned ? "cloned" : ensureDeps(wt.path);
    note(`worktree ${wt.path} on ${wt.branch} (${wt.cloned ? "cloned" : "plain checkout"}, deps ${deps})`);

    const register = loadRegister(wt.path);
    const bad: string[] = [];
    const seen = new Set<string>();
    for (const row of register.rows) {
      bad.push(...rowProblems(row, pins, seen).map((f) => `${f.item}: ${f.message}`));
      if (row.path === undefined && !isHeld(row)) bad.push(`${row.id}: path is absent and the row is not held`);
      if (typeof row.raw.id === "string") seen.add(row.raw.id);
    }
    const { houseStyle, problems } = loadHouseStyle(wt.path, new Set(pins.keys()));
    bad.push(...problems.map((p) => `house-style.yaml:${p.id}: ${p.message}`));
    if (bad.length > 0) throw new ConfigError(`the register or House style on ${MAIN} is invalid; fix it (bun scripts/check-register.ts) first:\n  ${bad.join("\n  ")}`);

    const out = args.out ?? join(git(wt.path, ["rev-parse", "--absolute-git-dir"]).trim(), "vstack-update");
    if (existsSync(out) && readdirSync(out).length > 0) throw new ConfigError(`--out ${out} is not empty`);
    mkdirSync(out, { recursive: true });

    const body = await buildPlan({ runs, register, replacements: houseStyle.replacements, source: cloneSource(upstreamsDir), out });
    const plan = { schema: PLAN_SCHEMA, moved: true, root, branch: wt.branch, worktree: { path: wt.path, base, cloned: wt.cloned, deps }, out, ...body };
    const json = JSON.stringify(plan, null, 2);
    writeFileSync(join(out, "plan.json"), `${json}\n`);
    console.log(json);
    note(`plan: ${Object.entries(body.counts).map(([k, v]) => `${v} ${k}`).join(", ")}; written to ${join(out, "plan.json")}`);
    return 0;
  } catch (e) {
    if (wt) {
      const failed = removeWorktree(root, wt);
      note(failed.length === 0 ? `removed ${wt.path} and ${wt.branch}` : `could not clean up: ${failed.join("; ")}`);
    }
    if (e instanceof ConfigError || e instanceof UpstreamError || e instanceof WorktreeError || e instanceof UsageError) {
      console.error(`update-plan: cannot run: ${e.message}`);
      return 2;
    }
    throw e;
  }
}

process.exit(await main());

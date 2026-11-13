// Temp-dir fixtures for check-register: fixture Upstream git repos (tags, a move, a removal) and a vstack
// checkout (pins.yaml, decision-register.yaml, house-style.yaml, plugin/) committed as the version base.

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { HouseStyle } from "../../scripts/lib/house-style.ts";

export const SCRIPT = join(import.meta.dir, "..", "..", "scripts", "check-register.ts");

/** Env for git and the script: no user or system git config, no inherited vstack or Actions settings. */
export const ENV: Record<string, string> = (() => {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined || k.startsWith("GIT_") || k.startsWith("VSTACK_") || k.startsWith("GITHUB_") || k === "CI") continue;
    env[k] = v;
  }
  return {
    ...env,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "fixture",
    GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_NAME: "fixture",
    GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  };
})();

export function git(cwd: string, ...args: string[]): string {
  const r = Bun.spawnSync(["git", ...args], { cwd, env: ENV, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")} in ${cwd}: ${r.stderr.toString()}`);
  return r.stdout.toString().trim();
}

export type Files = Record<string, string>;

export function writeFiles(dir: string, files: Files) {
  for (const [p, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), content);
  }
}

// Upstream contents per version. Paths are Upstream repo paths.
export const ALPHA_V1: Files = {
  "README.md": "alpha\n",
  "skills/README.md": "bucket readme, not an item\n",
  "skills/eng/keep/SKILL.md": "---\nname: keep\ndescription: keep\ndisable-model-invocation: true\n---\nkeep v1\n",
  "skills/eng/keep/agents/openai.yaml": "policy: {}\n",
  "skills/eng/keep/refs/notes.md": "keep notes\n",
  "skills/eng/held/SKILL.md": "---\nname: held\ndescription: held\n---\nheld v1\n",
  "skills/eng/old-name/SKILL.md": "---\nname: old-name\ndescription: moved\n---\nmoved v1\n",
  "skills/eng/gone/SKILL.md": "---\nname: gone\ndescription: gone\n---\ngone v1\n",
  "skills/eng/shared-a/SKILL.md": "---\nname: shared-a\ndescription: a\n---\nshared a\n",
  "skills/misc/rej/SKILL.md": "---\nname: rej\ndescription: rej\n---\nrej\n",
};

// House style scope items (alpha v2): each holds text one lint or row reacts to.
export const STYLE_TEXT = {
  /** An asking phrase in a sentence that does not name `ask`. */
  asks: "Then ask the user which name to keep.\n",
  /** The same sentence naming `ask`. */
  asksTool: "Then ask the user with `ask` which name to keep.\n",
  /** A `tmp-path` and a `worktree-cmd` hit. */
  scratch: "Write the notes to /tmp/notes.md, then run `git worktree add ../wt main`.\n",
  /** The `from` of the fixture's adapted row. */
  phrasing: "Open a todolist with one entry per step.\n",
  /** The `from` of the fixture's required name row. */
  renamed: "Run old-setup first.\n",
  spawner:
    'Spawn one `scout` via `task` (`agent: "scout"`): the question, the vstack root. Wait for its result. If it cannot be spawned, stop: name the open question.\n' +
    'Fan-out (skill://vstack-fan-out): parts: one per file. One `task` call; `tasks[]` has one item per part, each with `agent: "scout"`. Each `task`: the brief, the vstack root. Wait for every result. If they cannot start, stop: name the unread files.\n',
};
const styleSkill = (name: string, body: string) => `---\nname: ${name}\ndescription: ${name}\n---\n${body}`;
const STYLE_ITEMS: Files = {
  "skills/style/asks/SKILL.md": styleSkill("asks", STYLE_TEXT.asks),
  "skills/style/asks-tool/SKILL.md": styleSkill("asks-tool", STYLE_TEXT.asksTool),
  "skills/style/scratch/SKILL.md": styleSkill("scratch", STYLE_TEXT.scratch),
  "skills/style/phrasing/SKILL.md": styleSkill("phrasing", STYLE_TEXT.phrasing),
  "skills/style/renamed/SKILL.md": styleSkill("renamed", STYLE_TEXT.renamed),
  "skills/style/spawner/SKILL.md": styleSkill("spawner", STYLE_TEXT.spawner),
};

export const ALPHA_V2: Files = (() => {
  const f = { ...ALPHA_V1 };
  f["skills/eng/held/SKILL.md"] = "---\nname: held\ndescription: held\n---\nheld v2\n";
  delete f["skills/eng/old-name/SKILL.md"];
  f["skills/eng/new-name/SKILL.md"] = "---\nname: new-name\ndescription: moved\n---\nmoved v2\n";
  delete f["skills/eng/gone/SKILL.md"];
  Object.assign(f, STYLE_ITEMS);
  return f;
})();

export const BETA: Files = {
  "README.md": "beta\n",
  "pack/skills/adapted/SKILL.md": "---\nname: adapted\ndescription: adapted\n---\nadapted\n",
  "pack/playbooks/runbook.md": "# Runbook\n",
  "pack/other/ignored.md": "not an item\n",
};

export const PAGE_TEMPLATE = {
  clean: "<!doctype html>\n<style>\n  .box {\n    color: oklch(0 0 none);\n  }\n</style>\n",
  violation: "<!doctype html>\n<style>\n  .box {\n    outline: none;\n  }\n</style>\n",
};

export interface Upstreams {
  dir: string;
  /** Object SHA at the Pin (or another ref) for an Upstream path. */
  sha(key: "alpha" | "beta", ref: string, path: string): string;
  betaPin: string;
}

function makeRepo(dir: string, versions: [Files, string | undefined][]): void {
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  for (const [files, tag] of versions) {
    for (const p of git(dir, "ls-files").split("\n").filter(Boolean)) rmSync(join(dir, p));
    writeFiles(dir, files);
    git(dir, "add", "-A");
    git(dir, "commit", "-qm", tag ?? "commit");
    if (tag) git(dir, "tag", "-a", tag, "-m", tag);
  }
}

/** Builds the fixture Upstream repos once: alpha has tags v1 and v2 (the Pin), beta is pinned by commit SHA. */
export function makeUpstreams(): Upstreams {
  const dir = mkdtempSync(join(tmpdir(), "vstack-upstreams-"));
  makeRepo(join(dir, "alpha"), [[ALPHA_V1, "v1"], [ALPHA_V2, "v2"]]);
  makeRepo(join(dir, "beta"), [[BETA, undefined]]);
  return {
    dir,
    sha: (key, ref, path) => git(join(dir, key), "rev-parse", `${ref}:${path}`),
    betaPin: git(join(dir, "beta"), "rev-parse", "HEAD"),
  };
}

/** Files of one Upstream item as a plugin artifact: paths relative to the item, agents/openai.yaml dropped. */
export function artifactFrom(files: Files, itemPath: string, dest: string): Files {
  const out: Files = {};
  for (const [p, c] of Object.entries(files)) {
    if (!p.startsWith(`${itemPath}/`)) continue;
    const rel = p.slice(itemPath.length + 1);
    if (rel === "agents/openai.yaml") continue;
    out[`${dest}/${rel}`] = c;
  }
  return out;
}

export interface RepoSpec {
  pins: any;
  register: { items: any[]; originals: string[]; utility: string[] };
  manifest: any;
  /** house-style.yaml: `replacements` and `rules`. */
  houseStyle: { replacements: any[]; rules: any[] };
  /** Files under the checkout root, besides the four above. */
  files: Files;
}

/** The repo's own House style rules, so the scope fixtures run the real phrase list and scopes. */
export const REPO_RULES = (Bun.YAML.parse(readFileSync(join(import.meta.dir, "..", "..", "house-style.yaml"), "utf8")) as HouseStyle).rules;

/** Fixture rows: a literal row ordered before the name row it contains, a glossary-style name row, an adapted row, a migration-only row. */
export const FIXTURE_ROWS = [
  { id: "fx-cmd", from: "/old-setup", to: "/skill:new-setup", match: "literal", upstream: "alpha", scope: "required", uses: ["update", "migration"] },
  { id: "fx-rename", from: "old-setup", to: "new-setup", match: "name", upstream: "alpha", scope: "required", uses: ["update", "migration"] },
  { id: "fx-glossary", from: "CONTEXT.md", to: "GLOSSARY.md", match: "name", upstream: "alpha", scope: "required", uses: ["update", "migration"] },
  { id: "fx-todo", from: "Open a todolist", to: "Start the `todo` list", match: "literal", upstream: "any", scope: "adapted", uses: ["update"] },
  { id: "fx-mig", from: ".git/old-root", to: ".git/new-root", match: "literal", upstream: "any", uses: ["migration"] },
];

/** Adapt text that every House style lint accepts: skill refs, a spawn line, a negated and a fenced asking phrase. */
const GONE_TEXT = [
  "---",
  "name: gone",
  "description: gone, vstack text. Use when the user asks the user's question.",
  "argument-hint: \"Which one?\"",
  "---",
  "Run `/skill:keep` yourself, or load skill://keep. Read `GLOSSARY.md` in the format of CONTEXT-FORMAT.md.",
  "Spawn one `vstack-explorer` via `task` (`agent: \"vstack-explorer\"`): the question, the vstack root. Do not wait; keep working. If it cannot be spawned, stop: name the open question.",
  "Never ask the user for a fact you can find. Ask the user with `ask` which name to keep.",
  "Keep Scratch under ~/.vstack/tmp/fixture/notes/. Remove a tree with `git worktree remove ../wt`.",
  "```sh",
  "read -r -p \"Do you want to continue? \" answer",
  "```",
  "",
].join("\n");


/** The passing fixture: a held row, a moved-and-held row, a held row whose item Upstream removed, a shared artifact. */
export function passingSpec(up: Upstreams): RepoSpec {
  const a = (ref: string, p: string) => up.sha("alpha", ref, p);
  const style = (name: string, artifacts: string[]) => {
    const path = `skills/style/${name}`;
    return { id: `alpha/${name}`, upstream: "alpha", kind: "skill", path, tree: a("v2", path), disposition: artifacts.length ? "adopt" : "reject", artifacts, reason: "House style scope." };
  };
  return {
    pins: {
      upstreams: {
        alpha: { role: "Base", repo: "fixture/alpha", pin_kind: "tag", pin: "v2", items: [{ match: "skills/*/*", type: "tree", kind: "skill" }] },
        beta: {
          role: "Enhancement",
          repo: "fixture/beta",
          pin_kind: "commit",
          path: "pack",
          pin: up.betaPin,
          items: [
            { match: "pack/skills/*", type: "tree", kind: "skill" },
            { match: "pack/playbooks/*.md", type: "blob", kind: "playbook" },
          ],
        },
      },
    },
    register: {
      items: [
        { id: "alpha/keep", upstream: "alpha", kind: "skill", path: "skills/eng/keep", tree: a("v2", "skills/eng/keep"), disposition: "adopt", artifacts: ["plugin/skills/keep"], reason: "Kept unchanged." },
        { id: "alpha/held", upstream: "alpha", kind: "skill", path: "skills/eng/held", tree: a("v2", "skills/eng/held"), disposition: "adopt", artifacts: ["plugin/skills/held"], reason: "Held at v1.", held_at: "v1", held_path: "skills/eng/held" },
        { id: "alpha/moved", upstream: "alpha", kind: "skill", path: "skills/eng/new-name", tree: a("v2", "skills/eng/new-name"), disposition: "adopt", artifacts: ["plugin/skills/old-name"], reason: "Moved upstream, held at v1.", held_at: "v1", held_path: "skills/eng/old-name" },
        { id: "alpha/gone", upstream: "alpha", kind: "skill", disposition: "adapt", artifacts: ["plugin/skills/gone"], reason: "Removed upstream, held at v1.", held_at: "v1", held_path: "skills/eng/gone" },
        { id: "alpha/shared-a", upstream: "alpha", kind: "skill", path: "skills/eng/shared-a", tree: a("v2", "skills/eng/shared-a"), disposition: "merge", artifacts: ["plugin/skills/shared"], reason: "Merged with the runbook." },
        { id: "alpha/rej", upstream: "alpha", kind: "skill", path: "skills/misc/rej", tree: a("v2", "skills/misc/rej"), disposition: "reject", artifacts: [], reason: "Not wanted." },
        { id: "beta/adapted", upstream: "beta", kind: "skill", path: "pack/skills/adapted", tree: up.sha("beta", "HEAD", "pack/skills/adapted"), disposition: "adapt", artifacts: ["plugin/skills/shared"], reason: "Contributes to shared." },
        { id: "beta/playbook-runbook", upstream: "beta", kind: "playbook", path: "pack/playbooks/runbook.md", tree: up.sha("beta", "HEAD", "pack/playbooks/runbook.md"), disposition: "merge", artifacts: ["plugin/skills/shared"], reason: "Merged into shared." },
        style("asks-tool", ["plugin/skills/asks-tool"]),
        style("scratch", ["plugin/skills/scratch"]),
        style("phrasing", ["plugin/skills/phrasing"]),
        style("spawner", ["plugin/skills/spawner"]),
        // Rejected until the scope fixtures adopt their artifacts.
        style("asks", []),
        style("renamed", []),
      ],
      originals: ["plugin/rules/fx-rule.md", "plugin/agents/fx-agent.md", "plugin/agents/vstack-explorer.md", "plugin/skills/fixture-helper", "plugin/skills/fixture-addon", "plugin/skills/vstack-maintain"],
      utility: ["plugin/skills/fixture-helper", "plugin/skills/vstack-maintain"],
    },
    manifest: { name: "vstack", version: "0.1.0", private: true, omp: {} },
    houseStyle: { replacements: clone(FIXTURE_ROWS), rules: clone(REPO_RULES) },
    files: {
      ...artifactFrom(ALPHA_V2, "skills/eng/keep", "plugin/skills/keep"),
      ...artifactFrom(ALPHA_V1, "skills/eng/held", "plugin/skills/held"),
      ...artifactFrom(ALPHA_V1, "skills/eng/old-name", "plugin/skills/old-name"),
      "plugin/skills/gone/SKILL.md": GONE_TEXT,
      "plugin/skills/fixture-helper/SKILL.md": "---\nname: fixture-helper\ndescription: helper\n---\nhelper\n",
      "plugin/skills/fixture-addon/SKILL.md": "---\nname: fixture-addon\ndescription: addon\ndisable-model-invocation: true\n---\naddon\n",
      "plugin/skills/vstack-maintain/SKILL.md": "---\nname: vstack-maintain\ndescription: maintenance helper\n---\nMaintain the fixture.\n",
      "plugin/skills/vstack-maintain/scripts/check-css.mjs": readFileSync(join(import.meta.dir, "..", "..", "plugin/skills/vstack-maintain/scripts/check-css.mjs"), "utf8"),
      "addon-questions.json": JSON.stringify({ preamble: "Judge the fixture request.", brief_preamble: "Judge the fixture brief.", questions: { "fixture-addon": { type: "noul", instructions: "Pick this Addon for the fixture task.", criteria: { true: "The task needs it.", false: "The task does not need it." } } } }),
      "plugin/skills/shared/SKILL.md": "---\nname: shared\ndescription: merged\n---\nmerged\n",
      "plugin/rules/fx-rule.md": "---\nalwaysApply: true\n---\nrule\n",
      "plugin/agents/fx-agent.md": "---\nname: fx-agent\ndescription: agent\n---\nagent\n",
      "plugin/agents/vstack-explorer.md": "---\nname: vstack-explorer\ndescription: explorer\nspawns: vstack-explorer, fx-agent\n---\nexplorer\n",
      ...artifactFrom(ALPHA_V2, "skills/style/asks-tool", "plugin/skills/asks-tool"),
      ...artifactFrom(ALPHA_V2, "skills/style/scratch", "plugin/skills/scratch"),
      ...artifactFrom(ALPHA_V2, "skills/style/phrasing", "plugin/skills/phrasing"),
      ...artifactFrom(ALPHA_V2, "skills/style/spawner", "plugin/skills/spawner"),
    },
  };
}

export interface Run {
  code: number;
  stdout: string;
  stderr: string;
  json?: { ok: boolean; notes: string[]; failures: { class: string; item: string; message: string }[] };
}

export interface Checkout {
  root: string;
  /** Write a file after the base commit (shows up as a working-tree change). */
  write(path: string, content: string): void;
  /**
   * Runs check-register as a process with `--root`, `--upstreams`, and `--json`. `source` defaults to
   * `clones`; `null` passes no `--source`, so the script picks its default.
   */
  run(extra?: string[], opts?: { json?: boolean; env?: Record<string, string>; source?: string | null }): Promise<Run>;
}

const checkoutRoots = new Set<string>();
export function cleanupCheckouts(): void {
  for (const root of checkoutRoots) {
    rmSync(root, { recursive: true, force: true });
    checkoutRoots.delete(root);
  }
}

/** Writes the spec into a fresh temp checkout and commits it, so the commit is the version base (HEAD). */
export function checkout(up: Upstreams, spec: RepoSpec): Checkout {
  const root = mkdtempSync(join(tmpdir(), "vstack-checkout-"));
  checkoutRoots.add(root);
  writeFiles(root, {
    "pins.yaml": Bun.YAML.stringify(spec.pins, null, 2),
    "decision-register.yaml": Bun.YAML.stringify(spec.register, null, 2),
    "house-style.yaml": Bun.YAML.stringify(spec.houseStyle, null, 2),
    "plugin/package.json": `${JSON.stringify(spec.manifest, null, 2)}\n`,
    ...spec.files,
  });
  git(root, "init", "-q", "-b", "main");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "base");
  return {
    root,
    write: (p, c) => writeFiles(root, { [p]: c }),
    async run(extra = [], opts = {}) {
      const source = opts.source === null ? [] : ["--source", opts.source ?? "clones"];
      const args = ["bun", SCRIPT, "--root", root, "--upstreams", up.dir, ...source, ...extra];
      if (opts.json !== false) args.push("--json");
      const p = Bun.spawn(args, { cwd: root, env: { ...ENV, ...opts.env }, stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
      if (opts.json === false) return { code, stdout, stderr };
      if (code !== 2) return { code, stdout, stderr, json: JSON.parse(stdout) };
      return {
        code,
        stdout,
        stderr,
        get json(): Run["json"] {
          throw new Error(`check-register exited 2 and printed no JSON: ${stderr.trim()}`);
        },
      };
    },
  };
}

/** Deep copy of a spec, for per-test mutation. */
export const clone = <T>(v: T): T => structuredClone(v);

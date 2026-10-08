// Temp-dir fixtures for check-register: fixture Upstream git repos (tags, a move, a removal) and a vstack
// checkout (pins.yaml, decision-register.yaml, plugin/) committed as the version base.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

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

type Files = Record<string, string>;

function writeFiles(dir: string, files: Files) {
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

export const ALPHA_V2: Files = (() => {
  const f = { ...ALPHA_V1 };
  f["skills/eng/held/SKILL.md"] = "---\nname: held\ndescription: held\n---\nheld v2\n";
  delete f["skills/eng/old-name/SKILL.md"];
  f["skills/eng/new-name/SKILL.md"] = "---\nname: new-name\ndescription: moved\n---\nmoved v2\n";
  delete f["skills/eng/gone/SKILL.md"];
  return f;
})();

export const BETA: Files = {
  "README.md": "beta\n",
  "pack/skills/adapted/SKILL.md": "---\nname: adapted\ndescription: adapted\n---\nadapted\n",
  "pack/playbooks/runbook.md": "# Runbook\n",
  "pack/other/ignored.md": "not an item\n",
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
  register: { items: any[]; originals: string[] };
  manifest: any;
  /** Files under the checkout root, besides the three above. */
  files: Files;
}

/** The passing fixture: a held row, a moved-and-held row, a held row whose item Upstream removed, a shared artifact. */
export function passingSpec(up: Upstreams): RepoSpec {
  const a = (ref: string, p: string) => up.sha("alpha", ref, p);
  return {
    pins: {
      upstreams: {
        alpha: { repo: "fixture/alpha", pin: "v2", items: [{ match: "skills/*/*", type: "tree", kind: "skill" }] },
        beta: {
          repo: "fixture/beta",
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
        { id: "beta/adapted", upstream: "beta", kind: "skill", path: "pack/skills/adapted", tree: up.sha("beta", "HEAD", "pack/skills/adapted"), disposition: "adapt", artifacts: [], reason: "Lands in a later ticket." },
        { id: "beta/playbook-runbook", upstream: "beta", kind: "playbook", path: "pack/playbooks/runbook.md", tree: up.sha("beta", "HEAD", "pack/playbooks/runbook.md"), disposition: "merge", artifacts: ["plugin/skills/shared"], reason: "Merged into shared." },
      ],
      originals: ["plugin/rules/fx-rule.md", "plugin/agents/fx-agent.md"],
    },
    manifest: { name: "vstack", version: "0.1.0", private: true, omp: {} },
    files: {
      ...artifactFrom(ALPHA_V2, "skills/eng/keep", "plugin/skills/keep"),
      ...artifactFrom(ALPHA_V1, "skills/eng/held", "plugin/skills/held"),
      ...artifactFrom(ALPHA_V1, "skills/eng/old-name", "plugin/skills/old-name"),
      "plugin/skills/gone/SKILL.md": "---\nname: gone\ndescription: gone, vstack text\n---\nadapted\n",
      "plugin/skills/shared/SKILL.md": "---\nname: shared\ndescription: merged\n---\nmerged\n",
      "plugin/rules/fx-rule.md": "---\nalwaysApply: true\n---\nrule\n",
      "plugin/agents/fx-agent.md": "---\nname: fx-agent\ndescription: agent\n---\nagent\n",
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

/** Writes the spec into a fresh temp checkout and commits it, so the commit is the version base (HEAD). */
export function checkout(up: Upstreams, spec: RepoSpec): Checkout {
  const root = mkdtempSync(join(tmpdir(), "vstack-checkout-"));
  writeFiles(root, {
    "pins.yaml": Bun.YAML.stringify(spec.pins, null, 2),
    "decision-register.yaml": Bun.YAML.stringify(spec.register, null, 2),
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
      let json;
      if (opts.json !== false && code !== 2) json = JSON.parse(stdout);
      return { code, stdout, stderr, json };
    },
  };
}

/** Deep copy of a spec, for per-test mutation. */
export const clone = <T>(v: T): T => structuredClone(v);

// Temp-dir fixtures for update-plan: two fixture Upstream repos served over file:// (matt pinned by tag,
// pstack by commit), a clone cache, a stand-in omp (fake-omp.ts), and vstack checkouts committed on main.

import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ENV, REPO_RULES, git, writeFiles, type Files } from "./fixture.ts";

export const UPDATE_SCRIPT = join(import.meta.dir, "..", "..", "scripts", "update-plan.ts");

const skill = (name: string, body: string) => `---\nname: ${name}\ndescription: ${name}\n---\n${body}`;
const DRIFT_STEPS = Array.from({ length: 20 }, (_, i) => `Step ${i + 1}: check part ${i + 1} of the drift and write it down.\n`).join("");

/** The adapt item whose text the House style rows rewrite: a matt row, an adapted any row, a pstack row, a migration-only row. */
export const WORDING_OLD = "Read CONTEXT.md first. Open a todolist now. Ask poteto. Keep .git/old-root.\n";
export const WORDING_NEW = `${WORDING_OLD}Then update CONTEXT.md.\n`;

/** Matt v1.0.0. Paths are Upstream repo paths. */
const MATT_V1_0: Files = {
  "README.md": "matt\n",
  // An adopt caller of wording in the Upstream form, as adopted Matt skills keep saying `/grilling`.
  "skills/eng/keep/SKILL.md": skill("keep", "keep\nRun `/wording` after.\n"),
  "skills/eng/grow/SKILL.md": skill("grow", "grow 1\n"),
  "skills/eng/grow/agents/openai.yaml": "policy: {}\n",
  "skills/eng/grow/refs/a.md": "a\n",
  "skills/eng/wording/SKILL.md": skill("wording", WORDING_OLD),
  "skills/eng/wording/refs/glossary.md": "See CONTEXT.md.\n",
  "skills/eng/wording/agents/openai.yaml": "policy: 1\n",
  "skills/eng/old-name/SKILL.md": skill("old-name", "moved without edits\n"),
  "skills/eng/old-name/refs/x.md": "x\n",
  "skills/eng/drift/SKILL.md": skill("drift", DRIFT_STEPS),
  "skills/eng/gone/SKILL.md": skill("gone", "gone\n"),
  "skills/eng/held/SKILL.md": skill("held", "held 1.0\n"),
  "skills/eng/steady/SKILL.md": skill("steady", "steady 1.0\n"),
  "skills/eng/steady/agents/openai.yaml": "policy: 1\n",
  "skills/eng/tdd/SKILL.md": skill("tdd", "tdd 1\n"),
  "skills/eng/prototype/SKILL.md": skill("prototype", "prototype 1\n"),
  "skills/misc/rej/SKILL.md": skill("rej", "rej 1\n"),
};

/** Matt v1.1.0, the Pin: held and steady changed since v1.0.0. */
const MATT_V1_1: Files = {
  ...MATT_V1_0,
  "skills/eng/held/SKILL.md": skill("held", "held 1.1\n"),
  "skills/eng/steady/SKILL.md": skill("steady", "steady 1.1\n"),
};

/** Matt v1.2.0, the newest release: edits, a move with the same tree, a move with edits, a removal, a new item. */
export const MATT_V1_2: Files = (() => {
  const f: Files = { ...MATT_V1_1 };
  f["skills/eng/grow/SKILL.md"] = skill("grow", "grow 2\n");
  f["skills/eng/wording/SKILL.md"] = skill("wording", WORDING_NEW);
  f["skills/eng/wording/refs/glossary.md"] = "See GLOSSARY.md.\n";
  // vstack never ships agents/openai.yaml, so its change is no change to plan.
  f["skills/eng/wording/agents/openai.yaml"] = "policy: 2\n";
  f["skills/eng/steady/agents/openai.yaml"] = "policy: 2\n";
  for (const p of ["SKILL.md", "refs/x.md"]) {
    f[`skills/eng/new-name/${p}`] = f[`skills/eng/old-name/${p}`];
    delete f[`skills/eng/old-name/${p}`];
  }
  delete f["skills/eng/drift/SKILL.md"];
  f["skills/productivity/drifted/SKILL.md"] = skill("drifted", `${DRIFT_STEPS}Step 21: one more check.\n`);
  delete f["skills/eng/gone/SKILL.md"];
  f["skills/eng/tdd/SKILL.md"] = skill("tdd", "tdd 2\n");
  f["skills/misc/rej/SKILL.md"] = skill("rej", "rej 2\n");
  f["skills/eng/fresh/SKILL.md"] = skill("fresh", "A brand new skill with its own long text that resembles nothing else here.\n");
  return f;
})();

/** After v1.2.0: only a pre-release and a stray changeset tag, which never count as a Pin. */
const MATT_BETA: Files = { ...MATT_V1_2, "skills/eng/beta-only/SKILL.md": skill("beta-only", "beta\n") };

const PB = "pstack/skills/poteto-mode/playbooks";
/** pstack commit 1, the Pin. */
const PSTACK_C1: Files = {
  "README.md": "plugins\n",
  "pstack/skills/poteto-mode/SKILL.md": skill("poteto-mode", "poteto mode\n"),
  [`${PB}/shipping.md`]: "# Shipping\nShip like poteto does.\n",
  [`${PB}/forensics-a.md`]: "# Forensics A\n",
  [`${PB}/forensics-b.md`]: "# Forensics B\n",
  [`${PB}/prototype.md`]: "# Prototype\n",
  [`${PB}/tdd.md`]: "# TDD\n",
  "pstack/skills/unslop/SKILL.md": skill("unslop", "unslop\n"),
};
/** pstack commit 2, the newest touching pstack/: two Playbooks edited and one added; poteto-mode's own SKILL.md unchanged. */
export const PSTACK_C2: Files = {
  ...PSTACK_C1,
  [`${PB}/shipping.md`]: "# Shipping\nShip like poteto does.\nThen tell poteto.\n",
  [`${PB}/forensics-b.md`]: "# Forensics B\nNow with a parser.\n",
  [`${PB}/brand-new.md`]: "# Brand new\n",
};
/** pstack commit 3: outside pstack/, so never a Pin. */
const PSTACK_C3: Files = { ...PSTACK_C2, "README.md": "plugins, edited\n" };

/** Fixture House style rows: one per Upstream filter, an adapted `any` row, and a migration-only row that update never runs. */
export const UPDATE_ROWS = [
  { id: "fx-glossary", from: "CONTEXT.md", to: "GLOSSARY.md", match: "name", upstream: "matt", scope: "required", uses: ["update", "migration"] },
  { id: "fx-todo", from: "Open a todolist", to: "Start the `todo` list", match: "literal", upstream: "any", scope: "adapted", uses: ["update"] },
  { id: "fx-pstack", from: "poteto", to: "vstack", match: "name", upstream: "pstack", scope: "adapted", uses: ["update"] },
  { id: "fx-mig", from: ".git/old-root", to: ".git/new-root", match: "literal", upstream: "any", uses: ["migration"] },
];

function commitAll(dir: string, files: Files, message: string, tags: string[] = []) {
  for (const p of git(dir, "ls-files").split("\n").filter(Boolean)) rmSync(join(dir, p));
  writeFiles(dir, files);
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", message);
  for (const t of tags) git(dir, "tag", "-a", t, "-m", t);
  return git(dir, "rev-parse", "HEAD");
}

function remoteRepo(dir: string) {
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  // Let blobless clones and their lazy blob fetches work over file://, as they do against GitHub.
  git(dir, "config", "uploadpack.allowFilter", "true");
  git(dir, "config", "uploadpack.allowAnySHA1InWant", "true");
}

export interface PlanRun {
  code: number;
  stdout: string;
  stderr: string;
  plan?: any;
}

export interface UpdateFixture {
  dir: string;
  /** --remote: clones come from <remote>/fixture/<name>.git. */
  remote: string;
  /** --upstreams: the clone cache. */
  cache: string;
  /** $OMP_WORKTREE_DIR for runs. */
  wtBase: string;
  mattRepo: string;
  pstackRepo: string;
  pstack: { c1: string; c2: string; c3: string };
  /** Object SHA of an Upstream path at a ref, read from the fixture repo. */
  sha(repo: "matt" | "pstack", ref: string, path: string): string;
  /** Every call the stand-in omp received. */
  ompCalls(): string[][];
  /** A vstack checkout committed on main, with the given Pins (default: matt v1.1.0, pstack commit 1). */
  checkout(opts?: { mattPin?: string; pstackPin?: string; houseStyle?: any }): string;
  run(root: string, args?: string[], env?: Record<string, string>): Promise<PlanRun>;
}

export function makeUpdateFixture(): UpdateFixture {
  const dir = mkdtempSync(join(tmpdir(), "vstack-update-"));
  const mattRepo = join(dir, "remote", "fixture", "matt.git");
  const pstackRepo = join(dir, "remote", "fixture", "plugins.git");
  remoteRepo(mattRepo);
  commitAll(mattRepo, MATT_V1_0, "v1.0.0", ["v1.0.0"]);
  commitAll(mattRepo, MATT_V1_1, "v1.1.0", ["v1.1.0"]);
  commitAll(mattRepo, MATT_V1_2, "v1.2.0", ["v1.2.0"]);
  commitAll(mattRepo, MATT_BETA, "beta", ["v1.3.0-beta.1", "mattpocock-skills@9.9.9"]);
  remoteRepo(pstackRepo);
  const pstack = {
    c1: commitAll(pstackRepo, PSTACK_C1, "c1"),
    c2: commitAll(pstackRepo, PSTACK_C2, "c2"),
    c3: commitAll(pstackRepo, PSTACK_C3, "c3"),
  };

  const omp = join(dir, "omp");
  writeFileSync(omp, `#!/bin/sh\nexec "${process.execPath}" "${join(import.meta.dir, "fake-omp.ts")}" "$@"\n`);
  chmodSync(omp, 0o755);
  const log = join(dir, "omp-calls.jsonl");
  writeFileSync(log, "");
  const home = join(dir, "home");
  mkdirSync(home);
  const cache = join(dir, "cache");
  const wtBase = join(dir, "wt");
  const sha = (repo: "matt" | "pstack", ref: string, path: string) => git(repo === "matt" ? mattRepo : pstackRepo, "rev-parse", `${ref}:${path}`);

  const checkout: UpdateFixture["checkout"] = (opts = {}) => {
    const mattPin = opts.mattPin ?? "v1.1.0";
    const pstackPin = opts.pstackPin ?? pstack.c1;
    // Rows describe the v1.1.0 / commit 1 items; a checkout pinned later keeps them (update-plan never reads `tree`).
    const treeAt = (repo: "matt" | "pstack", pin: string, path: string) => {
      try {
        return sha(repo, pin, path);
      } catch {
        return sha(repo, repo === "matt" ? "v1.1.0" : pstack.c1, path);
      }
    };
    const m = (id: string, path: string, disposition: string, artifacts: string[], extra: object = {}) => ({
      id: `matt/${id}`, upstream: "matt", kind: "skill", path, tree: treeAt("matt", mattPin, path), disposition, artifacts, reason: "Fixture row.", ...extra,
    });
    const p = (id: string, kind: string, path: string, disposition: string, artifacts: string[]) => ({
      id: `pstack/${id}`, upstream: "pstack", kind, path, tree: treeAt("pstack", pstackPin, path), disposition, artifacts, reason: "Fixture row.",
    });
    const items = [
      m("keep", "skills/eng/keep", "adopt", ["plugin/skills/keep"]),
      m("grow", "skills/eng/grow", "adopt", ["plugin/skills/grow"]),
      m("wording", "skills/eng/wording", "adapt", ["plugin/skills/wording"]),
      m("old-name", "skills/eng/old-name", "adopt", ["plugin/skills/old-name"]),
      m("drift", "skills/eng/drift", "adapt", ["plugin/skills/drift"]),
      m("gone", "skills/eng/gone", "adapt", ["plugin/skills/gone"]),
      m("held", "skills/eng/held", "adopt", ["plugin/skills/held"], { held_at: "v1.0.0", held_path: "skills/eng/held" }),
      m("steady", "skills/eng/steady", "adopt", ["plugin/skills/steady"]),
      m("tdd", "skills/eng/tdd", "merge", ["plugin/skills/tdd"]),
      m("prototype", "skills/eng/prototype", "merge", ["plugin/skills/prototype"]),
      m("rej", "skills/misc/rej", "reject", []),
      p("poteto-mode", "skill", "pstack/skills/poteto-mode", "reject", []),
      p("playbook-shipping", "playbook", `${PB}/shipping.md`, "adapt", ["plugin/skills/ship"]),
      p("playbook-forensics-a", "playbook", `${PB}/forensics-a.md`, "adapt", ["plugin/skills/forensics"]),
      p("playbook-forensics-b", "playbook", `${PB}/forensics-b.md`, "adapt", ["plugin/skills/forensics"]),
      p("playbook-prototype", "playbook", `${PB}/prototype.md`, "merge", ["plugin/skills/prototype"]),
      p("playbook-tdd", "playbook", `${PB}/tdd.md`, "merge", ["plugin/skills/tdd"]),
      p("unslop", "skill", "pstack/skills/unslop", "adopt", ["plugin/skills/unslop"]),
    ];
    const pins = {
      upstreams: {
        matt: { repo: "fixture/matt", path: "", pin_kind: "tag", pin: mattPin, items: [{ match: "skills/*/*", type: "tree", kind: "skill" }] },
        pstack: {
          repo: "fixture/plugins",
          path: "pstack",
          pin_kind: "commit",
          pin: pstackPin,
          items: [
            { match: "pstack/skills/*", type: "tree", kind: "skill" },
            { match: `${PB}/*.md`, type: "blob", kind: "playbook" },
          ],
        },
      },
    };
    const root = mkdtempSync(join(dir, "vstack-"));
    writeFiles(root, {
      "pins.yaml": Bun.YAML.stringify(pins, null, 2),
      "decision-register.yaml": Bun.YAML.stringify({ items, originals: [] }, null, 2),
      "house-style.yaml": Bun.YAML.stringify(opts.houseStyle ?? { replacements: UPDATE_ROWS, rules: REPO_RULES }, null, 2),
      "plugin/package.json": `${JSON.stringify({ name: "vstack", version: "0.1.0", private: true, omp: {} }, null, 2)}\n`,
      "package.json": `${JSON.stringify({ name: "fixture-vstack", private: true }, null, 2)}\n`,
      ".gitignore": "node_modules/\n",
    });
    git(root, "init", "-q", "-b", "main");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "base");
    // Installed deps in the user's checkout: ignored, so only a clone carries them into a worktree.
    writeFiles(root, { "node_modules/marker.txt": "deps\n" });
    return root;
  };

  return {
    dir,
    remote: `file://${join(dir, "remote")}`,
    cache,
    wtBase,
    mattRepo,
    pstackRepo,
    pstack,
    sha,
    ompCalls: () => readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)),
    checkout,
    async run(root, args = [], env = {}) {
      const cmd = ["bun", UPDATE_SCRIPT, "--root", root, "--upstreams", cache, "--remote", `file://${join(dir, "remote")}`, "--omp", omp, ...args];
      const p = Bun.spawn(cmd, {
        cwd: root,
        env: { ...ENV, HOME: home, OMP_WORKTREE_DIR: wtBase, FAKE_OMP_LOG: log, ...env },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
      let plan;
      if (code === 0) plan = JSON.parse(stdout);
      return { code, stdout, stderr, plan };
    },
  };
}

// update-plan run as a process over fixture Upstream repos (spec #63, Testing Decisions, Seam 1).

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { git } from "./support/fixture.ts";
import { MATT_V1_2, makeUpdateFixture, type PlanRun, type UpdateFixture } from "./support/update-fixture.ts";

const fixtures: UpdateFixture[] = [];
const fixture = () => {
  const fx = makeUpdateFixture();
  fixtures.push(fx);
  return fx;
};
afterAll(() => {
  for (const fx of fixtures) rmSync(fx.dir, { recursive: true, force: true });
});

const PB = "pstack/skills/poteto-mode/playbooks";
const rowOf = (r: PlanRun, id: string) => r.plan.rows.find((x: any) => x.id === id);
const files = (dir: string, prefix = ""): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`])).sort();

describe("nothing moved", () => {
  test("exits at once with moved: false and no worktree; a later run fetches the new release", async () => {
    const fx = fixture();
    const root = fx.checkout({ mattPin: "v1.2.0", pstackPin: fx.pstack.c2 });
    const r = await fx.run(root);
    expect(r.code).toBe(0);
    // v1.3.0-beta.1 and mattpocock-skills@9.9.9 are not releases; pstack commit 3 does not touch pstack/.
    expect(r.plan).toEqual({
      schema: 1,
      moved: false,
      upstreams: [
        { key: "matt", repo: "fixture/matt", pin_kind: "tag", clone: join(fx.cache, "matt"), old: "v1.2.0", new: "v1.2.0", moved: false },
        { key: "pstack", repo: "fixture/plugins", pin_kind: "commit", clone: join(fx.cache, "pstack"), old: fx.pstack.c2, new: fx.pstack.c2, moved: false },
      ],
    });
    expect(fx.ompCalls()).toEqual([]);
    expect(existsSync(fx.wtBase)).toBe(false);
    // The clones are blobless partial clones under the injected cache.
    expect(git(join(fx.cache, "matt"), "config", "remote.origin.partialclonefilter")).toBe("blob:none");

    git(fx.mattRepo, "tag", "-a", "v1.2.1", "-m", "v1.2.1");
    const again = await fx.run(root);
    expect(again.code).toBe(0);
    expect(again.plan.moved).toBe(true);
    expect(again.plan.upstreams.map((u: any) => [u.key, u.new, u.moved])).toEqual([
      ["matt", "v1.2.1", true],
      ["pstack", fx.pstack.c2, false],
    ]);
    expect(again.plan.branch).toBe(`update/v1.2.1+${fx.pstack.c2.slice(0, 7)}`);
  });
});

describe("a run where both Pins move (plain checkout)", () => {
  let fx: UpdateFixture;
  let root: string;
  let r: PlanRun;
  beforeAll(async () => {
    fx = fixture();
    root = fx.checkout();
    r = await fx.run(root);
    if (r.code !== 0) throw new Error(`update-plan failed: ${r.stderr}`);
  });

  test("moves matt to the newest v<semver> tag and pstack to the newest commit touching pstack/", () => {
    expect(r.plan.upstreams.map((u: any) => [u.key, u.old, u.new, u.moved])).toEqual([
      ["matt", "v1.1.0", "v1.2.0", true],
      ["pstack", fx.pstack.c1, fx.pstack.c2, true],
    ]);
  });

  test("creates the worktree with omp wt add -b update/<matt-tag>+<pstack-sha7> from main, never -q", () => {
    const branch = `update/v1.2.0+${fx.pstack.c2.slice(0, 7)}`;
    const path = join(fx.wtBase, `vstack-${basename(root)}-update-v1.2.0+${fx.pstack.c2.slice(0, 7)}`);
    expect(fx.ompCalls()).toEqual([["wt", "add", "-b", branch, path, "main"]]);
    expect(r.plan.branch).toBe(branch);
    expect(r.plan.worktree).toEqual({ path, base: fx.wtBase, cloned: false, deps: "installed" });
    expect(git(path, "branch", "--show-current")).toBe(branch);
  });

  test("continues on the plain checkout and installs deps, which the checkout lacked", () => {
    const wt = r.plan.worktree.path;
    expect(existsSync(join(wt, "node_modules"))).toBe(true);
    expect(existsSync(join(wt, "node_modules", "marker.txt"))).toBe(false);
    expect(git(wt, "status", "--porcelain")).toBe("");
  });

  test("writes plan.json and staged files in the worktree's git dir, outside the tree", () => {
    expect(r.plan.out).toBe(join(realpathSync(root), ".git", "worktrees", basename(r.plan.worktree.path), "vstack-update"));
    expect(JSON.parse(readFileSync(join(r.plan.out, "plan.json"), "utf8"))).toEqual(r.plan);
  });

  test("maps a changed Playbook file to its Playbook row, not to the skill dir that holds it (longest prefix)", () => {
    const shipping = rowOf(r, "pstack/playbook-shipping");
    expect(shipping.class).toBe("changed");
    expect(shipping.files).toEqual([{ path: "shipping.md", status: "modified", same_after_house_style: false }]);
    // poteto-mode's tree changed (its playbooks did), but none of its own files did.
    expect(fx.sha("pstack", fx.pstack.c1, "pstack/skills/poteto-mode")).not.toBe(fx.sha("pstack", fx.pstack.c2, "pstack/skills/poteto-mode"));
    expect(rowOf(r, "pstack/poteto-mode").class).toBe("unchanged");
    expect(rowOf(r, "pstack/poteto-mode").files).toEqual([]);
    expect(r.plan.new).toContainEqual({ upstream: "pstack", path: `${PB}/brand-new.md`, kind: "playbook", type: "blob", tree: fx.sha("pstack", fx.pstack.c2, `${PB}/brand-new.md`) });
  });

  test("pairs a removed and an added item as a move by identical tree or by SKILL.md similarity", () => {
    const byTree = rowOf(r, "matt/old-name");
    expect(byTree.class).toBe("moved");
    expect(byTree.move).toEqual({ from: "skills/eng/old-name", to: "skills/eng/new-name", by: "tree", similarity: 100, renamed: true });
    expect(byTree.new).toEqual({ ref: "v1.2.0", commit: git(fx.mattRepo, "rev-parse", "v1.2.0^{commit}"), path: "skills/eng/new-name", tree: fx.sha("matt", "v1.2.0", "skills/eng/new-name") });
    expect(byTree.files).toEqual([]);

    const bySimilarity = rowOf(r, "matt/drift");
    expect(bySimilarity.class).toBe("moved");
    expect(bySimilarity.move).toMatchObject({ from: "skills/eng/drift", to: "skills/productivity/drifted", by: "similarity", renamed: true });
    expect(bySimilarity.move.similarity).toBeGreaterThanOrEqual(50);
    expect(bySimilarity.files).toEqual([{ path: "SKILL.md", status: "modified", same_after_house_style: false }]);

    expect(rowOf(r, "matt/gone").class).toBe("removed");
    expect(rowOf(r, "matt/gone").new).toBeNull();
    // Only the unpaired addition is new; the pre-release's beta-only item is not in play.
    expect(r.plan.new.filter((n: any) => n.upstream === "matt").map((n: any) => n.path)).toEqual(["skills/eng/fresh"]);
  });

  test("diffs a held row from (held_at, held_path), and every other row from the old Pin", () => {
    const held = rowOf(r, "matt/held");
    expect(held.held).toEqual({ at: "v1.0.0", path: "skills/eng/held" });
    expect(held.effective_old).toEqual({ ref: "v1.0.0", commit: git(fx.mattRepo, "rev-parse", "v1.0.0^{commit}"), path: "skills/eng/held" });
    // Unchanged between v1.1.0 and v1.2.0, but changed since v1.0.0.
    expect(held.class).toBe("changed");
    expect(held.files).toEqual([{ path: "SKILL.md", status: "modified", same_after_house_style: null }]);
    // The same history on a row that is not held: v1.1.0 to v1.2.0 has no change.
    const steady = rowOf(r, "matt/steady");
    expect(steady.effective_old).toMatchObject({ ref: "v1.1.0", path: "skills/eng/steady" });
    expect(steady.class).toBe("unchanged");
  });

  test("groups rows by artifact: forensics, tdd, and prototype each list every contributing row", () => {
    const groups = Object.fromEntries(r.plan.artifacts.map((a: any) => [a.artifact, a]));
    expect(groups["plugin/skills/forensics"]).toEqual({ artifact: "plugin/skills/forensics", shared: true, rows: ["pstack/playbook-forensics-a", "pstack/playbook-forensics-b"], needs_work: true });
    expect(groups["plugin/skills/tdd"]).toEqual({ artifact: "plugin/skills/tdd", shared: true, rows: ["matt/tdd", "pstack/playbook-tdd"], needs_work: true });
    expect(groups["plugin/skills/prototype"]).toEqual({ artifact: "plugin/skills/prototype", shared: true, rows: ["matt/prototype", "pstack/playbook-prototype"], needs_work: false });
    expect(groups["plugin/skills/keep"]).toEqual({ artifact: "plugin/skills/keep", shared: false, rows: ["matt/keep"], needs_work: false });
    expect(rowOf(r, "pstack/playbook-forensics-a").class).toBe("unchanged");
    expect(rowOf(r, "pstack/playbook-forensics-b").class).toBe("changed");
  });

  test("runs the uses: update House style rows of the row's Upstream over both sides", () => {
    const wording = rowOf(r, "matt/wording");
    expect(wording.house_style_rows).toEqual(["fx-glossary", "fx-todo"]);
    const front = "---\nname: wording\ndescription: wording\n---\n";
    const old = `${front}Read GLOSSARY.md first. Start the \`todo\` list now. Ask poteto. Keep .git/old-root.\n`;
    expect(readFileSync(join(wording.sides.old, "SKILL.md"), "utf8")).toBe(old);
    expect(readFileSync(join(wording.sides.new, "SKILL.md"), "utf8")).toBe(`${old}Then update GLOSSARY.md.\n`);
    // CONTEXT.md -> GLOSSARY.md upstream is no change once both sides are normalized.
    expect(wording.files).toEqual([
      { path: "SKILL.md", status: "modified", same_after_house_style: false },
      { path: "refs/glossary.md", status: "modified", same_after_house_style: true },
    ]);
    expect(readFileSync(join(wording.sides.old, "refs/glossary.md"), "utf8")).toBe("See GLOSSARY.md.\n");

    const shipping = rowOf(r, "pstack/playbook-shipping");
    expect(shipping.house_style_rows).toEqual(["fx-todo", "fx-pstack"]);
    expect(readFileSync(join(shipping.sides.old, "shipping.md"), "utf8")).toBe("# Shipping\nShip like vstack does.\n");
    expect(readFileSync(join(shipping.sides.new, "shipping.md"), "utf8")).toBe("# Shipping\nShip like vstack does.\nThen tell vstack.\n");
  });

  test("stages adopt copies from the new Pin without agents/openai.yaml, hash-checked", () => {
    const grow = rowOf(r, "matt/grow");
    expect(grow.class).toBe("changed");
    expect(grow.staged.dropped).toEqual(["agents/openai.yaml"]);
    expect(files(grow.staged.path)).toEqual(["SKILL.md", "refs/a.md"]);
    expect(basename(grow.staged.path)).toBe("grow");
    expect(readFileSync(join(grow.staged.path, "SKILL.md"), "utf8")).toBe(MATT_V1_2["skills/eng/grow/SKILL.md"]);
    expect(grow.staged.files).toEqual([
      { path: "SKILL.md", sha: fx.sha("matt", "v1.2.0", "skills/eng/grow/SKILL.md") },
      { path: "refs/a.md", sha: fx.sha("matt", "v1.2.0", "skills/eng/grow/refs/a.md") },
    ]);
    // A held adopt row gets a catch-up copy; a moved one is staged under its new name; unchanged ones are not staged.
    expect(readFileSync(join(rowOf(r, "matt/held").staged.path, "SKILL.md"), "utf8")).toBe(MATT_V1_2["skills/eng/held/SKILL.md"]);
    expect(basename(rowOf(r, "matt/old-name").staged.path)).toBe("new-name");
    expect(rowOf(r, "matt/keep").staged).toBeNull();
    expect(rowOf(r, "pstack/unslop").staged).toBeNull();
    // Adapt, merge, and reject rows get sides or nothing, never a staged copy.
    expect(rowOf(r, "matt/rej")).toMatchObject({ class: "changed", staged: null, sides: null });
  });

  test("counts every change class", () => {
    expect(r.plan.counts).toEqual({ unchanged: 8, changed: 7, moved: 2, removed: 1, new: 2 });
  });
});

describe("worktree", () => {
  let fx: UpdateFixture;
  beforeAll(() => {
    fx = fixture();
  });

  test("a cloned worktree keeps the deps the clone carried and installs nothing", async () => {
    const root = fx.checkout();
    const r = await fx.run(root, [], { FAKE_OMP_CLONE: "1" });
    expect(r.code).toBe(0);
    expect(r.plan.worktree).toMatchObject({ cloned: true, deps: "cloned" });
    expect(readFileSync(join(r.plan.worktree.path, "node_modules", "marker.txt"), "utf8")).toBe("deps\n");
  });

  test("without $OMP_WORKTREE_DIR the base comes from omp config get worktree.base", async () => {
    const root = fx.checkout();
    const base = join(fx.dir, "configured-base");
    const r = await fx.run(root, [], { OMP_WORKTREE_DIR: "", FAKE_OMP_BASE: base });
    expect(r.code).toBe(0);
    expect(r.plan.worktree.base).toBe(base);
    expect(r.plan.worktree.path.startsWith(`${base}/vstack-`)).toBe(true);
  });

  test("a failure after the worktree exists removes the worktree and its branch", async () => {
    const root = fx.checkout({ houseStyle: { replacements: [{ id: "broken" }], rules: [] } });
    const r = await fx.run(root);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("house-style.yaml:broken");
    const branch = `update/v1.2.0+${fx.pstack.c2.slice(0, 7)}`;
    expect(existsSync(join(fx.wtBase, `vstack-${basename(root)}-update-v1.2.0+${fx.pstack.c2.slice(0, 7)}`))).toBe(false);
    expect(git(root, "branch", "--list", branch)).toBe("");
  });
});

describe("arguments", () => {
  let fx: UpdateFixture;
  beforeAll(() => {
    fx = fixture();
  });

  test("<upstream>@<ref> narrows the run and moves that Upstream to the ref; the branch keeps the other's current Pin", async () => {
    const root = fx.checkout();
    const r = await fx.run(root, [`pstack@${fx.pstack.c2.slice(0, 10)}`]);
    expect(r.code).toBe(0);
    expect(r.plan.upstreams.map((u: any) => [u.key, u.new])).toEqual([["pstack", fx.pstack.c2]]);
    expect(r.plan.rows.every((x: any) => x.upstream === "pstack")).toBe(true);
    expect(r.plan.branch).toBe(`update/v1.1.0+${fx.pstack.c2.slice(0, 7)}`);
  });

  test("an unknown Upstream exits 2 before touching anything", async () => {
    const root = fx.checkout();
    const r = await fx.run(root, ["nope"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("unknown upstream nope");
  });
});

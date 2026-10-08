// check-register run as a process over temp-dir fixtures (spec #63, Testing Decisions, Seam 1).

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { fakeGitHub } from "./support/fake-github.ts";
import {
  ALPHA_V2,
  ENV,
  SCRIPT,
  artifactFrom,
  checkout,
  clone,
  git,
  makeUpstreams,
  passingSpec,
  type RepoSpec,
  type Run,
  type Upstreams,
} from "./support/fixture.ts";

let up: Upstreams;
beforeAll(() => {
  up = makeUpstreams();
});
afterAll(() => rmSync(up.dir, { recursive: true, force: true }));

const failuresOf = (r: Run) => r.json!.failures.map((f) => `${f.class} ${f.item}`);
const row = (spec: RepoSpec, id: string) => spec.register.items.find((r) => r.id === id)!;

async function runSpec(mutate: (spec: RepoSpec) => void): Promise<Run> {
  const spec = clone(passingSpec(up));
  mutate(spec);
  return checkout(up, spec).run();
}

test("the passing fixture passes: held, moved-and-held, removed-and-held rows and a shared artifact", async () => {
  const r = await checkout(up, passingSpec(up)).run();
  expect(r.json!.failures).toEqual([]);
  expect(r.code).toBe(0);
});

test("text output ends with OK on a pass", async () => {
  const r = await checkout(up, passingSpec(up)).run([], { json: false });
  expect(r.code).toBe(0);
  expect(r.stdout.trim().split("\n").at(-1)).toBe("check-register: OK");
});

// One fixture per failure class. Each case lists the exact failures expected as "<class> <item>".
const cases: { cls: string; name: string; mutate: (s: RepoSpec) => void; expected: string[] }[] = [
  {
    cls: "invalid-disposition",
    name: "a disposition outside adopt, adapt, merge, reject",
    mutate: (s) => (row(s, "alpha/rej").disposition = "drop"),
    expected: ["invalid-disposition alpha/rej"],
  },
  {
    cls: "invalid-row",
    name: "an upstream key missing from pins.yaml",
    mutate: (s) => (row(s, "beta/adapted").upstream = "gamma"),
    // The item's row no longer counts for its Upstream, so the reverse check names the item too.
    expected: ["invalid-row beta/adapted", "unregistered-upstream-item beta:pack/skills/adapted"],
  },
  {
    cls: "invalid-row",
    name: "held_at without held_path",
    mutate: (s) => delete row(s, "alpha/held").held_path,
    expected: ["invalid-row alpha/held"],
  },
  {
    cls: "missing-artifact",
    name: "a row naming an artifact that does not exist",
    mutate: (s) => (row(s, "beta/adapted").artifacts = ["plugin/skills/adapted"]),
    expected: ["missing-artifact beta/adapted"],
  },
  {
    cls: "missing-artifact",
    name: "a missing shared artifact names every row that lists it",
    mutate: (s) => delete s.files["plugin/skills/shared/SKILL.md"],
    expected: ["missing-artifact alpha/shared-a", "missing-artifact beta/playbook-runbook"],
  },
  {
    cls: "reject-with-artifacts",
    name: "a reject row with artifacts",
    mutate: (s) => {
      row(s, "alpha/rej").artifacts = ["plugin/skills/rej"];
      s.files["plugin/skills/rej/SKILL.md"] = "rej\n";
    },
    expected: ["reject-with-artifacts alpha/rej"],
  },
  {
    cls: "unregistered-artifact",
    name: "a plugin skill no row names",
    mutate: (s) => (s.files["plugin/skills/stray/SKILL.md"] = "stray\n"),
    expected: ["unregistered-artifact plugin/skills/stray"],
  },
  {
    cls: "unregistered-artifact",
    name: "a rule dropped from originals:",
    mutate: (s) => (s.register.originals = ["plugin/agents/fx-agent.md"]),
    expected: ["unregistered-artifact plugin/rules/fx-rule.md"],
  },
  {
    cls: "adopt-renamed",
    name: "an adopt artifact under another name",
    mutate: (s) => {
      for (const k of Object.keys(s.files)) if (k.startsWith("plugin/skills/keep/")) delete s.files[k];
      Object.assign(s.files, artifactFrom(ALPHA_V2, "skills/eng/keep", "plugin/skills/kept"));
      row(s, "alpha/keep").artifacts = ["plugin/skills/kept"];
    },
    expected: ["adopt-renamed alpha/keep"],
  },
  {
    cls: "adopt-not-identical",
    name: "one changed byte in an adopt artifact",
    mutate: (s) => (s.files["plugin/skills/keep/refs/notes.md"] = "keep notes!\n"),
    expected: ["adopt-not-identical alpha/keep"],
  },
  {
    cls: "adopt-not-identical",
    name: "an adopt artifact that ships agents/openai.yaml",
    mutate: (s) => (s.files["plugin/skills/keep/agents/openai.yaml"] = ALPHA_V2["skills/eng/keep/agents/openai.yaml"]),
    expected: ["adopt-not-identical alpha/keep"],
  },
  {
    cls: "adopt-not-identical",
    name: "a held adopt artifact that matches the Pin instead of its held version",
    mutate: (s) => Object.assign(s.files, artifactFrom(ALPHA_V2, "skills/eng/held", "plugin/skills/held")),
    expected: ["adopt-not-identical alpha/held"],
  },
  {
    cls: "adopt-not-identical",
    name: "a moved-and-held adopt artifact that holds the moved item's Pin text",
    mutate: (s) => (s.files["plugin/skills/old-name/SKILL.md"] = ALPHA_V2["skills/eng/new-name/SKILL.md"]),
    expected: ["adopt-not-identical alpha/moved"],
  },
  {
    cls: "current-pin-mismatch",
    name: "a tree that is not the item's tree at the Pin",
    mutate: (s) => (row(s, "alpha/shared-a").tree = up.sha("alpha", "v2", "skills/eng/keep")),
    expected: ["current-pin-mismatch alpha/shared-a"],
  },
  {
    cls: "current-pin-mismatch",
    name: "a moved-and-held row whose path still names the held path",
    mutate: (s) => (row(s, "alpha/moved").path = "skills/eng/old-name"),
    expected: ["current-pin-mismatch alpha/moved", "unregistered-upstream-item alpha:skills/eng/new-name"],
  },
  {
    cls: "reconciled-missing",
    name: "a held row whose held_path does not exist at held_at",
    mutate: (s) => (row(s, "alpha/gone").held_path = "skills/eng/nowhere"),
    expected: ["reconciled-missing alpha/gone"],
  },
  {
    cls: "absent-path",
    name: "a non-held row without a path",
    mutate: (s) => delete row(s, "alpha/keep").path,
    // Without a path, no row names the item at the Pin.
    expected: ["absent-path alpha/keep", "unregistered-upstream-item alpha:skills/eng/keep"],
  },
  {
    cls: "unregistered-upstream-item",
    name: "an Upstream skill directory with no row",
    mutate: (s) => (s.register.items = s.register.items.filter((r) => r.id !== "alpha/rej")),
    expected: ["unregistered-upstream-item alpha:skills/misc/rej"],
  },
  {
    cls: "unregistered-upstream-item",
    name: "a Playbook file with no row",
    mutate: (s) => (s.register.items = s.register.items.filter((r) => r.id !== "beta/playbook-runbook")),
    expected: ["unregistered-upstream-item beta:pack/playbooks/runbook.md"],
  },
  {
    cls: "invalid-manifest",
    name: "a manifest without name vstack or the omp field",
    mutate: (s) => (s.manifest = { name: "other", version: "0.1.0" }),
    expected: ["invalid-manifest plugin/package.json", "invalid-manifest plugin/package.json"],
  },
];

describe("each failure class names the item", () => {
  for (const c of cases) {
    test(`${c.cls}: ${c.name}`, async () => {
      const r = await runSpec(c.mutate);
      expect(failuresOf(r)).toEqual(c.expected);
      expect(r.code).toBe(1);
    });
  }
});

describe("no-version-bump", () => {
  const changed = "plugin/skills/shared/SKILL.md";

  test("plugin/ changed in the working tree without a bump fails", async () => {
    const co = checkout(up, passingSpec(up));
    co.write(changed, "edited\n");
    const r = await co.run();
    expect(failuresOf(r)).toEqual(["no-version-bump plugin/package.json"]);
    expect(r.code).toBe(1);
  });

  test("an untracked file under plugin/ counts as a change", async () => {
    const spec = clone(passingSpec(up));
    spec.register.originals.push("plugin/rules/new.md");
    const co = checkout(up, spec);
    co.write("plugin/rules/new.md", "new\n");
    const r = await co.run();
    expect(failuresOf(r)).toEqual(["no-version-bump plugin/package.json"]);
  });

  test("the same change with a patch bump passes", async () => {
    const spec = passingSpec(up);
    const co = checkout(up, spec);
    co.write(changed, "edited\n");
    co.write("plugin/package.json", JSON.stringify({ ...spec.manifest, version: "0.1.1" }));
    const r = await co.run();
    expect(r.json!.failures).toEqual([]);
  });

  test("a version that goes down fails even with a change", async () => {
    const spec = clone(passingSpec(up));
    spec.manifest.version = "0.2.0";
    const co = checkout(up, spec);
    co.write(changed, "edited\n");
    co.write("plugin/package.json", JSON.stringify({ ...spec.manifest, version: "0.1.9" }));
    expect(failuresOf(await co.run())).toEqual(["no-version-bump plugin/package.json"]);
  });

  test("--base compares committed changes; the default base (HEAD without origin/HEAD) does not see them", async () => {
    const co = checkout(up, passingSpec(up));
    co.write(changed, "edited\n");
    git(co.root, "commit", "-qam", "edit without bump");
    expect(failuresOf(await co.run(["--base", "HEAD~1"]))).toEqual(["no-version-bump plugin/package.json"]);
    expect(failuresOf(await co.run([], { env: { VSTACK_BASE_REF: "HEAD~1" } }))).toEqual(["no-version-bump plugin/package.json"]);
    expect((await co.run()).json!.failures).toEqual([]);
  });

  test("the default base is the merge base with origin/HEAD when it exists", async () => {
    const co = checkout(up, passingSpec(up));
    git(co.root, "update-ref", "refs/remotes/origin/main", "HEAD");
    git(co.root, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
    co.write(changed, "edited\n");
    git(co.root, "commit", "-qam", "edit without bump");
    const r = await co.run();
    expect(failuresOf(r)).toEqual(["no-version-bump plugin/package.json"]);
    expect(r.json!.notes.join("\n")).toContain("merge base of HEAD and origin/HEAD");
  });

  test("an all-zero base (a new branch push) counts as unset", async () => {
    const co = checkout(up, passingSpec(up));
    const r = await co.run(["--base", "0".repeat(40)]);
    expect(r.json!.failures).toEqual([]);
  });

  test("a plugin new since the base needs no bump", async () => {
    const spec = passingSpec(up);
    const co = checkout(up, spec);
    rmSync(join(co.root, "plugin"), { recursive: true });
    git(co.root, "commit", "-qam", "no plugin yet");
    git(co.root, "checkout", "-q", "HEAD~1", "--", "plugin");
    git(co.root, "reset", "-q");
    const r = await co.run(["--base", "HEAD"]);
    expect(r.json!.failures).toEqual([]);
  });
});

test("--list-classes lists every class, and every class has a fixture above", async () => {
  const p = Bun.spawnSync(["bun", SCRIPT, "--list-classes"], { env: ENV });
  const listed = p.stdout.toString().trim().split("\n");
  const covered = new Set([...cases.map((c) => c.cls), "no-version-bump"]);
  expect(listed.filter((c) => !covered.has(c))).toEqual([]);
  expect(listed.length).toBeGreaterThan(0);
});

test("text output prints FAIL <class> <item>: <message>", async () => {
  const spec = clone(passingSpec(up));
  spec.files["plugin/skills/keep/SKILL.md"] = "changed\n";
  const r = await checkout(up, spec).run([], { json: false });
  expect(r.code).toBe(1);
  expect(r.stdout).toMatch(/^FAIL adopt-not-identical alpha\/keep: plugin\/skills\/keep differs from alpha@v2:skills\/eng\/keep \(changed SKILL\.md\)$/m);
  expect(r.stdout.trim().split("\n").at(-1)).toBe("check-register: 1 failure(s)");
});

test("exit 2 with a remedy when a cached clone is missing", async () => {
  const co = checkout(up, passingSpec(up));
  const r = await co.run(["--upstreams", join(co.root, "no-cache")], { json: false });
  expect(r.code).toBe(2);
  expect(r.stderr).toContain("git clone --filter=blob:none https://github.com/fixture/alpha.git");
});

describe("github source (GitHub tree API)", () => {
  let server: ReturnType<typeof fakeGitHub>;
  beforeAll(() => {
    server = fakeGitHub(up.dir);
  });
  afterAll(() => server.stop(true));
  const env = () => ({ GITHUB_API_URL: `http://127.0.0.1:${server.port}`, GITHUB_TOKEN: "fixture-token" });

  test("the passing fixture passes", async () => {
    const r = await checkout(up, passingSpec(up)).run([], { env: env(), source: "github" });
    expect(r.json!.failures).toEqual([]);
    expect(r.json!.notes).toContain("upstream source: github");
  });

  test("a changed adopt artifact fails the same way as with clones", async () => {
    const spec = clone(passingSpec(up));
    spec.files["plugin/skills/held/SKILL.md"] = ALPHA_V2["skills/eng/held/SKILL.md"];
    const r = await checkout(up, spec).run([], { env: env(), source: "github" });
    expect(failuresOf(r)).toEqual(["adopt-not-identical alpha/held"]);
  });

  test("GitHub Actions selects the github source by default", async () => {
    const r = await checkout(up, passingSpec(up)).run([], { env: { ...env(), GITHUB_ACTIONS: "true" }, source: null });
    expect(r.json!.notes).toContain("upstream source: github");
  });
});

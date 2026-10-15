// check-register run as a process over temp-dir fixtures (spec #63, Testing Decisions, Seam 1).

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { fakeGitHub } from "./support/fake-github.ts";
import {
  ALPHA_V2,
  PAGE_TEMPLATE,
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
/** Ships the alpha style item `name` as its adopt artifact, byte-identical to the Pin. */
function adoptStyle(spec: RepoSpec, name: string) {
  row(spec, `alpha/${name}`).disposition = "adopt";
  row(spec, `alpha/${name}`).artifacts = [`plugin/skills/${name}`];
  Object.assign(spec.files, artifactFrom(ALPHA_V2, `skills/style/${name}`, `plugin/skills/${name}`));
}

const FORM = {
  taskBatch:
    'Fan-out (skill://vstack-fan-out): parts: one per file. One `task` call; `tasks[]` has one item per part, each with `agent: "vstack-explorer"`. Each `task`: the brief, the vstack root. Wait for every result. If they cannot start, stop: name the unread files.',
  evalBatch:
    'Fan-out (skill://vstack-fan-out): parts: one per design. One eval cell: per part, `agent(<prompt>, agent="vstack-explorer", isolated=True, apply=False, merge=False)`; `wait()` on all handles. Each prompt: the brief, the vstack root, the Scratch dir. Apply the best `patchPath`. If they cannot start or isolation is off, stop: the runs need clones.',
  evalStream:
    'Fan-out (skill://vstack-fan-out): parts: one per ticket. One eval cell: per part, `agent(<prompt>, agent="vstack-explorer", isolated=True, apply=False, merge=False)`; no `wait()`, because each handle delivers its own result when it settles. Each prompt: the brief, the vstack root. Land each `patchPath` as it arrives. If they cannot start or isolation is off, stop: the runs need clones.',
  single:
    'Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): the question, the vstack root. Wait for its result. If it cannot be spawned, stop: name the open question.',
  singleSkip:
    'Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): the scores to check, the vstack root. Wait for its result. If it cannot be spawned, skip it: record `cross-judge: not run`.',
  singleIsolated:
    'Spawn one `vstack-explorer` via eval `agent(<prompt>, agent="vstack-explorer", isolated=True, apply=False, merge=False)`: the question, the vstack root. Do not wait; keep working. If it cannot be spawned, stop: it needs its own clone.',
  oldGate: "Fan-out gate (skill://vstack-fan-out): parts: one per file; size: lines in the file.",
  oldFixed:
    'Fan-out (always: invoking the skill asks for it): one eval cell: per part, `agent(<prompt>, agent="vstack-explorer", isolated=True, apply=False, merge=False)`; `wait()` on all handles. Each prompt: the brief, the vstack root. Apply the best `patchPath`. If it cannot spawn or isolation is off, stop: the runs need clones.',
  oldFanOutBranch:
    '- fan-out → one `task` call; `tasks[]` has one item per part, each with `agent: "vstack-explorer"`. Each `task`: the brief, the vstack root.',
  oldInlineBranch: "- inline → do every part yourself, in order, from the same brief.",
  headless:
    'Headless batch (ADR 0010): one eval cell starts every run at once, with no cap. Per run: `omp -p --model <m> --thinking <t> --approval-mode yolo --cwd <run dir> "<prompt>"`. If `omp` cannot run, stop: no omp.',
};
const addTo = (path: string, ...lines: string[]) => (s: RepoSpec) => (s.files[path] += `${lines.join("\n")}\n`);
const GONE = "plugin/skills/gone/SKILL.md";

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

test("migrate-to-vstack's exact Migration copy passes, including the deliberate old phrases", async () => {
  const r = await runSpec(s => {
    s.register.originals.push("plugin/skills/migrate-to-vstack");
    s.register.utility.push("plugin/skills/migrate-to-vstack");
    s.files["plugin/skills/migrate-to-vstack/SKILL.md"] = "Migration\n";
    s.files["plugin/skills/migrate-to-vstack/references/house-style.yaml"] = Bun.YAML.stringify({ replacements: s.houseStyle.replacements.filter(row => row.uses.includes("migration")) });
  });
  expect(r.code).toBe(0); expect(r.json!.failures).toEqual([]);
});
test("skill-ref permits an explicitly named omp built-in without hiding a bare skill reference", async () => {
  const builtin = "omp built-in `/keep`";
  expect((await runSpec(addTo(GONE, builtin))).json!.failures).toEqual([]);
  expect(failuresOf(await runSpec(addTo(GONE, `${builtin}, then /keep`)))).toEqual(["skill-ref alpha/gone"]);
});
test("skill-ref ignores a path segment after a placeholder, but still flags a bare skill reference", async () => {
  const path = "`--session-dir <run dir>/keep`";
  expect((await runSpec(addTo(GONE, path))).json!.failures).toEqual([]);
  expect(failuresOf(await runSpec(addTo(GONE, `${path}, then /keep`)))).toEqual(["skill-ref alpha/gone"]);
});

describe("Addon routes", () => {
  test("skill pointers pass in plugin text and the README", async () => {
    const r = await runSpec((s) => {
      s.files["plugin/rules/fx-rule.md"] += "Read skill://fixture-addon.\n";
      s.files["README.md"] = "Read skill://fixture-addon.\n";
    });
    expect(r.json!.failures).toEqual([]);
    expect(r.code).toBe(0);
  });

  test("Matt and Utility slash routes pass", async () => {
    const r = await runSpec(addTo("plugin/rules/fx-rule.md", "Read /skill:keep and /skill:fixture-helper."));
    expect(r.json!.failures).toEqual([]);
    expect(r.code).toBe(0);
  });

  test("the CHANGELOG is not shipped text", async () => {
    const r = await runSpec((s) => (s.files["CHANGELOG.md"] = "Removed /skill:fixture-addon.\n"));
    expect(r.json!.failures).toEqual([]);
    expect(r.code).toBe(0);
  });

  test("a longer slash name does not route its Addon prefix", async () => {
    const r = await runSpec(addTo("plugin/rules/fx-rule.md", "Read /skill:fixture-addon-extra."));
    expect(r.json!.failures).toEqual([]);
    expect(r.code).toBe(0);
  });

  test("a catalog key makes a skill with a non-reject Base row an Addon", async () => {
    const r = await runSpec((s) => {
      const catalog = JSON.parse(s.files["addon-questions.json"]);
      catalog.questions.held = catalog.questions["fixture-addon"];
      s.files["addon-questions.json"] = JSON.stringify(catalog);
    });
    expect(r.json!.failures).toEqual([]);
    expect(r.code).toBe(0);
  });

  test("a non-skill key under questions fails with the questions map named", async () => {
    const r = await runSpec((s) => {
      const catalog = JSON.parse(s.files["addon-questions.json"]);
      catalog.questions["not-a-skill"] = catalog.questions["fixture-addon"];
      s.files["addon-questions.json"] = JSON.stringify(catalog);
    });
    expect(r.json!.failures).toEqual([{ class: "addon-question-mismatch", item: "not-a-skill", message: "key in the `questions` map of addon-questions.json does not name a shipped Addon" }]);
  });

  test("a top-level key beside preamble and questions makes no Addon", async () => {
    const r = await runSpec((s) => {
      const catalog = JSON.parse(s.files["addon-questions.json"]);
      catalog.held = catalog.questions["fixture-addon"];
      s.files["addon-questions.json"] = JSON.stringify(catalog);
    });
    expect(r.json!.failures).toEqual([]);
  });
});

test("exit 2 when addon-questions.json has the flat shape with no preamble and questions", async () => {
  const spec = clone(passingSpec(up));
  spec.files["addon-questions.json"] = JSON.stringify(JSON.parse(spec.files["addon-questions.json"]).questions);
  const r = await checkout(up, spec).run([], { json: false });
  expect(r.code).toBe(2);
  expect(r.stderr).toContain("addon-questions.json: preamble must be a non-empty string");
});
// One fixture per failure class. Each case lists the exact failures expected as "<class> <item>".
const cases: { cls: string; name: string; mutate: (s: RepoSpec) => void; expected: string[] }[] = [
  {
    cls: "addon-slash-route",
    name: "a slash route in shipped plugin text",
    mutate: addTo("plugin/rules/fx-rule.md", "Read /skill:fixture-addon."),
    expected: ["addon-slash-route plugin/rules/fx-rule.md"],
  },
  {
    cls: "addon-slash-route",
    name: "a slash route in the README",
    mutate: (s) => (s.files["README.md"] = "Read /skill:fixture-addon.\n"),
    expected: ["addon-slash-route README.md"],
  },
  {
    cls: "addon-question-mismatch",
    name: "a catalog key with no shipped Addon",
    mutate: (s) => {
      const catalog = JSON.parse(s.files["addon-questions.json"]);
      catalog.questions.missing = catalog.questions["fixture-addon"];
      s.files["addon-questions.json"] = JSON.stringify(catalog);
    },
    expected: ["addon-question-mismatch missing"],
  },
  {
    cls: "addon-question-mismatch",
    name: "a shipped Addon with no catalog key",
    mutate: (s) => (s.files["addon-questions.json"] = JSON.stringify({ ...JSON.parse(s.files["addon-questions.json"]), questions: {} })),
    expected: ["addon-question-mismatch fixture-addon"],
  },
  {
    cls: "addon-question-mismatch",
    name: "a catalog key naming a Utility skill",
    mutate: (s) => {
      const catalog = JSON.parse(s.files["addon-questions.json"]);
      catalog.questions["fixture-helper"] = catalog.questions["fixture-addon"];
      s.files["addon-questions.json"] = JSON.stringify(catalog);
    },
    expected: ["addon-question-mismatch fixture-helper"],
  },
  {
    cls: "addon-slash-route",
    name: "a slash route to a catalog skill with a non-reject Base row",
    mutate: (s) => {
      const catalog = JSON.parse(s.files["addon-questions.json"]);
      catalog.questions.held = catalog.questions["fixture-addon"];
      s.files["addon-questions.json"] = JSON.stringify(catalog);
      s.files["plugin/rules/fx-rule.md"] += "Read /skill:held.\n";
    },
    expected: ["addon-slash-route plugin/rules/fx-rule.md"],
  },
  {
    cls: "invalid-utility",
    name: "a Utility entry with no shipped skill",
    mutate: (s) => s.register.utility.push("plugin/skills/missing"),
    expected: ["invalid-utility plugin/skills/missing"],
  },
  {
    cls: "invalid-utility",
    name: "a Utility entry naming a Matt skill",
    mutate: (s) => s.register.utility.push("plugin/skills/keep"),
    expected: ["invalid-utility plugin/skills/keep"],
  },
  {
    cls: "non-reject-without-artifacts",
    name: "a non-reject row with no artifacts",
    mutate: (s) => (row(s, "beta/adapted").artifacts = []),
    expected: ["non-reject-without-artifacts beta/adapted"],
  },
  {
    cls: "migration-house-style",
    name: "migrate-to-vstack's copy differs from the root migration rows",
    mutate: (s) => {
      s.register.originals.push("plugin/skills/migrate-to-vstack");
      s.register.utility.push("plugin/skills/migrate-to-vstack");
      s.files["plugin/skills/migrate-to-vstack/SKILL.md"] = "Migration\n";
      s.files["plugin/skills/migrate-to-vstack/references/house-style.yaml"] = Bun.YAML.stringify({ replacements: [] });
    },
    expected: ["migration-house-style plugin/skills/migrate-to-vstack/references/house-style.yaml"],
  },
  {
    cls: "migration-house-style",
    name: "a shipped migrate-to-vstack missing its copy",
    mutate: (s) => {
      s.register.originals.push("plugin/skills/migrate-to-vstack");
      s.register.utility.push("plugin/skills/migrate-to-vstack");
      s.files["plugin/skills/migrate-to-vstack/SKILL.md"] = "Migration\n";
    },
    expected: ["migration-house-style plugin/skills/migrate-to-vstack/references/house-style.yaml"],
  },
  {
    cls: "migration-house-style",
    name: "an invalid match kind in the copy",
    mutate: (s) => {
      s.register.originals.push("plugin/skills/migrate-to-vstack");
      s.register.utility.push("plugin/skills/migrate-to-vstack");
      s.files["plugin/skills/migrate-to-vstack/SKILL.md"] = "Migration\n";
      const replacements = clone(s.houseStyle.replacements.filter(r => r.uses.includes("migration")));
      replacements[0].match = "glob";
      s.files["plugin/skills/migrate-to-vstack/references/house-style.yaml"] = Bun.YAML.stringify({ replacements });
    },
    expected: ["migration-house-style plugin/skills/migrate-to-vstack/references/house-style.yaml"],
  },
  {
    cls: "migration-house-style",
    name: "a schema-valid copy with changed row order",
    mutate: (s) => {
      s.register.originals.push("plugin/skills/migrate-to-vstack");
      s.register.utility.push("plugin/skills/migrate-to-vstack");
      s.files["plugin/skills/migrate-to-vstack/SKILL.md"] = "Migration\n";
      const replacements = clone(s.houseStyle.replacements.filter(r => r.uses.includes("migration")));
      [replacements[2], replacements[3]] = [replacements[3], replacements[2]];
      s.files["plugin/skills/migrate-to-vstack/references/house-style.yaml"] = Bun.YAML.stringify({ replacements });
    },
    expected: ["migration-house-style plugin/skills/migrate-to-vstack/references/house-style.yaml"],
  },
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
    expected: ["missing-artifact alpha/shared-a", "missing-artifact beta/adapted", "missing-artifact beta/playbook-runbook"],
  },
  {
    cls: "reject-with-artifacts",
    name: "a reject row with artifacts",
    mutate: (s) => {
      row(s, "alpha/rej").artifacts = ["plugin/skills/rej"];
      s.files["plugin/skills/rej/SKILL.md"] = "rej\n";
      s.register.utility.push("plugin/skills/rej");
    },
    expected: ["reject-with-artifacts alpha/rej"],
  },
  {
    cls: "unregistered-artifact",
    name: "a plugin skill no row names",
    mutate: (s) => {
      s.files["plugin/skills/stray/SKILL.md"] = "stray\n";
      s.register.utility.push("plugin/skills/stray");
    },
    expected: ["unregistered-artifact plugin/skills/stray"],
  },
  {
    cls: "unregistered-artifact",
    name: "a rule dropped from originals:",
    mutate: (s) => (s.register.originals = s.register.originals.filter((o) => o !== "plugin/rules/fx-rule.md")),
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
  {
    cls: "invalid-house-style",
    name: "a row with an unknown match kind",
    mutate: (s) => (s.houseStyle.replacements[0].match = "fuzzy"),
    expected: ["invalid-house-style house-style.yaml:fx-cmd"],
  },
  {
    cls: "invalid-house-style",
    name: "a row placed after a row that rewrites its from",
    mutate: (s) => s.houseStyle.replacements.push(s.houseStyle.replacements.shift()),
    expected: ["invalid-house-style house-style.yaml:fx-cmd"],
  },
  {
    cls: "invalid-house-style",
    name: "a linted rule missing from rules:",
    mutate: (s) => (s.houseStyle.rules = s.houseStyle.rules.filter((r) => r.id !== "tmp-path")),
    expected: ["invalid-house-style house-style.yaml:tmp-path"],
  },
  {
    cls: "house-style-leftover",
    name: "an adapt artifact naming CONTEXT.md (a name row's from)",
    mutate: (s) => (s.files["plugin/skills/gone/SKILL.md"] += "Read CONTEXT.md first.\n"),
    expected: ["house-style-leftover alpha/gone"],
  },
  {
    cls: "skill-ref",
    name: "a bare /<vstack skill> token in an original",
    mutate: (s) => (s.files["plugin/rules/fx-rule.md"] += "Run /keep first.\n"),
    expected: ["skill-ref plugin/rules/fx-rule.md"],
  },
  {
    cls: "spawn-vocab",
    name: "Cursor spawn wording in a merge artifact, named by its path",
    mutate: (s) => (s.files["plugin/skills/shared/SKILL.md"] += "Spawn a helper with subagent_type: generalPurpose.\n"),
    expected: ["spawn-vocab plugin/skills/shared"],
  },
  {
    cls: "worktree-cmd",
    name: "a git worktree add command in an original agent",
    mutate: (s) => (s.files["plugin/agents/fx-agent.md"] += "Run `git -C repo worktree add ../x` first.\n"),
    expected: ["worktree-cmd plugin/agents/fx-agent.md"],
  },
  {
    cls: "tmp-path",
    name: "$TMPDIR as an output location in an adapt artifact",
    mutate: (s) => (s.files["plugin/skills/gone/SKILL.md"] += "Save the report to $TMPDIR/report.md.\n"),
    expected: ["tmp-path alpha/gone"],
  },
  {
    cls: "ask-tool",
    name: "an asking phrase without `ask` in a byte-identical adopt artifact",
    mutate: (s) => adoptStyle(s, "asks"),
    expected: ["ask-tool alpha/asks"],
  },
  {
    cls: "fan-out",
    name: "a Fan-out line with no stop clause in an adapt artifact",
    mutate: (s) => (s.files["plugin/skills/gone/SKILL.md"] += `${FORM.taskBatch.replace(" If they cannot start, stop: name the unread files.", "")}\n`),
    expected: ["fan-out alpha/gone"],
  },
  {
    cls: "single-spawn",
    name: "a single spawn of a bundled agent in an original",
    mutate: (s) => (s.files["plugin/rules/fx-rule.md"] += `${FORM.single.replaceAll("vstack-explorer", "scout")}\n`),
    expected: ["single-spawn plugin/rules/fx-rule.md"],
  },
  {
    cls: "headless-run",
    name: "the Headless batch form in an adapt artifact off the allowlist",
    mutate: (s) => (s.files["plugin/skills/gone/SKILL.md"] += `${FORM.headless}\n`),
    expected: ["headless-run alpha/gone"],
  },
  {
    cls: "agent-spawns",
    name: "an original agent whose spawns: names a bundled agent",
    mutate: (s) => (s.files["plugin/agents/fx-agent.md"] = "---\nname: fx-agent\ndescription: agent\nspawns: [vstack-explorer, scout]\n---\nagent\n"),
    expected: ["agent-spawns plugin/agents/fx-agent.md"],
  },
  {
    cls: "page-css",
    name: "a page template that breaks the CSS upstream's lint at its Pin",
    mutate: (s) => (s.files["plugin/skills/shared/templates/page.html"] = PAGE_TEMPLATE.violation),
    expected: ["page-css plugin/skills/shared/templates/page.html"],
  },
];

describe("each failure class names the item", () => {
  for (const c of cases) {
    test(`${c.cls}: ${c.name}`, async () => {
      const r = await runSpec(c.mutate);
      expect(failuresOf(r)).toEqual(c.expected);
      expect(r.code).toBe(1);
      if (["addon-slash-route", "addon-question-mismatch", "invalid-utility"].includes(c.cls)) {
        const spec = clone(passingSpec(up));
        c.mutate(spec);
        const printed = await checkout(up, spec).run([], { json: false });
        expect(printed.code).toBe(1);
        expect(printed.stdout.split("\n").filter((line) => line.startsWith("FAIL ")).map((line) => line.split(": ")[0])).toEqual(c.expected.map((failure) => `FAIL ${failure}`));
      }
    });
  }
});

// vstack page templates and the CSS upstream's lint (#61, #72).
describe("page templates", () => {
  const TEMPLATE = "plugin/skills/shared/templates/page.html";

  test("zero templates pass and fetch no lint", async () => {
    const r = await runSpec(() => {});
    expect(r.json!.failures).toEqual([]);
    expect(r.json!.notes).toContain("page templates: none");
  });

  test("a clean template passes", async () => {
    const r = await runSpec((s) => (s.files[TEMPLATE] = PAGE_TEMPLATE.clean));
    expect(r.json!.failures).toEqual([]);
    expect(r.json!.notes).toContain(`page templates: 1, linted with beta@${up.betaPin}:scripts/check-css.mjs`);
  });

  test("a violation names the template and the lint's line", async () => {
    const r = await runSpec((s) => {
      s.files[TEMPLATE] = PAGE_TEMPLATE.violation;
      s.files["plugin/skills/shared/templates/other.html"] = PAGE_TEMPLATE.clean;
    });
    expect(failuresOf(r)).toEqual([`page-css ${TEMPLATE}`]);
    expect(r.json!.failures[0].message).toContain(`${TEMPLATE}:4 left is physical`);
  });

  test("a .css template is linted too, and html outside templates/ is not", async () => {
    const r = await runSpec((s) => {
      s.files["plugin/skills/shared/templates/page.css"] = ".box {\n  left: 0;\n}\n";
      s.files["plugin/skills/shared/assets/figure.html"] = PAGE_TEMPLATE.violation;
    });
    expect(failuresOf(r)).toEqual(["page-css plugin/skills/shared/templates/page.css"]);
  });

  test("exit 2 when no Upstream names a page lint and templates exist", async () => {
    const spec = clone(passingSpec(up));
    delete spec.pins.upstreams.beta.page_lint;
    spec.files[TEMPLATE] = PAGE_TEMPLATE.clean;
    const r = await checkout(up, spec).run();
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("page_lint");
  });
});

// House style lints on the right Dispositions (spec #63, Testing Decisions; ADR 0008).
describe("House style scope", () => {
  const sorted = (r: Run) => failuresOf(r).sort();

  test("ask-tool binds adopt: a byte-identical adopt artifact with an asking phrase and no `ask` fails and names the item", async () => {
    const r = await runSpec((s) => adoptStyle(s, "asks"));
    expect(failuresOf(r)).toEqual(["ask-tool alpha/asks"]);
    expect(r.json!.failures[0].message).toContain("plugin/skills/asks/SKILL.md:5");
  });

  test("the same sentence naming `ask` passes in an adopt artifact", async () => {
    const r = await runSpec((s) => expect(row(s, "alpha/asks-tool").artifacts).toEqual(["plugin/skills/asks-tool"]));
    expect(r.json!.failures).toEqual([]);
  });

  test("tmp-path and worktree-cmd hits pass in an adopt artifact and fail in an adapt one", async () => {
    expect((await runSpec(() => {})).json!.failures).toEqual([]);
    const r = await runSpec((s) => (row(s, "alpha/scratch").disposition = "adapt"));
    expect(sorted(r)).toEqual(["tmp-path alpha/scratch", "worktree-cmd alpha/scratch"]);
  });

  test("a required row's from fails in an adopt artifact; an adapted row's from passes there and fails in adapt", async () => {
    expect(failuresOf(await runSpec((s) => adoptStyle(s, "renamed")))).toEqual(["house-style-leftover alpha/renamed"]);
    expect(failuresOf(await runSpec((s) => (row(s, "alpha/phrasing").disposition = "adapt")))).toEqual(["house-style-leftover alpha/phrasing"]);
  });

  test("a row applies only to its Upstream's artifacts, and originals get every row", async () => {
    const text = "Run old-setup first.\n"; // fx-rename's from; fx-rename is an alpha row
    const beta = await runSpec((s) => {
      row(s, "beta/adapted").artifacts = ["plugin/skills/adapted"];
      s.files["plugin/skills/adapted/SKILL.md"] = `---\nname: adapted\ndescription: adapted\n---\n${text}`;
      s.register.utility.push("plugin/skills/adapted");
    });
    expect(beta.json!.failures).toEqual([]);
    const original = await runSpec((s) => (s.files["plugin/rules/fx-rule.md"] += text));
    expect(failuresOf(original)).toEqual(["house-style-leftover plugin/rules/fx-rule.md"]);
  });

  test("migration-only rows are never linted", async () => {
    const r = await runSpec((s) => (s.files["plugin/skills/gone/SKILL.md"] += "Move .git/old-root away.\n"));
    expect(r.json!.failures).toEqual([]);
  });

  test("a skill on the spawn-vocab allowlist may name spawning; the same text fails off the list", async () => {
    const text = "Hiding works across a subagent dispatch.\n";
    const off = await runSpec((s) => (s.files["plugin/skills/shared/SKILL.md"] += text));
    expect(failuresOf(off)).toEqual(["spawn-vocab plugin/skills/shared"]);
    const on = await runSpec((s) => {
      s.houseStyle.rules.find((r) => r.id === "spawn-vocab").allowlist = ["shared"];
      s.files["plugin/skills/shared/SKILL.md"] += text;
    });
    expect(on.json!.failures).toEqual([]);
  });
});

// Spawn lints (spec #63 "Register check"; ADR 0004, 0007; build decision 2: adapt, merge, and original text only).
describe("spawn lints", () => {
  const sorted = (r: Run) => failuresOf(r).sort();

  test("spawn-vocab permits spawn descriptions in frontmatter but rejects the same wording in the body", async () => {
    const description = "Spawn vstack-comment-critic, fix accepted findings, and offer encodings for claimed constraints.";
    const frontmatter = `---\nname: gone\ndescription: ${description}\n---\n`;
    const ok = await runSpec((s) => (s.files[GONE] = frontmatter + "Run the skill.\n"));
    expect(ok.code).toBe(0);
    expect(ok.json!.failures).toEqual([]);
    const body = await runSpec((s) => (s.files[GONE] = frontmatter + description + "\n"));
    expect(body.code).toBe(1);
    expect(failuresOf(body)).toEqual(["spawn-vocab alpha/gone"]);
  });

  test("every Fan-out form passes: the tasks[] batch, the isolated eval batch that waits, and the one that does not", async () => {
    const backticked = FORM.taskBatch.replace("(skill://vstack-fan-out)", "(`skill://vstack-fan-out`)");
    const r = await runSpec(addTo(GONE, FORM.taskBatch, "", FORM.evalBatch, "", "1. " + FORM.evalStream, "", backticked));
    expect(r.json!.failures).toEqual([]);
  });

  test("single spawns pass in the task form and the isolated eval form", async () => {
    const r = await runSpec(addTo("plugin/agents/fx-agent.md", FORM.single, FORM.singleIsolated));
    expect(r.json!.failures).toEqual([]);
  });

  test("the skip-it ending passes only for compare-attempts' cross-judge", async () => {
    const compareAttempts = (line: string) => (s: RepoSpec) => {
      s.register.originals.push("plugin/skills/compare-attempts");
      s.register.utility.push("plugin/skills/compare-attempts");
      s.files["plugin/skills/compare-attempts/SKILL.md"] = `---\nname: compare-attempts\ndescription: attempts\n---\n${line}\n`;
    };
    expect((await runSpec(compareAttempts(FORM.singleSkip))).json!.failures).toEqual([]);
    const offSite = await runSpec(addTo("plugin/agents/fx-agent.md", FORM.singleSkip));
    expect(failuresOf(offSite)).toEqual(["single-spawn plugin/agents/fx-agent.md"]);
    expect(offSite.json!.failures[0].message).toContain("only compare-attempts' cross-judge");
    const otherSkip = await runSpec(compareAttempts(FORM.singleSkip.replace("record `cross-judge: not run`", "keep going")));
    expect(failuresOf(otherSkip)).toEqual(["single-spawn plugin/skills/compare-attempts"]);
    expect(otherSkip.json!.failures[0].message).toContain("only compare-attempts' cross-judge");
  });

  test("adopt text is exempt: bundled agents in a single spawn and a Fan-out line pass in adopt and fail once the row is adapt", async () => {
    expect((await runSpec(() => {})).json!.failures).toEqual([]);
    const r = await runSpec((s) => (row(s, "alpha/spawner").disposition = "adapt"));
    expect(sorted(r)).toEqual(["fan-out alpha/spawner", "single-spawn alpha/spawner"]);
  });

  test("a Fan-out line off the form fails: citation, parts, batch, agents, vstack root, collect clause, stop clause", async () => {
    const cases: [string, string][] = [
      [FORM.taskBatch.replace("skill://vstack-fan-out", "the rubric"), "does not start `Fan-out (skill://vstack-fan-out): parts: one per"],
      [FORM.taskBatch.replace("parts: one per file. ", ""), "does not start `Fan-out (skill://vstack-fan-out): parts: one per"],
      [FORM.taskBatch.replace("One `task` call; `tasks[]` has one item per part", "Start one task per part"), "is neither one `task` call"],
      [FORM.taskBatch.replace('"vstack-explorer"', '"task"'), 'names "task", not a vstack agent'],
      [FORM.taskBatch.replace(", the vstack root", ""), "does not pass the vstack root"],
      [FORM.taskBatch.replace("If they cannot start, stop: name the unread files.", "If they cannot start, do every part yourself."), "does not end `If they cannot start, stop"],
      [FORM.evalBatch.replace("isolated=True, apply=False, merge=False", "isolated=True"), "the eval batch lacks isolated=True, apply=False, merge=False"],
      [FORM.evalBatch.replace("; `wait()` on all handles", ""), "the eval batch says neither `wait()`"],
      [FORM.evalStream.replace("; no `wait()`, because each handle delivers its own result when it settles", ""), "the eval batch says neither `wait()`"],
      [FORM.evalBatch.replace(" If they cannot start or isolation is off, stop: the runs need clones.", ""), "does not end `If they cannot start, stop"],
    ];
    for (const [line, reason] of cases) {
      const r = await runSpec(addTo(GONE, line));
      expect(failuresOf(r)).toEqual(["fan-out alpha/gone"]);
      expect(r.json!.failures[0].message).toContain(reason);
    }
  });

  test("the removed judge-gated forms fail: a gate line, a fixed Fan-out line, and fan-out or inline branch lines", async () => {
    const blocks = [[FORM.oldGate, FORM.oldFanOutBranch, FORM.oldInlineBranch], [FORM.oldFixed], [FORM.oldFanOutBranch], [FORM.oldInlineBranch]];
    for (const block of blocks) {
      const r = await runSpec(addTo(GONE, ...block));
      expect(failuresOf(r)).toEqual(["fan-out alpha/gone"]);
      expect(r.json!.failures[0].message).toContain("judge-gated");
    }
  });

  test("a spawn site off the forms fails single-spawn: a non-vstack or missing agent, no vstack root, no stop or skip-it ending", async () => {
    const cases: [string, string][] = [
      ['Call `task` with `agent: "reviewer"` for each file.', 'names "reviewer", not a vstack agent'],
      ["Run the reviewers via `task`, one per file.", "a `task` call that names no agent"],
      ["Start one eval `agent(prompt, isolated=True)` per file.", "an eval `agent()` call that names no agent"],
      [FORM.single.replace('`agent: "vstack-explorer"`', '`agent: "sonic"`'), 'passes agent "sonic"'],
      [FORM.single.replace(", the vstack root", ""), "does not pass the vstack root"],
      [FORM.single.replace("If it cannot be spawned, stop: name the open question.", "If it cannot be spawned, do the work yourself."), "does not end `If it cannot be spawned, stop"],
      [FORM.singleIsolated.replace(" If it cannot be spawned, stop: it needs its own clone.", ""), "does not end `If it cannot be spawned, stop"],
    ];
    for (const [line, reason] of cases) {
      const r = await runSpec(addTo("plugin/rules/fx-rule.md", line));
      expect(failuresOf(r)).toEqual(["single-spawn plugin/rules/fx-rule.md"]);
      expect(r.json!.failures[0].message).toContain(reason);
    }
  });

  test("the headless form passes in its allowlisted skill and nowhere else", async () => {
    const off = await runSpec(addTo("plugin/skills/shared/SKILL.md", FORM.headless));
    expect(failuresOf(off)).toEqual(["headless-run plugin/skills/shared"]);
    const on = await runSpec((s) => {
      s.houseStyle.rules.find((r) => r.id === "headless-run").allowlist = ["shared"];
      addTo("plugin/skills/shared/SKILL.md", FORM.headless)(s);
    });
    expect(on.json!.failures).toEqual([]);
  });

  test("spawns: may name only agents the plugin ships, and never *", async () => {
    const agent = (spawns: string) => `---\nname: fx-agent\ndescription: agent\nspawns: ${spawns}\n---\nagent\n`;
    const ok = await runSpec((s) => (s.files["plugin/agents/fx-agent.md"] = agent("[vstack-explorer, fx-agent]")));
    expect(ok.json!.failures).toEqual([]);
    const star = await runSpec((s) => (s.files["plugin/agents/fx-agent.md"] = agent('"*"')));
    expect(failuresOf(star)).toEqual(["agent-spawns plugin/agents/fx-agent.md"]);
  });

  test("spawn-vocab reads wording, not names in inline code or fenced examples", async () => {
    const r = await runSpec(addTo(GONE, "An agent lists its subagents under `spawns:`, and the `single-spawn` rule reads each `Spawn one` line.", "```", "spawn a helper", "```"));
    expect(r.json!.failures).toEqual([]);
    const off = await runSpec(addTo(GONE, "Then spawn a helper per file."));
    expect(failuresOf(off)).toEqual(["spawn-vocab alpha/gone"]);
  });

  test("dispatch means a subagent only in a delegation context", async () => {
    const r = await runSpec(addTo(GONE, "The reducer dispatches its action. Dispatch the request to the handler."));
    expect(r.json!.failures).toEqual([]);
    const off = await runSpec(addTo(GONE, "Dispatch a reviewer per file. Send the brief via a subagent dispatch."));
    expect(failuresOf(off)).toEqual(["spawn-vocab alpha/gone"]);
  });

  test("spawn lints skip frontmatter and code fences, where forms are quoted, not run", async () => {
    const r = await runSpec(addTo(GONE, "```", FORM.taskBatch.replace(", the vstack root", ""), FORM.oldGate, FORM.oldFixed, FORM.oldInlineBranch, FORM.headless, 'agent("x", agent="task")', "```"));
    expect(r.json!.failures).toEqual([]);
  });
});

test("exit 2 when house-style.yaml is missing", async () => {
  const co = checkout(up, passingSpec(up));
  rmSync(join(co.root, "house-style.yaml"));
  const r = await co.run([], { json: false });
  expect(r.code).toBe(2);
  expect(r.stderr).toContain("house-style.yaml");
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

  test("the exact Migration copy passes in CI mode, and a mismatched copy fails", async () => {
    const spec = clone(passingSpec(up));
    spec.register.originals.push("plugin/skills/migrate-to-vstack");
    spec.register.utility.push("plugin/skills/migrate-to-vstack");
    spec.files["plugin/skills/migrate-to-vstack/SKILL.md"] = "Migration\n";
    const copy = "plugin/skills/migrate-to-vstack/references/house-style.yaml";
    spec.files[copy] = Bun.YAML.stringify({ replacements: spec.houseStyle.replacements.filter(r => r.uses.includes("migration")) });
    const pass = await checkout(up, spec).run([], { env: { ...env(), GITHUB_ACTIONS: "true" }, source: null });
    expect(pass.code).toBe(0); expect(pass.json!.notes).toContain("upstream source: github");
    spec.files[copy] = "replacements: []\n";
    const fail = await checkout(up, spec).run([], { env: { ...env(), GITHUB_ACTIONS: "true" }, source: null });
    expect(failuresOf(fail)).toEqual([`migration-house-style ${copy}`]);
  });

  test("a changed adopt artifact fails the same way as with clones", async () => {
    const spec = clone(passingSpec(up));
    spec.files["plugin/skills/held/SKILL.md"] = ALPHA_V2["skills/eng/held/SKILL.md"];
    const r = await checkout(up, spec).run([], { env: env(), source: "github" });
    expect(failuresOf(r)).toEqual(["adopt-not-identical alpha/held"]);
  });

  test("a page template violation fails with the lint fetched from the API", async () => {
    const spec = clone(passingSpec(up));
    spec.files["plugin/skills/shared/templates/page.html"] = PAGE_TEMPLATE.violation;
    const r = await checkout(up, spec).run([], { env: env(), source: "github" });
    expect(failuresOf(r)).toEqual(["page-css plugin/skills/shared/templates/page.html"]);
  });

  test("GitHub Actions selects the github source by default", async () => {
    const r = await checkout(up, passingSpec(up)).run([], { env: { ...env(), GITHUB_ACTIONS: "true" }, source: null });
    expect(r.json!.notes).toContain("upstream source: github");
  });
});

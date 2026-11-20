import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "clean-wt", "scripts", "approval.ts");
const FLOW = join(import.meta.dir, "..", "plugin", "skills", "flow-page", "scripts", "flow-page.ts");
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(count: number) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "clean-wt-approval-")));
  roots.push(root);
  const home = join(root, "home");
  const outside = join(root, "home-adjacent");
  mkdirSync(home);
  mkdirSync(outside);
  const targets = Array.from({ length: count }, (_, i) => {
    const path = join(i === 30 ? outside : home, i === 29 ? "checkout-30\u2028notes" : `checkout-${i + 1}`);
    mkdirSync(path);
    writeFileSync(join(path, "remaining.txt"), `unmerged work ${i + 1}\n`);
    return {
      checkout: {
        path, entry: path, kind: "linked-worktree", verdict: "unused", owners: [], reasons: [],
        state: "dirty", automatic: false, unique_history: [], fingerprint: (i + 1).toString(16).padStart(64, "0"),
      },
      repository: "example-repo",
      verdict: `Unmerged source changes in checkout ${i + 1}.`,
      contents: [{ category: "source", detail: `remaining.txt contains unmerged work ${i + 1}` }],
      integration: { gap: `remaining.txt differs from verified remote default for checkout ${i + 1}` },
      classification: "unmerged source",
      risk: `Removing checkout ${i + 1} loses its remaining source changes.`,
      recommendation: [0, 13, 29].includes(i)
        ? { action: "keep", reason: "Preserve the unmerged source." }
        : { action: "remove", reason: "The investigator identified a disposable experiment." },
    };
  });
  return { root, input: { version: 1, targets } };
}

function plan(input: unknown, cwd: string) {
  const result = Bun.spawnSync([process.execPath, SCRIPT, "-"], {
    cwd, env: { ...process.env, HOME: join(cwd, "home") },
    stdin: new TextEncoder().encode(JSON.stringify(input)), stdout: "pipe", stderr: "pipe",
  });
  return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

function flow(args: string[], cwd: string, input?: unknown) {
  const result = Bun.spawnSync([process.execPath, FLOW, ...args, "--home", join(cwd, "flow-home"), "--session", "approval-test", "--agent", "approval-test"], {
    cwd, env: { ...process.env, VSTACK_FLOW_HOST: "off" },
    stdin: input === undefined ? "ignore" : new TextEncoder().encode(JSON.stringify(input)), stdout: "pipe", stderr: "pipe",
  });
  return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

test("Flow offers one-line remove batches before keep batches without changing what each letter authorizes", () => {
  const { root, input } = fixture(31);
  const before = readdirSync(root).sort();
  const result = plan(input, root);
  expect(result.stderr).toBe("");
  expect(result.code).toBe(0);
  const output = JSON.parse(result.stdout);
  expect(output.rounds.map((round: any) => round.mapping.length)).toEqual([26, 2, 3]);
  expect(readdirSync(root).sort()).toEqual(before);
  expect(output).not.toHaveProperty("selected");
  expect(output).not.toHaveProperty("approved");

  expect(output.rounds[0].mapping[0]).toEqual({
    letter: "A", label: "~/checkout-2 · example-repo · Unmerged source changes in checkout 2. · Agent says remove",
    path: input.targets[1].checkout.path, fingerprint: input.targets[1].checkout.fingerprint,
    recommendation: "remove",
  });
  expect(output.rounds[1].mapping[1]).toEqual({
    letter: "B", label: `${root}/home-adjacent/checkout-31 · example-repo · Unmerged source changes in checkout 31. · Agent says remove`,
    path: input.targets[30].checkout.path, fingerprint: "000000000000000000000000000000000000000000000000000000000000001f",
    recommendation: "remove",
  });
  expect(output.rounds[2].mapping[0]).toEqual({
    letter: "A", label: "~/checkout-1 · example-repo · Unmerged source changes in checkout 1. · Agent says keep",
    path: input.targets[0].checkout.path, fingerprint: input.targets[0].checkout.fingerprint,
    recommendation: "keep",
  });
  const mappedTargets = output.rounds.flatMap((round: any) => round.mapping.map(({ path, fingerprint }: any) => ({ path, fingerprint })));
  expect(mappedTargets).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 1, 14, 30]
    .map((n) => {
      const { path, fingerprint } = input.targets[n - 1].checkout;
      return { path, fingerprint };
    }));

  const opened = flow(["open", "--skill", "clean-wt", "--title", "Cleanup approval fixture"], root);
  expect(opened.code).toBe(0);
  const { flow: flowId, stage } = JSON.parse(opened.stdout);
  for (const [roundIndex, round] of output.rounds.entries()) {
    const items = round.contribution.items;
    expect(items.map((item: any) => item.kind)).toEqual(["round"]);
    expect(items[0].questions).toHaveLength(1);
    const question = items[0].questions[0];
    const group = roundIndex < 2 ? "Agent says remove" : "Agent says keep";
    expect(question.title).toContain(group);
    expect(question.ref).toBe(round.question_ref);
    expect(question).not.toHaveProperty("results");
    const visible = JSON.stringify(question);
    expect(visible).not.toMatch(/remaining\.txt|unmerged source|loses its remaining source|disposable experiment|Preserve the unmerged source/);
    expect(question.multi).toBe(true);
    expect(question.options.length).toBeLessThanOrEqual(26);
    expect(question.options).toHaveLength(round.mapping.length);
    for (const [i, option] of question.options.entries()) {
      expect(option.label).toBe(round.mapping[i].label);
      expect(option.label.endsWith(group)).toBe(true);
      expect(visible).not.toContain(round.mapping[i].fingerprint);
      expect(Object.keys(option).sort()).toEqual(["costs", "does", "gains", "label"]);
      expect(option.gains).toHaveLength(1);
      expect(option.costs).toHaveLength(1);
      for (const line of [option.label, option.does, ...option.gains, ...option.costs]) {
        expect(line).not.toMatch(/[\r\n\u0085\u2028\u2029]/);
      }
    }
    const validated = flow(["validate", "--flow", flowId, "--stage", stage, "-"], root, round.contribution);
    expect(validated.stderr).toBe("");
    expect(validated.code).toBe(0);
    expect(JSON.parse(validated.stdout)).toEqual({ ok: true, diagnostics: [] });
    const published = flow(["submit", "--flow", flowId, "--stage", stage, "-"], root, round.contribution);
    expect(published.code).toBe(0);
    const receipt = JSON.parse(published.stdout);
    const asked = receipt.ask.questions[0];
    expect(asked.multi).toBe(true);
    expect(asked.options.map(({ label }: any) => label)).toEqual(
      round.mapping.map(({ letter, label }: any) => `${letter}. ${label}`),
    );
    expect(asked.options.every((option: any) => !option.recommended)).toBe(true);
    const response = roundIndex === 1 ? { status: "answered", picks: ["B"] } : { status: "empty" };
    expect(flow(["submit", "--flow", flowId, "--stage", stage, "-"], root, {
      version: 1, items: [{ kind: "answer", question: asked.id, response }],
    }).code).toBe(0);
    const shown = JSON.parse(flow(["show", "--flow", flowId], root).stdout);
    const recorded = shown.stages.flatMap((stage: any) => stage.questions).find((question: any) => question.id === asked.id);
    expect(recorded.answer.response).toEqual(response);
    if (roundIndex === 1) {
      expect(recorded.answer.picks).toEqual([`B. ${round.mapping[1].label}`]);
      expect(recorded.open).toBe(false);
    } else expect(recorded.open).toBe(true);
  }
  for (const target of input.targets) {
    expect(existsSync(target.checkout.path)).toBe(true);
    expect(readFileSync(join(target.checkout.path, "remaining.txt"), "utf8")).toMatch(/^unmerged work /);
  }
});

test.each([
  ["verdict", undefined],
  ["verdict", " \t "],
  ["verdict", "First line\nsecond line"],
  ["verdict", "First line\rsecond line"],
  ["verdict", "First line\u2028second line"],
  ["repository", undefined],
  ["repository", " "],
  ["repository", "repo\nother"],
] as const)("invalid %s (%j) identifies the checkout and refuses the whole plan", (field, value) => {
  const { root, input } = fixture(2);
  const [first, second] = input.targets;
  const result = plan({ version: 1, targets: [first, { ...second, [field]: value }] }, root);
  expect(result.code).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain(second.checkout.path);
  expect(result.stderr).toContain(field);
});

test("the planner rejects duplicate paths, protected records, and malformed investigation evidence without emitting a partial plan", () => {
  const { root, input } = fixture(1);
  const target = input.targets[0];
  const withTarget = (patch: object) => ({ version: 1, targets: [{ ...target, ...patch }] });
  const withCheckout = (patch: object) => withTarget({ checkout: { ...target.checkout, ...patch } });
  const invalid: unknown[] = [
    { version: 1, targets: [target, target] },
    ...[
      { verdict: "owned" }, { verdict: "uncertain" }, { state: "unknown" }, { state: "not checked" }, { state: "clean" },
      { automatic: true }, { automatic: undefined }, { kind: "excluded" }, { kind: "foreign" },
      { kind: ["ovnfs"] }, { kind: ["linked-worktree"] }, { kind: { toString: "ovnfs" } },
      { owners: [{ type: "session", id: "live-owner" }] }, { owners: undefined },
      { reasons: ["ownership evidence unavailable"] }, { unique_history: [{ ref: "refs/stash", sha: "a".repeat(40) }] },
      { unique_history: undefined }, { path: "relative/checkout" }, { path: "/" },
      { path: `${root}/checkout/../other` }, { path: `${root}/checkout\nother` },
      { fingerprint: "a".repeat(63) }, { fingerprint: "A".repeat(64) }, { fingerprint: undefined },
    ].map(withCheckout),
    ...[
      { contents: [] }, { contents: undefined }, { contents: [{ category: "source", detail: " " }] },
      { contents: [{ category: "unclassified", detail: "remaining.txt" }] },
      { integration: {} }, { integration: { evidence: "merged", gap: "not checked" } }, { integration: { gap: " " } },
      { integration: undefined }, { classification: "" }, { risk: " " },
      { recommendation: { action: "remove", reason: "" } }, { recommendation: { action: "approve", reason: "disposable" } },
      { recommendation: undefined },
    ].map(withTarget),
    null, { version: 2, targets: [target] }, { version: 1 }, { version: 1, targets: [null] },
  ];
  for (const bad of invalid) {
    const result = plan(bad, root);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("clean-wt approval:");
    expect(readFileSync(join(target.checkout.path, "remaining.txt"), "utf8")).toBe("unmerged work 1\n");
  }
});

test("noncanonical path aliases and fingerprint suffixes cannot create another approval identity", () => {
  const { root, input } = fixture(1);
  const target = input.targets[0];
  const alias = { ...target, checkout: { ...target.checkout, path: `${target.checkout.path}/` } };
  const invalid = [
    { version: 1, targets: [target, alias] },
    { version: 1, targets: [alias] },
    { version: 1, targets: [{ ...target, checkout: { ...target.checkout, fingerprint: `${target.checkout.fingerprint}\n` } }] },
  ];
  for (const bad of invalid) {
    const result = plan(bad, root);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("clean-wt approval:");
  }
});

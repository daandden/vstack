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
  const targets = Array.from({ length: count }, (_, i) => {
    const path = join(root, `checkout-${i + 1}`);
    mkdirSync(path);
    writeFileSync(join(path, "remaining.txt"), `unmerged work ${i + 1}\n`);
    return {
      checkout: {
        path, entry: path, kind: "linked-worktree", verdict: "unused", owners: [], reasons: [],
        state: "dirty", automatic: false, unique_history: [], fingerprint: (i + 1).toString(16).padStart(64, "0"),
      },
      contents: [{ category: "source", detail: `remaining.txt contains unmerged work ${i + 1}` }],
      integration: { gap: `remaining.txt differs from verified remote default for checkout ${i + 1}` },
      classification: "unmerged source",
      risk: `Removing checkout ${i + 1} loses its remaining source changes.`,
      recommendation: { action: i === 30 ? "remove" : "keep", reason: i === 30 ? "The investigator identified a disposable experiment." : "Preserve the unmerged source." },
    };
  });
  return { root, input: { version: 1, targets } };
}

function plan(input: unknown, cwd: string) {
  const result = Bun.spawnSync([process.execPath, SCRIPT, "-"], {
    cwd, stdin: new TextEncoder().encode(JSON.stringify(input)), stdout: "pipe", stderr: "pipe",
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

test("31 investigated targets produce valid bounded Flow rounds with immutable beyond-first-page mappings and no selection or deletion", () => {
  const { root, input } = fixture(31);
  const before = readdirSync(root).sort();
  const result = plan(input, root);
  expect(result.stderr).toBe("");
  expect(result.code).toBe(0);
  const output = JSON.parse(result.stdout);
  expect(output.rounds).toHaveLength(2);
  expect(output.rounds.map((round: any) => round.mapping.length)).toEqual([26, 5]);
  expect(readdirSync(root).sort()).toEqual(before);
  expect(output).not.toHaveProperty("selected");
  expect(output).not.toHaveProperty("approved");

  const first = output.rounds[0].contribution.items;
  expect(first.map((item: any) => item.kind)).toEqual(["result", "round"]);
  expect(first[0]).toMatchObject({ shape: "table", columns: ["Checkout", "Inspected fingerprint", "Remaining contents", "Integration evidence or gap", "Classification", "Risk", "Recommendation"] });
  expect(first[0].rows).toHaveLength(31);
  expect(first[0].rows[30].cells).toEqual([
    input.targets[30].checkout.path, "000000000000000000000000000000000000000000000000000000000000001f",
    "source: remaining.txt contains unmerged work 31", "Gap: remaining.txt differs from verified remote default for checkout 31",
    "unmerged source", "Removing checkout 31 loses its remaining source changes.", "Remove: The investigator identified a disposable experiment.",
  ]);
  expect(output.rounds[1].mapping[4]).toEqual({
    letter: "E", label: input.targets[30].checkout.path, path: input.targets[30].checkout.path,
    fingerprint: "000000000000000000000000000000000000000000000000000000000000001f",
  });

  const opened = flow(["open", "--skill", "clean-wt", "--title", "Cleanup approval fixture"], root);
  expect(opened.code).toBe(0);
  const { flow: flowId, stage } = JSON.parse(opened.stdout);
  for (const [roundIndex, round] of output.rounds.entries()) {
    const questions = round.contribution.items.filter((item: any) => item.kind === "round");
    expect(questions).toHaveLength(1);
    expect(questions[0].questions).toHaveLength(1);
    const question = questions[0].questions[0];
    expect(question.multi).toBe(true);
    expect(question.options.length).toBeLessThanOrEqual(26);
    for (const [i, option] of question.options.entries()) {
      expect(option.label).toBe(round.mapping[i].path);
      expect(option).not.toHaveProperty("recommended");
      expect(option).not.toHaveProperty("selected");
      expect(option).not.toHaveProperty("checked");
      expect(option.does).toContain(round.mapping[i].fingerprint);
      expect(option.costs.join(" ")).toContain("loses its remaining source changes");
    }
    const validated = flow(["validate", "--flow", flowId, "--stage", stage, "-"], root, round.contribution);
    expect(validated.stderr).toBe("");
    expect(validated.code).toBe(0);
    expect(JSON.parse(validated.stdout)).toEqual({ ok: true, diagnostics: [] });
    const published = flow(["submit", "--flow", flowId, "--stage", stage, "-"], root, round.contribution);
    expect(published.code).toBe(0);
    const receipt = JSON.parse(published.stdout);
    const asked = receipt.ask.questions[0];
    const response = roundIndex === 0 ? { status: "empty" } : { status: "answered", picks: ["E"] };
    expect(flow(["submit", "--flow", flowId, "--stage", stage, "-"], root, {
      version: 1, items: [{ kind: "answer", question: asked.id, response }],
    }).code).toBe(0);
    const shown = JSON.parse(flow(["show", "--flow", flowId], root).stdout);
    const recorded = shown.stages.flatMap((stage: any) => stage.questions).find((question: any) => question.id === asked.id);
    expect(recorded.answer.response).toEqual(response);
    if (roundIndex === 0) expect(recorded.open).toBe(true);
    else {
      expect(asked.options[4].label).toBe(`E. ${input.targets[30].checkout.path}`);
      expect(recorded.answer.picks).toEqual([`E. ${input.targets[30].checkout.path}`]);
      expect(recorded.open).toBe(false);
    }
  }
  for (const target of input.targets) {
    expect(existsSync(target.checkout.path)).toBe(true);
    expect(readFileSync(join(target.checkout.path, "remaining.txt"), "utf8")).toMatch(/^unmerged work /);
  }
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

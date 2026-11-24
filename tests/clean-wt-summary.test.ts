import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLEAN = join(import.meta.dir, "../plugin/skills/clean-wt/scripts");
const FLOW = join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts");
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "clean-wt-summary-")));
  roots.push(root);
  const home = join(root, "home");
  mkdirSync(home);
  const save = (file: string, data: unknown) => {
    writeFileSync(join(root, file), JSON.stringify(data));
    return file;
  };
  const run = (script: string, args: string[], input?: unknown) => {
    const result = Bun.spawnSync([process.execPath, script, ...args], {
      cwd: root, env: { ...process.env, HOME: home, VSTACK_FLOW_HOST: "off" },
      stdin: input === undefined ? "ignore" : new TextEncoder().encode(JSON.stringify(input)),
      stdout: "pipe", stderr: "pipe",
    });
    expect(result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
    return JSON.parse(result.stdout.toString());
  };
  const flow = (args: string[], input?: unknown) => run(FLOW, [
    ...args, "--home", join(root, "flow-home"), "--session", "summary-test", "--agent", "summary-test",
  ], input);
  const publish = (contribution: unknown) => {
    expect(flow(["validate", "-"], contribution)).toEqual({ ok: true, diagnostics: [] });
    return flow(["submit", "-"], contribution);
  };
  const render = (records: unknown, revises?: string) => run(join(CLEAN, "summary.ts"), [
    save("summary-records.json", records), ...(revises ? ["--revises", revises] : []),
  ]);
  return { root, home, save, run, flow, publish, render, accounting: () => JSON.parse(readFileSync(join(root, "checkout-accounting.json"), "utf8")) };
}

test.each([
  [undefined, "The cleanup stopped before the initial inventory ran."],
  [{ exit_code: 1, file: "inventory.stdout" }, "The initial inventory failed before it returned a checkout list."],
] as const)("an early exit without inventory records publishes no counts (%j)", (inventory, message) => {
  const f = fixture();
  writeFileSync(join(f.root, "inventory.stdout"), "truncated JSON, private diagnostics and paths");
  f.flow(["open", "--skill", "clean-wt", "--title", "Clean worktrees fixture"]);
  const contribution = f.render({ version: 1, phase: "finished", stop: "inventory", inventory });
  const [result] = contribution.items;
  expect(contribution.items).toHaveLength(1);
  expect(result.summary).toBe(message);
  expect(JSON.stringify(contribution)).not.toMatch(/0 removed|truncated|private diagnostics|inventory\.stdout/);
  const receipt = f.publish(contribution);
  expect(receipt.refs["cleanup-summary"]).toBeString();
  expect(f.accounting().checkouts).toEqual([]);
});

function checkout(path: string, fields: Record<string, unknown> = {}) {
  return { path, kind: "linked-worktree", verdict: "unused", state: "dirty", owners: [], unique_history: [], reasons: [], ...fields };
}

test("a finished summary groups each original checkout once and keeps raw evidence in Scratch", () => {
  const f = fixture();
  const p = (name: string) => join(f.home, name);
  const command = (file: string, json: unknown) => ({ exit_code: 0, file: f.save(file, json) });
  const checkouts = [
    checkout(p("gone"), { state: "clean", automatic: true, changes: {}, fingerprint: "PRIVATE" }),
    checkout(p("picked-skip")),
    checkout(p("auto-skip"), { automatic: true }),
    checkout(p("failed")),
    checkout(p("layout"), { kind: "excluded", verdict: "uncertain", reasons: ["cannot establish source repository for PRIVATE", "native omp entry has no supported checkout layout; PRIVATE"] }),
    checkout(p("origin"), { verdict: "uncertain", reasons: ["cannot establish ovnfs checkout origin: PRIVATE"] }),
    checkout(p("named"), { verdict: "uncertain", reasons: ["ovnfs checkout is outside omp cleanup scope; retain named and verifier checkouts: PRIVATE"] }),
    checkout(p("source"), { verdict: "uncertain", reasons: ["source for ovnfs checkouts: PRIVATE"] }),
    checkout(p("in-use"), { verdict: "owned", owners: [{ type: "process", pid: 92135 }, { type: "session", id: "PRIVATE" }, { type: "task", id: "PRIVATE" }] }),
    checkout(p("unique"), { unique_history: [{ ref: "refs/heads/experiment", sha: "PRIVATE" }, { ref: "refs/stash", sha: "PRIVATE" }] }),
    checkout(p("never")),
    checkout(p("incomplete")),
    checkout(p("gone-unverified"), { kind: "ovnfs" }),
    checkout(p("keep")),
    checkout(p("not-offered")),
  ];
  const inventory = command("inventory.json", { checkouts, evidence_gaps: ["PRIVATE"] });
  const verification = command("verify-inventory.json", {
    checkouts: checkouts.filter(({ path }) => ![p("gone"), p("gone-unverified")].includes(path)), evidence_gaps: [],
  });
  const removeAutomatic = command("remove-automatic.json", {
    removed: [{ path: p("gone"), method: "PRIVATE" }],
    skipped: [{ path: p("auto-skip"), reason: "it is in use now: session PRIVATE" }], failed: [],
  });
  const removePicked = command("remove-picked.json", {
    removed: [{ path: p("gone-unverified"), method: "ovnfs rm" }],
    skipped: [{ path: p("picked-skip"), reason: "it changed since the inventory" }],
    failed: [{ path: p("failed"), error: "PRIVATE" }],
  });
  const mapped = ["picked-skip", "failed", "gone-unverified", "keep", "not-offered"].map((name) => ({
    path: p(name), label: `~/${name} · actual-repo · Draft. · Agent says keep`, fingerprint: "PRIVATE", recommendation: "keep",
  }));
  const approval_plan = f.save("approval-plan.json", { version: 1, rounds: [
    { question_ref: "cleanup-approval-1", mapping: mapped.slice(0, 4) },
    { question_ref: "cleanup-approval-2", mapping: mapped.slice(4) },
  ] });
  f.flow(["open", "--skill", "clean-wt", "--title", "Clean worktrees fixture"]);
  const contribution = f.render({
    version: 1, phase: "finished", inventory, approval_plan,
    offers: [{ question_ref: "cleanup-approval-1", picked: mapped.slice(0, 3).map(({ path }) => path) }],
    investigations: [
      ...mapped.map(({ path }) => ({ path, status: "complete", checkout: { ...checkouts.find((c) => c.path === path), fingerprint: "PRIVATE" } })),
      { path: p("incomplete"), status: "failed", reason: "PRIVATE" },
    ],
    removals: [
      { origin: "automatic", targets: ["gone", "auto-skip"].map((name) => ({ path: p(name), repository: "actual-repo" })), output: removeAutomatic },
      { origin: "picked", targets: mapped.slice(0, 3).map(({ path }) => ({ path, repository: "actual-repo" })), output: removePicked },
    ],
    verification: {
      inventory: verification,
      observations: [
        { path: p("gone"), disk: "absent", git_registered: false, branch_preserved: true },
        { path: p("gone-unverified"), disk: "absent", ovnfs_listed: null },
        ...checkouts.filter(({ path }) => ![p("gone"), p("gone-unverified")].includes(path))
          .map(({ path }) => ({ path, disk: "present" })),
      ],
    },
  });
  const [result] = contribution.items;
  expect(result.summary).toBe("1 removed · 0 needs your pick · 2 skipped · 10 kept");
  expect(result.sections).toEqual([
    { heading: "Skipped", blocks: [{ list: ["~/picked-skip · changed since it was investigated"] }] },
    { heading: "Removed", blocks: [{ list: ["~/gone · actual-repo"] }] },
    { heading: "Kept, in use", blocks: [{ list: ["~/in-use · open session, running task, process using the checkout"] }] },
    { heading: "Kept, unique commits", blocks: [{ list: ["~/unique · refs/heads/experiment, refs/stash"] }] },
    { heading: "Kept, not safe to judge", blocks: [{ list: [
      "1 · Unsupported checkout layout", "1 · Named or verifier ovnfs checkout", "1 · Source in use by ovnfs", "1 · Unknown source repository",
    ] }] },
    { heading: "Offered but not picked", blocks: [{ list: ["~/keep · not selected for removal"] }] },
    { heading: "Removal failed", blocks: [{ list: ["~/failed · the removal command reported a failure"] }] },
    { heading: "Automatic removal skipped", blocks: [{ list: ["~/auto-skip · in use when removal was checked"] }] },
    { heading: "Not investigated", blocks: [{ list: ["~/never · investigation did not run", "~/incomplete · investigation did not finish"] }] },
    { heading: "Outcome not verified", blocks: [{ list: ["~/gone-unverified · removal reported, but ovnfs absence was not verified"] }] },
    { heading: "Kept, no removal attempted", blocks: [{ list: ["~/not-offered · not offered for removal"] }] },
  ]);
  expect(JSON.stringify(contribution)).not.toMatch(/PRIVATE|~\/(?:layout|origin|named|source)|attachments/);
  f.publish(contribution);
  const accounting = f.accounting();
  expect(accounting.checkouts.map(({ discovery }: any) => discovery.path)).toEqual(checkouts.map(({ path }) => path));
  expect(accounting.checkouts.find(({ discovery }: any) => discovery.path === p("gone")).discovery).toEqual(checkouts[0]);
  expect(accounting.checkouts.find(({ discovery }: any) => discovery.path === p("layout")).discovery.reasons).toHaveLength(2);
  expect(accounting.checkouts.find(({ discovery }: any) => discovery.path === p("picked-skip"))).toMatchObject({
    offer: { offered: true, picked: true },
    removals: [{ origin: "picked", repository: "actual-repo", outcome: { reason: "it changed since the inventory" } }],
  });
  expect(accounting.checkouts.find(({ discovery }: any) => discovery.path === p("gone-unverified")).verification.observation.ovnfs_listed).toBeNull();
});

test("discovery churn and inspection failures are neither verified kept nor removed", () => {
  const f = fixture();
  const vanished = checkout(join(f.root, "vanished"), { outcome: "vanished", verdict: "uncertain" });
  const replaced = checkout(join(f.root, "replaced"), { outcome: "replaced", verdict: "uncertain" });
  const failed = checkout(join(f.root, "failed"), {
    outcome: "inspection failed", verdict: "uncertain", failure: { stage: "layout", error: "PRIVATE error" },
  });
  const checkouts = [vanished, replaced, failed];
  const inventory = { exit_code: 0, file: f.save("inventory.json", { checkouts, evidence_gaps: [] }) };
  const verification = {
    inventory: { exit_code: 0, file: f.save("verify-inventory.json", { checkouts: [checkout(replaced.path), checkout(failed.path)], evidence_gaps: [] }) },
    observations: [
      { path: vanished.path, disk: "absent", git_registered: false },
      { path: replaced.path, disk: "present" },
      { path: failed.path, disk: "present" },
    ],
  };
  f.flow(["open", "--skill", "clean-wt", "--title", "Cleanup discovery fixture"]);
  const contribution = f.render({ version: 1, phase: "finished", inventory, verification });
  const [result] = contribution.items;
  expect(result.summary).toBe("0 removed · 0 needs your pick · 0 skipped · 0 kept · 1 vanished · 1 replaced · 1 inspection failed");
  expect(result.sections.map(({ heading }: { heading: string }) => heading)).toEqual(["Vanished", "Replaced", "Inspection failed"]);
  expect(JSON.stringify(contribution)).not.toContain("PRIVATE error");
  f.publish(contribution);
  expect(f.accounting().checkouts.map(({ discovery }: { discovery: unknown }) => discovery)).toEqual(checkouts);
});

test("guarded skips still count once when final verification cannot confirm presence or ownership", () => {
  const f = fixture();
  const targets = ["confirmed", "missing", "uncertain"].map((name) => ({
    path: join(f.home, name), repository: "example",
  }));
  const [confirmed, missing, uncertain] = targets;
  const checkouts = targets.map(({ path }) => checkout(path));
  f.flow(["open", "--skill", "clean-wt", "--title", "Clean worktrees fixture"]);
  const contribution = f.render({
    version: 1, phase: "finished",
    inventory: { exit_code: 0, file: f.save("inventory.json", { checkouts, evidence_gaps: [] }) },
    removals: [{
      origin: "picked", targets,
      output: { exit_code: 0, file: f.save("remove.json", {
        removed: [], failed: [],
        skipped: targets.map(({ path }) => ({ path, reason: "it changed since the inventory" })),
      }) },
    }],
    verification: {
      inventory: { exit_code: 0, file: f.save("verify.json", { evidence_gaps: [], checkouts: [
        checkout(confirmed.path), checkout(uncertain.path, { verdict: "uncertain" }),
      ] }) },
      observations: [{ path: confirmed.path, disk: "present" }, { path: missing.path, disk: "absent" }, { path: uncertain.path, disk: "present" }],
    },
  });
  f.publish(contribution);
  expect(contribution.items[0]).toMatchObject({
    summary: "0 removed · 0 needs your pick · 3 skipped · 0 kept",
    sections: [{ heading: "Skipped", blocks: [{ list: [
      "~/confirmed · changed since it was investigated",
      "~/missing · changed since it was investigated · presence not verified",
      "~/uncertain · changed since it was investigated · ownership not verified",
    ] }] }],
  });
});

test("planner labels and order survive whole-summary links as settled pick rows leave", () => {
  const f = fixture();
  const targets = (["keep", "remove", "remove"] as const).map((action, i) => ({
    checkout: checkout(join(f.home, i === 2 ? "draft-2[@notes]" : `draft-${i}`), {
      automatic: false, fingerprint: String(i + 1).repeat(64), reasons: [],
    }),
    repository: "example",
    verdict: `Draft ${i} has local changes.`,
    contents: [{ category: "source", detail: "PRIVATE" }],
    integration: { gap: "PRIVATE" },
    classification: "PRIVATE",
    risk: "PRIVATE",
    recommendation: { action, reason: "PRIVATE" },
  }));
  const plan = f.run(join(CLEAN, "approval.ts"), ["-"], { version: 1, targets });
  const records = {
    version: 1,
    inventory: { exit_code: 0, file: f.save("inventory.json", { checkouts: targets.map(({ checkout }) => checkout), evidence_gaps: [] }) },
    investigations: targets.map(({ checkout }) => ({ path: checkout.path, status: "complete", checkout })),
    approval_plan: f.save("approval-plan.json", plan),
  };
  f.flow(["open", "--skill", "clean-wt", "--title", "Clean worktrees fixture"]);
  const first = f.publish(f.render({ ...records, phase: "running", approval_plan: undefined, investigations: [] }));
  const resultId = first.refs["cleanup-summary"];
  const pickSummary = f.render({ ...records, phase: "picking" }, resultId);
  f.publish(pickSummary);
  expect(pickSummary.items[0].summary).toBe("0 removed · 3 needs your pick · 0 skipped · 0 kept");
  expect(pickSummary.items[0].sections.slice(0, 3)).toEqual([
    { heading: "Needs your pick", blocks: [{ prose: "Select only the checkouts you want removed." }] },
    { heading: "Agent says remove", blocks: [{ code: plan.rounds[0].mapping.map(({ label }: any) => label).join("\n") }] },
    { heading: "Agent says keep", blocks: [{ list: plan.rounds[1].mapping.map(({ label }: any) => label) }] },
  ]);
  expect(JSON.stringify(pickSummary)).not.toContain("PRIVATE");

  const round = plan.rounds[0];
  const linked = f.run(join(CLEAN, "summary.ts"), ["link-round", records.approval_plan, round.question_ref, resultId]);
  expect(linked.items).toEqual([{ ...round.contribution.items[0],
    questions: [{ ...round.contribution.items[0].questions[0], results: [resultId] }],
  }]);
  const receipt = f.publish(linked);
  const question = receipt.ask.questions[0];
  expect(question.options.map(({ label }: any) => label)).toEqual(round.mapping.map(({ label, letter }: any) => `${letter}. ${label}`));
  f.publish({ version: 1, items: [{ kind: "answer", question: question.id, response: { status: "answered", picks: ["A"] } }] });

  const offers = [{ question_ref: round.question_ref, picked: [round.mapping[0].path] }];
  const afterPick = f.render({ ...records, phase: "picking", offers }, resultId);
  f.publish(afterPick);
  expect(afterPick.items[0].summary).toBe("0 removed · 1 needs your pick · 0 skipped · 1 kept");
  expect(afterPick.items[0].sections.some(({ heading }: any) => heading === "Agent says remove")).toBe(false);
  const pendingRemoval = { heading: "Removal pending", blocks: [{ list: ["~/draft-1 · picked for removal"] }] };
  expect(afterPick.items[0].sections).toContainEqual(pendingRemoval);

  const attempt = { origin: "picked", targets: [{ path: round.mapping[0].path, repository: "example" }] };
  const inFlight = f.render({ ...records, phase: "picking", offers, removals: [attempt] }, resultId);
  expect(f.publish(inFlight).repeated).toBe(true);
  expect(inFlight.items[0].sections).toContainEqual(pendingRemoval);

  const output = { exit_code: 0, file: f.save("remove-picked.json", {
    removed: [], failed: [], skipped: [{ path: round.mapping[0].path, reason: "it changed since the inventory" }],
  }) };
  const removals = [{ ...attempt, output }];
  const afterReport = f.render({ ...records, phase: "picking", offers, removals }, resultId);
  f.publish(afterReport);
  expect(afterReport.items[0].sections).toContainEqual({
    heading: "Skipped", blocks: [{ list: ["~/draft-1 · changed since it was investigated"] }],
  });
  expect(afterReport.items[0].sections).not.toContainEqual(expect.objectContaining({ heading: "Removal pending" }));
  expect(afterReport.items[0].summary).toBe("0 removed · 1 needs your pick · 1 skipped · 1 kept");

  const final = f.render({ ...records, phase: "finished", stop: "removal", offers, removals }, resultId);
  expect(final.items[0].sections).toContainEqual({
    heading: "Skipped", blocks: [{ list: ["~/draft-1 · changed since it was investigated · presence not verified"] }],
  });
  expect(final.items[0].sections).toContainEqual({
    heading: "Offered but not picked", blocks: [{ code: "~/draft-2[@notes] · not selected for removal" }],
  });
  expect(final.items[0].sections).toContainEqual({
    heading: "Kept, no removal attempted", blocks: [{ list: ["~/draft-0 · not offered for removal"] }],
  });
  expect(final.items[0].sections).not.toContainEqual(expect.objectContaining({ heading: "Needs your pick" }));
  expect(final.items[0].sections).toContainEqual({
    heading: "Run status", blocks: [{ prose: "The cleanup stopped during removal." }],
  });
  f.publish(final);
  const shown = f.flow(["show"]);
  expect(shown.stages[0].results).toHaveLength(1);
  expect(shown.stages[0].results[0]).toMatchObject({ id: resultId, revision: 5, questions: [question.id] });
  expect(shown.stages[0].questions[0].results).toEqual([resultId]);
});

test("an early exit preserves inventory classifications without confirming a reported removal", () => {
  const f = fixture();
  const path = join(f.home, "reported-removed");
  const records = {
    version: 1,
    inventory: { exit_code: 0, file: f.save("inventory.json", { evidence_gaps: [], checkouts: [
      checkout(path, { automatic: true }),
      checkout(join(f.home, "uninvestigated")),
      checkout(join(f.home, "protected-private"), { kind: "excluded", verdict: "uncertain" }),
      checkout(join(f.home, "uncertain-private"), { verdict: "uncertain", reasons: ["cannot establish source repository PRIVATE"] }),
    ] }) },
    removals: [{
      origin: "automatic", targets: [{ path, repository: "example" }],
      output: { exit_code: 0, file: f.save("remove.json", { removed: [{ path, method: "git worktree remove" }], skipped: [], failed: [] }) },
    }],
  };
  f.flow(["open", "--skill", "clean-wt", "--title", "Clean worktrees fixture"]);
  const initial = f.render({ ...records, phase: "running" });
  expect(initial.items[0].summary).toBe("1 removed · 0 needs your pick · 0 skipped · 3 kept");
  const { refs } = f.publish(initial);
  const stopped = f.render({ ...records, phase: "finished", stop: "investigation" }, refs["cleanup-summary"]);
  f.publish(stopped);
  expect(stopped.items[0].summary).toBe("0 removed · 0 needs your pick · 0 skipped · 3 kept");
  expect(stopped.items[0].sections).toEqual([
    { heading: "Kept, not safe to judge", blocks: [{ list: ["1 · Unsupported checkout layout", "1 · Unknown source repository"] }] },
    { heading: "Not investigated", blocks: [{ list: ["~/uninvestigated · investigation did not run"] }] },
    { heading: "Outcome not verified", blocks: [{ list: ["~/reported-removed · removal reported, but verification did not run"] }] },
    { heading: "Run status", blocks: [{ prose: "The cleanup stopped during investigation." }] },
  ]);
  expect(JSON.stringify(stopped)).not.toMatch(/PRIVATE|protected-private|uncertain-private/);
});

test("the final summary reports ownership changes and does not confirm unobserved kept checkouts", () => {
  const f = fixture();
  const p = (name: string) => join(f.home, name);
  const owned = (name: string, id: string) => checkout(p(name), { verdict: "owned", owners: [{ type: "session", id }] });
  const stable = owned("stable", "PRIVATE-1");
  const lost = owned("lost", "PRIVATE-2");
  const changed = owned("changed", "PRIVATE-3");
  const gained = checkout(p("gained"));
  const missingDisk = owned("missing-disk", "PRIVATE-4");
  const missingListing = owned("missing-listing", "PRIVATE-5");
  const excluded = checkout(p("excluded-private-path"), { kind: "excluded", verdict: "uncertain" });
  const checkouts = [stable, lost, changed, gained, missingDisk, missingListing, excluded];
  const verified = [stable, checkout(lost.path), owned("changed", "PRIVATE-6"), owned("gained", "PRIVATE-7"), missingDisk, excluded];
  const inventory = { exit_code: 0, file: f.save("inventory.json", { checkouts, evidence_gaps: [] }) };
  const observations = [stable, lost, changed, gained, missingListing].map(({ path }) => ({ path, disk: "present" }));
  f.flow(["open", "--skill", "clean-wt", "--title", "Clean worktrees fixture"]);
  const contribution = f.render({
    version: 1, phase: "finished", inventory,
    verification: { inventory: { exit_code: 0, file: f.save("verify.json", { checkouts: verified, evidence_gaps: [] }) }, observations },
  });
  expect(contribution.items[0]).toMatchObject({
    summary: "0 removed · 0 needs your pick · 0 skipped · 4 kept",
    sections: [
      { heading: "Kept, in use", blocks: [{ list: ["~/stable · open session"] }] },
      { heading: "Kept, ownership changed", blocks: [{ list: [
        "~/lost · no longer in use at verification",
        "~/changed · different owners at verification",
        "~/gained · in use at verification",
      ] }] },
      { heading: "Outcome not verified", blocks: [{ list: [
        "~/missing-disk · presence on disk was not verified",
        "~/missing-listing · kept checkout was not listed at verification",
        "1 · presence on disk was not verified",
      ] }] },
    ],
  });
  expect(JSON.stringify(contribution)).not.toMatch(/PRIVATE|excluded-private-path/);
  f.publish(contribution);
  expect(f.accounting().checkouts.map(({ discovery }: any) => discovery.path)).toEqual(checkouts.map(({ path }) => path));
});

test("an incomplete verification does not confirm a kept outcome even if the path was listed", () => {
  const f = fixture();
  const path = join(f.home, "in-use");
  const checkouts = [checkout(path, { verdict: "owned", owners: [{ type: "session", id: "PRIVATE" }] })];
  const inventory = { exit_code: 0, file: f.save("inventory.json", { checkouts, evidence_gaps: [] }) };
  f.flow(["open", "--skill", "clean-wt", "--title", "Clean worktrees fixture"]);
  const contribution = f.render({
    version: 1, phase: "finished", inventory,
    verification: {
      inventory: { exit_code: 0, file: f.save("verify.json", { checkouts, evidence_gaps: ["PRIVATE"] }) },
      observations: [{ path, disk: "present" }],
    },
  });
  expect(contribution.items[0]).toMatchObject({
    summary: "0 removed · 0 needs your pick · 0 skipped · 0 kept",
    sections: [{ heading: "Outcome not verified", blocks: [{ list: ["~/in-use · verification did not finish"] }] }],
  });
  expect(JSON.stringify(contribution)).not.toContain("PRIVATE");
  f.publish(contribution);
});

test("newly uncertain ownership is not counted as kept even when disk presence is verified", () => {
  const f = fixture();
  const path = join(f.home, "draft");
  const before = checkout(path);
  const after = checkout(path, { verdict: "uncertain", state: "not checked", reasons: ["source for ovnfs checkouts: PRIVATE"] });
  const inventory = (file: string, record: typeof before) => ({ exit_code: 0, file: f.save(file, {
    checkouts: [record], evidence_gaps: [],
  }) });
  f.flow(["open", "--skill", "clean-wt", "--title", "Clean worktrees fixture"]);
  const contribution = f.render({
    version: 1, phase: "finished", inventory: inventory("inventory.json", before),
    verification: { inventory: inventory("verify.json", after), observations: [{ path, disk: "present" }] },
  });
  f.publish(contribution);
  expect(contribution.items[0]).toMatchObject({
    summary: "0 removed · 0 needs your pick · 0 skipped · 0 kept",
    sections: [{ heading: "Outcome not verified", blocks: [{ list: ["~/draft · ownership could not be verified"] }] }],
  });
});

test("separator characters in checkout fields do not make distinct choices look the same", () => {
  const f = fixture();
  const targets = [
    ["wt-alpha", "demo · upstream", "current · draft"],
    ["wt-alpha · demo", "upstream · current", "draft"],
    [String.raw`wt-alpha \u00b7 demo`, "upstream · current", "draft"],
  ].map(([name, repository, verdict], i) => ({
    checkout: checkout(join(f.home, name), { automatic: false, fingerprint: String(i + 1).repeat(64) }),
    repository, verdict,
    contents: [{ category: "source", detail: "PRIVATE" }],
    integration: { gap: "PRIVATE" }, classification: "PRIVATE", risk: "PRIVATE",
    recommendation: { action: "keep", reason: "PRIVATE" },
  }));
  const plan = f.run(join(CLEAN, "approval.ts"), ["-"], { version: 1, targets });
  const records = {
    version: 1, approval_plan: f.save("approval-plan.json", plan),
    inventory: { exit_code: 0, file: f.save("inventory.json", { checkouts: targets.map(({ checkout }) => checkout), evidence_gaps: [] }) },
    investigations: targets.map(({ checkout }) => ({ path: checkout.path, status: "complete", checkout })),
  };
  f.flow(["open", "--skill", "clean-wt", "--title", "Clean worktrees fixture"]);
  const summary = f.render({ ...records, phase: "picking" });
  const { refs } = f.publish(summary);
  const { question_ref } = plan.rounds[0];
  const linked = f.run(join(CLEAN, "summary.ts"), ["link-round", records.approval_plan, question_ref, refs["cleanup-summary"]]);
  const receipt = f.publish(linked);
  const [question] = receipt.ask.questions;
  const labels = [
    "~/wt-alpha · demo \\u00b7 upstream · current \\u00b7 draft · Agent says keep",
    "~/wt-alpha \\u00b7 demo · upstream \\u00b7 current · draft · Agent says keep",
    "~/wt-alpha \\\\u00b7 demo · upstream \\u00b7 current · draft · Agent says keep",
  ];
  expect(question.options.map(({ label }: { label: string }) => label)).toEqual(labels.map((label, i) => `${"ABC"[i]}. ${label}`));
  expect(summary.items[0].sections).toContainEqual({ heading: "Agent says keep", blocks: [{ list: labels }] });

  const { checkout: { path }, repository } = targets[1];
  f.publish({ version: 1, items: [{ kind: "answer", question: question.id, response: { status: "answered", picks: ["B"] } }] });
  const reported = f.render({
    ...records, phase: "picking", offers: [{ question_ref, picked: [path] }],
    removals: [{
      origin: "picked", targets: [{ path, repository }],
      output: { exit_code: 0, file: f.save("remove.json", { removed: [{ path }], skipped: [], failed: [] }) },
    }],
  }, refs["cleanup-summary"]);
  f.publish(reported);
  expect(reported.items[0].sections).toContainEqual({
    heading: "Removed", blocks: [{ list: ["~/wt-alpha \\u00b7 demo · upstream \\u00b7 current"] }],
  });
});

test("summary outcome rows expose non-printing Unicode in paths and reasons", () => {
  const f = fixture();
  const checkouts = ["wt-alpha", "wt-\u200balpha"].map((name) => checkout(join(f.home, name), {
    unique_history: [{ ref: "refs/heads/draft\u0080\u034f\u202e\u2069\u202f\u{e0001}\ufe0f\ufeff-end" }],
  }));
  const summary = f.render({
    version: 1,
    phase: "running",
    inventory: { exit_code: 0, file: f.save("inventory.json", { checkouts, evidence_gaps: [] }) },
  });
  const reason = "refs/heads/draft\\u0080\\u034f\\u202e\\u2069\\u202f\\u{e0001}\\ufe0f\\ufeff-end";
  expect(summary.items[0].sections).toContainEqual({
    heading: "Kept, unique commits",
    blocks: [{ list: [`~/wt-alpha · ${reason}`, `~/wt-\\u200balpha · ${reason}`] }],
  });
});

test("the summary groups a saved recommendation independently of label wording", () => {
  const f = fixture();
  const path = join(f.home, "draft");
  const draft = checkout(path);
  const label = "~/draft · example · Changes already landed. · Agent says remove.";
  const rounds = [{
    question_ref: "cleanup-approval-1",
    mapping: [{ letter: "A", path, fingerprint: "a".repeat(64), label, recommendation: "remove" }],
  }];
  f.flow(["open", "--skill", "clean-wt", "--title", "Clean worktrees fixture"]);
  const summary = f.render({
    version: 1, phase: "picking",
    approval_plan: f.save("approval-plan.json", { version: 1, rounds }),
    inventory: { exit_code: 0, file: f.save("inventory.json", { checkouts: [draft], evidence_gaps: [] }) },
    investigations: [{ path, checkout: draft, status: "complete" }],
  });
  f.publish(summary);
  expect(summary.items[0].sections).toContainEqual({ heading: "Agent says remove", blocks: [{ list: [label] }] });
});

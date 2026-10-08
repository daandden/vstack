import { afterEach, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeUpdateFixture } from "./support/update-fixture.ts";
import { ENV, git } from "./support/fixture.ts";
import { lifecycleFixture } from "./support/update-lifecycle-fixture.ts";

test("preview, confirmation, re-gates, report and injected publication reach a PR", async () => {
  const f = lifecycleFixture(); dirs.push(f.dir);
  const { plan, file, planFile } = await f.planned();
  const args = ["--plan", planFile];
  expect((await run(["prepare", ...args, "--decisions", file], f.root)).code).toBe(0);
  let calls = 0;
  const server = Bun.serve({ port: 0, fetch(req) { calls++; return Response.json({ answers: { expected: { type: "noul", noul: .69 }, other: { type: "noul", noul: .81 } } }); } });
  try {
    const gateArgs = [...args, "--upstreams", f.cache, "--smoke", f.smoke, "--endpoint", `http://localhost:${server.port}/v1/systemone`];
    const preview = await run(["gates", ...gateArgs, "--phase", "preview"], f.root, { TYPESAFE_API_KEY: "fixture" });
    expect({ code: preview.code, err: preview.err }).toEqual({ code: 0, err: "" });
    expect(JSON.parse(preview.out).jev.flags).toHaveLength(2); expect(calls).toBe(1);
    const reportFile = join(f.dir, "update-report.html");
    const report = await run(["report", ...args, "--report", reportFile], f.root);
    expect(report.code).toBe(0);
    expect(readFileSync(reportFile, "utf8")).toContain("Reason still holds.");
    expect(readFileSync(reportFile, "utf8")).toContain("matt/wording");
    expect((await run(["apply", ...args, "--decisions", file], f.root)).code).toBe(0);
    expect((await run(["finish", ...args, "--gh", f.gh, "--push", f.push], f.root)).code).toBe(2);
    expect(f.calls()).toEqual([]);
    const after = await run(["gates", ...gateArgs, "--phase", "confirmed"], f.root);
    expect(after.code).toBe(0); expect(calls).toBe(1);
    const done = await run(["finish", ...args, "--gh", f.gh, "--push", f.push], f.root);
    expect(done.code).toBe(0); expect(JSON.parse(done.out).url).toBe("https://example.invalid/pull/98");
    expect(f.calls().map(c => c[0])).toEqual(["push", "gh"]);
    expect(git(plan.worktree.path, "ls-files")).not.toContain("update-report.html");
    expect(readFileSync(join(plan.out, "pr-body.md"), "utf8")).toContain("matt/wording: hold");
  } finally { server.stop(true); }
}, 30000);
const script = join(import.meta.dir, "../scripts/vstack-update.ts");
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
async function run(args: string[], cwd: string, env = {}) {
  const p = Bun.spawn([process.execPath, script, ...args], { cwd, env: { ...ENV, ...env }, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return { out, err, code };
}
test("preconditions stop on wrong manifest, any Update branch, and an open Update PR", async () => {
  const f = lifecycleFixture(); dirs.push(f.dir);
  writeFileSync(join(f.root, "plugin/package.json"), JSON.stringify({ name: "not-vstack" }));
  expect((await run(["preflight", "--gh", f.gh], f.root)).err).toContain("manifest");
  git(f.root, "restore", "plugin/package.json");
  git(f.root, "branch", "update/existing");
  expect((await run(["preflight", "--gh", f.gh], f.root)).err).toContain("update/existing");
  git(f.root, "branch", "-D", "update/existing");
  const open = await run(["preflight", "--gh", f.gh], f.root, { OPEN_PR: JSON.stringify([{ headRefName: "update/open", url: "https://example.invalid/pr/1" }]) });
  expect(open.err).toContain("https://example.invalid/pr/1");
}, 30000);
test("no moved Pin exits without a worktree or jev, and refusal removes only its worktree and branch", async () => {
  const f = lifecycleFixture(); dirs.push(f.dir);
  const none = await run(["plan", "--gh", f.gh, "--omp", join(f.dir, "omp"), "--upstreams", f.cache, "--remote", f.remote, "matt@v1.1.0"], f.root);
  expect({ code: none.code, err: none.err }).toEqual({ code: 0, err: "" });
  expect(JSON.parse(none.out).moved).toBe(false); expect(f.ompCalls()).toEqual([]);
  const { plan, planFile } = await f.planned();
  expect((await run(["cancel", "--plan", planFile], f.root)).code).toBe(0);
  expect(git(f.root, "branch", "--list", "update/*")).toBe("");
  expect(git(f.root, "worktree", "list")).not.toContain(plan.worktree.path);
  expect(readFileSync(join(f.root, "pins.yaml"), "utf8")).toContain("v1.1.0");
}, 30000);
test("already-held rows keep their original baseline across application and the next plan", async () => {
  const f = lifecycleFixture(); dirs.push(f.dir);
  const { plan, decisions, file, planFile } = await f.planned();
  decisions.find((d: any) => d.id === "matt/held").action = "hold";
  writeFileSync(file, JSON.stringify({ decisions }));
  expect((await run(["apply", "--plan", planFile, "--decisions", file], f.root)).code).toBe(0);
  const reg = Bun.YAML.parse(readFileSync(join(plan.worktree.path, "decision-register.yaml"), "utf8")) as any;
  expect(reg.items.find((r: any) => r.id === "matt/held")).toMatchObject({ held_at: "v1.0.0", held_path: "skills/eng/held" });
  expect(readFileSync(join(plan.worktree.path, "plugin/skills/held/SKILL.md"), "utf8")).toContain("held 1.0");
  git(plan.worktree.path, "add", "-A"); git(plan.worktree.path, "commit", "-qm", "fixture applied");
  git(f.root, "merge", "--ff-only", plan.branch);
  expect((await run(["cancel", "--plan", planFile], f.root)).code).toBe(0);
  git(f.mattRepo, "tag", "-a", "v1.3.0", "-m", "stable");
  const next = await f.run(f.root, ["matt"], { FAKE_OMP_CLONE: "1" });
  expect(next.code).toBe(0);
  expect(next.plan.rows.find((r: any) => r.id === "matt/wording").effective_old).toMatchObject({ ref: "v1.1.0", path: "skills/eng/wording" });
  expect(next.plan.rows.find((r: any) => r.id === "matt/held").effective_old.ref).toBe("v1.0.0");
}, 30000);
test("smoke and judge errors block receipts and borderline scores do not fail", async () => {
  const f = lifecycleFixture(); dirs.push(f.dir);
  const { plan, file, planFile } = await f.planned();
  const args = ["--plan", planFile];
  expect((await run(["prepare", ...args, "--decisions", file], f.root)).code).toBe(0);
  const server = Bun.serve({ port: 0, fetch() { return Response.json({ answers: { expected: { type: "noul", noul: .70 }, other: { type: "noul", noul: .80 } } }); } });
  try {
    const gates = ["gates", ...args, "--phase", "preview", "--upstreams", f.cache, "--smoke", f.smoke, "--endpoint", `http://localhost:${server.port}/v1/systemone`];
    expect((await run(gates, f.root, { FAIL_SMOKE: "1" })).code).toBe(2);
    expect((await run(gates, f.root, { TYPESAFE_API_KEY: "" })).err).toContain("TYPESAFE_API_KEY");
    const pass = await run(gates, f.root, { TYPESAFE_API_KEY: "fixture" });
    expect(pass.code).toBe(0); expect(JSON.parse(pass.out).jev.flags).toHaveLength(0); expect(JSON.parse(pass.out).jev.borderline).toHaveLength(2);
    writeFileSync(join(plan.worktree.path, "plugin/skills/grow/SKILL.md"), "changed after gate");
    expect((await run(["gates", ...args, "--phase", "confirmed", "--upstreams", f.cache, "--smoke", f.smoke], f.root)).code).toBe(2);
  } finally { server.stop(true); }
}, 30000);
test("default tag discovery ignores draft and prerelease GitHub releases", async () => {
  const f = lifecycleFixture(); dirs.push(f.dir);
  const releases = [[{ tag_name: "v99.0.0", draft: true }, { tag_name: "v100.0.0", prerelease: true }, { tag_name: "mattpocock-skills@7.0.0" }, { tag_name: "v1.2.0", draft: false, prerelease: false }]];
  const result = await run(["plan", "--gh", f.gh, "--omp", join(f.dir, "omp"), "--upstreams", f.cache, "--remote", f.remote, "matt"], f.root, { RELEASES: JSON.stringify(releases), OMP_WORKTREE_DIR: f.wtBase, FAKE_OMP_CLONE: "1", FAKE_OMP_LOG: join(f.dir, "omp-calls.jsonl") });
  expect(result.code).toBe(0); expect(JSON.parse(result.out).upstreams[0].new).toBe("v1.2.0");
  expect(f.calls().map(c => c[1])).toEqual(["pr", "api"]);
}, 30000);
test("a confirmed Disposition change removing a shipped name uses a major bump", async () => {
  const f = lifecycleFixture(); dirs.push(f.dir);
  const { plan, decisions, file, planFile } = await f.planned();
  Object.assign(decisions.find((d: any) => d.id === "matt/grow"), { disposition: "reject", reason: "No longer needed." });
  writeFileSync(file, JSON.stringify({ decisions }));
  const applied = await run(["apply", "--plan", planFile, "--decisions", file], f.root);
  expect(applied.code).toBe(0); expect(JSON.parse(applied.out).version).toBe("1.0.0");
  expect(git(plan.worktree.path, "status", "--short")).toContain("D plugin/skills/grow/SKILL.md");
}, 30000);
test("a narrowed Update can gate with a fresh cache for the unselected Pins", async () => {
  const f = lifecycleFixture(); dirs.push(f.dir);
  const { plan, file, planFile } = await f.planned(["matt"]);
  const args = ["--plan", planFile];
  expect((await run(["prepare", ...args, "--decisions", file], f.root)).code).toBe(0);
  const server = Bun.serve({ port: 0, fetch() { return Response.json({ answers: { expected: { type: "noul", noul: .9 }, other: { type: "noul", noul: .1 } } }); } });
  try {
    const result = await run(["gates", ...args, "--phase", "preview", "--upstreams", f.cache, "--remote", f.remote, "--smoke", f.smoke, "--endpoint", `http://localhost:${server.port}/v1/systemone`], f.root, { TYPESAFE_API_KEY: "fixture" });
    expect({ code: result.code, err: result.err }).toEqual({ code: 0, err: "" });
  } finally { server.stop(true); }
}, 30000);
test("a held adapt row never blocks its Upstream and keeps effectiveOld", async () => {
  const f = makeUpdateFixture(); dirs.push(f.dir);
  const root = f.checkout();
  const planned = await f.run(root, ["matt"], { FAKE_OMP_CLONE: "1" });
  expect(planned.code).toBe(0);
  const plan = planned.plan;
  const file = join(plan.out, "decisions.json");
  const decisions = plan.rows.filter((r: any) => r.class !== "unchanged").map((r: any) => ({
    id: r.id, action: ["adapt", "merge"].includes(r.disposition) || ["moved", "removed"].includes(r.class) ? "hold" : "accept", reason_check: "Still valid.",
  }));
  const fresh = plan.new[0];
  decisions.push({ id: "matt/fresh", upstream: fresh.upstream, path: fresh.path, action: "defer", gist: "Needs review.", reason_check: "New item." } as any);
  writeFileSync(file, JSON.stringify({ decisions }));
  const held = await run(["apply", "--plan", join(plan.out, "plan.json"), "--decisions", file], root);
  expect(held.code).toBe(0);
  const reg = Bun.YAML.parse(readFileSync(join(plan.worktree.path, "decision-register.yaml"), "utf8")) as any;
  expect(reg.items.find((r: any) => r.id === "matt/wording")).toMatchObject({ held_at: "v1.1.0", held_path: "skills/eng/wording" });
  expect(reg.items.find((r: any) => r.id === "matt/held").held_at).toBeUndefined();
  expect(reg.items.find((r: any) => r.id === "matt/gone").path).toBeUndefined();
  expect(reg.items.find((r: any) => r.id === "matt/old-name")).toMatchObject({ path: "skills/eng/new-name", held_path: "skills/eng/old-name" });
  expect(reg.items.find((r: any) => r.id === "matt/fresh").reason).toBe("Deferred at v1.2.0: Needs review.");
  expect((Bun.YAML.parse(readFileSync(join(plan.worktree.path, "pins.yaml"), "utf8")) as any).upstreams.matt.pin).toBe("v1.2.0");
  expect(JSON.parse(readFileSync(join(plan.worktree.path, "plugin/package.json"), "utf8")).version).toBe("0.2.0");
  // The CLI reports the baseline the next plan must use for the held contribution.
  const row = JSON.parse(held.out).rows.find((r: any) => r.id === "matt/wording");
  expect(row.effectiveOld).toEqual({ ref: "v1.1.0", path: "skills/eng/wording" });
}, 30000);
test("adapt merges carry a hand edit through normalized Upstream changes", async () => {
  const f = lifecycleFixture(); dirs.push(f.dir);
  const artifact = "plugin/skills/wording";
  const old = git(f.mattRepo, "show", "v1.1.0:skills/eng/wording/SKILL.md") + "\n";
  const local = old.replace("description: wording", "description: Local hand edit").replaceAll("CONTEXT.md", "GLOSSARY.md").replace("Open a todolist", "Start the `todo` list");
  writeFileSync(join(f.root, artifact, "SKILL.md"), local);
  git(f.root, "add", "-A"); git(f.root, "commit", "-qm", "hand edit");
  const { plan, decisions, file, planFile } = await f.planned();
  const merged = await run(["merge", "--plan", planFile], f.root);
  expect({ code: merged.code, err: merged.err }).toEqual({ code: 0, err: "" });
  const step = JSON.parse(merged.out).steps.find((s: any) => s.id === "matt/wording");
  expect(step.conflicts).toEqual([]);
  const proposed = readFileSync(join(step.drafts[artifact], "SKILL.md"), "utf8");
  expect(proposed).toContain("description: Local hand edit");
  expect(proposed).toContain("Then update GLOSSARY.md.");
  expect(proposed).not.toContain("CONTEXT.md");
  Object.assign(decisions.find((d: any) => d.id === step.id), { action: "accept" });
  writeFileSync(file, JSON.stringify({ decisions }));
  const applied = await run(["apply", "--plan", planFile, "--decisions", file], f.root);
  expect({ code: applied.code, err: applied.err }).toEqual({ code: 0, err: "" });
  expect(readFileSync(join(plan.worktree.path, artifact, "SKILL.md"), "utf8")).toBe(proposed);
}, 30000);
test("conflicting adapt changes reach the report and cannot be silently applied", async () => {
  const f = lifecycleFixture(); dirs.push(f.dir);
  const local = git(f.mattRepo, "show", "v1.1.0:skills/eng/wording/SKILL.md").replace("Read CONTEXT.md first. Open a todolist now. Ask poteto. Keep .git/old-root.", "Read the local handbook instead.") + "\n";
  writeFileSync(join(f.root, "plugin/skills/wording/SKILL.md"), local);
  git(f.root, "add", "-A"); git(f.root, "commit", "-qm", "conflicting hand edit");
  const { plan, decisions, file, planFile } = await f.planned();
  const result = await run(["merge", "--plan", planFile], f.root);
  expect(result.code).toBe(0);
  const step = JSON.parse(result.out).steps.find((s: any) => s.id === "matt/wording");
  expect(step.conflicts).toContain("plugin/skills/wording/SKILL.md");
  expect(readFileSync(join(step.drafts["plugin/skills/wording"], "SKILL.md"), "utf8")).toContain("<<<<<<< vstack");
  const reportFile = join(f.dir, "conflict-report.html");
  expect((await run(["report", "--plan", planFile, "--decisions", file, "--report", reportFile], f.root)).code).toBe(0);
  expect(readFileSync(reportFile, "utf8")).toContain("Merge conflicts: plugin/skills/wording/SKILL.md");
  decisions.find((d: any) => d.id === step.id).action = "accept";
  writeFileSync(file, JSON.stringify({ decisions }));
  const pins = readFileSync(join(plan.worktree.path, "pins.yaml"), "utf8");
  const blocked = await run(["apply", "--plan", planFile, "--decisions", file], f.root);
  expect(blocked.code).toBe(2); expect(blocked.err).toContain("unresolved merge conflict");
  expect(readFileSync(join(plan.worktree.path, "pins.yaml"), "utf8")).toBe(pins);
  Object.assign(decisions.find((d: any) => d.id === step.id), { drafts: step.drafts });
  writeFileSync(join(step.drafts["plugin/skills/wording"], "SKILL.md"), local + "Then update GLOSSARY.md.\n");
  writeFileSync(file, JSON.stringify({ decisions }));
  expect((await run(["apply", "--plan", planFile, "--decisions", file], f.root)).code).toBe(0);
}, 30000);
test("removed rows can become originals and renamed adopts can follow the new name", async () => {
  const f = lifecycleFixture(); dirs.push(f.dir);
  const { plan, decisions, file, planFile } = await f.planned();
  Object.assign(decisions.find((d: any) => d.id === "matt/gone"), { action: "accept", removal: "original" });
  Object.assign(decisions.find((d: any) => d.id === "matt/old-name"), { action: "accept", rename: "follow" });
  writeFileSync(file, JSON.stringify({ decisions }));
  const result = await run(["apply", "--plan", planFile, "--decisions", file], f.root);
  expect({ code: result.code, err: result.err }).toEqual({ code: 0, err: "" });
  const reg = Bun.YAML.parse(readFileSync(join(plan.worktree.path, "decision-register.yaml"), "utf8")) as any;
  expect(reg.items.some((r: any) => r.id === "matt/gone")).toBe(false);
  expect(reg.originals).toContain("plugin/skills/gone");
  expect(reg.items.find((r: any) => r.id === "matt/old-name")).toMatchObject({ disposition: "adopt", path: "skills/eng/new-name", artifacts: ["plugin/skills/new-name"] });
  expect(readFileSync(join(plan.worktree.path, "plugin/skills/new-name/SKILL.md"), "utf8")).toContain("moved without edits");
  expect(JSON.parse(result.out).version).toBe("1.0.0");
}, 30000);

test("a shared merge accepts a held catch-up while leaving the other row on Hold", async () => {
  const f = lifecycleFixture(); dirs.push(f.dir);
  const pb = "pstack/skills/poteto-mode/playbooks/tdd.md";
  writeFileSync(join(f.pstackRepo, pb), "# TDD\nCatch up the Playbook.\n");
  git(f.pstackRepo, "add", "-A"); git(f.pstackRepo, "commit", "-qm", "changed tdd");
  const artifact = "plugin/skills/tdd";
  const baseline = git(f.mattRepo, "show", "v1.1.0:skills/eng/tdd/SKILL.md") + "\n" + Array.from({length: 12}, (_, i) => `Local section ${i}\n`).join("") + "# TDD\n";
  writeFileSync(join(f.root, artifact, "SKILL.md"), baseline);
  const reg = Bun.YAML.parse(readFileSync(join(f.root, "decision-register.yaml"), "utf8")) as any;
  Object.assign(reg.items.find((r: any) => r.id === "pstack/playbook-tdd"), { held_at: f.pstack.c1, held_path: pb });
  writeFileSync(join(f.root, "decision-register.yaml"), Bun.YAML.stringify(reg, null, 2));
  git(f.root, "add", "-A"); git(f.root, "commit", "-qm", "shared baseline");
  const { plan, decisions, file, planFile } = await f.planned();
  const merged = await run(["merge", "--plan", planFile], f.root);
  expect(merged.code).toBe(0);
  const mattStep = JSON.parse(merged.out).steps.find((s: any) => s.id === "matt/tdd");
  decisions.find((d: any) => d.id === "pstack/playbook-tdd").action = "accept";
  writeFileSync(file, JSON.stringify({ decisions }));
  const applied = await run(["apply", "--plan", planFile, "--decisions", file], f.root);
  expect({ code: applied.code, err: applied.err }).toEqual({ code: 0, err: "" });
  const text = readFileSync(join(plan.worktree.path, artifact, "SKILL.md"), "utf8");
  expect(text).toContain("tdd 1"); expect(text).not.toContain("tdd 2"); expect(text).toContain("Catch up the Playbook.");
  const updated = Bun.YAML.parse(readFileSync(join(plan.worktree.path, "decision-register.yaml"), "utf8")) as any;
  expect(updated.items.find((r: any) => r.id === "pstack/playbook-tdd").held_at).toBeUndefined();
  expect(updated.items.find((r: any) => r.id === "pstack/playbook-tdd").held_path).toBeUndefined();
  expect(updated.items.find((r: any) => r.id === "matt/tdd")).toMatchObject({ held_at: "v1.1.0", held_path: "skills/eng/tdd" });
  // Reapplication cannot accidentally replay the previously accepted catch-up.
  decisions.find((d: any) => d.id === "pstack/playbook-tdd").action = "hold";
  decisions.find((d: any) => d.id === "matt/tdd").action = "accept";
  writeFileSync(join(mattStep.drafts[artifact], "SKILL.md"), baseline.replace("tdd 1", "tdd 2"));
  Object.assign(decisions.find((d: any) => d.id === "matt/tdd"), { drafts: mattStep.drafts });
  writeFileSync(file, JSON.stringify({ decisions }));
  expect((await run(["apply", "--plan", planFile, "--decisions", file], f.root)).code).toBe(0);
  const rebuilt = readFileSync(join(plan.worktree.path, artifact, "SKILL.md"), "utf8");
  expect(rebuilt).toContain("tdd 2"); expect(rebuilt).not.toContain("Catch up the Playbook.");
}, 30000);
test("removed shared rows remove only their contribution or keep it as vstack text", async () => {
  for (const removal of ["remove-contribution", "keep-contribution"] as const) {
    const f = lifecycleFixture(); dirs.push(f.dir);
    const pb = "pstack/skills/poteto-mode/playbooks/forensics-b.md";
    rmSync(join(f.pstackRepo, pb)); git(f.pstackRepo, "add", "-A"); git(f.pstackRepo, "commit", "-qm", "removed shared item");
    const artifact = "plugin/skills/forensics";
    const baseline = "---\nname: forensics\ndescription: Fixture\n---\nLocal hand edit.\n# Forensics A\n# Forensics B\n";
    writeFileSync(join(f.root, artifact, "SKILL.md"), baseline);
    git(f.root, "add", "-A"); git(f.root, "commit", "-qm", "shared artifact");
    const { plan, decisions, file, planFile } = await f.planned();
    const d = decisions.find((d: any) => d.id === "pstack/playbook-forensics-b");
    Object.assign(d, { action: "accept", removal: "original" });
    writeFileSync(file, JSON.stringify({ decisions }));
    expect((await run(["apply", "--plan", planFile, "--decisions", file], f.root)).err).toContain("shared artifact cannot become original");
    Object.assign(d, { removal });
    if (removal === "remove-contribution") {
      const merged = await run(["merge", "--plan", planFile], f.root);
      const step = JSON.parse(merged.out).steps.find((s: any) => s.id === d.id);
      writeFileSync(join(step.drafts[artifact], "SKILL.md"), baseline.replace("# Forensics B\n", ""));
      Object.assign(d, { drafts: step.drafts });
    }
    writeFileSync(file, JSON.stringify({ decisions }));
    const result = await run(["apply", "--plan", planFile, "--decisions", file], f.root);
    expect({ code: result.code, err: result.err }).toEqual({ code: 0, err: "" });
    const text = readFileSync(join(plan.worktree.path, artifact, "SKILL.md"), "utf8");
    expect(text).toContain("Local hand edit."); expect(text).toContain("# Forensics A");
    expect(text.includes("# Forensics B")).toBe(removal === "keep-contribution");
    const reg = Bun.YAML.parse(readFileSync(join(plan.worktree.path, "decision-register.yaml"), "utf8")) as any;
    expect(reg.items.some((r: any) => r.id === d.id)).toBe(false);
    expect(reg.items.find((r: any) => r.id === "pstack/playbook-forensics-a").artifacts).toContain(artifact);
    expect(JSON.parse(result.out).version).toBe("0.2.0");
  }
}, 30000);

test("removed unshared names bump major and keeping a renamed adopt turns it adapt", async () => {
  const f = lifecycleFixture(); dirs.push(f.dir);
  const { plan, decisions, file, planFile } = await f.planned();
  Object.assign(decisions.find((d: any) => d.id === "matt/gone"), { action: "accept", removal: "drop" });
  Object.assign(decisions.find((d: any) => d.id === "matt/old-name"), { action: "accept", rename: "keep", reason: "Keep the vstack name." });
  writeFileSync(file, JSON.stringify({ decisions }));
  const result = await run(["apply", "--plan", planFile, "--decisions", file], f.root);
  expect({ code: result.code, err: result.err }).toEqual({ code: 0, err: "" });
  const reg = Bun.YAML.parse(readFileSync(join(plan.worktree.path, "decision-register.yaml"), "utf8")) as any;
  expect(reg.items.some((r: any) => r.id === "matt/gone")).toBe(false);
  expect(reg.items.find((r: any) => r.id === "matt/old-name")).toMatchObject({ disposition: "adapt", artifacts: ["plugin/skills/old-name"] });
  expect(JSON.parse(result.out).version).toBe("1.0.0");
  const style = Bun.YAML.parse(readFileSync(join(plan.worktree.path, "house-style.yaml"), "utf8")) as any;
  expect(style.replacements).toContainEqual({ id: "rename-matt-old-name", from: "new-name", to: "old-name", match: "name", upstream: "matt", scope: "required", uses: ["update"] });
}, 30000);

test("ADR and Fan-out findings Hold by default and require explicit acceptance", async () => {
  const f = lifecycleFixture(); dirs.push(f.dir);
  const { plan, decisions, file, planFile } = await f.planned();
  const d = decisions.find((d: any) => d.id === "matt/grow");
  Object.assign(d, { adr_conflicts: ["ADR 0004: multi-model routing"], review_findings: ["Caller overlaps a background subagent."] });
  writeFileSync(file, JSON.stringify({ decisions }));
  expect((await run(["apply", "--plan", planFile, "--decisions", file], f.root)).err).toContain("findings require explicit acceptance");
  d.action = "hold"; writeFileSync(file, JSON.stringify({ decisions }));
  expect((await run(["apply", "--plan", planFile, "--decisions", file], f.root)).code).toBe(0);
  const reportFile = join(f.dir, "held-findings.html");
  expect((await run(["report", "--plan", planFile, "--decisions", file, "--report", reportFile], f.root)).code).toBe(0);
  expect(readFileSync(reportFile, "utf8")).toContain("Held-back findings: ADR 0004: multi-model routing; Caller overlaps a background subagent.");
  Object.assign(d, { action: "accept", explicit_accept: true }); writeFileSync(file, JSON.stringify({ decisions }));
  expect((await run(["apply", "--plan", planFile, "--decisions", file], f.root)).code).toBe(0);
}, 30000);
test("a held adapt catches up from held_at even when its Upstream did not change at the latest Pin", async () => {
  const f = lifecycleFixture(); dirs.push(f.dir);
  const reg = Bun.YAML.parse(readFileSync(join(f.root, "decision-register.yaml"), "utf8")) as any;
  reg.items.find((r: any) => r.id === "matt/held").disposition = "adapt";
  writeFileSync(join(f.root, "decision-register.yaml"), Bun.YAML.stringify(reg, null, 2));
  const artifact = "plugin/skills/held";
  writeFileSync(join(f.root, artifact, "SKILL.md"), readFileSync(join(f.root, artifact, "SKILL.md"), "utf8").replace("description: held", "description: Local hand edit"));
  git(f.root, "add", "-A"); git(f.root, "commit", "-qm", "held adaptation");
  const { plan, decisions, file, planFile } = await f.planned();
  const result = await run(["merge", "--plan", planFile], f.root);
  const step = JSON.parse(result.out).steps.find((s: any) => s.id === "matt/held");
  expect(step.effectiveOld).toMatchObject({ ref: "v1.0.0", path: "skills/eng/held" });
  expect(step.conflicts).toEqual([]);
  decisions.find((d: any) => d.id === "matt/held").action = "accept";
  writeFileSync(file, JSON.stringify({ decisions }));
  const applied = await run(["apply", "--plan", planFile, "--decisions", file], f.root);
  expect({ code: applied.code, err: applied.err }).toEqual({ code: 0, err: "" });
  const text = readFileSync(join(plan.worktree.path, artifact, "SKILL.md"), "utf8");
  expect(text).toContain("Local hand edit"); expect(text).toContain("held 1.1");
  const updated = Bun.YAML.parse(readFileSync(join(plan.worktree.path, "decision-register.yaml"), "utf8")) as any;
  expect(updated.items.find((r: any) => r.id === "matt/held").held_at).toBeUndefined();
  expect(updated.items.find((r: any) => r.id === "matt/held").held_path).toBeUndefined();
}, 30000);

test("draft ADRs appear in the report and enter the checkout only for accepted rows", async () => {
  const f = lifecycleFixture(); dirs.push(f.dir);
  const { plan, decisions, file, planFile } = await f.planned();
  const source = join(plan.out, "draft-adr.md"), path = "docs/adr/0013-fixture-trade-off.md";
  writeFileSync(source, "# Fixture trade-off\n\nKeep the parent model instead of upstream multi-model routing.\n");
  const d = decisions.find((d: any) => d.id === "matt/grow");
  Object.assign(d, { action: "hold", draft_adr: { path, source }, adr_conflicts: ["ADR 0004 conflicts with proposed routing."] });
  writeFileSync(file, JSON.stringify({ decisions }));
  expect((await run(["prepare", "--plan", planFile, "--decisions", file], f.root)).code).toBe(0);
  expect(await Bun.file(join(plan.worktree.path, path)).exists()).toBe(false);
  const reportFile = join(f.dir, "adr-report.html");
  expect((await run(["report", "--plan", planFile, "--decisions", file, "--report", reportFile], f.root)).code).toBe(0);
  expect(readFileSync(reportFile, "utf8")).toContain("Keep the parent model instead of upstream multi-model routing.");
  Object.assign(d, { action: "accept", explicit_accept: true }); writeFileSync(file, JSON.stringify({ decisions }));
  expect((await run(["apply", "--plan", planFile, "--decisions", file], f.root)).code).toBe(0);
  expect(readFileSync(join(plan.worktree.path, path), "utf8")).toBe(readFileSync(source, "utf8"));
}, 30000);

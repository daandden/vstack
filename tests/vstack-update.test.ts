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
});
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
});
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
});
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
});
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
});
test("default tag discovery ignores draft and prerelease GitHub releases", async () => {
  const f = lifecycleFixture(); dirs.push(f.dir);
  const releases = [[{ tag_name: "v99.0.0", draft: true }, { tag_name: "v100.0.0", prerelease: true }, { tag_name: "mattpocock-skills@7.0.0" }, { tag_name: "v1.2.0", draft: false, prerelease: false }]];
  const result = await run(["plan", "--gh", f.gh, "--omp", join(f.dir, "omp"), "--upstreams", f.cache, "--remote", f.remote, "matt"], f.root, { RELEASES: JSON.stringify(releases), OMP_WORKTREE_DIR: f.wtBase, FAKE_OMP_CLONE: "1", FAKE_OMP_LOG: join(f.dir, "omp-calls.jsonl") });
  expect(result.code).toBe(0); expect(JSON.parse(result.out).upstreams[0].new).toBe("v1.2.0");
  expect(f.calls().map(c => c[1])).toEqual(["pr", "api"]);
});
test("a confirmed Disposition change removing a shipped name uses a major bump", async () => {
  const f = lifecycleFixture(); dirs.push(f.dir);
  const { plan, decisions, file, planFile } = await f.planned();
  Object.assign(decisions.find((d: any) => d.id === "matt/grow"), { disposition: "reject", reason: "No longer needed." });
  writeFileSync(file, JSON.stringify({ decisions }));
  const applied = await run(["apply", "--plan", planFile, "--decisions", file], f.root);
  expect(applied.code).toBe(0); expect(JSON.parse(applied.out).version).toBe("1.0.0");
  expect(git(plan.worktree.path, "status", "--short")).toContain("D plugin/skills/grow/SKILL.md");
});
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
});
test("a changed adapt row blocks the Pin move unless held, then keeps effectiveOld", async () => {
  const f = makeUpdateFixture(); dirs.push(f.dir);
  const root = f.checkout();
  const planned = await f.run(root, ["matt"], { FAKE_OMP_CLONE: "1" });
  expect(planned.code).toBe(0);
  const plan = planned.plan;
  const file = join(plan.out, "decisions.json");
  const decisions = plan.rows.filter((r: any) => r.class !== "unchanged").map((r: any) => ({
    id: r.id, action: ["adapt", "merge"].includes(r.disposition) || ["moved", "removed"].includes(r.class) ? "hold" : "accept", reason_check: "Still valid.",
  }));
  decisions.find((d: any) => d.id === "matt/wording").action = "accept";
  const fresh = plan.new[0];
  decisions.push({ id: "matt/fresh", upstream: fresh.upstream, path: fresh.path, action: "defer", gist: "Needs review.", reason_check: "New item." } as any);
  writeFileSync(file, JSON.stringify({ decisions }));
  const pins = readFileSync(join(plan.worktree.path, "pins.yaml"), "utf8");
  const blocked = await run(["apply", "--plan", join(plan.out, "plan.json"), "--decisions", file], root);
  expect(blocked.code).toBe(2); expect(blocked.err).toContain("matt/wording");
  expect(readFileSync(join(plan.worktree.path, "pins.yaml"), "utf8")).toBe(pins);
  decisions.find((d: any) => d.id === "matt/wording").action = "hold";
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
});

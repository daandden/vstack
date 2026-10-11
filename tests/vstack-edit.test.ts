import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ENV, git, writeFiles } from "./support/fixture.ts";
import { lifecycleFixture } from "./support/update-lifecycle-fixture.ts";

const script = join(import.meta.dir, "../scripts/vstack-edit.ts");
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

type Fixture = ReturnType<typeof lifecycleFixture>;
function fixture() { const f = lifecycleFixture(); dirs.push(f.dir); return f; }
async function edit(f: Fixture, args: string[], env: Record<string, string> = {}) {
  const p = Bun.spawn([process.execPath, script, ...args, "--root", f.root, "--gh", f.gh, "--omp", join(f.dir, "omp")], {
    cwd: f.root,
    env: { ...ENV, OMP_WORKTREE_DIR: f.wtBase, FAKE_OMP_LOG: join(f.dir, "omp-calls.jsonl"), FAKE_OMP_CLONE: "1", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  let json: any;
  try { json = JSON.parse(out); } catch { json = undefined; }
  return { code, out, err, json };
}
/** A refusal: exit 2 and a JSON reason on stdout. */
function refused(r: Awaited<ReturnType<typeof edit>>, reason: string) {
  expect({ code: r.code, ok: r.json?.ok }).toEqual({ code: 2, ok: false });
  expect(r.json.reason).toContain(reason);
}

/** A run made by preflight, after `files` are committed on main. */
async function started(f: Fixture, files: Record<string, string> = {}) {
  if (Object.keys(files).length) { writeFiles(f.root, files); git(f.root, "add", "-A"); git(f.root, "commit", "-qm", "fixture callers"); }
  const r = await edit(f, ["preflight", "--name", "tidy-wording"]);
  if (r.code !== 0) throw new Error(r.out + r.err);
  return { file: r.json.run as string, wt: r.json.worktree.path as string };
}
test("preflight refuses an Update branch and an open Update PR, and otherwise makes the edit worktree from main", async () => {
  const f = fixture();
  git(f.root, "branch", "update/existing");
  refused(await edit(f, ["preflight", "--name", "tidy-wording"]), "update/existing");
  git(f.root, "branch", "-D", "update/existing");
  refused(await edit(f, ["preflight", "--name", "tidy-wording"], { OPEN_PR: JSON.stringify([{ headRefName: "update/open", url: "https://example.invalid/pr/1" }]) }), "https://example.invalid/pr/1");
  refused(await edit(f, ["preflight", "--name", "Tidy Wording"]), "name");
  expect(f.ompCalls()).toEqual([]);

  const r = await edit(f, ["preflight", "--name", "tidy-wording"]);
  expect({ code: r.code, err: r.err }).toEqual({ code: 0, err: "" });
  expect(r.json.branch).toBe("edit/tidy-wording");
  expect(git(r.json.worktree.path, "branch", "--show-current")).toBe("edit/tidy-wording");
  expect(git(r.json.worktree.path, "rev-parse", "HEAD")).toBe(git(f.root, "rev-parse", "main"));
  expect(JSON.parse(readFileSync(r.json.run, "utf8")).worktree.path).toBe(r.json.worktree.path);
  expect(git(f.root, "branch", "--show-current")).toBe("main");
}, 30000);

test("check prints the register row, Disposition, and callers from both reference forms at the current Pin, with no fetch", async () => {
  const f = fixture();
  const run = await started(f, {
    "plugin/skills/tdd/SKILL.md": "---\nname: tdd\ndescription: Fixture skill\n---\nRead skill://wording/refs/glossary.md first.\n",
    "plugin/skills/drift/SKILL.md": "---\nname: drift\ndescription: Fixture skill\n---\nRun `/skill:wording-extra` and read skill://wordings.\n",
  });
  const calls = f.calls().length;
  const r = await edit(f, ["check", "--run", run.file, "plugin/skills/wording", "plugin/skills/ask-vstack"]);
  expect({ code: r.code, err: r.err }).toEqual({ code: 0, err: "" });
  const [wording, router] = r.json.targets;
  expect(wording).toMatchObject({ artifact: "plugin/skills/wording", kind: "skill", dispositions: ["adapt"] });
  expect(wording.rows).toEqual([expect.objectContaining({ id: "matt/wording", upstream: "matt", pin: "v1.1.0", path: "skills/eng/wording", disposition: "adapt" })]);
  expect(wording.callers).toEqual(["plugin/skills/ask-vstack/SKILL.md", "plugin/skills/tdd/SKILL.md"]);
  expect(router).toMatchObject({ artifact: "plugin/skills/ask-vstack", dispositions: ["original"], rows: [] });
  expect(existsSync(f.cache)).toBe(false);
  expect(f.calls().slice(calls)).toEqual([]);
}, 30000);

test("check reports an adopt target as adopt and refuses an unregistered artifact that main already has", async () => {
  const f = fixture();
  const run = await started(f, { "plugin/skills/stray/SKILL.md": "---\nname: stray\ndescription: Fixture skill\n---\nStray.\n" });
  const r = await edit(f, ["check", "--run", run.file, "plugin/skills/keep"]);
  expect({ code: r.code, err: r.err }).toEqual({ code: 0, err: "" });
  expect(r.json.targets[0]).toMatchObject({ artifact: "plugin/skills/keep", action: "edit", dispositions: ["adopt"] });
  refused(await edit(f, ["check", "--run", run.file, "plugin/skills/stray"]), "plugin/skills/stray");
}, 30000);

test("check reports a new name, and refuses one that clashes with an Upstream item at the current Pin, with no fetch of a newer ref, offering to take a rejected item in its place", async () => {
  const f = fixture();
  const run = await started(f);
  const check = (...artifacts: string[]) => edit(f, ["check", "--run", run.file, "--upstreams", f.cache, "--remote", f.remote, ...artifacts]);
  // fresh is a matt item only at v1.2.0, after the v1.1.0 Pin.
  const fresh = await check("plugin/skills/fresh", "plugin/agents/tidier.md");
  expect({ code: fresh.code, err: fresh.err }).toEqual({ code: 0, err: "" });
  expect(fresh.json.targets).toEqual([
    expect.objectContaining({ artifact: "plugin/skills/fresh", kind: "skill", action: "add", dispositions: [], rows: [], clashes: [] }),
    expect.objectContaining({ artifact: "plugin/agents/tidier.md", kind: "agent", action: "add", clashes: [] }),
  ]);

  writeFiles(f.mattRepo, { "skills/eng/late/SKILL.md": "---\nname: late\ndescription: late\n---\nlate\n" });
  git(f.mattRepo, "add", "-A"); git(f.mattRepo, "commit", "-qm", "v1.4.0"); git(f.mattRepo, "tag", "-a", "v1.4.0", "-m", "v1.4.0");
  expect((await check("plugin/skills/late")).code).toBe(0);
  expect(git(join(f.cache, "matt"), "tag", "--list", "v1.4.0")).toBe("");

  const clash = await check("plugin/skills/rej", "plugin/agents/unslop.md", "plugin/skills/fresh");
  refused(clash, "plugin/skills/rej clashes with matt skills/misc/rej at v1.1.0");
  expect(clash.json.reason).toContain(`plugin/agents/unslop.md clashes with pstack pstack/skills/unslop at ${f.pstack.c1}`);
  expect(clash.json.reason).not.toContain("plugin/skills/fresh");
  // The stop offers to take the rejected rej in place of the new skill. unslop is adopt and ships, so it has no take.
  expect(clash.json.reason).toContain("take the Upstream item in its place with check --take matt:skills/misc/rej");
  expect(clash.json.clashes).toEqual([
    { artifact: "plugin/skills/rej", upstream: "matt", path: "skills/misc/rej", pin: "v1.1.0", take: "matt:skills/misc/rej" },
    { artifact: "plugin/agents/unslop.md", upstream: "pstack", path: "pstack/skills/unslop", pin: f.pstack.c1, take: null },
  ]);
  const taken = await edit(f, ["check", "--run", run.file, "--upstreams", f.cache, "--remote", f.remote, "--take", clash.json.clashes[0].take]);
  expect({ code: taken.code, target: taken.json?.targets?.[0]?.artifact }).toEqual({ code: 0, target: "plugin/skills/rej" });
}, 30000);

test("check on a cold cache fetches only the Pins and held refs: no newer tag, branch, or commit, and blobs still load at the Pin", async () => {
  const f = fixture();
  const run = await started(f);
  expect(existsSync(f.cache)).toBe(false);
  const r = await edit(f, ["check", "--run", run.file, "--upstreams", f.cache, "--remote", f.remote, "plugin/skills/tidy"]);
  expect({ code: r.code, reason: r.json?.reason }).toEqual({ code: 0, reason: undefined });
  // A partial clone fetches a missing object on demand; GIT_NO_LAZY_FETCH makes this probe report it missing instead.
  const has = (clone: string, object: string) => Bun.spawnSync(["git", "-C", clone, "cat-file", "-e", `${object}^{commit}`], { env: { ...process.env, GIT_NO_LAZY_FETCH: "1" } }).exitCode === 0;
  const refs = (clone: string) => git(clone, "for-each-ref", "--format=%(refname)").split("\n").filter(Boolean).sort();
  const matt = join(f.cache, "matt"), pstack = join(f.cache, "pstack");
  // matt/held is held at v1.0.0, so check-register reads it there; v1.1.0 is the Pin.
  expect(refs(matt)).toEqual(["refs/tags/v1.0.0", "refs/tags/v1.1.0"]);
  expect(has(matt, git(f.mattRepo, "rev-parse", "v1.2.0^{commit}"))).toBe(false);
  expect(has(matt, git(f.mattRepo, "rev-parse", "main"))).toBe(false);
  expect(refs(pstack).length).toBe(1);
  expect(has(pstack, f.pstack.c1)).toBe(true);
  expect(has(pstack, f.pstack.c2)).toBe(false);
  expect(git(matt, "cat-file", "blob", "v1.1.0:skills/eng/keep/SKILL.md")).toContain("name: keep");
}, 30000);

const WORDING = "---\nname: wording\ndescription: Fixture skill\n---\nRead GLOSSARY.md before you write.\n";
function decide(f: Fixture, targets: object[], changelog = ["wording reads GLOSSARY.md before it writes."]) {
  const file = join(f.dir, `decisions-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, JSON.stringify({ targets, changelog, commit: "fix(wording): read GLOSSARY.md first" }));
  return file;
}
const editWording = { action: "edit", kind: "skill", artifact: "plugin/skills/wording" };

test("prepare raises the patch version and moves the Unreleased lines with the new entry under the new version", async () => {
  const f = fixture();
  const run = await started(f, { "CHANGELOG.md": "# Changelog\n\n## [Unreleased]\n\n- An earlier line.\n\n## [0.1.0] - 2026-01-01\n\n- First.\n" });
  writeFiles(run.wt, { "plugin/skills/wording/SKILL.md": WORDING });
  const decisions = decide(f, [editWording]);
  for (let i = 0; i < 2; i++) {
    const r = await edit(f, ["prepare", "--run", run.file, "--decisions", decisions]);
    expect({ code: r.code, out: r.json.version }).toEqual({ code: 0, out: "0.1.1" });
  }
  expect(JSON.parse(readFileSync(join(run.wt, "plugin/package.json"), "utf8")).version).toBe("0.1.1");
  const changelog = readFileSync(join(run.wt, "CHANGELOG.md"), "utf8");
  expect(changelog).toMatch(/^# Changelog\n\n## \[Unreleased\]\n\n## \[0\.1\.1\] - \d{4}-\d{2}-\d{2}\n\n- An earlier line\.\n- wording reads GLOSSARY\.md before it writes\.\n\n## \[0\.1\.0\] - 2026-01-01\n\n- First\.\n$/);
}, 30000);

test("prepare refuses other actions, unchanged targets, and changes outside the targets", async () => {
  const f = fixture();
  const run = await started(f);
  refused(await edit(f, ["prepare", "--run", run.file, "--decisions", decide(f, [editWording])]), "plugin/skills/wording has no change");
  writeFiles(run.wt, { "plugin/skills/wording/SKILL.md": WORDING });
  refused(await edit(f, ["prepare", "--run", run.file, "--decisions", decide(f, [{ ...editWording, action: "rename" }])]), "rename");
  writeFiles(run.wt, { "plugin/skills/drift/SKILL.md": "---\nname: drift\ndescription: Fixture skill\n---\nChanged too.\n" });
  refused(await edit(f, ["prepare", "--run", run.file, "--decisions", decide(f, [editWording])]), "plugin/skills/drift");
}, 30000);

const KEEP = "---\nname: keep\ndescription: Fixture skill\n---\nkeep, with a local fix.\n";
const editKeep = { action: "edit", kind: "skill", artifact: "plugin/skills/keep" };
const register = (root: string) => Bun.YAML.parse(readFileSync(join(root, "decision-register.yaml"), "utf8")) as any;

test("prepare flips a confirmed adopt edit to adapt with its new reason, and check-register passes after the flip", async () => {
  const f = fixture();
  const run = await started(f);
  writeFiles(run.wt, { "plugin/skills/keep/SKILL.md": KEEP });
  const decisions = decide(f, [{ ...editKeep, flip: { confirmed: true, reason: "Fixes a wrong step before Upstream does." } }]);
  for (let i = 0; i < 2; i++) expect((await edit(f, ["prepare", "--run", run.file, "--decisions", decisions])).code).toBe(0);
  const before = register(f.root), after = register(run.wt);
  expect(after.items.find((row: any) => row.id === "matt/keep")).toEqual({ ...before.items.find((row: any) => row.id === "matt/keep"), disposition: "adapt", reason: "Fixes a wrong step before Upstream does." });
  expect(after.items.filter((row: any) => row.id !== "matt/keep")).toEqual(before.items.filter((row: any) => row.id !== "matt/keep"));
  expect(after.originals).toEqual(before.originals);
  const gates = await edit(f, ["gates", "--run", run.file, "--smoke", f.smoke, "--test", "true", "--upstreams", f.cache, "--remote", f.remote]);
  expect({ code: gates.code, reason: gates.json?.reason }).toEqual({ code: 0, reason: undefined });
}, 60000);

test("prepare refuses an adopt edit without the confirmation or a new reason, exits with code 2, and writes nothing", async () => {
  const f = fixture();
  const run = await started(f);
  writeFiles(run.wt, { "plugin/skills/keep/SKILL.md": KEEP, "plugin/skills/wording/SKILL.md": WORDING });
  for (const flip of [undefined, { reason: "Fixes a step." }, { confirmed: false, reason: "Fixes a step." }, { confirmed: true }, { confirmed: true, reason: " " }]) {
    refused(await edit(f, ["prepare", "--run", run.file, "--decisions", decide(f, [editWording, { ...editKeep, flip }])]), "plugin/skills/keep");
  }
  refused(await edit(f, ["prepare", "--run", run.file, "--decisions", decide(f, [{ ...editWording, flip: { confirmed: true, reason: "Not adopt." } }, { ...editKeep, flip: { confirmed: true, reason: "Fixes a step." } }])]), "plugin/skills/wording");
  expect(git(run.wt, "diff", "--name-only", "HEAD").split("\n").sort()).toEqual(["plugin/skills/keep/SKILL.md", "plugin/skills/wording/SKILL.md"]);
  expect(git(run.wt, "ls-files", "--others", "--exclude-standard")).toBe("");
  expect(existsSync(join(dirname(run.file), "decisions.json"))).toBe(false);
}, 30000);
/** The gates command line with its stand-ins for a run file. */
function gateArgs(f: Fixture, file: string) {
  const suite = join(f.dir, "suite");
  writeFileSync(suite, '#!/bin/sh\n[ -z "$FAIL_TESTS" ]\n'); chmodSync(suite, 0o755);
  return ["gates", "--run", file, "--smoke", f.smoke, "--test", suite, "--upstreams", f.cache, "--remote", f.remote];
}

/** A prepared run of the wording edit, and the gates command line with its stand-ins. */
async function prepared(f: Fixture) {
  const run = await started(f);
  writeFiles(run.wt, { "plugin/skills/wording/SKILL.md": WORDING });
  const r = await edit(f, ["prepare", "--run", run.file, "--decisions", decide(f, [editWording])]);
  if (r.code !== 0) throw new Error(r.out);
  return { ...run, gates: gateArgs(f, run.file) };
}

test("gates pass on a clean draft and fail when the load smoke fails or reports a missing skill", async () => {
  const f = fixture();
  const run = await prepared(f);
  const pass = await edit(f, run.gates);
  expect({ code: pass.code, out: pass.json?.ok }).toEqual({ code: 0, out: true });
  refused(await edit(f, run.gates, { FAIL_SMOKE: "1" }), "load smoke");
  refused(await edit(f, run.gates, { SMOKE_DROP: "wording" }), "load smoke missing skill plugin/skills/wording");
  refused(await edit(f, run.gates, { FAIL_TESTS: "1" }), "test suite");
}, 60000);

/** A Grilling page state file whose latest close record has `answer`. */
function grilling(f: Fixture, answer?: string) {
  const file = join(f.dir, `grilling-${Math.random().toString(36).slice(2)}.jsonl`);
  const close = (id: string, a?: string) => JSON.stringify({ type: "close", id, session: 1, decisions: [], ...(a ? { answer: a } : {}) });
  writeFileSync(file, [JSON.stringify({ type: "page", id: "page", title: "Edit wording" }), close("close-1", "Not yet"), close("close-2", answer)].join("\n") + "\n");
  return file;
}

test("finish refuses without passed gates and a confirmed closing gate, then makes one local commit and never pushes or opens a PR", async () => {
  const f = fixture();
  const origin = join(f.dir, "origin.git");
  git(f.dir, "init", "-q", "--bare", origin); git(f.root, "remote", "add", "origin", origin); git(f.root, "push", "-q", "origin", "main");
  const run = await prepared(f);
  const finish = (state?: string) => edit(f, ["finish", "--run", run.file, ...(state ? ["--grilling", state] : [])]);
  const confirmed = grilling(f, "Shared understanding");
  refused(await finish(confirmed), "gates");
  expect((await edit(f, run.gates)).code).toBe(0);
  expect((await edit(f, ["reviewed", "--run", run.file])).code).toBe(0);
  const calls = f.calls().length;
  refused(await finish(), "closing gate");
  refused(await finish(grilling(f)), "closing gate");
  refused(await finish(grilling(f, "Not yet")), "closing gate");
  // Re-appending an older close replaces it in place on the page; the newer close-2 stays the latest gate.
  const reopened = grilling(f, "Not yet");
  writeFileSync(reopened, readFileSync(reopened, "utf8") + JSON.stringify({ type: "close", id: "close-1", session: 1, decisions: [], answer: "Shared understanding" }) + "\n");
  refused(await finish(reopened), "closing gate");
  writeFiles(run.wt, { "plugin/skills/wording/SKILL.md": WORDING + "One more line.\n" });
  refused(await finish(confirmed), "gates");
  writeFiles(run.wt, { "plugin/skills/wording/SKILL.md": WORDING });

  const done = await finish(confirmed);
  expect({ code: done.code, branch: done.json?.branch }).toEqual({ code: 0, branch: "edit/tidy-wording" });
  expect(git(f.root, "rev-list", "--count", "main..edit/tidy-wording")).toBe("1");
  expect(git(run.wt, "log", "-1", "--format=%s")).toBe("fix(wording): read GLOSSARY.md first");
  expect(git(run.wt, "show", "--name-only", "--format=", "HEAD").split("\n").sort()).toEqual(["CHANGELOG.md", "plugin/package.json", "plugin/skills/wording/SKILL.md"]);
  expect(git(run.wt, "status", "--porcelain")).toBe("");
  expect(git(f.root, "ls-remote", "--heads", "origin")).not.toContain("edit/");
  expect(f.calls().slice(calls)).toEqual([]);
}, 60000);

const TIDY = "---\nname: tidy\ndescription: Fixture skill that tidies notes\n---\nTidy the notes.\n";
const TIDIER = "---\nname: tidier\ndescription: Fixture agent that tidies notes\n---\nYou tidy the notes your prompt names.\n";
const RULE = "---\nalwaysApply: true\n---\nKeep note paths short.\n";
const addTidy = { action: "add", kind: "skill", artifact: "plugin/skills/tidy" };
const addTidier = { action: "add", kind: "agent", artifact: "plugin/agents/tidier.md" };
const addRule = { action: "add", kind: "rule", artifact: "plugin/rules/tidy-paths.md" };

test("a new skill joins originals:, gets its ask-vstack route in the same run, and lands in one commit", async () => {
  const f = fixture();
  const run = await started(f);
  writeFiles(run.wt, { "plugin/skills/tidy/SKILL.md": TIDY });
  const decisions = decide(f, [addTidy]);
  const prepare = () => edit(f, ["prepare", "--run", run.file, "--decisions", decisions, "--upstreams", f.cache, "--remote", f.remote]);
  for (let i = 0; i < 2; i++) expect((await prepare()).code).toBe(0);
  expect(register(run.wt).originals).toEqual([...register(f.root).originals, "plugin/skills/tidy"]);
  expect(register(run.wt).items).toEqual(register(f.root).items);
  refused(await edit(f, gateArgs(f, run.file)), "unrouted-skill plugin/skills/tidy");

  const router = join(run.wt, "plugin/skills/ask-vstack/SKILL.md");
  writeFileSync(router, readFileSync(router, "utf8") + "- `/skill:tidy` tidies notes.\n");
  expect((await prepare()).code).toBe(0);
  const pass = await edit(f, gateArgs(f, run.file));
  expect({ code: pass.code, reason: pass.json?.reason }).toEqual({ code: 0, reason: undefined });
  expect((await edit(f, ["reviewed", "--run", run.file])).code).toBe(0);
  expect((await edit(f, ["finish", "--run", run.file, "--grilling", grilling(f, "Shared understanding")])).code).toBe(0);
  expect(git(run.wt, "show", "--name-only", "--format=", "HEAD").split("\n").sort()).toEqual(["CHANGELOG.md", "decision-register.yaml", "plugin/package.json", "plugin/skills/ask-vstack/SKILL.md", "plugin/skills/tidy/SKILL.md"]);
}, 90000);

test("a new agent and a new rule go through prepare and gates, and the load gate covers them", async () => {
  const f = fixture();
  const run = await started(f);
  writeFiles(run.wt, { "plugin/agents/tidier.md": TIDIER, "plugin/rules/tidy-paths.md": RULE });
  const r = await edit(f, ["prepare", "--run", run.file, "--decisions", decide(f, [addTidier, addRule]), "--upstreams", f.cache, "--remote", f.remote]);
  expect({ code: r.code, reason: r.json?.reason }).toEqual({ code: 0, reason: undefined });
  expect(register(run.wt).originals).toEqual([...register(f.root).originals, "plugin/agents/tidier.md", "plugin/rules/tidy-paths.md"]);
  const pass = await edit(f, gateArgs(f, run.file));
  expect({ code: pass.code, reason: pass.json?.reason }).toEqual({ code: 0, reason: undefined });
  refused(await edit(f, gateArgs(f, run.file), { SMOKE_DROP: "tidier" }), "load smoke missing agent plugin/agents/tidier.md");
  refused(await edit(f, gateArgs(f, run.file), { SMOKE_DROP: "tidy-paths" }), "load smoke missing rule plugin/rules/tidy-paths.md");
}, 90000);

test("one prepare both flips a confirmed adopt row and lists a new item under originals:", async () => {
  const f = fixture();
  const run = await started(f);
  writeFiles(run.wt, { "plugin/skills/keep/SKILL.md": KEEP, "plugin/agents/tidier.md": TIDIER });
  const decisions = decide(f, [{ ...editKeep, flip: { confirmed: true, reason: "Fixes a step." } }, addTidier]);
  for (let i = 0; i < 2; i++) expect((await edit(f, ["prepare", "--run", run.file, "--decisions", decisions, "--upstreams", f.cache, "--remote", f.remote])).code).toBe(0);
  const before = register(f.root), after = register(run.wt);
  expect(after.items.find((row: any) => row.id === "matt/keep")).toMatchObject({ disposition: "adapt", reason: "Fixes a step." });
  expect(after.originals).toEqual([...before.originals, "plugin/agents/tidier.md"]);
}, 60000);

test("prepare refuses an add with no draft, the wrong action or kind, a name main has, a clash, or a stray router change, and writes nothing", async () => {
  const f = fixture();
  const run = await started(f);
  const prepare = (targets: object[]) => edit(f, ["prepare", "--run", run.file, "--decisions", decide(f, targets), "--upstreams", f.cache, "--remote", f.remote]);
  refused(await prepare([addTidy]), "plugin/skills/tidy has no change");
  writeFiles(run.wt, { "plugin/agents/tidier.md": TIDIER });
  refused(await prepare([{ ...addTidier, action: "edit" }]), "its action is add");
  refused(await prepare([{ ...addTidier, kind: "rule" }]), "kind is agent");
  const router = join(run.wt, "plugin/skills/ask-vstack/SKILL.md");
  writeFileSync(router, readFileSync(router, "utf8") + "- `/skill:tidier`\n");
  refused(await prepare([addTidier]), "plugin/skills/ask-vstack changed but is not a target");
  git(run.wt, "checkout", "--", "plugin/skills/ask-vstack");
  writeFiles(run.wt, { "plugin/skills/wording/SKILL.md": WORDING });
  refused(await prepare([addTidier, { ...editWording, action: "add" }]), "plugin/skills/wording is already on main");
  git(run.wt, "checkout", "--", "plugin/skills/wording");
  writeFiles(run.wt, { "plugin/skills/rej/SKILL.md": "---\nname: rej\ndescription: Fixture skill\n---\nrej\n" });
  refused(await prepare([addTidier, { ...addTidy, artifact: "plugin/skills/rej" }]), "plugin/skills/rej clashes with matt skills/misc/rej at v1.1.0");
  expect(git(run.wt, "status", "--porcelain", "--", "decision-register.yaml", "CHANGELOG.md", "plugin/package.json")).toBe("");
}, 60000);

/** The take of the rejected matt/rej item at the v1.1.0 Pin. */
const takeRej = { action: "take", kind: "skill", artifact: "plugin/skills/rej", upstream: "matt", path: "skills/misc/rej", reason: "Ships rej without an Update." };
/** `artifact` as `repo` has it at `ref`, keyed by path inside the item: what a byte-for-byte take holds. */
function upstreamFiles(repo: string, ref: string, path: string) {
  const files = git(repo, "ls-tree", "-r", "--name-only", ref, "--", path).split("\n").filter(Boolean);
  return Object.fromEntries(files.map((file) => [file.slice(path.length + 1), Bun.spawnSync(["git", "-C", repo, "show", `${ref}:${file}`]).stdout.toString()]));
}
function worktreeFiles(wt: string, artifact: string) {
  const files = git(wt, "ls-files", "--others", "--cached", "--exclude-standard", "--", artifact).split("\n").filter(Boolean);
  return Object.fromEntries(files.map((file) => [file.slice(artifact.length + 1), readFileSync(join(wt, file), "utf8")]));
}
const addRoute = (wt: string, name: string) => { const router = join(wt, "plugin/skills/ask-vstack/SKILL.md"); writeFileSync(router, readFileSync(router, "utf8") + `- \`/skill:${name}\`\n`); };

test("prepare takes a rejected item at the current Pin as adopt, byte for byte, and check-register passes", async () => {
  const f = fixture();
  const run = await started(f);
  const c = await edit(f, ["check", "--run", run.file, "--upstreams", f.cache, "--remote", f.remote, "--take", "matt:skills/misc/rej"]);
  expect({ code: c.code, reason: c.json?.reason }).toEqual({ code: 0, reason: undefined });
  expect(c.json.targets).toEqual([expect.objectContaining({ artifact: "plugin/skills/rej", kind: "skill", action: "take", upstream: "matt", path: "skills/misc/rej", pin: "v1.1.0", row: "matt/rej", disposition: "adopt", house_style_rows: [] })]);

  addRoute(run.wt, "rej");
  const prepare = () => edit(f, ["prepare", "--run", run.file, "--decisions", decide(f, [takeRej]), "--upstreams", f.cache, "--remote", f.remote]);
  for (let i = 0; i < 2; i++) { const r = await prepare(); expect({ code: r.code, reason: r.json?.reason }).toEqual({ code: 0, reason: undefined }); }
  expect(worktreeFiles(run.wt, "plugin/skills/rej")).toEqual(upstreamFiles(f.mattRepo, "v1.1.0", "skills/misc/rej"));
  const before = register(f.root), after = register(run.wt);
  expect(after.items.find((row: any) => row.id === "matt/rej")).toEqual({ ...before.items.find((row: any) => row.id === "matt/rej"), disposition: "adopt", artifacts: ["plugin/skills/rej"], reason: "Ships rej without an Update." });
  expect(after.items.filter((row: any) => row.id !== "matt/rej")).toEqual(before.items.filter((row: any) => row.id !== "matt/rej"));
  expect(after.originals).toEqual(before.originals);
  const gates = await edit(f, gateArgs(f, run.file));
  expect({ code: gates.code, reason: gates.json?.reason }).toEqual({ code: 0, reason: undefined });
}, 90000);

test("prepare takes an unregistered item at the current Pin as adapt when a House style row changes it, and adds its register row", async () => {
  const f = fixture();
  // main without the wording row and its artifact: an Upstream item at the Pin with no register row.
  const reg = register(f.root);
  reg.items = reg.items.filter((row: any) => row.id !== "matt/wording");
  writeFileSync(join(f.root, "decision-register.yaml"), Bun.YAML.stringify(reg, null, 2));
  rmSync(join(f.root, "plugin/skills/wording"), { recursive: true });
  git(f.root, "add", "-A"); git(f.root, "commit", "-qm", "unregister wording");
  const run = await started(f);
  const c = await edit(f, ["check", "--run", run.file, "--upstreams", f.cache, "--remote", f.remote, "--take", "matt:skills/eng/wording"]);
  expect({ code: c.code, reason: c.json?.reason }).toEqual({ code: 0, reason: undefined });
  expect(c.json.targets).toEqual([expect.objectContaining({ artifact: "plugin/skills/wording", action: "take", row: null, disposition: "adapt", house_style_rows: ["fx-glossary"] })]);

  const takeWording = { action: "take", kind: "skill", artifact: "plugin/skills/wording", upstream: "matt", path: "skills/eng/wording", reason: "Reads GLOSSARY.md." };
  for (let i = 0; i < 2; i++) {
    const r = await edit(f, ["prepare", "--run", run.file, "--decisions", decide(f, [takeWording]), "--upstreams", f.cache, "--remote", f.remote]);
    expect({ code: r.code, reason: r.json?.reason }).toEqual({ code: 0, reason: undefined });
  }
  // Every row the Update runs on adapt matt text: fx-glossary (required) and fx-todo (adapted), not the pstack or migration-only rows. No agents/openai.yaml.
  expect(worktreeFiles(run.wt, "plugin/skills/wording")).toEqual({
    "SKILL.md": "---\nname: wording\ndescription: wording\n---\nRead GLOSSARY.md first. Start the `todo` list now. Ask poteto. Keep .git/old-root.\n",
    "refs/glossary.md": "See GLOSSARY.md.\n",
  });
  const after = register(run.wt);
  expect(after.items).toEqual([...reg.items, { id: "matt/wording", upstream: "matt", kind: "skill", path: "skills/eng/wording", tree: f.sha("matt", "v1.1.0", "skills/eng/wording"), disposition: "adapt", artifacts: ["plugin/skills/wording"], reason: "Reads GLOSSARY.md." }]);
  const gates = await edit(f, gateArgs(f, run.file));
  expect({ code: gates.code, reason: gates.json?.reason }).toEqual({ code: 0, reason: undefined });
}, 90000);

test("a take refuses a shipped item, an item that is not at the current Pin, a playbook, and a missing reason, and writes nothing", async () => {
  const f = fixture();
  const run = await started(f);
  const check = (spec: string) => edit(f, ["check", "--run", run.file, "--upstreams", f.cache, "--remote", f.remote, "--take", spec]);
  refused(await check("matt:skills/eng/keep"), "is adopt in matt/keep and ships as plugin/skills/keep");
  // fresh is a matt item only at v1.2.0, after the v1.1.0 Pin.
  refused(await check("matt:skills/eng/fresh"), "matt:skills/eng/fresh is not an Upstream item at the current Pin v1.1.0");
  refused(await check("pstack:pstack/skills/poteto-mode/playbooks/shipping.md"), "a take ships only a skill or principle directory or an agent .md file");
  refused(await check("matt"), "--take needs <upstream>:<path>");
  const prepare = (targets: object[]) => edit(f, ["prepare", "--run", run.file, "--decisions", decide(f, targets), "--upstreams", f.cache, "--remote", f.remote]);
  refused(await prepare([{ ...takeRej, reason: " " }]), "a take needs the register row's one-line reason");
  refused(await prepare([{ ...takeRej, artifact: "plugin/skills/rej-two" }]), "matt:skills/misc/rej ships as plugin/skills/rej, not plugin/skills/rej-two");
  refused(await prepare([{ ...takeRej, path: "skills/eng/keep", artifact: "plugin/skills/keep" }]), "is adopt in matt/keep");
  expect(git(run.wt, "status", "--porcelain")).toBe("");
}, 60000);

test("a text change reruns gates and the review before finish, and a bookkeeping change reruns neither", async () => {
  const f = fixture();
  const run = await prepared(f);
  const ok = async (args: string[]) => { const r = await edit(f, args); expect({ code: r.code, out: r.json?.ok }).toEqual({ code: 0, out: true }); };
  const gates = () => ok(run.gates);
  const reviewed = () => ok(["reviewed", "--run", run.file]);
  const prepare = (decisions: string) => ok(["prepare", "--run", run.file, "--decisions", decisions]);
  const finish = () => edit(f, ["finish", "--run", run.file, "--grilling", grilling(f, "Shared understanding")]);
  refused(await edit(f, ["reviewed", "--run", run.file]), "no gates passed");
  await gates();
  refused(await finish(), "review");
  await reviewed();

  writeFiles(run.wt, { "plugin/skills/wording/SKILL.md": WORDING + "One more line.\n" });
  await prepare(decide(f, [editWording]));
  refused(await finish(), "gates");
  await gates();
  refused(await finish(), "review");
  await reviewed();

  await prepare(decide(f, [editWording], ["wording reads GLOSSARY.md and the ADRs before it writes."]));
  writeFileSync(join(run.wt, "CHANGELOG.md"), readFileSync(join(run.wt, "CHANGELOG.md"), "utf8") + "- A line that prepare did not write.\n");
  refused(await finish(), "prepare");
  await prepare(decide(f, [editWording], ["wording reads GLOSSARY.md and the ADRs before it writes."]));
  await ok(["finish", "--run", run.file, "--grilling", grilling(f, "Shared understanding")]);
  expect(git(run.wt, "show", "HEAD:CHANGELOG.md")).toContain("- wording reads GLOSSARY.md and the ADRs before it writes.");
}, 60000);

test("cancel removes only the run's worktree and branch", async () => {
  const f = fixture();
  const run = await started(f);
  const other = join(f.dir, "other-wt");
  git(f.root, "worktree", "add", "-q", "-b", "edit/other", other, "main");
  const main = git(f.root, "rev-parse", "main");
  const r = await edit(f, ["cancel", "--run", run.file]);
  expect({ code: r.code, removed: r.json?.removed }).toEqual({ code: 0, removed: run.wt });
  expect(existsSync(run.wt)).toBe(false);
  expect(git(f.root, "for-each-ref", "--format=%(refname:short)", "refs/heads/edit/")).toBe("edit/other");
  expect(git(f.root, "worktree", "list")).toContain(other);
  expect(git(f.root, "rev-parse", "main")).toBe(main);
}, 30000);

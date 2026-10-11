import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lifecycleFixture } from "./support/update-lifecycle-fixture.ts";
import { fakeGitHub } from "./support/fake-github.ts";
import { git, writeFiles } from "./support/fixture.ts";

const fixtures: ReturnType<typeof lifecycleFixture>[] = [];
const fixture = () => { const f = lifecycleFixture(); fixtures.push(f); return f; };
afterEach(() => { for (const f of fixtures.splice(0)) rmSync(f.dir, { recursive: true, force: true }); });
const read = (root: string, file: string) => readFileSync(join(root, file), "utf8");
const register = (root: string) => Bun.YAML.parse(read(root, "decision-register.yaml")) as any;
const state = (root: string) => [git(root, "status", "--porcelain"), git(root, "diff", "HEAD"), git(root, "for-each-ref"), git(root, "worktree", "list", "--porcelain")];
async function planned(f: ReturnType<typeof fixture>, refs: string[] = ["matt@v1.2.0"]) {
  const r = await f.run(f.root, ["plan", ...refs]);
  expect(r.code).toBe(0);
  return { plan: r.plan, path: r.stdout.trim() };
}
function choices(f: ReturnType<typeof fixture>, plan?: any, targets: any[] = [], extra: any = {}) {
  const decisions = plan ? plan.rows.filter((r: any) => r.class !== "unchanged").map((r: any) => ({ id: r.id, action: "hold", reason: "Keep this contribution." })) : [];
  for (const n of plan?.new ?? []) decisions.push({ id: `${n.upstream}/${n.path.split("/").at(-1)}`, upstream: n.upstream, path: n.path, action: "defer", gist: "Review later." });
  const file = join(f.dir, "decisions.json");
  writeFileSync(file, JSON.stringify({ decisions, targets, changelog: ["Keep the chosen changes."], ...extra }));
  return file;
}
const own = (name: string) => ({ action: "add", kind: "rule", artifact: `plugin/rules/${name}.md` });

test("fact-finding leaves dirty checkouts, branches, and worktrees unchanged", async () => {
  const f = fixture(); writeFiles(f.root, { "plugin/skills/wording/SKILL.md": "Local text.\n" });
  const before = state(f.root);
  const { path } = await planned(f);
  expect((await f.run(f.root, ["merge", "--plan", path])).code).toBe(0);
  expect((await f.run(f.root, ["check", "--plan", path, "plugin/skills/wording"])).code).toBe(0);
  expect(state(f.root)).toEqual(before); expect(f.ompCalls()).toEqual([]);
}, 30000);

test("plan writes one maintain Scratch entry and merge reports overlaps without drafts", async () => {
  const f = fixture();
  writeFiles(f.root, { "plugin/skills/wording/SKILL.md": "---\nname: wording\ndescription: wording\n---\nRead GLOSSARY.md first. Start the `todo` list now. Ask poteto. Keep .git/old-root.\nThen keep the local plan.\n" });
  const { plan, path } = await planned(f);
  expect(path).toContain("/.vstack/tmp/"); expect(path).toContain("/maintain/");
  const entries = readdirSync(join(plan.out, "..")); expect(entries).toHaveLength(1);
  expect(JSON.parse(readFileSync(path, "utf8")).rows).toEqual(plan.rows);
  const r = await f.run(f.root, ["merge", "--plan", path]); expect(r.code).toBe(0);
  expect(r.plan.rows.find((x: any) => x.id === "matt/wording").overlaps).toContain("plugin/skills/wording/SKILL.md");
  expect(existsSync(join(plan.out, "merge-steps"))).toBe(false);
}, 30000);

test("plan keeps moves, Holds, artifact groups, House style sides, and adopt files", async () => {
  const f = fixture(); const { plan } = await planned(f, []);
  expect(plan.upstreams.find((x: any) => x.key === "matt").new).toBe("v1.2.0");
  expect(plan.upstreams.find((x: any) => x.key === "pstack").new).toBe(f.pstack.c2);
  const row = (id: string) => plan.rows.find((x: any) => x.id === id);
  expect(row("matt/old-name").class).toBe("moved"); expect(row("matt/drift").move.by).toBe("similarity");
  expect(row("matt/held").effective_old.ref).toBe("v1.0.0");
  expect(plan.artifacts.find((x: any) => x.artifact === "plugin/skills/forensics").rows).toHaveLength(2);
  for (const side of ["old", "new"]) { const text = readFileSync(join(row("matt/wording").sides[side], "SKILL.md"), "utf8"); expect(text).toContain("GLOSSARY.md"); expect(text).toContain("Start the `todo` list"); expect(text).not.toContain("CONTEXT.md"); }
  expect(row("matt/grow").staged.files.map((x: any) => x.path)).not.toContain("agents/openai.yaml");
  expect(plan.counts).toEqual({ unchanged: 8, changed: 7, moved: 2, removed: 1, new: 2 });
}, 30000);

test("plan at the current refs still writes Scratch and invalid selections refuse", async () => {
  const f = fixture(); const { plan } = await planned(f, ["matt@v1.1.0"]); expect(plan.moved).toBe(false);
  expect((await f.run(f.root, ["plan", "unknown"])).code).toBe(2);
  expect((await f.run(f.root, ["plan", "matt@"])).code).toBe(2);
  expect((await f.run(f.root, ["-h"])).stdout).toContain("prepare");
}, 30000);

test("check reports callers, adopt flips, rename callers, and new-name clashes at the Pin", async () => {
  const f = fixture();
  const r = await f.run(f.root, ["check", "plugin/skills/keep", "--rename", "plugin/skills/wording=plugin/skills/phrasing"]);
  expect(r.code).toBe(0); expect(r.plan.targets[0].dispositions).toContain("adopt");
  expect(r.plan.targets[1].adopt_callers).toContain("plugin/skills/keep");
  const clash = await f.run(f.root, ["check", "plugin/skills/rej"]); expect(clash.code).toBe(2);
  expect(JSON.parse(clash.stdout).clashes[0].take).toBe("matt:skills/misc/rej");
}, 30000);

test("check reads a rejected take through fake GitHub at the current Pin", async () => {
  const f = fixture(); const server = fakeGitHub(join(f.dir, "remote", "fixture"));
  const aliases = ["matt", "plugins"];
  const { symlinkSync } = await import("node:fs"); for (const name of aliases) symlinkSync(`${name}.git`, join(f.dir, "remote", "fixture", name));
  try { const r = await f.run(f.root, ["check", "--take", "matt:skills/misc/rej", "--source", "github"], { GITHUB_API_URL: server.url.toString() }); expect(r.code).toBe(0); expect(r.plan.targets[0].pin).toBe("v1.1.0"); expect(r.plan.targets[0].disposition).toBe("adopt"); }
  finally { server.stop(true); }
}, 30000);

test("prepare keeps earlier ticket rows and CHANGELOG lines and raises the version above HEAD", async () => {
  const f = fixture(); git(f.root, "checkout", "-qb", "feature");
  writeFiles(f.root, { "plugin/rules/first.md": "First rule.\n" });
  expect((await f.run(f.root, ["prepare", "--decisions", choices(f, undefined, [own("first")], { changelog: ["First ticket line."] })])).code).toBe(0);
  git(f.root, "add", "-A"); git(f.root, "commit", "-qm", "first ticket");
  writeFiles(f.root, { "plugin/rules/second.md": "Second rule.\n" });
  const r = await f.run(f.root, ["prepare", "--decisions", choices(f, undefined, [own("second")])]); expect(r.code).toBe(0);
  expect(r.plan.version).toBe("0.1.2"); expect(register(f.root).originals).toContain("plugin/rules/first.md"); expect(read(f.root, "CHANGELOG.md")).toContain("First ticket line.");
}, 30000);

test("prepare combines Update rows and Hand edit targets and keeps existing Hold fields and text", async () => {
  const f = fixture(); const { plan, path } = await planned(f);
  writeFiles(f.root, { "plugin/rules/local.md": "Local rule.\n", "plugin/skills/wording/SKILL.md": "Agent merged this text.\n" });
  const heldText = read(f.root, "plugin/skills/held/SKILL.md");
  const file = choices(f, plan, [own("local")]); const d = JSON.parse(readFileSync(file, "utf8")); d.decisions.find((x: any) => x.id === "matt/wording").action = "accept"; d.decisions.find((x: any) => x.id === "matt/grow").action = "accept"; writeFileSync(file, JSON.stringify(d));
  const r = await f.run(f.root, ["prepare", "--plan", path, "--decisions", file]); expect(r.code).toBe(0);
  expect(read(f.root, "plugin/skills/wording/SKILL.md")).toBe("Agent merged this text.\n");
  expect(read(f.root, "plugin/skills/grow/SKILL.md")).toContain("grow 2");
  expect(read(f.root, "plugin/skills/held/SKILL.md")).toBe(heldText);
  const held = register(f.root).items.find((x: any) => x.id === "matt/held"); expect(held.held_at).toBe("v1.0.0"); expect(held.held_path).toBe("skills/eng/held");
  expect(register(f.root).originals).toContain("plugin/rules/local.md"); expect(read(f.root, "pins.yaml")).toContain("v1.2.0");
}, 30000);

test("prepare makes at most one major bump per branch across shipped-name removals", async () => {
  const f = fixture(); git(f.root, "checkout", "-qb", "feature");
  for (const [name, version] of [["gone", "1.0.0"], ["drift", "1.0.1"]]) {
    rmSync(join(f.root, `plugin/skills/${name}`), { recursive: true });
    const file = choices(f, undefined, [{ action: "remove", kind: "skill", artifact: `plugin/skills/${name}`, reason: "Not needed." }]);
    const r = await f.run(f.root, ["prepare", "--decisions", file]); expect(r.code).toBe(0); expect(r.plan.version).toBe(version);
    git(f.root, "add", "-A"); git(f.root, "commit", "-qm", `remove ${name}`);
  }
}, 30000);

test("prepare takes from the Pin and requires confirmed adopt flips before any write", async () => {
  const f = fixture(); const before = state(f.root);
  const bad = choices(f, undefined, [{ action: "edit", kind: "skill", artifact: "plugin/skills/keep" }]);
  expect((await f.run(f.root, ["prepare", "--decisions", bad])).code).toBe(2); expect(state(f.root)).toEqual(before);
  const take = { action: "take", kind: "skill", artifact: "plugin/skills/rej", upstream: "matt", path: "skills/misc/rej", reason: "Useful item." };
  expect((await f.run(f.root, ["prepare", "--decisions", choices(f, undefined, [take])])).code).toBe(0);
  expect(read(f.root, "plugin/skills/rej/SKILL.md")).toContain("rej 1"); expect(read(f.root, "plugin/skills/rej/SKILL.md")).not.toContain("rej 2");
}, 30000);

function commands(f: ReturnType<typeof fixture>) {
  const command = join(f.dir, "gate.ts");
  writeFileSync(command, `const stage = process.argv[2]; console.log(stage); if(stage === "check") { console.log(JSON.stringify({failures: JSON.parse(process.env.FAILURES ?? "[]")})); if(process.env.FAILURES !== "[]" && process.env.FAILURES) process.exit(Number(process.env.CHECK_CODE ?? "1")); } if(process.env.FAIL_STAGE === stage) process.exit(1); if(stage === "smoke") console.log(JSON.stringify({skillCommands: ${JSON.stringify(register(f.root).items.flatMap((r: any) => r.artifacts).map((a: string) => a.split("/").at(-1)))}, warnings: []}));`);
  return { VSTACK_MAINTAIN_COMMANDS: JSON.stringify(Object.fromEntries(["validate", "check", "test", "smoke"].map(s => [s, [process.execPath, command, s]]))) };
}

test("gates run all four stages and fail on every failing stage", async () => {
  const f = fixture(); writeFiles(f.root, { "plugin/skills/wording/SKILL.md": "Changed text.\n" });
  const env = commands(f);
  const clean = await f.run(f.root, ["gates"], env); expect(clean.code).toBe(0); expect(clean.plan.stages.map((s: any) => s.name)).toEqual(["validate", "check", "test", "smoke"]);
  for (const stage of ["validate", "check", "test", "smoke"]) expect((await f.run(f.root, ["gates"], { ...env, FAIL_STAGE: stage })).code).toBe(2);
}, 30000);
test("gates isolate smoke output from home, delete temp output, and retain failure evidence in Scratch", async () => {
  const f = fixture(); const env = commands(f);
  const smoke = join(f.dir, "smoke.ts");
  writeFileSync(smoke, `import { existsSync, writeFileSync } from "node:fs";
const [plugin, out] = process.argv.slice(2);
console.log(JSON.stringify({ plugin, out, exists: out ? existsSync(out) : false }));
if (out) for (const name of ["summary.json", "rpc.jsonl", "rpc.err", "skills.json", "link.txt"]) writeFileSync(out + "/" + name, "Smoke evidence: " + name);
if (process.env.FAIL_STAGE === "smoke") process.exit(1);`);
  const injected = JSON.parse(env.VSTACK_MAINTAIN_COMMANDS);
  injected.smoke = [process.execPath, smoke];
  const smokeEnv = { VSTACK_MAINTAIN_COMMANDS: JSON.stringify(injected) };
  for (const failed of [false, true]) {
    const result = await f.run(f.root, ["gates"], { ...smokeEnv, FAIL_STAGE: failed ? "smoke" : "" });
    const report = JSON.parse(result.stdout);
    const stage = report.stages.find((s: any) => s.name === "smoke");
    const observed = JSON.parse(stage.output.split("\n")[0]);
    expect(observed.plugin).toBe(join(f.root, "plugin"));
    expect(typeof observed.out).toBe("string");
    expect(observed.out.startsWith(join(f.dir, "home") + "/")).toBe(false);
    expect(observed.exists).toBe(true);
    expect(result.code).toBe(failed ? 2 : 0);
    try {
      expect(existsSync(observed.out)).toBe(false);
      if (failed) {
        const scratch = join(f.dir, "home", ".vstack", "tmp");
        const keys = readdirSync(scratch);
        expect(keys).toHaveLength(1);
        const maintain = join(scratch, keys[0], "maintain");
        const entries = readdirSync(maintain);
        expect(entries).toHaveLength(1);
        const retained = join(maintain, entries[0]);
        expect(stage.output).toContain(`Smoke output retained at ${retained}`);
        for (const name of ["summary.json", "rpc.jsonl", "rpc.err", "skills.json", "link.txt"]) expect(read(retained, name)).toBe(`Smoke evidence: ${name}`);
      }
    } finally { rmSync(observed.out, { recursive: true, force: true }); }
  }
}, 30000);
test("in-place gates report only no-version-bump as pending and fail on all other failures", async () => {
  const f = fixture(); const env = commands(f);
  const noVersion = JSON.stringify([{ class: "no-version-bump", item: "plugin", message: "Pending bump." }]);
  const r = await f.run(f.root, ["gates", "--in-place"], { ...env, FAILURES: noVersion }); expect(r.code).toBe(0); expect(r.plan.pending[0].class).toBe("no-version-bump");
  expect((await f.run(f.root, ["gates"], { ...env, FAILURES: noVersion })).code).toBe(2);
  expect((await f.run(f.root, ["gates", "--in-place"], { ...env, FAILURES: JSON.stringify([{ class: "adopt-drift" }]) })).code).toBe(2);
  expect((await f.run(f.root, ["gates", "--in-place"], { ...env, FAILURES: noVersion, FAIL_STAGE: "test" })).code).toBe(2);
  expect((await f.run(f.root, ["gates", "--in-place"], { ...env, FAILURES: noVersion, CHECK_CODE: "2" })).code).toBe(2);
}, 30000);



test("prepare keeps an agent edit when the same Update adopt row flips to adapt", async () => {
  const f = fixture(); const { plan, path } = await planned(f);
  const text = "---\nname: grow\ndescription: Local grow\n---\nAgent merged grow 2 with the local rule.\n";
  writeFiles(f.root, { "plugin/skills/grow/SKILL.md": text });
  const file = choices(f, plan, [{ action: "edit", kind: "skill", artifact: "plugin/skills/grow", flip: { confirmed: true, reason: "Keep the local rule." } }]);
  const d = JSON.parse(readFileSync(file, "utf8")); d.decisions.find((x: any) => x.id === "matt/grow").action = "accept"; writeFileSync(file, JSON.stringify(d));
  expect((await f.run(f.root, ["prepare", "--plan", path, "--decisions", file])).code).toBe(0);
  expect(read(f.root, "plugin/skills/grow/SKILL.md")).toBe(text);
  expect(register(f.root).items.find((x: any) => x.id === "matt/grow").disposition).toBe("adapt");
}, 30000);

test("prepare refuses an adopt copy changed after planning and leaves bookkeeping untouched", async () => {
  const f = fixture(); const { plan, path } = await planned(f);
  const file = choices(f, plan); const d = JSON.parse(readFileSync(file, "utf8")); d.decisions.find((x: any) => x.id === "matt/grow").action = "accept"; writeFileSync(file, JSON.stringify(d));
  writeFileSync(join(plan.rows.find((x: any) => x.id === "matt/grow").staged.path, "SKILL.md"), "Wrong bytes.\n");
  const before = state(f.root);
  expect((await f.run(f.root, ["prepare", "--plan", path, "--decisions", file])).code).toBe(2); expect(state(f.root)).toEqual(before);
}, 30000);

test("read-only commands refuse a cache within any checkout", async () => {
  const f = fixture(); const before = state(f.root), cache = join(f.root, "cache");
  expect((await f.run(f.root, ["plan", "--upstreams", cache])).code).toBe(2);
  expect((await f.run(f.root, ["check", "--take", "matt:skills/misc/rej", "--upstreams", cache])).code).toBe(2);
  expect(existsSync(cache)).toBe(false); expect(state(f.root)).toEqual(before);
}, 30000);

test("prepare preserves a rename's callers, confirmed adopt flip, and House style row", async () => {
  const f = fixture();
  const { renameSync } = await import("node:fs"); renameSync(join(f.root, "plugin/skills/wording"), join(f.root, "plugin/skills/phrasing"));
  writeFiles(f.root, { "plugin/skills/phrasing/SKILL.md": "---\nname: phrasing\ndescription: Phrase notes\n---\nPhrase the notes.\n", "plugin/skills/keep/SKILL.md": "---\nname: keep\ndescription: Keep notes\n---\nRun skill://phrasing after.\n" });
  const file = choices(f, undefined, [{ action: "rename", kind: "skill", artifact: "plugin/skills/wording", to: "plugin/skills/phrasing" }, { action: "edit", kind: "skill", artifact: "plugin/skills/keep", flip: { confirmed: true, reason: "The caller uses the new name." } }]);
  const r = await f.run(f.root, ["prepare", "--decisions", file]); expect(r.code).toBe(0); expect(r.plan.version).toBe("1.0.0");
  expect(register(f.root).items.find((x: any) => x.id === "matt/wording").artifacts).toEqual(["plugin/skills/phrasing"]);
  expect(read(f.root, "house-style.yaml")).toContain("rename-wording"); expect(read(f.root, "plugin/skills/keep/SKILL.md")).toContain("skill://phrasing");
}, 30000);


test("prepare copies both a newly adopted reject and a new adopt from the selected Pin", async () => {
  const f = fixture(); const { plan, path } = await planned(f);
  const file = choices(f, plan); const d = JSON.parse(readFileSync(file, "utf8"));
  Object.assign(d.decisions.find((x: any) => x.id === "matt/rej"), { action: "accept", disposition: "adopt", artifacts: ["plugin/skills/rej"], reason: "The item now fits." });
  Object.assign(d.decisions.find((x: any) => x.id === "matt/fresh"), { action: "accept", disposition: "adopt", artifacts: ["plugin/skills/fresh"], reason: "Use the new skill." });
  writeFileSync(file, JSON.stringify(d));
  const r = await f.run(f.root, ["prepare", "--plan", path, "--decisions", file]); expect(r.code).toBe(0);
  expect(read(f.root, "plugin/skills/rej/SKILL.md")).toBe(git(f.mattRepo, "show", "v1.2.0:skills/misc/rej/SKILL.md") + "\n");
  expect(read(f.root, "plugin/skills/fresh/SKILL.md")).toContain("brand new skill");
}, 30000);
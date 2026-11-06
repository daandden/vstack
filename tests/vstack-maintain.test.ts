import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lifecycleFixture } from "./support/update-lifecycle-fixture.ts";
import { fakeGitHub } from "./support/fake-github.ts";
import { checkout, git, makeUpstreams, passingSpec, writeFiles } from "./support/fixture.ts";

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

test("plan --scratch writes its entry under the supplied Scratch dir and refuses a relative one", async () => {
  const f = fixture(); const scratch = join(f.dir, "scratch"), maintain = join(scratch, "maintain");
  const r = await f.run(f.root, ["plan", "--scratch", scratch, "matt@v1.2.0"]);
  expect(r.stdout.trim().startsWith(`${maintain}/`)).toBe(true);
  expect(r.code).toBe(0);
  const entries = readdirSync(maintain); expect(entries).toHaveLength(1);
  expect(r.stdout.trim()).toBe(join(maintain, entries[0], "plan.json"));
  expect(r.plan.out).toBe(join(maintain, entries[0])); expect(r.plan.root).toBe(f.root);
  expect(existsSync(join(f.dir, "home", ".vstack", "tmp"))).toBe(false);
  const relative = await f.run(f.root, ["plan", "--scratch", "scratch", "matt@v1.2.0"]);
  expect(relative.code).toBe(2); expect(JSON.parse(relative.stdout).ok).toBe(false);
  expect(readdirSync(maintain)).toHaveLength(1); expect(existsSync(join(f.root, "scratch"))).toBe(false);
}, 30000);

test("plan --scratch refuses a Scratch dir inside a checkout and writes nothing there", async () => {
  const f = fixture(); const inside = join(f.root, "scratch");
  const r = await f.run(f.root, ["plan", "--scratch", inside, "matt@v1.2.0"]);
  expect(r.code).toBe(2);
  expect(JSON.parse(r.stdout)).toMatchObject({ ok: false, reason: `Scratch must be outside every checkout: ${inside}` });
  expect(existsSync(inside)).toBe(false);
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

test("prepare writes a patch Change note and leaves release files and unchanged bookkeeping byte-identical", async () => {
  const f = fixture();
  const pins = `# Pins keep their comments.\nupstreams: ${JSON.stringify((Bun.YAML.parse(read(f.root, "pins.yaml")) as any).upstreams)} # Flow map\n`;
  const style = `# House style keeps its comments.\n${read(f.root, "house-style.yaml")}`;
  const reg = `# Decision register header.\n${read(f.root, "decision-register.yaml")}`.replace(/artifacts: *\n      - (plugin\/skills\/[^\n]+)/g, 'artifacts: ["$1"] # Flow list');
  const manifest = '{\n  "name": "vstack", "version" : "0.1.0",\n  "omp": {"extensions": ["./extensions/vstack.ts"]}\n}\n';
  writeFiles(f.root, { "pins.yaml": pins, "house-style.yaml": style, "decision-register.yaml": reg, "plugin/package.json": manifest });
  git(f.root, "add", "-A"); git(f.root, "commit", "-qm", "formatted bookkeeping");
  const changelog = read(f.root, "CHANGELOG.md");
  const r = await f.run(f.root, ["prepare", "--decisions", choices(f, undefined, [{ action: "edit", kind: "skill", artifact: "plugin/skills/wording" }])]);
  expect(r.code).toBe(0);
  expect(read(f.root, "decision-register.yaml")).toBe(reg);
  expect(read(f.root, "pins.yaml")).toBe(pins);
  expect(read(f.root, "house-style.yaml")).toBe(style);
  expect(read(f.root, "plugin/package.json")).toBe(manifest);
  expect(read(f.root, "CHANGELOG.md")).toBe(changelog);
  expect(r.plan.level).toBe("patch");
  expect(JSON.parse(read(f.root, r.plan.note))).toEqual({ schema: 1, level: "patch", entries: ["Keep the chosen changes."] });
  expect(readdirSync(join(f.root, "change-notes"))).toHaveLength(1);
}, 30000);

test("prepare changes only an adapt reason inside a flow row", async () => {
  const f = fixture();
  const data = register(f.root);
  data.items.find((row: any) => row.id === "matt/wording").reason = "Existing adaptation.";
  const before = `# Decision register header.\nitems:\n${data.items.map((row: any) => `  - ${JSON.stringify(row)} # ${row.id}\n`).join("")}originals: []\n`;
  writeFiles(f.root, { "decision-register.yaml": before });
  git(f.root, "add", "-A"); git(f.root, "commit", "-qm", "flow register");
  const target = { action: "edit", kind: "skill", artifact: "plugin/skills/wording", reason: "Updated adaptation." };
  const r = await f.run(f.root, ["prepare", "--decisions", choices(f, undefined, [target])]);
  expect(r.code).toBe(0);
  expect(register(f.root).items.find((row: any) => row.id === "matt/wording").reason).toBe("Updated adaptation.");
  expect(read(f.root, "decision-register.yaml")).toBe(before.replace('"Existing adaptation."', '"Updated adaptation."'));
}, 30000);

test("prepare preserves flow descendants and comments when an Update adds Hold fields and rows", async () => {
  const f = fixture(); const data = register(f.root);
  const kept = JSON.stringify(data.items.find((row: any) => row.id === "matt/keep"));
  const source = `# Register header.\nitems: [${data.items.map((row: any) => JSON.stringify(row)).join(",")}] # Items footer.\noriginals: []\n`;
  writeFiles(f.root, { "decision-register.yaml": source });
  git(f.root, "add", "-A"); git(f.root, "commit", "-qm", "flow collection");
  const { plan, path } = await planned(f);
  const r = await f.run(f.root, ["prepare", "--plan", path, "--decisions", choices(f, plan)]);
  expect(r.code).toBe(0);
  const result = read(f.root, "decision-register.yaml");
  expect(result).toContain(kept);
  expect(result).toStartWith("# Register header.\n");
  expect(result).toContain('"artifacts":["plugin/skills/wording"]');
  expect(result).toContain("] # Items footer.");
  expect(register(f.root).items.find((row: any) => row.id === "matt/wording").held_at).toBe("v1.1.0");
  expect(register(f.root).items.find((row: any) => row.id === "matt/fresh").disposition).toBe("reject");
}, 30000);

test("prepare refuses invalid edit reasons before writing bookkeeping", async () => {
  const f = fixture(); const before = state(f.root);
  for (const reason of ["", "   ", "First line.\nSecond line."]) {
    const target = { action: "edit", kind: "skill", artifact: "plugin/skills/wording", reason };
    const r = await f.run(f.root, ["prepare", "--decisions", choices(f, undefined, [target])]);
    expect(r.code).toBe(2);
    expect(JSON.parse(r.stdout).reason).toContain("reason needs one line");
    expect(state(f.root)).toEqual(before);
  }
}, 30000);

test("prepare refuses independently edited bookkeeping and release metadata without changing checkout bytes", async () => {
  const f = fixture();
  const file = choices(f, undefined, [{ action: "edit", kind: "skill", artifact: "plugin/skills/wording" }]);
  for (const path of ["decision-register.yaml", "pins.yaml", "house-style.yaml", "CHANGELOG.md", "plugin/package.json"]) {
    const original = read(f.root, path);
    const edited = path.endsWith(".json") ? original.replace('"0.1.0"', '"0.9.0"') : `# Independent work.\n${original}`;
    writeFiles(f.root, { [path]: edited });
    const before = state(f.root);
    const result = await f.run(f.root, ["prepare", "--decisions", file]);
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, category: "input-conflict", conflicts: [path] });
    expect(state(f.root)).toEqual(before);
    expect(read(f.root, path)).toBe(edited);
    writeFiles(f.root, { [path]: original });
  }
}, 30000);

test("prepare carries accepted uncommitted work across repeats and review-fix handoffs", async () => {
  const f = fixture();
  writeFiles(f.root, { "plugin/rules/first.md": "First rule.\n" });
  const first = choices(f, undefined, [own("first")], { changelog: ["First ticket line."] });
  const prepared = await f.run(f.root, ["prepare", "--decisions", first]);
  expect(prepared.code).toBe(0);
  const accepted = state(f.root);
  expect((await f.run(f.root, ["prepare", "--decisions", first])).code).toBe(0);
  expect(state(f.root)).toEqual(accepted);
  writeFiles(f.root, { "plugin/rules/second.md": "Second rule.\n", "plugin/skills/wording/SKILL.md": "Reviewed agent text.\n" });
  const second = choices(f, undefined, [own("second"), { action: "edit", kind: "skill", artifact: "plugin/skills/wording", reason: "Keep the review correction." }], { changelog: ["Second ticket line."] });
  const result = await f.run(f.root, ["prepare", "--decisions", second]);
  expect(result.code).toBe(0);
  expect(result.plan.level).toBe("patch");
  expect(result.plan.note).toBe(prepared.plan.note);
  expect(readdirSync(join(f.root, "change-notes"))).toHaveLength(1);
  expect(register(f.root).originals).toEqual(["plugin/rules/first.md", "plugin/rules/second.md"]);
  expect(register(f.root).items.find((row: any) => row.id === "matt/wording").reason).toBe("Keep the review correction.");
  expect(read(f.root, "plugin/skills/wording/SKILL.md")).toBe("Reviewed agent text.\n");
  expect(JSON.parse(read(f.root, result.plan.note)).entries).toEqual(["First ticket line.", "Second ticket line."]);
  expect(read(f.root, "CHANGELOG.md")).toBe("# Changelog\n\n## [Unreleased]\n");
  const independent = `# Another task.\n${read(f.root, "decision-register.yaml")}`;
  writeFiles(f.root, { "decision-register.yaml": independent });
  const before = state(f.root);
  const refused = await f.run(f.root, ["prepare", "--decisions", second]);
  expect(refused.code).toBe(2);
  expect(JSON.parse(refused.stdout).conflicts).toContain("decision-register.yaml");
  expect(state(f.root)).toEqual(before);
}, 30000);

test("prepare refuses independent edits to its previously prepared Change note", async () => {
  const f = fixture();
  const file = choices(f, undefined, [{ action: "edit", kind: "skill", artifact: "plugin/skills/wording" }]);
  const prepared = await f.run(f.root, ["prepare", "--decisions", file]);
  expect(prepared.code).toBe(0);
  writeFiles(f.root, { [prepared.plan.note]: JSON.stringify({ schema: 1, level: "major", entries: ["Another editor's decision."] }) });
  const before = state(f.root);
  const refused = await f.run(f.root, ["prepare", "--decisions", file]);
  expect(refused.code).toBe(2);
  expect(JSON.parse(refused.stdout)).toMatchObject({ category: "input-conflict", conflicts: [prepared.plan.note] });
  expect(state(f.root)).toEqual(before);
}, 30000);

test("prepare protects selected adopt and take destinations, including untracked content", async () => {
  const f = fixture(); const { plan, path } = await planned(f);
  const file = choices(f, plan);
  const decisions = JSON.parse(readFileSync(file, "utf8"));
  decisions.decisions.find((row: any) => row.id === "matt/grow").action = "accept";
  writeFileSync(file, JSON.stringify(decisions));
  writeFiles(f.root, { "plugin/skills/grow/independent.txt": "Another task's notes.\n" });
  const before = state(f.root);
  const refused = await f.run(f.root, ["prepare", "--plan", path, "--decisions", file]);
  expect(refused.code).toBe(2);
  expect(JSON.parse(refused.stdout).conflicts).toContain("plugin/skills/grow");
  expect(state(f.root)).toEqual(before);
  expect(read(f.root, "plugin/skills/grow/independent.txt")).toBe("Another task's notes.\n");
  rmSync(join(f.root, "plugin/skills/grow/independent.txt"));
  expect((await f.run(f.root, ["prepare", "--plan", path, "--decisions", file])).code).toBe(0);
  const accepted = state(f.root);
  expect((await f.run(f.root, ["prepare", "--plan", path, "--decisions", file])).code).toBe(0);
  expect(state(f.root)).toEqual(accepted);
  writeFiles(f.root, { "plugin/skills/rej/SKILL.md": "Independent take draft.\n" });
  const take = { action: "take", kind: "skill", artifact: "plugin/skills/rej", upstream: "matt", path: "skills/misc/rej", reason: "Useful item." };
  const beforeTake = state(f.root);
  const rejectedTake = await f.run(f.root, ["prepare", "--decisions", choices(f, undefined, [take])]);
  expect(rejectedTake.code).toBe(2);
  expect(JSON.parse(rejectedTake.stdout).conflicts).toContain("plugin/skills/rej");
  expect(state(f.root)).toEqual(beforeTake);
  expect(read(f.root, "plugin/skills/rej/SKILL.md")).toBe("Independent take draft.\n");
}, 30000);

async function pauseBeforeReplacement(f: ReturnType<typeof fixture>) {
  const { mkdirSync } = await import("node:fs");
  const bin = join(f.dir, "paused-git"), ready = join(f.dir, "ready"), release = join(f.dir, "release");
  mkdirSync(bin);
  const real = Bun.which("git")!;
  writeFileSync(join(bin, "git"), `#!${process.execPath}
import { existsSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
if (args[0] === "show" && args[1] === "HEAD:decision-register.yaml") {
  writeFileSync(${JSON.stringify(ready)}, "ready");
  while (!existsSync(${JSON.stringify(release)})) await Bun.sleep(10);
}
const result = Bun.spawnSync([${JSON.stringify(real)}, ...args], { stdout: "inherit", stderr: "inherit" });
process.exit(result.exitCode);
`);
  chmodSync(join(bin, "git"), 0o755);
  return {
    env: { PATH: `${bin}:${process.env.PATH}` },
    async ready() {
      const deadline = Date.now() + 10000;
      while (!existsSync(ready) && Date.now() < deadline) await Bun.sleep(10);
      expect(existsSync(ready)).toBe(true);
    },
    release() { writeFileSync(release, "continue"); },
  };
}

test("cooperating preparations refuse competing ownership and preserve accepted work on retry", async () => {
  const f = fixture(); const pause = await pauseBeforeReplacement(f);
  writeFiles(f.root, { "plugin/rules/first.md": "First.\n", "plugin/rules/second.md": "Second.\n" });
  const first = choices(f, undefined, [own("first")], { changelog: ["First accepted change."] });
  const pending = f.run(f.root, ["prepare", "--decisions", first], pause.env);
  try {
    await pause.ready();
    const second = choices(f, undefined, [own("second")], { changelog: ["Second accepted change."] });
    const before = state(f.root);
    const competing = await f.run(f.root, ["prepare", "--decisions", second]);
    expect(competing.code).toBe(2);
    expect(JSON.parse(competing.stdout).category).toBe("preparation-busy");
    expect(state(f.root)).toEqual(before);
    pause.release();
    const prepared = await pending;
    expect(prepared.code).toBe(0);
    const result = await f.run(f.root, ["prepare", "--decisions", second]);
    expect(result.code).toBe(0);
    expect(result.plan.note).toBe(prepared.plan.note);
    expect(register(f.root).originals).toEqual(["plugin/rules/first.md", "plugin/rules/second.md"]);
    expect(JSON.parse(read(f.root, result.plan.note)).entries).toEqual(["First accepted change.", "Second accepted change."]);
  } finally { pause.release(); await pending; }
}, 30000);

test("prepare rechecks inputs after planning before it replaces checkout content", async () => {
  const f = fixture(); const pause = await pauseBeforeReplacement(f);
  const file = choices(f, undefined, [{ action: "edit", kind: "skill", artifact: "plugin/skills/wording" }]);
  const pending = f.run(f.root, ["prepare", "--decisions", file], pause.env);
  try {
    await pause.ready();
    writeFiles(f.root, { "CHANGELOG.md": "# Changelog\n\n## [Unreleased]\n\n- Accepted by another editor.\n" });
    const before = state(f.root);
    pause.release();
    const result = await pending;
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stdout).conflicts).toContain("CHANGELOG.md");
    expect(state(f.root)).toEqual(before);
  } finally { pause.release(); await pending; }
}, 30000);

test("prepare reports completed writes and the failing path after an unexpected write failure", async () => {
  const f = fixture();
  const file = choices(f, undefined, [{ action: "edit", kind: "skill", artifact: "plugin/skills/wording", reason: "A changed reason." }]);
  const style = join(f.root, "house-style.yaml");
  chmodSync(style, 0o444);
  try {
    const result = await f.run(f.root, ["prepare", "--decisions", file]);
    expect(result.code).toBe(2);
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({ category: "write-failure", attempted: "house-style.yaml", outcome: "checkout-may-be-partially-written" });
    expect(report.written).toEqual(["decision-register.yaml", "pins.yaml"]);
    expect(register(f.root).items.find((row: any) => row.id === "matt/wording").reason).toBe("A changed reason.");
    expect(JSON.parse(read(f.root, "plugin/package.json")).version).toBe("0.1.0");
    expect(read(f.root, "CHANGELOG.md")).toBe("# Changelog\n\n## [Unreleased]\n");
  } finally { chmodSync(style, 0o644); }
}, 30000);

test("prepare keeps earlier committed ticket rows and notes without editing release files", async () => {
  const f = fixture(); git(f.root, "checkout", "-qb", "feature");
  writeFiles(f.root, { "plugin/rules/first.md": "First rule.\n" });
  expect((await f.run(f.root, ["prepare", "--decisions", choices(f, undefined, [own("first")], { changelog: ["First ticket line."] })])).code).toBe(0);
  git(f.root, "add", "-A"); git(f.root, "commit", "-qm", "first ticket");
  writeFiles(f.root, { "plugin/rules/second.md": "Second rule.\n" });
  const r = await f.run(f.root, ["prepare", "--decisions", choices(f, undefined, [own("second")])]); expect(r.code).toBe(0);
  expect(r.plan.level).toBe("patch");
  expect(register(f.root).originals).toContain("plugin/rules/first.md");
  const notes = readdirSync(join(f.root, "change-notes"));
  expect(notes).toHaveLength(2);
  expect(notes.flatMap(note => JSON.parse(read(f.root, `change-notes/${note}`)).entries)).toContain("First ticket line.");
  expect(JSON.parse(read(f.root, "plugin/package.json")).version).toBe("0.1.0");
  expect(read(f.root, "CHANGELOG.md")).toBe("# Changelog\n\n## [Unreleased]\n");
}, 30000);

test("prepare combines Update rows and Hand edit targets and keeps existing Hold fields and text", async () => {
  const f = fixture(); const { plan, path } = await planned(f);
  writeFiles(f.root, { "plugin/rules/local.md": "Local rule.\n", "plugin/skills/wording/SKILL.md": "Agent merged this text.\n" });
  const heldText = read(f.root, "plugin/skills/held/SKILL.md");
  const file = choices(f, plan, [own("local")]); const d = JSON.parse(readFileSync(file, "utf8")); d.decisions.find((x: any) => x.id === "matt/wording").action = "accept"; d.decisions.find((x: any) => x.id === "matt/grow").action = "accept"; writeFileSync(file, JSON.stringify(d));
  const r = await f.run(f.root, ["prepare", "--plan", path, "--decisions", file]); expect(r.code).toBe(0);
  expect(r.plan.level).toBe("minor");
  expect(JSON.parse(read(f.root, r.plan.note)).level).toBe("minor");
  expect(read(f.root, "plugin/skills/wording/SKILL.md")).toBe("Agent merged this text.\n");
  expect(read(f.root, "plugin/skills/grow/SKILL.md")).toContain("grow 2");
  expect(read(f.root, "plugin/skills/held/SKILL.md")).toBe(heldText);
  const held = register(f.root).items.find((x: any) => x.id === "matt/held"); expect(held.held_at).toBe("v1.0.0"); expect(held.held_path).toBe("skills/eng/held");
  expect(register(f.root).originals).toContain("plugin/rules/local.md"); expect(read(f.root, "pins.yaml")).toContain("v1.2.0");
}, 30000);

test("prepare records major for each change removing a shipped name", async () => {
  const f = fixture(); git(f.root, "checkout", "-qb", "feature");
  for (const name of ["gone", "drift"]) {
    rmSync(join(f.root, `plugin/skills/${name}`), { recursive: true });
    const file = choices(f, undefined, [{ action: "remove", kind: "skill", artifact: `plugin/skills/${name}`, reason: "Not needed." }]);
    const r = await f.run(f.root, ["prepare", "--decisions", file]); expect(r.code).toBe(0); expect(r.plan.level).toBe("major");
    git(f.root, "add", "-A"); git(f.root, "commit", "-qm", `remove ${name}`);
  }
}, 30000);

test("prepare records major when an Update rejects or renames a shipped skill", async () => {
  for (const change of [{ disposition: "reject", reason: "Not needed." }, { artifacts: ["plugin/skills/phrasing"] }] as any[]) {
    const f = fixture(); git(f.root, "checkout", "-qb", "feature");
    const { plan, path } = await planned(f);
    if (change.artifacts) writeFiles(f.root, { "plugin/skills/phrasing/SKILL.md": "Renamed local text.\n" });
    const file = choices(f, plan); const d = JSON.parse(readFileSync(file, "utf8"));
    Object.assign(d.decisions.find((x: any) => x.id === "matt/wording"), { action: "accept", ...change }); writeFileSync(file, JSON.stringify(d));
    const r = await f.run(f.root, ["prepare", "--plan", path, "--decisions", file]); expect(r.code).toBe(0); expect(r.plan.level).toBe("major");
  }
}, 60000);

test("prepare records major when a shipped extension command is renamed", async () => {
  const f = fixture();
  writeFiles(f.root, { "plugin/extensions/commands.ts": 'export default pi => { pi.registerCommand("old-command", {}); };\n' });
  git(f.root, "add", "-A"); git(f.root, "commit", "-qm", "shipped command");
  writeFiles(f.root, { "plugin/extensions/commands.ts": 'export default pi => { pi.registerCommand("new-command", {}); };\n' });
  const result = await f.run(f.root, ["prepare", "--decisions", choices(f, undefined, [{ action: "edit", kind: "skill", artifact: "plugin/skills/wording" }])]);
  expect(result.code).toBe(0);
  expect(result.plan.level).toBe("major");
  expect(JSON.parse(read(f.root, result.plan.note)).level).toBe("major");
}, 30000);

test("prepare takes from the Pin and requires confirmed adopt flips before any write", async () => {
  const f = fixture(); const before = state(f.root);
  const bad = choices(f, undefined, [{ action: "edit", kind: "skill", artifact: "plugin/skills/keep" }]);
  expect((await f.run(f.root, ["prepare", "--decisions", bad])).code).toBe(2); expect(state(f.root)).toEqual(before);
  const take = { action: "take", kind: "skill", artifact: "plugin/skills/rej", upstream: "matt", path: "skills/misc/rej", reason: "Useful item." };
  expect((await f.run(f.root, ["prepare", "--decisions", choices(f, undefined, [take])])).code).toBe(0);
  expect(read(f.root, "plugin/skills/rej/SKILL.md")).toContain("rej 1"); expect(read(f.root, "plugin/skills/rej/SKILL.md")).not.toContain("rej 2");
}, 30000);

function smokeCommands(f: ReturnType<typeof fixture>) {
  const smoke = join(f.dir, "smoke.ts");
  writeFileSync(smoke, `import { existsSync, mkdirSync, writeFileSync } from "node:fs";
const [plugin, out] = process.argv.slice(2);
console.log(JSON.stringify({ plugin, out, exists: out ? existsSync(out) : false }));
if (out) for (const name of ["summary.json", "rpc.jsonl", "rpc.err", "skills.json", "link.txt"]) writeFileSync(out + "/" + name, "Smoke evidence: " + name);
if (out) { mkdirSync(out + "/home/.omp/natives/1.0.0", { recursive: true }); writeFileSync(out + "/home/.omp/natives/1.0.0/pi_natives.node", "native addon"); writeFileSync(out + "/home/.omp/models.yml", "Smoke evidence: models.yml"); }
if (process.env.FAIL_STAGE === "smoke") process.exit(1);`);
  const injected = JSON.parse(commands(f).VSTACK_MAINTAIN_COMMANDS);
  injected.smoke = [process.execPath, smoke];
  return { VSTACK_MAINTAIN_COMMANDS: JSON.stringify(injected) };
}
function commands(f: ReturnType<typeof fixture>) {
  const command = join(f.dir, "gate.ts");
  writeFileSync(command, `const stage = process.argv[2]; console.log(stage); if(process.env.FAIL_STAGE === stage) process.exit(1); if(stage === "smoke") console.log(JSON.stringify({skillCommands: ${JSON.stringify(register(f.root).items.flatMap((r: any) => r.artifacts).map((a: string) => a.split("/").at(-1)))}, warnings: []}));`);
  return { VSTACK_MAINTAIN_COMMANDS: JSON.stringify(Object.fromEntries(["validate", "check", "test", "smoke"].map(s => [s, [process.execPath, command, s]]))) };
}

test("gates run all four stages and fail on every failing stage", async () => {
  const f = fixture(); writeFiles(f.root, { "plugin/skills/wording/SKILL.md": "Changed text.\n" });
  const env = commands(f);
  const clean = await f.run(f.root, ["gates"], env); expect(clean.code).toBe(0); expect(clean.plan.stages.map((s: any) => s.name)).toEqual(["validate", "check", "test", "smoke"]);
  for (const stage of ["validate", "check", "test", "smoke"]) expect((await f.run(f.root, ["gates"], { ...env, FAIL_STAGE: stage })).code).toBe(2);
}, 30000);
test("gates isolate smoke output from home, delete temp output, and retain failure evidence in Scratch", async () => {
  const f = fixture(); const smokeEnv = smokeCommands(f);
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
test("gates --scratch retain failed smoke evidence under the supplied Scratch dir", async () => {
  const f = fixture(); const scratch = join(f.dir, "scratch"), maintain = join(scratch, "maintain");
  const result = await f.run(f.root, ["gates", "--scratch", scratch], { ...smokeCommands(f), FAIL_STAGE: "smoke" });
  expect(result.stdout).toContain(`Smoke output retained at ${maintain}/`);
  expect(result.code).toBe(2);
  const entries = readdirSync(maintain); expect(entries).toHaveLength(1);
  const retained = join(maintain, entries[0]);
  const stage = JSON.parse(result.stdout).stages.find((s: any) => s.name === "smoke");
  expect(stage.output).toContain(`Smoke output retained at ${retained}`);
  for (const name of ["summary.json", "rpc.jsonl", "rpc.err", "skills.json", "link.txt"]) expect(read(retained, name)).toBe(`Smoke evidence: ${name}`);
  expect(read(retained, "home/.omp/models.yml")).toBe("Smoke evidence: models.yml");
  expect(existsSync(join(retained, "home", ".omp", "natives"))).toBe(false);
  expect(existsSync(join(f.dir, "home", ".vstack", "tmp"))).toBe(false);
}, 30000);
test("gates' own load smoke requires the vstack-clean extension Command when the manifest lists extensions", async () => {
  const f = fixture();
  const injected = JSON.parse(commands(f).VSTACK_MAINTAIN_COMMANDS); delete injected.smoke;
  const env = { VSTACK_MAINTAIN_COMMANDS: JSON.stringify(injected) };
  const skills = register(f.root).items.flatMap((r: any) => r.artifacts).map((a: string) => a.split("/").at(-1));
  writeFiles(f.root, { "plugin/package.json": `${JSON.stringify({ name: "vstack", version: "0.1.0", private: true, omp: { extensions: ["./extensions/vstack.ts"] } }, null, 2)}\n` });
  const smoke = (extensionCommands: string[]) => {
    writeFiles(f.root, { "scripts/load-smoke.sh": `#!/usr/bin/env bash\necho '${JSON.stringify({ skillCommands: skills, extensionCommands, tools: [], warnings: [] })}'\n` });
    chmodSync(join(f.root, "scripts/load-smoke.sh"), 0o755);
  };
  smoke(["autoresearch"]);
  const missing = await f.run(f.root, ["gates", "--scratch", join(f.dir, "scratch")], env);
  const stage = (r: any) => JSON.parse(r.stdout).stages.find((s: any) => s.name === "smoke");
  expect(missing.code).toBe(2);
  expect(stage(missing).output).toContain("load smoke missing extension command vstack-clean: ./extensions/vstack.ts did not load");
  smoke(["autoresearch", "vstack-clean"]);
  const loaded = await f.run(f.root, ["gates", "--scratch", join(f.dir, "scratch")], env);
  expect(stage(loaded).ok).toBe(true);
  expect(loaded.code).toBe(0);
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
  writeFiles(f.root, { "decision-register.yaml": read(f.root, "decision-register.yaml").replace(/- plugin\/skills\/wording\n/, '- "plugin/skills/wording" # Keep the artifact annotation.\n') });
  git(f.root, "add", "-A"); git(f.root, "commit", "-qm", "annotated artifact");
  const { renameSync } = await import("node:fs"); renameSync(join(f.root, "plugin/skills/wording"), join(f.root, "plugin/skills/phrasing"));
  writeFiles(f.root, { "plugin/skills/phrasing/SKILL.md": "---\nname: phrasing\ndescription: Phrase notes\n---\nPhrase the notes.\n", "plugin/skills/keep/SKILL.md": "---\nname: keep\ndescription: Keep notes\n---\nRun skill://phrasing after.\n" });
  const file = choices(f, undefined, [{ action: "rename", kind: "skill", artifact: "plugin/skills/wording", to: "plugin/skills/phrasing" }, { action: "edit", kind: "skill", artifact: "plugin/skills/keep", flip: { confirmed: true, reason: "The caller uses the new name." } }]);
  const r = await f.run(f.root, ["prepare", "--decisions", file]); expect(r.code).toBe(0); expect(r.plan.level).toBe("major");
  expect(register(f.root).items.find((x: any) => x.id === "matt/wording").artifacts).toEqual(["plugin/skills/phrasing"]);
  expect(read(f.root, "decision-register.yaml")).toContain('"plugin/skills/phrasing" # Keep the artifact annotation.');
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

test("prepare drops a whole Upstream with its Pin, rows, and House style rows, and refuses while an artifact only it names exists", async () => {
  const f = fixture(); const up = makeUpstreams(); const spec = passingSpec(up);
  const beta = spec.register.items.find((row: any) => row.id === "beta/adapted")!;
  spec.register.items.push({ ...beta, id: "beta/solo", artifacts: ["plugin/skills/solo"], reason: "Only beta names it." }, { ...beta, id: "beta/dropped", disposition: "reject", artifacts: [], reason: "Not wanted." });
  spec.houseStyle.replacements.push({ id: "fx-beta", from: "pack", to: "vstack", match: "name", upstream: "beta", scope: "adapted", uses: ["update"] });
  spec.houseStyle.rules.push({ id: "fx-beta-rule", scope: "adapted", text: "Applies to beta text only.\n", lint: "None." });
  Object.assign(spec.files, { "plugin/skills/solo/SKILL.md": "---\nname: solo\ndescription: solo\n---\nsolo\n", "CHANGELOG.md": "# Changelog\n\n## [Unreleased]\n" });
  const c = checkout(up, spec);
  try {
    const file = join(f.dir, "drop.json");
    writeFileSync(file, JSON.stringify({ upstreams: [{ action: "drop", upstream: "beta", house_style: ["fx-beta-rule"] }], changelog: ["Drop the beta Upstream."] }));
    const before = state(c.root);
    const refused = await f.run(c.root, ["prepare", "--decisions", file]);
    expect(refused.code).toBe(2); expect(JSON.parse(refused.stdout).reason).toContain("delete plugin/skills/solo before prepare"); expect(state(c.root)).toEqual(before);
    rmSync(join(c.root, "plugin/skills/solo"), { recursive: true });
    const r = await f.run(c.root, ["prepare", "--decisions", file]); expect(r.code).toBe(0); expect(r.plan.level).toBe("major");
    expect(Object.keys((Bun.YAML.parse(read(c.root, "pins.yaml")) as any).upstreams)).toEqual(["alpha"]);
    expect(register(c.root).items.filter((row: any) => row.upstream === "beta")).toEqual([]);
    expect(register(c.root).items.find((row: any) => row.id === "alpha/shared-a").artifacts).toEqual(["plugin/skills/shared"]);
    const style = Bun.YAML.parse(read(c.root, "house-style.yaml")) as any;
    expect(style.replacements.map((row: any) => row.id)).not.toContain("fx-beta"); expect(style.rules.map((rule: any) => rule.id)).not.toContain("fx-beta-rule");
    expect(JSON.parse(read(c.root, r.plan.note)).entries).toEqual(["Drop the beta Upstream."]);
    const checked = await c.run(); expect(checked.json!.failures).toEqual([]); expect(checked.code).toBe(0);
  } finally { rmSync(up.dir, { recursive: true, force: true }); rmSync(c.root, { recursive: true, force: true }); }
}, 30000);
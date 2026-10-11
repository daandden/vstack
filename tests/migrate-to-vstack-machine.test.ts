// Migration's public CLI seam: processes over fake HOME, real git, no user config.
import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { git } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "../plugin/skills/setup-vstack/scripts/migrate.ts");
const MACHINE = join(import.meta.dir, "../plugin/skills/setup-vstack/scripts/machine.ts");
const dirs: string[] = [];
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
function put(path: string, text: string) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); }
function home() {
  const h = realpathSync(mkdtempSync(join(tmpdir(), "vstack-migration-"))); dirs.push(h); return h;
}
function repo(h: string, name = "repo", extra: string[] = []) {
  const r = join(h, name); mkdirSync(r, { recursive: true }); git(r, "init", "-q", ...extra);
  put(join(r, "README"), "repo"); git(r, "add", "README"); git(r, "commit", "-qm", "initial"); return r;
}
function run(h: string, args: string[], env = {}, script = SCRIPT) {
  const r = Bun.spawnSync([process.execPath, script, ...args], {
    cwd: h, env: { PATH: process.env.PATH!, HOME: h, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", ...env },
    stdout: "pipe", stderr: "pipe",
  });
  return { code: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString(), json: () => JSON.parse(r.stdout.toString()) };
}
function store(common: string) {
  put(join(common, "matt-pocock/docs-agents/issue-tracker.md"), `Hand edited fork. ${common}/matt-pocock/docs-agents/domain.md\n.git/matt-pocock/artifacts/ticket\n`);
  put(join(common, "matt-pocock/claims/claim.json"), '{"hand":"kept"}');
}

test("a private repo and its linked worktree have one move, exact rewrites and no compatibility link", () => {
  const h = home(), r = repo(h), common = join(r, ".git"), wt = join(h, "linked");
  git(r, "worktree", "add", "-qb", "linked", wt); store(common);
  mkdirSync(join(r, "docs")); mkdirSync(join(wt, "docs"));
  symlinkSync(join(common, "matt-pocock/docs-agents"), join(r, "docs/agents"));
  symlinkSync(join(common, "matt-pocock/docs-agents"), join(wt, "docs/agents"));
  put(join(common, "info/exclude"), "# hand edit\n/docs/agents/\nkeep-this\n");
  put(join(h, ".agents/rules/matt-pocock-private-config.md"), "Old private rule");
  const p = run(h, ["plan", "--scan-root", h]); expect(p.code).toBe(0);
  expect(p.json().items.filter((i: any) => i.kind === "private-move")).toHaveLength(1);
  const a = run(h, ["apply", "--scan-root", h]); expect(a.code).toBe(0);
  expect(a.json().message).toContain("new session");
  expect(readFileSync(join(common, "vstack/config/issue-tracker.md"), "utf8")).toBe(`Hand edited fork. ${common}/vstack/config/domain.md\n.git/vstack/artifacts/ticket\n`);
  expect(readFileSync(join(common, "vstack/claims/claim.json"), "utf8")).toBe('{"hand":"kept"}');
  for (const path of [join(common, "matt-pocock"), join(r, "docs/agents"), join(wt, "docs/agents"), join(h, ".agents/rules/matt-pocock-private-config.md")]) expect(existsSync(path)).toBe(false);
  expect(readFileSync(join(common, "info/exclude"), "utf8")).toBe("# hand edit\nkeep-this\n");
  expect(run(h, ["plan", "--scan-root", h]).json().items).toEqual([]);
});

function fakeOmp(h: string) {
  const bin = join(h, "bin"), path = join(bin, "omp");
  put(path, `#!${process.execPath}\nconst a = process.argv.slice(2);\nif (a[0] === "config") console.log(JSON.stringify({modelRoles:{value:{judge:"typesafe/jev-latest"}},"task.isolation.enabled":{value:true},"worktree.clone":{value:true}}));\nelse console.log("{}");\n`);
  Bun.spawnSync(["chmod", "+x", path]); return { PATH: bin + ":" + process.env.PATH };
}

test("a failed private move keeps the old rule and check 6 failing; a mandatory move cannot be deselected", () => {
  const h = home(), r = repo(h), c = join(r, ".git"); store(c);
  // An existing vstack destination forces the real rename contract to fail, without a test-only hook.
  put(join(c, "vstack/config/issue-tracker.md"), "vstack wins");
  put(join(h, ".agents/rules/matt-pocock-private-config.md"), "private rule");
  const plan = run(h, ["plan", "--scan-root", h]).json();
  const cannotSkip = run(h, ["apply", "--scan-root", h, "--skip", plan.items[0].id]);
  expect(cannotSkip.code).toBe(2); expect(cannotSkip.stderr).toContain("cannot deselect mandatory");
  const a = run(h, ["apply", "--scan-root", h]); expect(a.code).toBe(1);
  expect(a.json().failures[0].error).toContain("already exists");
  expect(existsSync(join(h, ".agents/rules/matt-pocock-private-config.md"))).toBe(true);
  expect(existsSync(join(c, "matt-pocock/docs-agents"))).toBe(true);
  expect(readFileSync(join(c, "vstack/config/issue-tracker.md"), "utf8")).toBe("vstack wins");
  const check = run(h, ["--extension-loaded", "yes", "--scan-root", h], fakeOmp(h), MACHINE);
  expect(check.code).toBe(1); expect(check.stdout).toContain("FAIL 6 Matt leftovers");
});

const MATT_NAMES = ["ask-matt", "diagnosing-bugs", "grill-with-docs", "triage", "improve-codebase-architecture", "setup-matt-pocock-skills", "tdd", "to-spec", "to-tickets", "wayfinder", "implement", "prototype", "research", "domain-modeling", "codebase-design", "code-review", "resolving-merge-conflicts", "wizard", "grill-me", "grilling", "handoff", "teach", "to-questionnaire", "wait-what", "writing-for-agents"];
function installedSkills(h: string) {
  const skills: Record<string, any> = {};
  for (const [source, names] of [["mattpocock/skills", MATT_NAMES], ["cathrynlavery/diagram-design", ["diagram-design"]], ["vojtaholik/good-css", ["good-css"]], ["kepano/obsidian-skills", ["obsidian-markdown"]]] as [string, string[]][]) {
    for (const name of names) {
      skills[name] = { source, sourceType: "github", sourceUrl: `https://github.com/${source}.git`, skillPath: `skills/${name}/SKILL.md`, skillFolderHash: "fixture", installedAt: "2026-09-24T00:00:00Z", updatedAt: "2026-09-24T00:00:00Z" };
      put(join(h, ".agents/skills", name, "SKILL.md"), `---\nname: ${name}\n---\nMatt main hand copy\n`);
      mkdirSync(join(h, ".claude/skills"), { recursive: true }); symlinkSync(join(h, ".agents/skills", name), join(h, ".claude/skills", name));
    }
  }
  put(join(h, ".agents/.skill-lock.json"), JSON.stringify({ version: 3, skills, dismissed: { untouched: true } }));
}
function skillsCli(h: string) {
  const script = join(h, "bin/skills");
  put(script, `#!${process.execPath}\nimport {readFileSync,writeFileSync,rmSync} from "node:fs"; import {join} from "node:path";\nconst args = process.argv.slice(2); if (args[0]!=="remove" || args[1]!=="-g" || args.at(-1)!=="-y") process.exit(2);\nconst h=process.env.HOME; const lock=process.env.XDG_STATE_HOME ? join(process.env.XDG_STATE_HOME,"skills/.skill-lock.json") : join(h,".agents/.skill-lock.json"); const doc=JSON.parse(readFileSync(lock,"utf8"));\nwriteFileSync(join(h,"skills-call.json"), JSON.stringify(args));\nfor(const name of args.slice(2,-1)){ rmSync(join(h,".agents/skills",name),{recursive:true,force:true}); rmSync(join(h,".claude/skills",name),{force:true}); delete doc.skills[name]; }\nwriteFileSync(lock,JSON.stringify(doc));\n`);
  Bun.spawnSync(["chmod", "+x", script]); return { VSTACK_SKILLS_CLI: script };
}

test("machine smoke: 25 Matt skills, diagram/css copies, private repo, linked checkout, submodule, separate git dir, rules and profiles migrate", () => {
  const h = home(), r = repo(h), common = join(r, ".git"), wt = join(h, "linked");
  git(r, "worktree", "add", "-qb", "linked", wt); store(common);
  const source = repo(h, "source"); git(r, "-c", "protocol.file.allow=always", "submodule", "add", "-q", source, "sub");
  const sub = join(common, "modules/sub"), separate = join(h, "separate-git-dir"); repo(h, "separate", ["--separate-git-dir", separate]);
  for (const c of [sub, separate]) { store(c); put(join(c, "matt-pocock/docs-agents/issue-tracker.md"), `Custom fork. ${c}/matt-pocock/docs-agents/domain.md\n${c}/matt-pocock/artifacts/ticket\n`); }
  installedSkills(h); const env = skillsCli(h);
  put(join(h, ".agents/rules/matt-pocock-private-config.md"), "Private rule");
  const rule = join(h, ".omp/agent/rules/custom.md");
  put(rule, `Run /setup-matt-pocock-skills. Use ask-matt. Keep docs/agents/issue-tracker.md.\n${sub}/matt-pocock/docs-agents/domain.md\n`);
  put(join(h, ".diagram-design/profiles/plain.md"), "hand profile");
  const p = run(h, ["plan", "--scan-root", h]); expect(p.code).toBe(0);
  const plan = p.json(); expect(plan.items.filter((i: any) => i.kind === "private-move")).toHaveLength(3);
  expect(plan.items.find((i: any) => i.kind === "skills-remove").names).toHaveLength(27);
  expect(plan.items.find((i: any) => i.kind === "rule-rewrite").changes[0].diff).toContain("+Run /skill:setup-vstack. Use ask-vstack.");
  expect(plan.notices.join(" ")).toContain("downgrade");
  const saved = join(h, "approved-plan.json"); put(saved, p.stdout);
  const a = run(h, ["apply", "--plan", saved], env); expect(a.code).toBe(0); expect(a.json().complete).toBe(true);
  for (const c of [common, sub, separate]) { expect(existsSync(join(c, "matt-pocock"))).toBe(false); expect(existsSync(join(c, "vstack/config/issue-tracker.md"))).toBe(true); }
  expect(readFileSync(join(sub, "vstack/config/issue-tracker.md"), "utf8")).toBe(`Custom fork. ${sub}/vstack/config/domain.md\n${sub}/vstack/artifacts/ticket\n`);
  expect(readFileSync(rule, "utf8")).toBe(`Run /skill:setup-vstack. Use ask-vstack. Keep docs/vstack/issue-tracker.md.\n${sub}/vstack/config/domain.md\n`);
  const lock = JSON.parse(readFileSync(join(h, ".agents/.skill-lock.json"), "utf8")); expect(Object.keys(lock.skills)).toEqual(["obsidian-markdown"]); expect(lock.dismissed.untouched).toBe(true);
  for (const name of [...MATT_NAMES, "diagram-design", "good-css"]) { expect(existsSync(join(h, ".agents/skills", name))).toBe(false); expect(existsSync(join(h, ".claude/skills", name))).toBe(false); }
  expect(existsSync(join(h, ".agents/skills/obsidian-markdown"))).toBe(true);
  expect(readFileSync(join(h, ".vstack/diagram-design/profiles/plain.md"), "utf8")).toBe("hand profile");
  expect(run(h, ["plan", "--scan-root", h]).json().items).toEqual([]);
  const check = run(h, ["--extension-loaded", "yes", "--scan-root", h], fakeOmp(h), MACHINE);
  expect(check.code).toBe(0); expect(check.stdout.trim().split("\n")).toHaveLength(1); expect(check.stdout).toContain("6 Matt leftovers");
});

test("non-ordinary common dirs keep relative forms and bare prose as manual hits, including on the next check", () => {
  const h = home(), c = join(h, "git-storage"); repo(h, "separate", ["--separate-git-dir", c]); store(c);
  const file = join(c, "matt-pocock/docs-agents/notes.md");
  put(file, `${c}/matt-pocock/docs-agents/x\n${c}/matt-pocock-backup/x\n.git/matt-pocock/docs-agents/x\nAppend /matt-pocock. Keep configuration in docs-agents/.\n`);
  const p = run(h, ["plan", "--scan-root", h]).json();
  expect(p.items[0].relative_rows).toBe(false);
  expect(p.items[0].manual_hits.some((hit: any) => hit.text === ".git/matt-pocock/docs-agents/x")).toBe(true);
  const a = run(h, ["apply", "--scan-root", h]); expect(a.code).toBe(1);
  expect(readFileSync(join(c, "vstack/config/notes.md"), "utf8")).toBe(`${c}/vstack/config/x\n${c}/matt-pocock-backup/x\n.git/matt-pocock/docs-agents/x\nAppend /matt-pocock. Keep configuration in docs-agents/.\n`);
  const remaining = run(h, ["plan", "--scan-root", h]).json(); expect(remaining.items.length).toBeGreaterThan(0);
  expect(run(h, ["--extension-loaded", "yes", "--scan-root", h], fakeOmp(h), MACHINE).stdout).toContain("FAIL 6 Matt leftovers");
});

test("Cancel changes nothing, Choose items skips only optional work, and stale approval is refused", () => {
  const h = home(), r = repo(h), c = join(r, ".git"); store(c); installedSkills(h);
  const rule = join(h, ".agents/rules/custom.md"); put(rule, "ask-matt\n");
  const p = run(h, ["plan", "--scan-root", h]); const saved = join(h, "plan.json"); put(saved, p.stdout);
  expect(run(h, ["cancel"]).json().applied).toEqual([]); expect(existsSync(join(c, "matt-pocock"))).toBe(true);
  put(rule, "changed ask-matt\n");
  const stale = run(h, ["apply", "--plan", saved]); expect(stale.code).toBe(2); expect(stale.stderr).toContain("state changed");
  expect(existsSync(join(c, "matt-pocock"))).toBe(true);
  const a = run(h, ["apply", "--scan-root", h, "--skip", "global-skills", "--skip", `rule:${rule}`]);
  expect(a.code).toBe(1); expect(existsSync(join(c, "vstack/config"))).toBe(true);
  expect(existsSync(join(h, ".agents/skills/tdd"))).toBe(true); expect(readFileSync(rule, "utf8")).toBe("changed ask-matt\n");
});

test("the scan prunes Library, .venv and node_modules, deduplicates overlapping roots, and reports missing roots", () => {
  const h = home();
  for (const name of ["Library", ".venv", "node_modules"]) { const r = repo(h, `${name}/repo`); store(join(r, ".git")); }
  const r = repo(h); store(join(r, ".git"));
  put(join(r, "docs/agents/issue-tracker.md"), "Standard hand edit\n");
  const p = run(h, ["plan", "--scan-root", h, "--scan-root", r]).json();
  expect(p.items.filter((i: any) => i.kind === "private-move")).toHaveLength(1); expect(p.standard_projects).toEqual([r]);
  const missing = run(h, ["plan", "--scan-root", join(h, "missing")]); expect(missing.code).toBe(1); expect(missing.json().scan_errors).toHaveLength(1);
  const apply = run(h, ["apply", "--scan-root", join(h, "missing")]); expect(apply.code).toBe(2); expect(apply.stderr).toContain("Scan incomplete");
  expect(readFileSync(join(r, "docs/agents/issue-tracker.md"), "utf8")).toBe("Standard hand edit\n");
});

test("all four global rule locations get proposed diffs; whole-name matching and unrelated skills are preserved", () => {
  const h = home(), paths = [".agents/rules/test.md", ".omp/agent/rules/test.md", ".omp/agent/AGENTS.md", ".claude/CLAUDE.md"];
  for (const p of paths) put(join(h, p), "## Agent skills\nRun /setup-matt-pocock-skills and ask-matt. ask-matt-extra stays. docs/agents/config.md\n");
  const p = run(h, ["plan"]).json(); expect(p.items).toHaveLength(4);
  for (const item of p.items) expect(item.changes[0].diff).toContain("+Run /skill:setup-vstack and ask-vstack. ask-matt-extra stays. docs/vstack/config.md");
  expect(run(h, ["apply"]).code).toBe(0);
  for (const p of paths) expect(readFileSync(join(h, p), "utf8")).toBe("## vstack\nRun /skill:setup-vstack and ask-vstack. ask-matt-extra stays. docs/vstack/config.md\n");
});

test("a profile move failure also retains the old rule; a skill removal failure warns without blocking private moves", () => {
  const h = home(), r = repo(h), c = join(r, ".git"); store(c); installedSkills(h);
  put(join(h, ".agents/rules/matt-pocock-private-config.md"), "rule");
  put(join(h, ".diagram-design/profiles/old.md"), "old"); put(join(h, ".vstack/diagram-design/profiles/new.md"), "new");
  const failCli = join(h, "bin/fail-cli"); put(failCli, "#!/bin/sh\nexit 1\n"); Bun.spawnSync(["chmod", "+x", failCli]);
  const a = run(h, ["apply"], { VSTACK_SKILLS_CLI: failCli }); expect(a.code).toBe(1);
  expect(a.json().warnings).toHaveLength(1); expect(existsSync(join(c, "vstack/config"))).toBe(true);
  expect(existsSync(join(h, ".agents/rules/matt-pocock-private-config.md"))).toBe(true);
  expect(existsSync(join(h, ".diagram-design/profiles/old.md"))).toBe(true);
});

test("a filesystem rename failure rolls back rewrites and config naming and keeps the old rule", () => {
  const h = home(), r = repo(h), c = join(r, ".git"); store(c);
  put(join(h, ".agents/rules/matt-pocock-private-config.md"), "rule");
  const before = readFileSync(join(c, "matt-pocock/docs-agents/issue-tracker.md"), "utf8");
  Bun.spawnSync(["chmod", "555", c]);
  let a: ReturnType<typeof run>;
  try { a = run(h, ["apply"]); } finally { Bun.spawnSync(["chmod", "755", c]); }
  expect(a!.code).toBe(1); expect(a!.json().failures[0].error).toContain("EACCES");
  expect(readFileSync(join(c, "matt-pocock/docs-agents/issue-tracker.md"), "utf8")).toBe(before);
  expect(existsSync(join(c, "vstack"))).toBe(false); expect(existsSync(join(h, ".agents/rules/matt-pocock-private-config.md"))).toBe(true);
});

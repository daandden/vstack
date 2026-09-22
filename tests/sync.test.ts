import { expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "vstack-sync-test-"));
  const git = (cwd: string, ...args: string[]) => {
    const result = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
    if (result.exitCode) throw new Error(result.stderr.toString());
    return result.stdout.toString().trim();
  };
  const save = (path: string, content: string) => {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content);
  };
  const upstreams = Object.fromEntries(["matt", "pstack"].map(id => {
    const dir = join(root, "upstreams", id);
    mkdirSync(dir, { recursive: true });
    git(dir, "init", "-q");
    git(dir, "config", "user.email", "fixture@example.invalid");
    git(dir, "config", "user.name", "Sync Fixture");
    save(join(dir, "LICENSE"), "Fixture license\n");
    save(join(dir, "skills", id, "SKILL.md"), `---\nname: ${id}\ndescription: Deterministic ${id} fixture\n---\nRead resource.txt when explicitly requested.\n`);
    save(join(dir, "skills", id, "resource.txt"), "Original resource\n");
    save(join(dir, "skills", id, "agents/openai.yaml"), "interface:\n  display_name: Original\n");
    git(dir, "add", "."); git(dir, "commit", "-qm", "Initial fixture"); git(dir, "tag", "v1.0.0");
    return [id, dir];
  }));
  cpSync(resolve("scripts"), join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "overlays"));
  const lock = { version: 1, sources: ["matt", "pstack"].map(id => ({ id, url: upstreams[id]!, tag: id === "matt" ? "v1.0.0" : null, sha: git(upstreams[id]!, "rev-parse", "HEAD"), approval: "Fixture starting approval", allowlist: ["LICENSE", "skills"], license: "LICENSE", patches: [] })), skills: ["matt", "pstack"].map(id => ({ name: id, source: id, path: `skills/${id}` })), additions: [] };
  save(join(root, "config/sources.lock.json"), JSON.stringify(lock));
  save(join(root, "config/inventory.json"), JSON.stringify(["matt", "pstack"].map(id => ({ source: id, path: `skills/${id}/SKILL.md`, status: "installed", targets: [id], owner: "#15" }))));
  const run = (...args: string[]) => Bun.spawnSync(["bun", "scripts/stack.ts", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const ok = (...args: string[]) => {
    const result = run(...args);
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
    return result.stdout.toString();
  };
  const commit = (id: string, tag?: string) => {
    git(upstreams[id]!, "add", "."); git(upstreams[id]!, "commit", "--allow-empty", "-qm", "Fixture transition");
    if (tag) git(upstreams[id]!, "tag", tag);
    return git(upstreams[id]!, "rev-parse", "HEAD");
  };
  const active = () => JSON.parse(readFileSync(join(root, "generated/current/provenance.json"), "utf8"));
  const workspace = join(root, "workspace");
  save(join(workspace, ".omp/skills/local-only/SKILL.md"), "---\nname: local-only\ndescription: Preserve local work\n---\nLocal instructions.\n");
  const discover = () => {
    const result = Bun.spawnSync(["omp", "--mode", "rpc", "--no-extensions", "--no-lsp", "--no-rules", "--no-session"], { cwd: workspace, stdin: Buffer.from('{"id":"discovery","type":"get_available_commands"}\n'), stdout: "pipe", stderr: "pipe", timeout: 30000 });
    expect(result.exitCode).toBe(0);
    const response = result.stdout.toString().split("\n").filter(line => line.startsWith("{")).map(line => JSON.parse(line)).find(frame => frame.id === "discovery");
    expect(response.success).toBe(true);
    const commands = response.data.commands.map((command: { name: string }) => command.name);
    expect(commands).toContain("skill:matt"); expect(commands).toContain("skill:pstack"); expect(commands).toContain("skill:local-only");
    expect(commands).not.toContain("skill:poteto-mode");
  };
  ok("build"); ok("install", workspace);
  return { root, git, save, upstreams, run, ok, commit, active, discover, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("explicit sync selects the highest stable tag and activates verified UI metadata without instructions changing", () => {
  const f = fixture();
  try {
    f.save(join(f.upstreams.matt!, "skills/matt/agents/openai.yaml"), "interface:\n  display_name: Updated\n");
    const stable = f.commit("matt", "v1.10.0");
    f.commit("matt", "v1.9.0");
    f.save(join(f.upstreams.matt!, "skills/matt/resource.txt"), "Prerelease instructions\n");
    f.commit("matt", "v2.0.0-rc.1");
    const old = f.active().lock.sources[0].sha;
    f.ok("build"); expect(f.active().lock.sources[0].sha).toBe(old);
    const candidate = JSON.parse(f.ok("sync", "prepare", "matt"));
    expect(candidate.next.sha).toBe(stable);
    expect(f.active().lock.sources[0].sha).toBe(old);
    f.ok("sync", "activate", candidate.id);
    expect(f.active().lock.sources[0].sha).toBe(stable);
    expect(readFileSync(join(f.root, "generated/current/skills/matt/resource.txt"), "utf8")).toBe("Original resource\n");
    f.discover();
  } finally { f.cleanup(); }
}, 60000);


function decision(f: ReturnType<typeof fixture>, candidate: { id: string; fingerprint: string; changes: { path: string }[]; adaptations: string[] }) {
  const path = join(f.root, "review.json");
  f.save(path, JSON.stringify({ candidate: candidate.fingerprint, reference: "Fixture maintainer approval", verification: "Reviewed the complete upstream diff and exercised changed resources in the isolated candidate.", changes: Object.fromEntries(candidate.changes.map(change => [change.path, "Reviewed intended fixture change; retained invocation and publication limits."])), adaptations: Object.fromEntries(candidate.adaptations.map(path => [path, "Overlay remains semantically compatible with upstream changes."])) }));
  f.ok("sync", "approve", candidate.id, path);
}

test("a mixed transition stays pending as a whole, and changed candidate resources invalidate approval", () => {
  const f = fixture();
  try {
    const old = f.active().lock.sources[0].sha;
    f.save(join(f.upstreams.matt!, "skills/matt/agents/openai.yaml"), "interface:\n  display_name: Mixed update\n");
    f.save(join(f.upstreams.matt!, "skills/matt/resource.txt"), "Reviewed behavior\n");
    const sha = f.commit("matt", "v1.1.0");
    const candidate = JSON.parse(f.ok("sync", "prepare", "matt"));
    expect(f.run("sync", "activate", candidate.id).exitCode).not.toBe(0);
    expect(f.active().lock.sources[0].sha).toBe(old);
    expect(readFileSync(join(f.root, "generated/current/skills/matt/agents/openai.yaml"), "utf8")).toContain("Original");
    f.discover();
    decision(f, candidate);
    const resource = join(f.root, "generated/candidates", candidate.id, "input/generated/current/skills/matt/resource.txt");
    f.save(resource, "Unreviewed behavior\n");
    expect(f.run("sync", "activate", candidate.id).exitCode).not.toBe(0);
    expect(f.active().lock.sources[0].sha).toBe(old);
    const renewed = JSON.parse(f.ok("sync", "prepare", "matt"));
    decision(f, renewed); f.ok("sync", "activate", renewed.id);
    expect(f.active().lock.sources[0].sha).toBe(sha);
    expect(JSON.parse(readFileSync(join(f.root, "config/sources.lock.json"), "utf8")).sources[0].sha).toBe(sha);
    expect(readFileSync(join(f.root, "generated/current/skills/matt/resource.txt"), "utf8")).toBe("Reviewed behavior\n");
    const record = readFileSync(join(f.root, renewed.record), "utf8");
    expect(record).toContain(old); expect(record).toContain(sha); expect(record).toContain("Fixture maintainer approval");
    f.ok("build"); f.discover();
  } finally { f.cleanup(); }
}, 60000);

test("a pending Matt transition does not block an independently nominated and approved Pstack commit", () => {
  const f = fixture();
  try {
    const old = f.active().lock.sources.map((source: { sha: string }) => source.sha);
    f.save(join(f.upstreams.matt!, "skills/matt/resource.txt"), "Pending Matt instructions\n"); f.commit("matt", "v1.1.0");
    const matt = JSON.parse(f.ok("sync", "prepare", "matt"));
    f.save(join(f.upstreams.pstack!, "skills/pstack/resource.txt"), "Approved Pstack instructions\n"); const sha = f.commit("pstack");
    expect(f.run("sync", "prepare", "pstack").exitCode).not.toBe(0);
    expect(f.run("sync", "prepare", "pstack", sha.slice(0, 12)).exitCode).not.toBe(0);
    const pstack = JSON.parse(f.ok("sync", "prepare", "pstack", sha));
    expect(f.run("sync", "activate", pstack.id).exitCode).not.toBe(0);
    decision(f, pstack); f.ok("sync", "activate", pstack.id);
    expect(f.active().lock.sources.map((source: { sha: string }) => source.sha)).toEqual([old[0], sha]);
    expect(f.run("sync", "activate", matt.id).exitCode).not.toBe(0);
    expect(readFileSync(join(f.root, "generated/current/skills/matt/resource.txt"), "utf8")).toBe("Original resource\n");
    expect(readFileSync(join(f.root, "generated/current/skills/pstack/resource.txt"), "utf8")).toBe("Approved Pstack instructions\n");
    f.discover();
  } finally { f.cleanup(); }
}, 60000);

test("ambiguous names stop selection and moved accepted tags require whole-transition approval", () => {
  const f = fixture();
  try {
    const old = f.active().lock.sources[0].sha;
    f.commit("matt", "1.1.0");
    expect(f.run("sync", "prepare", "matt").exitCode).not.toBe(0);
    expect(f.active().lock.sources[0].sha).toBe(old);
    f.git(f.upstreams.matt!, "tag", "-d", "1.1.0");
    const moved = f.commit("matt"); f.git(f.upstreams.matt!, "tag", "-f", "v1.0.0");
    const candidate = JSON.parse(f.ok("sync", "prepare", "matt"));
    expect(f.run("sync", "activate", candidate.id).exitCode).not.toBe(0);
    expect(f.active().lock.sources[0].sha).toBe(old);
    decision(f, candidate); f.ok("sync", "activate", candidate.id);
    expect(f.active().lock.sources[0].sha).toBe(moved);
    f.ok("build"); f.discover();
  } finally { f.cleanup(); }
}, 60000);

test("clean patches still need semantic review, while conflicts and invalid candidates preserve the old stack", () => {
  const f = fixture();
  try {
    const lockPath = join(f.root, "config/sources.lock.json");
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    lock.sources[0].patches = ["overlays/matt.patch"];
    f.save(lockPath, JSON.stringify(lock));
    f.save(join(f.root, "overlays/matt.patch"), "diff --git a/skills/matt/resource.txt b/skills/matt/resource.txt\n--- a/skills/matt/resource.txt\n+++ b/skills/matt/resource.txt\n@@ -1 +1 @@\n-Original resource\n+Locally adapted resource\n");
    f.ok("build");
    const old = f.active().lock.sources[0].sha;
    f.save(join(f.upstreams.matt!, "skills/matt/agents/openai.yaml"), "interface:\n  display_name: New UI\n"); f.commit("matt", "v1.1.0");
    const clean = JSON.parse(f.ok("sync", "prepare", "matt"));
    expect(f.run("sync", "activate", clean.id).exitCode).not.toBe(0);
    const reviewPath = join(f.root, "incomplete-review.json");
    f.save(reviewPath, JSON.stringify({ candidate: clean.fingerprint, reference: "Incomplete approval", verification: "Discovery only", changes: Object.fromEntries(clean.changes.map((change: { path: string }) => [change.path, "Reviewed"])), adaptations: {} }));
    expect(f.run("sync", "approve", clean.id, reviewPath).exitCode).not.toBe(0);
    f.save(join(f.upstreams.matt!, "skills/matt/resource.txt"), "Conflicting upstream instructions\n"); f.commit("matt", "v1.2.0");
    expect(f.run("sync", "prepare", "matt").exitCode).not.toBe(0);
    expect(f.active().lock.sources[0].sha).toBe(old);
    expect(readFileSync(join(f.root, "generated/current/skills/matt/resource.txt"), "utf8")).toBe("Locally adapted resource\n");
    f.save(join(f.upstreams.matt!, "skills/matt/resource.txt"), "Original resource\n");
    f.save(join(f.upstreams.matt!, "skills/matt/SKILL.md"), "Not discoverable metadata\n"); f.commit("matt", "v1.3.0");
    expect(f.run("sync", "prepare", "matt").exitCode).not.toBe(0);
    expect(f.active().lock.sources[0].sha).toBe(old);
    f.discover();
  } finally { f.cleanup(); }
}, 60000);

test("sync refuses to treat unbuilt local selection changes as an automatic upstream update", () => {
  const f = fixture();
  try {
    const old = f.active().lock.sources[0].sha;
    const lockPath = join(f.root, "config/sources.lock.json");
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    lock.additions.push({ name: "unreviewed", path: "unreviewed" });
    f.save(lockPath, JSON.stringify(lock));
    f.save(join(f.root, "overlays/additions/unreviewed/SKILL.md"), "---\nname: unreviewed\ndescription: Unbuilt local workflow\n---\nLocal behavioral change.\n");
    f.commit("matt", "v1.1.0");
    expect(f.run("sync", "prepare", "matt").exitCode).not.toBe(0);
    expect(f.active().lock.sources[0].sha).toBe(old);
    f.discover();
  } finally { f.cleanup(); }
}, 60000);

test("failed OMP verification cannot activate an approved candidate or advance its pin", () => {
  const f = fixture();
  try {
    const old = f.active().lock.sources[0].sha;
    f.save(join(f.upstreams.matt!, "skills/matt/resource.txt"), "Requires verified activation\n"); f.commit("matt", "v1.1.0");
    const candidate = JSON.parse(f.ok("sync", "prepare", "matt")); decision(f, candidate);
    const result = Bun.spawnSync([process.execPath, "scripts/stack.ts", "sync", "activate", candidate.id], { cwd: f.root, env: { ...process.env, PATH: "/usr/bin:/bin" }, stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("omp");
    expect(f.active().lock.sources[0].sha).toBe(old);
    expect(JSON.parse(readFileSync(join(f.root, "config/sources.lock.json"), "utf8")).sources[0].sha).toBe(old);
    expect(readFileSync(join(f.root, "generated/current/skills/matt/resource.txt"), "utf8")).toBe("Original resource\n");
    f.discover();
  } finally { f.cleanup(); }
}, 60000);

test("stable SemVer build metadata is eligible but equal-precedence tags need a source-policy decision", () => {
  const f = fixture();
  try {
    const sha = f.commit("matt", "v1.1.0+build.7");
    const candidate = JSON.parse(f.ok("sync", "prepare", "matt"));
    expect(candidate.next.sha).toBe(sha);
    f.git(f.upstreams.matt!, "tag", "v1.1.0+build.8");
    expect(f.run("sync", "prepare", "matt").exitCode).not.toBe(0);
    f.discover();
  } finally { f.cleanup(); }
}, 60000);

test("rewriting a tag object at the same commit still requires approval", () => {
  const f = fixture();
  try {
    const old = f.active().lock.sources[0].sha;
    f.git(f.upstreams.matt!, "tag", "-f", "-a", "v1.0.0", "-m", "Rewritten tag identity");
    const candidate = JSON.parse(f.ok("sync", "prepare", "matt"));
    expect(f.run("sync", "activate", candidate.id).exitCode).not.toBe(0);
    expect(f.active().lock.sources[0].sha).toBe(old);
    decision(f, candidate); f.ok("sync", "activate", candidate.id);
    expect(f.active().lock.sources[0].sha).toBe(old);
    expect(f.run("sync", "prepare", "matt").exitCode).not.toBe(0);
    f.discover();
  } finally { f.cleanup(); }
}, 60000);

test("a conflicting overlay can be rebased in isolation without changing the accepted stack", () => {
  const f = fixture();
  try {
    const lockPath = join(f.root, "config/sources.lock.json");
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    lock.sources[0].patches = ["overlays/matt.patch"];
    f.save(lockPath, JSON.stringify(lock));
    const patch = (before: string, after: string) => `diff --git a/skills/matt/resource.txt b/skills/matt/resource.txt\n--- a/skills/matt/resource.txt\n+++ b/skills/matt/resource.txt\n@@ -1 +1 @@\n-${before}\n+${after}\n`;
    f.save(join(f.root, "overlays/matt.patch"), patch("Original resource", "Accepted local adaptation"));
    f.ok("build");
    const old = f.active().lock.sources[0].sha;
    f.save(join(f.upstreams.matt!, "skills/matt/resource.txt"), "Changed upstream base\n");
    const sha = f.commit("matt", "v1.1.0");
    expect(f.run("sync", "prepare", "matt").exitCode).not.toBe(0);
    const patches = join(f.root, "rebased");
    f.save(join(patches, "overlays/matt.patch"), patch("Changed upstream base", "Rebased local adaptation"));
    const candidate = JSON.parse(f.ok("sync", "prepare", "matt", "--patches", patches));
    expect(f.active().lock.sources[0].sha).toBe(old);
    expect(readFileSync(join(f.root, "generated/current/skills/matt/resource.txt"), "utf8")).toBe("Accepted local adaptation\n");
    expect(f.run("sync", "activate", candidate.id).exitCode).not.toBe(0);
    decision(f, candidate); f.ok("sync", "activate", candidate.id);
    expect(f.active().lock.sources[0].sha).toBe(sha);
    expect(readFileSync(join(f.root, "generated/current/skills/matt/resource.txt"), "utf8")).toBe("Rebased local adaptation\n");
    f.ok("build"); f.discover();
  } finally { f.cleanup(); }
}, 60000);

test("YAML aliases into unknown instructions cannot bypass whole-transition approval", () => {
  const f = fixture();
  try {
    f.save(join(f.upstreams.matt!, "skills/matt/agents/openai.yaml"), "interface: &ui\n  display_name: First\nunknown_instructions: *ui\n");
    f.commit("matt", "v1.1.0");
    const initial = JSON.parse(f.ok("sync", "prepare", "matt"));
    decision(f, initial); f.ok("sync", "activate", initial.id);
    const old = f.active().lock.sources[0].sha;
    f.save(join(f.upstreams.matt!, "skills/matt/agents/openai.yaml"), "interface: &ui\n  display_name: Changed unknown instructions\nunknown_instructions: *ui\n");
    f.commit("matt", "v1.2.0");
    const candidate = JSON.parse(f.ok("sync", "prepare", "matt"));
    expect(f.run("sync", "activate", candidate.id).exitCode).not.toBe(0);
    expect(f.active().lock.sources[0].sha).toBe(old);
    expect(readFileSync(join(f.root, "generated/current/skills/matt/agents/openai.yaml"), "utf8")).toContain("display_name: First");
    f.discover();
  } finally { f.cleanup(); }
}, 60000);

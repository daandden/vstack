import { afterAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ENV, git } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "flow-page", "scripts", "flow-page.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-private-canonical-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let serial = 0;

function world() {
  const base = join(root, String(serial++));
  const home = join(base, "home");
  const main = join(base, "project");
  const linked = join(base, "linked");
  mkdirSync(home, { recursive: true });
  mkdirSync(main, { recursive: true });
  git(main, "init", "-q", "-b", "main");
  git(main, "commit", "-q", "--allow-empty", "-m", "base");
  git(main, "worktree", "add", "-q", "-b", "feature", linked);
  const shared = join(main, ".git", "vstack");
  mkdirSync(join(shared, "config"), { recursive: true });
  mkdirSync(join(shared, "domain", "adr"), { recursive: true });
  return { base, home, main, linked, shared };
}

function run(w: ReturnType<typeof world>, cwd: string, args: string[], items?: object[]) {
  const r = Bun.spawnSync([process.execPath, SCRIPT, ...args, "--home", w.home, "--session", "01a1aa9c-b610-70af-a82e-e369dacd3759", "--agent", "Impl354"], {
    cwd, env: { ...ENV, HOME: w.home, VSTACK_FLOW_HOST: "off" },
    stdin: items === undefined ? "ignore" : new TextEncoder().encode(JSON.stringify({ version: 1, items })), stdout: "pipe", stderr: "pipe",
  });
  return { code: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}
const ok = (r: ReturnType<typeof run>) => {
  expect(r.stderr).toBe("");
  expect(r.code).toBe(0);
  return JSON.parse(r.stdout);
};
const doc = (extra: object = {}) => ({ kind: "result", ref: "domain", shape: "document", title: "Domain reference", sections: [{ heading: "Scope", blocks: [{ prose: "The private domain document remains the canonical record." }] }], ...extra });
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
function tree(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(files, tree(path));
    else if (entry.name !== ".lock") files[path] = readFileSync(path, "utf8");
  }
  return files;
}

test("main and linked checkouts retain one shared Private canonical identity and historical hashes without copying its contents", () => {
  const w = world();
  const source = join(w.shared, "domain", "GLOSSARY.md");
  const firstBytes = "Private source contents: first secret definition.\n";
  const secondBytes = "Private source contents: revised secret definition.\n";
  writeFileSync(source, firstBytes);
  const opened = ok(run(w, w.main, ["open", "--skill", "research", "--title", "Shared domain"]));
  const made = ok(run(w, w.main, ["submit"], [doc({ canonical: { file: source } })]));
  const read = (cwd: string) => ok(run(w, cwd, ["show", "--flow", opened.flow]));
  const first = read(w.main).stages[0].results[0];
  expect(first.canonical).toEqual({ root: "vstack-domain", file: "GLOSSARY.md", sha256: sha(firstBytes) });
  ok(run(w, w.linked, ["bind", "--flow", opened.flow, "--stage", opened.stage]));
  writeFileSync(source, secondBytes);
  expect(read(w.linked).stages[0].results[0]).toEqual(first);
  ok(run(w, w.linked, ["submit"], [doc({ revises: made.refs.domain })]));
  const revised = read(w.main).stages[0].results[0];
  expect(revised.id).toBe(first.id);
  expect(revised.revision).toBe(2);
  expect(revised.canonical).toEqual({ root: "vstack-domain", file: "GLOSSARY.md", sha256: sha(secondBytes) });
  expect(revised.revisions.map((r: any) => r.canonical)).toEqual([first.canonical, revised.canonical]);
  expect(revised.history[0].canonical).toEqual(first.canonical);
  const explicit = ok(run(w, w.linked, ["submit"], [doc({ canonical: { file: source }, title: "Linked reference" })]));
  expect(read(w.linked).stages[0].results.find((r: any) => r.id === explicit.refs.domain).canonical).toEqual(revised.canonical);
  expect(existsSync(join(w.linked, "GLOSSARY.md"))).toBe(false);
  const persisted = Object.values(tree(w.home)).join("\n");
  expect(persisted).not.toContain(firstBytes.trim());
  expect(persisted).not.toContain(secondBytes.trim());
  expect(readFileSync(source, "utf8")).toBe(secondBytes);
});

test("shared canonical access rejects unrelated files, metadata, non-files and escaping symlinks atomically", () => {
  const w = world();
  const unrelated = world();
  const outside = join(w.base, "outside.md");
  writeFileSync(outside, "Unrelated private contents.\n");
  writeFileSync(join(unrelated.shared, "domain", "GLOSSARY.md"), "Another project's domain.\n");
  writeFileSync(join(w.shared, "config", "domain.md"), "Private configuration.\n");
  mkdirSync(join(w.shared, "domain-other"));
  writeFileSync(join(w.shared, "domain-other", "GLOSSARY.md"), "Not in the admitted domain root.\n");
  symlinkSync(outside, join(w.shared, "domain", "escape.md"));
  symlinkSync(w.base, join(w.shared, "domain", "escape-dir"));
  ok(run(w, w.linked, ["open", "--skill", "research", "--title", "Canonical boundaries"]));
  for (const [path, category] of [
    [outside, /outside/],
    [join(unrelated.shared, "domain", "GLOSSARY.md"), /outside/],
    [join(w.shared, "domain-other", "GLOSSARY.md"), /outside/],
    [join(w.main, ".git", "HEAD"), /outside/],
    [join(w.shared, "config", "domain.md"), /outside/],
    [join(w.shared, "domain", "adr"), /regular file/],
    [join(w.shared, "domain", "missing.md"), /does not exist/],
    [join(w.shared, "domain", "escape.md"), /symlink/],
    [join(w.shared, "domain", "escape-dir", "outside.md"), /symlink/],
  ] as const) {
    const before = tree(w.home);
    const refused = run(w, w.linked, ["submit"], [doc({ ref: "preliminary", title: "Must not commit" }), doc({ canonical: { file: path } })]);
    expect(refused.code).toBe(1);
    expect(refused.stdout).toBe("");
    expect(refused.stderr).toMatch(category);
    expect(tree(w.home)).toEqual(before);
  }
});

test("resolving a shared canonical file grants no new attachment capture permissions", () => {
  const w = world();
  const source = join(w.shared, "domain", "adr", "0001.md");
  writeFileSync(source, "Private decision contents.\n");
  symlinkSync(source, join(w.linked, "decision.md"));
  const opened = ok(run(w, w.linked, ["open", "--skill", "research", "--title", "Reference only"]));
  ok(run(w, w.linked, ["submit"], [doc({ canonical: { file: source } })]));
  for (const path of [source, join(w.linked, "decision.md")]) {
    const before = tree(w.home);
    const refused = run(w, w.linked, ["submit"], [
      { kind: "attachment", ref: "private-file", type: "file", caption: "Private decision", origin: "Shared domain", path },
      doc({ attachments: ["private-file"] }),
    ]);
    expect(refused.code).toBe(1);
    expect(refused.stdout).toBe("");
    expect(refused.stderr).toMatch(/outside|symlink/);
    expect(tree(w.home)).toEqual(before);
  }
  expect(ok(run(w, w.linked, ["show", "--flow", opened.flow])).attachments).toEqual([]);
});

test("a domain directory without Private-mode config is not an admitted shared root", () => {
  const w = world();
  rmSync(join(w.shared, "config"), { recursive: true });
  const source = join(w.shared, "domain", "GLOSSARY.md");
  writeFileSync(source, "Not configured as Private mode.\n");
  ok(run(w, w.linked, ["open", "--skill", "research", "--title", "Standard boundary"]));
  const before = tree(w.home);
  const refused = run(w, w.linked, ["submit"], [doc({ canonical: { file: source } })]);
  expect(refused.code).toBe(1);
  expect(refused.stderr).toMatch(/outside/);
  expect(tree(w.home)).toEqual(before);
});

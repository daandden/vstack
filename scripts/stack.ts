import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export interface Source {
  id: string; url: string; tag: string | null; sha: string; approval: string; tagObject?: string;
  allowlist: string[]; license: string; patches: string[];
}
interface Skill { name: string; source: string; path: string }
export interface Lock { version: number; sources: Source[]; skills: Skill[]; additions: { name: string; path: string }[] }
interface Disposition { source: string; path: string; status: string }

const root = resolve(import.meta.dir, "..");
export function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function within(base: string, path: string): string {
  const target = resolve(base, path);
  check(path && !isAbsolute(path) && relative(base, target) !== ".." && !relative(base, target).startsWith(`..${sep}`) && target !== base, `Unsafe path: ${path}`);
  return target;
}
export function run(args: string[], cwd = root): Buffer {
  const result = Bun.spawnSync(args, { cwd, stdout: "pipe", stderr: "pipe" });
  check(result.exitCode === 0, `${args[0]} failed: ${result.stderr.toString()}`);
  return result.stdout;
}
// Fingerprint bytes, relative names and executable bits; reject links rather than
// letting a source or addition smuggle files from outside its declared boundary.
export function digest(directory: string): string {
  const hash = createHash("sha256");
  function walk(path: string) {
    for (const entry of readdirSync(path).sort()) {
      const file = join(path, entry);
      const stat = lstatSync(file);
      check(!stat.isSymbolicLink(), `Symlink not allowed in input: ${file}`);
      hash.update(JSON.stringify([relative(directory, file), stat.mode & 0o111, stat.isDirectory()]));
      if (stat.isDirectory()) walk(file);
      else { check(stat.isFile(), `Not a regular file: ${file}`); hash.update(readFileSync(file)); }
    }
  }
  walk(directory);
  return hash.digest("hex");
}
function sourceTree(root: string, source: Source, destination: string): void {
  check(/^[a-z][a-z0-9-]*$/.test(source.id), "Invalid source id");
  check(/^[a-f0-9]{40}$/.test(source.sha) && source.approval, `Unapproved pin: ${source.id}`);
  const cache = join(root, ".cache", `${source.id}.git`);
  mkdirSync(dirname(cache), { recursive: true });
  if (!existsSync(cache)) run(["git", "clone", "--bare", source.url, cache]);
  // Never poll upstream on a cached build. Missing objects require an explicit
  // build from a clean cache; source transitions belong to the sync workflow.
  check(run(["git", `--git-dir=${cache}`, "rev-parse", `${source.sha}^{commit}`]).toString().trim() === source.sha, "Pin is not a commit");
  // The accepted SHA is authoritative; moved-tag detection belongs to explicit sync.
  for (const path of source.allowlist) within(destination, path);
  const archive = run(["git", `--git-dir=${cache}`, "archive", source.sha, "--", ...source.allowlist]);
  mkdirSync(destination, { recursive: true });
  const unpack = Bun.spawnSync(["tar", "-x", "-C", destination], { stdin: archive, stderr: "pipe" });
  check(unpack.exitCode === 0, `Cannot unpack ${source.id}: ${unpack.stderr.toString()}`);
  digest(destination);
  check(existsSync(within(destination, source.license)), `Missing license: ${source.id}`);
  const mirror = join(root, "vendor", source.id, source.sha);
  if (existsSync(mirror)) check(digest(mirror) === digest(destination), `Pristine mirror modified: ${mirror}; preserve your edits outside vendor before rebuilding`);
  else { mkdirSync(dirname(mirror), { recursive: true }); cpSync(destination, mirror, { recursive: true }); }
  for (const patch of source.patches) {
    run(["git", "apply", "--check", within(root, patch)], destination);
    run(["git", "apply", within(root, patch)], destination);
  }
}
export function build(root: string): string {
  const lock: Lock = JSON.parse(readFileSync(join(root, "config/sources.lock.json"), "utf8"));
  const inventory: Disposition[] = JSON.parse(readFileSync(join(root, "config/inventory.json"), "utf8"));
  check(lock.version === 1, "Unsupported lock version");
  check(new Set(lock.sources.map(s => s.id)).size === lock.sources.length, "Duplicate source id");
  const scratch = mkdtempSync(join(tmpdir(), "vstack-build-"));
  try {
    const candidate = join(scratch, "release");
    mkdirSync(join(candidate, "skills"), { recursive: true });
    mkdirSync(join(candidate, "licenses"));
    for (const source of lock.sources) {
      const staged = join(scratch, source.id);
      sourceTree(root, source, staged);
      cpSync(within(staged, source.license), join(candidate, "licenses", `${source.id}.txt`));
    }
    const names = new Set<string>();
    const copySkill = (name: string, path: string) => {
      check(/^[a-z][a-z0-9-]*$/.test(name) && !names.has(name), `Invalid or duplicate skill: ${name}`);
      names.add(name);
      digest(path);
      const body = readFileSync(join(path, "SKILL.md"), "utf8");
      const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(body);
      check(frontmatter?.[1], `No frontmatter: ${name}`);
      const metadata = Bun.YAML.parse(frontmatter[1]) as Record<string, unknown>;
      check(metadata.name === name && typeof metadata.description === "string" && metadata.description.trim(), `Invalid discovery metadata: ${name}`);
      const policyPath = join(path, "agents/openai.yaml");
      if (existsSync(policyPath)) {
        const policy = Bun.YAML.parse(readFileSync(policyPath, "utf8")) as { policy?: { allow_implicit_invocation?: boolean } };
        check(policy.policy?.allow_implicit_invocation !== false || metadata["disable-model-invocation"] === true || metadata.disableModelInvocation === true, `Explicit-only policy needs an OMP frontmatter overlay: ${name}`);
      }
      cpSync(path, join(candidate, "skills", name), { recursive: true });
    };
    for (const skill of lock.skills) {
      const source = lock.sources.find(s => s.id === skill.source);
      check(source, `Unknown source: ${skill.source}`);
      check(source.allowlist.some(path => skill.path === path || skill.path.startsWith(`${path}/`)), `Skill outside allowlist: ${skill.name}`);
      check(inventory.some(row => row.source === skill.source && row.path === `${skill.path}/SKILL.md` && row.status === "installed"), `Skill not approved for installation: ${skill.name}`);
      copySkill(skill.name, within(join(scratch, source.id), skill.path));
    }
    for (const addition of lock.additions) copySkill(addition.name, within(join(root, "overlays/additions"), addition.path));
    const provenance = { lock, inventory, patches: lock.sources.flatMap(s => s.patches.map(path => ({ path, sha256: createHash("sha256").update(readFileSync(within(root, path))).digest("hex") }))) };
    writeFileSync(join(candidate, "provenance.json"), JSON.stringify(provenance, null, 2) + "\n");
    const hash = digest(candidate);
    storeRelease(root, candidate, hash);
    publish(root, hash);
    return hash;
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
export function storeRelease(root: string, candidate: string, hash: string): void {
  check(/^[a-f0-9]{64}$/.test(hash), "Invalid release digest");
  const generated = join(root, "generated");
  const release = join(generated, "releases", hash);
  mkdirSync(dirname(release), { recursive: true });
  if (existsSync(release)) check(digest(release) === hash, `Generated release modified: ${release}`);
  else {
    // Copy on the destination filesystem before publishing with rename.
    const incoming = mkdtempSync(join(generated, ".incoming-"));
    try {
      cpSync(candidate, incoming, { recursive: true });
      check(digest(incoming) === hash, "Candidate changed while storing release");
      renameSync(incoming, release);
    }
    finally { rmSync(incoming, { recursive: true, force: true }); }
  }
}
export function publish(root: string, hash: string): void {
  check(/^[a-f0-9]{64}$/.test(hash), "Invalid release digest");
  const generated = join(root, "generated");
  const current = join(generated, "current");
  if (existsSync(current) || (() => { try { lstatSync(current); return true; } catch { return false; } })()) {
    check(lstatSync(current).isSymbolicLink() && /^releases\/[a-f0-9]{64}$/.test(readlinkSync(current)), "Refusing to replace an unowned generated/current");
    check(digest(resolve(generated, readlinkSync(current))) === readlinkSync(current).slice("releases/".length), "Active release modified; preserve edits before activation");
  }
  const next = join(generated, `.current-${process.pid}`);
  try { symlinkSync(`releases/${hash}`, next); renameSync(next, current); }
  finally { rmSync(next, { force: true }); }
}
function object(value: unknown, label: string): Record<string, unknown> {
  check(value !== null && typeof value === "object" && !Array.isArray(value), `Expected mapping: ${label}`);
  return value as Record<string, unknown>;
}
function install(workspace: string): void {
  const skillsPath = join(root, "generated/current/skills");
  check(existsSync(skillsPath), "Run build before install");
  const config = join(resolve(workspace), ".omp/config.yml");
  mkdirSync(dirname(config), { recursive: true });
  check(!existsSync(config) || !lstatSync(config).isSymbolicLink(), "Refusing to replace a linked workspace config");
  const settings = existsSync(config) ? object(Bun.YAML.parse(readFileSync(config, "utf8")) ?? {}, config) : {};
  const skills = settings.skills === undefined ? {} : object(settings.skills, "skills");
  const directories = skills.customDirectories ?? [];
  check(Array.isArray(directories) && directories.every(p => typeof p === "string"), "Invalid skills.customDirectories");
  settings.skills = { ...skills, customDirectories: [skillsPath, ...directories.filter(p => p !== skillsPath)] };
  // Preserve other settings as data; YAML comments are not retained.
  const temp = `${config}.vstack-${process.pid}`;
  try {
    writeFileSync(temp, Bun.YAML.stringify(settings), { flag: "wx", mode: existsSync(config) ? lstatSync(config).mode & 0o777 : 0o600 });
    renameSync(temp, config);
  } finally { rmSync(temp, { force: true }); }
  console.log(`Installed durable skills pointer in ${config}`);
}
if (import.meta.main) {
  let held = false;
  const mutex = join(root, "generated/.writer");
  try {
    mkdirSync(dirname(mutex), { recursive: true });
    mkdirSync(mutex); held = true;
    const [command, ...args] = process.argv.slice(2);
    if (command === "build" && args.length === 0) console.log(`Release ${build(root)}`);
    else if (command === "install" && args.length === 1) install(args[0]!);
    else if (command === "sync") await (await import("./sync")).sync(root, args);
    else throw new Error("Usage: bun scripts/stack.ts build | install <workspace> | sync <prepare|approve|activate|show> ...");
  } catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
  finally { if (held) rmSync(mutex, { recursive: true }); }
}

import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";

function creatorGit() {
  const executable = Bun.which("git");
  if (!executable) fail("Git is absent from the creator's PATH. Select Git 2.54 or later and rerun Private MCP setup.");
  const version = Bun.spawnSync([executable, "--version"], { stdout: "pipe", stderr: "pipe" }).stdout.toString().trim();
  const match = /^git version (\d+)\.(\d+)(?:\.|$)/.exec(version);
  let supported = !!match && (+match[1]! > 2 || (+match[1]! === 2 && +match[2]! >= 54));
  if (supported) {
    const dir = mkdtempSync(join(tmpdir(), "vstack-git-hook-probe-"));
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
    Object.assign(env, { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" });
    try {
      const init = Bun.spawnSync([executable, "init", "-q", dir], { env, stdout: "pipe", stderr: "pipe" });
      const probe = Bun.spawnSync([executable, "-c", "hook.vstack-capability.event=post-checkout", "-c", "hook.vstack-capability.command=printf vstack-config-hook-supported", "hook", "run", "--ignore-missing", "post-checkout", "--", "0".repeat(40), "0".repeat(40), "1"], { cwd: dir, env, stdout: "pipe", stderr: "pipe" });
      supported = init.exitCode === 0 && probe.exitCode === 0 && probe.stderr.toString() === "vstack-config-hook-supported";
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  return { executable, version, supported, remedy: supported ? null : "Select configuration-hook-capable Git 2.54 or later in the worktree creator's PATH, then rerun setup. Machine-wide Git selection was not changed." };
}

function fail(message: string): never { throw new Error(message); }
function git(root: string, ...args: string[]) {
  const p = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe", env: { ...process.env, GIT_LITERAL_PATHSPECS: "1" } });
  if (p.exitCode !== 0) fail(`Git failed while checking repository metadata (${args[0]}).`);
  return p.stdout.toString().trim();
}
function paths() {
  const root = realpathSync(git(process.cwd(), "rev-parse", "--show-toplevel"));
  const common = realpathSync(git(root, "rev-parse", "--path-format=absolute", "--git-common-dir"));
  if (!existsSync(join(common, "vstack/config"))) fail("Private mode is required. Standard mode MCP configuration is unchanged.");
  const main = git(root, "worktree", "list", "--porcelain", "-z").split("\0")[0]!.slice("worktree ".length);
  return { root, common, main, destination: join(main, ".omp/mcp.json"), shared: join(common, "vstack/mcp/mcp.json"), exclude: join(common, "info/exclude") };
}
function localDirectory(path: string) {
  try {
    const st = lstatSync(path);
    if (!st.isDirectory() || st.isSymbolicLink()) fail(`Private MCP parent is not a regular directory: ${path}. Existing configuration preserved.`);
  } catch (error: any) { if (error.code !== "ENOENT") throw error; }
}
function localMetadata(p: ReturnType<typeof paths>) {
  for (const directory of [join(p.common, "vstack"), dirname(p.shared), dirname(p.exclude)]) localDirectory(directory);
  if (snapshot(p.exclude).kind === "link") fail("Private MCP exclusion path is a symlink. Preserve it and settle repository-local exclusions first.");
}
type Input = { kind: "missing" } | { kind: "link"; target: string } | { kind: "file"; hash: string };
type Captured = { input: Input; bytes: Buffer | null };
function capture(path: string): Captured {
  let st;
  try { st = lstatSync(path); } catch (error: any) { if (error.code === "ENOENT") return { input: { kind: "missing" }, bytes: null }; throw error; }
  if (st.isSymbolicLink()) return { input: { kind: "link", target: readlinkSync(path) }, bytes: null };
  if (!st.isFile()) fail("MCP configuration must be a regular JSON file or the managed link.");
  const bytes = readFileSync(path);
  return { input: { kind: "file", hash: createHash("sha256").update(bytes).digest("hex") }, bytes };
}
function snapshot(path: string) { return capture(path).input; }
function jsonFile(path: string) { return jsonBytes(path, readFileSync(path, "utf8")); }
type RawNumber = { readonly rawJSON: string };
const losslessJSON = JSON as typeof JSON & {
  rawJSON(source: string): RawNumber;
  isRawJSON(value: unknown): value is RawNumber;
};
function jsonBytes(path: string, bytes: string, lossless = false): Record<string, unknown> {
  let value;
  try {
    value = lossless ? JSON.parse(bytes, (_key: string, value: unknown, context?: { source?: string }) =>
      typeof value === "number" ? losslessJSON.rawJSON(context!.source!) : value) : JSON.parse(bytes);
  } catch { fail(`Invalid JSON in MCP configuration at ${path}. Original preserved.`); }
  if (!object(value)) fail(`MCP configuration at ${path} must be a JSON object.`);
  return value;
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !losslessJSON.isRawJSON(value);
}
function numericValue(token: string) {
  const [, sign, integer, fraction = "", exponent = "0"] = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token)!;
  const digits = (integer! + fraction).replace(/^0+/, "");
  if (!digits) return "0";
  const significant = digits.replace(/0+$/, "");
  const power = BigInt(exponent) - BigInt(fraction.length) + BigInt(digits.length - significant.length);
  return sign + significant + (power === 0n ? "" : "e" + power);
}
function comparable(value: unknown) {
  return JSON.stringify(value, (_key, item) => losslessJSON.isRawJSON(item) ? losslessJSON.rawJSON(numericValue(item.rawJSON)) : item);
}
function merge(main: Record<string, unknown>, shared: Record<string, unknown>, conflicts: string[], choices: Record<string, unknown>, path = ""): Record<string, unknown> {
  return Object.fromEntries([...new Set([...Object.keys(main), ...Object.keys(shared)])].map(key => {
    if (!Object.hasOwn(main, key)) return [key, shared[key]];
    if (!Object.hasOwn(shared, key)) return [key, main[key]];
    const pointer = path + "/" + key.replaceAll("~", "~0").replaceAll("/", "~1");
    if (object(main[key]) && object(shared[key])) return [key, merge(main[key], shared[key], conflicts, choices, pointer)];
    if (comparable(main[key]) !== comparable(shared[key])) conflicts.push(pointer);
    return [key, choices[pointer] === "shared" ? shared[key] : main[key]];
  }));
}
function inputs(p: ReturnType<typeof paths>, main: Captured, shared: Captured) {
  if (shared.input.kind === "link") fail("The canonical shared MCP file must not be a symlink.");
  if (main.input.kind === "link" && main.input.target !== p.shared) fail("Foreign MCP link preserved. Reconcile its target separately.");
  return {
    main: main.bytes ? jsonBytes(p.destination, main.bytes.toString("utf8"), true) : shared.input.kind === "missing" && main.input.kind === "missing" ? { mcpServers: {} } : {},
    shared: shared.bytes ? jsonBytes(p.shared, shared.bytes.toString("utf8"), true) : {},
  };
}
function atomic(path: string, bytes: string) {
  const temp = path + "." + crypto.randomUUID() + ".tmp";
  try { writeFileSync(temp, bytes, { mode: 0o600, flag: "wx" }); renameSync(temp, path); }
  finally { if (existsSync(temp)) unlinkSync(temp); }
}
const HOOK = "hook.vstack-private-mcp";
function shell(value: string) { return "'" + value.replaceAll("'", "'\\''") + "'"; }
function hookCommand(common: string) {
  return `${shell(process.execPath)} ${shell(import.meta.path)} hook --common ${shell(common)}`;
}
function worktreeIdentity(root: string) {
  const directory = realpathSync(git(root, "rev-parse", "--absolute-git-dir"));
  const st = statSync(directory, { bigint: true });
  return { directory, identity: `${st.dev}:${st.ino}:${st.birthtimeNs}` };
}
function registrationPath(common: string) { return join(common, "vstack/mcp/setup.json"); }
function initialWorktrees(root: string) {
  return git(root, "worktree", "list", "--porcelain", "-z").split("\0")
    .filter(line => line.startsWith("worktree ")).map(line => worktreeIdentity(line.slice(9)));
}
function hookSettings(root: string, local: boolean) {
  const result = Bun.spawnSync(["git", "config", ...(local ? ["--local"] : []), "--null", "--get-regexp", "^hook\\.vstack-private-mcp\\."], { cwd: root, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0 && result.exitCode !== 1) fail("Cannot inspect Private MCP hook settings. Existing configuration preserved.");
  return result.stdout.toString().split("\0").filter(Boolean).sort();
}
function ownedRegistration(p: ReturnType<typeof paths>) {
  const record = registrationPath(p.common); const input = snapshot(record);
  if (input.kind === "link") fail("Private MCP hook ownership record must be a regular file.");
  const settings = hookSettings(p.main, false);
  if (input.kind === "missing") {
    if (settings.length) fail("Unowned Private MCP hook definition exists. Resolve the hook-name conflict before setup.");
    return { input, installed: false };
  }
  const state = jsonFile(record);
  if (state.schema !== 1 || state.command !== hookCommand(p.common) || !Array.isArray(state.excluded) ||
      state.excluded.some(item => !object(item) || typeof item.directory !== "string" || typeof item.identity !== "string")) {
    fail("Private MCP hook ownership or eligibility record does not match this helper. Preserve it and resolve the setup prerequisite.");
  }
  const expected = [`${HOOK}.command\n${state.command}`, `${HOOK}.event\npost-checkout`].sort();
  if (JSON.stringify(settings) !== JSON.stringify(expected) || JSON.stringify(hookSettings(p.main, true)) !== JSON.stringify(expected)) {
    fail("Private MCP hook settings changed or conflict with another scope. Existing hook definitions preserved.");
  }
  return { input, installed: true };
}
function runHook(common: string, args: string[]) {
  if (args.length !== 3 || !/^0{40,64}$/.test(args[0]!) || args[2] !== "1") return;
  const p = paths();
  if (p.common !== common) fail("Private MCP hook belongs to a different repository.");
  if (p.root === p.main) return;
  const state = jsonFile(registrationPath(common));
  const identity = worktreeIdentity(p.root);
  if (dirname(identity.directory) !== join(common, "worktrees")) return;
  if (!Array.isArray(state.excluded)) fail("Private MCP eligibility record is invalid. Rerun setup without replacing existing configurations.");
  if (state.excluded.some(item => item.directory === identity.directory && item.identity === identity.identity)) return;
  localMetadata(p); localDirectory(join(p.root, ".omp"));
  if (tracked(p.root)) fail("Private MCP hook refused a tracked destination. Configuration preserved.");
  requireExcluded(p.root);
  if (snapshot(p.shared).kind !== "file") fail("Private MCP canonical configuration is missing or is not a regular file. Rerun setup.");
  jsonFile(p.shared);
  const destination = join(p.root, ".omp/mcp.json");
  const existing = snapshot(destination);
  if (existing.kind === "link" && existing.target === p.shared) return;
  if (existing.kind !== "missing") fail(`Private MCP hook conflict at ${destination}. Configuration preserved. The new worktree may already exist.`);
  mkdirSync(dirname(destination), { recursive: true }); symlinkSync(p.shared, destination);
}
function tracked(root: string) {
  if (git(root, "ls-files", "--", ".omp/mcp.json")) return true;
  const head = Bun.spawnSync(["git", "rev-parse", "--verify", "--quiet", "HEAD"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  if (head.exitCode === 1) return false;
  if (head.exitCode !== 0) fail("Cannot inspect HEAD while checking the tracked MCP destination.");
  return !!git(root, "ls-tree", "--name-only", "HEAD", "--", ".omp/mcp.json");
}
function requireExcluded(root: string) {
  const result = Bun.spawnSync(["git", "check-ignore", "--no-index", "--quiet", "--", ".omp/mcp.json"], {
    cwd: root, env: { ...process.env, GIT_LITERAL_PATHSPECS: "0" }, stdout: "pipe", stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    fail("Private MCP exclusion is ineffective. Settle higher-priority repository ignore rules for .omp/mcp.json separately, then rerun setup. Tracked ignores and global settings were not changed.");
  }
}
function inspect() {
  const p = paths();
  localMetadata(p); localDirectory(join(p.main, ".omp"));
  if (tracked(p.main)) {
    fail("Tracked .omp/mcp.json cannot be replaced by Private setup. Settle the tracked-file prerequisite separately.");
  }
  const main = capture(p.destination); const shared = capture(p.shared);
  const values = inputs(p, main, shared);
  const current = { ...p, main_input: main.input, shared_input: shared.input };
  const conflicts: string[] = []; merge(values.main, values.shared, conflicts, {});
  const result = { ...current, conflicts, git: creatorGit(), registration: ownedRegistration(p) };
  unchanged(current);
  return { plan: result, main, shared, values };
}
function plan() { return inspect().plan; }
function unchanged(p: ReturnType<typeof paths> & { main_input: Input; shared_input: Input }) {
  if (JSON.stringify(snapshot(p.destination)) !== JSON.stringify(p.main_input) ||
      JSON.stringify(snapshot(p.shared)) !== JSON.stringify(p.shared_input)) {
    fail("MCP inputs changed. Create a new plan before applying choices. Originals preserved.");
  }
}
async function apply(file: string, choicesFile?: string) {
  const approved = JSON.parse(readFileSync(file, "utf8")); const captured = inspect(); const current = captured.plan;
  if (JSON.stringify(approved) !== JSON.stringify(current)) fail("MCP inputs changed. Create a new plan before applying choices.");
  if (!current.git.supported) fail(`Private MCP setup incomplete. ${current.git.executable} reports ${current.git.version}. ${current.git.remedy}`);
  const choices = choicesFile ? jsonFile(choicesFile) : {};
  if (Object.keys(choices).some(key => !current.conflicts.includes(key)) ||
      current.conflicts.some(key => choices[key] !== "main" && choices[key] !== "shared")) {
    fail("MCP reconciliation is incomplete. Choose main or shared for every conflict in a fresh plan. Originals preserved.");
  }
  const merged = merge(captured.values.main, captured.values.shared, [], choices);
  const replaceShared = current.shared_input.kind !== "file" || comparable(captured.values.shared) !== comparable(merged);
  const command = hookCommand(current.common);
  const excluded = current.registration.installed ? null : initialWorktrees(current.main);
  const bytes = JSON.stringify(merged, null, 2) + "\n";
  unchanged(current);
  const previous = capture(current.exclude);
  const previousText = previous.bytes?.toString("utf8") ?? "";
  const addExclusion = !previousText.split(/\r?\n/).includes("/.omp/mcp.json");
  let exclusionWrite: { bytes: Buffer; identity: string } | undefined;
  try {
    if (addExclusion) {
      mkdirSync(dirname(current.exclude), { recursive: true });
      const bytes = Buffer.from(previousText + (previousText && !previousText.endsWith("\n") ? "\n" : "") + "/.omp/mcp.json\n");
      writeFileSync(current.exclude, bytes);
      const st = lstatSync(current.exclude, { bigint: true });
      exclusionWrite = { bytes, identity: `${st.dev}:${st.ino}:${st.birthtimeNs}` };
    }
    requireExcluded(current.main);
    unchanged(current);
  } catch (error) {
    if (addExclusion) {
      let owned = false;
      if (exclusionWrite) {
        try {
          const st = lstatSync(current.exclude, { bigint: true });
          owned = st.isFile() && `${st.dev}:${st.ino}:${st.birthtimeNs}` === exclusionWrite.identity &&
            readFileSync(current.exclude).equals(exclusionWrite.bytes);
        } catch {}
      }
      if (!owned) {
        fail(`${error instanceof Error ? error.message : "Private MCP setup failed."} Repository-local exclusion changed independently or its ownership could not be established. Its current path was preserved. Inspect info/exclude before rerunning setup.`);
      }
      if (previous.bytes) writeFileSync(current.exclude, previous.bytes);
      else rmSync(current.exclude, { force: true });
    }
    throw error;
  }
  const backups: string[] = [];
  mkdirSync(dirname(current.shared), { recursive: true, mode: 0o700 });
  for (const source of [captured.main, captured.shared]) {
    if (!source.bytes || (source === captured.shared && !replaceShared)) continue;
    const backup = join(dirname(current.shared), `original-${crypto.randomUUID()}.json`);
    writeFileSync(backup, source.bytes, { mode: 0o600, flag: "wx" }); backups.push(backup);
  }
  if (replaceShared) atomic(current.shared, bytes);
  if (current.main_input.kind !== "link") {
    mkdirSync(dirname(current.destination), { recursive: true });
    if (current.main_input.kind === "file") unlinkSync(current.destination);
    symlinkSync(current.shared, current.destination);
  }
  const record = registrationPath(current.common);
  if (!current.registration.installed) {
    atomic(record, JSON.stringify({ schema: 1, command, excluded }, null, 2) + "\n");
    git(current.main, "config", "--local", "--replace-all", `${HOOK}.command`, command);
    git(current.main, "config", "--local", "--replace-all", `${HOOK}.event`, "post-checkout");
  }
  return { complete: true, shared: current.shared, backups };
}
export function privateMcpState() {
  try {
    const p = plan();
    requireExcluded(p.main);
    const complete = p.git.supported && p.registration.installed && p.shared_input.kind === "file" &&
      p.main_input.kind === "link" && p.main_input.target === p.shared;
    return { pending: !complete, shared: p.shared, git: p.git, diagnostic: complete ? null : "Run Private MCP reconciliation before declaring setup complete." };
  } catch (error) {
    return { pending: true, diagnostic: error instanceof Error ? error.message : "Private MCP inspection failed." };
  }
}
if (import.meta.main) {
  try {
    const [command, option, value, ...rest] = process.argv.slice(2);
    if (command === "plan" && !option) console.log(JSON.stringify(plan(), null, 2));
    else if (command === "apply" && option === "--plan" && value && (rest.length === 0 || (rest.length === 2 && rest[0] === "--choices"))) console.log(JSON.stringify(await apply(value, rest[1]), null, 2));
    else if (command === "hook" && option === "--common" && value) runHook(value, rest);
    else fail("Usage: private-mcp.ts plan | apply --plan <plan.json> [--choices <choices.json>]");
  } catch (error) { console.error(error instanceof Error ? error.message : "Private MCP setup failed."); process.exitCode = 2; }
}

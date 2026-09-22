import { createHash, randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { build, check, digest, publish, run, storeRelease, within, type Lock, type Source } from "./stack";

interface Change { path: string; classification: "metadata" | "behavioral-or-uncertain"; skills: string[] }
interface Candidate {
  id: string; date: string; source: string; previous: Source; next: Source;
  movedTag: boolean; changes: Change[]; adaptations: string[]; requiresApproval: boolean;
  baseline: string; inputs: string; generator: string; release: string; mirrors: Record<string, string>;
  verification: string; record: string; diff: string; fingerprint: string;
}
interface Approval {
  candidate: string; reference: string; verification: string;
  changes: Record<string, string>; adaptations: Record<string, string>;
}
const json = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8"));
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function save(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}
function inputDigest(root: string): string { return hash([digest(join(root, "config")), digest(join(root, "overlays"))]); }
function git(cache: string, ...args: string[]): string { return run(["git", `--git-dir=${cache}`, ...args]).toString().trim(); }
function seal(candidate: Candidate): string { const { fingerprint: _, ...body } = candidate; return hash(body); }
function location(root: string, id: string): string {
  check(/^[a-f0-9-]{36}$/.test(id), "Invalid candidate id");
  return join(root, "generated/candidates", id);
}
function stableTag(cache: string, accepted: string | null): string {
  const tags = git(cache, "tag", "--list").split("\n").filter(Boolean);
  const stable: { tag: string; parts: bigint[] }[] = [];
  const prefix = accepted?.startsWith("v") ? "v" : "";
  for (const tag of tags) {
    const match = /^(v?)(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(tag);
    check(match && match[1] === prefix, `Ambiguous tag naming (${tag}); source-policy decision required`);
    if (match[5]) {
      check(match[5].split(".").every(part => !/^0\d+$/.test(part)), `Invalid prerelease (${tag}); source-policy decision required`);
      continue;
    }
    stable.push({ tag, parts: match.slice(2, 5).map(n => BigInt(n!)) });
  }
  check(stable.length, "No eligible stable semantic-version tag");
  stable.sort((a, b) => { for (let i = 0; i < 3; i++) { if (a.parts[i]! !== b.parts[i]!) return a.parts[i]! > b.parts[i]! ? -1 : 1; } return 0; });
  check(stable.length < 2 || stable[0]!.parts.some((part, i) => part !== stable[1]!.parts[i]), "Ambiguous highest stable tags with equal precedence; source-policy decision required");
  return stable[0]!.tag;
}
// Only three existing non-executable Codex UI strings are mechanically harmless.
// Descriptions in SKILL.md, invocation policy, prompts, unknown YAML, and new files are gated.
function metadataOnly(cache: string, old: string, next: string, path: string): boolean {
  if (!path.endsWith("/agents/openai.yaml")) return false;
  try {
    const trees = [old, next].map(sha => git(cache, "ls-tree", sha, "--", path));
    if (trees.some(row => !row.startsWith("100644 blob "))) return false;
    const strip = (sha: string) => {
      const value = Bun.YAML.parse(git(cache, "show", `${sha}:${path}`)) as { interface?: Record<string, unknown> };
      check(value && typeof value === "object" && !Array.isArray(value), "Invalid UI metadata");
      if (value.interface) {
        check(typeof value.interface === "object" && !Array.isArray(value.interface), "Invalid UI interface");
        const projected = { ...value.interface };
        for (const key of ["display_name", "short_description", "brand_color"]) {
          check(projected[key] === undefined || typeof projected[key] === "string", "Invalid UI string");
          delete projected[key];
        }
        // Do not mutate parsed YAML: aliases may share this object with unknown
        // instruction-bearing sections, which must remain in the comparison.
        return JSON.stringify({ ...value, interface: projected });
      }
      return JSON.stringify(value);
    };
    return strip(old) === strip(next);
  } catch { return false; }
}
function verify(root: string, lock: Lock): string {
  const workspace = mkdtempSync(join(root, "verify-"));
  try {
    mkdirSync(join(workspace, ".omp"));
    writeFileSync(join(workspace, ".omp/config.yml"), Bun.YAML.stringify({ skills: { customDirectories: [join(root, "generated/current/skills")] } }));
    const result = Bun.spawnSync(["omp", "--mode", "rpc", "--no-extensions", "--no-lsp", "--no-rules", "--no-session"], {
      cwd: workspace, stdin: Buffer.from('{"id":"vstack-sync","type":"get_available_commands"}\n'), stdout: "pipe", stderr: "pipe", timeout: 30000,
    });
    check(result.exitCode === 0, `OMP verification failed: ${result.stderr.toString()}`);
    const frames = result.stdout.toString().split("\n").filter(line => line.startsWith("{")).map(line => JSON.parse(line));
    const response = frames.find(frame => frame.id === "vstack-sync");
    check(response?.success && Array.isArray(response.data?.commands), "OMP discovery did not complete");
    for (const skill of [...lock.skills, ...lock.additions]) check(response.data.commands.some((command: { name: string }) => command.name === `skill:${skill.name}`), `OMP did not discover ${skill.name}`);
    return "Real OMP RPC discovery passed for all selected skills; generated metadata, invocation-policy overlays, resources and provenance validated. Behavioral compatibility requires reviewer evidence.";
  } finally { rmSync(workspace, { recursive: true, force: true }); }
}
function record(root: string, candidate: Candidate, status: string, approval?: Approval): void {
  const text = (value: unknown) => JSON.stringify(value);
  const entries = candidate.changes.length ? candidate.changes.map(change => `### ${text(change.path)}\n\n- Affected skills: ${text(change.skills)}\n- Upstream change: see candidate upstream.patch, ${candidate.previous.sha} → ${candidate.next.sha}.\n- Classification: ${change.classification}.\n- Adaptation rationale: ${text(approval?.changes[change.path] ?? (change.classification === "metadata" ? "Mechanically verified UI metadata only; instructions and executable files unchanged." : "Awaiting review; no behavioral compatibility claim."))}\n`) : ["### Provenance\n\nNo source-tree changes; only the accepted commit/tag provenance changes.\n"];
  const body = `# Upstream sync: ${candidate.date} ${candidate.source} ${candidate.next.sha.slice(0, 12)}\n\n- Status: ${status}\n- Candidate: ${candidate.id}\n- Exact reviewed fingerprint: ${candidate.fingerprint}\n- Old tag / SHA: ${text(candidate.previous.tag)} / ${candidate.previous.sha}\n- New tag / SHA: ${text(candidate.next.tag)} / ${candidate.next.sha}\n- Moved accepted tag: ${candidate.movedTag}\n- Whole-transition classification: ${candidate.requiresApproval ? "approval-required" : "automatic metadata/provenance-only"}\n- Approval reference: ${text(approval?.reference ?? "none")}\n- Verification: ${candidate.verification}\n- Reviewer verification: ${text(approval?.verification ?? "not supplied")}\n\n${entries.join("\n")}\n## Affected adaptations\n\n${candidate.adaptations.map(path => `- ${text(path)}: ${text(approval?.adaptations[path] ?? "Awaiting semantic compatibility review, even if the patch applies cleanly.")}`).join("\n") || "None."}\n`;
  const path = within(root, candidate.record);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}
function load(root: string, id: string): { directory: string; input: string; candidate: Candidate } {
  const directory = location(root, id);
  const candidate = json<Candidate>(join(directory, "candidate.json"));
  const input = join(directory, "input");
  check(candidate.id === id && seal(candidate) === candidate.fingerprint, "Candidate changed; prepare again and renew approval");
  check(hash(readFileSync(join(directory, "upstream.patch"), "utf8")) === candidate.diff, "Reviewed diff changed; prepare again and renew approval");
  check(inputDigest(input) === candidate.inputs && digest(join(root, "scripts")) === candidate.generator, "Candidate inputs or generator changed; prepare again and renew approval");
  check(digest(join(input, "generated/releases", candidate.release)) === candidate.release, "Candidate release changed; prepare again and renew approval");
  for (const [path, expected] of Object.entries(candidate.mirrors)) check(digest(within(input, path)) === expected, "Candidate source changed; prepare again and renew approval");
  return { directory, input, candidate };
}
function prepare(root: string, id: string, sha?: string, patches?: string): Candidate {
  check(id === "matt" || id === "pstack", "Expected matt or pstack source");
  const lock = json<Lock>(join(root, "config/sources.lock.json"));
  const previous = lock.sources.find(source => source.id === id);
  check(previous, `Missing source ${id}`);
  check(existsSync(join(root, "generated/current/provenance.json")), "Build the accepted stack before sync");
  const accepted = json<{ lock: Lock; inventory: unknown; patches: { path: string; sha256: string }[] }>(join(root, "generated/current/provenance.json"));
  check(hash(accepted.lock) === hash(lock) && hash(accepted.inventory) === hash(json(join(root, "config/inventory.json"))), "Local selections differ from the active stack; review and build them separately before sync");
  for (const patch of accepted.patches) check(createHash("sha256").update(readFileSync(within(root, patch.path))).digest("hex") === patch.sha256, "Local adaptations differ from the active stack; review and build them separately before sync");
  for (const addition of lock.additions) check(digest(within(join(root, "overlays/additions"), addition.path)) === digest(join(root, "generated/current/skills", addition.name)), "Local additions differ from the active stack; review and build them separately before sync");
  const baseline = inputDigest(root);
  if (id === "pstack") check(sha && /^[a-f0-9]{40}$/.test(sha), "Pstack requires a user-nominated full SHA; activation requires approval");
  else check(sha === undefined, "Matt selection uses stable tags, not a nominated SHA");
  const candidateId = randomUUID();
  const directory = location(root, candidateId);
  const input = join(directory, "input");
  mkdirSync(join(input, ".cache"), { recursive: true });
  for (const name of ["config", "overlays"]) cpSync(join(root, name), join(input, name), { recursive: true });
  if (patches) {
    check(previous.patches.length > 0, "No existing source patches to rebase");
    for (const path of previous.patches) {
      check(path.startsWith("overlays/"), "Rebased patches must remain under overlays/");
      cpSync(within(patches, path), within(input, path));
    }
  }
  for (const source of lock.sources) {
    const cache = join(input, ".cache", `${source.id}.git`);
    run(["git", "clone", "--bare", source.id === id ? source.url : join(root, ".cache", `${source.id}.git`), cache]);
    // Retain the old accepted object even after an upstream force-update.
    run(["git", `--git-dir=${cache}`, "fetch", "--no-tags", join(root, ".cache", `${source.id}.git`), source.sha]);
  }
  const cache = join(input, ".cache", `${id}.git`);
  const tag = id === "matt" ? stableTag(cache, previous.tag) : null;
  if (sha) run(["git", `--git-dir=${cache}`, "fetch", "--no-tags", previous.url, sha]);
  const nextSha = git(cache, "rev-parse", `${tag ? `refs/tags/${tag}` : sha}^{commit}`);
  check(/^[a-f0-9]{40}$/.test(nextSha) && (!sha || nextSha === sha), "Selected revision is not the nominated commit");
  const tagObject = tag ? git(cache, "rev-parse", `refs/tags/${tag}`) : undefined;
  const cached = join(root, ".cache", `${id}.git`);
  const tagIdentity = (repository: string, name: string) => {
    const probe = Bun.spawnSync(["git", `--git-dir=${repository}`, "rev-parse", `refs/tags/${name}`], { stdout: "pipe", stderr: "pipe" });
    return probe.exitCode === 0 ? probe.stdout.toString().trim() : undefined;
  };
  let movedTag = false;
  if (previous.tag) {
    const acceptedIdentity = previous.tagObject ?? tagIdentity(cached, previous.tag);
    movedTag = acceptedIdentity === undefined || tagIdentity(cache, previous.tag) !== acceptedIdentity || git(cache, "rev-parse", `refs/tags/${previous.tag}^{commit}`) !== previous.sha;
  }
  if (tag && tag !== previous.tag) {
    const knownIdentity = tagIdentity(cached, tag);
    movedTag ||= knownIdentity !== undefined && knownIdentity !== tagObject;
  }
  check(nextSha !== previous.sha || tag !== previous.tag || movedTag, "No upstream transition");
  const date = new Date().toISOString().slice(0, 10);
  const recordPath = `docs/sync/${date}-${id}-${nextSha.slice(0, 12)}-${candidateId.slice(0, 8)}.md`;
  const next = { ...previous, sha: nextSha, tag, tagObject, approval: `Sync record: ${recordPath}` };
  const inventory = json<{ source: string; path: string; targets?: string[] }[]>(join(input, "config/inventory.json"));
  const paths = run(["git", `--git-dir=${cache}`, "diff", "--name-only", "-z", previous.sha, nextSha]).toString().split("\0").filter(Boolean);
  const changes: Change[] = paths.map(path => ({ path, classification: metadataOnly(cache, previous.sha, nextSha, path) ? "metadata" : "behavioral-or-uncertain", skills: [...new Set(inventory.filter(row => row.source === id && (path === row.path || path.startsWith(`${dirname(row.path)}/`))).flatMap(row => row.targets ?? []))] }));
  // A clean patch can still depend on changed shared instructions or resources.
  // Conservatively review every source adaptation whenever its source tree changes.
  const adaptations = paths.length || patches ? previous.patches : [];
  lock.sources = lock.sources.map(source => source.id === id ? next : source);
  save(join(input, "config/sources.lock.json"), lock);
  writeFileSync(join(directory, "upstream.patch"), run(["git", `--git-dir=${cache}`, "diff", "--binary", previous.sha, nextSha]));
  const candidate: Candidate = { id: candidateId, date, source: id, previous, next, movedTag, changes, adaptations, requiresApproval: id === "pstack" || movedTag || adaptations.length > 0 || changes.some(change => change.classification !== "metadata"), baseline, inputs: inputDigest(input), generator: digest(join(root, "scripts")), release: "", mirrors: {}, verification: "Preparation not completed.", record: recordPath, diff: hash(readFileSync(join(directory, "upstream.patch"), "utf8")), fingerprint: "" };
  try {
    candidate.release = build(input);
    for (const source of lock.sources) {
      const path = `vendor/${source.id}/${source.sha}`;
      candidate.mirrors[path] = digest(join(input, path));
    }
    candidate.verification = verify(input, lock);
    check(inputDigest(root) === baseline, "Local inputs changed during preparation; prepare again");
    candidate.fingerprint = seal(candidate);
    save(join(directory, "candidate.json"), candidate);
    record(root, candidate, "prepared; active stack unchanged");
    return candidate;
  } catch (error) {
    candidate.verification = `Failed: ${error instanceof Error ? error.message : error}`;
    candidate.fingerprint = seal(candidate);
    save(join(directory, "failed.json"), candidate);
    record(root, candidate, "failed; active stack unchanged");
    throw error;
  }
}
function approve(root: string, id: string, path: string): void {
  const { directory, candidate } = load(root, id);
  check(inputDigest(root) === candidate.baseline, "Accepted baseline changed; prepare again before approving");
  const approval = json<Approval>(path);
  check(approval.candidate === candidate.fingerprint, "Approval must name the exact candidate fingerprint");
  const text = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  check(text(approval.reference) && text(approval.verification), "Approval reference and behavioral verification evidence are required");
  for (const change of candidate.changes) check(text(approval.changes?.[change.path]), `Review rationale required for ${change.path}`);
  for (const patch of candidate.adaptations) check(text(approval.adaptations?.[patch]), `Semantic adaptation review required for ${patch}`);
  save(join(directory, "approval.json"), { approval, digest: hash(approval) });
  record(root, candidate, "approved; active stack unchanged", approval);
}
function activate(root: string, id: string): void {
  const { directory, input, candidate } = load(root, id);
  check(inputDigest(root) === candidate.baseline, "Accepted pins or local adaptations changed; prepare a fresh candidate and renew approval");
  const receipt = existsSync(join(directory, "approval.json")) ? json<{ approval: Approval; digest: string }>(join(directory, "approval.json")) : undefined;
  check(!receipt || hash(receipt.approval) === receipt.digest, "Approval record changed; renew approval");
  const approval = receipt?.approval;
  check(!candidate.requiresApproval || approval?.candidate === candidate.fingerprint, "Whole-transition approval required");
  const lock = json<Lock>(join(input, "config/sources.lock.json"));
  check(build(input) === candidate.release, "Regenerated candidate changed; renewed approval required");
  verify(input, lock);
  load(root, id);
  check(inputDigest(root) === candidate.baseline, "Accepted inputs changed during verification; prepare again");
  storeRelease(root, join(input, "generated/releases", candidate.release), candidate.release);
  for (const source of lock.sources) run(["git", `--git-dir=${join(root, ".cache", `${source.id}.git`)}`, "fetch", "--no-tags", join(input, ".cache", `${source.id}.git`), `${source.sha}:refs/vstack/pins/${source.sha}`]);
  const lockPath = join(root, "config/sources.lock.json");
  const oldLock = readFileSync(lockPath);
  const oldPatches = candidate.next.patches.map(path => ({ path, bytes: readFileSync(within(root, path)) }));
  const temp = `${lockPath}.sync-${process.pid}`;
  try {
    record(root, candidate, "activated", approval);
    for (const patch of oldPatches) writeFileSync(within(root, patch.path), readFileSync(within(input, patch.path)));
    writeFileSync(temp, readFileSync(join(input, "config/sources.lock.json")), { flag: "wx" });
    renameSync(temp, lockPath);
    publish(root, candidate.release);
  } catch (error) {
    writeFileSync(temp, oldLock); renameSync(temp, lockPath);
    for (const patch of oldPatches) writeFileSync(within(root, patch.path), patch.bytes);
    record(root, candidate, "activation failed; active stack unchanged", approval);
    throw error;
  } finally { rmSync(temp, { force: true }); }
  console.log(`Activated ${candidate.source} ${candidate.next.sha}; commit ${candidate.record}, config/sources.lock.json and any rebased patches together. No commit or publication was performed.`);
}
export async function sync(root: string, args: string[]): Promise<void> {
  const [command, id, ...values] = args;
  check(id, "Usage: sync prepare <matt|pstack> [full-sha] [--patches <directory>] | show <id> | approve <id> <decision.json> | activate <id>");
  if (command === "prepare") {
    const patchFlag = values.indexOf("--patches");
    let patches: string | undefined;
    if (patchFlag >= 0) {
      check(patchFlag === values.length - 2 && values[patchFlag + 1], "Expected final --patches <directory>");
      patches = values.splice(patchFlag)[1];
    }
    check(values.length <= 1, "Too many prepare arguments");
    console.log(JSON.stringify(prepare(root, id, values[0], patches), null, 2));
  } else if (command === "approve" && values.length === 1) approve(root, id, values[0]!);
  else if (command === "activate" && values.length === 0) activate(root, id);
  else if (command === "show" && values.length === 0) console.log(JSON.stringify(load(root, id).candidate, null, 2));
  else throw new Error("Invalid sync arguments");
}

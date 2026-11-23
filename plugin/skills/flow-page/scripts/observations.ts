import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { repoKey } from "../../vstack-tmp/scripts/scratch.ts";
import type { State } from "./model.ts";
import type { FlowStore } from "./store.ts";

export type Observation = {
  status: "current" | "stale" | "unavailable" | "unknown";
  provenance: { adapter: string; source: string; checkout?: string; stage?: string; branch?: string };
  attempted_at?: string;
  observed_at?: string;
  records: { name: string; state: string; url?: string }[];
  reason?: string;
};
export type Observations = Record<"git" | "code-host" | "ci", Observation>;
type Config = { adapter: string; source: string; repo?: string; url?: string; poll: number; age: number };
type Slot = { signature: string; next: number; value: Observation; pending?: Promise<void> };
const cache = new Map<string, Slot>();
const projects = new Map<string, { expires: number; root: string; common: string }>();
let pending = 0;
export const observing = () => pending > 0;
const unknown = (adapter = "none", source = "Not configured"): Observation => ({ status: "unknown", provenance: { adapter, source }, records: [], reason: "No supported observation adapter is configured." });
export const unknownObservations = (): Observations => ({ git: unknown("git", "Local checkout unavailable"), "code-host": unknown(), ci: unknown() });
export const observationVersion = (o: Observations) => createHash("sha256").update(JSON.stringify(o)).digest("hex");

type AuthoringContext = { cwd: string; stage?: string; revision?: number };
export type ProjectRegistration = AuthoringContext & { contexts?: AuthoringContext[] };
export function registerObservation(store: FlowStore, cwd: string, s: State, stage?: string): void {
  let previous: ProjectRegistration | undefined;
  try { previous = store.readObservation(s.flow.id); } catch {}
  const context = { cwd, ...(stage ? { stage } : {}), revision: s.revision };
  const prior = previous?.contexts ?? (previous ? [previous] : []);
  const contexts = [context, ...prior.filter((c) => c.cwd !== cwd || c.stage !== stage)];
  store.saveObservation(s.flow.id, { ...context, contexts });
}

async function command(cwd: string, args: string[]): Promise<string> {
  const p = Bun.spawn(args, { cwd, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0" }, stdout: "pipe", stderr: "ignore", stdin: "ignore" });
  const timer = setTimeout(() => p.kill("SIGKILL"), 5000);
  try {
    const [out, code] = await Promise.all([new Response(p.stdout).text(), p.exited]);
    if (code !== 0 || out.length > 1_000_000) throw new Error("Observation failed");
    return out.trim();
  } finally { clearTimeout(timer); }
}
const content = (file: string) => existsSync(file) ? readFileSync(file, "utf8") : "";
function config(dir: string, kind: "code-host" | "ci"): Config {
  const text = content(join(dir, `${kind}.md`));
  const row = text.match(/^- Flow observation: (.+)$/m);
  let c: any;
  if (row) {
    try { c = JSON.parse(row[1]!); } catch { throw new Error("Invalid observation configuration"); }
  } else {
    const repo = text.match(/^- Repo: `?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)`?\s*$/m)?.[1];
    const provider = kind === "code-host" ? /^- Host: GitHub(?: \(`github\.com`\))?\s*$/m.test(text) : /^- CI service: GitHub Actions\s*$/m.test(text);
    c = { adapter: provider ? kind === "code-host" ? "github" : "github-actions" : "none", repo };
  }
  if (!c || typeof c !== "object" || Array.isArray(c)) throw new Error("Invalid observation configuration");
  const poll = Number(c.poll_seconds ?? 15), age = Number(c.stale_after_seconds ?? 120);
  if (!Number.isFinite(poll) || poll < 0.1 || !Number.isFinite(age) || age <= 0) throw new Error("Invalid observation intervals");
  if (c.adapter === "http-json") {
    const u = new URL(c.url);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.search || u.hash || (u.protocol === "http:" && u.hostname !== "127.0.0.1")) throw new Error("Unsafe observation URL");
    return { adapter: c.adapter, url: u.href, source: u.href, poll, age };
  }
  if ((kind === "code-host" && c.adapter === "github") || (kind === "ci" && c.adapter === "github-actions")) {
    if (typeof c.repo !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(c.repo)) throw new Error("Observation repository is missing");
    return { adapter: c.adapter, repo: c.repo, source: `https://github.com/${c.repo}`, poll, age };
  }
  return { adapter: "none", source: kind === "ci" ? "CI configuration" : "Code host configuration", poll, age };
}
const states = { "code-host": ["open", "merged", "closed", "unknown"], ci: ["passed", "failed", "pending", "cancelled", "skipped", "unknown"] };
function records(value: unknown, kind: "code-host" | "ci"): Observation["records"] {
  if (!Array.isArray(value) || value.length > 100) throw new Error("Invalid observation records");
  return value.map((v) => {
    if (!v || typeof v.name !== "string" || !v.name.trim() || v.name.length > 300 || !states[kind].includes(v.state)) throw new Error("Invalid observation record");
    if (v.url !== undefined && (typeof v.url !== "string" || !/^https?:\/\/[^\s\"'<>`]+$/.test(v.url) || new URL(v.url).username || new URL(v.url).password)) throw new Error("Invalid observation URL");
    return { name: v.name, state: v.state, ...(v.url ? { url: v.url } : {}) };
  });
}
async function collect(cwd: string, kind: keyof Observations, c: Config, branch: string | undefined): Promise<Pick<Observation, "records" | "observed_at">> {
  if (kind === "git") {
    const [head, branch, dirty] = await Promise.all([
      command(cwd, ["git", "rev-parse", "--verify", "HEAD"]),
      command(cwd, ["git", "symbolic-ref", "--short", "-q", "HEAD"]).catch(() => "Detached HEAD"),
      command(cwd, ["git", "-c", "core.fsmonitor=false", "status", "--porcelain", "--untracked-files=no", "--ignore-submodules=all"]),
    ]);
    return { observed_at: new Date().toISOString(), records: [{ name: branch, state: head }, { name: "Tracked working tree", state: dirty ? "modified" : "clean" }] };
  }
  if (c.adapter === "http-json") {
    const r = await fetch(c.url!, { method: "GET", redirect: "error", signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("Provider unavailable");
    const body = await r.text();
    if (body.length > 1_000_000) throw new Error("Provider response too large");
    const value = JSON.parse(body);
    const at = Date.parse(value.observed_at);
    if (!Number.isFinite(at) || at > Date.now() + 1000) throw new Error("Invalid observation time");
    return { observed_at: new Date(at).toISOString(), records: records(value.records, kind) };
  }
  branch ??= await command(cwd, ["git", "symbolic-ref", "--short", "-q", "HEAD"]);
  if (kind === "code-host") {
    const prs = JSON.parse(await command(cwd, ["gh", "pr", "list", "--repo", c.repo!, "--head", branch!, "--state", "all", "--limit", "100", "--json", "number,url,state"]));
    return { observed_at: new Date().toISOString(), records: records(prs.map((p: any) => ({ name: `PR ${p.number}`, state: String(p.state).toLowerCase(), url: p.url })), kind) };
  }
  const runs = JSON.parse(await command(cwd, ["gh", "run", "list", "--repo", c.repo!, "--branch", branch!, "--limit", "100", "--json", "databaseId,name,status,conclusion,url"]));
  return { observed_at: new Date().toISOString(), records: records(runs.map((r: any) => ({ name: `${r.name} (${r.databaseId})`, url: r.url, state: r.status !== "completed" ? "pending" : r.conclusion === "success" ? "passed" : ["failure", "timed_out", "action_required", "startup_failure"].includes(r.conclusion) ? "failed" : ["cancelled", "skipped"].includes(r.conclusion) ? r.conclusion : "unknown" })), kind) };
}

/** No domain writes. Cache entries are scoped to the checkout, provider configuration, and authored branch. */
export function observations(store: FlowStore, key: string, s: { flow: { id: string }; aliases: string[] }): Observations {
  const out = unknownObservations();
  let cwd: string, dir: string, stage: string | undefined;
  try {
    const registration = store.readObservation(s.flow.id);
    const contexts = registration.contexts ?? [registration];
    let selected: { context: AuthoringContext; project: { root: string; common: string; expires: number } } | undefined;
    for (const context of contexts) {
      const candidate = context.cwd;
      if (typeof candidate !== "string" || !existsSync(candidate)) continue;
      const id = `${key}/${candidate}`;
      let project = projects.get(id);
      if (!project || Date.now() >= project.expires) {
        if (repoKey(candidate) !== key) continue;
        const git = Bun.spawnSync(["git", "rev-parse", "--show-toplevel", "--path-format=absolute", "--git-common-dir"], { cwd: candidate, stdout: "pipe", stderr: "ignore", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
        if (git.exitCode !== 0) continue;
        const [root, common] = git.stdout.toString().trim().split("\n") as [string, string];
        project = { root, common, expires: Date.now() + 15000 };
        projects.set(id, project);
      }
      selected = { context, project };
      break;
    }
    if (!selected) return out;
    cwd = selected.context.cwd;
    stage = selected.context.stage;
    const project = selected.project;
    dir = existsSync(join(project.common, "vstack", "config")) ? join(project.common, "vstack", "config") : join(project.root, "docs", "vstack");
  } catch { return out; }
  const branch = s.aliases.findLast((a) => a.startsWith("branch:"))?.slice(7);
  for (const kind of ["git", "code-host", "ci"] as const) {
    let c: Config;
    try { c = kind === "git" ? { adapter: "git", source: cwd, poll: 15, age: 120 } : config(dir, kind); }
    catch { out[kind] = { ...unknown("invalid", `${kind} configuration`), status: "unavailable", reason: "Observation configuration is invalid." }; continue; }
    if (c.adapter === "none") { out[kind] = unknown(c.adapter, c.source); continue; }
    const id = `${key}/${s.flow.id}/${kind}`;
    const signature = JSON.stringify([cwd, c, branch, stage]);
    let slot = cache.get(id);
    if (!slot || slot.signature !== signature) { slot = { signature, next: 0, value: unknown(c.adapter, c.source) }; cache.set(id, slot); }
    if (!slot.pending && Date.now() >= slot.next) {
      const current = slot;
      const attempted_at = new Date().toISOString();
      current.next = Date.now() + c.poll * 1000;
      pending++;
      current.pending = collect(cwd, kind, c, branch).then((data) => {
        current.value = { status: data.records.length ? "current" : "unknown", provenance: { adapter: c.adapter, source: c.source, checkout: cwd, ...(stage ? { stage } : {}), ...(branch ? { branch } : {}) }, attempted_at, ...data, ...(data.records.length ? {} : { reason: "The provider returned no matching records." }) };
      }).catch(() => {
        current.value = { ...current.value, status: current.value.observed_at ? "stale" : "unavailable", attempted_at, reason: "The read-only provider could not be observed. No workflow state was changed." };
      }).finally(() => { current.pending = undefined; pending--; });
    }
    const value = slot.value;
    out[kind] = value.observed_at && Date.now() - Date.parse(value.observed_at) > c.age * 1000 ? { ...value, status: "stale", reason: value.reason ?? "The last observation is older than the configured freshness period." } : value;
  }
  return out;
}

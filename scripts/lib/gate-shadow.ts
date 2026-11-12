import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir, release } from "node:os";
import { basename, join } from "node:path";
import type { GatePhase } from "./gate-report.ts";
import { loadPins, loadRegister } from "./vstack-repo.ts";
import { defaultUpstreamsDir } from "./upstreams.ts";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const digest = (value: unknown) => hash(JSON.stringify(value));
const git = (root: string, ...args: string[]) => {
  const result = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  return result.exitCode === 0 ? result.stdout.toString().trim() : null;
};

export interface ShadowReceipt {
  mode: "shadow";
  inputs: Record<string, string>;
  inputHash: string;
  unknown: string[];
  predictedReuse: boolean;
  previousEvidence?: string;
  evidence: string;
  freshResult: GatePhase["outcome"];
  reusablePass: boolean;
  reasons: string[];
  evidenceHashes?: Record<string, string>;
}

function inventory(root: string, exclude: Set<string> = new Set()) {
  const files: [string, string][] = [], stability: [string, number, number][] = [];
  const visited = new Set<string>();
  const walk = (path: string, label: string) => {
    if (exclude.has(label)) return;
    const info = lstatSync(path);
    if (info.isSymbolicLink()) files.push([label + "@", readlinkSync(path)]);
    const real = realpathSync(path), entry = statSync(path);
    if (entry.isDirectory()) {
      if (visited.has(real)) return;
      visited.add(real);
      for (const name of readdirSync(path).sort()) walk(join(path, name), label ? `${label}/${name}` : name);
    } else if (entry.isFile()) {
      files.push([label, `${entry.mode}:${hash(readFileSync(path))}`]);
      stability.push([label, entry.mtimeMs, entry.ctimeMs]);
    } else throw new Error(`unsupported dependency ${label}`);
  };
  walk(root, "");
  return { inventoryHash: digest(files.map(([file]) => file)), contentHash: digest(files), stabilityHash: digest(stability), count: files.length };
}

export class GateShadow {
  private readonly initial;
  private readonly previous = new Map<string, GatePhase>();
  private readonly store: string | null;
  private serial = 0;
  private readonly requiredTestPhases: string[];
  constructor(private readonly root: string, private readonly evidence: string, private readonly base: string | undefined, private readonly upstreams = defaultUpstreamsDir()) {
    const store = git(root, "rev-parse", "--path-format=absolute", "--git-path", "vstack-gate-shadow");
    this.store = store ? join(store, basename(evidence)) : null;
    const browsers = Array.from(new Bun.Glob("tests/**/*.browser.test.ts").scanSync({ cwd: root })).sort();
    this.requiredTestPhases = [...(browsers.length ? ["candidate-reader-readiness", "candidate-reader-build"] : []), "non-browser", ...browsers.map(file => `browser:${file}`)];
    if (this.store) {
      try {
        const saved: unknown = JSON.parse(readFileSync(join(this.store, "latest.json"), "utf8"));
        if (typeof saved === "object" && saved !== null && "evidence" in saved && typeof saved.evidence === "string" && "sha256" in saved) {
          const bytes = readFileSync(saved.evidence);
          if (hash(bytes) !== saved.sha256) throw new Error("changed receipt evidence");
          const prior = JSON.parse(bytes.toString()) as { stages?: GatePhase[]; ok?: boolean; outcome?: string; finishedAt?: string } | GatePhase[];
          let serial = 0;
          const visit = (phases: GatePhase[]) => { for (const phase of phases) { this.previous.set(`${++serial}:${phase.name}`, phase); visit(phase.phases ?? []); } };
          if (Array.isArray(prior)) visit(prior);
          else if (prior.ok && prior.outcome === "passed" && prior.finishedAt) visit(prior.stages ?? []);
        }
      } catch {}
    }
    this.initial = this.capture();
  }
  private capture() {
    const inputs: Record<string, string> = {}, unknown: string[] = [], stability: string[] = [];
    const record = (name: string, action: () => unknown) => {
      try { const value = action(); if (value === null || value === undefined) throw new Error("missing identity"); inputs[name] = digest(value); }
      catch (error) { unknown.push(`${name}: ${(error as Error).message}`); }
    };
    const tree = (name: string, path: string, exclude?: Set<string>) => record(name, () => {
      const result = inventory(path, exclude);
      stability.push(result.stabilityHash);
      inputs[`${name}Inventory`] = result.inventoryHash;
      return { content: result.contentHash, count: result.count };
    });
    tree("source", this.root, new Set([".git", "node_modules", "reader/.nuxt", "reader/.output", "reader/node_modules"]));
    if (process.env.VSTACK_MAINTAIN_COMMANDS) unknown.push("dependency closure unavailable for command override");
    else tree("dependencies", join(this.root, "node_modules"));
    record("lock", () => readFileSync(join(this.root, "bun.lock"), "utf8"));
    record("revision", () => {
      const head = git(this.root, "rev-parse", "HEAD"), base = git(this.root, "rev-parse", this.base ?? "HEAD");
      if (!head || !base) throw new Error("unknown Git head or base");
      return { head, base, refs: git(this.root, "show-ref") };
    });
    record("runtime", () => ({ bun: Bun.version, node: process.version, platform: process.platform, arch: process.arch, release: release() }));
    for (const name of [process.execPath, "git", "bash", "omp", "python3", "jq"]) record(`tool:${name}`, () => {
      const path = Bun.which(name); if (!path) throw new Error(`missing ${name}`);
      return { path: realpathSync(path), sha256: hash(readFileSync(path)) };
    });
    record("upstreams", () => {
      const refs: [string, string, string][] = [];
      const register = loadRegister(this.root);
      for (const pin of loadPins(this.root).values()) {
        for (const ref of new Set([pin.pin, ...register.rows.filter(row => row.upstream === pin.key && row.held_at).map(row => row.held_at!)])) {
          const tree = git(join(this.upstreams, pin.key), "rev-parse", `${ref}^{tree}`);
          const object = git(join(this.upstreams, pin.key), "rev-parse", `${ref}^{commit}`);
          if (!object || !tree) throw new Error(`missing ${pin.key}@${ref}`);
          refs.push([pin.key, ref, `${object}:${tree}`]);
        }
      }
      return refs;
    });
    const browsers = Array.from(new Bun.Glob("tests/**/*.browser.test.ts").scanSync({ cwd: this.root }));
    if (browsers.length && !process.env.VSTACK_MAINTAIN_COMMANDS) tree("browser", process.env.PLAYWRIGHT_BROWSERS_PATH ?? (process.platform === "darwin" ? join(homedir(), "Library/Caches/ms-playwright") : join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "ms-playwright")));
    if (process.env.SMOKE_HOME_SEED) tree("smokeHomeSeed", process.env.SMOKE_HOME_SEED);
    if (process.env.VSTACK_MAINTAIN_COMMANDS) unknown.push("command override");
    return { inputs, unknown, stability: digest(stability) };
  }
  begin(phase: GatePhase, env: NodeJS.ProcessEnv) {
    const inputs: Record<string, string> = { ...this.initial.inputs, command: digest(phase.command ?? null), environment: digest(Object.entries(env).filter(([key]) => key !== "VSTACK_GATE_PHASE_REPORT").sort(([a], [b]) => a.localeCompare(b))) };
    const unknown = [...this.initial.unknown];
    if (env.FLOW_READER_ASSETS) {
      try { inputs.readerAssets = inventory(env.FLOW_READER_ASSETS).contentHash; }
      catch { unknown.push("missing prepared candidate reader identity"); }
    }
    if (!phase.command) unknown.push("unidentified command");
    const previous = this.previous.get(`${++this.serial}:${phase.name}`)?.shadow;
    const inputHash = digest(inputs);
    let evidenceComplete = false;
    try { evidenceComplete = !!previous?.evidenceHashes && Object.entries(previous.evidenceHashes).length > 0 && Object.entries(previous.evidenceHashes).every(([file, expected]) => existsSync(file) && hash(readFileSync(file)) === expected); }
    catch {}
    phase.shadow = { mode: "shadow", inputs, inputHash, unknown, predictedReuse: !unknown.length && previous?.reusablePass === true && previous.inputHash === inputHash && !!evidenceComplete, previousEvidence: previous?.evidence, evidence: this.evidence, freshResult: "running", reusablePass: false, reasons: unknown.length ? unknown : !evidenceComplete ? ["no complete prior evidence"] : previous?.inputHash !== inputHash ? ["changed inputs"] : [] };
  }
  end(phase: GatePhase, env: NodeJS.ProcessEnv) {
    if (env.FLOW_READER_ASSETS && phase.shadow) {
      try {
        if (inventory(env.FLOW_READER_ASSETS).contentHash !== phase.shadow.inputs.readerAssets) phase.shadow.unknown.push("candidate reader changed during execution");
      } catch { phase.shadow.unknown.push("candidate reader became unavailable"); }
    }
  }
  finish(phases: GatePhase[], complete: boolean) {
    const final = this.capture();
    const stable = digest(final.inputs) === digest(this.initial.inputs) && final.stability === this.initial.stability && !final.unknown.length;
    const requiredComplete = (items: GatePhase[]): boolean => items.every(item =>
      (item.name !== "test" || this.requiredTestPhases.every(name => item.phases?.some(child => child.name === name))) && requiredComplete(item.phases ?? []));
    complete &&= requiredComplete(phases);
    const visit = (items: GatePhase[]) => { for (const phase of items) {
      if (phase.shadow) {
        const evidenceHashes: Record<string, string> = {};
        const collect = (item: GatePhase): boolean => {
          if (!item.ok || item.outcome !== "passed" || !item.finishedAt || item.durationMs === undefined) return false;
          if (item.name === "test" && this.requiredTestPhases.some(name => !item.phases?.some(child => child.name === name))) return false;
          if (item.phases?.some(child => !collect(child))) return false;
          if (!item.command) return !!item.phases?.length;
          if (!item.stdout || !item.stderr || item.exitCode !== 0) return false;
          try { for (const file of [item.stdout, item.stderr]) evidenceHashes[file] = hash(readFileSync(file)); return true; } catch { return false; }
        };
        const evidenceComplete = collect(phase);
        Object.assign(phase.shadow, { freshResult: phase.outcome, reusablePass: complete && stable && !phase.shadow.unknown.length && evidenceComplete, evidenceHashes });
        if (!stable) phase.shadow.reasons.push("inputs changed during execution or became unknown");
        if (!complete || !evidenceComplete) phase.shadow.reasons.push("incomplete or unsuccessful fresh evidence");
        if (phase.shadow.reusablePass) phase.shadow.reasons = [];
      }
      visit(phase.phases ?? []);
    } };
    visit(phases);
  }
  remember() {
    if (this.store) {
      mkdirSync(this.store, { recursive: true });
      writeFileSync(join(this.store, "latest.json"), JSON.stringify({ evidence: this.evidence, sha256: hash(readFileSync(this.evidence)) }));
    }
  }
}

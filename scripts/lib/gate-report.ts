import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, writeSync } from "node:fs";
import { cpus, release } from "node:os";
import { dirname, join } from "node:path";
import { GateShadow, git, type ShadowReceipt } from "./gate-shadow.ts";
import { sha256 as hash } from "../../plugin/skills/flow-page/scripts/files.ts";

export interface GatePhase {
  name: string;
  ok: boolean;
  outcome: "running" | "passed" | "failed" | "interrupted";
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  command?: string[];
  cwd: string;
  exitCode?: number;
  signal?: string;
  output: string;
  stdout?: string;
  stderr?: string;
  phases?: GatePhase[];
  shadow?: ShadowReceipt;
}

const fileHash = (root: string, file: string) => existsSync(join(root, file)) ? hash(readFileSync(join(root, file))) : null;

export class GateReport {
  readonly stages: GatePhase[] = [];
  readonly startedAt = new Date().toISOString();
  readonly identity;
  private readonly start = performance.now();
  private readonly active = new Map<GatePhase, number>();
  private readonly children = new Set<ChildProcess>();
  private serial = 0;
  private interruption?: NodeJS.Signals;
  private finishedAt?: string;
  private durationMs?: number;
  private readonly shadow?: GateShadow;
  private readonly onSignal = (signal: NodeJS.Signals) => {
    this.interruption = signal;
    for (const [phase, start] of this.active) {
      phase.outcome = "interrupted";
      phase.ok = false;
      if (phase.shadow) {
        phase.shadow.freshResult = "interrupted";
        phase.shadow.reusablePass = false;
        phase.shadow.reasons.push("interrupted execution");
      }
      phase.signal = signal;
      phase.durationMs = performance.now() - start;
    }
    this.save();
    for (const child of this.children) {
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch { /* A child can exit between receipt of the signal and forwarding it. */ }
    }
  };

  /** `shadow` captures this run's own inputs, is off, or reuses an outer gate run's shared capture file. */
  constructor(readonly root: string, readonly file: string, base?: string, private readonly phasesOnly = false, upstreams?: string, shadow: "own" | "off" | { shared: string } = "own") {
    mkdirSync(dirname(file), { recursive: true });
    const environment = Object.fromEntries(Object.entries(process.env).sort(([a], [b]) => a.localeCompare(b)));
    this.identity = {
      invocation: [process.execPath, ...process.argv.slice(1)],
      revision: { head: git(root, "rev-parse", "HEAD"), base: base ?? null, diffSha256: hash(git(root, "diff", "HEAD", "--binary") ?? ""), status: git(root, "status", "--porcelain=v1", "--untracked-files=all") },
      environment: {
        platform: process.platform, arch: process.arch, osRelease: release(), cpu: cpus()[0]?.model ?? null,
        executable: process.execPath, bun: Bun.version, node: process.version,
        git: Bun.spawnSync(["git", "--version"], { stdout: "pipe", stderr: "pipe" }).stdout.toString().trim(),
        variables: Object.fromEntries(["CI", "NODE_ENV", "TZ", "LANG", "LC_ALL", "VSTACK_BASE_REF"].map(key => [key, process.env[key] ?? null])),
        environmentSha256: hash(JSON.stringify(environment)),
        packageSha256: fileHash(root, "package.json"), lockSha256: fileHash(root, "bun.lock"),
        installedLockSha256: fileHash(root, "node_modules/.bun/lock"),
      },
    };
    if (shadow !== "off") this.shadow = new GateShadow(root, file, base, upstreams, shadow === "own" ? undefined : shadow.shared);
    process.on("SIGINT", this.onSignal);
    process.on("SIGTERM", this.onSignal);
    this.save();
  }

  /** Lets a nested test runner reuse this run's shadow capture; see `scripts/test.ts`. */
  shareShadow(file: string) { this.shadow?.share(file); }

  get interrupted() { return this.interruption !== undefined; }

  snapshot() {
    const interrupted = this.interrupted || this.stages.some(stage => stage.outcome === "interrupted");
    return {
      schema: 1, ok: this.finishedAt !== undefined && !interrupted && this.stages.every(stage => stage.ok),
      outcome: interrupted ? "interrupted" : !this.finishedAt ? "running" : this.stages.every(stage => stage.ok) ? "passed" : "failed",
      startedAt: this.startedAt, finishedAt: this.finishedAt, durationMs: this.durationMs,
      phaseOccupancyMs: this.stages.reduce((sum, stage) => sum + (stage.durationMs ?? 0), 0),
      identity: this.identity, stages: this.stages, evidence: this.file,
    };
  }

  save() {
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.phasesOnly ? this.stages : this.snapshot(), null, 2) + "\n");
    renameSync(temporary, this.file);
  }

  async phase(name: string, action: (phase: GatePhase) => Promise<void> | void, parent?: GatePhase, command?: string[], env: NodeJS.ProcessEnv = process.env): Promise<GatePhase> {
    const phase: GatePhase = { name, ok: false, outcome: "running", startedAt: new Date().toISOString(), cwd: this.root, output: "", command };
    (parent ? parent.phases ??= [] : this.stages).push(phase);
    this.shadow?.begin(phase, env);
    const start = performance.now();
    this.active.set(phase, start);
    this.save();
    try {
      if (this.interrupted) { phase.signal = this.interruption; phase.outcome = "interrupted"; }
      else {
        await action(phase);
        if (phase.outcome === "running") phase.outcome = phase.phases?.some(child => child.outcome === "interrupted") ? "interrupted" : phase.phases?.some(child => !child.ok) ? "failed" : "passed";
      }
    } catch (error) {
      phase.output += `${phase.output ? "\n" : ""}${(error as Error).stack ?? String(error)}`;
      phase.outcome = this.interrupted ? "interrupted" : "failed";
    } finally {
      this.active.delete(phase);
      if (!phase.output && phase.phases) phase.output = phase.phases.map(child => child.output).join("\n");
      phase.durationMs = performance.now() - start;
      phase.finishedAt = new Date().toISOString();
      phase.ok = phase.outcome === "passed";
      this.shadow?.end(phase, env);
      this.save();
    }
    return phase;
  }

  command(name: string, command: string[], parent?: GatePhase, env: NodeJS.ProcessEnv = process.env, mirror = false) {
    return this.phase(name, async phase => {
      const prefix = join(dirname(this.file), `${++this.serial}-${name.replaceAll("/", "_").replaceAll("\\", "_")}`);
      phase.stdout = `${prefix}.stdout`;
      phase.stderr = `${prefix}.stderr`;
      const stdout = openSync(phase.stdout, "w"), stderr = openSync(phase.stderr, "w");
      this.save();
      try {
        const child = spawn(command[0]!, command.slice(1), { cwd: this.root, env, detached: process.platform !== "win32", stdio: ["ignore", mirror ? "pipe" : stdout, mirror ? "pipe" : stderr] });
        if (mirror) {
          child.stdout!.on("data", (chunk: Buffer) => { writeSync(stdout, chunk); process.stdout.write(chunk); });
          child.stderr!.on("data", (chunk: Buffer) => { writeSync(stderr, chunk); process.stderr.write(chunk); });
        }
        this.children.add(child);
        try {
          const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
            child.once("error", reject);
            child.once("close", (code, signal) => resolve({ code, signal }));
          });
          if (result.code !== null) phase.exitCode = result.code;
          if (result.signal) phase.signal = result.signal;
          phase.outcome = this.interrupted || result.signal ? "interrupted" : result.code === 0 ? "passed" : "failed";
        } finally { this.children.delete(child); }
      } finally {
        closeSync(stdout); closeSync(stderr);
        phase.output = readFileSync(phase.stdout, "utf8") + readFileSync(phase.stderr, "utf8");
      }
    }, parent, command, env);
  }

  finish() {
    this.finishedAt = new Date().toISOString();
    this.durationMs = performance.now() - this.start;
    this.shadow?.finish(this.stages, !this.interrupted && this.stages.every(stage => stage.ok));
    this.save();
    this.shadow?.remember();
    process.off("SIGINT", this.onSignal);
    process.off("SIGTERM", this.onSignal);
    return this.snapshot();
  }
}

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeExecutable } from "./support/executable.ts";
import { ENV, git } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin/skills/vstack-fan-out/scripts/worker-clone.ts");
const FAKE = join(import.meta.dir, "support/fake-ovnfs.ts");
const REUSE = join(import.meta.dir, "support/worker-identity-reuse.ts");
const NATIVE = join(import.meta.dir, "support/worker-native-processes.ts");
const TERM_DEADLINE = join(import.meta.dir, "support/worker-term-deadline.ts");
let dir: string;
let repo: string;
let sourceRepo: string;
let base: string;
let entries: { name: string; path: string; source: string; dirty: boolean }[];
const processFixtures = new Map<number, string>();
const tempRunnerDirs = new Set<string>();

function liveCommand(pid: number): string | undefined {
  const ps = Bun.spawnSync(["ps", "-ww", "-o", "stat=,command=", "-p", String(pid)], { env: ENV });
  return ps.stdout.toString().trim().match(/^(?!Z)\S+\s+(.+)$/)?.[1];
}

function running(pid: number) {
  return liveCommand(pid)?.includes(processFixtures.get(pid) ?? "\0") ?? false;
}

async function waitUntil(check: () => boolean) {
  const deadline = performance.now() + 3_000;
  while (!check()) {
    if (performance.now() >= deadline) throw new Error("worker process fixture did not become ready");
    await Bun.sleep(20);
  }
}

beforeEach(() => {
  const sourceDir = mkdtempSync(join(process.platform === "darwin" ? "/var/tmp" : tmpdir(), "worker-clone-test-"));
  dir = realpathSync(sourceDir);
  repo = join(dir, "repo");
  sourceRepo = process.platform === "darwin" ? join(sourceDir, "repo") : repo;
  base = join(dir, "wt");
  mkdirSync(repo);
  mkdirSync(base);
  git(repo, "init", "-q");
  mkdirSync(join(dir, "bin"));
  for (const name of ["ovnfs", "omp"]) writeExecutable(join(dir, "bin", name), "bun", `await import(${JSON.stringify(FAKE)});`);
  entries = [];
});
afterEach(async () => {
  try {
    for (const pid of processFixtures.keys()) if (running(pid)) process.kill(pid, "SIGKILL");
    await waitUntil(() => [...processFixtures.keys()].every((pid) => !running(pid)));
  } finally {
    processFixtures.clear();
    rmSync(dir, { recursive: true, force: true });
    for (const path of tempRunnerDirs) rmSync(path, { recursive: true, force: true });
    tempRunnerDirs.clear();
  }
});

function status(ids: string[], before?: string, env: Record<string, string | undefined> = {}) {
  writeFileSync(join(dir, "checkouts.json"), JSON.stringify(entries));
  const r = Bun.spawnSync(["bun", SCRIPT, "status", ...ids, ...(before ? ["--before", before] : [])], {
    cwd: repo,
    env: { ...ENV, PATH: `${join(dir, "bin")}:${ENV.PATH}`, OMP_WORKTREE_DIR: base, FAKE_OVNFS_ROOT: dir, ...env },
    stdout: "pipe", stderr: "pipe",
  });
  expect(r.exitCode).toBe(0);
  return JSON.parse(r.stdout.toString());
}
function worker(id: string, mount = "mount") {
  const wrapper = join(base, `t${Bun.hash(`${sourceRepo}\0${id}`).toString(16).padStart(16, "0").slice(-9)}`);
  const record = join(wrapper, ".omp-ovnfs-checkout.json");
  const name = `omp-${id.toLowerCase()}-abc123`;
  const path = join(dir, mount, name);
  mkdirSync(wrapper, { recursive: true });
  mkdirSync(path, { recursive: true });
  writeFileSync(record, JSON.stringify({ command: join(dir, "bin/ovnfs"), checkout: name }));
  writeFileSync(join(path, "useful.patch"), "keep this work\n");
  entries.push({ name, path, source: repo, dirty: true });
  return { name, path, record };
}

function processWorker(id: string, { spelling, mount }: { spelling?: (path: string) => string; mount?: string } = {}) {
  const identity = worker(id, mount);
  const session = `session-${id}`;
  const parentSession = join(dir, "parent.jsonl");
  const sessionDir = join(dir, "parent");
  const sessionFile = join(sessionDir, `${id}.jsonl`);
  writeFileSync(parentSession, JSON.stringify({ type: "session", id: "parent", cwd: repo }) + "\n");
  mkdirSync(sessionDir, { recursive: true });
  const checkout = spelling ? spelling(identity.path) : identity.path;
  writeFileSync(sessionFile, [
    JSON.stringify({ type: "title", title: id }),
    JSON.stringify({ type: "session", version: 3, id: session, cwd: identity.path, parentSession }),
  ].join("\n") + "\n");
  const before = join(dir, "before.json");
  const saved = status([id]);
  expect(saved.workers[0].state).toBe("present");
  saved.workers[0].identity.path = checkout;
  writeFileSync(before, JSON.stringify(saved));
  return { ...identity, id, checkout, session, parentSession, sessionFile, before };
}

function processes(
  fixture: ReturnType<typeof processWorker>,
  args: string[] = [],
  { env = {}, ids = [fixture.id], preload }: { env?: Record<string, string>; ids?: string[]; preload?: string } = {},
) {
  const r = Bun.spawnSync(["bun", ...(preload ? ["--preload", preload] : []), SCRIPT, "processes", ...ids,
    "--before", fixture.before, ...args], {
    cwd: repo,
    env: { ...ENV, PATH: `${join(dir, "bin")}:${ENV.PATH}`, OMP_WORKTREE_DIR: base, PI_SESSION_FILE: fixture.parentSession, ...env },
    stdout: "pipe", stderr: "pipe",
  });
  if (r.exitCode !== 0) throw new Error(`processes exited ${r.exitCode}: ${r.stderr.toString()}`);
  return JSON.parse(r.stdout.toString());
}

function childEnv(session?: string) {
  return { PATH: ENV.PATH, ...(session === undefined ? {} : { OMP_BASH_SESSION: session }) };
}

const HOLD_PROCESS = "setInterval(() => {}, 1_000);";

test("processes stops a reparented nohup grandchild before worker release", async () => {
  const fixture = processWorker("Nohup", { spelling: (path) => path.replace(/^\/private(?=\/var\/tmp\/)/, "") });
  if (process.platform === "darwin") expect(fixture.checkout).not.toBe(fixture.path);
  const marker = `worker-nohup-${crypto.randomUUID()}`;
  const ready = join(dir, "grandchild-ready");
  const startup = `require("node:fs").writeFileSync(${JSON.stringify(ready)}, "ready"); ${HOLD_PROCESS}`;
  const intermediate = Bun.spawnSync([process.execPath, "-e", `
    const { spawn } = require("node:child_process");
    const [bun, program, marker] = process.argv.slice(1);
    const child = spawn("/usr/bin/nohup", [bun, "-e", program, marker], { detached: true, stdio: "ignore" });
    child.unref();
    console.log(child.pid);
  `, process.execPath, startup, marker], {
    cwd: fixture.path, env: childEnv(fixture.session), stdout: "pipe", stderr: "pipe",
  });
  const pid = Number(intermediate.stdout.toString().trim());
  if (pid > 1) processFixtures.set(pid, marker);
  expect(intermediate.stderr.toString()).toBe("");
  expect(intermediate.exitCode).toBe(0);
  expect(pid).toBeGreaterThan(1);
  await waitUntil(() => existsSync(ready) && running(pid));
  expect(Bun.spawnSync(["ps", "-o", "ppid=", "-p", String(pid)]).stdout.toString().trim()).toBe("1");

  const report = processes(fixture);
  expect(report.scan.ok).toBe(true);
  const preciseStart = process.platform === "darwin" ? /^\d+\.\d{6}$/ : /^\d+$/;
  expect(report.workers).toMatchObject([{
    id: fixture.id, checkout: fixture.checkout, session: fixture.session, release: "proceed",
    candidates: [{ pid, ppid: 1, started: expect.stringMatching(preciseStart), command: expect.stringContaining(marker),
      path: fixture.path, owner: "worker", service: false, outcome: "terminated" }],
  }]);
  expect(running(pid)).toBe(false);

  entries = [];
  rmSync(fixture.record);
  rmSync(fixture.path, { recursive: true });
  expect(status([fixture.id], fixture.before).workers[0].state).toBe("absent");
});

async function startCandidate(
  cwd: string,
  session?: string,
  onTerm = "",
  extra: { argv?: string[]; env?: Record<string, string> } = {},
) {
  const marker = `worker-candidate-${crypto.randomUUID()}`;
  const ready = join(dir, marker);
  const startup = `${onTerm} require("node:fs").writeFileSync(${JSON.stringify(ready)}, "ready"); ${HOLD_PROCESS}`;
  const child = Bun.spawn([process.execPath, "-e", startup, marker, ...(extra.argv ?? [])], {
    cwd, env: { ...childEnv(session), ...extra.env }, stdin: "ignore", stdout: "ignore", stderr: "ignore",
  });
  processFixtures.set(child.pid, marker);
  await waitUntil(() => existsSync(ready) && running(child.pid));
  return { pid: child.pid, marker };
}

test.each([
  { label: "non-ASCII", mount: "répertoire" },
  { label: "a tab", mount: "work\tmount" },
])("processes stops a tagged child in a checkout path containing $label", async ({ mount }) => {
  const fixture = processWorker("RawPath", { mount });
  const { pid } = await startCandidate(fixture.path, fixture.session);
  expect(processes(fixture)).toMatchObject({ scan: { ok: true }, workers: [{
    release: "proceed", candidates: [{ pid, path: fixture.path, owner: "worker", outcome: "terminated" }],
  }] });
  expect(running(pid)).toBe(false);
});

test("processes holds every candidate when one belongs to another session", async () => {
  const fixture = processWorker("Foreign");
  const own = await startCandidate(fixture.path, fixture.session);
  const foreign = await startCandidate(fixture.path, "another-session");
  const [worker] = processes(fixture).workers;
  expect(worker).toMatchObject({ release: "hold", reason: expect.stringContaining("another session") });
  expect(worker.candidates).toHaveLength(2);
  expect(worker.candidates).toEqual(expect.arrayContaining([
    expect.objectContaining({ pid: own.pid, path: fixture.path, owner: "worker", outcome: "held" }),
    expect.objectContaining({ pid: foreign.pid, path: fixture.path, command: expect.stringContaining(foreign.marker),
      owner: "other", outcome: "held" }),
  ]));
  expect(running(own.pid)).toBe(true);
  expect(running(foreign.pid)).toBe(true);
});

test("processes holds a candidate without a session tag", async () => {
  const fixture = processWorker("Untagged");
  const { pid } = await startCandidate(fixture.path);
  const [worker] = processes(fixture).workers;
  expect(worker).toMatchObject({ session: fixture.session, release: "hold", reason: expect.stringContaining("unproven"),
    candidates: [{ pid, owner: "unproven", outcome: "held" }] });
  expect(running(pid)).toBe(true);
});

const JS_EVAL_KERNEL = "__omp_worker_js_eval_process";

async function startEvalKernel(
  cwd: string,
  {
    kind = "js", reparented = false, script = JS_EVAL_KERNEL, args = [], session,
    runnerInCheckout = false, runnerMode = 0o700, interpreterInCheckout = false, nativeExeInCheckout = false,
  }: {
    kind?: "js" | "js-lookalike" | "python" | "python-unsigned";
    reparented?: boolean; script?: string; args?: readonly string[]; session?: string;
    runnerInCheckout?: boolean; runnerMode?: number; interpreterInCheckout?: boolean; nativeExeInCheckout?: boolean;
  } = {},
) {
  const ready = join(dir, "eval-ready");
  let argv: string[];
  let argv0: string | undefined;
  if (kind !== "js") {
    const python3 = Bun.which("python3");
    if (!python3) throw new Error("python3 on PATH is required for the eval kernel fixture");
    const source = `import pathlib, time\npathlib.Path(${JSON.stringify(ready)}).touch()\nwhile True:\n    time.sleep(60)\n`;
    if (kind === "js-lookalike") {
      writeFileSync(join(cwd, script), source);
      argv = [python3, script];
    } else {
      const suffix = crypto.getRandomValues(new BigUint64Array(1))[0];
      const runnerDir = join(runnerInCheckout ? cwd : realpathSync(tmpdir()), `omp-python-runner-${suffix}`);
      mkdirSync(runnerDir, { mode: 0o700 });
      if (!runnerInCheckout) tempRunnerDirs.add(runnerDir);
      chmodSync(runnerDir, runnerMode);
      script = join(runnerDir, "runner-fixture.py");
      const signature = kind === "python" ? `"""OMP Python runner — subprocess wrapper used by the coding-agent host.\n"""\n` : "";
      writeFileSync(script, signature + source);
      const interpreter = interpreterInCheckout || nativeExeInCheckout ? join(cwd, "python3") : python3;
      if (interpreterInCheckout) symlinkSync(python3, interpreter);
      if (nativeExeInCheckout) {
        copyFileSync(realpathSync(python3), interpreter);
        chmodSync(interpreter, 0o755);
        argv0 = python3;
      }
      argv = [interpreter, "-u", script];
    }
  } else {
    writeFileSync(join(cwd, script),
      `require("node:fs").writeFileSync(${JSON.stringify(ready)}, "ready"); ${HOLD_PROCESS}`);
    argv = [process.execPath, script, ...args];
  }
  const env = childEnv(session);
  let pid: number;
  if (reparented) {
    const intermediate = Bun.spawnSync([process.execPath, "-e", `
      const [exe, ...args] = process.argv.slice(1);
      const child = require("node:child_process").spawn(exe, args, { detached: true, stdio: "ignore" });
      child.unref();
      console.log(child.pid);
    `, ...argv], { cwd, env, stdout: "pipe", stderr: "pipe" });
    pid = Number(intermediate.stdout.toString().trim());
    if (pid > 1) processFixtures.set(pid, script);
    expect(intermediate.stderr.toString()).toBe("");
    expect(intermediate.exitCode).toBe(0);
    expect(pid).toBeGreaterThan(1);
  } else {
    const child = Bun.spawn(argv, { cwd, env, argv0, stdin: "ignore", stdout: "ignore", stderr: "ignore" });
    pid = child.pid;
    processFixtures.set(pid, script);
  }
  await waitUntil(() => existsSync(ready) && running(pid));
  return pid;
}

test.each([
  { name: "a JS stand-in sharing the CLI parent's Bun executable", kind: "js" },
  { name: "a signed Python runner in a private temp directory", kind: "python" },
])("processes leaves $name to omp", async ({ kind }) => {
  const fixture = processWorker("DirectEval");
  const pid = await startEvalKernel(fixture.path, { kind });
  const [worker] = processes(fixture).workers;
  expect(worker).toMatchObject({
    release: "proceed",
    candidates: [{ pid, ppid: process.pid, owner: "omp", service: false, outcome: "omp-managed" }],
  });
  expect(running(pid)).toBe(true);
});

test.each([
  { name: "a JS-shaped process with a different executable from the CLI parent's", kind: "js-lookalike" },
  { name: "a Python runner path without the omp signature", kind: "python-unsigned" },
  { name: "a signed Python runner inside the checkout", kind: "python", runnerInCheckout: true },
  { name: "a signed Python runner in a 0755 temp directory", kind: "python", runnerMode: 0o755 },
  { name: "a signed Python runner invoked by a Python symlink inside the checkout", kind: "python", interpreterInCheckout: true },
  { name: "a signed Python runner whose native executable is inside the checkout and argv0 is outside", kind: "python", nativeExeInCheckout: true },
])("processes holds $name", async ({ name: _, ...options }) => {
  const fixture = processWorker("LookalikeEval");
  const pid = await startEvalKernel(fixture.path, options);
  const [worker] = processes(fixture).workers;
  expect(worker).toMatchObject({
    release: "hold",
    candidates: [{ pid, ppid: process.pid, owner: "unproven", outcome: "held" }],
  });
  expect(running(pid)).toBe(true);
});

test("processes holds a JS eval-shaped process that is not a direct child of the same parent", async () => {
  const fixture = processWorker("ReparentedEval");
  const pid = await startEvalKernel(fixture.path, { reparented: true });
  const [worker] = processes(fixture).workers;
  expect(worker).toMatchObject({ release: "hold", candidates: [{ pid, owner: "unproven", outcome: "held" }] });
  expect(worker.candidates[0].ppid).not.toBe(process.pid);
  expect(running(pid)).toBe(true);
});

test.each([
  { name: "an extra argument", args: ["extra"] },
  { name: "the shell wrapper name", script: "__omp_worker_shell_process" },
])("processes holds a direct child with $name", async ({ args, script }) => {
  const fixture = processWorker("NearMissEval");
  const pid = await startEvalKernel(fixture.path, { args, script });
  const [worker] = processes(fixture).workers;
  expect(worker).toMatchObject({
    release: "hold",
    candidates: [{ pid, ppid: process.pid, owner: "unproven", outcome: "held" }],
  });
  expect(running(pid)).toBe(true);
});

test("processes holds an eval-shaped process tagged for another session", async () => {
  const fixture = processWorker("ForeignEval");
  const pid = await startEvalKernel(fixture.path, { session: "another-session" });
  const [worker] = processes(fixture).workers;
  expect(worker).toMatchObject({
    release: "hold",
    candidates: [{ pid, ppid: process.pid, owner: "other", outcome: "held" }],
  });
  expect(running(pid)).toBe(true);
});

test("processes stops a worker leftover without signaling its omp eval kernel", async () => {
  const fixture = processWorker("MixedEval");
  const kernel = await startEvalKernel(fixture.path);
  const leftover = await startCandidate(fixture.path, fixture.session);
  const [worker] = processes(fixture).workers;
  expect(worker).toMatchObject({ release: "proceed" });
  expect(worker.candidates).toHaveLength(2);
  expect(worker.candidates).toEqual(expect.arrayContaining([
    expect.objectContaining({ pid: kernel, owner: "omp", service: false, outcome: "omp-managed" }),
    expect.objectContaining({ pid: leftover.pid, owner: "worker", outcome: "terminated" }),
  ]));
  expect(running(kernel)).toBe(true);
  expect(running(leftover.pid)).toBe(false);
});

test.each(["argv", "another environment value"])("processes refuses a forged session tag in %s", async (source) => {
  const fixture = processWorker("Forged");
  const tag = `OMP_BASH_SESSION=${fixture.session}`;
  const extra = source === "argv" ? { argv: [tag] } : { env: { FIXTURE_TEXT: `unrelated ${tag} value` } };
  const { pid } = await startCandidate(fixture.path, undefined, "", extra);
  const [worker] = processes(fixture).workers;
  expect(worker).toMatchObject({
    session: fixture.session, release: "hold", candidates: [{ pid, owner: "unproven", outcome: "held" }],
  });
  expect(running(pid)).toBe(true);
});

test.each(["missing", "mismatched"])("processes holds a candidate with a %s worker session file", async (state) => {
  const fixture = processWorker("Session");
  if (state === "missing") rmSync(fixture.sessionFile);
  else writeFileSync(fixture.sessionFile, JSON.stringify({ type: "session", id: fixture.session, cwd: repo }) + "\n");
  const { pid } = await startCandidate(fixture.path, fixture.session);
  const [worker] = processes(fixture).workers;
  expect(worker).toMatchObject({ session: null, release: "hold", reason: expect.stringContaining(state === "missing" ? "ENOENT" : "cwd"),
    candidates: [{ pid, owner: "unproven", outcome: "held" }] });
  expect(running(pid)).toBe(true);
});

test.each(["unretained", "retained wrapper", "retained ancestor"])("processes handles a service tree (%s)", async (mode) => {
  const fixture = processWorker("Service");
  const wrapperMarker = `worker-wrapper-${crypto.randomUUID()}`;
  const childMarker = `worker-served-${crypto.randomUUID()}`;
  const childPidFile = join(dir, "service-child");
  const ready = join(dir, "service-ready");
  const startup = `require("node:fs").writeFileSync(${JSON.stringify(ready)}, "ready"); ${HOLD_PROCESS}`;
  const wrapperProgram = [
    'const [bun, program, childMarker, cwd, pidFile] = process.argv.slice(1);',
    'const child = require("node:child_process").spawn(bun, ["-e", program, childMarker], { cwd, stdio: "ignore" });',
    'require("node:fs").writeFileSync(pidFile, String(child.pid));',
    HOLD_PROCESS,
  ].join(" ");
  const wrapper = Bun.spawn([process.execPath, "-e", wrapperProgram, process.execPath, startup, childMarker,
    fixture.path, childPidFile, wrapperMarker], {
    cwd: mode === "retained ancestor" ? repo : fixture.path,
    env: childEnv(fixture.session), stdin: "ignore", stdout: "ignore", stderr: "ignore",
  });
  processFixtures.set(wrapper.pid, wrapperMarker);
  await waitUntil(() => existsSync(childPidFile) && readFileSync(childPidFile, "utf8").length > 0);
  const childPid = Number(readFileSync(childPidFile, "utf8"));
  expect(childPid).toBeGreaterThan(1);
  processFixtures.set(childPid, childMarker);
  await waitUntil(() => existsSync(ready) && running(wrapper.pid) && running(childPid));

  const keep = mode !== "unretained";
  const [worker] = processes(fixture, keep ? ["--service", String(wrapper.pid)] : []).workers;
  expect(worker.release).toBe(keep ? "hold" : "proceed");
  if (keep) expect(worker.reason).toContain("service");
  expect(worker.candidates.map(({ pid }: { pid: number }) => pid).sort()).toEqual(
    (mode === "retained ancestor" ? [childPid] : [wrapper.pid, childPid]).sort(),
  );
  expect(worker.candidates).toContainEqual(expect.objectContaining({ pid: childPid, ppid: wrapper.pid }));
  for (const candidate of worker.candidates) {
    expect(candidate).toMatchObject({ path: fixture.path, owner: "worker", service: keep, outcome: keep ? "held" : "terminated" });
  }
  expect(running(wrapper.pid)).toBe(keep);
  expect(running(childPid)).toBe(keep);
});

test("processes escalates to SIGKILL when a candidate ignores SIGTERM", async () => {
  const fixture = processWorker("Stubborn");
  const term = join(dir, "term-signal");
  const { pid } = await startCandidate(fixture.path, fixture.session,
    `process.on("SIGTERM", () => require("node:fs").writeFileSync(${JSON.stringify(term)}, "SIGTERM"));`);
  const [worker] = processes(fixture).workers;
  expect(worker).toMatchObject({ release: "proceed", candidates: [{ pid, outcome: "killed" }] });
  expect(readFileSync(term, "utf8")).toBe("SIGTERM");
  expect(running(pid)).toBe(false);
});

test.each(["gone", "reused", "gone-at-kill"])("processes reports a delivered SIGTERM when the PID is %s at escalation", async (state) => {
  const fixture = processWorker("TermDeadline");
  const term = join(dir, "term-signal");
  const attempts = join(dir, "signal-attempts");
  const exitGate = join(dir, "exit-at-kill");
  const actOnTerm = state === "gone-at-kill"
    ? `setInterval(() => { if (require("node:fs").existsSync(${JSON.stringify(exitGate)})) process.exit(0); }, 5);`
    : state === "gone" ? "process.exit(0);" : "";
  const { pid } = await startCandidate(fixture.path, fixture.session,
    `process.on("SIGTERM", () => { require("node:fs").writeFileSync(${JSON.stringify(term)}, "SIGTERM"); ${actOnTerm} });`);
  const [worker] = processes(fixture, [], {
    preload: TERM_DEADLINE, env: {
      VSTACK_FIXTURE_REUSE_PID: String(pid), VSTACK_FIXTURE_SIGNAL_ATTEMPTS: attempts,
      ...(state === "reused" ? { VSTACK_FIXTURE_REUSE_ON_READ: "6" } : {}),
      ...(state === "gone-at-kill" ? { VSTACK_FIXTURE_EXIT_GATE: exitGate } : {}),
    },
  }).workers;
  expect(readFileSync(attempts, "utf8")).toBe(`${pid} SIGTERM\n${state === "gone-at-kill" ? `${pid} SIGKILL\n` : ""}`);
  await waitUntil(() => existsSync(term));
  expect(readFileSync(term, "utf8")).toBe("SIGTERM");
  expect(running(pid)).toBe(state === "reused");
  expect(worker).toMatchObject({ release: "proceed", candidates: [{ pid, outcome: "terminated" }] });
});

test("processes counts an unreaped zombie as terminated", async () => {
  const fixture = processWorker("Zombie");
  const parentMarker = `worker-zombie-parent-${crypto.randomUUID()}`;
  const childMarker = `worker-zombie-child-${crypto.randomUUID()}`;
  const pidFile = join(dir, "zombie-child");
  const ready = join(dir, "zombie-ready");
  const childProgram = `require("node:fs").writeFileSync(${JSON.stringify(ready)}, "ready"); ${HOLD_PROCESS}`;
  const nonReapingParent = [
    "const [bun, program, marker, cwd, pidFile] = process.argv.slice(1);",
    'const child = Bun.spawn([bun, "-e", program, marker], { cwd, stdin: "ignore", stdout: "ignore", stderr: "ignore" });',
    'require("node:fs").writeFileSync(pidFile, String(child.pid));',
    "Bun.sleepSync(30_000);",
  ].join(" ");
  const parent = Bun.spawn([process.execPath, "-e", nonReapingParent, process.execPath, childProgram, childMarker,
    fixture.path, pidFile, parentMarker], {
    cwd: repo, env: childEnv(fixture.session), stdin: "ignore", stdout: "ignore", stderr: "ignore",
  });
  processFixtures.set(parent.pid, parentMarker);
  await waitUntil(() => existsSync(pidFile) && readFileSync(pidFile, "utf8").length > 0);
  const pid = Number(readFileSync(pidFile, "utf8"));
  processFixtures.set(pid, childMarker);
  await waitUntil(() => existsSync(ready) && running(pid));

  const [worker] = processes(fixture).workers;
  expect(worker).toMatchObject({ release: "proceed", candidates: [{ pid, ppid: parent.pid, outcome: "terminated" }] });
  const ps = Bun.spawnSync(["ps", "-o", "ppid=,stat=", "-p", String(pid)]);
  expect(ps.stdout.toString().trim()).toMatch(new RegExp(`^${parent.pid}\\s+Z`));
  expect(running(parent.pid)).toBe(true);
});

test("processes holds when the native path recheck places a tagged PID outside the checkout", async () => {
  const fixture = processWorker("Outside");
  const term = join(dir, "outside-term");
  const { pid } = await startCandidate(fixture.path, fixture.session,
    `process.on("SIGTERM", () => require("node:fs").writeFileSync(${JSON.stringify(term)}, "SIGTERM"));`);
  const [worker] = processes(fixture, [], {
    preload: NATIVE, env: { VSTACK_FIXTURE_NATIVE_PATH_PID: String(pid), VSTACK_FIXTURE_NATIVE_OUTSIDE_PATH: repo },
  }).workers;
  expect(worker).toMatchObject({ release: "hold", candidates: [{ pid, owner: "unproven", outcome: "held" }] });
  expect(existsSync(term)).toBe(false);
  expect(running(pid)).toBe(true);
});

test.each(["cwd", "exe"])("processes stops a tagged child with only one readable checkout path when %s is unreadable", async (unreadable) => {
  const fixture = processWorker("OnePath");
  const { path, session } = fixture;
  const pid = unreadable === "cwd"
    ? await startEvalKernel(path, { kind: "python", nativeExeInCheckout: true, session })
    : (await startCandidate(path, session)).pid;
  const [worker] = processes(fixture, [], {
    preload: NATIVE, env: { VSTACK_FIXTURE_NATIVE_PATH_PID: String(pid), VSTACK_FIXTURE_UNREADABLE_PATH: unreadable },
  }).workers;
  expect(worker).toMatchObject({ release: "proceed", candidates: [{
    pid, path: unreadable === "cwd" ? join(path, "python3") : path, owner: "worker", outcome: "terminated",
  }] });
  expect(running(pid)).toBe(false);
});

test.each(["reused", "exited"])("processes reports a PID %s after path discovery without attempting a signal", async (state) => {
  const fixture = processWorker("DiscoveryIdentity");
  const { pid } = await startCandidate(fixture.path, fixture.session);
  const scanned = join(dir, "paths-scanned");
  const attempts = join(dir, "signal-attempts");
  writeFileSync(attempts, "");
  writeExecutable(join(dir, "bin", "ps"), "sh", ': > "$VSTACK_FIXTURE_REUSE_AFTER_DISCOVERY"\nexec /bin/ps "$@"');
  const report = processes(fixture, [], {
    preload: REUSE, env: {
      VSTACK_FIXTURE_REUSE_PID: String(pid),
      VSTACK_FIXTURE_REUSE_AFTER_DISCOVERY: scanned,
      VSTACK_FIXTURE_SIGNAL_ATTEMPTS: attempts,
      ...(state === "exited" ? { VSTACK_FIXTURE_IDENTITY_FAILURE: "exited" } : {}),
    },
  });
  expect(existsSync(scanned)).toBe(true);
  expect(readFileSync(attempts, "utf8")).toBe("");
  expect(report).toMatchObject({ scan: { ok: true }, workers: [{
    release: "proceed", candidates: [{ pid, owner: "unproven", outcome: state === "exited" ? "exited" : "skipped-reused" }],
  }] });
  expect(running(pid)).toBe(true);
});

test.each([
  { point: "during ownership proof", read: 3, release: "hold", owner: "unproven", outcome: "held" },
  { point: "before signaling", read: 4, release: "proceed", owner: "worker", outcome: "skipped-reused" },
])("processes refuses to signal a replaced PID $point", async ({ read, release, owner, outcome }) => {
  const fixture = processWorker("Reused");
  const { pid } = await startCandidate(fixture.path, fixture.session);
  const [worker] = processes(fixture, [], {
    preload: REUSE, env: { VSTACK_FIXTURE_REUSE_PID: String(pid), VSTACK_FIXTURE_REUSE_ON_READ: String(read) },
  }).workers;
  expect(worker).toMatchObject({ release, candidates: [{ pid, owner, outcome }] });
  expect(running(pid)).toBe(true);
});

test("processes sends no signal to a sibling when its worker fails identity preflight", async () => {
  const fixture = processWorker("Preflight");
  const siblingTerm = join(dir, "sibling-term");
  const sibling = await startCandidate(fixture.path, fixture.session,
    `process.on("SIGTERM", () => { require("node:fs").writeFileSync(${JSON.stringify(siblingTerm)}, "SIGTERM"); process.exit(0); });`);
  const uncertain = await startCandidate(fixture.path, fixture.session);
  const [worker] = processes(fixture, [], {
    preload: REUSE, env: { VSTACK_FIXTURE_REUSE_PID: String(uncertain.pid), VSTACK_FIXTURE_REUSE_ON_READ: "4",
      VSTACK_FIXTURE_IDENTITY_FAILURE: "invalid" },
  }).workers;
  expect(existsSync(siblingTerm)).toBe(false);
  expect(running(sibling.pid)).toBe(true);
  expect(running(uncertain.pid)).toBe(true);
  expect(worker).toMatchObject({ release: "hold", reason: expect.stringContaining("preflight") });
  expect(worker.candidates).toHaveLength(2);
  expect(worker.candidates).toEqual(expect.arrayContaining([
    expect.objectContaining({ pid: sibling.pid, owner: "worker", outcome: "held" }),
    expect.objectContaining({ pid: uncertain.pid, owner: "unproven", outcome: "held" }),
  ]));
});

test.skipIf(process.platform !== "darwin")("processes stops signaling partway through a worker batch on an unreadable identity", async () => {
  const fixture = processWorker("Partial");
  const term = join(dir, "first-term");
  const first = await startCandidate(fixture.path, fixture.session,
    `process.on("SIGTERM", () => { require("node:fs").writeFileSync(${JSON.stringify(term)}, "SIGTERM"); process.exit(0); });`);
  const uncertain = await startCandidate(fixture.path, fixture.session);
  const later = await startCandidate(fixture.path, fixture.session);
  const [worker] = processes(fixture, [], {
    preload: NATIVE, env: {
      VSTACK_FIXTURE_PID_LIST: [first.pid, uncertain.pid, later.pid].join(","),
      VSTACK_FIXTURE_REUSE_PID: String(uncertain.pid), VSTACK_FIXTURE_REUSE_ON_READ: "5",
      VSTACK_FIXTURE_IDENTITY_FAILURE: "invalid",
    },
  }).workers;
  expect(worker).toMatchObject({
    release: "hold", reason: expect.stringContaining("stopped partway"),
    candidates: [
      { pid: first.pid, owner: "worker", outcome: "terminated" },
      { pid: uncertain.pid, owner: "unproven", outcome: "held" },
      { pid: later.pid, owner: "worker", outcome: "held" },
    ],
  });
  expect(existsSync(term)).toBe(true);
  expect(running(first.pid)).toBe(false);
  expect(running(uncertain.pid)).toBe(true);
  expect(running(later.pid)).toBe(true);
});

test.each([
  { failure: "permission", read: 1, owner: "unproven", outcome: "held" },
  { failure: "permission", read: 3, owner: "unproven", outcome: "held" },
  { failure: "invalid", read: 4, owner: "unproven", outcome: "held" },
  { failure: "missing errno", read: 5, owner: "unproven", outcome: "held" },
  { failure: "invalid", read: 6, owner: "worker", outcome: "survived" },
])("processes holds on $failure from the identity lookup", async ({ failure, read, owner, outcome }) => {
  const fixture = processWorker("Unreadable");
  const term = join(dir, "unreadable-term");
  const { pid } = await startCandidate(fixture.path, fixture.session,
    `process.on("SIGTERM", () => require("node:fs").writeFileSync(${JSON.stringify(term)}, "SIGTERM"));`);
  const [worker] = processes(fixture, [], {
    preload: REUSE, env: { VSTACK_FIXTURE_REUSE_PID: String(pid), VSTACK_FIXTURE_REUSE_ON_READ: String(read),
      VSTACK_FIXTURE_IDENTITY_FAILURE: failure },
  }).workers;
  expect(worker).toMatchObject({ release: "hold", candidates: [{ pid, owner, outcome }] });
  expect(existsSync(term)).toBe(read === 6);
  expect(running(pid)).toBe(true);
});

test.skipIf(process.platform !== "darwin")("processes holds every worker when native PID enumeration fails", async () => {
  const first = processWorker("ScanFirst");
  const second = processWorker("ScanSecond");
  writeFileSync(first.before, JSON.stringify(status([first.id, second.id])));
  const candidates = await Promise.all([first, second].map(async ({ path, session }, i) => {
    const term = join(dir, `scan-term-${i}`);
    const { pid } = await startCandidate(path, session,
      `process.on("SIGTERM", () => { require("node:fs").writeFileSync(${JSON.stringify(term)}, "SIGTERM"); process.exit(0); });`);
    return { pid, term };
  }));
  const report = processes(first, [], {
    ids: [first.id, second.id], preload: NATIVE,
    env: { VSTACK_FIXTURE_PID_LIST: candidates.map(({ pid }) => pid).join(","), VSTACK_FIXTURE_FAIL_PID_LIST: "1" },
  });
  expect(report.scan).toMatchObject({ ok: false, reason: expect.stringContaining("proc_listallpids could not read the PID list") });
  expect(report.workers).toMatchObject([first, second].map(({ id }) => ({ id, release: "hold", reason: report.scan.reason })));
  for (const { pid, term } of candidates) {
    expect(existsSync(term)).toBe(false);
    expect(running(pid)).toBe(true);
  }
});

test("processes proceeds when no process matches a saved checkout", () => {
  const fixture = processWorker("Empty");
  const next = processWorker("Next");
  writeFileSync(fixture.before, JSON.stringify(status([fixture.id, next.id, "Unknown"])));

  const report = processes(fixture, [], { ids: [fixture.id, next.id, "Unknown"] });
  expect(report).toMatchObject({ scan: { ok: true }, workers: [
    { id: fixture.id, release: "proceed", candidates: [] },
    { id: next.id, release: "proceed", candidates: [] },
    { id: "Unknown", checkout: null, release: "hold", reason: expect.stringContaining("Saved status"), candidates: [] },
  ] });
});

test("processes holds and reports a discovered candidate when ps cannot read its facts", async () => {
  const fixture = processWorker("NoFacts");
  const { pid } = await startCandidate(fixture.path, fixture.session);
  writeExecutable(join(dir, "bin", "ps"), "sh", 'echo "fixture process facts unavailable" >&2; exit 1');
  const report = processes(fixture);
  expect(report).toMatchObject({
    scan: { ok: false, reason: expect.stringContaining("fixture process facts unavailable") },
    workers: [{ release: "hold", candidates: [{ pid, path: fixture.path, owner: "unproven", outcome: "held" }] }],
  });
  expect(running(pid)).toBe(true);
});

test("status finds the ovnfs checkout named by the worker run record without touching work", () => {
  const identity = worker("Implementer");
  const other = worker("Other");
  expect(status(["Implementer"])).toMatchObject({ repo, base, listing: { ok: true }, workers: [{ id: "Implementer", clone: identity.path, identity, state: "present" }] });
  expect(readFileSync(join(identity.path, "useful.patch"), "utf8")).toBe("keep this work\n");
  expect(existsSync(other.path)).toBe(true);
});

test("status keeps a worker present when a different ovnfs is on PATH", () => {
  const identity = worker("Configured");
  const configured = join(dir, "configured-ovnfs");
  writeExecutable(configured, "bun", `await import(${JSON.stringify(FAKE)});`);
  writeExecutable(join(dir, "bin/ovnfs"), "bun", `console.log('{"checkouts":[]}');`);
  expect(status(["Configured"], undefined, { FAKE_OVNFS_PATH: configured })).toMatchObject({
    listing: { ok: true, command: configured }, workers: [{ state: "present", identity }],
  });
});

test("status proves absence only against a saved present identity after both items disappear", () => {
  const identity = worker("Gone");
  const before = join(dir, "before.json");
  writeFileSync(before, JSON.stringify(status(["Gone"])));
  entries = [];
  rmSync(identity.record);
  rmSync(identity.path, { recursive: true });
  expect(status(["Gone"], before).workers[0]).toMatchObject({ state: "absent", identity, clone: identity.path });
  expect(status(["Gone"]).workers[0].state).toBe("unknown");
});

test.each(["record", "checkout", "directory"])("missing %s before release stays unknown and preserves other work", (missing) => {
  const identity = worker("Held");
  if (missing === "record") rmSync(identity.record);
  if (missing === "checkout") entries = [];
  if (missing === "directory") rmSync(identity.path, { recursive: true });
  expect(status(["Held"]).workers[0].state).toBe("unknown");
  if (missing !== "directory") expect(readFileSync(join(identity.path, "useful.patch"), "utf8")).toBe("keep this work\n");
});

test.each(["record", "checkout", "both"])("%s surviving release cannot prove removal", (survivor) => {
  const identity = worker("Held");
  const before = join(dir, "before.json");
  writeFileSync(before, JSON.stringify(status(["Held"])));
  if (survivor !== "record" && survivor !== "both") rmSync(identity.record);
  if (survivor !== "checkout" && survivor !== "both") entries = [];
  rmSync(identity.path, { recursive: true });
  expect(status(["Held"], before).workers[0]).toMatchObject({ state: "unknown", identity });
});

test("the successful ovnfs listing and missing run record prove removal even if an empty mount directory remains", () => {
  const identity = worker("Gone");
  const before = join(dir, "before.json");
  writeFileSync(before, JSON.stringify(status(["Gone"])));
  entries = [];
  rmSync(identity.record);
  rmSync(join(identity.path, "useful.patch"));
  expect(status(["Gone"], before).workers[0]).toMatchObject({ state: "absent", identity });
});

test.each([
  { FAKE_OVNFS_LIST_FAIL: "1" },
  { FAKE_OVNFS_LISTING: "{" },
  { FAKE_OVNFS_LISTING: "{}" },
  { FAKE_OVNFS_LISTING: '{"checkouts":[null]}' },
  { FAKE_OVNFS_LISTING: '{"checkouts":[{\"name\":\"omp-held\",\"path\":\"relative\",\"source\":\"/repo\"}]}' },
])("failed listing %j cannot prove presence or removal", (env) => {
  const identity = worker("Held");
  const before = join(dir, "before.json");
  writeFileSync(before, JSON.stringify(status(["Held"])));
  for (const prior of [undefined, before]) {
    const result = status(["Held"], prior, env);
    expect(result.listing.ok).toBe(false);
    expect(result.workers[0].state).toBe("unknown");
  }
  expect(existsSync(identity.path)).toBe(true);
});

test.each(["{", "{}", '{"command":"ovnfs","checkout":"foreign"}'])("invalid run record %s stays unknown", (value) => {
  const identity = worker("Held");
  writeFileSync(identity.record, value);
  expect(status(["Held"]).workers[0].state).toBe("unknown");
  expect(existsSync(identity.path)).toBe(true);
});

test("a listing from another source cannot identify this worker", () => {
  worker("Held");
  entries[0].source = dir;
  expect(status(["Held"]).workers[0].state).toBe("unknown");
});

test("an unknown saved status cannot become an absence proof", () => {
  const before = join(dir, "before.json");
  writeFileSync(before, JSON.stringify(status(["Missing"])));
  expect(status(["Missing"], before).workers[0].state).toBe("unknown");
});

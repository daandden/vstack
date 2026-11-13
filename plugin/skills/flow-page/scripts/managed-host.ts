import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { coherentRuntime, runtimePackages, skillsRoot, stageRuntime } from "./generation.ts";
import { attest, hostDir, originOf, record, recordPath, same, secrets, type HostRecord } from "./live.ts";
import { writeAtomic } from "./store.ts";
import { installedSkills, isNormalHome } from "./home.ts";

const { values } = parseArgs({ args: Bun.argv.slice(2), options: { home: { type: "string" }, port: { type: "string" }, idle: { type: "string" } }, strict: true });
const home = values.home!, port = Number(values.port), idle = Number(values.idle);
if (!home || !Number.isInteger(port) || !Number.isFinite(idle) || idle <= 0) throw new Error("managed host needs --home, --port, and positive --idle");
const source = installedSkills(home);
if (realpathSync(source) !== realpathSync(skillsRoot) || !isNormalHome(home)) throw new Error("only the installed runtime can own the normal Flow host");
const secret = secrets(home), instance = randomBytes(16).toString("hex"), started = new Date().toISOString();
const generations = join(hostDir(home), "generations");
mkdirSync(generations, { recursive: true, mode: 0o700 });
type Candidate = { child: ReturnType<typeof Bun.spawn>; folder: string; port: number; version: string; bun: string; pending: number; retired: boolean };
let current: Candidate | undefined, stopping = false, preparing = false, attempted = "";
const workers = new Set<Candidate>();
const runtime = () => {
  const executable = realpathSync(Bun.which("bun") ?? process.execPath), stat = statSync(executable);
  return { executable, identity: `${executable}:${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}` };
};
function stopWorker(worker: Candidate) {
  if (worker.child.exitCode === null) worker.child.kill("SIGTERM");
  void worker.child.exited.finally(() => { workers.delete(worker); rmSync(worker.folder, { recursive: true, force: true }); });
}
function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  server?.stop(true);
  for (const worker of workers) stopWorker(worker);
  if (record(home)?.instance === instance) rmSync(recordPath(home), { force: true });
  void Promise.all([...workers].map(worker => worker.child.exited)).finally(() => process.exit(0));
}
async function prepare() {
  if (preparing || stopping) return;
  preparing = true;
  let worker: Candidate | undefined, folder: string | undefined;
  try {
    const files = coherentRuntime(source), packages = runtimePackages(source), executable = runtime();
    const fingerprint = createHash("sha256").update(executable.identity);
    for (const [name, bytes] of files) fingerprint.update(name).update(bytes);
    for (const [name, root] of packages) fingerprint.update(name).update(readFileSync(join(root, "package.json")));
    const signature = fingerprint.digest("hex");
    if (signature === attempted) return;
    attempted = signature;
    folder = join(generations, randomBytes(12).toString("hex"));
    stageRuntime(files, packages, folder);
    const check = coherentRuntime(source);
    if (check.size !== files.size || [...files].some(([name, bytes]) => !check.get(name)?.equals(bytes)) || runtime().identity !== executable.identity) throw new Error("installed Flow runtime changed during preparation");
    let ready: { port: number; version: string } | undefined;
    const child = Bun.spawn([executable.executable, join(folder, "flow-page/scripts/host.ts"), "--home", home, "--port", String(port), "--idle", String(idle)], {
      cwd: hostDir(home), env: { PATH: process.env.PATH, HOME: home, VSTACK_FLOW_WORKER: "1" }, stdout: "inherit", stderr: "inherit",
      ipc(message: unknown) {
        if (message && typeof message === "object" && "port" in message && typeof message.port === "number" && "version" in message && typeof message.version === "string") ready = { port: message.port, version: message.version };
      },
    });
    worker = { child, folder, port: 0, version: "", bun: "", pending: 0, retired: false };
    workers.add(worker);
    for (const end = Date.now() + 8000; !ready && child.exitCode === null && Date.now() < end; await Bun.sleep(25));
    if (!ready || child.exitCode !== null) throw new Error("candidate Flow host failed startup");
    const nonce = randomBytes(32).toString("hex");
    const response = await fetch(`${originOf(ready.port)}/.host/hello`, { headers: { host: `127.0.0.1:${port}`, "x-flow-challenge": nonce }, signal: AbortSignal.timeout(1000) });
    const hello: unknown = await response.json();
    if (!response.ok || !hello || typeof hello !== "object" || !("instance" in hello) || typeof hello.instance !== "string" || !("proof" in hello) || typeof hello.proof !== "string" || !same(hello.proof, attest(secret.control, nonce, ready.version, hello.instance))) throw new Error("candidate Flow host did not authenticate");
    if (stopping || child.exitCode !== null || runtime().identity !== executable.identity) throw new Error("candidate runtime changed before activation");
    coherentRuntime(source);
    const previous = current;
    worker.port = ready.port;
    worker.version = ready.version;
    const bunVersion = Bun.spawnSync([executable.executable, "--version"], { stdout: "pipe", stderr: "pipe" });
    if (bunVersion.exitCode !== 0) throw new Error("candidate Bun runtime is unavailable");
    worker.bun = bunVersion.stdout.toString().trim();
    const metadata: HostRecord = { pid: process.pid, port, version: worker.version, started, instance, bun: worker.bun };
    writeAtomic(recordPath(home), JSON.stringify(metadata));
    current = worker;
    void child.exited.then(() => { if (current?.child === child && !stopping) shutdown(); });
    if (previous) {
      previous.retired = true;
      if (previous.pending === 0) stopWorker(previous);
    }
  } catch (error) {
    process.stderr.write(`Flow candidate refused: ${(error as Error).message}\n`);
    if (worker) stopWorker(worker);
    else if (folder) rmSync(folder, { recursive: true, force: true });
  } finally { preparing = false; }
}
let server: ReturnType<typeof Bun.serve>;
const timer = setInterval(() => void prepare(), 1000);
await prepare();
if (!current) { clearInterval(timer); throw new Error("no complete installed Flow generation could start; no listener was replaced"); }
try {
  server = Bun.serve({ hostname: "127.0.0.1", port, idleTimeout: 0, async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get("host") !== `127.0.0.1:${port}` || request.headers.has("origin") && request.headers.get("origin") !== originOf(port) || request.headers.get("sec-fetch-site") === "cross-site") return new Response("Invalid host or origin.", { status: 403 });
    if (url.pathname === "/.host/hello" && request.method === "GET") {
      const nonce = request.headers.get("x-flow-challenge") ?? "";
      if (!/^[a-f0-9]{64}$/.test(nonce)) return new Response("Not authorized.", { status: 401 });
      return Response.json({ app: "vstack-flow-host", version: current!.version, instance, proof: attest(secret.control, nonce, current!.version, instance) });
    }
    if (url.pathname === "/.host/stop" && request.method === "POST") {
      if (!same(request.headers.get("authorization") ?? "", `Bearer ${secret.control}`)) return new Response("Not authorized.", { status: 401 });
      setTimeout(shutdown, 50);
      return new Response("Stopping.");
    }
    const worker = current!;
    worker.pending++;
    try {
      const target = new URL(request.url); target.port = String(worker.port);
      const upstream = await fetch(target, { method: request.method, headers: request.headers, body: request.body, redirect: "manual", signal: request.signal });
      if (url.pathname === "/.host/hold") return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
      const body = request.method === "HEAD" ? null : await upstream.arrayBuffer();
      return new Response(body, { status: upstream.status, headers: upstream.headers });
    } catch { return new Response("Flow presentation is unavailable. The committed Flow content is unchanged.", { status: 503 }); }
    finally { worker.pending--; if (worker.retired && worker.pending === 0) stopWorker(worker); }
  } });
} catch (error) { shutdown(); throw error; }
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

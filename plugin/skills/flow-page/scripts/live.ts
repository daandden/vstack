import { spawn } from "node:child_process";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runtimeFiles, skillsRoot } from "./generation.ts";
import { walkFiles, withLock } from "./files.ts";
import { isNormalHome } from "./home.ts";

export const hostDir = (home: string) => join(home, ".vstack", "host");
export const originOf = (port: number) => `http://127.0.0.1:${port}`;
export type Secrets = { read: string; control: string };
export type HostRecord = { pid: number; port: number; version: string; started: string; instance: string; bun: string };
/** What the host knows about each runnable artifact: its isolated viewer URL, or why it cannot be shown now. */
export type Runtimes = Record<string, { url?: string; reason?: string }>;
export const recordPath = (home: string) => join(hostDir(home), "host.json");
export function record(home: string): HostRecord | undefined {
  try { return JSON.parse(readFileSync(recordPath(home), "utf8")); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw e; }
}
export function secrets(home: string): Secrets {
  const dir = hostDir(home);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const path = join(dir, "secrets.json");
  try {
    writeFileSync(path, JSON.stringify({ read: randomBytes(32).toString("hex"), control: randomBytes(32).toString("hex") }), { flag: "wx", mode: 0o600 });
  } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
  chmodSync(path, 0o600);
  return JSON.parse(readFileSync(path, "utf8"));
}
export const same = (a: string, b: string) => Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const capability = (secret: string, key: string, id: string) => createHmac("sha256", secret).update(`flow-read-v1\n${key}\n${id}`).digest("hex");
export const attest = (control: string, nonce: string, version: string, instance: string) => createHmac("sha256", control).update(`flow-host-proof-v1\n${nonce}\n${version}\n${instance}`).digest("hex");
export const flowUrl = (port: number, secret: string, key: string, id: string) => `${originOf(port)}/f/${encodeURIComponent(key)}/${id}/${capability(secret, key, id)}/`;

export const readerDir = resolve(process.env.FLOW_READER_ASSETS ?? join(import.meta.dir, "..", "reader"));

/** Every file of the shipped reader by its path relative to `readerDir`, sorted, or an error when it is not built. */
export function readerBundle(): Map<string, Uint8Array<ArrayBuffer>> {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  try { walkFiles(readerDir, (path, full) => files.set(path, readFileSync(full)), { skip: name => name === "server" }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  if (!files.has("index.html")) throw new Error(`the Flow reader is not built: ${join(readerDir, "index.html")} is missing; run vp run reader:build in the vstack checkout`);
  return files;
}

/** Identifies the host code, the Bun runtime, and the exact reader bytes a host serves. */
export function version(bundle = readerBundle()): string {
  const hash = createHash("sha256").update(`flow-host-v3\n${Bun.version}\n`);
  for (const [path, bytes] of runtimeFiles(skillsRoot)) {
    if (!path.startsWith("flow-page/reader/") || path.startsWith("flow-page/reader/server/")) hash.update(`source\n${path}\n`).update(bytes);
  }
  for (const [path, bytes] of bundle) hash.update(`reader\n${path}\n${bytes.length}\n`).update(bytes);
  return hash.digest("hex");
}
export function hostPort(): number {
  const port = Number(process.env.VSTACK_FLOW_PORT ?? 42000 + ((process.getuid?.() ?? 0) % 10000));
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("VSTACK_FLOW_PORT must be an integer from 1024 to 65535");
  return port;
}
function idleSeconds(): number {
  const seconds = Number(process.env.VSTACK_FLOW_IDLE_SECONDS ?? 1800);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("VSTACK_FLOW_IDLE_SECONDS must be positive");
  return seconds;
}

type Hello = { state: "ours"; version: string; instance: string } | { state: "absent" } | { state: "other" };
async function hello(port: number, control: string): Promise<Hello> {
  try {
    const nonce = randomBytes(32).toString("hex");
    const r = await fetch(`${originOf(port)}/.host/hello`, { headers: { "x-flow-challenge": nonce }, signal: AbortSignal.timeout(750) });
    const body = await r.text();
    if (r.status !== 200) return { state: "other" };
    try {
      const b = JSON.parse(body);
      return b.app === "vstack-flow-host" && typeof b.version === "string" && typeof b.instance === "string" && typeof b.proof === "string" && same(b.proof, attest(control, nonce, b.version, b.instance))
        ? { state: "ours", version: b.version, instance: b.instance } : { state: "other" };
    } catch { return { state: "other" }; }
  } catch (e) {
    return { state: ["ECONNREFUSED", "ConnectionRefused"].includes((e as NodeJS.ErrnoException).code ?? "") ? "absent" : "other" };
  }
}

/** The first SQLite release stops JSON-only hosts before any project import. */
export async function prepareStorage(home: string): Promise<void> {
  if (!isNormalHome(home) || !existsSync(hostDir(home))) return;
  mkdirSync(hostDir(home), { recursive: true, mode: 0o700 });
  await withLock(hostDir(home), async () => {
    const secret = secrets(home), port = record(home)?.port ?? hostPort();
    const h = await hello(port, secret.control);
    if (h.state !== "ours" || h.version === version()) return;
    const storage = await fetch(`${originOf(port)}/.host/storage`, {
      headers: { authorization: `Bearer ${secret.control}` }, signal: AbortSignal.timeout(2000),
    });
    if (storage.ok && (await storage.json() as { storage?: string }).storage === "sqlite") return;
    if (storage.status !== 404) throw new Error(`Flow host storage could not be established (${storage.status}); JSON import was not attempted`);
    const stopped = await fetch(`${originOf(port)}/.host/stop`, {
      method: "POST", headers: { authorization: `Bearer ${secret.control}` }, signal: AbortSignal.timeout(2000),
    });
    if (!stopped.ok) throw new Error(`pre-SQLite Flow host refused stop (${stopped.status}); JSON import was not attempted`);
    for (const end = Date.now() + 5000; Date.now() < end; await Bun.sleep(25)) {
      if ((await hello(port, secret.control)).state === "absent") return;
    }
    throw new Error("pre-SQLite Flow host did not stop; JSON import was not attempted");
  });
}

type Ready = { port: number; secret: Secrets };
async function ensure(home: string): Promise<Ready> {
  mkdirSync(hostDir(home), { recursive: true, mode: 0o700 });
  if ((process.env.FLOW_READER_ASSETS || process.env.FLOW_READER_SERVER) && isNormalHome(home)) throw new Error("FLOW_READER_ASSETS and FLOW_READER_SERVER require an isolated --home; candidate reader proof cannot replace the normal host");
  return withLock(hostDir(home), async () => {
    const secret = secrets(home);
    const port = record(home)?.port ?? hostPort();
    const expected = version();
    const check = (h: Hello) => {
      if (h.state === "other") throw new Error(`port ${port} is held by another program or another user's Flow host; choose VSTACK_FLOW_PORT, without stopping that program`);
      if (h.state === "ours" && h.version !== expected) throw new Error(`incompatible Flow host on port ${port}: it runs other flow-page code, another reader build, or another Bun runtime; an installed update may be incomplete or failed; isolated host owners can use host stop before retrying`);
    };
    let h = await hello(port, secret.control);
    if (h.state === "ours" && h.version !== expected && isNormalHome(home)) {
      for (const end = Date.now() + 10_000; Date.now() < end && h.state === "ours" && h.version !== expected; await Bun.sleep(100)) h = await hello(port, secret.control);
    }
    check(h);
    if (h.state === "ours") return { port, secret };
    const log = join(hostDir(home), "host.log");
    const fd = openSync(log, "w", 0o600);
    let child;
    try {
      const managed = isNormalHome(home);
      child = spawn(process.execPath, [join(import.meta.dir, managed ? "managed-host.ts" : "host.ts"), "--home", home, "--port", String(port), "--idle", String(idleSeconds())], {
        cwd: hostDir(home), detached: true, stdio: ["ignore", fd, fd], env: { PATH: process.env.PATH, HOME: home, FLOW_READER_ASSETS: process.env.FLOW_READER_ASSETS, FLOW_READER_SERVER: process.env.FLOW_READER_SERVER },
      });
    } finally { closeSync(fd); }
    let ended: string | undefined;
    child.on("error", (e) => { ended = e.message; });
    child.on("exit", (code, signal) => { ended = `${signal ?? code}`; });
    child.unref();
    for (const end = Date.now() + 10000; Date.now() < end; await Bun.sleep(25)) {
      if (ended !== undefined) throw new Error(`Flow host could not start (${readFileSync(log, "utf8").trim().slice(-1500) || ended})`);
      const r = record(home);
      if (r?.pid !== child.pid) continue;
      const ready = await hello(port, secret.control);
      check(ready);
      if (ready.state === "ours" && ready.instance === r!.instance) return { port, secret };
    }
    child.kill("SIGTERM");
    throw new Error(`Flow host did not become ready on port ${port}; inspect ${log}`);
  });
}

export type Connection = { state: "serving"; port: number; secret: Secrets; release: () => void } | { state: "off" } | { state: "unavailable"; error: string };
export async function connect(home: string): Promise<Connection> {
  if (process.env.VSTACK_FLOW_HOST === "off") return { state: "off" };
  try {
    const { port, secret } = await ensure(home);
    const abort = new AbortController();
    const deadline = setTimeout(() => abort.abort(), 2000);
    let r: Response;
    try {
      r = await fetch(`${originOf(port)}/.host/hold`, { headers: { authorization: `Bearer ${secret.control}` }, signal: abort.signal });
    } finally { clearTimeout(deadline); }
    if (!r.ok) { abort.abort(); throw new Error(`Flow host refused publication hold (${r.status})`); }
    const reader = r.body!.getReader();
    void (async () => {
      try { while (!(await reader.read()).done); } catch {}
    })();
    return { state: "serving", port, secret, release: () => abort.abort() };
  } catch (e) { return { state: "unavailable", error: (e as Error).message }; }
}

export async function hostCommand(home: string, command: "status" | "stop"): Promise<object> {
  mkdirSync(hostDir(home), { recursive: true, mode: 0o700 });
  return withLock(hostDir(home), async () => {
    const secret = secrets(home);
    const port = record(home)?.port ?? hostPort();
    const h = await hello(port, secret.control);
    if (h.state === "absent") return { state: "stopped" };
    if (h.state === "other") return { state: "unavailable", error: `port ${port} is held by another program or another user's host; nothing stopped` };
    if (command === "status") {
      const running = { state: "running", ...record(home), origin: originOf(port) };
      try { return { ...running, compatible: h.version === version() }; } catch (e) { return { ...running, compatible: false, error: (e as Error).message }; }
    }
    const r = await fetch(`${originOf(port)}/.host/stop`, { method: "POST", headers: { authorization: `Bearer ${secret.control}` }, signal: AbortSignal.timeout(2000) });
    if (!r.ok) throw new Error(`Flow host refused stop (${r.status}); nothing else stopped`);
    for (const end = Date.now() + 5000; Date.now() < end; await Bun.sleep(25)) {
      if ((await hello(port, secret.control)).state === "absent") return { state: "stopped" };
    }
    throw new Error("Flow host did not stop; no other process was stopped");
  });
}

import { createHash, createHmac, randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import { extname } from "node:path";
import { parseArgs } from "node:util";
import { attest, capability, originOf, readerBundle, record, recordPath, same, secrets, version, type HostRecord, type Runtimes } from "./live.ts";
import { SLUG, view, type State } from "./model.ts";
import { learning } from "./learning.ts";
import { comments } from "./comments.ts";
import { hostedStore } from "./store.ts";
import { writeAtomic } from "./files.ts";
import { observations, observationVersion, observing } from "./observations.ts";
import type { Content, PickerPresence, Presence, Versions } from "./host-api.ts";
import type { FlowHost, FlowRoute } from "./host-entry.ts";

const { values } = parseArgs({ args: Bun.argv.slice(2), options: { home: { type: "string" }, port: { type: "string" }, idle: { type: "string" } }, strict: true });
const home = values.home!;
const port = Number(values.port);
const idle = Number(values.idle) * 1000;
if (!home || !Number.isInteger(port) || !Number.isFinite(idle) || idle <= 0) throw new Error("host needs --home, --port, and positive --idle");
const secret = secrets(home);
const instance = randomBytes(16).toString("hex");
const managed = process.env.VSTACK_FLOW_WORKER === "1";
const reader = readerBundle();
const hostVersion = version(reader);
const readerGeneration = createHash("sha256");
for (const [path, bytes] of reader) readerGeneration.update(path).update(bytes);
const readerVersion = readerGeneration.digest("hex");
const origin = originOf(port);
let active = 0;
let last = Date.now();
let stopping = false;
const pickers = new Map<string, PickerPresence>();
const pickerKey = (p: Pick<PickerPresence, "key" | "session">) => JSON.stringify([p.key, p.session]);
function presences(key: string, flow: string): PickerPresence[] {
  const live: PickerPresence[] = [];
  for (const [id, p] of pickers) {
    if (p.expires <= Date.now()) pickers.delete(id);
    else if (p.key === key && p.flow === flow) live.push(p);
  }
  return live;
}
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
};
const csp = [
  "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'", "object-src 'none'",
  "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data:", "media-src 'self'", "font-src 'self'", "connect-src 'self'",
].join("; ");
const response = (body: BodyInit | null, status = 200, extra: Record<string, string> = {}) => new Response(body, { status, headers: { ...headers, ...extra } });
const missing = () => response("Flow or captured asset is missing or expired.", 404);
const controlled = (req: Request) => same(req.headers.get("authorization") ?? "", `Bearer ${secret.control}`);
const mime: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".mmd": "text/plain; charset=utf-8", ".mp4": "video/mp4", ".webm": "video/webm", ".pdf": "application/pdf" };
const executableMime: Record<string, string> = { ...mime, ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain" };

async function runtimes(s: State, key: string): Promise<Runtimes> {
  const out: Runtimes = {};
  await Promise.all(s.attachments.map(async (a) => {
    if (a.availability === "unavailable") return;
    if (a.runtime === "html" && a.bundle) {
      const cap = capability(secret.read, key, `${s.flow.id}\nartifact\n${a.id}`);
      out[a.id] = { url: `${viewer.url.origin}/p/${encodeURIComponent(key)}/${s.flow.id}/${a.id}/${cap}/${a.bundle.entry}` };
    } else if (a.runtime === "local-app" && a.url) {
      if ([origin, viewer.url.origin].includes(new URL(a.url).origin)) {
        out[a.id] = { reason: "A Flow host address is not an application runtime." };
        return;
      }
      try {
        const r = await fetch(a.url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(1000) });
        out[a.id] = r.ok && r.headers.get("content-type")?.includes("text/html")
          ? { url: a.url } : { reason: `The local route is unavailable as HTML (HTTP ${r.status}).` };
      } catch {
        out[a.id] = { reason: "The local runtime is not reachable. Start it with the launch steps below." };
      }
    }
  }));
  return out;
}

function prototype(req: Request): Response {
  if (req.headers.get("host") !== viewer.url.host || (req.headers.has("origin") && req.headers.get("origin") !== viewer.url.origin)) return response("Invalid host or origin.", 403);
  if (req.method !== "GET" && req.method !== "HEAD") return response("Read-only viewer.", 405, { Allow: "GET, HEAD" });
  const m = new URL(req.url).pathname.match(/^\/p\/([^/]+)\/([^/]+)\/([^/]+)\/([a-f0-9]{64})\/(.+)$/);
  if (!m) return missing();
  let key: string;
  let path: string;
  try { key = decodeURIComponent(m[1]); path = decodeURIComponent(m[5]); } catch { return missing(); }
  if (!same(m[4], capability(secret.read, key, `${m[2]}\nartifact\n${m[3]}`))) return missing();
  const store = hostedStore(home, key);
  const s = store?.read(m[2]);
  const a = s?.flow.id === m[2] ? s.attachments.find((a) => a.id === m[3] && a.runtime === "html" && a.availability === "captured") : undefined;
  const f = a?.bundle?.files.find((f) => f.path === path);
  if (!f) return missing();
  const file = store!.asset(m[2], f.file);
  if (!file) return missing();
  return response(req.method === "HEAD" ? null : Bun.file(file), 200, {
    "Content-Type": executableMime[extname(path).toLowerCase()] ?? "application/octet-stream",
    "Content-Security-Policy": `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; font-src 'self'; connect-src 'self'; frame-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors ${origin}; sandbox allow-scripts allow-same-origin`,
  });
}

function hold(req: Request): Response {
  active++;
  let done = false;
  let timer: ReturnType<typeof setInterval>;
  const release = () => {
    if (done) return;
    done = true;
    clearInterval(timer);
    active--;
    last = Date.now();
  };
  req.signal.addEventListener("abort", release, { once: true });
  return response(new ReadableStream({
    start(controller) {
      const encode = (s: string) => new TextEncoder().encode(s);
      controller.enqueue(encode(": connected\n\n"));
      timer = setInterval(() => {
        try { controller.enqueue(encode(": alive\n\n")); }
        catch (e) { release(); controller.error(e); }
      }, 15000);
    },
    cancel: release,
  }), 200, { "Content-Type": "text/event-stream", "X-Accel-Buffering": "no" });
}

function guard(req: Request): Response | undefined {
  if (req.headers.get("host") !== `127.0.0.1:${port}` || (req.headers.has("origin") && req.headers.get("origin") !== origin) || req.headers.get("sec-fetch-site") === "cross-site") return response("Invalid host or origin.", 403);
  const path = new URL(req.url).pathname;
  if (path.startsWith("/.host/") && !(path === "/.host/hello" && req.method === "GET") && !controlled(req)) return response("Not authorized.", 401);
}

function hello(req: Request): Response {
  const nonce = req.headers.get("x-flow-challenge") ?? "";
  if (!/^[a-f0-9]{64}$/.test(nonce)) return response("Not authorized.", 401);
  return response(JSON.stringify({ app: "vstack-flow-host", version: hostVersion, instance, proof: attest(secret.control, nonce, hostVersion, instance) }), 200, { "Content-Type": "application/json" });
}

async function picker(req: Request): Promise<Response> {
  let p: PickerPresence;
  try { p = await req.json(); } catch { return response("Invalid Picker presence.", 400); }
  if (!p || typeof p.key !== "string" || typeof p.session !== "string" || !p.session ||
    typeof p.picker !== "string" || !p.picker) return response("Invalid Picker presence.", 400);
  const key = pickerKey(p);
  if (req.method === "DELETE") {
    if (pickers.get(key)?.picker === p.picker) pickers.delete(key);
    return response(JSON.stringify({ ok: true }), 200, { "Content-Type": "application/json" });
  }
  if (typeof p.flow !== "string" || !SLUG.test(p.flow) || typeof p.stage !== "string" ||
    !Array.isArray(p.questions) || !p.questions.every(q => typeof q === "string") ||
    !Number.isFinite(p.expires)) return response("Invalid Picker presence.", 400);
  const store = hostedStore(home, p.key);
  if (!store?.read(p.flow)?.stages.some(stage => stage.id === p.stage)) return missing();
  pickers.set(key, p);
  return response(JSON.stringify({ ok: true }), 200, { "Content-Type": "application/json" });
}

function readerAsset(req: Request): Response {
  const path = new URL(req.url).pathname;
  const bytes = reader.get(path.slice(1));
  if (!bytes) return missing();
  if (req.method !== "GET" && req.method !== "HEAD") return response("Read-only reader.", 405, { Allow: "GET, HEAD" });
  return response(req.method === "HEAD" ? null : bytes, 200, { "Content-Type": executableMime[extname(path).toLowerCase()] ?? "application/octet-stream" });
}

async function flow(req: Request, endpoint: FlowRoute): Promise<Response> {
  if (!["GET", "HEAD", "POST"].includes(req.method)) return response("Unsupported method.", 405);
  const url = new URL(req.url);
  const m = url.pathname.match(/^\/f\/([^/]+)\/([^/]+)\/([a-f0-9]{64})(\/.*)?$/);
  if (!m) return missing();
  let key: string;
  try { key = decodeURIComponent(m[1]); } catch { return missing(); }
  const id = m[2];
  if (!/^[^./\\\x00][^/\\\x00]*$/.test(key) || !SLUG.test(id) || !same(m[3], capability(secret.read, key, id))) return missing();
  if (m[4] === undefined) return response(null, 308, { Location: `${url.pathname}/` });
  if (endpoint !== "assets" && m[4] !== (endpoint === "shell" ? "/" : `/${endpoint}`)) endpoint = "missing";
  const store = hostedStore(home, key);
  if (endpoint === "versions") {
    if (req.method !== "GET" && req.method !== "HEAD") return response("Read-only host.", 405, { Allow: "GET, HEAD" });
    const summary = store?.summary(id);
    if (!summary) return missing();
    const observed = observations(store!, key, { flow: { id }, aliases: summary.aliases });
    return response(req.method === "HEAD" ? null : JSON.stringify({
      revision: summary.revision, observationVersion: observationVersion(observed), hostGeneration: instance, readerGeneration: readerVersion,
    } satisfies Versions), 200, { "Content-Type": "application/json" });
  }
  const s = store?.read(id);
  if (!store || !s || s.flow.id !== id) return missing();
  const json = (body: unknown) => response(req.method === "HEAD" ? null : JSON.stringify(body), 200, { "Content-Type": "application/json" });
  const progressToken = createHmac("sha256", secret.control).update(`flow-learning-v1\n${key}\n${id}`).digest("hex");
  if (endpoint === "learning" || endpoint === "comments") {
    const token = req.headers.get("cookie")?.split(";").map((x) => x.trim()).find((x) => x.startsWith("flow_learning="))?.slice(14) ?? "";
    if (!same(token, progressToken)) return response("Reader permission required.", 401);
    if (req.method === "POST" && req.headers.get("origin") !== origin) return response("Invalid reader origin.", 403);
    if (req.method === "POST" && req.headers.get("content-type") !== "application/json") return response("Use application/json.", 415);
    const result = await (endpoint === "comments" ? comments : learning)(store, id, req);
    return response(JSON.stringify(result.body), result.status, { "Content-Type": "application/json" });
  }
  if (req.method !== "GET" && req.method !== "HEAD") return response("Read-only host.", 405, { Allow: "GET, HEAD" });
  if (endpoint === "shell" || endpoint === "content") {
    const content = view(s);
    const initial = { ...content, questions: [...content.questions.values()], runtimes: await runtimes(s, key) } satisfies Content;
    if (endpoint === "content") return json(initial);
    return response(req.method === "HEAD" ? null : JSON.stringify({ content: initial, hostGeneration: instance, readerGeneration: readerVersion }), 200, {
      "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": csp,
      "Set-Cookie": `flow_learning=${progressToken}; Path=${url.pathname}; HttpOnly; SameSite=Strict; Max-Age=31536000`,
    });
  }
  if (endpoint === "observations") return json(observations(store, key, s));
  if (endpoint === "presence") return json({ presences: presences(key, id) } satisfies Presence);
  if (endpoint !== "assets") return missing();
  let file: string;
  try { file = decodeURIComponent(m[4].slice(8)); } catch { return missing(); }
  const a = s.attachments.find((a) => a.availability === "captured" && a.file === file);
  if (!a || !/^[a-f0-9]{64}\/[A-Za-z0-9._-]+$/.test(file)) return missing();
  const path = store.asset(id, file);
  if (!path) return missing();
  const media = ["image", "video", "svg"].includes(a.type);
  return response(req.method === "HEAD" ? null : Bun.file(path), 200, {
    "Content-Type": mime[extname(path)] ?? "application/octet-stream",
    "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'",
    ...(!media ? { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(a.name!)}` } : {}),
  });
}

function shutdown() {
  if (stopping) return;
  stopping = true;
  if (!managed && record(home)?.instance === instance) rmSync(recordPath(home), { force: true });
  server?.stop(true);
  viewer.stop(true);
  clearInterval(idleTimer);
  process.exit(0);
}
let server: ReturnType<typeof Bun.serve> | undefined;
let viewer: ReturnType<typeof Bun.serve>;
let idleTimer: ReturnType<typeof setInterval>;

function start(fetch: (req: Request) => Response | Promise<Response>) {
  try {
    server = Bun.serve({
      hostname: "127.0.0.1", port: managed ? 0 : port, idleTimeout: 0,
      async fetch(req) {
        active++;
        try { return guard(req) ?? await fetch(req); }
        catch (e) { return (e as NodeJS.ErrnoException).code === "ENOENT" ? missing() : response("Flow presentation is unavailable. The committed Flow content is unchanged.", 500); }
        finally { active--; last = Date.now(); }
      },
    });
    viewer = Bun.serve({
      hostname: "127.0.0.1", port: 0,
      fetch(req) {
        active++;
        try { return prototype(req); }
        catch { return missing(); }
        finally { active--; last = Date.now(); }
      },
    });
  } catch (e) {
    server?.stop(true);
    process.stderr.write(`Flow host cannot bind loopback port ${port}: ${(e as Error).message}. No other process was stopped.\n`);
    process.exit(1);
  }
  const metadata: HostRecord = { pid: process.pid, port, version: hostVersion, started: new Date().toISOString(), instance, bun: Bun.version };
  if (managed) process.send?.({ port: server.port, version: hostVersion, instance, readerGeneration: readerVersion });
  else writeAtomic(recordPath(home), JSON.stringify(metadata));
  idleTimer = setInterval(() => { if (active === 0 && !observing() && Date.now() - last >= idle) shutdown(); }, Math.min(1000, idle / 4));
  if (managed) process.on("disconnect", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

export const host: FlowHost = {
  start, hello, hold, picker, readerAsset, flow, missing,
  storage() { return response(JSON.stringify({ storage: "sqlite" }), 200, { "Content-Type": "application/json" }); },
  failure(error: unknown) { return (error as NodeJS.ErrnoException).code === "ENOENT" ? missing() : response("Flow presentation is unavailable. The committed Flow content is unchanged.", 500); },
  stop() { setTimeout(shutdown, 50); return response("Stopping."); },
};

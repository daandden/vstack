// The detached, read-only Local Flow host. Authoring remains a local Stage-bound CLI operation, never an HTTP route.
import { randomBytes } from "node:crypto";
import { lstatSync, realpathSync, rmSync } from "node:fs";
import { extname, join, sep } from "node:path";
import { parseArgs } from "node:util";
import { scratchRoot } from "../../vstack-tmp/scripts/scratch.ts";
import { attest, capability, originOf, record, recordPath, same, secrets, version, type HostRecord } from "./live.ts";
import { SLUG, view, type State } from "./model.ts";
import { render, type Runtimes } from "./render.ts";
import { assetsDir, folderOfId, readState, writeAtomic } from "./store.ts";

const { values } = parseArgs({ args: Bun.argv.slice(2), options: { home: { type: "string" }, port: { type: "string" }, idle: { type: "string" } }, strict: true });
const home = values.home!;
const port = Number(values.port);
const idle = Number(values.idle) * 1000;
if (!home || !Number.isInteger(port) || !Number.isFinite(idle) || idle <= 0) throw new Error("host needs --home, --port, and positive --idle");
const secret = secrets(home);
const instance = randomBytes(16).toString("hex");
const code = version();
const origin = originOf(port);
let active = 0;
let last = Date.now();
let stopping = false;
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
};
const csp = "base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";
const response = (body: BodyInit | null, status = 200, extra: Record<string, string> = {}) => new Response(body, { status, headers: { ...headers, ...extra } });
const missing = () => response("Flow or captured asset is missing or expired.", 404);
const controlled = (req: Request) => same(req.headers.get("authorization") ?? "", `Bearer ${secret.control}`);
const mime: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".webm": "video/webm", ".pdf": "application/pdf" };
const executableMime: Record<string, string> = { ...mime, ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain" };

function flowFolder(key: string, id: string): string | undefined {
  if (!/^[^./\\\x00][^/\\\x00]*$/.test(key) || !SLUG.test(id)) return undefined;
  const dir = join(scratchRoot(home), key, "flow");
  if (!realpathSync(dir).startsWith(realpathSync(scratchRoot(home)) + sep)) return undefined;
  const folder = folderOfId(dir, id);
  return folder && realpathSync(folder).startsWith(realpathSync(dir) + sep) ? folder : undefined;
}

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
  const folder = flowFolder(key, m[2]);
  if (!folder) return missing();
  const s = readState(folder);
  const a = s?.flow.id === m[2] ? s.attachments.find((a) => a.id === m[3] && a.runtime === "html" && a.availability === "captured") : undefined;
  const f = a?.bundle?.files.find((f) => f.path === path);
  if (!f) return missing();
  const base = realpathSync(assetsDir(folder));
  const file = join(base, f.file);
  if (!/^[a-f0-9]{64}\/[A-Za-z0-9._-]+$/.test(f.file) || !base.startsWith(realpathSync(folder) + sep) || !lstatSync(file).isFile() || realpathSync(file) !== file) return missing();
  return response(req.method === "HEAD" ? null : Bun.file(file), 200, {
    "Content-Type": executableMime[extname(path).toLowerCase()] ?? "application/octet-stream",
    "Content-Security-Policy": `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; font-src 'self'; connect-src 'self'; frame-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors ${origin}; sandbox allow-scripts allow-same-origin`,
  });
}

/** A held response is a reader, publication, or future progress sync. Disconnect releases it even after SIGKILL. */
function held(req: Request, revision?: () => number | undefined): Response {
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
      let sent: number | undefined;
      let heartbeat = Date.now();
      const publish = () => {
        try {
          const next = revision?.();
          if (next !== undefined && next !== sent) {
            controller.enqueue(encode(`event: revision\ndata: ${JSON.stringify({ revision: next })}\n\n`));
            sent = next;
          }
          if (Date.now() - heartbeat >= 15000) {
            controller.enqueue(encode(": alive\n\n"));
            heartbeat = Date.now();
          }
        } catch (e) {
          release();
          controller.error(e);
        }
      };
      // The initial revision also repairs the gap between a page read and its event connection, including reconnects.
      timer = setInterval(publish, revision ? 500 : 15000);
      if (revision) publish();
    },
    cancel: release,
  }), 200, { "Content-Type": "text/event-stream", "X-Accel-Buffering": "no" });
}

async function route(req: Request): Promise<Response> {
  last = Date.now();
  if (req.headers.get("host") !== `127.0.0.1:${port}` || (req.headers.has("origin") && req.headers.get("origin") !== origin) || req.headers.get("sec-fetch-site") === "cross-site") return response("Invalid host or origin.", 403);
  const url = new URL(req.url);
  if (url.pathname.startsWith("/.host/")) {
    if (url.pathname === "/.host/hello" && req.method === "GET") {
      const nonce = req.headers.get("x-flow-challenge") ?? "";
      if (!/^[a-f0-9]{64}$/.test(nonce)) return response("Not authorized.", 401);
      return response(JSON.stringify({ app: "vstack-flow-host", version: code, instance, proof: attest(secret.control, nonce, code, instance) }), 200, { "Content-Type": "application/json" });
    }
    if (!controlled(req)) return response("Not authorized.", 401);
    if (url.pathname === "/.host/hold" && req.method === "GET") return held(req);
    if (url.pathname === "/.host/stop" && req.method === "POST") {
      setTimeout(shutdown, 50);
      return response("Stopping.");
    }
    return missing();
  }
  if (req.method !== "GET" && req.method !== "HEAD") return response("Read-only host.", 405, { Allow: "GET, HEAD" });
  const m = url.pathname.match(/^\/f\/([^/]+)\/([^/]+)\/([a-f0-9]{64})(\/.*)?$/);
  if (!m) return missing();
  let key: string;
  try { key = decodeURIComponent(m[1]); } catch { return missing(); }
  const id = m[2];
  if (!/^[^./\\\x00][^/\\\x00]*$/.test(key) || !SLUG.test(id) || !same(m[3], capability(secret.read, key, id))) return missing();
  if (m[4] === undefined) return response(null, 308, { Location: `${url.pathname}/` });
  const dir = join(scratchRoot(home), key, "flow");
  // Project, Flow, state, and captured-asset paths may not escape through symlinked parent directories either.
  const root = realpathSync(scratchRoot(home));
  if (!realpathSync(dir).startsWith(root + sep)) return missing();
  const folder = folderOfId(dir, id);
  if (!folder || !realpathSync(folder).startsWith(realpathSync(dir) + sep)) return missing();
  const s = readState(folder);
  if (!s || s.flow.id !== id) return missing();
  if (m[4] === "/") return response(req.method === "HEAD" ? null : render(view(s), await runtimes(s, key)), 200, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": csp });
  if (m[4] === "/events" && req.method === "GET") return held(req, () => {
    const current = folderOfId(dir, id);
    return current ? readState(current)?.revision : undefined;
  });
  if (!m[4].startsWith("/assets/")) return missing();
  let file: string;
  try { file = decodeURIComponent(m[4].slice(8)); } catch { return missing(); }
  const a = s.attachments.find((a) => a.availability === "captured" && a.file === file);
  if (!a || !/^[a-f0-9]{64}\/[A-Za-z0-9._-]+$/.test(file)) return missing();
  const base = realpathSync(assetsDir(folder));
  if (!base.startsWith(realpathSync(folder) + sep)) return missing();
  const path = join(base, file);
  if (!lstatSync(path).isFile() || realpathSync(path) !== path) return missing();
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
  // Remove only our discovery record, before releasing the port; a new host cannot bind until this one has stopped.
  if (record(home)?.instance === instance) rmSync(recordPath(home), { force: true });
  server.stop(true);
  viewer.stop(true);
  clearInterval(idleTimer);
  process.exit(0);
}
let server: ReturnType<typeof Bun.serve>;
let viewer: ReturnType<typeof Bun.serve>;
try {
  server = Bun.serve({
    hostname: "127.0.0.1", port, idleTimeout: 0,
    async fetch(req) {
      active++;
      try { return await route(req); }
      catch (e) { return (e as NodeJS.ErrnoException).code === "ENOENT" ? missing() : response("Flow presentation is unavailable; use the static page.", 500); }
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
const metadata: HostRecord = { pid: process.pid, port, version: code, started: new Date().toISOString(), instance, bun: Bun.version };
writeAtomic(recordPath(home), JSON.stringify(metadata));
const idleTimer = setInterval(() => { if (active === 0 && Date.now() - last >= idle) shutdown(); }, Math.min(1000, idle / 4));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

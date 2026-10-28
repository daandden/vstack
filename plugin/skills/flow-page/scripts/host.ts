// The detached, read-only Local Flow host. Authoring remains a local Stage-bound CLI operation, never an HTTP route.
import { randomBytes } from "node:crypto";
import { lstatSync, realpathSync, rmSync } from "node:fs";
import { extname, join, sep } from "node:path";
import { parseArgs } from "node:util";
import { scratchRoot } from "../../vstack-tmp/scripts/scratch.ts";
import { attest, capability, originOf, record, recordPath, same, secrets, version, type HostRecord } from "./live.ts";
import { SLUG, view } from "./model.ts";
import { render } from "./render.ts";
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

/** A held response is a reader, publication, or future progress sync. Disconnect releases it even after SIGKILL. */
function held(req: Request): Response {
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
      controller.enqueue(new TextEncoder().encode(": connected\n\n"));
      timer = setInterval(() => controller.enqueue(new TextEncoder().encode(": alive\n\n")), 15000);
    },
    cancel: release,
  }), 200, { "Content-Type": "text/event-stream", "X-Accel-Buffering": "no" });
}

function route(req: Request): Response {
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
  if (m[4] === "/") return response(req.method === "HEAD" ? null : render(view(s)), 200, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": csp });
  if (m[4] === "/events" && req.method === "GET") return held(req);
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
  clearInterval(idleTimer);
  process.exit(0);
}
let server: ReturnType<typeof Bun.serve>;
try {
  server = Bun.serve({
    hostname: "127.0.0.1", port, idleTimeout: 0,
    fetch(req) {
      active++;
      try { return route(req); }
      catch (e) { return (e as NodeJS.ErrnoException).code === "ENOENT" ? missing() : response("Flow presentation is unavailable; use the static page.", 500); }
      finally { active--; last = Date.now(); }
    },
  });
} catch (e) {
  process.stderr.write(`Flow host cannot bind loopback port ${port}: ${(e as Error).message}. No other process was stopped.\n`);
  process.exit(1);
}
const metadata: HostRecord = { pid: process.pid, port, version: code, started: new Date().toISOString(), instance, bun: Bun.version };
writeAtomic(recordPath(home), JSON.stringify(metadata));
const idleTimer = setInterval(() => { if (active === 0 && Date.now() - last >= idle) shutdown(); }, Math.min(1000, idle / 4));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

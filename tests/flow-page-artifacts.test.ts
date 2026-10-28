// Runnable artifacts through the producer CLI and real host. Observe captured bytes, availability, and permissions.
import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ENV } from "./support/fixture.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin/skills/flow-page/scripts/flow-page.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-artifacts-")));
const homes: string[] = [];
function run(home: string, args: string[], input?: object) {
  const p = Bun.spawnSync(["bun", SCRIPT, ...args, "--home", home, "--session", "artifacts"], {
    cwd: root, env: { ...ENV, VSTACK_FLOW_PORT: String(port), HOME: home },
    stdin: input ? new TextEncoder().encode(JSON.stringify(input)) : "ignore", stdout: "pipe", stderr: "pipe",
  });
  return { code: p.exitCode, stdout: p.stdout.toString(), stderr: p.stderr.toString() };
}
const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
const port = socket.port;
socket.stop(true);
const ok = (r: ReturnType<typeof run>) => {
  expect(r.stderr).toBe(""); expect(r.code).toBe(0); return JSON.parse(r.stdout);
};
const submit = (home: string, ...items: object[]) => run(home, ["submit"], { version: 1, items });
function world() {
  const home = join(root, `home-${homes.length}`); mkdirSync(home); homes.push(home);
  return home;
}
afterAll(() => {
  for (const home of homes) run(home, ["host", "stop"]);
  rmSync(root, { recursive: true, force: true });
});
const artifact = (extra: object) => ({ kind: "attachment", ref: "app", type: "artifact", caption: "Checkout prototype", origin: "fixture", launch: "bun app.ts", revision: "fixture-1", ...extra });
const prototype = { kind: "result", ref: "prototype", shape: "prototype", title: "Checkout", artifact: "app" };
const frameSrc = (html: string) => html.match(/<iframe\b[^>]*\bsrc="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&");

test("an HTML bundle is captured once and runs only on an isolated read-only viewer origin", async () => {
  const home = world();
  const opened = ok(run(home, ["open", "--skill", "prototype", "--title", "Artifact isolation"]));
  writeFileSync(join(root, "checkout.html"), '<!doctype html><button>Buy</button><script src="app.js"></script>');
  writeFileSync(join(root, "app.js"), 'document.querySelector("button").onclick = e => e.target.textContent = "Bought";');
  const sent = ok(submit(home, artifact({ runtime: "html", bundle: { entry: "index.html", files: [{ path: "index.html", source: "checkout.html" }, { path: "app.js", source: "app.js" }] } }), prototype));
  const live = await (await fetch(opened.live.url)).text();
  const viewer = frameSrc(live)!;
  expect(viewer).toBeDefined();
  expect(new URL(viewer).origin).not.toBe(new URL(opened.live.url).origin);
  const entry = await fetch(viewer);
  expect(entry.status).toBe(200);
  expect(await entry.text()).toBe(readFileSync(join(root, "checkout.html"), "utf8"));
  expect(await (await fetch(new URL("app.js", viewer))).text()).toBe(readFileSync(join(root, "app.js"), "utf8"));
  writeFileSync(join(root, "app.js"), "throw new Error('changed source');");
  expect(await (await fetch(new URL("app.js", viewer))).text()).not.toContain("changed source");
  for (const path of ["unregistered.js", "../data/state.json", "/.host/hello", "/author", "/merge"]) {
    expect((await fetch(new URL(path, viewer))).status).toBeGreaterThanOrEqual(400);
  }
  expect((await fetch(viewer, { method: "POST", body: "{}" })).status).toBe(405);
  expect((await fetch(opened.live.url, { headers: { Origin: new URL(viewer).origin } })).status).toBe(403);
  expect(new URL(viewer).pathname).not.toContain(new URL(opened.live.url).pathname.split("/").filter(Boolean).at(-1)!);
  expect((await fetch(new URL(".host/stop", new URL(viewer).origin), { method: "POST" })).status).not.toBe(200);
  expect(readFileSync(sent.page, "utf8")).not.toContain(new URL(viewer).origin);
  const stored = ok(run(home, ["show"])).attachments[0].bundle.files.find((f: any) => f.path === "app.js").file;
  const captured = join(dirname(sent.page), "assets", stored);
  unlinkSync(captured);
  symlinkSync("/etc/hosts", captured);
  expect((await fetch(new URL("app.js", viewer))).status).toBe(404);
  ok(run(home, ["host", "stop"]));
});

test("a local app opens its real route only while available; missing backends and terminal artifacts keep launch steps in live and static pages", async () => {
  const home = world();
  const opened = ok(run(home, ["open", "--skill", "prototype", "--title", "Runtime availability"]));
  const app = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(req) {
    return new URL(req.url).pathname === "/checkout" ? new Response("<!doctype html><button>Pay</button>", { headers: { "Content-Type": "text/html" } }) : new Response("not found", { status: 404 });
  } });
  try {
    const url = `http://127.0.0.1:${app.port}/checkout`;
    const sent = ok(submit(home, artifact({ runtime: "local-app", url }), prototype));
    const live = await (await fetch(opened.live.url)).text();
    expect(frameSrc(live)).toBe(url);
    expect(new URL(frameSrc(live)!).origin).not.toBe(new URL(opened.live.url).origin);
    app.stop(true);
    expect(frameSrc(await (await fetch(opened.live.url)).text())).toBeUndefined();
    expect(frameSrc(readFileSync(sent.page, "utf8"))).toBeUndefined();
    const terminal = ok(submit(home, artifact({ runtime: "terminal", unavailable: "Requires an interactive terminal", launch: "bash wizard.sh" }), prototype));
    const shown = ok(run(home, ["show"]));
    expect(shown.attachments.at(-1).availability).toBe("unavailable");
    expect(shown.attachments.at(-1).launch).toBe("bash wizard.sh");
    for (const html of [readFileSync(terminal.page, "utf8"), await (await fetch(opened.live.url)).text()]) {
      expect(frameSrc(html)).toBeUndefined();
      const states: string[] = [];
      new HTMLRewriter().on('[role="status"]', { element(e) { states.push(e.getAttribute("data-availability")!); } }).transform(html);
      expect(states).toEqual(["unavailable", "unavailable"]);
    }
  } finally {
    app.stop(true);
    ok(run(home, ["host", "stop"]));
  }
});

test("unsafe bundles, nonlocal app routes, and non-artifact prototypes are refused without changing the Flow", () => {
  const home = world();
  ok(run(home, ["open", "--skill", "prototype", "--title", "Artifact refusals"]));
  writeFileSync(join(root, "fixture.html"), "<!doctype html><p>Fixture</p>");
  symlinkSync("/etc/hosts", join(root, "escape.html"));
  const before = ok(run(home, ["show"]));
  const beforePage = readFileSync(before.page, "utf8");
  const files = [{ path: "index.html", source: "fixture.html" }];
  for (const extra of [
    { runtime: "html", bundle: { entry: "../index.html", files } },
    { runtime: "html", bundle: { entry: "index.html", files: [...files, ...files] } },
    { runtime: "html", bundle: { entry: "missing.html", files } },
    { runtime: "html", bundle: { entry: "index.html", files: [{ path: "index.html", source: "/etc/hosts" }] } },
    { runtime: "html", bundle: { entry: "index.html", files: [{ path: "index.html", source: "escape.html" }] } },
    { runtime: "local-app", url: "https://example.com/app" },
    { runtime: "local-app", url: "http://127.0.0.1.evil.example:1234/" },
    { runtime: "local-app", url: "http://user:password@127.0.0.1:1234/" },
  ]) {
    expect(submit(home, artifact(extra), prototype).code).toBe(1);
    expect(ok(run(home, ["show"])).revision).toBe(before.revision);
    expect(readFileSync(before.page, "utf8")).toBe(beforePage);
  }
  expect(submit(home, { kind: "attachment", ref: "app", type: "file", caption: "Not runnable", origin: "fixture", path: "fixture.html" }, prototype).code).toBe(1);
  expect(ok(run(home, ["show"])).attachments).toHaveLength(0);
  ok(run(home, ["host", "stop"]));
});

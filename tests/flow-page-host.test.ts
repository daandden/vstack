// flow-page's authoring script and the real Local Flow host it starts, run as processes: one host per user on a
// stable loopback port, shared by sessions that start at once, restarted from stored Flow data, stopped when idle,
// reporting a taken port or other host code without touching that process, and serving each Flow only to its own read
// capability (ADR 0040, spec D8 and D12). Tests read receipts, HTTP status and bytes, page ids and revision, and which
// host processes run, never page wording or markup.

import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ENV, git } from "./support/fixture.ts";

const SKILLS = join(import.meta.dir, "..", "plugin", "skills");
const SCRIPT = join(SKILLS, "flow-page", "scripts", "flow-page.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-page-host-")));

type World = { home: string; cwd: string; port: number; idle?: number };
const worlds: World[] = [];
afterAll(() => {
  for (const w of worlds) run(["host", "stop"], w);
  for (const w of worlds) for (const pid of hostPids(w)) process.kill(pid, "SIGKILL");
  rmSync(root, { recursive: true, force: true });
});

function freePort(): number {
  const s = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = s.port;
  s.stop(true);
  return port;
}

let n = 0;
/** A fresh user home, a project directory in it, and the port its host listens on. */
function world(o: { idle?: number; cwd?: string; home?: string; port?: number } = {}): World {
  const base = join(root, String(n++));
  const w = { home: o.home ?? join(base, "home"), cwd: o.cwd ?? join(base, "work"), port: o.port ?? freePort(), idle: o.idle };
  mkdirSync(w.home, { recursive: true });
  mkdirSync(w.cwd, { recursive: true });
  worlds.push(w);
  return w;
}

type Run = { code: number; stdout: string; stderr: string; json: any };
type Opts = { session?: string; stdin?: unknown; script?: string };
const argv = (args: string[], w: World, o: Opts) => ["bun", o.script ?? SCRIPT, ...args, "--home", w.home];
const envOf = (w: World, o: Opts) => ({
  ...ENV,
  HOME: w.home,
  VSTACK_FLOW_PORT: String(w.port),
  ...(w.idle !== undefined ? { VSTACK_FLOW_IDLE_SECONDS: String(w.idle) } : {}),
  ...(o.session ? { PI_SESSION_ID: o.session } : {}),
});
const stdinOf = (o: Opts) => (o.stdin === undefined ? "ignore" : new TextEncoder().encode(JSON.stringify(o.stdin)));
const parse = (code: number, stdout: string, stderr: string): Run => {
  let json: any;
  try {
    json = JSON.parse(stdout);
  } catch {
    json = undefined;
  }
  return { code, stdout, stderr, json };
};
function run(args: string[], w: World, o: Opts = {}): Run {
  const r = Bun.spawnSync(argv(args, w, o), { cwd: w.cwd, env: envOf(w, o), stdin: stdinOf(o), stdout: "pipe", stderr: "pipe" });
  return parse(r.exitCode, r.stdout.toString(), r.stderr.toString());
}
/** Runs without blocking this process, for tests whose own servers must keep answering meanwhile. */
async function runAsync(args: string[], w: World, o: Opts = {}): Promise<Run> {
  const p = Bun.spawn(argv(args, w, o), { cwd: w.cwd, env: envOf(w, o), stdin: stdinOf(o), stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return parse(code, stdout, stderr);
}
const ok = (r: Run): any => {
  expect(r.stderr).toBe("");
  expect(r.code).toBe(0);
  return r.json;
};

const option = (label: string) => ({ label, does: `${label} does`, gains: [`${label} gain`], costs: [`${label} cost`] });
const question = (ref: string) => ({ ref, title: `Which ${ref}?`, description: `Why ${ref} matters.`, options: [option("First"), option("Second")] });
const contribution = (...items: object[]) => ({ version: 1, items });
const round = (...questions: object[]) => ({ kind: "round", questions });
const open = (w: World, session = "s-1", title = "Checkout limits") => run(["open", "--title", title, "--skill", "grill-me"], w, { session });

/** The host processes serving `w`'s home, by pid. */
function hostPids(w: World): number[] {
  const ps = Bun.spawnSync(["ps", "-axo", "pid=,command="], { stdout: "pipe" }).stdout.toString();
  return ps
    .split("\n")
    .filter((l) => l.includes("host.ts") && l.includes(`--home ${w.home}`))
    .map((l) => Number(l.trim().split(/\s+/)[0]));
}
async function until(cond: () => boolean, ms = 8000): Promise<boolean> {
  for (const end = Date.now() + ms; Date.now() < end; await Bun.sleep(50)) if (cond()) return true;
  return cond();
}

const revisionOf = (html: string) => Number(html.match(/<meta name="flow-page-revision" content="(\d+)">/)?.[1]);
const hasId = (html: string, id: string) => html.includes(`id="${id}"`);
async function attribute(html: string, id: string, name: string): Promise<string | null> {
  let value: string | null = null;
  await new HTMLRewriter().on(`[id="${id}"]`, { element(el) { value = el.getAttribute(name); } }).transform(new Response(html)).text();
  return value;
}
const page = async (url: string) => {
  const r = await fetch(url);
  return { status: r.status, html: await r.text() };
};

/** One raw HTTP/1.1 request, so the test controls Host and the path bytes exactly. Resolves with the status code. */
function raw(port: number, lines: string[]): Promise<{ status: number; body: string }> {
  return new Promise((done, fail) => {
    let buf = "";
    Bun.connect({
      hostname: "127.0.0.1",
      port,
      socket: {
        open(s) {
          s.write(`${[...lines, "Connection: close", "", ""].join("\r\n")}`);
        },
        data(_, d) {
          buf += d.toString();
        },
        close() {
          done({ status: Number(buf.split(" ")[1]), body: buf.split("\r\n\r\n").slice(1).join("\r\n\r\n") });
        },
        error(_, e) {
          fail(e);
        },
      },
    }).catch(fail);
  });
}

test("an authoring command starts the host and serves the Flow live at one URL that follows each committed revision", async () => {
  const w = world();
  const opened = ok(open(w));
  expect(opened.live.state).toBe("serving");
  const url: string = opened.live.url;
  expect(new URL(url).hostname).toBe("127.0.0.1");
  expect(new URL(url).port).toBe(String(w.port));
  expect(revisionOf((await page(url)).html)).toBe(opened.revision);

  const sent = ok(run(["submit"], w, { session: "s-1", stdin: contribution(round(question("q"))) }));
  expect(sent.live.url).toBe(url);
  const live = await page(url);
  expect(live.status).toBe(200);
  expect(revisionOf(live.html)).toBe(sent.revision);
  expect(hasId(live.html, sent.refs.q)).toBe(true);
  // The static page is still published beside it.
  expect(revisionOf(readFileSync(sent.page, "utf8"))).toBe(sent.revision);
  for (const cmd of [["show", "--flow", opened.flow], ["find", `folder:${opened.flow}`]]) expect(ok(run(cmd, w)).live.url).toBe(url);
  expect(hostPids(w)).toHaveLength(1);
});

test("an open reader receives answers, Results, task changes, and new Stages at the same live URL", async () => {
  const w = world();
  const opened = ok(open(w));
  const seed = ok(run(["submit"], w, { session: "s-1", stdin: contribution(
    round(question("choice")),
    { kind: "task", ref: "work", title: "Inspect the update", state: "active" },
  ) }));
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 20000);
  const events = await fetch(new URL("events", opened.live.url), { signal: abort.signal });
  const reader = events.body!.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  async function received(revision: number) {
    for (;;) {
      let boundary: number;
      while ((boundary = buffered.indexOf("\n\n")) >= 0) {
        const frame = buffered.slice(0, boundary);
        buffered = buffered.slice(boundary + 2);
        const data = frame.split("\n").find((l) => l.startsWith("data: "));
        if (data && JSON.parse(data.slice(6)).revision >= revision) return;
      }
      const chunk = await reader.read();
      if (chunk.done) throw new Error("The live page disconnected before the authored update arrived");
      buffered += decoder.decode(chunk.value, { stream: true });
    }
  }
  try {
    await received(seed.revision);
    const answer = ok(run(["submit"], w, { session: "s-1", stdin: contribution(
      { kind: "answer", question: seed.refs.choice, response: { status: "answered", picks: ["B"] } },
    ) }));
    await received(answer.revision);
    const answered = (await page(opened.live.url)).html;
    expect(revisionOf(answered)).toBe(answer.revision);
    expect(await attribute(answered, seed.refs.choice, "data-state")).toBe("picked");
    const result = ok(run(["submit"], w, { session: "s-1", stdin: contribution(
      { kind: "result", ref: "report", shape: "table", title: "Update proof", columns: ["Outcome"], rows: [{ cells: ["Observed"] }] },
    ) }));
    await received(result.revision);
    expect(hasId((await page(opened.live.url)).html, result.refs.report)).toBe(true);
    const task = ok(run(["submit"], w, { session: "s-1", stdin: contribution(
      { kind: "task", task: seed.refs.work, state: "done", evidence: ["The open reader received the update"] },
    ) }));
    await received(task.revision);
    const snapshot = ok(run(["show", "--flow", opened.flow], w));
    expect(snapshot.progress.tasks.find((t: any) => t.id === seed.refs.work).state).toBe("done");
    const completed = (await page(opened.live.url)).html;
    expect(revisionOf(completed)).toBe(task.revision);
    expect(await attribute(completed, seed.refs.work, "data-task")).toBe("done");
    const stage = ok(run(["open", "--flow", opened.flow, "--skill", "research"], w, { session: "s-2" }));
    await received(stage.revision);
    expect(hasId((await page(opened.live.url)).html, stage.stage)).toBe(true);
    expect(stage.live.url).toBe(opened.live.url);
  } finally {
    clearTimeout(timeout);
    abort.abort();
  }
});

test("close and reopen keep the same live URL and publish their lifecycle revisions", async () => {
  const w = world();
  const opened = ok(open(w));
  ok(run(["submit"], w, { session: "s-1", stdin: contribution({ kind: "stage", state: "finished" }) }));
  const closed = ok(run(["close", "--flow", opened.flow], w));
  expect(closed.live.url).toBe(opened.live.url);
  expect(revisionOf((await page(closed.live.url)).html)).toBe(closed.revision);
  expect(ok(run(["show", "--flow", opened.flow], w)).open).toBe(false);
  const reopened = ok(run(["reopen", "--flow", opened.flow, "--skill", "explain"], w, { session: "s-1" }));
  expect(reopened.live.url).toBe(opened.live.url);
  expect(revisionOf((await page(reopened.live.url)).html)).toBe(reopened.revision);
  expect(ok(run(["show", "--flow", opened.flow], w)).open).toBe(true);
});

test("sessions that start at once share one host and each gets a working URL", async () => {
  const w = world();
  const rs = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => runAsync(["open", "--title", `Flow ${i}`, "--skill", "grill-me"], w, { session: `s-${i}` })));
  const receipts = rs.map(ok);
  expect(new Set(receipts.map((r) => new URL(r.live.url).origin)).size).toBe(1);
  expect(new Set(receipts.map((r) => r.live.url)).size).toBe(6);
  expect(hostPids(w)).toHaveLength(1);
  for (const r of receipts) {
    const p = await page(r.live.url);
    expect(p.status).toBe(200);
    expect(p.html).toContain(`content="${r.flow}"`);
  }
});

test("after the host stops or dies, the next command starts it again and earlier URLs serve the stored Flow, also after a move", async () => {
  const w = world();
  const opened = ok(open(w));
  const sent = ok(run(["submit"], w, { session: "s-1", stdin: contribution(round(question("q"))) }));
  const url: string = opened.live.url;

  const stopped = ok(run(["host", "stop"], w));
  expect(stopped.host.state).toBe("stopped");
  expect(hostPids(w)).toHaveLength(0);
  await expect(fetch(url)).rejects.toThrow();

  const moved = ok(run(["move", "--to", "renamed-flow"], w, { session: "s-1" }));
  expect(moved.live.url).toBe(url);
  const after = await page(url);
  expect(after.status).toBe(200);
  expect(hasId(after.html, sent.refs.q)).toBe(true);

  // A host killed outright leaves its record behind; the next command still starts a working one.
  for (const pid of hostPids(w)) process.kill(pid, "SIGKILL");
  expect(await until(() => hostPids(w).length === 0)).toBe(true);
  expect(ok(run(["show", "--flow", opened.flow], w)).live.url).toBe(url);
  expect((await page(url)).status).toBe(200);
  expect(hostPids(w)).toHaveLength(1);
});

test("the host stops once idle, while an open reader or a publication in flight keeps it running", async () => {
  const w = world({ idle: 1 });
  const opened = ok(open(w));
  expect(hostPids(w)).toHaveLength(1);

  // A reader with the live page open holds its event stream.
  const reader = new AbortController();
  const events = await fetch(new URL("events", opened.live.url), { signal: reader.signal });
  expect(events.status).toBe(200);
  await Bun.sleep(2500);
  expect(hostPids(w)).toHaveLength(1);
  reader.abort();
  expect(await until(() => hostPids(w).length === 0)).toBe(true);

  // A submit still reading its contribution is a publication in flight.
  const p = Bun.spawn(argv(["submit"], w, {}), { cwd: w.cwd, env: envOf(w, { session: "s-1" }), stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  expect(await until(() => hostPids(w).length === 1)).toBe(true);
  await Bun.sleep(2500);
  expect(hostPids(w)).toHaveLength(1);
  p.stdin.write(JSON.stringify(contribution(round(question("q")))));
  p.stdin.end();
  const [stdout, code] = await Promise.all([new Response(p.stdout).text(), p.exited]);
  expect(code).toBe(0);
  expect(JSON.parse(stdout).live.state).toBe("serving");
  expect(await until(() => hostPids(w).length === 0)).toBe(true);
});

test("a port another program holds is reported, that program keeps running, and the static page stays readable", async () => {
  const w = world();
  const credentials: string[] = [];
  const other = Bun.serve({ hostname: "127.0.0.1", port: w.port, fetch(req) {
    const auth = req.headers.get("authorization");
    if (auth) credentials.push(auth);
    return new Response("someone else");
  } });
  try {
    const r = await runAsync(["open", "--title", "Checkout limits", "--skill", "grill-me"], w, { session: "s-1" });
    expect(r.code).toBe(0);
    expect(r.json.live.state).toBe("unavailable");
    expect(r.json.live.url).toBeUndefined();
    expect(typeof r.json.live.error).toBe("string");
    expect(r.stderr).not.toBe("");
    expect(revisionOf(readFileSync(r.json.page, "utf8"))).toBe(r.json.revision);
    expect(await (await fetch(`http://127.0.0.1:${w.port}/`)).text()).toBe("someone else");
    expect(hostPids(w)).toHaveLength(0);
    expect(credentials).toEqual([]);
    other.stop(true);
    expect(ok(await runAsync(["show", "--flow", r.json.flow], w)).live.state).toBe("serving");
  } finally {
    other.stop(true);
  }
});

test("a host another user home started on the port is reported and left running", async () => {
  const first = world();
  const url = ok(open(first)).live.url;
  const second = world({ port: first.port });
  const r = open(second);
  expect(r.code).toBe(0);
  expect(r.json.live.state).toBe("unavailable");
  expect(revisionOf(readFileSync(r.json.page, "utf8"))).toBe(r.json.revision);
  expect((await page(url)).status).toBe(200);
  expect(hostPids(first)).toHaveLength(1);
  expect(hostPids(second)).toHaveLength(0);
});

test("a host running other flow-page code is reported, keeps serving, and gives way only to host stop", async () => {
  const w = world();
  const old = join(root, `old-${n++}`, "skills");
  cpSync(join(SKILLS, "flow-page"), join(old, "flow-page"), { recursive: true });
  cpSync(join(SKILLS, "vstack-tmp"), join(old, "vstack-tmp"), { recursive: true });
  writeFileSync(join(old, "flow-page", "templates", "flow-page.html"), `${readFileSync(join(old, "flow-page", "templates", "flow-page.html"), "utf8")}<!-- older -->\n`);
  const opened = ok(run(["open", "--title", "Checkout limits", "--skill", "grill-me"], w, { session: "s-1", script: join(old, "flow-page", "scripts", "flow-page.ts") }));
  expect(opened.live.state).toBe("serving");
  const oldPids = hostPids(w);
  expect(oldPids).toHaveLength(1);

  const r = run(["show", "--flow", opened.flow], w);
  expect(r.code).toBe(0);
  expect(r.json.live.state).toBe("unavailable");
  expect(typeof r.json.live.error).toBe("string");
  expect((await page(opened.live.url)).status).toBe(200);
  expect(hostPids(w)).toEqual(oldPids);

  expect(ok(run(["host", "stop"], w)).host.state).toBe("stopped");
  const again = ok(run(["show", "--flow", opened.flow], w));
  expect(again.live.url).toBe(opened.live.url);
  expect(hostPids(w)).toHaveLength(1);
  expect(hostPids(w)).not.toEqual(oldPids);
});

test("VSTACK_FLOW_HOST=off keeps the static page only and starts no host", () => {
  const w = world();
  const r = Bun.spawnSync(argv(["open", "--title", "Checkout limits", "--skill", "grill-me"], w, {}), {
    cwd: w.cwd,
    env: { ...envOf(w, { session: "s-1" }), VSTACK_FLOW_HOST: "off" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const json = ok(parse(r.exitCode, r.stdout.toString(), r.stderr.toString()));
  expect(json.live.state).toBe("off");
  expect(revisionOf(readFileSync(json.page, "utf8"))).toBe(json.revision);
  expect(hostPids(w)).toHaveLength(0);
});

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

test("the host serves a Flow only to its own read capability, from its own origin, and only its registered assets", async () => {
  const w = world();
  writeFileSync(join(w.cwd, "shot.png"), PNG);
  const a = ok(open(w, "s-a", "Flow A"));
  const sent = ok(
    run(["submit"], w, {
      session: "s-a",
      stdin: contribution(
        { kind: "attachment", ref: "shot", type: "image", caption: "A shot", origin: "a test", path: "shot.png" },
        { kind: "result", ref: "doc", shape: "document", title: "Proof", sections: [{ heading: "Shot", blocks: [{ figure: "shot" }] }] },
      ),
    }),
  );
  const b = ok(open(w, "s-b", "Flow B"));
  // Another project of the same user, served by the same host.
  const other = world({ home: w.home, port: w.port, cwd: join(root, `project-${n++}`) });
  git(other.cwd, "init", "-q", "-b", "main");
  const c = ok(open(other, "s-c", "Flow C"));
  expect(new URL(c.live.url).origin).toBe(new URL(a.live.url).origin);

  const urlA = new URL(a.live.url);
  const file = ok(run(["show", "--flow", a.flow], w)).attachments[0].file as string;
  const asset = await fetch(new URL(file, urlA));
  expect(asset.status).toBe(200);
  expect(Buffer.from(await asset.arrayBuffer()).equals(PNG)).toBe(true);

  // Swapped ids, other projects, and wrong capabilities find nothing.
  const swap = (from: string, to: string) => urlA.pathname.replace(from, to);
  const pathOf = (u: string) => new URL(u).pathname;
  const capA = pathOf(a.live.url).split("/").filter(Boolean).at(-1)!;
  const tries = [
    swap(a.flow, b.flow),
    pathOf(c.live.url).replace(pathOf(c.live.url).split("/").filter(Boolean).at(-1)!, capA),
    swap(capA, "0".repeat(capA.length)),
    swap(capA, `${capA.slice(0, -1)}${capA.at(-1) === "0" ? "1" : "0"}`),
    `${urlA.pathname}assets/../data/state.json`,
    `${urlA.pathname}assets/%2e%2e/data/state.json`,
    `${urlA.pathname}assets/%2e%2e%2f%2e%2e%2findex.html`,
    "/",
    "/f/",
  ];
  for (const path of tries) {
    const r = await raw(w.port, [`GET ${path} HTTP/1.1`, `Host: 127.0.0.1:${w.port}`]);
    expect([path, r.status]).toEqual([path, 404]);
    expect(r.body).not.toContain(w.home);
  }

  // A file in the Flow's folder that no attachment registered, and a captured file swapped for a symlink out, stay unread.
  const folder = dirname(a.page);
  writeFileSync(join(folder, "assets", "planted.txt"), "planted");
  expect((await fetch(new URL("assets/planted.txt", urlA))).status).toBe(404);
  writeFileSync(join(root, "outside.png"), "outside secret");
  unlinkSync(join(folder, file));
  symlinkSync(join(root, "outside.png"), join(folder, file));
  const escaped = await fetch(new URL(file, urlA));
  expect(escaped.status).toBe(404);
  expect(await escaped.text()).not.toContain("outside secret");

  // Other hosts and origins are refused, and nothing takes a write.
  const path = urlA.pathname;
  for (const headers of [[`Host: evil.example:${w.port}`], [`Host: 127.0.0.1:${w.port}`, "Origin: http://evil.example"], [`Host: 127.0.0.1:${w.port}`, "Sec-Fetch-Site: cross-site"]]) {
    expect((await raw(w.port, [`GET ${path} HTTP/1.1`, ...headers])).status).toBe(403);
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    for (const p of [path, `${path}events`, `${path}${file}`, "/run", "/merge", "/command"]) {
      const r = await raw(w.port, [`${method} ${p} HTTP/1.1`, `Host: 127.0.0.1:${w.port}`, "Content-Length: 0"]);
      expect([method, p, r.status >= 400]).toEqual([method, p, true]);
    }
  }

  // No token-like string in the readable page or its assets controls the host.
  const html = (await page(a.live.url)).html;
  const tokens = new Set([...html.matchAll(/[A-Za-z0-9_-]{16,}/g)].map((m) => m[0]));
  for (const t of tokens) {
    const r = await raw(w.port, ["POST /.host/stop HTTP/1.1", `Host: 127.0.0.1:${w.port}`, `Authorization: Bearer ${t}`, "Content-Length: 0"]);
    expect(r.status).not.toBe(200);
  }
  expect(hostPids(w)).toHaveLength(1);
  expect((await page(a.live.url)).status).toBe(200);
  expect(sent.refs.doc).toBeTruthy();
});

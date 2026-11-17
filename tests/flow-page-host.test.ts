import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ENV, git } from "./support/fixture.ts";
import { storedFolder } from "./support/flow-store.ts";

import { secrets } from "../plugin/skills/flow-page/scripts/live.ts";
const SKILLS = join(import.meta.dir, "..", "plugin", "skills");
const SCRIPT = join(SKILLS, "flow-page", "scripts", "flow-page.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-page-host-")));

type World = { home: string; cwd: string; port: number; idle?: number; path?: string };
const worlds: World[] = [];
afterAll(() => {
  for (const w of worlds) run(["host", "stop"], w);
  for (const w of worlds) for (const pid of hostPids(w)) process.kill(pid, "SIGKILL");
  rmSync(root, { recursive: true, force: true });
}, 30_000);

function freePort(): number {
  const s = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = s.port;
  s.stop(true);
  return port;
}

let n = 0;
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
const argv = (args: string[], w: World, o: Opts) => [process.execPath, o.script ?? SCRIPT, ...args, "--home", w.home];
const envOf = (w: World, o: Opts) => ({
  ...ENV,
  HOME: join(root, "default-home"),
  PATH: w.path ?? ENV.PATH,
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

const option = (label: string, ref: string) => ({ label, does: `${ref}: ${label} does`, gains: [`${ref}: ${label} gain`], costs: [`${ref}: ${label} cost`] });
const question = (ref: string) => ({ ref, title: `Which ${ref}?`, description: `Why ${ref} matters.`, needs: [{ need: `Understand why ${ref} changes the decision.`, kind: "prose" }], options: [option("First", ref), option("Second", ref)] });
const contribution = (...items: object[]) => ({ version: 1, items });
const round = (...questions: object[]) => ({ kind: "round", questions });
const open = (w: World, session = "s-1", title = "Checkout limits") => run(["open", "--title", title, "--skill", "grill-me"], w, { session });

function hostPids(w: World): number[] {
  const ps = Bun.spawnSync(["ps", "-axo", "pid=,command="], { stdout: "pipe" }).stdout.toString();
  return ps
    .split("\n")
    .filter((l) => l.includes("host.ts") && l.includes(`--home ${w.home}`))
    .map((l) => Number(l.trim().split(/\s+/)[0]));
}
async function until(cond: () => boolean | Promise<boolean>, ms = 8000): Promise<boolean> {
  for (const end = Date.now() + ms; Date.now() < end; await Bun.sleep(50)) if (await cond()) return true;
  return cond();
}

/** The host's reader interface for one Flow: its content contract with artifact availability. */
const contentOf = async (url: string) => {
  const r = await fetch(new URL("content", url));
  expect(r.status).toBe(200);
  return await r.json() as any;
};
const askedIn = (model: any, id: string) => model.questions.find((q: any) => q.id === id);
const page = async (url: string) => {
  const r = await fetch(url);
  return { status: r.status, html: await r.text() };
};
/** Every file the reader shell loads, by its URL path, read from the served shell itself. */
async function shellResources(html: string): Promise<string[]> {
  const found: string[] = [];
  await new HTMLRewriter()
    .on("script[src], link[href]", { element(el) { found.push(el.getAttribute("src") ?? el.getAttribute("href")!); } })
    .transform(new Response(html)).text();
  return found.filter((x) => x.startsWith("/"));
}

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
  expect((await contentOf(url)).revision).toBe(opened.revision);

  const sent = ok(run(["submit"], w, { session: "s-1", stdin: contribution(round(question("q"))) }));
  expect(sent.live.url).toBe(url);
  const live = await contentOf(url);
  expect(live.revision).toBe(sent.revision);
  expect(askedIn(live, sent.refs.q)).toBeDefined();
  for (const cmd of [["show", "--flow", opened.flow], ["find", `folder:${opened.flow}`]]) expect(ok(run(cmd, w)).live.url).toBe(url);
  expect(hostPids(w)).toHaveLength(1);
});

test("the Flow URL serves the built reader, and the host serves every resource the reader loads without the capability", async () => {
  const w = world();
  const opened = ok(open(w));
  const capability = new URL(opened.live.url).pathname.split("/").filter(Boolean).at(-1)!;
  const shell = await fetch(opened.live.url);
  expect(shell.status).toBe(200);
  expect(shell.headers.get("content-type")).toContain("text/html");
  expect(shell.headers.get("set-cookie")).toContain("HttpOnly");
  const html = await shell.text();
  expect(html).not.toContain(capability);
  expect(html).not.toContain(opened.flow);
  const resources = await shellResources(html);
  expect(resources.some((path) => path.endsWith(".js"))).toBe(true);
  expect(resources.some((path) => path.endsWith(".css"))).toBe(true);
  for (const path of resources) {
    expect(path).not.toContain(capability);
    const r = await fetch(new URL(path, opened.live.url));
    expect([path, r.status]).toEqual([path, 200]);
    expect(r.headers.get("content-type")).toMatch(/^text\/(javascript|css)/);
    expect((await raw(w.port, [`GET ${path} HTTP/1.1`, `Host: evil.example:${w.port}`])).status).toBe(403);
  }
  for (const path of ["/_flow-reader/missing.js", "/_flow-reader/../index.html", "/index.html"]) expect((await raw(w.port, [`GET ${path} HTTP/1.1`, `Host: 127.0.0.1:${w.port}`])).status).toBe(404);
  expect((await fetch(new URL(resources[0], opened.live.url), { method: "POST" })).status).toBe(405);
});

test("the host exposes the same cross-Stage publication sequence with in-place history", async () => {
  const w = world();
  const a = ok(open(w, "author-a"));
  const b = ok(run(["open", "--flow", a.flow, "--skill", "research", "--parent", a.stage], w, { session: "author-b" }));
  const first = ok(run(["submit"], w, { session: "author-a", stdin: contribution(round(question("first"))) }));
  const second = ok(run(["submit"], w, { session: "author-b", stdin: contribution({ kind: "result", ref: "research", shape: "cards", title: "Research between asks", entries: [{ title: "Recorded finding", label: "fact", blocking: false, impact: "Explains the choice", action: "Read before deciding", evidence: "Original evidence" }] }) }));
  const third = ok(run(["submit"], w, { session: "author-a", stdin: contribution(round(question("last"))) }));
  const url = a.live.url;
  const model = await contentOf(url);
  const ids = [first.refs.first, second.refs.research, third.refs.last];
  expect(model.reading.publications.map((b: any) => b.id)).toEqual(ids);
  ok(run(["submit"], w, { session: "author-a", stdin: contribution({ kind: "answer", question: first.refs.first, response: { status: "answered", picks: ["A"], text: "Keep the evidence." } }) }));
  ok(run(["submit"], w, { session: "author-b", stdin: contribution({ kind: "result", revises: second.refs.research, shape: "cards", title: "Revised research", entries: [{ title: "Updated finding", label: "fact", blocking: false, impact: "Clarifies the choice", action: "Continue reading", evidence: "New evidence" }] }) }));
  ok(run(["submit"], w, { session: "author-b", stdin: contribution({ kind: "revise", result: second.refs.research, base: ok(run(["show", "--flow", a.flow], w)).revision, set: { title: "Focused clarification" } }) }));
  const current = await contentOf(url);
  expect(current.reading).toEqual(model.reading);
  expect(askedIn(current, first.refs.first).answer.response.text).toBe("Keep the evidence.");
  expect(current.stages[1].results[0].entries[0].evidence).toBe("New evidence");
  expect(current.stages[1].results[0].history[0].entries[0].evidence).toBe("Original evidence");
  expect(current.stages[1].results[0].history.map((r: any) => r.title)).toEqual(["Research between asks", "Revised research"]);
  expect(current.stages[1].results[0].history[0].anchor).toBe(`${second.refs.research}-r1`);
});

test("a reader polls finite versions and reads answers, Results, task changes, and new Stages at the same live URL", async () => {
  const w = world();
  const opened = ok(open(w));
  const seed = ok(run(["submit"], w, { session: "s-1", stdin: contribution(
    round(question("choice")),
    { kind: "task", ref: "work", title: "Inspect the update", state: "active" },
  ) }));
  async function received(revision: number) {
    const response = await fetch(new URL("versions", opened.live.url), { signal: AbortSignal.timeout(2000) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const versions = await response.json() as any;
    expect(versions.revision).toBe(revision);
    expect(versions.observationVersion).toMatch(/^[a-f0-9]{64}$/);
  }
  await received(seed.revision);
  const answer = ok(run(["submit"], w, { session: "s-1", stdin: contribution(
    { kind: "answer", question: seed.refs.choice, response: { status: "answered", picks: ["B"] } },
  ) }));
  await received(answer.revision);
  const answered = await contentOf(opened.live.url);
  expect(answered.revision).toBe(answer.revision);
  expect(askedIn(answered, seed.refs.choice).answer.state).toBe("picked");
  const result = ok(run(["submit"], w, { session: "s-1", stdin: contribution(
    { kind: "result", ref: "report", shape: "table", title: "Update proof", columns: ["Outcome"], rows: [{ cells: ["Observed"] }] },
  ) }));
  await received(result.revision);
  expect((await contentOf(opened.live.url)).stages[0].results.map((r: any) => r.id)).toContain(result.refs.report);
  const task = ok(run(["submit"], w, { session: "s-1", stdin: contribution(
    { kind: "task", task: seed.refs.work, state: "done", evidence: ["The open reader received the update"] },
  ) }));
  await received(task.revision);
  const snapshot = ok(run(["show", "--flow", opened.flow], w));
  expect(snapshot.progress.tasks.find((t: any) => t.id === seed.refs.work).state).toBe("done");
  const completed = await contentOf(opened.live.url);
  expect(completed.revision).toBe(task.revision);
  expect(completed.progress.tasks.find((t: any) => t.id === seed.refs.work).state).toBe("done");
  const stage = ok(run(["open", "--flow", opened.flow, "--skill", "research"], w, { session: "s-2" }));
  await received(stage.revision);
  expect((await contentOf(opened.live.url)).stages.map((s: any) => s.id)).toContain(stage.stage);
  expect(stage.live.url).toBe(opened.live.url);
});

test("live read-only observations respect separate providers without replacing authored delivery facts", async () => {
  const w = world();
  git(w.cwd, "init", "-q");
  git(w.cwd, "commit", "-q", "--allow-empty", "-m", "seed");
  let prState = "open", checkState = "pending", failing = false;
  const observed = new Date().toISOString();
  const requests: string[] = [];
  const provider = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(req) {
    requests.push(`${req.method} ${new URL(req.url).pathname}`);
    if (failing) return new Response("private provider error secret=never-publish", { status: 503 });
    return Response.json({ observed_at: observed, records: [{ name: new URL(req.url).pathname === "/prs" ? "PR 42" : "Build", state: new URL(req.url).pathname === "/prs" ? prState : checkState }] });
  } });
  const config = join(w.cwd, "docs", "vstack");
  mkdirSync(config, { recursive: true });
  const configure = (file: string, path: string, maxAge = 300) => writeFileSync(join(config, file),
    `- Flow observation: ${JSON.stringify({ adapter: "http-json", url: `${provider.url.origin}${path}`, poll_seconds: 0.1, stale_after_seconds: maxAge })}\n`);
  configure("code-host.md", "/prs");
  configure("ci.md", "/checks");
  try {
    const opened = ok(open(w));
    const authored = ok(run(["submit"], w, { session: "s-1", stdin: contribution(
      { kind: "end-state", requested: "shipped" },
      { kind: "pr", ref: "pr", url: "https://example.test/pull/42", state: "open" },
      { kind: "check", ref: "check", name: "Authored build", outcome: "pending" },
    ) }));
    async function observations() {
      const r = await fetch(new URL("observations", opened.live.url));
      expect(r.status).toBe(200);
      return await r.json() as any;
    }
    let latest: any;
    async function eventually(condition: (o: any) => boolean) {
      for (const end = Date.now() + 8000; Date.now() < end; await Bun.sleep(50)) {
        latest = await observations();
        if (condition(latest)) return;
      }
      expect(condition(latest)).toBe(true);
    }
    await eventually((o) => o.git.status === "current" && o["code-host"]?.records[0]?.state === "open" && o.ci?.records[0]?.state === "pending");
    expect(latest.git.status).toBe("current");
    expect(latest["code-host"].status).toBe("current");
    expect(latest.ci.observed_at).toBe(observed);
    expect(latest["code-host"].provenance.adapter).toBe("http-json");
    prState = "merged"; checkState = "passed";
    await eventually((o) => o["code-host"].records[0]?.state === "merged" && o.ci.records[0]?.state === "passed");
    expect((await contentOf(opened.live.url)).progress.prs.find((x: any) => x.id === authored.refs.pr).state).toBe("open");
    configure("ci.md", "/checks", 0.001);
    await eventually((o) => o.ci.status === "stale");
    failing = true;
    await eventually((o) => o["code-host"].status === "stale" && o.ci.status === "stale");
    expect(JSON.stringify(latest)).not.toContain("never-publish");
    expect(JSON.stringify(await contentOf(opened.live.url))).not.toContain("never-publish");
    configure("code-host.md", "/different-provider");
    await eventually((o) => o["code-host"].status === "unavailable");
    writeFileSync(join(config, "ci.md"), "- CI service: Unsupported service\n");
    await eventually((o) => o.ci.status === "unknown");
    const state = ok(run(["show", "--flow", opened.flow], w));
    expect(state.open).toBe(true);
    expect(state.progress.end_state).toEqual({ requested: "shipped", delivery: true, met: false });
    expect(state.progress.prs).toEqual([{ id: authored.refs.pr, state: "open" }]);
    expect(state.progress.checks).toEqual([{ id: authored.refs.check, outcome: "pending" }]);
    expect(state.progress.complete).toBe(false);
    expect(state.revision).toBe(authored.revision);
    expect(requests.every((r) => r.startsWith("GET "))).toBe(true);
    expect(new Set(requests.map((r) => r.slice(4)))).toEqual(new Set(["/prs", "/checks", "/different-provider"]));
    expect((await fetch(new URL("observations", opened.live.url), { method: "POST" })).status).toBe(405);
  } finally { provider.stop(true); }
});

test("existing GitHub and GitHub Actions project choices observe their own repositories without new setup", async () => {
  const w = world();
  git(w.cwd, "init", "-q", "-b", "feature");
  git(w.cwd, "commit", "-q", "--allow-empty", "-m", "seed");
  const config = join(w.cwd, "docs", "vstack"), bin = join(w.home, "bin");
  mkdirSync(config, { recursive: true }); mkdirSync(bin, { recursive: true });
  writeFileSync(join(config, "code-host.md"), "- Host: GitHub (`github.com`)\n- Repo: `code/project`\n- Tool: the `gh` CLI\n");
  writeFileSync(join(config, "ci.md"), "- CI service: GitHub Actions\n- Repo: `build/project`\n- Tool: the `gh` CLI\n");
  writeFileSync(join(bin, "gh"), `#!/usr/bin/env bun
const a = Bun.argv.slice(2);
const repo = a[a.indexOf("--repo") + 1];
if (a[0] === "pr" && repo === "code/project") console.log(JSON.stringify([{ number: 42, url: "https://github.com/code/project/pull/42", state: "OPEN" }]));
else if (a[0] === "run" && repo === "build/project") console.log(JSON.stringify([{ databaseId: 9, name: "Build", status: "completed", conclusion: "failure", url: "https://github.com/build/project/actions/runs/9" }]));
else process.exit(1);
`, { mode: 0o755 });
  w.path = `${bin}:${ENV.PATH}`;
  const opened = ok(open(w));
  let latest: any;
  await until(async () => {
    latest = await (await fetch(new URL("observations", opened.live.url))).json();
    return latest["code-host"]?.records[0]?.state === "open" && latest.ci?.records[0]?.state === "failed";
  });
  expect(latest["code-host"].status).toBe("current");
  expect(latest["code-host"].records[0].state).toBe("open");
  expect(latest["code-host"].provenance.source).toBe("https://github.com/code/project");
  expect(latest.ci.status).toBe("current");
  expect(latest.ci.records[0].state).toBe("failed");
  expect(latest.ci.provenance.source).toBe("https://github.com/build/project");
});

test("reading git observations does not execute a repository's fsmonitor hook", async () => {
  const w = world();
  git(w.cwd, "init", "-q");
  git(w.cwd, "commit", "-q", "--allow-empty", "-m", "seed");
  const marker = join(w.cwd, "executed"), hook = join(w.cwd, "monitor");
  writeFileSync(hook, `#!/bin/sh\nprintf executed > '${marker}'\nprintf 'token\\000'\n`, { mode: 0o755 });
  git(w.cwd, "config", "core.fsmonitor", hook);
  const opened = ok(open(w));
  let latest: any;
  for (const end = Date.now() + 3000; Date.now() < end; await Bun.sleep(50)) {
    latest = await (await fetch(new URL("observations", opened.live.url))).json();
    if (latest.git.status === "current") break;
  }
  expect(latest.git.status).toBe("current");
  expect(() => readFileSync(marker)).toThrow();
});

test("close and reopen keep the same live URL and publish their lifecycle revisions", async () => {
  const w = world();
  const opened = ok(open(w));
  ok(run(["submit"], w, { session: "s-1", stdin: contribution({ kind: "stage", state: "finished" }) }));
  const closed = ok(run(["close", "--flow", opened.flow], w));
  expect(closed.live.url).toBe(opened.live.url);
  expect((await contentOf(closed.live.url)).revision).toBe(closed.revision);
  expect(ok(run(["show", "--flow", opened.flow], w)).open).toBe(false);
  const reopened = ok(run(["reopen", "--flow", opened.flow, "--skill", "explain"], w, { session: "s-1" }));
  expect(reopened.live.url).toBe(opened.live.url);
  expect((await contentOf(reopened.live.url)).revision).toBe(reopened.revision);
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
    expect((await fetch(r.live.url)).status).toBe(200);
    expect((await contentOf(r.live.url)).flow.id).toBe(r.flow);
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
  expect((await fetch(url)).status).toBe(200);
  expect(askedIn(await contentOf(url), sent.refs.q)).toBeDefined();

  for (const pid of hostPids(w)) process.kill(pid, "SIGKILL");
  expect(await until(() => hostPids(w).length === 0)).toBe(true);
  expect(ok(run(["show", "--flow", opened.flow], w)).live.url).toBe(url);
  expect((await contentOf(url)).flow.id).toBe(opened.flow);
  expect(hostPids(w)).toHaveLength(1);
});

test("the host stops once idle, while an open reader or a publication in flight keeps it running", async () => {
  const w = world({ idle: 1 });
  const opened = ok(open(w));
  expect(hostPids(w)).toHaveLength(1);

  for (let i = 0; i < 6; i++) {
    const response = await fetch(new URL("versions", opened.live.url), { signal: AbortSignal.timeout(1000) });
    expect(response.status).toBe(200);
    await response.json();
    await Bun.sleep(400);
  }
  expect(hostPids(w)).toHaveLength(1);
  expect(await until(() => hostPids(w).length === 0)).toBe(true);

  const p = Bun.spawn(argv(["submit"], w, {}), { cwd: w.cwd, env: envOf(w, { session: "s-1" }), stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  expect(await until(() => hostPids(w).length === 1)).toBe(true);
  await Bun.sleep(2500);
  expect(p.exitCode).toBeNull();
  expect(hostPids(w)).toHaveLength(1);
  p.stdin.write(JSON.stringify(contribution(round(question("q")))));
  p.stdin.end();
  const [stdout, code] = await Promise.all([new Response(p.stdout).text(), p.exited]);
  expect(code).toBe(0);
  expect(JSON.parse(stdout).live.state).toBe("serving");
  expect(await until(() => hostPids(w).length === 0)).toBe(true);
}, 30_000);

test("a port another program holds is reported truthfully, the publication stays committed, and presentation recovers without duplicate content", async () => {
  const w = world();
  const opened = ok(open(w));
  ok(run(["host", "stop"], w));
  const credentials: string[] = [];
  const other = Bun.serve({ hostname: "127.0.0.1", port: w.port, fetch(req) {
    const auth = req.headers.get("authorization");
    if (auth) credentials.push(auth);
    return new Response("someone else");
  } });
  try {
    const r = await runAsync(["submit"], w, { session: "s-1", stdin: contribution(round(question("q"))) });
    expect(r.code).toBe(0);
    expect(r.json.live.state).toBe("unavailable");
    expect(r.json.live.url).toBeUndefined();
    expect(typeof r.json.live.error).toBe("string");
    expect(r.json).not.toHaveProperty("page");
    expect(r.stderr).toContain(r.json.live.error);
    expect(r.stderr).not.toContain(w.home);
    expect(await (await fetch(`http://127.0.0.1:${w.port}/`)).text()).toBe("someone else");
    expect(hostPids(w)).toHaveLength(0);
    expect(credentials).toEqual([]);
    other.stop(true);
    const recovered = ok(await runAsync(["bound"], w, { session: "s-1" }));
    expect(recovered.live.url).toBe(opened.live.url);
    const model = await contentOf(recovered.live.url);
    expect(model.revision).toBe(r.json.revision);
    expect(model.questions.filter((q: any) => q.id === r.json.refs.q)).toHaveLength(1);
    expect(model.reading.publications.filter((b: any) => b.id === r.json.refs.q)).toHaveLength(1);
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
  expect(r.json).not.toHaveProperty("page");
  expect((await fetch(url)).status).toBe(200);
  expect(hostPids(first)).toHaveLength(1);
  expect(hostPids(second)).toHaveLength(0);
});

function copiedPlugin(): string {
  const skills = join(root, `copy-${n++}`, "skills");
  cpSync(join(SKILLS, "flow-page"), join(skills, "flow-page"), { recursive: true });
  cpSync(join(SKILLS, "vstack-tmp"), join(skills, "vstack-tmp"), { recursive: true });
  cpSync(join(SKILLS, "vstack-figures"), join(skills, "vstack-figures"), { recursive: true });
  return skills;
}

test("a refreshed reader build makes the running host incompatible: it keeps serving its own bundle and gives way only to host stop", async () => {
  const w = world();
  const skills = copiedPlugin();
  const script = join(skills, "flow-page", "scripts", "flow-page.ts");
  const opened = ok(run(["open", "--title", "Checkout limits", "--skill", "grill-me"], w, { session: "s-1", script }));
  expect(opened.live.state).toBe("serving");
  const oldPids = hostPids(w);
  expect(oldPids).toHaveLength(1);
  const asset = (await shellResources(await (await fetch(opened.live.url)).text())).find((path) => path.endsWith(".js"))!;
  const served = async () => Buffer.from(await (await fetch(new URL(asset, opened.live.url))).arrayBuffer());
  const original = await served();
  writeFileSync(join(skills, "flow-page", "reader", asset.slice(1)), Buffer.concat([original, Buffer.from("\n// refreshed build\n")]));
  const refreshed = readFileSync(join(skills, "flow-page", "reader", asset.slice(1)));

  const r = run(["show", "--flow", opened.flow], w, { script });
  expect(r.code).toBe(0);
  expect(r.json.live.state).toBe("unavailable");
  expect(r.json.live.error).toContain("incompatible");
  expect((await served()).equals(original)).toBe(true);
  expect(hostPids(w)).toEqual(oldPids);

  expect(ok(run(["host", "stop"], w, { script })).host.state).toBe("stopped");
  const again = ok(run(["show", "--flow", opened.flow], w, { script }));
  expect(again.live.url).toBe(opened.live.url);
  expect(hostPids(w)).toHaveLength(1);
  expect(hostPids(w)).not.toEqual(oldPids);
  expect((await served()).equals(refreshed)).toBe(true);
});

test("an unbuilt reader starts no host: the receipt says why, and the content stays committed", async () => {
  const w = world();
  const skills = copiedPlugin();
  rmSync(join(skills, "flow-page", "reader"), { recursive: true, force: true });
  const script = join(skills, "flow-page", "scripts", "flow-page.ts");
  const r = run(["open", "--title", "Checkout limits", "--skill", "grill-me"], w, { session: "s-1", script });
  expect(r.code).toBe(0);
  expect(r.json.live.state).toBe("unavailable");
  expect(r.json.live.error).toContain("not built");
  expect(r.json).not.toHaveProperty("page");
  expect(hostPids(w)).toHaveLength(0);
  const sent = run(["submit"], w, { session: "s-1", script, stdin: contribution(round(question("q"))) });
  expect(sent.code).toBe(0);
  expect(run(["show", "--flow", r.json.flow], w, { script }).json.stages[0].questions.map((q: any) => q.id)).toEqual([sent.json.refs.q]);
  expect(hostPids(w)).toHaveLength(0);
});

test("VSTACK_FLOW_HOST=off starts no host and reports presentation off, not a file", () => {
  const w = world();
  const r = Bun.spawnSync(argv(["open", "--title", "Checkout limits", "--skill", "grill-me"], w, {}), {
    cwd: w.cwd,
    env: { ...envOf(w, { session: "s-1" }), VSTACK_FLOW_HOST: "off" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const json = ok(parse(r.exitCode, r.stdout.toString(), r.stderr.toString()));
  expect(json.live).toEqual({ state: "off" });
  expect(json).not.toHaveProperty("page");
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
  const other = world({ home: w.home, port: w.port, cwd: join(root, `project-${n++}`) });
  git(other.cwd, "init", "-q", "-b", "main");
  const c = ok(open(other, "s-c", "Flow C"));
  expect(new URL(c.live.url).origin).toBe(new URL(a.live.url).origin);

  const urlA = new URL(a.live.url);
  const file = ok(run(["show", "--flow", a.flow], w)).attachments[0].file as string;
  const asset = await fetch(new URL(file, urlA));
  expect(asset.status).toBe(200);
  expect(Buffer.from(await asset.arrayBuffer()).equals(PNG)).toBe(true);

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

  const folder = storedFolder(w.home, a.flow);
  writeFileSync(join(folder, "assets", "planted.txt"), "planted");
  expect((await fetch(new URL("assets/planted.txt", urlA))).status).toBe(404);
  writeFileSync(join(root, "outside.png"), "outside secret");
  unlinkSync(join(folder, file));
  symlinkSync(join(root, "outside.png"), join(folder, file));
  const escaped = await fetch(new URL(file, urlA));
  expect(escaped.status).toBe(404);
  expect(await escaped.text()).not.toContain("outside secret");

  const path = urlA.pathname;
  for (const headers of [[`Host: evil.example:${w.port}`], [`Host: 127.0.0.1:${w.port}`, "Origin: http://evil.example"], [`Host: 127.0.0.1:${w.port}`, "Sec-Fetch-Site: cross-site"]]) {
    expect((await raw(w.port, [`GET ${path} HTTP/1.1`, ...headers])).status).toBe(403);
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    for (const p of [path, `${path}versions`, `${path}${file}`, "/run", "/merge", "/command"]) {
      const r = await raw(w.port, [`${method} ${p} HTTP/1.1`, `Host: 127.0.0.1:${w.port}`, "Content-Length: 0"]);
      expect([method, p, r.status >= 400]).toEqual([method, p, true]);
    }
  }

  const exposed = `${(await page(a.live.url)).html}${JSON.stringify(await contentOf(a.live.url))}${await (await fetch(new URL("observations", a.live.url))).text()}`;
  const tokens = new Set([...exposed.matchAll(/[A-Za-z0-9_-]{16,}/g)].map((m) => m[0]));
  for (const t of tokens) {
    const r = await raw(w.port, ["POST /.host/stop HTTP/1.1", `Host: 127.0.0.1:${w.port}`, `Authorization: Bearer ${t}`, "Content-Length: 0"]);
    expect(r.status).not.toBe(200);
  }
  expect(hostPids(w)).toHaveLength(1);
  expect((await page(a.live.url)).status).toBe(200);
  expect(sent.refs.doc).toBeTruthy();
});

test("a shared Flow observes the current authoring worktree and recovers when its first checkout disappears", async () => {
  const main = world();
  git(main.cwd, "init", "-q", "-b", "main");
  git(main.cwd, "commit", "-q", "--allow-empty", "-m", "base");
  const a = world({ home: main.home, port: main.port });
  const b = world({ home: main.home, port: main.port });
  rmSync(a.cwd, { recursive: true });
  rmSync(b.cwd, { recursive: true });
  git(main.cwd, "worktree", "add", "-q", "-b", "feat-a", a.cwd);
  git(main.cwd, "worktree", "add", "-q", "-b", "feat-b", b.cwd);
  const opened = ok(open(a, "worktree-a"));
  const joined = ok(run(["open", "--flow", opened.flow, "--skill", "implement"], b, { session: "worktree-b" }));
  const observed = async () => (await fetch(new URL("observations", opened.live.url))).json() as Promise<any>;
  let observation: any;
  for (let i = 0; i < 80; i++) {
    observation = await observed();
    if (observation.git.status === "current") break;
    await Bun.sleep(50);
  }
  expect(observation.git.records[0].name).toBe("feat-b");
  expect(observation.git.provenance.source).toBe(realpathSync(b.cwd));
  await Promise.all([
    runAsync(["submit"], a, { session: "worktree-a", stdin: contribution(round(question("from-a"))) }),
    runAsync(["submit"], b, { session: "worktree-b", stdin: contribution(round(question("from-b"))) }),
  ]).then((results) => results.forEach(ok));
  ok(run(["alias", "branch:release/267"], b, { session: "worktree-b" }));
  ok(run(["show", "--flow", opened.flow], a));
  git(main.cwd, "worktree", "remove", a.cwd);
  a.cwd = main.cwd;
  ok(run(["submit"], b, { session: "worktree-b", stdin: contribution(round(question("after-removal"))) }));
  for (let i = 0; i < 80; i++) {
    observation = await observed();
    if (observation.git.status === "current" && observation.git.records[0]?.name === "feat-b") break;
    await Bun.sleep(50);
  }
  expect(observation.git.status).toBe("current");
  expect(observation.git.records[0].name).toBe("feat-b");
  expect(observation.git.provenance).toMatchObject({ source: realpathSync(b.cwd), stage: joined.stage, branch: "release/267" });
});

test("Picker presence is control-only, read-scoped runtime state that expires and disappears on restart", async () => {
  const w = world();
  const opened = ok(open(w));
  const other = ok(open(w, "other", "Another Flow"));
  const key = decodeURIComponent(new URL(opened.live.url).pathname.split("/")[2]);
  const endpoint = `http://127.0.0.1:${w.port}/.host/picker`;
  const presence = { key, flow: opened.flow, stage: opened.stage, session: "s-1", picker: "picker-one", questions: ["question-1", "question-2"], expires: Date.now() + 60_000 };
  const write = (token?: string, value = presence, method = "PUT") => fetch(endpoint, {
    method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(value),
  });
  const read = async (url = opened.live.url) => {
    const response = await fetch(new URL("presence", url));
    expect(response.status).toBe(200);
    return response.json();
  };
  expect((await write()).status).toBe(401);
  const readCapability = new URL(opened.live.url).pathname.split("/").at(-2)!;
  expect((await write(readCapability)).status).toBe(401);
  expect((await fetch(new URL("presence", opened.live.url), { method: "POST", body: JSON.stringify(presence) })).status).toBe(405);
  const control = secrets(w.home).control;
  expect((await write(control)).status).toBe(200);
  expect(await read()).toEqual({ presences: [presence] });
  expect(await read(other.live.url)).toEqual({ presences: [] });
  expect((await contentOf(opened.live.url)).revision).toBe(opened.revision);
  expect(await contentOf(opened.live.url)).not.toHaveProperty("presences");
  expect((await write(control, { ...presence, picker: "older" }, "DELETE")).status).toBe(200);
  expect(await read()).toEqual({ presences: [presence] });
  expect((await write(control, presence, "DELETE")).status).toBe(200);
  expect(await read()).toEqual({ presences: [] });
  expect((await write(control, { ...presence, expires: Date.now() + 150 })).status).toBe(200);
  expect(await until(async () => (await read() as any).presences.length === 0)).toBe(true);
  expect((await write(control)).status).toBe(200);
  ok(run(["host", "stop"], w));
  ok(run(["bound", "--session", "s-1"], w));
  expect(await read()).toEqual({ presences: [] });
  expect((await contentOf(opened.live.url)).revision).toBe(opened.revision);
});

test("the session target query follows the main binding, the first asked question, Ratchet, and expiry", async () => {
  const w = world();
  expect(ok(run(["target", "--session", "unbound"], w))).toEqual({ target: null });
  const opened = ok(open(w, "selected"));
  ok(run(["open", "--flow", opened.flow, "--skill", "research", "--session", "selected", "--agent", "child"], w));
  const receipt = ok(run(["submit", "--session", "selected"], w, { stdin: contribution(round(question("first"), question("second"))) }));
  const target = () => ok(run(["target", "--session", "selected", "--agent", "child"], w));
  expect(target().target).toBe(`${opened.live.url}#${opened.stage}`);
  expect(target().picker).toBeNull();
  ok(run(["picker", "open", "--picker", "ask-one", ...receipt.ask.questions.toReversed().map((q: any) => q.id), "--session", "selected"], w));
  expect(target().target).toBe(`${opened.live.url}#${receipt.refs.second}`);
  expect(target().picker).toBe("ask-one");
  ok(run(["picker", "clear", "--picker", "ask-one", "--session", "selected"], w));
  expect(target().target).toBe(`${opened.live.url}#${opened.stage}`);
  ok(run(["picker", "open", "--picker", "ratchet", "--session", "selected"], w));
  expect(target().target).toBe(`${opened.live.url}#${opened.stage}`);
  expect(target().picker).toBe("ratchet");
  const key = decodeURIComponent(new URL(opened.live.url).pathname.split("/")[2]);
  await fetch(`http://127.0.0.1:${w.port}/.host/picker`, {
    method: "PUT", headers: { authorization: `Bearer ${secrets(w.home).control}`, "content-type": "application/json" },
    body: JSON.stringify({ key, flow: opened.flow, stage: opened.stage, session: "selected", picker: "expired", questions: [receipt.refs.first], expires: Date.now() - 1 }),
  });
  expect(target().target).toBe(`${opened.live.url}#${opened.stage}`);
  expect((await contentOf(opened.live.url)).revision).toBe(receipt.revision);
});

test("control routes keep exact paths and methods rather than Nuxt's trailing-slash and HEAD aliases", async () => {
  const w = world();
  const opened = ok(open(w));
  const headers = { authorization: `Bearer ${secrets(w.home).control}`, "x-flow-challenge": "a".repeat(64) };
  expect((await fetch(new URL("/.host/storage", opened.live.url))).status).toBe(401);
  expect(await (await fetch(new URL("/.host/storage", opened.live.url), { headers })).json()).toEqual({ storage: "sqlite" });
  for (const [path, method] of [
    ["/.host/hello", "HEAD"], ["/.host/hello/", "GET"],
    ["/.host/hold", "HEAD"], ["/.host/hold/", "GET"],
    ["/.host/storage", "HEAD"], ["/.host/storage/", "GET"],
    ["/.host/picker/", "PUT"], ["/.host/stop/", "POST"],
  ]) {
    const result = await fetch(new URL(path, opened.live.url), { method, headers, signal: AbortSignal.timeout(1000) });
    expect([path, method, result.status]).toEqual([path, method, 404]);
    await result.body?.cancel();
  }
  expect((await contentOf(opened.live.url)).flow.id).toBe(opened.flow);
});

test("Flow endpoint aliases and unknown paths preserve the capability-scoped method refusals", async () => {
  const w = world();
  const opened = ok(open(w));
  for (const [path, method, status] of [
    ["content/", "GET", 404], ["versions/", "GET", 404], ["comments/", "GET", 404],
    ["content/", "POST", 405], ["comments/", "POST", 405],
    ["unregistered", "GET", 404], ["unregistered", "POST", 405], ["unregistered", "PUT", 405],
  ] as const) {
    const result = await fetch(new URL(path, opened.live.url), { method });
    expect([path, method, result.status]).toEqual([path, method, status]);
  }
});

test("an isolated host treats changed Nitro bytes as incompatible without changing its public reader generation", async () => {
  const w = world();
  const skills = copiedPlugin();
  const script = join(skills, "flow-page/scripts/flow-page.ts");
  const opened = ok(run(["open", "--title", "Nitro compatibility", "--skill", "implement"], w, { session: "nitro", script }));
  const versions = async () => (await (await fetch(new URL("versions", opened.live.url))).json()) as { readerGeneration: string };
  const before = await versions();
  const entry = join(skills, "flow-page/reader/server/index.mjs");
  writeFileSync(entry, Buffer.concat([readFileSync(entry), Buffer.from("\n// new Nitro build\n")]));
  const shown = run(["show", "--flow", opened.flow], w, { script });
  expect(shown.json.live.state).toBe("unavailable");
  expect(shown.json.live.error).toContain("incompatible");
  expect(await versions()).toEqual(before);
  ok(run(["host", "stop"], w, { script }));
  expect(ok(run(["show", "--flow", opened.flow], w, { script })).live.url).toBe(opened.live.url);
  expect((await versions()).readerGeneration).toBe(before.readerGeneration);
});

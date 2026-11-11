import { afterAll, expect, test } from "bun:test";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ENV, git } from "./support/fixture.ts";
import type { Connection } from "../plugin/skills/flow-page/scripts/live.ts";
import type { Stage, State, View } from "../plugin/skills/flow-page/scripts/model.ts";

type FlowReceipt = { flow: State["flow"]["id"]; stage: Stage["id"]; live: { state: "serving"; url: string } };
type UnavailableReceipt = { live: Extract<Connection, { state: "unavailable" }> };
type HostReceipt = { host: { state: "running" | "stopped" | "unavailable" } };

const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-runtime-")));
const skills = process.env.VSTACK_RUNTIME_TEST_SKILLS ?? join(import.meta.dir, "../plugin/skills");
const homes: { home: string; cwd: string; script: string; port: number }[] = [];
let serial = 0;
const port = () => {
  const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const result = listener.port;
  listener.stop(true);
  return result;
};
function copy(name: string) {
  const plugin = join(root, name);
  for (const skill of ["flow-page", "vstack-tmp", "vstack-figures"]) cpSync(join(skills, skill), join(plugin, "skills", skill), { recursive: true });
  return join(plugin, "skills/flow-page/scripts/flow-page.ts");
}
function cli(script: string, home: string, cwd: string, port: number, args: string[], input?: object) {
  const child = Bun.spawn([process.execPath, script, ...args], {
    cwd, env: { ...ENV, HOME: home, VSTACK_FLOW_PORT: String(port), PI_SESSION_ID: "runtime-session" },
    stdin: input ? new TextEncoder().encode(JSON.stringify(input)) : "ignore", stdout: "pipe", stderr: "pipe",
  });
  return Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]).then(([code, stdout, stderr]) => {
    if (process.env.VSTACK_RUNTIME_TEST_EVIDENCE) appendFileSync(process.env.VSTACK_RUNTIME_TEST_EVIDENCE, `${JSON.stringify({ script, home, cwd, port, args, code, stdout, stderr })}\n`);
    let json: unknown;
    try { json = JSON.parse(stdout); } catch {}
    return { code, stdout, stderr, json };
  });
}
function ok<T = FlowReceipt>(result: Awaited<ReturnType<typeof cli>>): T {
  expect(result.stderr).toBe("");
  expect(result.code).toBe(0);
  expect(result.json).not.toBeUndefined();
  return result.json as T;
}
function world() {
  const base = join(root, `world-${serial++}`), home = join(base, "home"), cwd = join(base, "project");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  git(cwd, "init", "-q");
  const script = copy(`installed-${serial}`), installed = join(home, ".omp/plugins/node_modules");
  mkdirSync(installed, { recursive: true });
  symlinkSync(join(script, "../../../.."), join(installed, "vstack"));
  const w = { home, cwd, script, port: port() };
  homes.push(w);
  return w;
}
afterAll(async () => {
  for (const w of homes) await cli(w.script, join(root, "cleanup-home"), w.cwd, w.port, ["host", "stop", "--home", w.home]);
  rmSync(root, { recursive: true, force: true });
});
const content = async (url: string) => {
  const response = await fetch(new URL("content", url));
  expect(response.status).toBe(200);
  return response.json() as Promise<Pick<View, "flow" | "revision" | "stages">>;
};

test("differing worktree CLIs author and serve through installed code with caller identities, while development hosts stay isolated", async () => {
  const w = world(), cwdA = join(root, "worktree a"), cwdB = join(root, "worktree b");
  git(w.cwd, "commit", "-q", "--allow-empty", "-m", "base");
  git(w.cwd, "worktree", "add", "-q", "-b", "candidate-a", cwdA);
  git(w.cwd, "worktree", "add", "-q", "-b", "candidate-b", cwdB);
  const a = copy("worktree a/plugin"), b = copy("worktree b/plugin");
  for (const [script, name] of [[a, "a"], [b, "b"]]) {
    appendFileSync(join(script, "../fields.ts"), `\nthrow new Error("unfinished worktree ${name}");\n`);
  }
  const first = ok(await cli(a, w.home, cwdA, w.port, ["open", "--skill", "implement", "--title", "Installed owner", "--agent", "a"]));
  const homeAlias = join(root, "normal-home-alias");
  symlinkSync(w.home, homeAlias);
  expect(ok<HostReceipt>(await cli(b, w.home, w.cwd, w.port, ["host", "status", `--home=${homeAlias}`])).host.state).toBe("running");
  expect(first.live.state).toBe("serving");
  const before = ok<HostReceipt>(await cli(a, w.home, w.cwd, w.port, ["host", "status"])).host;
  const credentials = readFileSync(join(w.home, ".vstack/host/secrets.json"));
  const projectKey = new URL(first.live.url).pathname.split("/")[2];
  expect(projectKey).toBeTruthy();
  const joined = ok(await cli(b, w.home, cwdB, w.port, ["open", "--flow", first.flow, "--parent", first.stage, "--skill", "research", "--session", "second-session", "--agent", "b", "--home", w.home]));
  const write = (script: string, cwd: string, session: string, agent: string, title: string) => cli(script, w.home, cwd, w.port,
    ["submit", "--session", session, "--agent", agent], { version: 1, items: [{ kind: "result", shape: "table", title, columns: ["Owner"], rows: [{ cells: [title] }] }] });
  const writes = (await Promise.all([write(a, cwdA, "runtime-session", "a", "From A"), write(b, cwdB, "second-session", "b", "From B")])).map(result => ok(result));
  expect(writes.map(r => r.stage)).toEqual([first.stage, joined.stage]);
  expect(writes.every(r => r.live.url === first.live.url)).toBe(true);
  const model = await content(first.live.url);
  expect(model.flow.id).toBe(first.flow);
  expect(model.stages.map(s => s.results.map(r => r.title))).toEqual([["From A"], ["From B"]]);
  expect(ok(await cli(a, w.home, cwdA, w.port, ["bound", "--agent", "a"]))).toMatchObject({ flow: first.flow, stage: first.stage });
  expect(ok(await cli(b, w.home, cwdB, w.port, ["bound", "--session", "second-session", "--agent", "b"]))).toMatchObject({ flow: first.flow, stage: joined.stage });
  const otherProject = join(root, "unrelated-project");
  mkdirSync(otherProject);
  git(otherProject, "init", "-q");
  expect((await cli(a, w.home, otherProject, w.port, ["show", "--flow", first.flow])).code).toBe(1);

  const candidate = copy("development"), developmentHome = join(root, "development-home"), developmentPort = port();
  mkdirSync(developmentHome);
  const devArgs = ["--home", developmentHome];
  appendFileSync(join(candidate, "../..", "reader/index.html"), "\n<!-- isolated candidate reader -->\n");
  const dev = ok(await cli(candidate, w.home, w.cwd, developmentPort, ["open", "--title", "Development candidate", "--skill", "implement", ...devArgs]));
  homes.push({ home: developmentHome, cwd: w.cwd, script: candidate, port: developmentPort });
  expect(dev.live.state).toBe("serving");
  expect(new URL(dev.live.url).port).toBe(String(developmentPort));
  expect(await (await fetch(dev.live.url)).text()).toContain("isolated candidate reader");
  expect(await (await fetch(first.live.url)).text()).not.toContain("isolated candidate reader");
  expect(dev.live.url).not.toBe(first.live.url);
  const devCredentials = readFileSync(join(developmentHome, ".vstack/host/secrets.json"));
  expect(devCredentials.equals(credentials)).toBe(false);
  expect((await cli(candidate, w.home, w.cwd, developmentPort, ["show", "--flow", first.flow, ...devArgs])).code).toBe(1);
  expect((await cli(a, w.home, w.cwd, w.port, ["show", "--flow", dev.flow])).code).toBe(1);
  ok(await cli(candidate, w.home, w.cwd, developmentPort, ["host", "stop", ...devArgs]));
  rmSync(join(candidate, "../..", "reader"), { recursive: true });
  const broken = await cli(candidate, w.home, w.cwd, developmentPort, ["show", "--flow", dev.flow, ...devArgs]);
  expect(broken.code).toBe(0);
  expect((broken.json as UnavailableReceipt).live.state).toBe("unavailable");
  expect((broken.json as UnavailableReceipt).live.error).toContain("not built");
  expect((await content(first.live.url)).revision).toBe(model.revision);
  expect(ok<HostReceipt>(await cli(b, w.home, w.cwd, w.port, ["host", "status"])).host).toEqual(before);
  expect(readFileSync(join(w.home, ".vstack/host/secrets.json")).equals(credentials)).toBe(true);
  expect(ok(await cli(a, w.home, w.cwd, w.port, ["bound", "--agent", "a"])).live.url).toBe(first.live.url);
}, 30_000);

test("missing installed runtime refuses normal commands without falling back to candidate code", async () => {
  const home = join(root, "missing-install"), cwd = join(root, "missing-project");
  mkdirSync(home); mkdirSync(cwd);
  const script = copy("uninstalled-worktree");
  const selectedPort = port();
  homes.push({ home, cwd, script, port: selectedPort });
  const result = await cli(script, home, cwd, selectedPort, ["open", "--skill", "implement", "--title", "Must not author"]);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("installed vstack");
  expect(existsSync(join(home, ".vstack"))).toBe(false);
});

test("installed runtime discovery leaves an unrelated listener untouched and sends it no credentials", async () => {
  const w = world(), caller = copy("listener-worktree"), credentials: string[] = [];
  const listener = Bun.serve({ hostname: "127.0.0.1", port: w.port, fetch(request) {
    const auth = request.headers.get("authorization");
    if (auth) credentials.push(auth);
    return new Response("unrelated listener");
  } });
  try {
    const result = await cli(caller, w.home, w.cwd, w.port, ["open", "--title", "Unrelated listener", "--skill", "implement"]);
    expect(result.code).toBe(0);
    expect((result.json as UnavailableReceipt).live.state).toBe("unavailable");
    expect((result.json as UnavailableReceipt).live.error).toContain("another program");
    expect(ok<HostReceipt>(await cli(caller, w.home, w.cwd, w.port, ["host", "stop"])).host.state).toBe("unavailable");
    expect(await (await fetch(listener.url)).text()).toBe("unrelated listener");
    expect(credentials).toEqual([]);
  } finally { listener.stop(true); }
});

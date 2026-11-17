import { afterAll, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ENV, git } from "./support/fixture.ts";
import { futureDatabase, legacyBackup, legacyBytes, legacyCompanion, legacyExists, legacySources, storageSnapshot } from "./support/flow-store.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-cutover-")));
const skills = join(import.meta.dir, "../plugin/skills");
const pinned = join(import.meta.dir, "fixtures/flow-pre-sqlite");
type World = { home: string; cwd: string; plugin: string; script: string; port: number };
const homes: World[] = [];
function world(): World {
  const base = join(root, String(homes.length)), home = join(base, "home"), cwd = join(base, "project"), plugin = join(base, "installed");
  mkdirSync(cwd, { recursive: true });
  git(cwd, "init", "-q");
  for (const name of ["flow-page", "vstack-tmp", "vstack-figures"]) cpSync(join(skills, name), join(plugin, "skills", name), { recursive: true });
  symlinkSync(join(import.meta.dir, "../node_modules"), join(plugin, "node_modules"));
  mkdirSync(join(home, ".omp/plugins/node_modules"), { recursive: true });
  symlinkSync(plugin, join(home, ".omp/plugins/node_modules/vstack"));
  const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } }), port = socket.port;
  socket.stop(true);
  const script = join(plugin, "skills/flow-page/scripts/flow-page.ts");
  return { home, cwd, plugin, script, port };
}
function seal(w: ReturnType<typeof world>) {
  const run = Bun.spawnSync([process.execPath, join(w.script, "../generation.ts"), "seal"], { env: ENV, stdout: "pipe", stderr: "pipe" });
  expect(run.exitCode).toBe(0);
}
function previous(w: ReturnType<typeof world>) {
  for (const name of ["store.ts", "cli.ts", "live.ts", "host.ts", "generation.ts", "managed-host.ts", "flow-page.ts"]) writeFileSync(join(w.script, "..", name), readFileSync(join(pinned, `${name}.txt`)));
  seal(w);
}
function current(w: ReturnType<typeof world>, broken = false) {
  cpSync(join(skills, "flow-page/scripts"), join(w.script, ".."), { recursive: true });
  if (broken) writeFileSync(join(w.script, "../host.ts"), "throw new Error('broken SQLite candidate');\n");
  seal(w);
}
async function cli(w: ReturnType<typeof world>, args: string[], input?: unknown, extra: Record<string, string> = {}) {
  const proc = Bun.spawn([process.execPath, w.script, ...args, "--session", "cutover-session", "--agent", "cutover-agent"], {
    cwd: w.cwd, env: { ...ENV, HOME: w.home, VSTACK_FLOW_PORT: String(w.port), ...extra }, stdin: input ? new TextEncoder().encode(JSON.stringify(input)) : "ignore", stdout: "pipe", stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code, stdout, stderr, json: stdout ? JSON.parse(stdout) : undefined };
}
function ok(run: Awaited<ReturnType<typeof cli>>) { expect(run.code).toBe(0); expect(run.stderr).toBe(""); return run.json; }
afterAll(async () => {
  for (const w of homes) await cli(w, ["host", "stop", "--home", w.home], undefined, { HOME: join(root, "cleanup") });
  rmSync(root, { recursive: true, force: true });
});
const contribution = { version: 1, items: [{ kind: "result", shape: "document", title: "SQLite contribution", sections: [{ heading: "Current", blocks: [{ prose: "Current committed content." }] }] }] };

for (const broken of [false, true]) test(`first SQLite cutover stops the pinned JSON supervisor before import, candidate broken=${broken}`, async () => {
  const w = world(); homes.push(w); previous(w);
  const opened = ok(await cli(w, ["open", "--title", "Cutover", "--skill", "explain"]));
  ok(await cli(w, ["submit"], { ...contribution, items: [{ ...contribution.items[0], title: "Before cutover" }] }));
  const page = await fetch(opened.live.url), cookie = page.headers.get("set-cookie")!.split(";")[0]!;
  const oldComment = { version: 1, result: "result-1", revision: 1, edit: null, anchor: { kind: "block" }, text: "Saved before cutover." };
  expect((await fetch(new URL("comments", opened.live.url), { method: "POST", headers: { cookie, origin: new URL(opened.live.url).origin, "content-type": "application/json" }, body: JSON.stringify(oldComment) })).status).toBe(200);
  expect(opened.live.state).toBe("serving");
  const status = ok(await cli(w, ["host", "status"])).host;
  const files = legacySources(w.home);
  expect(files).toHaveLength(1);
  const original = legacyBytes(files[0]!);
  const commentsPath = legacyCompanion(files[0]!, "comments"), originalComments = legacyBytes(commentsPath);
  const poll = setInterval(() => { void fetch(new URL("versions", opened.live.url)).catch(() => {}); }, 50);
  try {
    current(w, broken);
    const result = await cli(w, ["submit"], contribution);
    expect(result.code).toBe(0);
    expect(result.json.revision).toBe(3);
    expect(legacyExists(files[0]!)).toBe(false);
    expect(legacyBackup(files[0]!)).toEqual(original);
    expect(legacyBackup(commentsPath)).toEqual(originalComments);
    expect(result.json.live.state).toBe(broken ? "unavailable" : "serving");
    if (broken) {
      await expect(fetch(new URL("content", opened.live.url))).rejects.toThrow();
      await expect(fetch(new URL("comments", opened.live.url), { method: "POST", headers: { cookie, origin: new URL(opened.live.url).origin, "content-type": "application/json" }, body: JSON.stringify({ ...oldComment, text: "Must remain a browser draft." }) })).rejects.toThrow();
      expect(legacyExists(commentsPath)).toBe(false);
      expect(legacyBackup(commentsPath)).toEqual(originalComments);
      expect(result.stderr).toContain("content is stored");
      const stored = await cli(w, ["show", "--flow", opened.flow], undefined, { VSTACK_FLOW_HOST: "off" });
      expect(ok(stored).revision).toBe(3);
    } else {
      expect(result.json.live.url).toBe(opened.live.url);
      const shown = await (await fetch(new URL("content", opened.live.url))).json();
      expect(shown.revision).toBe(3);
      expect(ok(await cli(w, ["host", "status"])).host.pid).not.toBe(status.pid);
    }
  } finally { clearInterval(poll); }
}, 30_000);

test("a pinned supervisor starts a SQLite worker and repeated CLIs recognize its forwarded storage route", async () => {
  const w = world(); homes.push(w); previous(w);
  const opened = ok(await cli(w, ["open", "--title", "Worker storage", "--skill", "explain"]));
  const before = ok(await cli(w, ["host", "status"])).host;
  const secret = JSON.parse(readFileSync(join(w.home, ".vstack/host/secrets.json"), "utf8"));
  const storage = new URL("/.host/storage", opened.live.url);
  current(w);
  let ready = false;
  for (const end = Date.now() + 10_000; Date.now() < end; await Bun.sleep(50)) {
    const response = await fetch(storage, { headers: { authorization: `Bearer ${secret.control}` } });
    if (response.ok && (await response.json()).storage === "sqlite") { ready = true; break; }
  }
  expect(ready).toBe(true);
  expect((await fetch(storage)).status).toBe(401);
  expect(ok(await cli(w, ["host", "status"])).host.pid).toBe(before.pid);
  const page = await fetch(opened.live.url), cookie = page.headers.get("set-cookie")!.split(";")[0]!;
  expect((await (await fetch(new URL("content", opened.live.url))).json()).revision).toBe(1);
  const backup = legacySources(w.home, "state.imported")[0]!;
  const bytes = legacyBytes(backup);
  futureDatabase(w.home, w.cwd);
  current(w, true);
  for (let i = 0; i < 3; i++) {
    expect(ok(await cli(w, ["show", "--flow", opened.flow], undefined, { VSTACK_FLOW_HOST: "off" })).revision).toBe(1);
    expect(ok(await cli(w, ["host", "status"])).host.pid).toBe(before.pid);
    expect(legacyBytes(backup)).toEqual(bytes);
  }
  const submitted = ok(await cli(w, ["submit"], contribution, { VSTACK_FLOW_HOST: "off" }));
  expect(submitted.revision).toBe(2);
  const shown = await (await fetch(new URL("content", opened.live.url))).json();
  const result = shown.stages[0].results[0];
  const comment = await fetch(new URL("comments", opened.live.url), {
    method: "POST", headers: { cookie, origin: new URL(opened.live.url).origin, "content-type": "application/json" },
    body: JSON.stringify({ version: 1, result: result.id, revision: result.revision, edit: null, anchor: { kind: "block" }, text: "Survives a failed candidate." }),
  });
  expect(comment.status).toBe(200);
  expect((await (await fetch(new URL("comments", opened.live.url), { headers: { cookie } })).json()).comments).toHaveLength(1);
}, 20_000);

test("an explicitly isolated pre-SQLite host is never stopped automatically", async () => {
  const w = world(); homes.push(w); previous(w);
  const isolated = { HOME: join(root, "other-home") };
  const opened = ok(await cli(w, ["open", "--title", "Isolated owner", "--skill", "explain", "--home", w.home], undefined, isolated));
  const before = ok(await cli(w, ["host", "status", "--home", w.home], undefined, isolated)).host;
  current(w);
  const shown = await cli(w, ["show", "--flow", opened.flow, "--home", w.home], undefined, isolated);
  expect(shown.code).toBe(0);
  expect(shown.json.live.state).toBe("unavailable");
  expect(ok(await cli(w, ["host", "status", "--home", w.home], undefined, isolated)).host.pid).toBe(before.pid);
}, 20_000);

test("an installed runtime missing its sealed Drizzle bundle refuses before starting a host", async () => {
  const w = world(); homes.push(w); current(w);
  rmSync(join(w.script, "../database-runtime.js"));
  const opened = await cli(w, ["open", "--title", "Incomplete database runtime", "--skill", "explain"]);
  expect(opened.code).toBe(1);
  expect(opened.stderr).toContain("incomplete Flow runtime installation");
  await expect(fetch(`http://127.0.0.1:${w.port}/.host/hello`)).rejects.toThrow();
});

test("validate first refuses legacy import while the sandbox normal-home JSON host keeps serving", async () => {
  const w = world(); homes.push(w); previous(w);
  const opened = ok(await cli(w, ["open", "--title", "Validate before cutover", "--skill", "explain"]));
  const before = ok(await cli(w, ["host", "status"])).host;
  const source = legacySources(w.home)[0]!, bytes = legacyBytes(source);
  current(w);
  const refused = await cli(w, ["validate"], contribution);
  expect(refused.code).toBe(1);
  expect(refused.json.ok).toBe(false);
  expect(refused.stderr).toContain("run any other flow-page command first");
  expect(storageSnapshot(w.home, w.cwd)).toBeUndefined();
  expect(legacyBytes(source)).toEqual(bytes);
  expect((await (await fetch(new URL("content", opened.live.url))).json()).revision).toBe(1);
  expect(ok(await cli(w, ["host", "status"])).host.pid).toBe(before.pid);
  expect(ok(await cli(w, ["submit"], contribution)).revision).toBe(2);
  expect(legacyBackup(source)).toEqual(bytes);
}, 30_000);

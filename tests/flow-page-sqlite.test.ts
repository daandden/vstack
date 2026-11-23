import { afterAll, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ENV, git } from "./support/fixture.ts";
import { futureDatabase, legacyBackup, legacyBinding, legacyBytes, legacyCompanion, legacyExists, legacyFlow, legacyFlowFixture, legacyMetadata, pendingDatabase, prepareLegacyImport, projectStorage, refuseFlowDeletion, storageSnapshot, storedFolder } from "./support/flow-store.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-sqlite-")));
const script = join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts");
let serial = 0;
const hosts: { home: string; cwd: string; port: number }[] = [];
function world() {
  const base = join(root, String(serial++)), cwd = join(base, "project"), home = join(base, "home");
  mkdirSync(cwd, { recursive: true });
  git(cwd, "init", "-q", "-b", "main");
  git(cwd, "commit", "-q", "--allow-empty", "-m", "base");
  const scratch = projectStorage(home, cwd);
  mkdirSync(scratch, { recursive: true });
  return { cwd, home, scratch };
}
async function cli(w: ReturnType<typeof world>, args: string[], input?: unknown, session = "fixture-session", port?: number) {
  const proc = Bun.spawn([process.execPath, script, ...args, "--home", w.home, "--session", session, "--agent", "fixture-agent"], {
    cwd: w.cwd, env: { ...ENV, HOME: join(root, "default-home"), VSTACK_FLOW_HOST: port ? "on" : "off", ...(port ? { VSTACK_FLOW_PORT: String(port) } : {}) }, stdin: input ? new TextEncoder().encode(JSON.stringify(input)) : "ignore", stdout: "pipe", stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  if (process.env.VSTACK_SQLITE_TEST_EVIDENCE) appendFileSync(process.env.VSTACK_SQLITE_TEST_EVIDENCE, `${JSON.stringify({ home: w.home, cwd: w.cwd, args, session, code, stdout, stderr })}\n`);
  return { code, stdout, stderr, json: stdout ? JSON.parse(stdout) : undefined };
}
function ok(run: Awaited<ReturnType<typeof cli>>) { expect(run.stderr).toBe(""); expect(run.code).toBe(0); return run.json; }
afterAll(async () => {
  for (const w of hosts) await cli({ ...w, scratch: "" }, ["host", "stop"], undefined, "fixture-session", w.port);
  rmSync(root, { recursive: true, force: true });
});
const contribution = (title: string) => ({ version: 1, items: [{ kind: "result", shape: "document", title, sections: [{ heading: "Content", blocks: [{ prose: title }] }] }] });
test("validate refuses pending JSON import without creating storage and a later command imports it", async () => {
  const w = world(), fixture = legacyFlowFixture(w.home, w.cwd);
  const original = legacyBytes(fixture.source);
  const refused = await cli(w, ["validate", "--flow", fixture.state.flow.id, "--stage", "stage-1"], contribution("Dry run"));
  expect(refused.code).toBe(1);
  expect(refused.stderr).toContain("run any other flow-page command first");
  expect(refused.json.ok).toBe(false);
  expect(storageSnapshot(w.home, w.cwd)).toBeUndefined();
  expect(legacyBytes(fixture.source)).toEqual(original);
  expect(ok(await cli(w, ["show", "--flow", fixture.state.flow.id])).revision).toBe(1);
});

test("validate refuses a pending schema migration without changing the database", async () => {
  const w = world();
  pendingDatabase(w.home, w.cwd);
  const original = storageSnapshot(w.home, w.cwd);
  const refused = await cli(w, ["validate", "--flow", "absent-flow", "--stage", "stage-1"], contribution("Dry run"));
  expect(refused.code).toBe(1);
  expect(refused.stderr).toContain("run any other flow-page command first");
  expect(storageSnapshot(w.home, w.cwd)).toEqual(original);
  expect(ok(await cli(w, ["open", "--title", "Migrated", "--skill", "explain"])).revision).toBe(1);
});

test("validate waits for an exclusive WAL writer and reads the committed Flow alias", async () => {
  const w = world();
  const opened = ok(await cli(w, ["open", "--title", "Concurrent validation", "--skill", "explain"]));
  const alias = "ticket:fixture/validation";
  const writer = new Database(join(w.scratch, "flow.db"));
  let checked: ReturnType<typeof cli>;
  try {
    // An ordinary WAL write allows readers. Exclusive locking holds the database until close.
    writer.exec("PRAGMA locking_mode = EXCLUSIVE; BEGIN IMMEDIATE");
    writer.query("INSERT INTO aliases (flow, alias, lookup) VALUES (?, ?, ?)").run(opened.flow, alias, alias);
    checked = cli(w, ["validate", "--flow", alias, "--stage", opened.stage], contribution("Dry run"));
    await Bun.sleep(500);
    writer.exec("COMMIT");
  } finally {
    writer.close();
  }
  expect(await checked).toMatchObject({ code: 0, json: { ok: true, diagnostics: [] }, stderr: "" });
  expect(ok(await cli(w, ["show", "--flow", opened.flow])).revision).toBe(opened.revision);
});

test("validate ignores unrelated failed imports and preserves prepared storage", async () => {
  const w = world(), fixture = legacyFlowFixture(w.home, w.cwd);
  legacyFlow(w.home, w.cwd, "second-flow", { ...fixture.state, flow: { ...fixture.state.flow, id: "second-flow" }, aliases: ["folder:second-flow"] });
  const failures = [legacyBinding(w.home, w.cwd, "broken-binding", "{"), legacyFlow(w.home, w.cwd, "broken-state", "{")];
  const imported = await cli(w, ["show", "--flow", fixture.state.flow.id]);
  expect(imported.code).toBe(0);
  expect(imported.stderr.trim().split("\n")).toHaveLength(2);
  for (const source of failures) expect(imported.stderr).toContain(source);
  const second = await cli(w, ["show", "--flow", "second-flow"]);
  expect(second.code).toBe(0);
  const files = () => Object.fromEntries([...new Bun.Glob("**/*").scanSync({ cwd: w.home, dot: true, onlyFiles: true })]
    .filter(path => !/flow\.db-(shm|wal|journal)$/.test(path)).sort().map(path => [path, readFileSync(join(w.home, path)).toString("base64")]));
  const before = files(), database = storageSnapshot(w.home, w.cwd);
  for (const flow of [fixture.state.flow.id, "second-flow"]) {
    expect(ok(await cli(w, ["validate", "--flow", flow, "--stage", "stage-1"], contribution("Dry run")))).toEqual({ ok: true, diagnostics: [] });
    expect(files()).toEqual(before);
    expect(storageSnapshot(w.home, w.cwd)).toEqual(database);
  }
  expect(ok(await cli(w, ["validate"], contribution("Bound dry run")))).toEqual({ ok: true, diagnostics: [] });
  const refused = await cli(w, ["validate", "--flow", "broken-state", "--stage", "stage-1"], contribution("Unimported"));
  expect(refused.code).toBe(1);
  expect(refused.stderr).toContain("validate cannot import legacy JSON");
  expect(files()).toEqual(before);
  expect(storageSnapshot(w.home, w.cwd)).toEqual(database);
  expect((await cli(w, ["show", "--flow", fixture.state.flow.id])).json).toEqual(imported.json);
  expect((await cli(w, ["show", "--flow", "second-flow"])).json).toEqual(second.json);
});
test("validate ignores failed registries and dangling bindings but refuses this session's importable binding", async () => {
  const w = world(), fixture = legacyFlowFixture(w.home, w.cwd);
  ok(await cli(w, ["show", "--flow", fixture.state.flow.id]));
  const identity = legacyMetadata(w.home, w.cwd, "broken-identity", "migration", "{");
  const malformed = legacyBinding(w.home, w.cwd, "incomplete-binding", { session: "fixture-session", agent: "fixture-agent" });
  const dangling = legacyBinding(w.home, w.cwd, "dangling-binding", { flow: "absent-flow", stage: "stage-1", session: "fixture-session", agent: "fixture-agent", bound: "2026-01-01T00:00:00Z" });
  const attempted = await cli(w, ["show", "--flow", fixture.state.flow.id]);
  expect(attempted.code).toBe(0);
  expect(attempted.stderr).toContain(identity);
  expect(legacyExists(malformed)).toBe(true);
  const before = storageSnapshot(w.home, w.cwd);
  expect(ok(await cli(w, ["validate"], contribution("Settled failures")))).toEqual({ ok: true, diagnostics: [] });
  expect(storageSnapshot(w.home, w.cwd)).toEqual(before);
  expect(legacyBytes(identity).toString()).toBe("{");
  expect(legacyExists(dangling)).toBe(true);
  const pending = legacyBinding(w.home, w.cwd, "late-binding", { flow: fixture.state.flow.id, stage: "stage-1", session: "fixture-session", agent: "fixture-agent", bound: "2026-01-01T00:00:00Z" });
  expect(ok(await cli(w, ["validate", "--flow", fixture.state.flow.id, "--stage", "stage-1"], contribution("Explicit target"))).ok).toBe(true);
  const refused = await cli(w, ["validate"], contribution("Pending binding"));
  expect(refused.code).toBe(1);
  expect(refused.stderr).toContain("validate cannot import legacy JSON");
  expect(legacyExists(pending)).toBe(true);
  expect(storageSnapshot(w.home, w.cwd)).toEqual(before);
  expect((await cli(w, ["bound"])).json.binding.flow).toBe(fixture.state.flow.id);
  expect(legacyExists(pending)).toBe(false);
  expect(ok(await cli(w, ["validate"], contribution("Imported binding"))).ok).toBe(true);
  const state = { ...fixture.state, flow: { ...fixture.state.flow, id: "late-flow" }, aliases: ["ticket:org/repo/514", `folder:${fixture.state.flow.id}`] };
  legacyFlow(w.home, w.cwd, "renamed-folder", state);
  legacyBinding(w.home, w.cwd, "late-flow-binding", { flow: "late-flow", stage: "stage-1", session: "fixture-session", agent: "fixture-agent", bound: "2026-01-01T00:00:00Z" });
  for (const args of [[], ["--flow", "late-flow", "--stage", "stage-1"], ["--flow", "folder:renamed-folder", "--stage", "stage-1"], ["--flow", "ticket:ORG/REPO/514", "--stage", "stage-1"]]) {
    const pending = await cli(w, ["validate", ...args], contribution("Late Flow"));
    expect(pending.code).toBe(1);
    expect(pending.stderr).toContain("validate cannot import legacy JSON");
  }
  legacyMetadata(w.home, w.cwd, "renamed-folder", "comments", "{");
  expect((await cli(w, ["bound"])).json.binding.flow).toBe(fixture.state.flow.id);
  expect(ok(await cli(w, ["validate"], contribution("Failed bound target"))).ok).toBe(true);
  expect(ok(await cli(w, ["validate", "--flow", `folder:${fixture.state.flow.id}`, "--stage", "stage-1"], contribution("Unrelated failed alias"))).ok).toBe(true);
  const own = await cli(w, ["validate", "--flow", "late-flow", "--stage", "stage-1"], contribution("Failed own target"));
  expect(own.code).toBe(1);
  expect(own.stderr).toContain("validate cannot import legacy JSON");
  legacyMetadata(w.home, w.cwd, "renamed-folder", "comments", JSON.stringify({ version: 1, comments: [] }));
  expect((await cli(w, ["bound"])).json.binding.flow).toBe("late-flow");
  expect(ok(await cli(w, ["validate"], contribution("Repaired bound target"))).ok).toBe(true);
});



test("a malformed unrelated binding does not block healthy Flow imports", async () => {
  const w = world(), fixture = legacyFlowFixture(w.home, w.cwd);
  legacyFlow(w.home, w.cwd, "second-flow", { ...fixture.state, flow: { ...fixture.state.flow, id: "second-flow" }, aliases: ["folder:second-flow"] });
  const broken = legacyBinding(w.home, w.cwd, "broken-binding", "{");
  expect((await cli(w, ["show", "--flow", fixture.state.flow.id])).json.revision).toBe(1);
  expect((await cli(w, ["show", "--flow", "second-flow"])).json.revision).toBe(1);
  expect((await cli(w, ["bound"])).json.binding.flow).toBe(fixture.state.flow.id);
  expect(legacyBytes(broken).toString()).toBe("{");
});

test("failed legacy imports report their source once on stderr without changing stdout", async () => {
  const w = world(), fixture = legacyFlowFixture(w.home, w.cwd);
  const before = ok(await cli(w, ["show", "--flow", fixture.state.flow.id]));
  const sources = [legacyFlow(w.home, w.cwd, "broken-state", "{")];
  for (const name of ["comments", "learning"]) {
    const id = `broken-${name}`;
    legacyFlow(w.home, w.cwd, id, { ...fixture.state, flow: { ...fixture.state.flow, id }, aliases: [`folder:${id}`] });
    sources.push(legacyMetadata(w.home, w.cwd, id, name, "{"));
  }
  sources.push(legacyBinding(w.home, w.cwd, "broken-binding", "{"), legacyMetadata(w.home, w.cwd, "broken-identity", "migration", "{"));
  for (let attempt = 0; attempt < 2; attempt++) {
    const run = await cli(w, ["show", "--flow", fixture.state.flow.id]);
    expect(run.code).toBe(0);
    expect(run.json).toEqual(before);
    const lines = run.stderr.trim().split("\n");
    expect(lines).toHaveLength(sources.length);
    for (const source of sources) {
      expect(lines.filter(line => line.includes(source))).toHaveLength(1);
      expect(legacyBytes(source).toString()).toBe("{");
    }
    for (const id of ["broken-state", "broken-comments", "broken-learning", "broken-binding", "broken-identity"]) expect(run.stderr).toContain(id);
  }
});


test("JSON imports preserve bindings, aliases, comments, learning, and observation context while a broken Flow retries independently", async () => {
  const w = world(), { folder, source, state, comments, learning } = prepareLegacyImport(w.home, w.cwd), id = state.flow.id;
  const original = legacyBytes(source), broken = legacyFlow(w.home, w.cwd, "broken-flow", "{");
  const imported = await cli(w, ["show", "--flow", id]);
  expect(imported.code).toBe(0);
  expect(imported.stderr).toContain(broken);
  expect(imported.json.reader_comments).toEqual(comments.comments);
  expect((await cli(w, ["bound"])).json.binding).toMatchObject({ flow: id, stage: "stage-1" });
  expect((await cli(w, ["find", "folder:earlier-folder"])).json.flow).toBe(id);
  expect((await cli(w, ["find", "ticket:org/repo/51"])).json.revision).toBe(1);
  expect((await cli(w, ["find", "expired-flow"])).stderr).toContain("no content any more");
  expect(legacyBytes(broken).toString()).toBe("{");
  expect(legacyBackup(source)).toEqual(original);
  for (const name of ["comments", "learning"]) expect(legacyExists(legacyCompanion(source, name))).toBe(false);
  const repaired = { ...state, flow: { ...state.flow, id: "broken-flow", slug: "broken-flow" }, aliases: ["folder:broken-flow"] };
  legacyFlow(w.home, w.cwd, "broken-flow", repaired);
  expect(ok(await cli(w, ["show", "--flow", "broken-flow"])).revision).toBe(1);
  expect(legacyExists(broken)).toBe(false);
  legacyFlow(w.home, w.cwd, "late-flow", { ...repaired, flow: { ...repaired.flow, id: "late-flow" }, aliases: ["folder:late-flow"] });
  expect(ok(await cli(w, ["show", "--flow", "late-flow"])).flow.id).toBe("late-flow");
  const socket = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } }), port = socket.port;
  socket.stop(true); hosts.push({ home: w.home, cwd: w.cwd, port });
  const live = ok(await cli(w, ["show", "--flow", id], undefined, "fixture-session", port)).live.url;
  const page = await fetch(live), cookie = page.headers.get("set-cookie")!.split(";")[0]!;
  expect(await (await fetch(new URL("learning", live), { headers: { cookie } })).json()).toEqual(learning);
  expect(await (await fetch(new URL("comments", live), { headers: { cookie } })).json()).toEqual(comments);
  let observed: any;
  for (const end = Date.now() + 2000; Date.now() < end; await Bun.sleep(25)) {
    observed = await (await fetch(new URL("observations", live))).json();
    if (observed.git.provenance.checkout) break;
  }
  expect(observed.git.provenance.checkout).toBe(w.cwd);
  ok(await cli(w, ["submit", "--flow", id, "--stage", "stage-1"], { version: 1, items: [{ kind: "stage", state: "finished" }] }));
  const closed = ok(await cli(w, ["close", "--flow", id]));
  const cleaned = Bun.spawnSync([process.execPath, join(import.meta.dir, "../plugin/skills/vstack-tmp/scripts/clean.ts"), "--home", w.home, "--now", new Date(Date.parse(closed.closed) + 16 * 86400000).toISOString(), "--delete", folder], { env: ENV, stdout: "pipe", stderr: "pipe" });
  expect(cleaned.exitCode).toBe(0);
  expect(JSON.parse(cleaned.stdout.toString()).deleted).toEqual([folder]);
  expect(existsSync(folder)).toBe(false);
  expect(ok(await cli(w, ["bound"])).binding).toBeNull();
  expect((await cli(w, ["find", "folder:earlier-folder"])).stderr).toContain("no content any more");
  for (const route of ["content", "comments", "learning"]) expect((await fetch(new URL(route, live), { headers: { cookie } })).status).toBe(404);
});

test("simultaneous writers on one project serialize each Flow against its latest revision", async () => {
  const w = world();
  const a = ok(await cli(w, ["open", "--title", "Flow A", "--skill", "explain"], undefined, "a"));
  const b = ok(await cli(w, ["open", "--title", "Flow B", "--skill", "explain"], undefined, "b"));
  for (const result of await Promise.all([cli(w, ["submit"], contribution("A"), "a"), cli(w, ["submit"], contribution("B"), "b")])) expect(ok(result).revision).toBe(2);
  const writes = await Promise.all(["First", "Second"].map(title => cli(w, ["submit", "--flow", a.flow, "--stage", a.stage], contribution(title), title)));
  expect(writes.map(run => ok(run).revision).sort()).toEqual([3, 4]);
  const shown = ok(await cli(w, ["show", "--flow", a.flow]));
  expect(shown.stages[0].results.map((result: any) => result.changed).sort()).toEqual([2, 3, 4]);
  const moved = ok(await cli(w, ["move", "--flow", a.flow, "--to", "new-folder"]));
  expect(moved.flow).toBe(a.flow);
  for (const alias of [`folder:${a.flow}`, "folder:new-folder"]) expect(ok(await cli(w, ["find", alias])).flow).toBe(a.flow);
});

test("concurrent openers migrate an older database and current code tolerates a newer additive schema", async () => {
  const w = world();
  pendingDatabase(w.home, w.cwd);
  const opened = await Promise.all(["A", "B"].map(title => cli(w, ["open", "--title", title, "--skill", "explain"], undefined, title)));
  const ids = opened.map(result => ok(result).flow);
  futureDatabase(w.home, w.cwd);
  for (const id of ids) {
    expect(ok(await cli(w, ["show", "--flow", id])).revision).toBe(1);
    expect(ok(await cli(w, ["submit", "--flow", id, "--stage", "stage-1"], contribution("After future migration"))).revision).toBe(2);
  }
});

test("the sealed database bundle matches the source and installed Drizzle dependency", () => {
  const run = Bun.spawnSync([process.execPath, join(import.meta.dir, "../scripts/build-flow-store.ts"), "--check"], { cwd: join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  expect(run.stderr.toString()).toBe("");
  expect(run.exitCode).toBe(0);
});

test("a refused database deletion keeps the Flow and its captured bytes readable", async () => {
  const w = world(), opened = ok(await cli(w, ["open", "--title", "Atomic cleanup", "--skill", "explain"]));
  writeFileSync(join(w.cwd, "proof.txt"), "captured proof");
  ok(await cli(w, ["submit"], { version: 1, items: [
    { kind: "attachment", ref: "proof", type: "file", path: "proof.txt", origin: "project", caption: "Proof" },
    { kind: "result", shape: "document", title: "Evidence", sections: [{ heading: "Proof", blocks: [{ prose: "Captured proof" }] }], attachments: ["proof"] },
    { kind: "stage", state: "finished" },
  ] }));
  const closed = ok(await cli(w, ["close"]));
  const snapshot = ok(await cli(w, ["show", "--flow", opened.flow]));
  refuseFlowDeletion(w.home, opened.flow);
  const folder = storedFolder(w.home, opened.flow), asset = join(folder, snapshot.attachments[0].file);
  const clean = Bun.spawnSync([process.execPath, join(import.meta.dir, "../plugin/skills/vstack-tmp/scripts/clean.ts"), "--home", w.home, "--now", new Date(Date.parse(closed.closed) + 16 * 86400000).toISOString(), "--delete", folder], { env: ENV, stdout: "pipe", stderr: "pipe" });
  expect(clean.exitCode).toBe(1);
  expect(ok(await cli(w, ["show", "--flow", opened.flow])).revision).toBe(closed.revision);
  expect(readFileSync(asset, "utf8")).toBe("captured proof");
});

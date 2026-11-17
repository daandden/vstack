import { afterAll, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoKey } from "../plugin/skills/vstack-tmp/scripts/scratch.ts";
import { ENV, git } from "./support/fixture.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-sqlite-")));
const script = join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts");
const fixture = join(import.meta.dir, "fixtures/flow-store-previous/flow");
const migrationDir = join(import.meta.dir, "../plugin/skills/flow-page/scripts/migrations");
let serial = 0;
const hosts: { home: string; cwd: string; port: number }[] = [];
function world() {
  const base = join(root, String(serial++)), cwd = join(base, "project"), home = join(base, "home");
  mkdirSync(cwd, { recursive: true });
  git(cwd, "init", "-q", "-b", "main");
  git(cwd, "commit", "-q", "--allow-empty", "-m", "base");
  const scratch = join(home, ".vstack/tmp", repoKey(cwd));
  mkdirSync(scratch, { recursive: true });
  return { cwd, home, scratch };
}
async function cli(w: ReturnType<typeof world>, args: string[], input?: unknown, session = "fixture-session", port?: number) {
  const proc = Bun.spawn([process.execPath, script, ...args, "--home", w.home, "--session", session, "--agent", "fixture-agent"], {
    cwd: w.cwd, env: { ...ENV, HOME: join(root, "default-home"), VSTACK_FLOW_HOST: port ? "on" : "off", ...(port ? { VSTACK_FLOW_PORT: String(port) } : {}) }, stdin: input ? new TextEncoder().encode(JSON.stringify(input)) : "ignore", stdout: "pipe", stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code, stdout, stderr, json: stdout ? JSON.parse(stdout) : undefined };
}
function ok(run: Awaited<ReturnType<typeof cli>>) { expect(run.stderr).toBe(""); expect(run.code).toBe(0); return run.json; }
afterAll(async () => {
  for (const w of hosts) await cli({ ...w, scratch: "" }, ["host", "stop"], undefined, "fixture-session", w.port);
  rmSync(root, { recursive: true, force: true });
});
const contribution = (title: string) => ({ version: 1, items: [{ kind: "result", shape: "document", title, sections: [{ heading: "Content", blocks: [{ prose: title }] }] }] });

test("JSON imports preserve bindings, aliases, comments, learning, and observation context while a broken Flow retries independently", async () => {
  const w = world(), dir = join(w.scratch, "flow"), id = "previous-release-ca075c";
  cpSync(fixture, dir, { recursive: true });
  const folder = join(dir, id), source = join(folder, "data/state.json");
  const state = JSON.parse(readFileSync(source, "utf8"));
  state.aliases.push("folder:earlier-folder", "ticket:Org/Repo/51");
  writeFileSync(source, JSON.stringify(state));
  writeFileSync(join(folder, "observation-project.json"), JSON.stringify({ cwd: w.cwd, stage: "stage-1" }));
  const comments = { version: 1, comments: [{ id: "imported-comment", stage: "stage-1", result: "historical-result", revision: 1, edit: null, anchor: { kind: "block" }, text: "Saved before SQLite", time: "2026-11-16T00:00:00Z" }] };
  const learning = { version: 1, attempts: [{ id: "imported-attempt", result: "historical-result", revision: 1, question: "q1", answer: "a", correct: true, time: "2026-11-16T00:00:00Z" }], completed: [{ result: "historical-result", revision: 1 }] };
  writeFileSync(join(folder, "data/comments.json"), JSON.stringify(comments));
  writeFileSync(join(folder, "data/learning.json"), JSON.stringify(learning));
  const original = readFileSync(source);
  const broken = join(dir, "broken-flow/data/state.json");
  mkdirSync(join(dir, "broken-flow/data"), { recursive: true });
  writeFileSync(broken, "{");
  writeFileSync(join(dir, ".ids/expired-flow"), "expired-flow");
  expect(ok(await cli(w, ["show", "--flow", id])).reader_comments).toEqual(comments.comments);
  expect(ok(await cli(w, ["bound"])).binding).toMatchObject({ flow: id, stage: "stage-1" });
  expect(ok(await cli(w, ["find", "folder:earlier-folder"])).flow).toBe(id);
  expect(ok(await cli(w, ["find", "ticket:org/repo/51"])).revision).toBe(1);
  expect((await cli(w, ["find", "expired-flow"])).stderr).toContain("no content any more");
  expect(readFileSync(broken, "utf8")).toBe("{");
  expect(readFileSync(source.replace("state.json", "state.imported.json"))).toEqual(original);
  for (const name of ["comments", "learning"]) expect(existsSync(join(folder, `data/${name}.json`))).toBe(false);
  const repaired = { ...state, flow: { ...state.flow, id: "broken-flow", slug: "broken-flow" }, aliases: ["folder:broken-flow"] };
  writeFileSync(broken, JSON.stringify(repaired));
  expect(ok(await cli(w, ["show", "--flow", "broken-flow"])).revision).toBe(1);
  expect(existsSync(broken)).toBe(false);
  const late = join(dir, "late-flow/data/state.json");
  mkdirSync(join(dir, "late-flow/data"), { recursive: true });
  writeFileSync(late, JSON.stringify({ ...repaired, flow: { ...repaired.flow, id: "late-flow" }, aliases: ["folder:late-flow"] }));
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
  const w = world(), db = new Database(join(w.scratch, "flow.db"));
  const initial = readFileSync(join(migrationDir, "0000_broad_silver_surfer.sql"), "utf8");
  const journal = JSON.parse(readFileSync(join(migrationDir, "meta/_journal.json"), "utf8"));
  db.exec(initial);
  db.exec("CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)");
  db.query("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)").run(createHash("sha256").update(initial).digest("hex"), journal.entries[0].when);
  db.close();
  const opened = await Promise.all(["A", "B"].map(title => cli(w, ["open", "--title", title, "--skill", "explain"], undefined, title)));
  const ids = opened.map(result => ok(result).flow);
  const future = new Database(join(w.scratch, "flow.db"));
  future.exec("ALTER TABLE flows ADD COLUMN future_nullable TEXT; ALTER TABLE flows ADD COLUMN future_default TEXT NOT NULL DEFAULT ''; CREATE TABLE future_data (flow TEXT, value TEXT); CREATE INDEX future_index ON future_data(flow)");
  future.close();
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
  const db = new Database(join(w.scratch, "flow.db"));
  db.exec("CREATE TRIGGER refuse_flow_delete BEFORE DELETE ON flows BEGIN SELECT RAISE(ABORT, 'fixture deletion refusal'); END");
  const folder = join(w.scratch, "flow", opened.flow), asset = join(folder, snapshot.attachments[0].file);
  const clean = Bun.spawnSync([process.execPath, join(import.meta.dir, "../plugin/skills/vstack-tmp/scripts/clean.ts"), "--home", w.home, "--now", new Date(Date.parse(closed.closed) + 16 * 86400000).toISOString(), "--delete", folder], { env: ENV, stdout: "pipe", stderr: "pipe" });
  expect(clean.exitCode).toBe(1);
  expect(ok(await cli(w, ["show", "--flow", opened.flow])).revision).toBe(closed.revision);
  expect(readFileSync(asset, "utf8")).toBe("captured proof");
  db.close();
});

import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ENV } from "./support/fixture.ts";
import { editStoredComments } from "./support/flow-store.ts";

const script = join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-comments-")));
const worlds: { home: string; cwd: string; port: number }[] = [];
function world() {
  const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = listener.port;
  listener.stop(true);
  const w = { home: join(root, `${worlds.length}/home`), cwd: join(root, `${worlds.length}/work`), port };
  mkdirSync(w.home, { recursive: true });
  mkdirSync(w.cwd, { recursive: true });
  worlds.push(w);
  return w;
}
function cli(w: ReturnType<typeof world>, args: string[], items?: object[]) {
  const p = Bun.spawnSync([process.execPath, script, ...args, "--home", w.home, "--session", "01a1c2c0-b8bd-7047-ac1f-33e7ca3c40d6", "--agent", "review-fix-428"], {
    cwd: w.cwd, env: { ...ENV, HOME: join(root, "default-home"), VSTACK_FLOW_PORT: String(w.port) },
    stdin: items ? new TextEncoder().encode(JSON.stringify({ version: 1, items })) : "ignore", stdout: "pipe", stderr: "pipe",
  });
  expect(p.stderr.toString()).toBe("");
  expect(p.exitCode).toBe(0);
  return JSON.parse(p.stdout.toString());
}
afterAll(() => { for (const w of worlds) cli(w, ["host", "stop"]); rmSync(root, { recursive: true, force: true }); });
const table = { kind: "result", ref: "proof", shape: "table", title: "Restart evidence", columns: ["Check"], rows: [{ ref: "restart", cells: ["Host restart"] }] };
const authored = (w: ReturnType<typeof world>, flow: string) => {
  const { reader_comments: _, ...content } = cli(w, ["show", "--flow", flow]);
  return content;
};

test("Reader comments authenticate, persist independently, and show their captured Result revision", async () => {
  const w = world();
  cli(w, ["open", "--title", "Comments proof", "--skill", "implement"]);
  const sent = cli(w, ["submit"], [table]);
  const url = new URL(sent.live.url);
  const endpoint = new URL("comments", url);
  const page = await fetch(url);
  expect(page.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Strict");
  const cookie = page.headers.get("set-cookie")!.split(";")[0];
  const before = authored(w, sent.flow);
  const input = { version: 1, result: sent.refs.proof, revision: 1, edit: null, anchor: { kind: "entry", entry: sent.refs["proof/restart"].split("/")[1] }, text: "Keep the restart proof." };
  const send = (body: unknown = input, headers: Record<string, string> = {}) => fetch(endpoint, { method: "POST", headers: { cookie, origin: url.origin, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  expect((await send(input, { cookie: "" })).status).toBe(401);
  expect((await send(input, { origin: "https://evil.example" })).status).toBe(403);
  expect((await send(input, { origin: "" })).status).toBe(403);
  expect((await send(input, { "content-type": "text/plain" })).status).toBe(415);
  const accepted = await send();
  expect(accepted.status).toBe(200);
  const saved = (await accepted.json() as any).comments[0];
  expect(saved).toMatchObject({ stage: "stage-1", result: sent.refs.proof, revision: 1, anchor: input.anchor, text: input.text });
  expect(saved.time).toMatch(/^\d{4}-\d\d-\d\dT/);
  expect(saved.id).toBeString();
  expect((await send({ ...input, anchor: { kind: "entry", entry: "missing" } })).status).toBe(400);
  expect((await send({ ...input, revision: 99 })).status).toBe(400);
  expect((await send({ ...input, text: " " })).status).toBe(400);
  expect((await send({ ...input, text: "x".repeat(4097) })).status).toBe(400);
  expect((await fetch(endpoint)).status).toBe(401);
  const other = cli(w, ["open", "--title", "Other Flow", "--skill", "implement"]);
  expect((await fetch(new URL("comments", other.live.url), { method: "POST", headers: { cookie, origin: url.origin, "content-type": "application/json" }, body: JSON.stringify(input) })).status).toBe(401);
  expect(authored(w, sent.flow)).toEqual(before);
  expect(cli(w, ["show", "--flow", sent.flow]).reader_comments).toEqual([saved]);
  const revised = cli(w, ["submit", "--flow", sent.flow, "--stage", sent.stage], [{ ...table, ref: "new-proof", revises: sent.refs.proof, title: "New evidence" }]);
  expect(revised.revision).toBeGreaterThan(sent.revision);
  expect((await (await fetch(endpoint, { headers: { cookie } })).json() as any).comments).toEqual([saved]);
  cli(w, ["host", "stop"]);
  expect(cli(w, ["show", "--flow", sent.flow]).reader_comments).toEqual([saved]);
  expect((await (await fetch(endpoint, { headers: { cookie } })).json() as any).comments).toEqual([saved]);
  const freshPage = await fetch(url);
  const freshCookie = freshPage.headers.get("set-cookie")!.split(";")[0];
  expect((await (await fetch(endpoint, { headers: { cookie: freshCookie } })).json() as any).comments).toEqual([saved]);
});

test("text comments retain their quote and revision through edits, Result revisions, and removal", async () => {
  const w = world();
  cli(w, ["open", "--title", "Text comments", "--skill", "implement"]);
  const sent = cli(w, ["submit"], [table]);
  const url = new URL(sent.live.url);
  const endpoint = new URL("comments", url);
  const cookie = (await fetch(url)).headers.get("set-cookie")!.split(";")[0];
  const post = (body: object) => fetch(endpoint, { method: "POST", headers: { cookie, origin: url.origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  const input = { version: 1, result: sent.refs.proof, revision: 1, edit: null, anchor: { kind: "text", quote: "Host restart" }, text: "Explain this passage." };
  const created = await post(input);
  expect(created.status).toBe(200);
  const original = (await created.json() as any).comments[0];
  expect(original.anchor).toEqual(input.anchor);
  const revised = cli(w, ["submit"], [{ ...table, ref: "replacement", revises: sent.refs.proof, rows: [{ cells: ["Different evidence"] }] }]);
  expect(revised.revision).toBeGreaterThan(sent.revision);
  const before = authored(w, sent.flow);
  expect((await post({ ...input, anchor: { kind: "text", quote: " " } })).status).toBe(400);
  const editedResponse = await post({ version: 1, action: "edit", id: original.id, text: "Keep the original quote." });
  expect(editedResponse.status).toBe(200);
  const edited = (await editedResponse.json() as any).comments[0];
  expect(edited).toEqual({ ...original, text: "Keep the original quote." });
  expect(cli(w, ["show"]).reader_comments).toEqual([edited]);
  cli(w, ["host", "stop"]);
  cli(w, ["show"]);
  const freshCookie = (await fetch(url)).headers.get("set-cookie")!.split(";")[0];
  expect((await (await fetch(endpoint, { headers: { cookie: freshCookie } })).json() as any).comments).toEqual([edited]);
  const removed = await fetch(endpoint, { method: "POST", headers: { cookie: freshCookie, origin: url.origin, "content-type": "application/json" }, body: JSON.stringify({ version: 1, action: "remove", id: original.id }) });
  expect(removed.status).toBe(200);
  expect((await removed.json() as any).comments).toEqual([]);
  expect((await fetch(endpoint, { headers: { cookie: freshCookie } }).then((r) => r.json()) as any).comments).toEqual([]);
  expect(authored(w, sent.flow)).toEqual(before);
});

test("comments identify each focused set and add capture, including delayed saves and legacy data", async () => {
  const w = world();
  cli(w, ["open", "--title", "Focused comment versions", "--skill", "implement"]);
  const sent = cli(w, ["submit"], [table]);
  const url = new URL(sent.live.url);
  const endpoint = new URL("comments", url);
  const cookie = (await fetch(url)).headers.get("set-cookie")!.split(";")[0];
  const post = (body: object) => fetch(endpoint, { method: "POST", headers: { cookie, origin: url.origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  const input = { version: 1, result: sent.refs.proof, revision: 1, edit: null, anchor: { kind: "entry", entry: "e1" }, text: "Original entry." };
  expect((await post(input)).status).toBe(200);
  await Bun.sleep(1100);
  const edited = cli(w, ["submit"], [{ kind: "revise", result: sent.refs["proof/restart"], base: sent.revision, set: { cells: ["Changed entry"] } }]);
  expect((await post({ ...input, text: "A delayed original comment." })).status).toBe(200);
  expect((await post({ ...input, edit: edited.revision, text: "Changed entry comment." })).status).toBe(200);
  expect((await post({ ...input, edit: 999 })).status).toBe(400);
  const added = cli(w, ["submit"], [
    { kind: "revise", result: sent.refs.proof, base: edited.revision, set: { title: "Expanded evidence" } },
    { kind: "revise", result: sent.refs.proof, add: [{ cells: ["Added entry"] }] },
  ]);
  expect((await post({ ...input, edit: added.revision, anchor: { kind: "entry", entry: "e2" }, text: "Added entry comment." })).status).toBe(200);
  expect((await post({ ...input, edit: edited.revision, anchor: { kind: "entry", entry: "e2" } })).status).toBe(400);
  const shown = cli(w, ["show"]);
  expect(shown.reader_comments.map((c: any) => c.edit)).toEqual([null, null, edited.revision, added.revision]);
  expect(shown.stages[0].results[0]).toMatchObject({ revision: 1, edit: added.revision });
  expect(shown.stages[0].results[0].history.map((r: any) => r.edit ?? null)).toEqual([null, edited.revision]);
  const before = authored(w, sent.flow);
  editStoredComments(w.home, sent.flow, (legacy, state) => {
    const original = legacy.comments[0];
    delete original.edit;
    original.time = new Date((Date.parse(state.history[0].captured!) + Date.parse(state.history[1].captured!)) / 2).toISOString();
    legacy.comments.push({ ...original, id: "late-legacy-save", time: new Date().toISOString() });
    legacy.comments.push({ ...original, id: "unknown-capture", time: "not recorded" });
  });
  const recovered = cli(w, ["show"]).reader_comments;
  expect(recovered[0].edit).toBe(null);
  expect(recovered.at(-2).edit).toBeUndefined();
  expect(recovered.at(-2).version_unknown).toBe(true);
  expect(recovered.at(-1).edit).toBeUndefined();
  expect(recovered.at(-1).version_unknown).toBe(true);
  expect(authored(w, sent.flow)).toEqual(before);
});

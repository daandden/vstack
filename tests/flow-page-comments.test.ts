import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ENV } from "./support/fixture.ts";
import { statePathOf } from "./support/flow-store.ts";

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
  const p = Bun.spawnSync([process.execPath, script, ...args, "--home", w.home, "--session", "01a1c256-253b-7669-8fec-323a138f5d94", "--agent", "impl-440"], {
    cwd: w.cwd, env: { ...ENV, HOME: w.home, VSTACK_FLOW_PORT: String(w.port) },
    stdin: items ? new TextEncoder().encode(JSON.stringify({ version: 1, items })) : "ignore", stdout: "pipe", stderr: "pipe",
  });
  expect(p.stderr.toString()).toBe("");
  expect(p.exitCode).toBe(0);
  return JSON.parse(p.stdout.toString());
}
afterAll(() => { for (const w of worlds) cli(w, ["host", "stop"]); rmSync(root, { recursive: true, force: true }); });
const table = { kind: "result", ref: "proof", shape: "table", title: "Restart evidence", columns: ["Check"], rows: [{ ref: "restart", cells: ["Host restart"] }] };

test("Reader comments authenticate, persist independently, and show their captured Result revision", async () => {
  const w = world();
  cli(w, ["open", "--title", "Comments proof", "--skill", "implement"]);
  const sent = cli(w, ["submit"], [table]);
  const url = new URL(sent.live.url);
  const endpoint = new URL("comments", url);
  const page = await fetch(url);
  expect(page.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Strict");
  const cookie = page.headers.get("set-cookie")!.split(";")[0];
  const statePath = statePathOf(w.home, sent.flow);
  const before = readFileSync(statePath, "utf8");
  const input = { version: 1, result: sent.refs.proof, revision: 1, anchor: { kind: "entry", entry: sent.refs["proof/restart"].split("/")[1] }, text: "Keep the restart proof." };
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
  expect(readFileSync(statePath, "utf8")).toBe(before);
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

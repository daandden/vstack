import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ENV } from "./support/fixture.ts";
import { statePathOf } from "./support/flow-store.ts";

const script = join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-quiz-")));
const worlds: { home: string; cwd: string; port: number }[] = [];
afterAll(() => {
  for (const w of worlds) run(w, ["host", "stop"]);
  rmSync(root, { recursive: true, force: true });
});
function world() {
  const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = listener.port;
  listener.stop(true);
  const w = { home: join(root, `${worlds.length}/home`), cwd: join(root, `${worlds.length}/work`), port };
  mkdirSync(w.cwd, { recursive: true });
  mkdirSync(w.home, { recursive: true });
  worlds.push(w);
  return w;
}
function run(w: ReturnType<typeof world>, args: string[], input?: unknown) {
  const p = Bun.spawnSync(["bun", script, ...args, "--home", w.home], {
    cwd: w.cwd, env: { ...ENV, HOME: join(root, "default-home"), PI_SESSION_ID: "quiz", VSTACK_FLOW_PORT: String(w.port) },
    stdin: input === undefined ? "ignore" : new TextEncoder().encode(JSON.stringify(input)), stdout: "pipe", stderr: "pipe",
  });
  return { code: p.exitCode, stdout: p.stdout.toString(), stderr: p.stderr.toString() };
}
const ok = (r: ReturnType<typeof run>) => { expect(r.stderr).toBe(""); expect(r.code).toBe(0); return JSON.parse(r.stdout); };
const quiz = () => ({ kind: "result", ref: "lesson", shape: "quiz", title: "Safe learning", questions: [
  { ref: "authority", prompt: "What authorizes work?", choices: [{ ref: "ask", label: "A real ask" }, { ref: "quiz", label: "A quiz click" }], answer: { choice: "ask" }, explanation: "Learning does not grant workflow authority." },
  { ref: "sum", prompt: "Two plus three?", answer: { number: 5, tolerance: 0 }, explanation: "Five is the sum." },
  { ref: "word", prompt: "Type Flow", answer: { text: ["Flow"], case_sensitive: false }, explanation: "Names identify the learning document." },
] });
const submit = (w: ReturnType<typeof world>, ...items: object[]) => run(w, ["submit"], { version: 1, items });

test("a producer publishes a retained Quiz and invalid answer rules leave its domain record unchanged", () => {
  const w = world();
  ok(run(w, ["open", "--title", "Quiz lesson", "--skill", "teach"]));
  const sent = ok(submit(w, quiz()));
  const statePath = statePathOf(w.home, sent.flow);
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  expect(state.results[0].quiz.questions.map((q: any) => q.ref)).toEqual(["authority", "sum", "word"]);
  const before = readFileSync(statePath, "utf8");
  const bad = quiz();
  bad.questions[0].answer = { choice: "missing" };
  expect(submit(w, bad).code).toBe(1);
  expect(readFileSync(statePath, "utf8")).toBe(before);
  expect(state.answers).toEqual([]);
});

test("learning attempts authenticate, survive restarts, and replay offline batches exactly once without changing authored work", async () => {
  const w = world();
  ok(run(w, ["open", "--title", "Persistent lesson", "--skill", "teach"]));
  const sent = ok(submit(w, quiz()));
  const url = new URL(sent.live.url);
  const endpoint = new URL("learning", url);
  const page = await fetch(url);
  const cookie = page.headers.get("set-cookie")?.split(";")[0] ?? "";
  const statePath = statePathOf(w.home, sent.flow);
  const before = readFileSync(statePath, "utf8");
  const attempt = (id: string, question: string, answer: string) => ({ id, result: sent.refs.lesson, revision: 1, question, answer });
  const batch = { version: 1, attempts: [attempt("attempt-wrong-001", "authority", "quiz"), attempt("attempt-right-002", "authority", "ask"), attempt("attempt-sum-003", "sum", "5"), attempt("attempt-word-004", "word", "FLOW")] };
  const send = (body: unknown, c = cookie, origin = url.origin) => fetch(endpoint, { method: "POST", headers: { cookie: c, origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  expect((await send(batch, "")).status).toBe(401);
  expect((await send(batch, cookie, "http://evil.example")).status).toBe(403);
  const accepted = await send(batch);
  expect(accepted.status).toBe(200);
  const progress = await accepted.json() as any;
  expect(progress.attempts.map((a: any) => a.correct)).toEqual([false, true, true, true]);
  expect(progress.completed).toEqual([{ result: sent.refs.lesson, revision: 1 }]);
  expect((await (await send(batch)).json() as any).attempts).toHaveLength(4);
  const conflict = { version: 1, attempts: [attempt("attempt-right-002", "authority", "quiz")] };
  expect((await send(conflict)).status).toBe(409);
  const b = ok(run(w, ["open", "--title", "Different lesson", "--skill", "teach"]));
  expect((await fetch(new URL("learning", b.live.url), { method: "POST", headers: { cookie, origin: url.origin, "content-type": "application/json" }, body: JSON.stringify(batch) })).status).toBe(401);
  ok(run(w, ["host", "stop"]));
  ok(run(w, ["show", "--flow", sent.flow]));
  const restored = await fetch(endpoint, { headers: { cookie } });
  expect(restored.status).toBe(200);
  expect((await restored.json() as any).attempts).toHaveLength(4);
  const offline = { version: 1, attempts: [attempt("offline-attempt-005", "sum", "4")] };
  expect((await (await send(offline)).json() as any).attempts).toHaveLength(5);
  expect((await (await send(offline)).json() as any).attempts).toHaveLength(5);
  expect(readFileSync(statePath, "utf8")).toBe(before);
});

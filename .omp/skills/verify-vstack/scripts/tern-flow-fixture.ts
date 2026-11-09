#!/usr/bin/env bun
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { homedir } from "node:os";

const [command, runArg, ...args] = process.argv.slice(2);
function requireThat(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(`tern-flow-fixture: ${message}`);
}
requireThat(runArg && ["seed", "other", "picker", "target", "stop"].includes(command), "usage: seed RUN A.jsonl B.jsonl | other RUN C.jsonl | picker RUN B.jsonl open|clear TOKEN | target RUN SESSION.jsonl | stop RUN");
const run = resolve(runArg);
requireThat(realpathSync(run) === run, "RUN must be a physical directory, not a symlink");
const data = join(run, "data");
const home = join(data, "home");
requireThat(process.env.TERN_VERIFY_HOME === home && home !== homedir(), "TERN_VERIFY_HOME must be this run's disposable RUN/data/home, never the caller's HOME");
function noLinks(path: string) {
  const st = lstatSync(path);
  requireThat(!st.isSymbolicLink(), `symlink refused: ${path}`);
  if (st.isDirectory()) for (const name of readdirSync(path)) noLinks(join(path, name));
}
requireThat(realpathSync(data) === data && realpathSync(home) === home, "data and home must be physical directories");
noLinks(home);
const marker = JSON.parse(readFileSync(join(data, "tern-fixture.json"), "utf8"));
requireThat(marker.run === run, "missing isolated tern-verify start marker");
process.kill(Number(readFileSync(join(data, "window.pid"), "utf8").trim()), 0);
requireThat(lstatSync(join(data, "ctl.sock")).isSocket(), "the owned Tern control socket is missing");
const repo = resolve(process.env.VSTACK_CHECKOUT || join(import.meta.dir, "../../../.."));
const source = join(repo, "plugin/skills/flow-page/scripts");
const store = await import(join(source, "store.ts"));
const model = await import(join(source, "model.ts"));
const live = await import(join(source, "live.ts"));
const fixturePath = join(data, "tern-flow-fixture.json");
function session(file: string) {
  const path = resolve(file);
  requireThat(path.startsWith(data + sep) && realpathSync(path) === path, "session file must be physically inside RUN/data");
  const rows = readFileSync(path, "utf8").trim().split("\n").map(line => JSON.parse(line));
  const header = rows.find(row => row.type === "session");
  requireThat(header && typeof header.id === "string" && typeof header.cwd === "string", "native session header is missing");
  requireThat(!rows.some(row => row.type === "message"), "fixture refuses a session with a model conversation");
  requireThat(realpathSync(header.cwd).startsWith(data + sep) || realpathSync(header.cwd) === data, "native session cwd must be inside RUN/data");
  return { file: path, id: header.id as string, cwd: header.cwd as string };
}
const time = model.nowIso();
let output: unknown;
if (command === "seed" || command === "other") {
  requireThat(args.length === (command === "seed" ? 2 : 1), "wrong session-file count");
  requireThat(command !== "seed" || !existsSync(fixturePath), "fixture already seeded; use a fresh run");
  const sessions = args.map(session);
  requireThat(new Set(sessions.map(s => s.id)).size === sessions.length, "native sessions must be distinct");
  const dir = store.flowsDir(home, sessions[0].cwd);
  requireThat(sessions.every(s => store.flowsDir(home, s.cwd) === dir), "sessions must share a project key");
  requireThat(sessions.every(s => !store.readBinding(dir, s.id, "main")), "fixture refuses to overwrite any binding");
  const slug = command === "seed" ? "verify-native-following" : "verify-other-flow";
  const { id, folder } = store.createFlowFolder(dir, slug);
  const state = model.newFlow(id, slug, "Disposable Tern following fixture", time);
  const records = sessions.map((s, index) => {
    const stage = model.openStage(state, "grill-with-docs", undefined, time);
    const receipt = model.contribute(state, stage.id, { version: 1, items: [
      { kind: "round", questions: [{ ref: "choose", title: `Fixture session ${index + 1}?`, description: "Test data only. No user decision or model prompt.", needs: [{ need: "Read this disposable question.", kind: "prose" }], options: ["First", "Second"].map(label => ({ label, does: `Select ${label}.`, gains: ["Exercises following"], costs: ["No real decision"] })) }] },
      { kind: "result", ref: "lesson", shape: "quiz", title: "Typing fixture", questions: [{ ref: "word", prompt: "Type Flow", answer: { text: ["Flow"] }, explanation: "A learning answer does not settle the picker." }] },
    ] }, time, { capture() { throw new Error("fixture attachments are unsupported"); }, canonical() { throw new Error("fixture canonical files are unsupported"); } });
    return { ...s, flow: id, stage: stage.id, question: receipt.refs.choose, result: receipt.refs.lesson };
  });
  store.writeAtomic(store.statePath(folder), JSON.stringify(state) + "\n");
  for (const s of records) store.writeBinding(dir, { flow: id, stage: s.stage, session: s.id, agent: "main", bound: time });
  const connection = await live.connect(home);
  requireThat(connection.state === "serving", `isolated host unavailable: ${JSON.stringify(connection)}`);
  try {
    output = { fixture: true, home, key: basename(join(dir, "..")), flow: id, url: live.flowUrl(connection.port, connection.secret.read, basename(join(dir, "..")), id), sessions: records };
    writeFileSync(command === "seed" ? fixturePath : join(data, "tern-flow-other.json"), JSON.stringify(output, null, 2) + "\n");
  } finally { connection.release(); }
} else if (command === "stop") {
  requireThat(args.length === 0, "stop takes no arguments");
  output = await live.hostCommand(home, "stop");
} else {
  const s = session(args[0]);
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const record = fixture.sessions.find((entry: { id: string }) => entry.id === s.id);
  requireThat(record, "session is not part of this run's seeded fixture");
  if (command === "target") {
    requireThat(args.length === 1, "target needs one session file");
    const child = Bun.spawn([process.execPath, join(source, "flow-page.ts"), "target", "--home", home, "--session", s.id], { cwd: s.cwd, stdout: "pipe", stderr: "pipe" });
    const text = await new Response(child.stdout).text();
    requireThat(await child.exited === 0, "read-only target query failed");
    output = JSON.parse(text);
  } else {
    const [, action, token] = args;
    requireThat(args.length === 3 && ["open", "clear"].includes(action) && token, "picker needs SESSION.jsonl open|clear TOKEN");
    const connection = await live.connect(home);
    requireThat(connection.state === "serving", "isolated host unavailable");
    try {
      const response = await fetch(`${live.originOf(connection.port)}/.host/picker`, { method: action === "open" ? "PUT" : "DELETE", headers: { authorization: `Bearer ${connection.secret.control}`, "content-type": "application/json" }, body: JSON.stringify({ key: fixture.key, flow: record.flow, stage: record.stage, session: s.id, picker: token, questions: [record.question], expires: Date.now() + 30_000 }), signal: AbortSignal.timeout(2000) });
      requireThat(response.ok, `picker fixture HTTP ${response.status}`);
      output = { fixture: true, action, picker: token, session: s.id, question: record.question, response: await response.json() };
    } finally { connection.release(); }
  }
}
console.log(JSON.stringify(output));

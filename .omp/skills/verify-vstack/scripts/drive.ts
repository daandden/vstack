// Drives one omp RPC session with a vstack plugin dir linked into a throwaway omp home, against a scripted stub model.
//
//   bun drive.ts --plugin <plugin dir> --run <run dir> --name <drive> [--no-ui] [--session] [--replies <replies.json>] [--ui-replies <ui.json>] <command-json>...
//
// The home is <run>/data/home. The project cwd is <outside>/proj, where <outside> is a dir that mkdtemp makes once per
// run as <os temp dir>/vstack-verify-XXXXXX and <run>/data/outside links to. load.sh reuses the same link. omp looks for
// project skills in every parent of the cwd, so a cwd under the real home loads
// the user's ~/.claude/skills and ~/.agents/skills. omp runs with an env of only PATH, HOME, and TERM, so it never reads
// the real ~/.omp. The stub model is an OpenAI chat-completions server on a free 127.0.0.1 port.
// Each model request it gets is one line of <run>/<drive>/model-requests.jsonl. It answers with the next item of
// --replies, a JSON array of {"text": "..."} or {"tool": "<name>", "args": {...}}, and with {"text": "stub: no reply left"}
// after the last one.
//
// --ui-replies answers the dialogs that omp sends as extension_ui_request frames (select, confirm, input, editor), in
// order. It is a JSON array of {"value": "<exact answer>"}, {"pick": "<text>"} (the first select option that contains
// the text), {"confirmed": true|false}, or {"cancelled": true}. With no UI reply left, a dialog gets {"cancelled": true}.
// Each answer sent goes to <run>/<drive>/ui-responses.jsonl with the dialog it answered.
//
// Each <command-json> is one RPC command such as '{"type":"get_state"}'. A missing id becomes c1, c2, and so on. The
// script sends one command at a time and waits for its response. A prompt that starts agent work also waits for its
// prompt_result. Every stdout frame goes to <run>/<drive>/rpc.jsonl and omp's stderr to <run>/<drive>/rpc.err.
// It prints a summary JSON (also <run>/<drive>/summary.json) and exits 0 when every command succeeded, 1 when one
// failed or timed out, and 2 on a usage error. <run>/<drive>/ must not exist yet: a drive name that an earlier drive of
// the run used is a usage error, and the script writes nothing. The omp PID goes to <run>/data/pids before the first command, and the
// script stops that process and the stub server before it exits.

import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const STEP_TIMEOUT_MS = 90_000;

function usage(message: string): never {
  process.stderr.write(`drive.ts: ${message}\nusage: bun drive.ts --plugin <dir> --run <dir> --name <drive> [--no-ui] [--session] [--replies <file>] [--ui-replies <file>] <command-json>...\n`);
  process.exit(2);
}

let parsed;
try {
  parsed = parseArgs({
    args: Bun.argv.slice(2),
    options: { plugin: { type: "string" }, run: { type: "string" }, name: { type: "string" }, replies: { type: "string" }, "ui-replies": { type: "string" }, "no-ui": { type: "boolean" }, session: { type: "boolean" } },
    allowPositionals: true,
  });
} catch (e) {
  usage((e as Error).message);
}
const { values, positionals } = parsed;
if (!values.plugin || !values.run || !values.name) usage("--plugin, --run, and --name are required");
if (!/^[a-z0-9][a-z0-9-]*$/.test(values.name)) usage(`--name must be lowercase letters, digits, and hyphens, got ${JSON.stringify(values.name)}`);
if (positionals.length === 0) usage("give at least one command");
const plugin = resolve(values.plugin);
if (!existsSync(join(plugin, "package.json"))) usage(`${plugin} has no package.json`);
const commands = positionals.map((text, i) => {
  try {
    const cmd = JSON.parse(text);
    if (typeof cmd?.type !== "string") throw new Error("no type");
    return { id: `c${i + 1}`, ...cmd } as { id: string; type: string; [k: string]: unknown };
  } catch (e) {
    usage(`command ${i + 1} is not an RPC command object: ${(e as Error).message}`);
  }
});
type Reply = { text: string } | { tool: string; args?: unknown };
const replies: Reply[] = values.replies ? JSON.parse(readFileSync(values.replies, "utf8")) : [];
if (!Array.isArray(replies)) usage("--replies must hold a JSON array");
type UiReply = { value: string } | { pick: string } | { confirmed: boolean } | { cancelled: true };
const uiReplies: UiReply[] = values["ui-replies"] ? JSON.parse(readFileSync(values["ui-replies"], "utf8")) : [];
if (!Array.isArray(uiReplies)) usage("--ui-replies must hold a JSON array");

const run = resolve(values.run);
const home = join(run, "data", "home");
if (values.name === "data") usage("--name data is the run's throwaway data dir, so pick another name");
const out = join(run, values.name);
// Each drive owns a new evidence dir. A reused dir mixes an earlier drive's model requests with this drive's frames.
mkdirSync(run, { recursive: true });
try {
  mkdirSync(out);
} catch (e) {
  if ((e as NodeJS.ErrnoException).code === "EEXIST") usage(`${out} exists from an earlier drive; give a new --name or use a new run dir`);
  throw e;
}
mkdirSync(join(home, ".omp", "agent"), { recursive: true });

/** The run's own temp dir: the target of <run>/data/outside, made with mkdtemp by the first drive or load.sh of the run. */
function outsideDir(): string {
  const link = join(run, "data", "outside");
  try { return readlinkSync(link); } catch { /* no link yet */ }
  const made = mkdtempSync(join(realpathSync(tmpdir()), "vstack-verify-"));
  try {
    symlinkSync(made, link);
    return made;
  } catch {
    // Another drive of this run linked its dir first. Use that one.
    rmdirSync(made);
    return readlinkSync(link);
  }
}
const proj = join(outsideDir(), "proj");
mkdirSync(proj, { recursive: true });
const env = { PATH: process.env.PATH ?? "", HOME: home, TERM: "dumb" };

// Link the plugin into the throwaway home. omp plugin link replaces an earlier link of the same plugin.
const link = Bun.spawnSync(["omp", "plugin", "link", plugin], { cwd: proj, env, stdout: "pipe", stderr: "pipe" });
writeFileSync(join(out, "link.txt"), link.stdout.toString() + link.stderr.toString());
if (link.exitCode !== 0) {
  process.stderr.write(`drive.ts: omp plugin link failed (exit ${link.exitCode}), see ${join(out, "link.txt")}\n`);
  process.exit(1);
}

// The stub model: OpenAI chat completions, streamed or not.
const requestLog = join(out, "model-requests.jsonl");
let next = 0;
const chunk = (delta: object, finish: string | null) =>
  `data: ${JSON.stringify({ id: "stub", object: "chat.completion.chunk", created: 0, model: "stub-model", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(req) {
    const url = new URL(req.url);
    const text = req.method === "POST" ? await req.text() : "";
    let body: any = text;
    try { body = text ? JSON.parse(text) : null; } catch { /* keep the raw text */ }
    appendFileSync(requestLog, JSON.stringify({ method: req.method, path: url.pathname, body }) + "\n");
    if (req.method !== "POST" || !url.pathname.endsWith("/chat/completions")) return new Response("not found", { status: 404 });
    const reply: Reply = replies[next++] ?? { text: "stub: no reply left" };
    const message = "tool" in reply
      ? { role: "assistant", content: null, tool_calls: [{ index: 0, id: `call_${next}`, type: "function", function: { name: reply.tool, arguments: JSON.stringify(reply.args ?? {}) } }] }
      : { role: "assistant", content: reply.text };
    const finish = "tool" in reply ? "tool_calls" : "stop";
    const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };
    if (!body?.stream) {
      return Response.json({ id: "stub", object: "chat.completion", created: 0, model: "stub-model", choices: [{ index: 0, message, finish_reason: finish }], usage });
    }
    const sse = chunk(message, null) + chunk({}, finish)
      + `data: ${JSON.stringify({ id: "stub", object: "chat.completion.chunk", created: 0, model: "stub-model", choices: [], usage })}\n\n`
      + "data: [DONE]\n\n";
    return new Response(sse, { headers: { "Content-Type": "text/event-stream" } });
  },
});
const stubPort = server.port;

writeFileSync(join(home, ".omp", "agent", "models.yml"), `providers:
  stub:
    baseUrl: http://127.0.0.1:${server.port}/v1
    apiKey: stub-dummy-key
    api: openai-completions
    models:
      - id: stub-model
        name: Stub Model
        input: [text]
        contextWindow: 200000
        maxTokens: 8192
`);

const rpcLog = join(out, "rpc.jsonl");
writeFileSync(rpcLog, "");
const uiLog = join(out, "ui-responses.jsonl");
const DIALOGS = new Set(["select", "confirm", "input", "editor"]);
let uiNext = 0;
let uiFailed = false;
/** Answers one dialog frame with the next --ui-replies item, or cancels it when none is left. */
function answerDialog(frame: Frame): void {
  const reply: UiReply = uiReplies[uiNext++] ?? { cancelled: true };
  let answer: object = reply;
  if ("pick" in reply) {
    const option = (frame.options as string[] | undefined)?.find(o => o.includes(reply.pick));
    if (option === undefined) uiFailed = true;
    answer = option === undefined ? { cancelled: true } : { value: option };
  }
  const response = { type: "extension_ui_response", id: frame.id, ...answer };
  appendFileSync(uiLog, JSON.stringify({ request: { method: frame.method, title: frame.title, options: frame.options }, reply, response }) + "\n");
  child.stdin.write(JSON.stringify(response) + "\n");
  child.stdin.flush();
}
// --session keeps omp's session: its file goes under <home>/.omp/agent/sessions and omp holds its lease under
// <home>/.omp/run/session-owners while the drive runs. Without it omp runs with --no-session.
const child = Bun.spawn(["omp", "--mode", "rpc", ...(values["no-ui"] ? ["--no-ui"] : []), ...(values.session ? [] : ["--no-session"]), "--no-title", "--model", "stub/stub-model"], {
  cwd: proj,
  env,
  stdin: "pipe",
  stdout: "pipe",
  stderr: Bun.file(join(out, "rpc.err")),
});
appendFileSync(join(run, "data", "pids"), `${child.pid} omp rpc for drive ${values.name}\n`);

// Read stdout frames and hand each one to whoever waits for it.
type Frame = { type?: string; id?: string; [k: string]: any };
const waiters: Array<{ match: (f: Frame) => boolean; resolve: (f: Frame) => void }> = [];
const frames: Frame[] = [];
(async () => {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const bytes of child.stdout) {
    buffer += decoder.decode(bytes, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (!line.trim()) continue;
      appendFileSync(rpcLog, line + "\n");
      let frame: Frame;
      try { frame = JSON.parse(line); } catch { continue; }
      frames.push(frame);
      if (frame.type === "extension_ui_request" && DIALOGS.has(frame.method)) answerDialog(frame);
      for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i]!.match(frame)) waiters.splice(i, 1)[0]!.resolve(frame);
    }
  }
})();
function waitFor(match: (f: Frame) => boolean): Promise<Frame | "timeout" | "exited"> {
  const seen = frames.find(match);
  if (seen) return Promise.resolve(seen);
  return Promise.race([
    new Promise<Frame>(res => waiters.push({ match, resolve: res })),
    new Promise<"timeout">(res => setTimeout(() => res("timeout"), STEP_TIMEOUT_MS)),
    child.exited.then(() => "exited" as const),
  ]);
}

const brief = (data: unknown) => {
  const text = JSON.stringify(data);
  return text === undefined || text.length <= 2000 ? data : `${text.length} bytes, see rpc.jsonl`;
};
const results: object[] = [];
let ok = true;
for (const cmd of commands) {
  child.stdin.write(JSON.stringify(cmd) + "\n");
  child.stdin.flush();
  const response = await waitFor(f => f.type === "response" && f.id === cmd.id);
  if (typeof response === "string") { results.push({ id: cmd.id, type: cmd.type, outcome: response }); ok = false; break; }
  const result: Record<string, unknown> = { id: cmd.id, type: cmd.type, success: response.success };
  if (response.success) result.data = brief(response.data);
  else { result.error = response.error; ok = false; }
  if (response.success && (cmd.type === "prompt" || cmd.type === "abort_and_prompt") && response.data?.agentInvoked !== false) {
    const done = await waitFor(f => f.type === "prompt_result" && f.id === cmd.id);
    if (typeof done === "string") { result.prompt_result = done; ok = false; }
    else {
      result.prompt_result = { status: done.status, agentInvoked: done.agentInvoked, error: done.error };
      if (done.status !== "completed") ok = false;
    }
  }
  results.push(result);
  if (!ok) break;
}

child.stdin.end();
const exited = await Promise.race([child.exited, new Promise(res => setTimeout(() => res("still running"), 5000))]);
if (exited === "still running") child.kill();
await child.exited;
server.stop(true);

if (uiFailed) ok = false;
const summary = { ok, drive: out, plugin, stub_port: stubPort, model_requests: next, ui_requests: uiNext, ...(uiFailed ? { ui_error: "a pick matched no option, see ui-responses.jsonl" } : {}), results };
writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
process.exit(ok ? 0 : 1);

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";

const { values } = parseArgs({ options: {
  run: { type: "string" }, prompt: { type: "string" }, config: { type: "string" },
  response: { type: "string" }, "deadline-ms": { type: "string", default: "5000" },
  "session-source": { type: "string" }, continuation: { type: "string" },
} });
for (const key of ["run", "prompt", "config", "response"] as const) {
  if (!values[key]) throw new Error(`Missing --${key}`);
}
if (!["cancelled", "timed-out", "empty"].includes(values.response!)) throw new Error("--response must be cancelled, timed-out, or empty");
const deadlineMs = Number(values["deadline-ms"]);
if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1) throw new Error("--deadline-ms must be a positive integer");
const source = values["session-source"] ?? process.env.PI_SESSION_FILE;
if (!source) throw new Error("PI_SESSION_FILE or --session-source is required for Session model discovery");
const records = readFileSync(source, "utf8").trim().split("\n").map(line => JSON.parse(line));
const model = records.findLast(row => row.type === "model_change")?.model;
const thinking = records.findLast(row => row.type === "thinking_level_change")?.thinkingLevel;
if (!model || !thinking) throw new Error("Session source lacks the last model or thinking record");
const run = resolve(values.run!);
mkdirSync(run); // A new directory preserves failed attempts instead of replacing them.
const log = (file: string, value: unknown) => appendFileSync(join(run, file), JSON.stringify(value) + "\n");
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(PI_|OMP_)/.test(key))) as Record<string, string>;
const command = ["omp", "--mode", "rpc-ui", "--model", model, "--thinking", thinking,
  "--approval-mode", "yolo", "--no-rules", "--no-context-files", "--no-title", "--config", resolve(values.config!),
  "--cwd", run, "--session-dir", join(run, "session")];
const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
writeFileSync(join(run, "launch.json"), JSON.stringify({ command, sessionSource: source, model, thinking,
  prompt: resolve(values.prompt!), promptSha256: hash(values.prompt!), config: resolve(values.config!),
  configSha256: hash(values.config!), controller: { automated: true, response: values.response, deadlineMs },
  home: env.HOME, clearedVariables: Object.keys(process.env).filter(key => /^(PI_|OMP_)/.test(key)),
}, null, 2));
const child = Bun.spawn(command, { cwd: run, env, stdin: "pipe", stdout: "pipe", stderr: Bun.file(join(run, "rpc.err")) });
writeFileSync(join(run, "pid.json"), JSON.stringify({ pid: child.pid, command, cwd: run }));
const frames: any[] = [];
const listeners = new Set<() => void>();
let failure: Error | undefined;
let asks = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const send = (frame: object) => {
  log("controller.jsonl", { at: new Date().toISOString(), direction: "stdin", frame });
  child.stdin.write(JSON.stringify(frame) + "\n");
  child.stdin.flush();
};
let chunk: { id: string; count: number; length: number; parts: Buffer[] } | undefined;
let limit = 64 * 1024 * 1024;
function decode(frame: any): any | undefined {
  if (frame.type !== "rpc_chunk") {
    if (chunk) throw new Error("Interrupted RPC chunk sequence");
    return frame;
  }
  if (!chunk) {
    if (frame.index !== 0 || typeof frame.chunkId !== "string" || !Number.isInteger(frame.count) || frame.count < 1 ||
      !Number.isInteger(frame.byteLength) || frame.byteLength < 1 || frame.byteLength > limit) throw new Error("Invalid RPC chunk header");
    chunk = { id: frame.chunkId, count: frame.count, length: frame.byteLength, parts: [] };
  }
  if (frame.chunkId !== chunk.id || frame.index !== chunk.parts.length || frame.count !== chunk.count ||
    frame.byteLength !== chunk.length || typeof frame.data !== "string") throw new Error("Invalid RPC chunk sequence");
  const bytes = Buffer.from(frame.data, "base64");
  if (bytes.toString("base64") !== frame.data) throw new Error("Invalid RPC chunk base64");
  chunk.parts.push(bytes);
  if (chunk.parts.reduce((n, part) => n + part.length, 0) > chunk.length) throw new Error("RPC chunk length overflow");
  if (chunk.parts.length !== chunk.count) return;
  const all = Buffer.concat(chunk.parts);
  if (all.length !== chunk.length) throw new Error("RPC chunk byte length mismatch");
  chunk = undefined;
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(all));
}
function onFrame(frame: any) {
  frames.push(frame);
  log("events.jsonl", frame);
  if (frame.type === "ready") limit = frame.maxReassembledFrameBytes ?? limit;
  if (frame.type === "rpc_frame_error" || frame.error?.includes?.("transport limit")) throw new Error("RPC transport overflow");
  if (frame.type === "extension_ui_request" && frame.method === "ask") {
    asks++;
    if (asks > 1) {
      log("controller.jsonl", { at: new Date().toISOString(), event: "second-ask-held", request: frame });
      send({ id: "hold-second-ask", type: "abort" });
      return;
    }
    if (!Array.isArray(frame.questions) || frame.questions.length === 0) throw new Error("Native ask has no questions");
    const response = { type: "extension_ui_response", id: frame.id };
    if (values.response === "empty") send({ ...response, answers: frame.questions.map((q: any) => ({ id: q.id, selectedOptions: [] })) });
    else if (values.response === "cancelled") send({ ...response, cancelled: true });
    else {
      const start = performance.now();
      log("controller.jsonl", { event: "deadline-start", at: new Date().toISOString(), startMonotonicMs: start,
        deadlineMonotonicMs: start + deadlineMs, deadlineMs, request: frame, answerSent: false });
      timer = setTimeout(() => {
        const elapsedMs = performance.now() - start;
        log("controller.jsonl", { event: "deadline-expired", at: new Date().toISOString(), elapsedMs, answerSent: false });
        send({ ...response, cancelled: true, timedOut: true });
      }, deadlineMs);
    }
  } else if (frame.type === "extension_ui_request" && ["select", "editor", "input", "confirm"].includes(frame.method)) {
    throw new Error(`Unsupported UI route ${frame.method}; native ask acknowledgement is required`);
  }
  for (const listener of listeners) listener();
}
const reading = (async () => {
  let buffer = "";
  const decoder = new TextDecoder();
  try {
    for await (const bytes of child.stdout) {
      buffer += decoder.decode(bytes, { stream: true });
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        appendFileSync(join(run, "rpc.jsonl"), line + "\n");
        const frame = decode(JSON.parse(line));
        if (frame) onFrame(frame);
      }
    }
    if (chunk || buffer.trim()) throw new Error("Incomplete RPC frame at EOF");
  } catch (error) {
    failure = error as Error;
    for (const listener of listeners) listener();
  }
})();
async function waitFor(match: (frame: any) => boolean, timeoutMs = 1_800_000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { listeners.delete(check); reject(new Error("RPC wait expired")); }, timeoutMs);
    const check = () => {
      const found = frames.find(match);
      if (failure || found || child.exitCode !== null) {
        clearTimeout(timeout);
        listeners.delete(check);
        if (failure) reject(failure);
        else if (found) resolve(found);
        else reject(new Error(`omp exited ${child.exitCode} before expected frame`));
      }
    };
    listeners.add(check);
    void child.exited.then(check);
    check();
  });
}
async function request(id: string, type: string, extra: object = {}) {
  send({ id, type, ...extra });
  const reply = await waitFor(frame => frame.type === "response" && frame.id === id);
  if (!reply.success) throw new Error(`${type} failed: ${reply.error}`);
  return reply;
}
let result: any;
try {
  await waitFor(frame => frame.type === "ready", 60_000);
  await request("protocol", "negotiate_protocol", { protocolVersion: 2 });
  const ack = await request("ask-ui", "set_ask_dialog", { enabled: true });
  if (ack.data?.enabled !== true) throw new Error("set_ask_dialog did not acknowledge enabled:true");
  const discovery = await request("discovery", "get_available_commands");
  writeFileSync(join(run, "discovery.json"), JSON.stringify(discovery, null, 2));
  await request("initial-state", "get_state");
  await request("scenario", "prompt", { message: readFileSync(values.prompt!, "utf8") });
  const initial = await waitFor(frame => frame.type === "prompt_result" && frame.id === "scenario");
  if (asks === 0) throw new Error("Scenario never reached a native ask; case is unavailable");
  let continuation;
  if (values.continuation) {
    log("controller.jsonl", { event: "no-new-decision-continuation", initialPromptResult: initial });
    await request("continuation", "prompt", { message: readFileSync(values.continuation, "utf8") });
    continuation = await waitFor(frame => frame.type === "prompt_result" && frame.id === "continuation");
  }
  await request("final-state", "get_state");
  result = { transportComplete: true, asks, initial, continuation,
    note: "Automated native controller. Inspect artifacts and provenance separately; transport completion is not a behavioral pass." };
} catch (error) {
  result = { transportComplete: false, asks, error: String(error) };
} finally {
  if (timer) clearTimeout(timer);
  child.stdin.end();
  const grace = setTimeout(() => child.kill(), 10_000);
  await child.exited;
  clearTimeout(grace);
  await reading;
  result.exitCode = child.exitCode;
  if (failure) { result.transportComplete = false; result.transportError = String(failure); }
  writeFileSync(join(run, "summary.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ run, ...result }, null, 2));
}
process.exit(result.transportComplete && result.exitCode === 0 ? 0 : 1);

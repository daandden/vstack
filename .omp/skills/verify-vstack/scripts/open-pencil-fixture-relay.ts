import { spawn } from 'bun';
import { createInterface } from 'node:readline';
import { realpathSync } from 'node:fs';
import { relative } from 'node:path';

const [bridge, fixture] = process.argv.slice(2);
const root = realpathSync(fixture);
const child = spawn([bridge], { stdin: 'pipe', stdout: 'pipe', stderr: 'inherit' });
type JsonObject = Record<string, unknown>;
type RpcId = string | number;
const pendingCalls = new Map<RpcId, boolean>();

function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Unexpected MCP object');
  return value as JsonObject;
}

function parseObject(text: string): JsonObject {
  const value: unknown = JSON.parse(text);
  return object(value);
}

function isRpcId(value: unknown): value is RpcId {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
}

function localDocument(path: string) {
  try {
    const rel = relative(root, realpathSync(path));
    return rel === 'Target.fig' || rel === 'Decoy.fig';
  } catch { return false; }
}

function filter(value: unknown) {
  const input = object(value).documents;
  if (!Array.isArray(input)) throw new Error('Unexpected list_documents response');
  const documents: JsonObject[] = [];
  for (const row of input as unknown[]) {
    const doc = object(row);
    const path = doc.path;
    if (path == null) continue;
    if (typeof path !== 'string') throw new Error('Unexpected list_documents path');
    if (localDocument(path)) documents.push(doc);
  }
  return { documents, dropped: input.length - documents.length };
}

type ListResult = {
  content: [{ type: 'text'; text: string }];
  structuredContent?: { documents: JsonObject[] };
};

function filterResult(value: unknown) {
  const result = object(value);
  if (result.isError === true || !Array.isArray(result.content) || result.content.length !== 1) {
    throw new Error('Unexpected list_documents content');
  }
  const content = object(result.content[0]);
  if (content.type !== 'text' || typeof content.text !== 'string') throw new Error('Unexpected list_documents text');
  const { documents, dropped } = filter(parseObject(content.text));
  const safe: ListResult = { content: [{ type: 'text', text: JSON.stringify({ documents }) }] };
  if (result.structuredContent !== undefined) {
    safe.structuredContent = { documents: filter(result.structuredContent).documents };
  }
  return { safe, dropped };
}

async function requests() {
  for await (const line of createInterface({ input: process.stdin })) {
    const message = parseObject(line);
    if (typeof message.method === 'string' && message.id !== undefined) {
      if (!isRpcId(message.id) || pendingCalls.has(message.id)) throw new Error('Unexpected MCP request ID');
      const listing = message.method === 'tools/call' && object(message.params).name === 'list_documents';
      pendingCalls.set(message.id, listing);
    }
    child.stdin.write(line + '\n');
    await child.stdin.flush();
  }
  child.stdin.end();
}

async function responses() {
  const decoder = new TextDecoder();
  let pending = '';
  for await (const bytes of child.stdout) {
    pending += decoder.decode(bytes, { stream: true });
    let split: number;
    while ((split = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, split);
      pending = pending.slice(split + 1);
      if (!line) continue;
      const message = parseObject(line);
      if (typeof message.method === 'string') {
        process.stdout.write(line + '\n');
        continue;
      }
      if (!isRpcId(message.id) || !pendingCalls.has(message.id)) throw new Error('Unmatched MCP response');
      const listing = pendingCalls.get(message.id);
      pendingCalls.delete(message.id);
      if (!listing) {
        process.stdout.write(line + '\n');
        continue;
      }
      try {
        const { safe, dropped } = filterResult(message.result);
        process.stderr.write(JSON.stringify({ dropped_nonfixture_documents: dropped }) + '\n');
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: safe }) + '\n');
      } catch {
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0', id: message.id, error: { code: -32603, message: 'Could not isolate the fixture document listing' },
        }) + '\n');
      }
    }
  }
}

process.on('SIGTERM', () => child.kill());
process.on('SIGINT', () => child.kill());
const incoming = responses();
try {
  await Promise.race([Promise.all([requests(), incoming]), child.exited]);
  await incoming;
  process.exitCode = await child.exited;
} finally {
  if (child.exitCode === null) child.kill();
}

import { spawn } from 'bun';
import { createInterface } from 'node:readline';
import { realpathSync } from 'node:fs';
import { relative } from 'node:path';

const [bridge, fixture] = process.argv.slice(2);
const root = realpathSync(fixture);
const child = spawn([bridge], { stdin: 'pipe', stdout: 'pipe', stderr: 'inherit' });
const listingIds = new Set<string | number>();
function localDocument(doc: { path?: string | null }) {
  if (!doc.path) return false;
  try {
    const rel = relative(root, realpathSync(doc.path));
    return rel === 'Target.fig' || rel === 'Decoy.fig';
  } catch { return false; }
}

type Documents = { documents: Array<{ path?: string | null }> };
function filter(value: Documents) {
  if (!Array.isArray(value.documents)) throw new Error('Unexpected list_documents response');
  return { ...value, documents: value.documents.filter(localDocument) };
}

async function requests() {
  for await (const line of createInterface({ input: process.stdin })) {
    const message = JSON.parse(line);
    if (message.method === 'tools/call' && message.params?.name === 'list_documents') listingIds.add(message.id);
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
      const message = JSON.parse(line);
      if (!listingIds.delete(message.id)) {
        process.stdout.write(line + '\n');
        continue;
      }
      try {
        const result = message.result;
        const parsed = JSON.parse(result.content[0].text);
        if (result.content.length !== 1) throw new Error('Unexpected list_documents content');
        const safe = filter(parsed);
        const content = [{ ...result.content[0], text: JSON.stringify(safe) }];
        const safeResult = { ...result, content };
        if (result.structuredContent !== undefined) safeResult.structuredContent = filter(result.structuredContent);
        process.stderr.write(JSON.stringify({ dropped_nonfixture_documents: parsed.documents.length - safe.documents.length }) + '\n');
        process.stdout.write(JSON.stringify({ ...message, result: safeResult }) + '\n');
      } catch {
        process.stdout.write(JSON.stringify({jsonrpc: '2.0', id: message.id, error: {code: -32603, message: 'Could not isolate the fixture document listing'}}) + '\n');
      }
    }
  }
}

process.on('SIGTERM', () => child.kill());
process.on('SIGINT', () => child.kill());
const transfer = Promise.all([requests(), responses()]);
await Promise.race([transfer, child.exited]);
process.exitCode = await child.exited;

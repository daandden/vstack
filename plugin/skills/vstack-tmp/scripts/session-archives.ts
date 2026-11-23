import { closeSync, constants, createReadStream, fstatSync, lstatSync, openSync, readdirSync, readSync, type BigIntStats } from "node:fs";
import { join, normalize, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { isScratchSessionId } from "./scratch.ts";

export type ArchiveLink = { owner: string; sessions: string[] };
type ArchiveSearch = { links: Map<string, ArchiveLink>; titles: Map<string, string>; heldArchiveError?: string };

const archiveSuffix = /\.jsonl(?:\.gz)?$/;
const artifactSuffix = /\.(?:jsonl|log)(?:\.gz)?$/;
const startBoundary = /[\s"'`([{<=:]/;
const tokenEnd = /[\s"'`]/;
const quoted = /"(?:[^"\\\r\n]|\\.)*"/g;
const closes = new Map([["'", "'"], ["`", "`"], ['"', '"'], ["(", ")"], ["[", "]"], ["{", "}"], ["<", ">"]]);
const escapedVstack = /(?:\.|\\u002e)(?:v|\\u0076)(?:s|\\u0073)(?:t|\\u0074)(?:a|\\u0061)(?:c|\\u0063)(?:k|\\u006b)/i;
const hasPath = (text: string) => text.includes(".vstack") || text.includes("\\u") && escapedVstack.test(text);

function scanCandidateLines(bytes: Buffer, scan: (line: string) => void) {
  let plain = bytes.indexOf(".vstack");
  let escaped = bytes.indexOf("\\u");
  while (plain !== -1 || escaped !== -1) {
    const at = plain === -1 ? escaped : escaped === -1 ? plain : Math.min(plain, escaped);
    const start = bytes.lastIndexOf(10, at) + 1;
    const newline = bytes.indexOf(10, at);
    const end = newline === -1 ? bytes.length : newline;
    scan(bytes.toString("utf8", start, end));
    if (plain !== -1 && plain < end) plain = bytes.indexOf(".vstack", end + 1);
    if (escaped !== -1 && escaped < end) escaped = bytes.indexOf("\\u", end + 1);
  }
}

function pathScanner(root: string, entries: ReadonlyMap<string, boolean>) {
  const base = root + sep;
  const prefixes = [base, `~${sep}.vstack${sep}tmp${sep}`];
  if (sep === "\\") prefixes.push(base.replaceAll("\\", "/"), "~/.vstack/tmp/");

  function record(suffix: string, matched: Set<string>): boolean {
    let path = normalize(base + suffix);
    if (!path.startsWith(base) || path.includes("\0")) return false;
    if (path.endsWith(sep)) path = path.slice(0, -1);
    let boundary = root.length;
    for (let part = 0; part < 3 && boundary !== -1; part++) boundary = path.indexOf(sep, boundary + 1);
    const entry = boundary === -1 ? path : path.slice(0, boundary);
    if (boundary === -1 ? !entries.has(entry) : !entries.get(entry)) return false;
    matched.add(entry);
    return true;
  }

  function scanPlain(text: string, matched: Set<string>, leadingRecorded = false) {
    for (const prefix of prefixes) {
      let index = -1;
      while ((index = text.indexOf(prefix, index + 1)) !== -1) {
        if (index === 0 && leadingRecorded) continue;
        const before = text[index - 1];
        if (before !== undefined && !startBoundary.test(before)) continue;
        const start = index + prefix.length;
        const close = before === undefined ? undefined : closes.get(before);
        let end = start;
        if (close) {
          end = text.indexOf(close, start);
          if (end === -1) continue;
        } else {
          while (end < text.length && !tokenEnd.test(text[end]!)) end++;
        }
        record(text.slice(start, end), matched);
      }
    }
  }

  return (text: string, matched: Set<string>) => {
    if (!hasPath(text)) return;
    let offset = 0;
    for (const match of text.matchAll(quoted)) {
      const literal = match[0];
      scanPlain(text.slice(offset, match.index), matched);
      if (hasPath(literal)) {
        let decoded: string;
        try { decoded = JSON.parse(literal); } catch { decoded = literal.slice(1, -1); }
        for (const line of decoded.split(/\r?\n/)) {
          const prefix = prefixes.find(value => line.startsWith(value));
          const leadingRecorded = prefix !== undefined && record(line.slice(prefix.length), matched);
          scanPlain(line, matched, leadingRecorded);
        }
      }
      offset = match.index + literal.length;
    }
    scanPlain(text.slice(offset), matched);
  };
}

const HEADER_BYTES = 8192;
const readOnly = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

function titleFromHeader(header: string, id: string): string | undefined {
  let title: string | undefined, matches = false;
  try {
    for (const line of header.split("\n", 2)) {
      if (!line) break;
      const record = JSON.parse(line);
      if (record.type === "title" && typeof record.title === "string") title = record.title.trim() || undefined;
      if (record.type === "session") matches = record.id === id;
      if (title && matches) return title;
    }
  } catch { return undefined; }
}

async function readArchive(path: string, buffer: Buffer, scan: (line: string) => void, id?: string) {
  let header = id ? "" : undefined;
  let title: string | undefined;
  let tail: Buffer[] = [];
  function inspect(bytes: Buffer, final = false) {
    if (header !== undefined) {
      header += bytes.toString("utf8", 0, Math.min(bytes.length, HEADER_BYTES - header.length));
      const first = header.indexOf("\n");
      if (final || header.length >= HEADER_BYTES || first !== -1 && header.indexOf("\n", first + 1) !== -1) {
        title = titleFromHeader(header, id!);
        header = undefined;
      }
    }
    scanCandidateLines(bytes, scan);
  }
  function consume(bytes: Buffer) {
    const end = bytes.lastIndexOf(10) + 1;
    let start = 0;
    if (end && tail.length) {
      start = bytes.indexOf(10) + 1;
      tail.push(bytes.subarray(0, start));
      inspect(Buffer.concat(tail));
      tail = [];
    }
    if (start < end) inspect(bytes.subarray(start, end));
    if (end < bytes.length) tail.push(Buffer.from(bytes.subarray(end)));
  }

  const fd = openSync(path, readOnly);
  let streamOwnsFd = false;
  try {
    const st = fstatSync(fd, { bigint: true });
    if (!st.isFile()) throw new Error("Not a regular file");
    if (path.endsWith(".gz")) {
      const stream = createReadStream(path, { fd, highWaterMark: buffer.length });
      streamOwnsFd = true;
      await pipeline(stream, createGunzip(), async (source: AsyncIterable<Buffer>) => {
        for await (const chunk of source) consume(chunk);
      });
    } else {
      for (let size; (size = readSync(fd, buffer));) consume(buffer.subarray(0, size));
    }
    if (tail.length) inspect(Buffer.concat(tail), true);
    return { stat: st, title };
  } finally {
    if (!streamOwnsFd) closeSync(fd);
  }
}

function fingerprint(st: BigIntStats) {
  return `${st.dev}:${st.ino}:${st.size}:${st.mtimeNs}:${st.ctimeNs}:${st.birthtimeNs}`;
}

function realDirectory(path: string) {
  const st = lstatSync(path, { bigint: true });
  if (!st.isDirectory()) throw new Error(`Not a real archive directory: ${path}`);
  return st;
}

function archiveSessionId(name: string) {
  const stem = name.replace(archiveSuffix, "");
  const id = stem.slice(-36);
  return stem.at(-37) === "_" && isScratchSessionId(id) ? id : undefined;
}

function changedHeldArchive(root: string, rootStamp: string, buckets: Map<string, string>, watched: Map<string, string>, isHeld: (id: string) => boolean) {
  let checking = root;
  try {
    if (fingerprint(realDirectory(root)) !== rootStamp) {
      for (const slug of readdirSync(root, { withFileTypes: true })) {
        checking = join(root, slug.name);
        if (slug.isSymbolicLink()) return checking;
        if (!slug.isDirectory() || buckets.has(checking)) continue;
        buckets.set(checking, "");
      }
    }
    for (const [bucket, stamp] of buckets) {
      checking = bucket;
      if (fingerprint(realDirectory(bucket)) === stamp) continue;
      for (const entry of readdirSync(bucket, { withFileTypes: true })) {
        const id = archiveSessionId(entry.name);
        if (!id || !isHeld(id) || !entry.isDirectory() && !entry.isSymbolicLink() && !archiveSuffix.test(entry.name)) continue;
        const archive = join(bucket, entry.name);
        if (!watched.has(archive)) return archive;
      }
    }
    for (const [path, stamp] of watched) {
      checking = path;
      if (fingerprint(lstatSync(path, { bigint: true })) !== stamp) return path;
    }
  } catch {
    return checking;
  }
}

async function scanArtifacts(path: string, scan: (path: string) => Promise<void>, watched?: Map<string, string>) {
  if (watched) watched.set(path, fingerprint(realDirectory(path)));
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) await scanArtifacts(child, scan, watched);
    else if (artifactSuffix.test(entry.name)) await scan(child);
    else if (entry.isSymbolicLink()) throw new Error(`Linked archive entry: ${child}`);
  }
}

export async function searchSessionArchives(
  home: string, root: string, entries: ReadonlyMap<string, boolean>, isHeld?: (id: string) => boolean,
): Promise<ArchiveSearch> {
  const scanPaths = pathScanner(root, entries);
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const sessions = new Map<string, { activity?: bigint; paths: Set<string> }>();
  const titles = new Map<string, { title: string; activity: bigint }>();
  const omp = join(home, ".omp");
  const agent = join(omp, "agent");
  const archiveRoot = join(agent, "sessions");
  realDirectory(omp);
  realDirectory(agent);
  const rootStat = realDirectory(archiveRoot);
  const watched = isHeld && new Map<string, string>();
  const buckets = isHeld && new Map<string, string>();
  for (const slug of readdirSync(archiveRoot, { withFileTypes: true })) {
    const bucket = join(archiveRoot, slug.name);
    if (slug.isSymbolicLink()) throw new Error(`Linked archive directory: ${bucket}`);
    if (!slug.isDirectory()) continue;
    if (buckets) buckets.set(bucket, fingerprint(realDirectory(bucket)));
    for (const record of readdirSync(bucket, { withFileTypes: true })) {
      const id = archiveSessionId(record.name);
      if (!id) continue;
      const path = join(bucket, record.name);
      let session = sessions.get(id);
      if (!session) sessions.set(id, session = { paths: new Set() });
      const current = session;
      const held = isHeld?.(id) ? watched : undefined;
      const scan = async (file: string, main = false) => {
        try {
          const { stat, title } = await readArchive(file, buffer, line => scanPaths(line, current.paths), main ? id : undefined);
          if (held) held.set(file, fingerprint(stat));
          const activity = stat.mtimeNs;
          if (current.activity === undefined || activity > current.activity) current.activity = activity;
          const prior = titles.get(id);
          if (title && (!prior || activity > prior.activity)) titles.set(id, { title, activity });
        } catch (error) {
          throw new Error(`Cannot read archive ${file}: ${(error as Error).message}`, { cause: error });
        }
      };
      if (archiveSuffix.test(record.name)) await scan(path, true);
      else if (record.isDirectory()) await scanArtifacts(path, scan, held);
      else if (record.isSymbolicLink()) throw new Error(`Linked archive directory: ${path}`);
    }
  }
  const links = new Map<string, ArchiveLink>();
  for (const [id, session] of sessions) {
    for (const path of session.paths) {
      const link = links.get(path);
      if (!link) links.set(path, { owner: id, sessions: [id] });
      else {
        link.sessions.push(id);
        const prior = sessions.get(link.owner)!.activity!;
        if (session.activity! > prior || session.activity === prior && id < link.owner) link.owner = id;
      }
    }
  }
  const changed = isHeld && buckets && watched && changedHeldArchive(archiveRoot, fingerprint(rootStat), buckets, watched, isHeld);
  return {
    links, titles: new Map([...titles].map(([id, value]) => [id, value.title])),
    ...(changed ? { heldArchiveError: `Held session archive changed during the search: ${changed}` } : {}),
  };
}

async function readCompressedHeader(input: ReturnType<typeof createReadStream>, header: Buffer): Promise<number> {
  const gunzip = createGunzip({ chunkSize: header.length });
  const finished = pipeline(input, gunzip).catch(() => undefined);
  let size = 0;
  try {
    for await (const chunk of gunzip) {
      size += (chunk as Buffer).copy(header, size);
      const first = header.indexOf(10);
      const second = first >= 0 && first < size ? header.indexOf(10, first + 1) : -1;
      if (size === header.length || second >= 0 && second < size) break;
    }
    return size;
  } finally {
    input.destroy();
    gunzip.destroy();
    await finished;
  }
}

async function readSessionTitle(path: string, header: Buffer, id: string): Promise<string | undefined> {
  try {
    const fd = openSync(path, readOnly);
    let streamOwnsFd = false;
    try {
      if (!fstatSync(fd).isFile()) return undefined;
      if (!path.endsWith(".gz")) return titleFromHeader(header.toString("utf8", 0, readSync(fd, header)), id);
      const input = createReadStream(path, { fd, highWaterMark: header.length });
      streamOwnsFd = true;
      const size = await readCompressedHeader(input, header);
      return titleFromHeader(header.toString("utf8", 0, size), id);
    } finally {
      if (!streamOwnsFd) closeSync(fd);
    }
  } catch {
    return undefined;
  }
}

export async function sessionTitles(home: string, ids: Set<string>): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!ids.size) return result;
  const omp = join(home, ".omp"), agent = join(omp, "agent"), root = join(agent, "sessions");
  try { realDirectory(omp); realDirectory(agent); } catch { return result; }
  const names = (path: string) => {
    try { realDirectory(path); return readdirSync(path).sort().reverse(); } catch { return []; }
  };
  const buffer = Buffer.allocUnsafe(HEADER_BYTES);
  for (const slug of names(root)) {
    const dir = join(root, slug);
    for (const name of names(dir)) {
      if (!archiveSuffix.test(name)) continue;
      const id = archiveSessionId(name);
      if (!id || !ids.has(id) || result.has(id)) continue;
      const title = await readSessionTitle(join(dir, name), buffer, id);
      if (title) result.set(id, title);
    }
    if (result.size === ids.size) break;
  }
  return result;
}

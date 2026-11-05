import { createHash, randomUUID } from "node:crypto";
import { open, mkdir, readFile, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { trackerFor, type Connection, type Issue, KnownFailure } from "./trackers.ts";

export type Ticket = { key: string; title: string; body: string; labels: string[]; parent?: { local: string } | { external: string }; blockedBy?: string[] };
export type Description = { version: 1; tracker: Record<string, unknown> & { mode: string; readiness: string }; tickets: Ticket[] };
type Operation = { ticket: string; kind: string; state: "pending" | "succeeded" | "failed" | "uncertain"; detail?: unknown; at: string };
type SavedTicket = { id?: string; baseline?: string[]; attemptedAt?: string; verified?: boolean; ready?: boolean };
type RecordFile = { version: 1; digest: string; intent: Description; tickets: Record<string, SavedTicket>; operations: Operation[]; owner?: string; status: string; problem?: unknown };
export type Receipt = { status: string; record: string; tickets: Record<string, SavedTicket>; problem?: unknown };
export class PublicationError extends Error {
  constructor(public category: string, message: string, public detail?: unknown) { super(message); }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sorted = (values: string[]) => [...values].sort();
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function description(value: unknown): Description {
  const d = value as Description;
  if (!d || d.version !== 1 || !d.tracker || typeof d.tracker.mode !== "string" || typeof d.tracker.readiness !== "string" || !d.tracker.readiness.trim() || !Array.isArray(d.tickets) || !d.tickets.length) throw new PublicationError("invalid-intent", "Expected version, configured tracker readiness, and a nonempty tickets array");
  const keys = new Set<string>();
  for (const t of d.tickets) {
    if (!t || typeof t.key !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(t.key) || keys.has(t.key)) throw new PublicationError("invalid-intent", "Ticket keys must be unique lowercase file-safe identities");
    if (Object.keys(t).some(key => !["key", "title", "body", "labels", "parent", "blockedBy"].includes(key))) throw new PublicationError("invalid-intent", `Unsupported approved fields for ${t.key}`);
    keys.add(t.key);
    if (typeof t.title !== "string" || !t.title.trim() || typeof t.body !== "string" || !t.body.trim() || !Array.isArray(t.labels) || t.labels.some(l => typeof l !== "string" || !l.trim() || l === d.tracker.readiness) || new Set(t.labels).size !== t.labels.length) throw new PublicationError("invalid-intent", `Invalid approved fields or premature readiness for ${t.key}`);
    if (t.blockedBy !== undefined && (!Array.isArray(t.blockedBy) || t.blockedBy.some(k => typeof k !== "string") || new Set(t.blockedBy).size !== t.blockedBy.length)) throw new PublicationError("invalid-intent", `Invalid blocking collection for ${t.key}`);
    if (t.parent !== undefined && (!t.parent || typeof t.parent !== "object" || Object.keys(t.parent).length !== 1 || !("local" in t.parent && typeof t.parent.local === "string" || "external" in t.parent && typeof t.parent.external === "string" && t.parent.external.trim()))) throw new PublicationError("invalid-intent", `Invalid parent for ${t.key}`);
  }
  for (const relationship of ["parent", "blocking"] as const) {
    const visiting = new Set<string>(), visited = new Set<string>();
    const visit = (key: string) => {
      if (!keys.has(key) || visiting.has(key)) throw new PublicationError("invalid-intent", `Unknown or cyclic ${relationship} relationship at ${key}`);
      if (visited.has(key)) return;
      visiting.add(key);
      const t = d.tickets.find(t => t.key === key)!;
      if (relationship === "blocking") for (const blocker of t.blockedBy ?? []) visit(blocker);
      if (relationship === "parent" && t.parent && "local" in t.parent) visit(t.parent.local);
      visiting.delete(key); visited.add(key);
    };
    for (const key of keys) visit(key);
  }
  return structuredClone(d);
}
async function durable(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, "wx", 0o600);
  try { await file.writeFile(JSON.stringify(value, null, 2) + "\n"); await file.sync(); } finally { await file.close(); }
  await rename(temporary, path);
  const directory = await open(dirname(path), "r");
  try { await directory.sync(); } finally { await directory.close(); }
}
async function locked<T>(path: string, run: () => Promise<T>): Promise<T> {
  await mkdir(dirname(path), { recursive: true });
  let lock;
  try { lock = await open(`${path}.lock`, "wx", 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const recovery = `${path}.recover`;
    try { await mkdir(recovery); }
    catch { throw new PublicationError("locked", `Publication lock recovery is already held: ${recovery}`); }
    try {
      const owner = Number(await readFile(`${path}.lock`, "utf8"));
      if (!Number.isSafeInteger(owner) || owner <= 0) throw new PublicationError("locked", "Publication lock owner is unknown");
      try { process.kill(owner, 0); throw new PublicationError("locked", `Publication is held by live process ${owner}`); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
      await rm(`${path}.lock`);
      lock = await open(`${path}.lock`, "wx", 0o600);
    } finally { await rm(recovery, { recursive: true }); }
  }
  try { await lock.writeFile(String(process.pid)); await lock.sync(); return await run(); }
  finally { await lock.close(); await rm(`${path}.lock`); }
}
function approvedFields(issue: Issue, ticket: Ticket, readiness: string) {
  return issue.title === ticket.title && issue.body === ticket.body && same(sorted(issue.labels.filter(l => l !== readiness)), sorted(ticket.labels));
}
async function execute(path: string, record: RecordFile, connection?: Connection): Promise<Receipt> {
  const save = () => durable(path, record);
  try {
    const tracker = await trackerFor(record.intent.tracker, connection);
    await tracker.check();
    const owner = await tracker.owner();
    if (record.owner && record.owner !== owner) throw new PublicationError("ownership", "Resume must use the original tracker identity");
    record.owner = owner; await save();
    const operation = async (key: string, kind: string, effect: () => Promise<unknown>) => {
      const op: Operation = { ticket: key, kind, state: "pending", at: new Date().toISOString() };
      record.operations.push(op); await save();
      try { const result = await effect(); op.state = "succeeded"; op.detail = result; await save(); return result; }
      catch (error) { op.state = error instanceof KnownFailure ? "failed" : "uncertain"; op.detail = String(error); await save(); throw error; }
    };
    for (const ticket of record.intent.tickets) {
      const saved = record.tickets[ticket.key];
      if (saved.id) continue;
      const lastCreate = record.operations.findLast(op => op.ticket === ticket.key && op.kind === "create");
      if (lastCreate && lastCreate.state !== "failed") {
        if (tracker.idempotentCreate) {
          await operation(ticket.key, "idempotent-create", async () => {
            const issue = await tracker.create(ticket, `${record.digest}:${ticket.key}`);
            saved.id = issue.id;
            return { id: issue.id };
          });
          continue;
        }
        const candidates = (await tracker.search(ticket)).filter(issue => !saved.baseline?.includes(issue.id) && issue.author === record.owner && Date.parse(issue.createdAt) >= Date.parse(saved.attemptedAt!) && approvedFields(issue, ticket, record.intent.tracker.readiness) && !issue.labels.includes(record.intent.tracker.readiness));
        if (candidates.length !== 1) throw new PublicationError("reconciliation", "Uncertain creation requires exactly one owned matching candidate; no create was retried", { ticket: ticket.key, candidates });
        saved.id = candidates[0].id;
        record.operations.push({ ticket: ticket.key, kind: "reconcile", state: "succeeded", detail: { id: saved.id }, at: new Date().toISOString() });
        await save(); continue;
      }
      saved.baseline = (await tracker.search(ticket)).map(issue => issue.id);
      saved.attemptedAt = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString(); await save();
      await operation(ticket.key, "create", async () => {
        const issue = await tracker.create(ticket, `${record.digest}:${ticket.key}`);
        saved.id = issue.id;
        return { id: issue.id };
      });
    }
    const required = (ticket: Ticket) => ({
      parent: ticket.parent ? "local" in ticket.parent ? record.tickets[ticket.parent.local].id! : ticket.parent.external : undefined,
      blockedBy: (ticket.blockedBy ?? []).map(key => record.tickets[key].id!),
    });
    const verify = (issue: Issue, ticket: Ticket) => {
      const expected = required(ticket);
      if (!approvedFields(issue, ticket, record.intent.tracker.readiness) || issue.parent !== expected.parent || !same(sorted(issue.blockedBy), sorted(expected.blockedBy))) throw new PublicationError("readback", `Tracker state does not match approved content and relationships for ${ticket.key}`, { expected: { ...ticket, ...expected }, actual: issue });
    };
    for (const ticket of record.intent.tickets) {
      const saved = record.tickets[ticket.key], id = saved.id!, expected = required(ticket);
      let actual = await tracker.read(id);
      if (!approvedFields(actual, ticket, record.intent.tracker.readiness)) throw new PublicationError("readback", `Approved fields changed for ${ticket.key}`, actual);
      if (actual.labels.includes(record.intent.tracker.readiness) && !saved.ready && !record.operations.some(op => op.ticket === ticket.key && op.kind === "activate")) throw new PublicationError("premature-readiness", `Readiness appeared outside the publisher for ${ticket.key}`);
      if (actual.parent && actual.parent !== expected.parent || actual.blockedBy.some(id => !expected.blockedBy.includes(id))) throw new PublicationError("readback", `Unapproved relationships for ${ticket.key}`, actual);
      if (expected.parent && !actual.parent) await operation(ticket.key, "parent", () => tracker.parent(id, expected.parent!));
      for (const blocker of expected.blockedBy) if (!actual.blockedBy.includes(blocker)) await operation(ticket.key, `blocked-by:${blocker}`, () => tracker.block(id, blocker));
      actual = await tracker.read(id); verify(actual, ticket);
      saved.verified = true;
      record.operations.push({ ticket: ticket.key, kind: "readback", state: "succeeded", at: new Date().toISOString() }); await save();
    }
    for (const ticket of record.intent.tickets) {
      const saved = record.tickets[ticket.key], id = saved.id!;
      const actual = await tracker.read(id); verify(actual, ticket);
      if (!actual.labels.includes(record.intent.tracker.readiness)) await operation(ticket.key, "activate", () => tracker.activate(id, record.intent.tracker.readiness));
      const activated = await tracker.read(id); verify(activated, ticket);
      if (!activated.labels.includes(record.intent.tracker.readiness)) throw new PublicationError("readback", `Readiness was not applied for ${ticket.key}`);
      saved.ready = true; await save();
    }
    record.status = "complete"; delete record.problem; await save();
  } catch (error) {
    record.status = "blocked";
    record.problem = { category: error instanceof PublicationError || error instanceof KnownFailure ? error.category : "unavailable-or-uncertain", message: String(error), ...(error instanceof PublicationError && error.detail !== undefined ? { detail: error.detail } : {}) };
    await save();
  }
  return { status: record.status, record: path, tickets: record.tickets, ...(record.problem ? { problem: record.problem } : {}) };
}
export async function publish(input: unknown, recordPath: string, connection?: Connection): Promise<Receipt> {
  const intent = description(input), path = resolve(recordPath);
  return locked(path, async () => {
    try { await readFile(path); throw new PublicationError("record-exists", "Use resume with the existing durable record"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const record: RecordFile = { version: 1, digest: hash(intent), intent, tickets: Object.fromEntries(intent.tickets.map(t => [t.key, {}])), operations: [], status: "publishing" };
    await durable(path, record);
    return execute(path, record, connection);
  });
}
export async function resume(recordPath: string, connection?: Connection): Promise<Receipt> {
  const path = resolve(recordPath);
  return locked(path, async () => {
    const record: RecordFile = JSON.parse(await readFile(path, "utf8"));
    description(record.intent);
    if (record.version !== 1 || hash(record.intent) !== record.digest) throw new PublicationError("invalid-record", "Durable approved intent has changed");
    return execute(path, record, connection);
  });
}

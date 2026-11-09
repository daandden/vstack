import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fields, Refusal, refuse, text } from "./fields.ts";
import { readState, withLock, writeAtomic } from "./store.ts";

export type CommentAnchor = { kind: "block" } | { kind: "entry"; entry: string } | { kind: "text"; quote: string };
export type ReaderComment = { id: string; stage: string; result: string; revision: number; anchor: CommentAnchor; text: string; time: string };
type Comments = { version: 1; comments: ReaderComment[] };
const pathOf = (folder: string) => join(folder, "data", "comments.json");

export function readComments(folder: string): Comments {
  const path = pathOf(folder);
  if (!existsSync(path)) return { version: 1, comments: [] };
  if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error("Comments storage is not a regular file");
  return JSON.parse(readFileSync(path, "utf8"));
}

export async function comments(folder: string, req: Request): Promise<{ status: number; body: unknown }> {
  try {
    if (req.method === "GET") return { status: 200, body: readComments(folder) };
    if (req.method !== "POST") return { status: 405, body: { error: "Only GET and POST are supported" } };
    const reader = req.body?.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    if (reader) for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 262144) { await reader.cancel(); return { status: 413, body: { error: "Comment is too large" } }; }
      parts.push(value);
    }
    const raw = JSON.parse(Buffer.concat(parts).toString());
    if (raw?.action === "edit" || raw?.action === "remove") {
      const edit = raw.action === "edit";
      const o = fields(raw, "comment", edit ? ["version", "action", "id", "text"] : ["version", "action", "id"]);
      if (o.version !== 1) refuse("comment", "needs version 1");
      const id = text(o, "id", "comment");
      const body = edit ? text(o, "text", "comment") : "";
      if (body.length > 4096) refuse("comment", "text is too long, maximum 4096 characters");
      return await withLock(folder, () => {
        const saved = readComments(folder);
        const index = saved.comments.findIndex((c) => c.id === id);
        if (index < 0) refuse("comment", "names no saved Reader comment");
        if (edit) saved.comments[index] = { ...saved.comments[index]!, text: body };
        else saved.comments.splice(index, 1);
        writeAtomic(pathOf(folder), JSON.stringify(saved));
        return { status: 200, body: saved };
      });
    }
    const o = fields(raw, "comment", ["version", "result", "revision", "anchor", "text"]);
    if (o.version !== 1 || !Number.isInteger(o.revision) || (o.revision as number) < 1) refuse("comment", "needs version 1 and a positive Result revision");
    const resultId = text(o, "result", "comment");
    const body = text(o, "text", "comment");
    if (body.length > 4096) refuse("comment", "text is too long, maximum 4096 characters");
    const a = fields(o.anchor, "comment.anchor", ["kind"], ["entry", "quote"]);
    let anchor: CommentAnchor;
    if (a.kind === "block" && a.entry === undefined && a.quote === undefined) anchor = { kind: "block" };
    else if (a.kind === "entry" && a.quote === undefined) anchor = { kind: "entry", entry: text(a, "entry", "comment.anchor") };
    else if (a.kind === "text" && a.entry === undefined) anchor = { kind: "text", quote: text(a, "quote", "comment.anchor") };
    else return refuse("comment.anchor", "needs a block, entry, or text anchor");
    return await withLock(folder, () => {
      const s = readState(folder)!;
      const result = [...s.results, ...s.history].find((r) => r.id === resultId && (r.revision ?? 1) === o.revision) ?? refuse("comment", "names no captured Result revision");
      if (anchor.kind === "entry" && !result.entries.some((e) => e.id === anchor.entry)) refuse("comment.anchor", "names no entry in this Result revision");
      const saved = readComments(folder);
      saved.comments.push({ id: randomUUID(), stage: result.stage, result: result.id, revision: o.revision as number, anchor, text: body, time: new Date().toISOString() });
      writeAtomic(pathOf(folder), JSON.stringify(saved));
      return { status: 200, body: saved };
    });
  } catch (error) {
    if (error instanceof Refusal || error instanceof SyntaxError) return { status: 400, body: { error: error.message } };
    throw error;
  }
}

import type { CommentAnchor, ReaderComment } from "#flow/comments.ts";

export const readerComments = shallowRef<ReaderComment[]>([]);
let previous = "";

export async function refreshComments() {
  const response = await fetch(new URL("comments", location.href), { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Could not load Reader comments (${response.status}).`);
  const raw = await response.text();
  if (raw !== previous) {
    readerComments.value = (JSON.parse(raw) as { comments: ReaderComment[] }).comments;
    previous = raw;
  }
}

export async function saveComment(result: string, revision: number, anchor: CommentAnchor, text: string) {
  const response = await fetch(new URL("comments", location.href), {
    method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
    body: JSON.stringify({ version: 1, result, revision, anchor, text }), signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    const body = await response.json() as { error?: string };
    throw new Error(body.error ?? `Could not save Reader comment (${response.status}).`);
  }
  const body = await response.text();
  readerComments.value = (JSON.parse(body) as { comments: ReaderComment[] }).comments;
  previous = body;
}

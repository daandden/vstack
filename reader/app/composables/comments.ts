import type { CommentAnchor, ReaderComment } from "#flow/comments.ts";
import type { Comments, HostError } from "#flow/host-api.ts";

export const readerComments = shallowRef<ReaderComment[]>([]);
let previous = "";

export async function refreshComments() {
  const response = await fetch(new URL("comments", location.href), { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Could not load Reader comments (${response.status}).`);
  const raw = await response.text();
  if (raw !== previous) {
    readerComments.value = (JSON.parse(raw) as Comments).comments;
    previous = raw;
  }
}

export async function saveComment(result: string, revision: number, edit: number | null, anchor: CommentAnchor, text: string) {
  await changeComment({ version: 1, result, revision, edit, anchor, text });
}

export async function editComment(id: string, text: string) {
  await changeComment({ version: 1, action: "edit", id, text });
}

export async function removeComment(id: string) {
  await changeComment({ version: 1, action: "remove", id });
}

async function changeComment(input: object) {
  const response = await fetch(new URL("comments", location.href), {
    method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
    body: JSON.stringify(input), signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    const body = await response.json() as HostError;
    throw new Error(body.error ?? `Could not save Reader comment (${response.status}).`);
  }
  const body = await response.text();
  readerComments.value = (JSON.parse(body) as Comments).comments;
  previous = body;
}

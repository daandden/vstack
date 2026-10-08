// Port of omp 18.8.4 packages/coding-agent/src/tiny/message-preproc.ts.
// The tiny subtree is not a runtime export. Keep its eight stages and constants.
function windowEdges(text: string, edge: number): string {
  return text.length <= edge * 2 ? text : `${text.slice(0, edge)}\n…\n${text.slice(-edge)}`;
}
function collapse(text: string): string {
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
export function preprocessTinyMessage(message: string): string {
  const raw = windowEdges(message, 262_144).replace(/\u001b\[[0-9;]*m/g, "");
  const stripped = collapse(raw.replace(/```+[\s\S]*?(?:```+|$)/g, " "));
  const cleaned = collapse(windowEdges(stripped.length >= 12 ? stripped : raw, 16_384)
    .replace(/<([a-zA-Z][\w-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1>/g, " ")
    .replace(/\b[0-9a-fA-F]{12,}\b/g, hash => hash.slice(0, 7)));
  if (cleaned.length <= 2000) return cleaned;
  let omitted = cleaned.length - 2000;
  let head = 0;
  let tail = 0;
  for (let pass = 0; pass < 2; pass++) {
    const marker = `\n[… ${omitted} chars omitted …]\n`;
    const kept = Math.max(0, 2000 - marker.length);
    head = Math.ceil(kept * 2 / 3);
    tail = kept - head;
    omitted = cleaned.length - head - tail;
  }
  return `${cleaned.slice(0, head)}\n[… ${omitted} chars omitted …]\n${cleaned.slice(-tail)}`;
}

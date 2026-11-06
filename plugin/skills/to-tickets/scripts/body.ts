export function normalizedBody(body: string): string {
  return Bun.markdown.html(body.replace(/\r\n?/g, "\n"), {
    tables: true, strikethrough: true, tasklists: true,
    noHtmlBlocks: true, noHtmlSpans: true,
  }).replace(/\n+(?=<\/code><\/pre>)/g, "\n");
}

export function bodyDiff(approved: string, actual: string): string {
  const before = approved.split("\n"), after = actual.split("\n");
  let first = 0, tail = 0;
  while (first < before.length && first < after.length && before[first] === after[first]) first++;
  while (tail < before.length - first && tail < after.length - first && before[before.length - tail - 1] === after[after.length - tail - 1]) tail++;
  const removed = before.slice(first, before.length - tail), added = after.slice(first, after.length - tail);
  return ["--- approved", "+++ readback", `@@ -${first + 1},${removed.length} +${first + 1},${added.length} @@`, ...removed.map(line => `-${line}`), ...added.map(line => `+${line}`)].join("\n");
}

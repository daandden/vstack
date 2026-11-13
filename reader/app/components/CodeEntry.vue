<script setup lang="ts">
import { highlighter, linesOf, markTrailing, parseDiff, type DiffLine, type Token } from "#flow/code.ts";
import type { CodeLocation } from "#flow/model.ts";
import type { ResultView } from "~/utils/flow";

const props = defineProps<{ e: ResultView["entries"][number] }>();
const tokens = (ts: Token[]) => markTrailing(ts).map((t) => (t.kind ? `<span class="tok-${t.kind}">${esc(t.text)}</span>` : esc(t.text))).join("");
const loc = computed(() => props.e.location as CodeLocation);
const language = computed(() => props.e.language as string | undefined);
const kind = computed(() => (typeof props.e.code === "string" ? "Code" : "Diff"));

function line(ids: string[], cls: string, nums: { old?: number; new?: number }, inner: string, nl: string) {
  const data = `${nums.old !== undefined ? ` data-old="${nums.old}"` : ""}${nums.new !== undefined ? ` data-new="${nums.new}"` : ""}`;
  const [outer, ...rest] = ids;
  return `<span class="line ${cls}"${outer ? ` id="${outer}"` : ""}${data}>${rest.map((id) => `<span id="${id}">`).join("")}${inner}${nl}${rest.map(() => "</span>").join("")}</span>`;
}

const rendered = computed(() => {
  const e = props.e;
  const hl = highlighter(language.value);
  if (typeof e.code === "string") {
    const code = e.code;
    const ls = linesOf(code);
    const first = loc.value.lines?.first;
    const html = ls.map((l, i) => {
      const n = first === undefined ? undefined : first + i;
      return line(n === undefined ? [] : [`${e.anchor}-L${n}`], "plain", { old: n }, tokens(hl.line(l)), i < ls.length - 1 || code.endsWith("\n") ? "\n" : "");
    }).join("");
    const where = loc.value.lines ? (loc.value.lines.first === loc.value.lines.last ? `line ${loc.value.lines.first}` : `lines ${loc.value.lines.first}–${loc.value.lines.last}`) : "";
    return { html, where: esc(where) };
  }
  const diff = e.diff as string;
  const { lines } = parseDiff(diff) as { lines: DiffLine[] };
  const oldHl = highlighter(language.value);
  const html = lines.map((l, i) => {
    const nl = i < lines.length - 1 || diff.endsWith("\n") ? "\n" : "";
    if (l.kind === "hunk") {
      oldHl.reset();
      hl.reset();
      return line([loc.value.hunks![l.hunk! - 1]!.anchor], "hunk", {}, esc(l.text), nl);
    }
    if (l.kind === "meta" || l.kind === "note") return line([], l.kind, {}, esc(l.text), nl);
    const body = l.text.slice(1);
    const mark = `<span class="mark">${esc(l.text[0] ?? "")}</span>`;
    if (l.kind === "del") return line([`${e.anchor}-L${l.old}`], "del", { old: l.old }, mark + tokens(oldHl.line(body)), nl);
    if (l.kind === "add") return line([`${e.anchor}-R${l.new}`], "add", { new: l.new }, mark + tokens(hl.line(body)), nl);
    oldHl.line(body);
    return line([`${e.anchor}-L${l.old}`, `${e.anchor}-R${l.new}`], "ctx", { old: l.old, new: l.new }, mark + tokens(hl.line(body)), nl);
  }).join("");
  const where = loc.value.hunks!.map((h) => `<a href="#${h.anchor}">${h.new.count === 0 ? `removed at line ${h.old.start}` : h.new.count === 1 ? `line ${h.new.start}` : `lines ${h.new.start}–${h.new.start + h.new.count - 1}`}</a>`).join(", ");
  return { html, where };
});
</script>

<template>
  <li :id="e.anchor" class="grid gap-2">
    <CorrectionNotice :notice="e" />
    <p class="flex flex-wrap items-baseline gap-x-3.5 gap-y-0.5 text-small text-muted">
      <span class="me-2 font-bold uppercase tabular-nums">{{ e.id }}</span>
      <span class="font-semibold text-flow-teal">{{ kind }}</span>
      <span><code>{{ loc.file }}</code> <span v-html="rendered.where" /></span>
      <span v-if="loc.revision">at <code>{{ loc.revision }}</code></span>
      <span v-if="language">{{ language }}</span>
    </p>
    <div v-if="e.note" class="grid gap-1.5" v-html="prose(e.note as string)" />
    <CodeFrame :html="rendered.html" :kind="kind.toLowerCase()" :language="language" />
    <EntryAsks :questions="e.questions" />
  </li>
</template>

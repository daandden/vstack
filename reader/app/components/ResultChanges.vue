<script setup lang="ts">
import type { ResultView } from "~/utils/flow";

const props = defineProps<{ r: ResultView }>();
const selected = shallowRef<number>();
const earlier = computed(() => props.r.history.find(h => h.changed === selected.value) ?? props.r.history.at(-1)!);
const label = (r: ResultView) => `Revision ${r.revision}${r.edit === undefined ? "" : ` · Edit ${r.edit}`}`;
const anchor = (r: ResultView) => `${props.r.id}-changes-${r.changed}`;
function reveal(event: Event) {
  const id: unknown = (event as CustomEvent<unknown>).detail;
  const match = props.r.history.find(h => anchor(h) === id);
  if (match) selected.value = match.changed;
}
onMounted(() => document.addEventListener("flow-reveal", reveal));
onBeforeUnmount(() => document.removeEventListener("flow-reveal", reveal));

type ObjectValue = Record<string, unknown>;
type Change = { path: string; before?: string; after?: string; prefix: string; suffix: string; removed?: string; added?: string };
const object = (v: unknown): v is ObjectValue => v !== null && typeof v === "object" && !Array.isArray(v);
const title = (s: string) => s.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase());
function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean);
  if (!object(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([k, v]) => v !== undefined && !["anchor", "changed", "questions", "cited_in", "delta", "relative", "delta_unavailable"].includes(k)).map(([k, v]) => [k, clean(v)]));
}
function content(r: ResultView): ObjectValue {
  return clean({
    shape: r.shape, title: r.title, summary: r.summary, canonical: r.canonical, columns: r.columns,
    entries: r.entries.map(({ id: _id, anchor: _anchor, changed: _changed, questions: _questions, location, ...e }) => ({
      ...e, ...(typeof location === "string" ? { location } : {}),
      ...(r.shape === "table" ? { name: (e.cells as string[])[0], cells: Object.fromEntries((e.cells as string[]).map((value, i) => [typeof r.columns?.[i] === "string" ? r.columns[i] : r.columns?.[i]?.label ?? String(i + 1), value])) } : {}),
    })),
    axes: r.axes,
    document: r.doc ? { sections: r.doc.sections, citations: r.doc.citations.map(c => ({ ref: c.ref, text: c.text })), limitations: r.doc.limitations, sources: r.doc.sourceTexts } : undefined,
    comparison: r.comparison ? { alternatives: r.comparison.alternatives, criteria: r.comparison.criteria, assessments: r.comparison.cells.map(c => ({ alternative: c.alternative, criterion: c.criterion, assessment: c.assessment })), verdict: r.comparison.verdict } : undefined,
    metrics: r.metrics, demo: r.demo, quiz: r.quiz, artifact: r.artifact,
    attachments: r.shown.map(({ id, type, caption, description, origin, availability, revision, reason, url }) => ({ id, type, caption, description, origin, availability, revision, reason, url })),
  }) as ObjectValue;
}
function difference(before: ObjectValue, after: ObjectValue): Change[] {
  const changes: Change[] = [];
  const equal = (a: unknown, b: unknown): boolean => {
    if (Object.is(a, b)) return true;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equal(v, b[i]));
    if (object(a) && object(b)) return Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => Object.hasOwn(b, k) && equal(v, b[k]));
    return false;
  };
  function leaf(a: unknown, b: unknown, path: string[]) {
    const before = a === undefined ? undefined : String(a), after = b === undefined ? undefined : String(b);
    let prefix = "", suffix = "", removed = before, added = after;
    if (typeof a === "string" && typeof b === "string") {
      const old = Array.from(a), next = Array.from(b);
      let start = 0, end = 0;
      while (start < old.length && start < next.length && old[start] === next[start]) start++;
      while (end < old.length - start && end < next.length - start && old[old.length - end - 1] === next[next.length - end - 1]) end++;
      prefix = old.slice(0, start).join(""); suffix = end ? old.slice(-end).join("") : "";
      removed = old.slice(start, old.length - end).join(""); added = next.slice(start, next.length - end).join("");
    }
    changes.push({ path: path.join(" / "), before, after, prefix, suffix, removed, added });
  }
  function visit(a: unknown, b: unknown, path: string[]) {
    if (equal(a, b)) return;
    if ((object(a) || a === undefined) && (object(b) || b === undefined)) {
      const old = a ?? {}, next = b ?? {};
      for (const key of new Set([...Object.keys(old), ...Object.keys(next)])) visit(old[key], next[key], [...path, title(key)]);
    } else if ((Array.isArray(a) || a === undefined) && (Array.isArray(b) || b === undefined)) {
      sequence(a ?? [], b ?? [], path);
    } else if (object(a) || object(b) || Array.isArray(a) || Array.isArray(b)) {
      visit(a, undefined, [...path, "Removed"]); visit(undefined, b, [...path, "Added"]);
    } else leaf(a, b, path);
  }
  function sequence(a: unknown[], b: unknown[], path: string[]) {
    const keys = ["ref", "id", "heading", "series", "name", "title", "claim", "file"];
    const key = keys.find(k => [...a, ...b].every(v => object(v) && typeof v[k] === "string") && new Set(a.map(v => (v as ObjectValue)[k])).size === a.length && new Set(b.map(v => (v as ObjectValue)[k])).size === b.length);
    if (key) {
      const old = new Map(a.map(v => [String((v as ObjectValue)[key]), v]));
      const next = new Map(b.map(v => [String((v as ObjectValue)[key]), v]));
      for (const id of new Set([...old.keys(), ...next.keys()])) {
        const value = (next.get(id) ?? old.get(id)) as ObjectValue;
        const name = value.heading ?? value.name ?? value.label ?? value.title ?? value.claim ?? id;
        visit(old.get(id), next.get(id), [...path, String(name)]);
      }
      const oldOrder = [...old.keys()].filter(id => next.has(id)), newOrder = [...next.keys()].filter(id => old.has(id));
      if (!equal(oldOrder, newOrder)) leaf(oldOrder.join(", "), newOrder.join(", "), [...path, "Order"]);
      return;
    }
    visitChangedRunsBetweenUnchangedItems(a, b, path);
  }
  function visitChangedRunsBetweenUnchangedItems(before: unknown[], after: unknown[], path: string[]) {
    let i = 0, j = 0;
    while (i < before.length || j < after.length) {
      if (i < before.length && j < after.length && equal(before[i], after[j])) { i++; j++; continue; }
      let nextUnchangedBefore = before.length, nextUnchangedAfter = after.length;
      for (let x = i; x < before.length; x++) {
        const y = after.findIndex((v, n) => n >= j && equal(before[x], v));
        if (y !== -1) { nextUnchangedBefore = x; nextUnchangedAfter = y; break; }
      }
      const size = Math.max(nextUnchangedBefore - i, nextUnchangedAfter - j);
      for (let n = 0; n < size; n++) visit(i + n < nextUnchangedBefore ? before[i + n] : undefined, j + n < nextUnchangedAfter ? after[j + n] : undefined, [...path, String(j + n + 1)]);
      i = nextUnchangedBefore; j = nextUnchangedAfter;
    }
  }
  visit(before, after, []);
  return changes;
}
const changes = computed(() => difference(content(earlier.value), content(props.r)));
</script>

<template>
  <section :id="`${r.id}-changes`" class="grid min-w-0 gap-1.5 text-small" :aria-label="`Changes to ${r.title}`">
    <details class="open:grid open:gap-2.5">
      <summary>Compare revisions</summary>
      <div :id="anchor(earlier)" class="grid gap-2.5">
      <label class="flex flex-wrap items-baseline gap-2">Earlier snapshot
        <select :value="earlier.changed" class="max-w-full rounded border border-default bg-default px-2 py-1 active:bg-accented" @change="selected = Number(($event.target as HTMLSelectElement).value)">
          <option v-for="h in r.history" :key="h.changed" :value="h.changed">{{ label(h) }}</option>
        </select>
      </label>
      <p class="font-semibold tabular-nums">{{ label(earlier) }} → {{ label(r) }}</p>
      <p class="flex flex-wrap gap-x-4 gap-y-1"><a :href="`#${earlier.anchor}`">Complete earlier snapshot</a><a :href="`#${r.anchor}`">Complete current Result</a></p>
      <p class="quiet">Only changed fields are shown. Removed content is struck through; additions are underlined. Full snapshots keep their citations, attachments, and interactions.</p>
      <ul v-if="changes.length" class="grid list-none gap-2.5 ps-0">
        <li v-for="(c, i) in changes" :key="i" class="grid min-w-0 gap-1 border-s-2 border-default ps-3 [overflow-wrap:anywhere]">
          <p class="font-semibold">{{ c.path }}</p>
          <p class="whitespace-pre-wrap tabular-nums">{{ c.prefix }}<del v-if="c.removed !== undefined && c.removed !== ''" class="bg-error/10 text-error">{{ c.removed }}</del><ins v-if="c.added !== undefined && c.added !== ''" class="bg-success/10 text-success">{{ c.added }}</ins>{{ c.suffix }}<span v-if="c.before === '' || c.after === ''" class="text-muted"> {{ c.before === '' ? '(previously empty)' : '(now empty)' }}</span></p>
        </li>
      </ul>
      <p v-else class="quiet">No content changes between these snapshots.</p>
      </div>
    </details>
  </section>
</template>

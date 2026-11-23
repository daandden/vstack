<script setup lang="ts">
import { useEventListener } from "@vueuse/core";
import Select from "~/components/ui/Select.vue";
import type { ResultView } from "~/utils/flow";
import { difference, object, type ObjectValue } from "~/utils/difference";

const props = defineProps<{ r: ResultView }>();
const selected = shallowRef<number>();
const earlier = computed(() => props.r.history.find(h => h.changed === selected.value) ?? props.r.history.at(-1)!);
const label = (r: ResultView) => `Revision ${r.revision}${r.edit === undefined ? "" : ` · Edit ${r.edit}`}`;
const anchor = (r: ResultView) => `${props.r.id}-changes-${r.changed}`;
const snapshots = computed(() => props.r.history.map(h => ({ label: label(h), value: h.changed })));
useEventListener(document, "flow-reveal", (event: Event) => {
  const id: unknown = (event as CustomEvent<unknown>).detail;
  const match = props.r.history.find(h => anchor(h) === id);
  if (match) selected.value = match.changed;
});

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
const changes = computed(() => difference(content(earlier.value), content(props.r)));
</script>

<template>
  <section :id="`${r.id}-changes`" class="grid min-w-0 gap-1.5 text-small" :aria-label="`Changes to ${r.title}`">
    <details :id="`${r.anchor}-compare`" class="open:grid open:gap-2.5">
      <summary>Compare revisions</summary>
      <div :id="anchor(earlier)" class="grid gap-2.5">
      <div class="grid max-w-full justify-items-start gap-1">
        <label :for="`${r.id}-earlier`" class="font-medium">Earlier snapshot</label>
        <Select
          :id="`${r.id}-earlier`"
          :model-value="earlier.changed"
          :items="snapshots"
          @update:model-value="selected = $event"
        />
      </div>
      <p class="font-semibold tabular-nums">{{ label(earlier) }} → {{ label(r) }}</p>
      <p class="flex flex-wrap gap-x-4 gap-y-1"><a :href="`#${earlier.anchor}`">Complete earlier snapshot</a><a :href="`#${r.anchor}`">Complete current Result</a></p>
      <p class="quiet">Only changed fields are shown. Removed content is struck through; additions are underlined. Full snapshots keep their citations, attachments, and interactions.</p>
      <ul v-if="changes.length" class="grid list-none gap-2.5 ps-0">
        <li v-for="(c, i) in changes" :key="i" class="grid min-w-0 gap-1 border-s-2 border-flow-border ps-3 [overflow-wrap:anywhere]">
          <p class="font-semibold">{{ c.path }}</p>
          <p class="whitespace-pre-wrap tabular-nums">{{ c.prefix }}<del v-if="c.removed !== undefined && c.removed !== ''" class="bg-[var(--color-red)]/10 text-flow-red">{{ c.removed }}</del><ins v-if="c.added !== undefined && c.added !== ''" class="bg-[var(--color-green)]/10 text-flow-green">{{ c.added }}</ins>{{ c.suffix }}<span v-if="c.before === '' || c.after === ''" class="text-flow-subtext"> {{ c.before === '' ? '(previously empty)' : '(now empty)' }}</span></p>
        </li>
      </ul>
      <p v-else class="quiet">No content changes between these snapshots.</p>
      </div>
    </details>
  </section>
</template>

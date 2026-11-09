<script setup lang="ts">
import { flow } from "~/composables/reader";
import type { ResultView } from "~/utils/flow";

const props = withDefaults(defineProps<{ r: ResultView; historical?: boolean }>(), { historical: false });
const f = computed(() => flow.value!);
const shown = computed(() => new Map(props.r.shown.map((a) => [a.id, a])));
const embedded = computed(() => new Set([...(props.r.doc?.figures ?? []), ...(props.r.comparison?.alternatives.flatMap((a) => a.attachments ?? []) ?? [])]));
const listed = computed(() => props.r.shown.filter((a) => props.r.attachments?.includes(a.id) && !embedded.value.has(a.id) && a.id !== props.r.artifact));
const canonical = computed(() => {
  const c = props.r.canonical;
  if (!c) return "";
  if ("file" in c) return ` from <code>${esc(c.file)}</code> at sha256 <code>${c.sha256.slice(0, 12)}</code>`;
  if ("commit" in c) return ` from commit <code>${esc(c.commit.slice(0, 12))}</code>`;
  return ` from ${inline(c.tracker)} at <code>${esc(c.revision)}</code>`;
});
const earlier = computed(() => [...props.r.history].reverse());
</script>

<template>
  <component :is="historical ? 'article' : 'section'" :id="r.anchor" class="result grid gap-2.5" :class="historical ? 'border-s-2 border-default ps-3' : undefined" :data-shape="r.shape" :aria-labelledby="`${r.anchor}-title`" :data-stop="historical ? undefined : ''">
    <span v-if="r.review && !historical" :id="`${r.stage}-review`" />
    <header class="grid gap-1">
      <h2 :id="`${r.anchor}-title`" v-html="inline(r.title)" />
      <p v-if="r.summary" class="text-toned" v-html="inline(r.summary)" />
      <p class="text-small text-muted">Revision {{ r.revision }}<template v-if="r.captured">, <time :datetime="r.captured">{{ formatTime(r.captured) }}</time></template><span v-html="canonical" /></p>
    </header>
    <ReviewSummary v-if="r.review" :rows="r.review" />
    <DocumentBody v-if="r.doc" :r="r" :doc="r.doc" :historical="historical" />
    <DemoBody v-else-if="r.demo" :r="r" :demo="r.demo" />
    <ArtifactView v-else-if="r.artifact && shown.get(r.artifact)" :a="shown.get(r.artifact)!" :runtime="f.runtimes[r.artifact]" :anchor="r.anchor" />
    <ComparisonBody v-else-if="r.comparison" :c="r.comparison" :shown="shown" />
    <MetricsBody v-else-if="r.metrics" :m="r.metrics" />
    <QuizBody v-else-if="r.quiz" :r="r" />
    <ResultEntries v-else :r="r" />
    <div v-if="listed.length" class="grid gap-2.5">
      <p class="font-semibold text-muted">Attachments</p>
      <AttachmentFigure v-for="a in listed" :key="a.id" :a="a" :anchor="`${r.anchor}-${a.id}`" />
    </div>
    <ResultComments :r="r" />
    <details v-if="r.history.length" class="text-small open:grid open:gap-4 [&>:not(summary)]:text-body">
      <summary>Earlier revisions ({{ r.history.length }})</summary>
      <ResultBlock v-for="h in earlier" :key="h.anchor" :r="h" historical />
    </details>
  </component>
</template>

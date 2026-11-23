<script setup lang="ts">
import { current } from "~/composables/navigation";
import { useReaderState } from "~/composables/reader";
import { askLabel, foldedQuestionOutcome, type QuestionView } from "~/utils/flow";

const { q } = defineProps<{ q: QuestionView }>();
const { flow } = useReaderState();
const disclosure = useTemplateRef<HTMLDetailsElement>("disclosure");
const expanded = shallowRef(false);
const rank = computed(() => flow.value!.next.indexOf(q.id));
const outcome = computed(() => foldedQuestionOutcome(q));
const latest = computed(() => flow.value!.latestAttempt.get(q.id));
const latestLabel = computed(() => {
  if (!latest.value) return;
  const f = flow.value!;
  const title = askLabel(f, latest.value.id);
  return latest.value.stage === q.stage ? title : `${title} in ${f.stage.get(latest.value.stage)?.label}`;
});

watch(() => q.open, open => {
  expanded.value = !open && (current.value === q.id || disclosure.value?.contains(document.activeElement) === true);
});
</script>

<template>
  <article :id="q.id" class="question grid gap-2.5" :data-fold-target="`${q.id}-fold`" :data-state="q.answer.state" :data-next="rank >= 0 ? rank : undefined" :data-retired="q.retired ? '' : undefined" data-stop>
    <details :id="`${q.id}-fold`" ref="disclosure" data-reading-fold :open="q.open || expanded" @toggle="expanded = !q.open && disclosure?.open === true">
      <summary v-show="!q.open" class="min-h-8 py-1 [overflow-wrap:anywhere]">
        <template v-if="!expanded">
          <span class="text-flow-text"><span class="tabular-nums">Q{{ q.q }}: </span><span v-html="inline(q.title)" /></span>
          <span class="text-small font-normal text-flow-subtext"> · {{ outcome }}</span>
          <span v-if="q.context.correction || q.answer.correction" class="text-small text-flow-peach"> · Corrected</span>
          <template v-if="latest"> · <a :href="`#${latest.id}`" class="text-small font-normal">Latest attempt: {{ latestLabel }}</a></template>
        </template>
        <template v-else>Collapse question</template>
      </summary>
      <QuestionBlock :q="q" />
    </details>
  </article>
</template>

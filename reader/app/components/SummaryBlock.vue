<script setup lang="ts">
import type { CloseView } from "#flow/model.ts";
import { useReaderState } from "~/composables/reader";
const { flow } = useReaderState();
import type { StageView } from "~/utils/flow";

const props = defineProps<{ close: CloseView; stage: StageView }>();
const ask = (id: string) => flow.value!.question.get(id);
const assumed = computed(() => props.stage.assumed.filter((a) => props.close.assumed.includes(a.id)));
</script>

<template>
  <section :id="close.id" class="summary-block grid gap-2.5" :aria-labelledby="`${close.id}-title`" data-stop>
    <h2 :id="`${close.id}-title`">Summary <time v-if="close.time" :datetime="close.time">{{ formatTime(close.time) }}</time></h2>
    <ul class="grid list-disc gap-0.5 ps-5 marker:text-dimmed">
      <li v-for="d in close.decisions" :id="`${close.id}-${d.question}`" :key="d.question">
        <CorrectionNotice :notice="d" />
        <p><a :href="`#${d.question}`">Q{{ ask(d.question)?.q }}</a> <span class="quiet">({{ PROVENANCE[d.answer] }}{{ d.affected ? ", historical summary affected by Correction" : "" }})</span>: <span v-html="inline(d.text)" /></p>
        <template v-if="d.affected">
          <p v-if="d.current_text !== d.text">Current summary: <span v-html="inline(d.current_text)" /></p>
          <p>Current answer: {{ PROVENANCE[d.current_answer] }}. <span v-if="d.current_reading?.outcome === 'resolved'" v-html="inline(d.current_reading.decision)" /><span v-else-if="d.current_reading" v-html="inline(d.current_reading.unresolved)" /></p>
          <p v-if="ask(d.question)?.answer.correction"><a :href="`#${ask(d.question)!.answer.correction!.head.anchor}`">Current corrected reading</a></p>
        </template>
      </li>
      <li v-for="a in assumed" :key="a.id">
        <CorrectionNotice :notice="a" />
        <a :href="`#${a.id}`">Assumed</a>: <span v-html="inline(a.decision)" />: <span v-html="inline(a.pick)" /> <span class="quiet">(<span v-html="inline(a.why)" />)</span>
      </li>
      <li v-for="(e, i) in close.extra ?? []" :key="`x${i}`" v-html="inline(e)" />
    </ul>
  </section>
</template>

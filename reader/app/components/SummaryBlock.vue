<script setup lang="ts">
import type { Close } from "#flow/model.ts";
import { flow } from "~/composables/reader";
import type { StageView } from "~/utils/flow";

const props = defineProps<{ close: Close; stage: StageView }>();
const ask = (id: string) => flow.value!.question.get(id);
const assumed = computed(() => props.stage.assumed.filter((a) => props.close.assumed.includes(a.id)));
</script>

<template>
  <section :id="close.id" class="summary-block grid gap-2.5" :aria-labelledby="`${close.id}-title`" data-stop>
    <h2 :id="`${close.id}-title`">Summary <time v-if="close.time" :datetime="close.time">{{ formatTime(close.time) }}</time></h2>
    <ul class="grid list-disc gap-0.5 ps-5 marker:text-dimmed">
      <li v-for="d in close.decisions" :key="d.question">
        <a :href="`#${d.question}`">Q{{ ask(d.question)?.q }}</a> <span class="quiet">({{ PROVENANCE[d.answer] }})</span>: <span v-html="inline(d.text)" />
      </li>
      <li v-for="a in assumed" :key="a.id">
        <a :href="`#${a.id}`">Assumed</a>: <span v-html="inline(a.decision)" />: <span v-html="inline(a.pick)" /> <span class="quiet">(<span v-html="inline(a.why)" />)</span>
      </li>
      <li v-for="(e, i) in close.extra ?? []" :key="`x${i}`" v-html="inline(e)" />
    </ul>
  </section>
</template>

<script setup lang="ts">
import { useReaderState } from "~/composables/reader";
const { flow } = useReaderState();
import type { StageView } from "~/utils/flow";

defineProps<{ a: StageView["assumed"][number]; first: boolean; stage: string }>();
const ask = (id: string) => flow.value!.question.get(id);
</script>

<template>
  <section :id="a.id" class="assumed grid gap-2.5 [overflow-wrap:anywhere]" data-stop>
    <CorrectionNotice :notice="a" />
    <h2 :id="first ? `${stage}-assumed` : undefined" v-html="inline(a.decision)" />
    <dl class="grid grid-cols-[fit-content(12rem)_1fr] items-baseline gap-x-4 gap-y-1 [&_dt]:text-small [&_dt]:font-semibold [&_dt]:text-flow-toned">
      <dt>Pick</dt><dd class="ms-0" v-html="inline(a.pick)" />
      <dt>Why</dt><dd class="ms-0" v-html="inline(a.why)" />
    </dl>
    <p v-if="a.reopened_by" class="asks"><a :href="`#${a.reopened_by}`">Reopened in Q{{ ask(a.reopened_by)?.q }}</a></p>
  </section>
</template>

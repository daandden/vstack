<script setup lang="ts">
import type { StageView } from "~/utils/flow";
import { flow } from "~/composables/reader";

const props = defineProps<{ note: StageView["readings"][number] }>();
const question = computed(() => flow.value!.question.get(props.note.question));
</script>

<template>
  <section :id="note.id" class="grid gap-2.5" data-stop>
    <CorrectionNotice :notice="note" />
    <h2>Answer reading for <a :href="`#${note.question}`">Q{{ question?.q }}</a></h2>
    <p class="quiet">Agent interpretation, not a new user answer.</p>
    <template v-if="note.reading.outcome === 'resolved'">
      <p v-html="inline(note.reading.decision)" />
      <p v-html="inline(note.reading.basis)" />
    </template>
    <template v-else>
      <p>Unresolved. This reading does not authorize work.</p>
      <p v-html="inline(note.reading.unresolved)" />
    </template>
  </section>
</template>

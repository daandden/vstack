<script setup lang="ts">
import { flow } from "~/composables/reader";
import type { StageView } from "~/utils/flow";

defineProps<{ a: StageView["assumed"][number]; first: boolean; stage: string }>();
const ask = (id: string) => flow.value!.question.get(id);
</script>

<template>
  <section :id="a.id" class="assumed" data-stop>
    <span v-if="first" :id="`${stage}-assumed`" />
    <h2 v-html="inline(a.decision)" />
    <dl class="fields">
      <dt>Pick</dt><dd v-html="inline(a.pick)" />
      <dt>Why</dt><dd v-html="inline(a.why)" />
    </dl>
    <p v-if="a.reopened_by" class="asks"><a :href="`#${a.reopened_by}`">Reopened in Q{{ ask(a.reopened_by)?.q }}</a></p>
  </section>
</template>

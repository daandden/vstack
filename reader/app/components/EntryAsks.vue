<script setup lang="ts">
import { flow } from "~/composables/reader";
import { askLabel } from "~/utils/flow";

defineProps<{ questions: string[] }>();
const askName = (id: string) => askLabel(flow.value!, id);
const ask = (id: string) => flow.value!.question.get(id);
</script>

<template>
  <p v-if="questions.length" class="flex flex-wrap gap-x-2 gap-y-0.5 text-small [&_a]:font-semibold [&_a]:no-underline">
    <span class="font-semibold text-muted">Asked in</span>
    <span><template v-for="(id, i) in questions" :key="id">{{ i ? "; " : "" }}<a :href="`#${id}`">{{ askName(id) }}</a>: <span v-html="inline(ask(id)?.title ?? '')" /></template></span>
  </p>
</template>

<script setup lang="ts">
import type { Flow } from "~/utils/flow";

defineProps<{ topic: Flow["topics"][number] }>();
</script>

<template>
  <article :id="topic.id" class="topic grid gap-2.5" data-stop>
    <CorrectionNotice :notice="topic" />
    <h2 v-html="inline(topic.title)" />
    <p class="text-toned" v-html="inline(topic.summary)" />
    <div class="grid gap-1.5" v-html="prose(topic.body)" />
    <EntryAsks :questions="topic.questions" />
    <details v-if="topic.sourceTexts.length" class="text-small open:grid open:gap-1.5 [&>:not(summary)]:text-body">
      <summary>Sources ({{ topic.sourceTexts.length }})</summary>
      <ul class="grid list-disc gap-0.5 ps-5 marker:text-dimmed"><li v-for="(x, i) in topic.sourceTexts" :key="i" v-html="inline(x)" /></ul>
    </details>
  </article>
</template>

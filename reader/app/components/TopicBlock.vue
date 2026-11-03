<script setup lang="ts">
import type { Flow } from "~/utils/flow";

defineProps<{ topic: Flow["topics"][number] }>();
</script>

<template>
  <article :id="topic.id" class="topic" data-stop>
    <h2 v-html="inline(topic.title)" />
    <p class="summary" v-html="inline(topic.summary)" />
    <div class="prose" v-html="prose(topic.body)" />
    <EntryAsks :questions="topic.questions" />
    <details v-if="topic.sourceTexts.length" class="disclosure">
      <summary>Sources ({{ topic.sourceTexts.length }})</summary>
      <ul class="bullets"><li v-for="(x, i) in topic.sourceTexts" :key="i" v-html="inline(x)" /></ul>
    </details>
  </article>
</template>

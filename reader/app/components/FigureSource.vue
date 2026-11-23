<script setup lang="ts">
import type { Attachment } from "~/utils/flow";

const { a } = defineProps<{ a: Attachment }>();
const facts = computed(() => sourceFacts(a));
</script>

<template>
  <details class="source disclosure">
    <summary>Source</summary>
    <p class="meta">
      <span class="kind font-semibold" :class="a.availability === 'unavailable' ? 'text-error' : a.availability === 'external' ? 'text-warning' : 'text-flow-teal'">{{ TYPE_LABELS[a.type] }}</span>
      <span>{{ facts.state }}</span>
      <span v-if="facts.revision">Revision <code>{{ facts.revision }}</code></span>
      <span v-if="facts.from">From <code>{{ facts.from }}</code></span>
      <time :datetime="a.time">{{ formatTime(a.time) }}</time>
    </p>
    <p>Origin: <span v-html="inline(a.origin)" /></p>
    <p v-if="a.type === 'image' || a.type === 'svg'" class="quiet">{{ UNKNOWN_EXAMPLE }}</p>
  </details>
</template>

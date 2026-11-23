<script setup lang="ts">
import type { Attachment } from "~/utils/flow";

const { a } = defineProps<{ a?: Attachment }>();
const facts = computed(() => a && sourceFacts(a));
</script>

<template>
  <details class="source disclosure">
    <summary class="min-h-control content-center">Source</summary>
    <p v-if="a && facts" class="meta">
      <span class="kind font-semibold" :class="a.availability === 'unavailable' ? 'text-flow-red' : a.availability === 'external' ? 'text-flow-peach' : 'text-flow-teal'">{{ TYPE_LABELS[a.type] }}</span>
      <span>{{ facts.state }}</span>
      <span v-if="facts.revision">Revision <code>{{ facts.revision }}</code></span>
      <span v-if="facts.from">From <code>{{ facts.from }}</code></span>
      <time :datetime="a.time">{{ formatTime(a.time) }}</time>
    </p>
    <p>Origin: <span v-html="inline(a?.origin ?? 'unknown')" /></p>
    <p v-if="!a || a.type === 'image' || a.type === 'svg'" class="quiet">{{ UNKNOWN_EXAMPLE }}</p>
  </details>
</template>

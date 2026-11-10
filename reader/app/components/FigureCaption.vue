<script setup lang="ts">
import type { Attachment } from "~/utils/flow";

const props = defineProps<{ a: Attachment; as?: "figcaption" | "div" }>();
const facts = computed(() => sourceFacts(props.a));
</script>

<template>
  <component :is="as ?? 'figcaption'" class="figure-caption grid justify-self-stretch gap-1">
    <p class="figure-title font-heading text-body leading-[1.35] font-[650] text-default text-balance" v-html="inline(withoutQuestionNumber(a.caption))" />
    <div v-if="a.description" class="figure-description grid gap-1.5 text-toned" v-html="prose(a.description)" />
    <details class="source text-small open:grid open:gap-1.5 [&>:not(summary)]:text-body">
      <summary>Source</summary>
      <p class="flex flex-wrap items-baseline gap-x-3.5 gap-y-0.5 text-small text-muted">
        <span class="kind font-semibold" :class="a.availability === 'unavailable' ? 'text-error' : a.availability === 'external' ? 'text-warning' : 'text-flow-teal'">{{ TYPE_LABELS[a.type] }}</span>
        <span>{{ facts.state }}</span>
        <span v-if="facts.revision">Revision <code>{{ facts.revision }}</code></span>
        <span v-if="facts.from">From <code>{{ facts.from }}</code></span>
        <time :datetime="a.time">{{ formatTime(a.time) }}</time>
      </p>
      <p>Origin: <span v-html="inline(a.origin)" /></p>
      <p v-if="a.type === 'image' || a.type === 'svg'" class="quiet">{{ UNKNOWN_EXAMPLE }}</p>
    </details>
  </component>
</template>

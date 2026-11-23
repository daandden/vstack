<script setup lang="ts">
import type { Attachment } from "~/utils/flow";

defineProps<{ a: Attachment; anchor: string; as?: "figcaption" | "div"; hideSource?: boolean }>();
</script>

<template>
  <component :is="as ?? 'figcaption'" class="figure-caption grid justify-self-stretch gap-1">
    <p class="figure-title font-heading text-body leading-heading [font-weight:var(--font-weight-heading)] text-flow-text text-balance" v-html="inline(withoutQuestionNumber(a.caption))" />
    <div v-if="a.description" class="figure-description grid gap-1.5 text-flow-toned" v-html="prose(a.description)" />
    <FigureSource v-if="!hideSource" :id="`${anchor}-source`" :a="a" />
  </component>
</template>

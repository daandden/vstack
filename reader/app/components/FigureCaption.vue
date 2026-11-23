<script setup lang="ts">
import type { Attachment } from "~/utils/flow";

defineProps<{ a: Attachment; as?: "figcaption" | "div"; hideSource?: boolean }>();
</script>

<template>
  <component :is="as ?? 'figcaption'" class="figure-caption grid justify-self-stretch gap-1">
    <p class="figure-title font-heading text-body leading-[1.35] font-[650] text-default text-balance" v-html="inline(withoutQuestionNumber(a.caption))" />
    <div v-if="a.description" class="figure-description grid gap-1.5 text-toned" v-html="prose(a.description)" />
    <FigureSource v-if="!hideSource" :a="a" />
  </component>
</template>

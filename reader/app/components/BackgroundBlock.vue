<script setup lang="ts">
import type { StageView } from "~/utils/flow";

defineProps<{ bg: NonNullable<StageView["background"]> }>();
</script>

<template>
  <section :id="bg.id" class="background grid gap-2.5" :aria-labelledby="`${bg.id}-title`" data-stop>
    <CorrectionNotice :notice="bg" />
    <h2 :id="`${bg.id}-title`" v-html="inline(bg.title)" />
    <p class="text-toned" v-html="inline(bg.summary)" />
    <FigureList :figures="bg.figures" />
    <section v-for="(sec, i) in bg.sections" :key="i" class="grid gap-1.5">
      <h3 v-html="inline(sec.heading)" />
      <div class="grid gap-1.5" v-html="prose(sec.body)" />
    </section>
    <details v-if="bg.sourceTexts.length" class="text-small open:grid open:gap-1.5 [&>:not(summary)]:text-body">
      <summary>Sources ({{ bg.sourceTexts.length }})</summary>
      <ul class="grid list-disc gap-0.5 ps-5 marker:text-dimmed"><li v-for="(x, i) in bg.sourceTexts" :key="i" v-html="inline(x)" /></ul>
    </details>
  </section>
</template>

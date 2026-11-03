<script setup lang="ts">
import type { StageView } from "~/utils/flow";

defineProps<{ bg: NonNullable<StageView["background"]> }>();
</script>

<template>
  <section :id="bg.id" class="background" :aria-labelledby="`${bg.id}-title`" data-stop>
    <h2 :id="`${bg.id}-title`" v-html="inline(bg.title)" />
    <p class="summary" v-html="inline(bg.summary)" />
    <FigureList :figures="bg.figures" />
    <section v-for="(sec, i) in bg.sections" :key="i" class="labelled">
      <h3 v-html="inline(sec.heading)" />
      <div class="prose" v-html="prose(sec.body)" />
    </section>
    <details v-if="bg.sourceTexts.length" class="disclosure">
      <summary>Sources ({{ bg.sourceTexts.length }})</summary>
      <ul class="bullets"><li v-for="(x, i) in bg.sourceTexts" :key="i" v-html="inline(x)" /></ul>
    </details>
  </section>
</template>

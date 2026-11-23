<script setup lang="ts">
import { useReaderState } from "~/composables/reader";
const { flow } = useReaderState();
</script>

<template>
  <section v-if="flow?.path" class="matt-path grid gap-2 p-2" aria-labelledby="matt-path-title">
    <h2 id="matt-path-title">Matt flow path</h2>
    <ol class="grid gap-2 ps-6 list-decimal marker:text-flow-state marker:font-semibold">
      <MattPathStep :step="flow.path.grill" />
      <MattPathStep :step="flow.path.spec" />
    </ol>
    <div class="grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,19rem),1fr))] gap-4">
      <div v-for="branch in flow.path.branches" :key="branch.id" class="grid content-start gap-1">
        <h3 class="eyebrow">{{ branch.id.replaceAll("-", " ") }}</h3>
        <ol class="grid gap-2 ps-6 list-decimal marker:text-flow-state marker:font-semibold" start="3">
          <MattPathStep v-for="step in branch.steps" :key="step.id" :step="step" />
        </ol>
      </div>
    </div>
  </section>
</template>

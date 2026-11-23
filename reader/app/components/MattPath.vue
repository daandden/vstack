<script setup lang="ts">
import { useReaderState } from "~/composables/reader";
const { flow } = useReaderState();
</script>

<template>
  <section v-if="flow?.path" class="matt-path grid gap-2.5 [padding-block:var(--path-padding)] [padding-inline:var(--path-padding)] border-bs-3 [border-block-start-color:var(--blue)] border-be [border-block-end-color:color-mix(in_oklch,var(--blue)_35%,var(--line))] [background:color-mix(in_oklch,var(--blue)_7%,var(--base))]" aria-labelledby="matt-path-title">
    <h2 id="matt-path-title" class="text-flow-blue">Matt flow path</h2>
    <ol class="grid gap-2.5 ps-6 list-decimal marker:text-flow-state marker:font-[650]">
      <MattPathStep :step="flow.path.grill" />
      <MattPathStep :step="flow.path.spec" />
    </ol>
    <div class="grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,19rem),1fr))] gap-4">
      <div v-for="branch in flow.path.branches" :key="branch.id" class="grid content-start gap-1.5">
        <h3 class="eyebrow">{{ branch.id.replaceAll("-", " ") }}</h3>
        <ol class="grid gap-2.5 ps-6 list-decimal marker:text-flow-state marker:font-[650]" start="3">
          <MattPathStep v-for="step in branch.steps" :key="step.id" :step="step" />
        </ol>
      </div>
    </div>
  </section>
</template>

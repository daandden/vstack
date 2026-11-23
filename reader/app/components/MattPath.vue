<script setup lang="ts">
import { useReaderState } from "~/composables/reader";
const { flow } = useReaderState();
</script>

<template>
  <section v-if="flow?.path" class="matt-path grid [inline-size:min(calc(100%_-_2_*_var(--spacing-2)),680px)] [min-inline-size:44ch] grid-cols-[5ch_minmax(0,1fr)_minmax(0,1.5fr)_14.5ch] gap-x-2 gap-y-1 m-2" aria-labelledby="matt-path-title">
    <h2 id="matt-path-title" class="col-span-full px-2">Matt flow path</h2>
    <div class="col-span-full grid grid-cols-subgrid gap-x-2 px-2 py-1 quiet" aria-hidden="true">
      <span class="col-start-2">Skill</span>
      <span>Linked Stage</span>
      <span>State</span>
    </div>
    <ol class="col-span-full grid grid-cols-subgrid gap-x-2 list-none" role="list">
      <MattPathStep :step="flow.path.grill" :number="1" />
      <MattPathStep :step="flow.path.spec" :number="2" />
    </ol>
    <template v-for="branch in flow.path.branches" :key="branch.id">
      <h3 class="col-span-full px-2 pt-2 font-sans text-small font-semibold">{{ branch.id.charAt(0).toUpperCase() + branch.id.slice(1).replaceAll("-", " ") }}</h3>
      <ol class="col-span-full grid grid-cols-subgrid gap-x-2 list-none" start="3" role="list">
        <MattPathStep v-for="(step, i) in branch.steps" :key="step.id" :step="step" :number="i + 3" />
      </ol>
    </template>
  </section>
</template>

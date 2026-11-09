<script setup lang="ts">
import { flow } from "~/composables/reader";
</script>

<template>
  <section v-if="flow?.path" class="matt-path" aria-labelledby="matt-path-title">
    <h2 id="matt-path-title">Matt flow path</h2>
    <ol class="path-steps">
      <MattPathStep :step="flow.path.grill" />
      <MattPathStep :step="flow.path.spec" />
    </ol>
    <div class="path-branches">
      <div v-for="branch in flow.path.branches" :key="branch.id" class="path-branch">
        <h3 class="eyebrow">{{ branch.id.replaceAll("-", " ") }}</h3>
        <ol class="path-steps" start="3">
          <MattPathStep v-for="step in branch.steps" :key="step.id" :step="step" />
        </ol>
      </div>
    </div>
  </section>
</template>

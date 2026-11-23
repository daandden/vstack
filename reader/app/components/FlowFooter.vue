<script setup lang="ts">
import { useReaderState } from "~/composables/reader";

const { flow } = useReaderState();
const colorMode = useColorMode();
const last = computed(() => flow.value?.lifecycle.at(-1));
const themes = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
</script>

<template>
  <footer class="grid gap-2 border-bs border-default pbs-3">
    <p v-if="last" class="text-small font-semibold text-flow-state" :data-state="last.event">
      {{ last.event === "closed" ? "Closed" : "Reopened" }} <time :datetime="last.time">{{ formatTime(last.time) }}</time>
    </p>
    <CopyFeedback />
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div class="theme flex flex-wrap gap-1" role="group" aria-label="Color theme">
        <UButton v-for="t in themes" :key="t.value" :aria-pressed="colorMode.preference === t.value" :ui="{ base: () => 'inline-flex items-center rounded border border-default bg-accented text-toned [padding-block:0.125rem] [padding-inline:0.5rem] text-[length:var(--fs-small)] font-semibold cursor-pointer touch-manipulation pointer-coarse:min-h-11 pointer-coarse:min-w-11 active:bg-[var(--surface1)] active:text-secondary aria-pressed:border-primary aria-pressed:text-primary hover:text-secondary motion-safe:transition-[color,background-color] motion-safe:duration-[130ms] motion-safe:ease-out' }" @click="colorMode.preference = t.value">{{ t.label }}</UButton>
      </div>
      <p class="quiet">Revision {{ flow?.revision }}</p>
    </div>
  </footer>
</template>

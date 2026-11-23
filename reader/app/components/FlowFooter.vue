<script setup lang="ts">
import Button from "~/components/ui/Button.vue";
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
  <footer class="grid gap-2 border-bs border-flow-line pbs-3">
    <p v-if="last" class="text-small font-semibold text-flow-state" :data-state="last.event">
      {{ last.event === "closed" ? "Closed" : "Reopened" }} <time :datetime="last.time">{{ formatTime(last.time) }}</time>
    </p>
    <CopyFeedback />
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div class="theme flex flex-wrap gap-1" role="group" aria-label="Color theme">
        <Button v-for="t in themes" :key="t.value" variant="bare" :aria-pressed="colorMode.preference === t.value" class="theme-button border border-flow-line bg-flow-muted text-small text-flow-toned font-semibold cursor-pointer touch-manipulation motion-safe:transition-[color,background-color] motion-safe:duration-[130ms] motion-safe:ease-out" @click="colorMode.preference = t.value">{{ t.label }}</Button>
      </div>
      <p class="quiet">Revision {{ flow?.revision }}</p>
    </div>
  </footer>
</template>

<style scoped>
.theme-button:active {
  background-color: var(--color-surface1);
  color: var(--color-lavender);
}

@media (hover: hover) and (pointer: fine) {
  .theme-button:hover {
    color: var(--color-lavender);
  }
}

.theme-button[aria-pressed="true"] {
  border-color: var(--color-blue);
  color: var(--color-blue);
}
</style>

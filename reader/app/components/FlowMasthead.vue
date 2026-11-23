<script setup lang="ts">
import { useReaderState } from "~/composables/reader";
import Button from "~/components/ui/Button.vue";
const { flow } = useReaderState();

const f = computed(() => flow.value!);
const colorMode = useColorMode();
const last = computed(() => f.value.lifecycle.at(-1));
const open = computed(() => f.value.next.length);
const stages = computed(() => f.value.stages.length);
const progress = computed(() => (f.value.progress.complete ? "complete" : "not complete"));
const themes = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
</script>

<template>
  <header class="masthead grid gap-1 pbe-2">
    <p v-if="f.flow.crumb" class="quiet" v-html="inline(f.flow.crumb)" />
    <h1 v-html="inline(f.flow.title)" />
    <p class="meta">
      <span v-if="last" class="font-semibold text-flow-state" :data-state="last.event">
        {{ last.event === "closed" ? "Closed" : "Reopened" }} <time :datetime="last.time" class="font-normal">{{ formatTime(last.time) }}</time>
      </span>
      <span>{{ stages }} {{ stages === 1 ? "Stage" : "Stages" }}</span>
      <span>{{ open }} open {{ open === 1 ? "question" : "questions" }}<template v-if="open"> · <kbd>n</kbd> visits them</template></span>
      <a href="#overview">Progress: {{ progress }}</a>
      <span>Revision {{ f.revision }}</span>
    </p>
    <div class="flex flex-wrap items-start gap-2">
      <CopyFeedback />
      <div class="theme flex flex-wrap gap-1" role="group" aria-label="Color theme">
        <Button v-for="t in themes" :key="t.value" variant="bare" :aria-pressed="colorMode.preference === t.value" class="theme-button border border-flow-line bg-flow-muted text-small text-flow-toned font-semibold cursor-pointer touch-manipulation motion-safe:transition-[color,background-color] motion-safe:duration-[130ms] motion-safe:ease-out" @click="colorMode.preference = t.value">{{ t.label }}</Button>
      </div>
    </div>
  </header>
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

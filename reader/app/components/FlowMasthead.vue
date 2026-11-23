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
  <header class="masthead grid gap-1.5 [padding-block:0.75rem_0.5rem]">
    <p v-if="f.flow.crumb" class="quiet" v-html="inline(f.flow.crumb)" />
    <h1 v-html="inline(f.flow.title)" />
    <p class="flex flex-wrap items-baseline gap-x-3.5 gap-y-0.5 text-small text-flow-subtext">
      <span v-if="last" class="font-semibold text-flow-state" :data-state="last.event">
        {{ last.event === "closed" ? "Closed" : "Reopened" }} <time :datetime="last.time">{{ formatTime(last.time) }}</time>
      </span>
      <span>{{ stages }} {{ stages === 1 ? "Stage" : "Stages" }}</span>
      <span>{{ open }} open {{ open === 1 ? "question" : "questions" }}<template v-if="open"> · <kbd>n</kbd> visits them</template></span>
      <a href="#overview">Progress: {{ progress }}</a>
      <span>Revision {{ f.revision }}</span>
    </p>
    <div class="theme flex flex-wrap gap-1 justify-self-start" role="group" aria-label="Color theme">
      <Button v-for="t in themes" :key="t.value" variant="bare" :aria-pressed="colorMode.preference === t.value" class="theme-button rounded-[0.25rem] border border-flow-border bg-flow-accented py-0.5 px-2 text-[length:var(--fs-small)] text-[color:var(--subtext1)] font-semibold cursor-pointer touch-manipulation motion-safe:transition-[color,background-color] motion-safe:duration-[130ms] motion-safe:ease-out" @click="colorMode.preference = t.value">{{ t.label }}</Button>
    </div>
    <CopyFeedback />
  </header>
</template>

<style scoped>
.theme-button:active {
  background-color: var(--surface1);
  color: var(--lavender);
}

@media (hover: hover) and (pointer: fine) {
  .theme-button:hover {
    color: var(--lavender);
  }
}

.theme-button[aria-pressed="true"] {
  border-color: var(--mauve);
  color: var(--mauve);
}
</style>

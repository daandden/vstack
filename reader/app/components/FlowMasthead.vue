<script setup lang="ts">
import { useReaderState } from "~/composables/reader";
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
    <p class="flex flex-wrap items-baseline gap-x-3.5 gap-y-0.5 text-small text-muted">
      <span v-if="last" class="font-semibold text-flow-state" :data-state="last.event">
        {{ last.event === "closed" ? "Closed" : "Reopened" }} <time :datetime="last.time">{{ formatTime(last.time) }}</time>
      </span>
      <span>{{ stages }} {{ stages === 1 ? "Stage" : "Stages" }}</span>
      <span>{{ open }} open {{ open === 1 ? "question" : "questions" }}<template v-if="open"> · <kbd>n</kbd> visits them</template></span>
      <a href="#overview">Progress: {{ progress }}</a>
      <span>Revision {{ f.revision }}</span>
    </p>
    <div class="theme flex flex-wrap gap-1 justify-self-start" role="group" aria-label="Color theme">
      <UButton v-for="t in themes" :key="t.value" :aria-pressed="colorMode.preference === t.value" :ui="{ base: () => 'inline-flex items-center rounded border border-default bg-accented text-toned [padding-block:0.125rem] [padding-inline:0.5rem] text-[length:var(--fs-small)] font-semibold cursor-pointer touch-manipulation active:bg-[var(--surface1)] active:text-secondary aria-pressed:border-primary aria-pressed:text-primary hover:text-secondary motion-safe:transition-[color,background-color] motion-safe:duration-[130ms] motion-safe:ease-out' }" @click="colorMode.preference = t.value">{{ t.label }}</UButton>
    </div>
    <CopyFeedback />
  </header>
</template>

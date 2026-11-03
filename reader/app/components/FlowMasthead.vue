<script setup lang="ts">
import { flow } from "~/composables/reader";
import { theme, type Theme } from "~/composables/theme";

const f = computed(() => flow.value!);
const last = computed(() => f.value.lifecycle.at(-1));
const open = computed(() => f.value.next.length);
const stages = computed(() => f.value.stages.length);
const progress = computed(() => (f.value.progress.complete ? "complete" : "not complete"));
const themes: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
</script>

<template>
  <header class="masthead">
    <p v-if="f.flow.crumb" class="quiet" v-html="inline(f.flow.crumb)" />
    <h1 v-html="inline(f.flow.title)" />
    <p class="meta">
      <span v-if="last" class="lifecycle" :data-state="last.event">
        {{ last.event === "closed" ? "Closed" : "Reopened" }} <time :datetime="last.time">{{ formatTime(last.time) }}</time>
      </span>
      <span>{{ stages }} {{ stages === 1 ? "Stage" : "Stages" }}</span>
      <span>{{ open }} open {{ open === 1 ? "question" : "questions" }}<template v-if="open"> · <kbd>n</kbd> visits them</template></span>
      <a href="#overview">Progress: {{ progress }}</a>
      <span>Revision {{ f.revision }}</span>
    </p>
    <div class="theme" role="group" aria-label="Color theme">
      <button v-for="t in themes" :key="t.value" type="button" :aria-pressed="theme === t.value" @click="theme = t.value">{{ t.label }}</button>
    </div>
  </header>
</template>

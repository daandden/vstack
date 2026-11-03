<script setup lang="ts">
import { flow } from "~/composables/reader";
import { current, treeOpen } from "~/composables/navigation";
import { blockLabel } from "~/utils/flow";

const f = computed(() => flow.value!);
const blocks = computed(() => [...f.value.reading.historical, ...f.value.reading.publications]);
const at = ref<string>();
watch(current, (id) => {
  at.value = (id ? document.getElementById(id)?.closest<HTMLElement>("[data-block]")?.dataset.reading : undefined) ?? undefined;
});
</script>

<template>
  <details class="outline">
    <summary>On this page</summary>
    <nav class="jump-row" aria-label="Reading sequence">
      <a v-for="b in blocks" :key="b.id" :href="`#${b.id}`" :aria-current="at === b.id ? 'location' : undefined">{{ blockLabel(f, b) }}</a>
    </nav>
    <p class="meta">
      <a href="#overview">Overview and progress</a>
      <a v-if="f.topics.length" href="#topics">Topic notes</a>
      <button v-if="f.stages.length" type="button" class="link" aria-haspopup="dialog" aria-keyshortcuts="t" @click="treeOpen = true">Stages <kbd>t</kbd></button>
    </p>
    <p class="quiet">Keys: <kbd>j</kbd> <kbd>k</kbd> next and previous section, <kbd>h</kbd> <kbd>l</kbd> previous and next entry, <kbd>n</kbd> next open question, <kbd>t</kbd> Stages.</p>
  </details>
</template>

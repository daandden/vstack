<script setup lang="ts">
import { flow } from "~/composables/reader";
import { current, measureHeader, tab, treeOpen } from "~/composables/navigation";
import { blockLabel } from "~/utils/flow";

const f = computed(() => flow.value!);
const blocks = computed(() => [...f.value.reading.historical, ...f.value.reading.publications]);
const jumps = computed<{ id: string; label: string }[]>(() => {
  if (tab.value === "overview") return [{ id: "progress", label: "Progress" }, { id: "observations", label: "Observations" }, { id: "overview-stages", label: "Stages" }];
  if (tab.value === "topics") return f.value.topics.map((t) => ({ id: t.id, label: t.title }));
  return blocks.value.filter((b) => b.stage === tab.value).map((b) => ({ id: b.id, label: blockLabel(f.value, b) }));
});
const at = ref<string>();
watch([current, jumps], ([id]) => {
  const el = id ? document.getElementById(id) : null;
  const owner = el?.closest<HTMLElement>("[data-block]")?.dataset.reading;
  at.value = owner ?? jumps.value.find((j) => el && document.getElementById(j.id)?.contains(el))?.id;
});

const bar = ref<HTMLElement>();
let sizing: ResizeObserver | undefined;
onMounted(() => {
  measureHeader();
  sizing = new ResizeObserver(measureHeader);
  sizing.observe(bar.value!);
});
onBeforeUnmount(() => sizing?.disconnect());
</script>

<template>
  <nav ref="bar" class="bar" aria-label="Flow tabs">
    <ul class="tabs">
      <li><a href="#overview" :aria-current="tab === 'overview' ? 'page' : undefined">Overview</a></li>
      <li v-for="st in f.stages" :key="st.id" :data-state="st.state">
        <a :href="`#${st.id}`" :aria-current="tab === st.id ? 'page' : undefined"><span class="dot" />{{ st.label }}</a>
      </li>
      <li v-if="f.topics.length"><a href="#topics" :aria-current="tab === 'topics' ? 'page' : undefined">Topics</a></li>
      <li v-if="f.stages.length">
        <button type="button" class="link" aria-haspopup="dialog" aria-keyshortcuts="t" @click="treeOpen = true">Stages <kbd>t</kbd></button>
      </li>
    </ul>
    <nav v-if="jumps.length" class="jump-row" aria-label="In this tab">
      <a v-for="j in jumps" :key="j.id" :href="`#${j.id}`" :aria-current="at === j.id ? 'location' : undefined" v-html="inline(j.label)" />
    </nav>
  </nav>
</template>

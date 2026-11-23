<script setup lang="ts">
import { useReaderState } from "~/composables/reader";
import Button from "~/components/ui/Button.vue";
import { current, mapOpen, mapTab, measureHeader, tab } from "~/composables/navigation";
import { blockLabel } from "~/utils/flow";
import { inlineLinkLabel } from "~/utils/format";

const { flow } = useReaderState();
const tabLink = "tab-link reader-control inline-flex items-center gap-1 py-0.5 font-semibold no-underline text-flow-toned";
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

const bar = useTemplateRef<HTMLElement>("bar");
useResizeObserver(bar, measureHeader);
onMounted(measureHeader);
</script>

<template>
  <nav ref="bar" class="bar sticky [inset-block-start:0] z-1 grid [grid-column:1/-1]! [grid-template-columns:subgrid] gap-y-1 py-1 border-be border-flow-line bg-flow-base [&>*]:[grid-column:2]" aria-label="Flow tabs">
    <ul class="tabs flex flex-wrap items-center gap-1 m-0 p-0 list-none">
      <li><a href="#overview" :aria-current="tab === 'overview' ? 'page' : undefined" :class="tabLink">Overview</a></li>
      <li v-for="st in f.stages" :key="st.id" :data-state="st.state">
        <a :href="`#${st.id}`" :aria-current="tab === st.id ? 'page' : undefined" :class="tabLink"><span aria-hidden="true" class="size-2 shrink-0 rounded-full" :class="st.state === 'finished' ? 'bg-flow-green' : st.state === 'in-progress' ? 'bg-flow-peach' : 'bg-flow-dimmed'" />{{ st.label }}</a>
      </li>
      <li v-if="f.topics.length"><a href="#topics" :aria-current="tab === 'topics' ? 'page' : undefined" :class="tabLink">Topics</a></li>
      <li v-if="f.stages.length">
        <Button id="stages-map-trigger" variant="bare" class="map-trigger gap-1 cursor-pointer touch-manipulation text-flow-blue underline underline-offset-[0.2em]" aria-haspopup="dialog" aria-keyshortcuts="m" @click="mapTab = 'stages'; mapOpen = true">Stages <kbd>m</kbd></Button>
      </li>
    </ul>
    <nav v-if="jumps.length" class="jump-row flex flex-wrap gap-x-2 gap-y-1 border-bs border-flow-line text-small" aria-label="In this tab">
      <a v-for="j in jumps" :key="j.id" :href="`#${j.id}`" :aria-current="at === j.id ? 'location' : undefined" class="jump-link inline-flex min-h-6 items-center px-1 text-flow-toned no-underline tabular-nums" v-html="inlineLinkLabel(j.label)" />
    </nav>
  </nav>
</template>

<style scoped>
:is(.tab-link, .jump-link, .map-trigger):active {
  color: var(--color-lavender);
}

@media (hover: hover) and (pointer: fine) {
  :is(.tab-link, .jump-link, .map-trigger):hover {
    color: var(--color-lavender);
  }
}

.tab-link[aria-current="page"] {
  background-color: var(--color-surface0);
  color: var(--color-blue);
}

.jump-link[aria-current="location"] {
  color: var(--color-blue);
  text-decoration-line: underline;
}
</style>

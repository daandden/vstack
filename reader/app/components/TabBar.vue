<script setup lang="ts">
import { useReaderState } from "~/composables/reader";
import Button from "~/components/ui/Button.vue";
import { current, mapOpen, mapTab, measureHeader, tab } from "~/composables/navigation";
import { blockLabel } from "~/utils/flow";
import { inlineLinkLabel } from "~/utils/format";

const { flow } = useReaderState();
const tabLink = "tab-link u-inline-flex u-items-center u-gap-1.5 u-py-0.5 u-px-1.5 u-rounded-[0.25rem] u-font-semibold u-no-underline u-text-[color:var(--subtext1)]";
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
  <nav ref="bar" class="bar sticky [inset-block-start:0] z-1 grid [grid-column:1/-1]! [grid-template-columns:subgrid] gap-y-1.5 [padding-block:0.5rem] border-be border-default bg-default [&>*]:[grid-column:2]" aria-label="Flow tabs">
    <ul class="tabs flex flex-wrap items-center gap-x-2 gap-y-1 m-0 p-0 list-none">
      <li><a href="#overview" :aria-current="tab === 'overview' ? 'page' : undefined" :class="tabLink">Overview</a></li>
      <li v-for="st in f.stages" :key="st.id" :data-state="st.state">
        <a :href="`#${st.id}`" :aria-current="tab === st.id ? 'page' : undefined" :class="tabLink"><span aria-hidden="true" class="u-size-2 u-shrink-0 u-rounded-full" :class="st.state === 'finished' ? 'u-bg-flow-green' : st.state === 'in-progress' ? 'u-bg-flow-peach' : 'u-bg-flow-dimmed'" />{{ st.label }}</a>
      </li>
      <li v-if="f.topics.length"><a href="#topics" :aria-current="tab === 'topics' ? 'page' : undefined" :class="tabLink">Topics</a></li>
      <li v-if="f.stages.length">
        <Button id="stages-map-trigger" variant="bare" class="map-trigger u-gap-1 u-cursor-pointer u-touch-manipulation u-text-flow-blue u-underline u-underline-offset-[0.2em]" aria-haspopup="dialog" aria-keyshortcuts="m" @click="mapTab = 'stages'; mapOpen = true">Stages <kbd>m</kbd></Button>
      </li>
    </ul>
    <nav v-if="jumps.length" class="jump-row flex flex-wrap gap-x-3 gap-y-0.5 [padding-block-start:0.375rem] [padding-inline:0.375rem] border-bs border-muted" aria-label="In this tab">
      <a v-for="j in jumps" :key="j.id" :href="`#${j.id}`" :aria-current="at === j.id ? 'location' : undefined" class="jump-link u-text-[color:var(--subtext1)] u-no-underline u-tabular-nums" v-html="inlineLinkLabel(j.label)" />
    </nav>
  </nav>
</template>

<style scoped>
:is(.tab-link, .jump-link, .map-trigger):active {
  color: var(--lavender);
}

@media (hover: hover) and (pointer: fine) {
  :is(.tab-link, .jump-link, .map-trigger):hover {
    color: var(--lavender);
  }
}

.tab-link[aria-current="page"] {
  background-color: var(--surface0);
  color: var(--mauve);
}

.jump-link[aria-current="location"] {
  color: var(--mauve);
  text-decoration-line: underline;
}
</style>

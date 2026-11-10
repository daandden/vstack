<script setup lang="ts">
import { flow } from "~/composables/reader";
import { current, mapOpen, mapTab, measureHeader, tab } from "~/composables/navigation";
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

const bar = useTemplateRef<HTMLElement>("bar");
useResizeObserver(bar, measureHeader);
onMounted(measureHeader);
</script>

<template>
  <nav ref="bar" class="bar sticky [inset-block-start:0] z-1 grid [grid-column:1/-1]! [grid-template-columns:subgrid] gap-y-1.5 [padding-block:0.5rem] border-be border-default bg-default [&>*]:[grid-column:2]" aria-label="Flow tabs">
    <ul class="tabs flex flex-wrap items-center gap-x-2 gap-y-1 m-0 p-0 list-none">
      <li><ULink raw href="#overview" external :aria-current="tab === 'overview' ? 'page' : undefined" class="inline-flex items-center gap-1.5 [padding-block:0.125rem] [padding-inline:0.375rem] rounded font-semibold no-underline text-toned aria-[current]:bg-accented aria-[current]:text-primary active:text-secondary hover:text-secondary">Overview</ULink></li>
      <li v-for="st in f.stages" :key="st.id" :data-state="st.state">
        <ULink raw :href="`#${st.id}`" external :aria-current="tab === st.id ? 'page' : undefined" class="inline-flex items-center gap-1.5 [padding-block:0.125rem] [padding-inline:0.375rem] rounded font-semibold no-underline text-toned aria-[current]:bg-accented aria-[current]:text-primary active:text-secondary hover:text-secondary"><span aria-hidden="true" class="size-2 shrink-0 rounded-full" :class="st.state === 'finished' ? 'bg-success' : st.state === 'in-progress' ? 'bg-warning' : 'bg-dimmed'" />{{ st.label }}</ULink>
      </li>
      <li v-if="f.topics.length"><ULink raw href="#topics" external :aria-current="tab === 'topics' ? 'page' : undefined" class="inline-flex items-center gap-1.5 [padding-block:0.125rem] [padding-inline:0.375rem] rounded font-semibold no-underline text-toned aria-[current]:bg-accented aria-[current]:text-primary active:text-secondary hover:text-secondary">Topics</ULink></li>
      <li v-if="f.stages.length">
        <UButton class="link" :ui="{ base: () => 'inline-flex items-center gap-1 [padding-block:0] [padding-inline:0] border-0 bg-transparent font-normal text-info underline underline-offset-[0.2em] cursor-pointer touch-manipulation active:text-secondary hover:text-secondary' }" aria-haspopup="dialog" aria-keyshortcuts="m" @click="mapTab = 'stages'; mapOpen = true">Stages <kbd>m</kbd></UButton>
      </li>
    </ul>
    <nav v-if="jumps.length" class="jump-row flex flex-wrap gap-x-3 gap-y-0.5 [padding-block-start:0.375rem] [padding-inline:0.375rem] border-bs border-muted" aria-label="In this tab">
      <ULink v-for="j in jumps" :key="j.id" raw :href="`#${j.id}`" external :aria-current="at === j.id ? 'location' : undefined" class="text-toned no-underline tabular-nums aria-[current]:text-primary aria-[current]:underline active:text-secondary hover:text-secondary" v-html="inline(j.label)" />
    </nav>
  </nav>
</template>

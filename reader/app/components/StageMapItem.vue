<script setup lang="ts">
import { useReaderState } from "~/composables/reader";
import { tab } from "~/composables/navigation";
import { stageWorkName, type StageView } from "~/utils/flow";

const { flow } = useReaderState();
const { stage } = defineProps<{ stage: StageView }>();
const parent = computed(() => stage.parent ? flow.value!.stage.get(stage.parent) : undefined);
const name = computed(() => {
  const work = stageWorkName(flow.value!, stage);
  return work === stage.label ? stage.label : `${stage.label} · ${work}`;
});
</script>

<template>
  <li class="grid grid-cols-[1fr_auto] gap-x-3 items-baseline" :data-state="stage.state">
    <a class="inline-flex gap-2 items-center min-h-control wrap-anywhere text-flow-blue font-semibold no-underline" :href="`#${stage.id}`" data-map-item :aria-description="parent ? `Parent Stage: ${parent.label}` : undefined" :aria-current="tab === stage.id ? 'page' : undefined">
      <span aria-hidden="true" class="shrink-0 size-1.5 rounded-full bg-flow-state" /><span dir="auto">{{ name }}</span>
    </a>
    <span class="quiet"><span class="text-flow-state font-semibold">{{ STATE_LABELS[stage.state] }}</span> · {{ stage.open_questions }} open</span>
  </li>
</template>

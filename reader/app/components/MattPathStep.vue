<script setup lang="ts">
import type { View } from "#flow/model.ts";
import { useReaderState } from "~/composables/reader";
const { flow } = useReaderState();

defineProps<{ step: NonNullable<View["path"]>["grill"] }>();
const states = { finished: "Finished", "in-progress": "In progress", "to-come": "To come", "not-run": "Not run", "not-started": "Not started" };
const f = computed(() => flow.value!);
const label = (id: string) => f.value.stage.get(id)?.label ?? id;
</script>

<template>
  <li class="ps-1" :data-path-step="step.id" :data-state="step.state" :aria-current="step.state === 'in-progress' ? 'step' : undefined" data-map-item tabindex="-1">
    <div class="path-step-heading flex flex-wrap items-baseline gap-x-3 gap-y-0.5 [&>:first-child]:font-[650]"><span>{{ step.skills.join(" or ") }}</span><span class="text-flow-state text-small">{{ states[step.state] }}</span></div>
    <ul v-if="step.stages.length" class="path-stages grid gap-0.5 list-none p-0">
      <li v-for="stage in step.stages" :key="stage.id" class="flex flex-wrap gap-x-3 gap-y-0.5 items-center" :data-state="stage.state">
        <a class="reader-control inline-flex items-center wrap-anywhere text-small" :href="`#${stage.id}`">{{ label(stage.id) }}</a><span class="text-flow-state text-small">{{ states[stage.state] }}</span>
      </li>
    </ul>
  </li>
</template>

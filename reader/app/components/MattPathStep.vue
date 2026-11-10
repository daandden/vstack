<script setup lang="ts">
import type { View } from "#flow/model.ts";
import { flow } from "~/composables/reader";

defineProps<{ step: NonNullable<View["path"]>["grill"] }>();
const states = { finished: "Finished", "in-progress": "In progress", "to-come": "To come", "not-run": "Not run", "not-started": "Not started" };
const f = computed(() => flow.value!);
const label = (id: string) => f.value.stage.get(id)?.label ?? id;
</script>

<template>
  <li class="ps-1 aria-[current=step]:[padding-block:0.375rem] aria-[current=step]:[padding-inline:0.5rem] aria-[current=step]:border aria-[current=step]:border-warning aria-[current=step]:rounded aria-[current=step]:[background:color-mix(in_oklch,var(--peach)_9%,var(--base))]" :data-path-step="step.id" :data-state="step.state" :aria-current="step.state === 'in-progress' ? 'step' : undefined" data-map-item tabindex="-1">
    <div class="path-step-heading flex flex-wrap items-baseline gap-x-3 gap-y-0.5 [&>:first-child]:font-[650]"><span>{{ step.skills.join(" or ") }}</span><span class="text-flow-state text-small">{{ states[step.state] }}</span></div>
    <ul v-if="step.stages.length" class="path-stages grid gap-0.5 list-none p-0">
      <li v-for="stage in step.stages" :key="stage.id" class="flex flex-wrap gap-x-3 gap-y-0.5 items-center" :data-state="stage.state">
        <a class="inline-flex items-center [min-block-size:44px] [min-inline-size:44px] [padding-inline:0.25rem] wrap-anywhere text-small" :href="`#${stage.id}`">{{ label(stage.id) }}</a><span class="text-flow-state text-small">{{ states[stage.state] }}</span>
      </li>
    </ul>
  </li>
</template>

<script setup lang="ts">
import type { View } from "#flow/model.ts";
import { useReaderState } from "~/composables/reader";
const { flow } = useReaderState();

const { step } = defineProps<{ step: NonNullable<View["path"]>["grill"]; number: number }>();
const states = { finished: "Finished", "in-progress": "In progress", "to-come": "To come", "not-run": "Not run", "not-started": "Not started" };
const groups = computed(() => {
  const byState = new Map<keyof typeof states, { id: string; label: string }[]>();
  for (const stage of step.stages) {
    const link = { id: stage.id, label: flow.value?.stage.get(stage.id)?.label ?? stage.id };
    const group = byState.get(stage.state);
    if (group) group.push(link);
    else byState.set(stage.state, [link]);
  }
  if (!byState.has(step.state)) byState.set(step.state, []);
  return byState;
});
</script>

<template>
  <li class="col-span-full grid grid-cols-subgrid items-start gap-x-2 border-be border-flow-line px-2 py-1" :data-path-step="step.id" :data-state="step.state" :aria-current="step.state === 'in-progress' ? 'step' : undefined" data-map-item tabindex="-1">
    <span class="quiet flex min-h-control items-center tabular-nums" aria-hidden="true">{{ number }}</span>
    <span class="flex min-h-control items-center wrap-anywhere font-semibold">{{ step.skills.join(" or ") }}</span>
    <template v-for="[state, links] in groups" :key="state">
      <div class="col-start-3 flex flex-col">
        <a v-for="link in links" :key="link.id" class="reader-control -ms-2 inline-flex w-fit max-w-[calc(100%_+_var(--spacing-2))] items-center wrap-anywhere no-underline @hover:underline" :href="`#${link.id}`" :aria-description="states[state]" dir="auto">{{ link.label }}</a>
        <span v-if="!links.length" class="quiet flex min-h-control items-center"><span class="sr-only">No linked Stage</span><span aria-hidden="true">—</span></span>
      </div>
      <span class="col-start-4 flex min-h-control items-center whitespace-nowrap text-small text-flow-state" :data-state="state">{{ states[state] }}</span>
    </template>
  </li>
</template>

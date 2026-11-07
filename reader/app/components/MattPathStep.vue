<script setup lang="ts">
import type { View } from "#flow/model.ts";
import { flow } from "~/composables/reader";

defineProps<{ step: NonNullable<View["path"]>["grill"] }>();
const states = { finished: "Finished", "in-progress": "In progress", "to-come": "To come", "not-run": "Not run", "not-started": "Not started" };
const f = computed(() => flow.value!);
const label = (id: string) => f.value.stage.get(id)?.label ?? id;
</script>

<template>
  <li :data-path-step="step.id" :data-state="step.state" :aria-current="step.state === 'in-progress' ? 'step' : undefined">
    <div class="path-step-heading"><span>{{ step.skills.join(" or ") }}</span><span class="path-state">{{ states[step.state] }}</span></div>
    <ul v-if="step.stages.length" class="path-stages">
      <li v-for="stage in step.stages" :key="stage.id" :data-state="stage.state">
        <a :href="`#${stage.id}`">{{ label(stage.id) }}</a><span class="path-state">{{ states[stage.state] }}</span>
      </li>
    </ul>
  </li>
</template>

<script setup lang="ts">
import { flow } from "~/composables/reader";
import type { StageView } from "~/utils/flow";

const props = defineProps<{ stage: StageView }>();
const children = computed(() => flow.value!.stages.filter((s) => s.parent === props.stage.id));
</script>

<template>
  <li :data-state="stage.state">
    <a :href="`#${stage.id}`" data-map-item><span class="dot" />{{ stage.label }}</a>
    <span class="quiet"><span class="state">{{ STATE_LABELS[stage.state] }}</span> · {{ stage.open_questions }} open</span>
    <ul v-if="children.length"><StageTreeNode v-for="c in children" :key="c.id" :stage="c" /></ul>
  </li>
</template>

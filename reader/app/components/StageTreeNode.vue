<script setup lang="ts">
import { flow } from "~/composables/reader";
import type { StageView } from "~/utils/flow";

const props = defineProps<{ stage: StageView }>();
const children = computed(() => flow.value!.stages.filter((s) => s.parent === props.stage.id));
</script>

<template>
  <li class="grid grid-cols-[auto_1fr] gap-x-3 items-baseline" :data-state="stage.state">
    <a class="inline-flex gap-2 items-center text-primary font-semibold no-underline" :href="`#${stage.id}`"><span class="shrink-0 [inline-size:0.4375rem] [block-size:0.4375rem] rounded-full bg-flow-state" />{{ stage.label }}</a>
    <span class="quiet"><span class="text-flow-state font-semibold">{{ STATE_LABELS[stage.state] }}</span> · {{ stage.open_questions }} open</span>
    <ul v-if="children.length" class="col-span-full grid gap-1 list-none mbs-1 ms-1 ps-4 border-s border-default"><StageTreeNode v-for="c in children" :key="c.id" :stage="c" /></ul>
  </li>
</template>

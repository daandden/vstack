<script setup lang="ts">
import { useMapEdges } from "~/composables/mapEdges";
import type { StageView } from "~/utils/flow";
import { STATE_LABELS } from "~/utils/format";

const { stages } = defineProps<{ stages: StageView[] }>();
const graph = useTemplateRef<HTMLElement>("graph");
const arrow = useId();
const layout = computed(() => {
  const byId = new Map(stages.map(stage => [stage.id, stage]));
  const children = new Map<string, StageView[]>();
  for (const stage of stages) {
    if (!stage.parent) continue;
    const siblings = children.get(stage.parent);
    if (siblings) siblings.push(stage);
    else children.set(stage.parent, [stage]);
  }
  const cards: { stage: StageView; parent?: StageView; column: number; row: string }[] = [];
  let nextRow = 1;
  let columns = 1;
  function place(stage: StageView, column: number, parent?: StageView) {
    const firstRow = nextRow;
    const card = { stage, parent, column, row: "" };
    cards.push(card);
    columns = Math.max(columns, column);
    const descendants = children.get(stage.id);
    if (descendants) for (const child of descendants) place(child, column + 1, stage);
    else nextRow++;
    card.row = `${firstRow} / ${nextRow}`;
  }
  for (const stage of stages) if (!stage.parent || !byId.has(stage.parent)) place(stage, 1);
  return { cards, columns };
});
const edges = useMapEdges(graph, () => layout.value.cards.flatMap(({ stage, parent }) =>
  parent ? [{ from: parent.id, to: stage.id }] : [],
), "data-stage-node");
</script>

<template>
  <p v-if="!stages.length" class="quiet p-2">No Stages recorded.</p>
  <div v-else ref="graph" class="relative [inline-size:max-content] p-2">
    <svg class="pointer-events-none absolute inset-0 size-full text-flow-subtext" aria-hidden="true">
      <defs><marker :id="arrow" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path fill="currentColor" d="M0 0L8 4L0 8z" /></marker></defs>
      <path v-for="edge in edges" :key="edge.to" :data-parent="edge.from" :data-child="edge.to" :d="edge.path" :marker-end="`url(#${arrow})`" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" />
    </svg>
    <ol class="relative grid list-none items-center gap-x-10 gap-y-9" :style="{ gridTemplateColumns: `repeat(${layout.columns}, 180px)` }" aria-label="Stage cards" role="list">
      <li v-for="card in layout.cards" :key="card.stage.id" class="relative grid min-h-17 content-start gap-1 rounded-sm border border-flow-line bg-flow-base p-2" :data-stage-node="card.stage.id" :data-state="card.stage.state" :style="{ gridColumn: card.column, gridRow: card.row }">
        <a class="flex min-h-control items-center wrap-anywhere no-underline after:absolute after:inset-0 @hover:underline active:text-flow-lavender" data-map-item :href="`#${card.stage.id}`" :aria-description="card.parent ? `Parent Stage: ${card.parent.label}` : undefined" dir="auto">{{ card.stage.label }}</a>
        <p class="quiet tabular-nums"><span class="font-semibold text-flow-state">{{ STATE_LABELS[card.stage.state] }}</span> · {{ card.stage.open_questions }} open</p>
      </li>
    </ol>
  </div>
</template>

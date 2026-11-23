<script setup lang="ts">
import { useReaderState } from "~/composables/reader";
import type { ReadingBlock, StageView } from "~/utils/flow";

const { flow } = useReaderState();
const props = defineProps<{ stage: StageView; blocks: (ReadingBlock & { position?: number })[] }>();

type Block = (typeof props.blocks)[number];
type Round = Extract<StageView["items"][number], { type: "round" }>["round"];
type Section =
  | { type: "round"; id: string; round: Round; blocks: Block[]; numbers: number[] }
  | { type: "assumed"; id: string; blocks: Block[] }
  | { type: "entry"; id: string; block: Block };

const sections = computed(() => {
  const rounds = new Map<string, Round>();
  for (const item of props.stage.items) if (item.type === "round") rounds.set(item.round.id, item.round);
  const ordered: Section[] = [];
  for (const block of props.blocks) {
    const previous = ordered.at(-1);
    if (block.kind === "assumed") {
      if (previous?.type === "assumed") previous.blocks.push(block);
      else ordered.push({ type: "assumed", id: block.id, blocks: [block] });
      continue;
    }
    const question = block.kind === "question" ? flow.value!.question.get(block.id) : undefined;
    const round = question && rounds.get(question.round);
    if (!question || !round) {
      ordered.push({ type: "entry", id: block.id, block });
      continue;
    }
    if (previous?.type === "round" && previous.id === round.id) {
      previous.blocks.push(block);
      previous.numbers.push(question.q);
    } else ordered.push({ type: "round", id: round.id, round, blocks: [block], numbers: [question.q] });
  }
  return ordered;
});
</script>

<template>
  <template v-for="part in sections" :key="part.id">
    <section v-if="part.type === 'round'" :aria-labelledby="`${part.id}-title`" class="entry grid pbs-entry [&+.entry]:border-bs [&+.entry]:border-flow-line">
      <RoundHeader :round="part.round" :numbers="part.numbers" />
      <ReadingEntry v-for="b in part.blocks" :key="b.id" :block="b" :position="b.position" />
    </section>
    <details v-else-if="part.type === 'assumed'" :id="`${part.id}-batch`" class="entry py-1 [&+.entry]:border-bs [&+.entry]:border-flow-line" data-reading-fold data-stop>
      <summary class="min-h-8 py-1 [overflow-wrap:anywhere]">
        <span class="text-flow-text">{{ part.blocks.length }} {{ part.blocks.length === 1 ? "decision" : "decisions" }} the agent made</span>
        <span class="text-small font-normal text-flow-subtext"> · To reopen one, name it in a picker note.</span>
      </summary>
      <ReadingEntry v-for="b in part.blocks" :key="b.id" :block="b" :position="b.position" />
    </details>
    <ReadingEntry v-else :block="part.block" :position="part.block.position" />
  </template>
</template>

<script setup lang="ts">
import { useReaderState } from "~/composables/reader";
const { flow } = useReaderState();
import type { ReadingBlock } from "~/utils/flow";

const props = defineProps<{ block: ReadingBlock; position?: number }>();
const f = computed(() => flow.value!);
const st = computed(() => (props.block.stage ? f.value.stage.get(props.block.stage) : undefined));
const question = computed(() => (props.block.kind === "question" ? f.value.question.get(props.block.id) : undefined));
const round = computed(() => {
  const q = question.value;
  if (!q) return undefined;
  const item = st.value?.items.find((i) => i.type === "round" && i.round.id === q.round);
  return item?.type === "round" ? { round: item.round, first: item.questions[0]?.id === q.id } : undefined;
});
const result = computed(() => (props.block.kind === "result" ? st.value?.results.find((r) => r.id === props.block.id) : undefined));
const topic = computed(() => (props.block.kind === "topic" ? f.value.topics.find((t) => t.id === props.block.id) : undefined));
const assumed = computed(() => (props.block.kind === "assumed" ? st.value?.assumed.find((a) => a.id === props.block.id) : undefined));
const reading = computed(() => (props.block.kind === "reading" ? st.value?.readings.find(r => r.id === props.block.id) : undefined));
const close = computed(() => {
  const item = props.block.kind === "close" ? st.value?.items.find((i) => i.type === "close" && i.close.id === props.block.id) : undefined;
  return item?.type === "close" ? item.close : undefined;
});
const ordinal = computed(() => (props.position === undefined ? undefined : String(props.position).padStart(2, "0")));
</script>

<template>
  <div class="entry grid gap-2 [padding-block:var(--entry-space)] [&+.entry]:border-bs [&+.entry]:border-muted" data-block :data-reading="block.id" :data-position="position" :data-historical="position === undefined ? '' : undefined">
    <p class="meta">
      <span v-if="ordinal" class="text-toned font-bold tabular-nums" :title="`First published at position ${position}`">{{ ordinal }}</span>
      <span v-if="round" :id="round.first ? round.round.id : undefined">
        <template v-if="round.round.session !== undefined">Session {{ round.round.session }}, </template>Round {{ round.round.n }}
        <time v-if="round.round.time" :datetime="round.round.time">{{ formatTime(round.round.time) }}</time>
      </span>
      <span v-else-if="result">{{ SHAPE_LABELS[result.demo ? "demo" : result.shape] ?? result.shape }} · revision {{ result.revision }}</span>
      <span v-else-if="topic">Topic note</span>
      <span v-else-if="block.kind === 'background'">Background</span>
      <span v-else-if="assumed">Assumed pick</span>
      <span v-else-if="reading">Corrected answer reading</span>
      <span v-else-if="close">Summary</span>
    </p>
    <QuestionBlock v-if="question" :q="question" />
    <ResultBlock v-else-if="result" :r="result" />
    <BackgroundBlock v-else-if="block.kind === 'background' && st?.background" :bg="st.background" />
    <TopicBlock v-else-if="topic" :topic="topic" />
    <AssumedBlock v-else-if="assumed && st" :a="assumed" :first="st.assumed[0]?.id === assumed.id" :stage="st.id" />
    <AnswerReadingBlock v-else-if="reading" :note="reading" />
    <SummaryBlock v-else-if="close && st" :close="close" :stage="st" />
  </div>
</template>

<script setup lang="ts">
import { useReaderState } from "~/composables/reader";
import { readingAge, useReadingClock } from "~/composables/reading-clock";
import { foldedQuestionOutcome, questionHasConcern, stageWorkName, type QuestionView } from "~/utils/flow";
import { inlineLinkLabel } from "~/utils/format";

const { flow } = useReaderState();
const now = useReadingClock();
const sentences = new Intl.Segmenter("en", { granularity: "sentence" });
const groups = computed(() => {
  const f = flow.value!;
  const queued = new Map<string, QuestionView[]>();
  for (const id of f.next) {
    const q = f.question.get(id);
    if (!q) continue;
    const group = queued.get(q.stage);
    if (group) group.push(q);
    else queued.set(q.stage, [q]);
  }
  return [...queued].map(([id, questions]) => {
    const stage = f.stage.get(id)!;
    const rounds = new Map(stage.items.flatMap(item => item.type === "round" ? [[item.round.id, item.round] as const] : []));
    return {
      stage,
      name: stageWorkName(f, stage),
      decisions: questions.map(q => {
        const round = rounds.get(q.round);
        const lead = (q.brief ? round?.now : undefined) ?? sentences.segment(q.description.trim())[Symbol.iterator]().next().value?.segment.trim();
        const status = q.answer.state !== "open" ? foldedQuestionOutcome(q) : questionHasConcern(f, q) ? "Concern" : "Open";
        const time = round?.time;
        const timestamp = time ? Date.parse(time) : NaN;
        return { q, lead, status, timestamp, time: Number.isFinite(timestamp) ? time : undefined };
      }),
    };
  });
});
</script>

<template>
  <section id="overview:decisions" class="grid gap-3 min-w-0 wrap-anywhere" data-stop aria-labelledby="overview:decisions-title">
    <h3 id="overview:decisions-title">Open decisions</h3>
    <p v-if="!groups.length" class="quiet">No open decisions.</p>
    <section v-for="group in groups" :key="group.stage.id" class="grid gap-1">
      <h4 class="font-semibold" dir="auto">{{ group.name }} <span v-if="group.name !== group.stage.label" class="quiet">{{ group.stage.label }}</span></h4>
      <ol class="grid list-none divide-y divide-flow-line rounded-md border border-flow-line bg-flow-muted">
        <li v-for="{ q, lead, status, time, timestamp } in group.decisions" :key="q.id" class="grid gap-1 px-3 py-2">
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <a :href="`#${q.id}`" class="font-semibold" dir="auto" v-html="inlineLinkLabel(q.title)" />
            <span class="quiet" :class="status === 'Open' ? '' : 'font-semibold text-flow-peach'">{{ status }}</span>
            <time v-if="time" :datetime="time" :title="eventTime(time)">{{ readingAge(timestamp, now) }}</time>
          </div>
          <p v-if="lead" class="text-flow-toned" dir="auto" v-html="inline(lead)" />
        </li>
      </ol>
    </section>
  </section>
</template>

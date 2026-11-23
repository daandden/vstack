<script setup lang="ts">
import { useReaderState } from "~/composables/reader";
import type { StageView } from "~/utils/flow";

const { flow } = useReaderState();
const groups = computed(() => {
  const waiting: StageView[] = [];
  const other: StageView[] = [];
  const finished = new Map<string, StageView[]>();
  for (const stage of flow.value!.stages) {
    if (stage.open_questions > 0) waiting.push(stage);
    else if (stage.state !== "finished") other.push(stage);
    else {
      const ticket = stage.ticket?.replace(/^#/, "") ?? "";
      const group = finished.get(ticket);
      if (group) group.push(stage);
      else finished.set(ticket, [stage]);
    }
  }
  return { waiting, other, finished };
});
</script>

<template>
  <div class="grid gap-4 px-4 py-3">
    <section v-if="groups.waiting.length" aria-labelledby="map-waiting">
      <h3 id="map-waiting" class="eyebrow">Waiting for an answer</h3>
      <ul class="grid list-none"><StageMapItem v-for="st in groups.waiting" :key="st.id" :stage="st" /></ul>
    </section>
    <section v-if="groups.other.length" aria-labelledby="map-in-progress">
      <h3 id="map-in-progress" class="eyebrow">No open questions</h3>
      <ul class="grid list-none"><StageMapItem v-for="st in groups.other" :key="st.id" :stage="st" /></ul>
    </section>
    <section v-if="groups.finished.size" aria-labelledby="map-finished">
      <h3 id="map-finished" class="eyebrow">Finished</h3>
      <details v-for="[ticket, stages] in groups.finished" :key="ticket" data-navigation-fold>
        <summary class="py-2 wrap-anywhere" data-map-item>{{ ticket ? `#${ticket}` : 'Ticketless' }} · {{ stages.length }} {{ stages.length === 1 ? 'Stage' : 'Stages' }}</summary>
        <ul class="grid list-none border-s border-default ps-3"><StageMapItem v-for="st in stages" :key="st.id" :stage="st" /></ul>
      </details>
    </section>
    <p v-if="!flow!.stages.length" class="quiet">No Stages recorded.</p>
    <a v-if="flow!.topics.length" href="#topics" class="justify-self-start" data-map-item>Topics</a>
  </div>
</template>

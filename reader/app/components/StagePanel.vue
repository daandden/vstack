<script setup lang="ts">
import { useReaderState } from "~/composables/reader";
const { flow } = useReaderState();
import { tab } from "~/composables/navigation";
import type { StageView } from "~/utils/flow";

const props = defineProps<{ stage: StageView }>();
const f = computed(() => flow.value!);
const label = (id: string) => f.value.stage.get(id)?.label ?? id;
const historical = computed(() => f.value.reading.historical.filter((b) => b.stage === props.stage.id));
const publications = computed(() => f.value.reading.publications.filter((b) => b.stage === props.stage.id));
</script>

<template>
  <section :id="stage.id" class="panel grid border-bs border-flow-line" :data-tab="stage.id" :data-state="stage.state" :hidden="tab !== stage.id" :aria-labelledby="`${stage.id}-title`">
    <header class="grid gap-1 pbs-2">
      <h2 :id="`${stage.id}-title`">{{ stage.label }}</h2>
      <p class="meta">
        <span class="text-flow-state font-semibold">{{ STATE_LABELS[stage.state] }}</span>
        <span>{{ stage.skill }}</span>
        <span v-if="stage.parent">Continues <a :href="`#${stage.parent}`">{{ label(stage.parent) }}</a></span>
        <span v-if="stage.children.length">Continued in <template v-for="(id, i) in stage.children" :key="id">{{ i ? ", " : "" }}<a :href="`#${id}`">{{ label(id) }}</a></template></span>
      </p>
    </header>
    <p v-if="stage.open_questions === 0" class="quiet" role="status">This Stage has no open questions.</p>
    <p v-if="historical.length" :id="`${stage.id}-historical`" class="quiet pbs-3">Historical content in retained order. Exact publication order is unknown.</p>
    <StageReading v-if="historical.length" :stage="stage" :blocks="historical" />
    <div v-if="historical.length && publications.length" :id="`${stage.id}-publication`" class="border-bs border-flow-line" />
    <StageReading v-if="publications.length" :stage="stage" :blocks="publications" />
    <p v-if="!historical.length && !publications.length" class="quiet">Nothing recorded yet.</p>
  </section>
</template>

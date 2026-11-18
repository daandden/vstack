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
  <section :id="stage.id" class="panel grid" :data-tab="stage.id" :data-state="stage.state" :hidden="tab !== stage.id" :aria-labelledby="`${stage.id}-title`">
    <header class="grid gap-1 pbs-3">
      <h2 :id="`${stage.id}-title`">{{ stage.label }}</h2>
      <p class="meta">
        <span class="text-flow-state font-semibold">{{ STATE_LABELS[stage.state] }}</span>
        <span>{{ stage.skill }}</span>
        <span v-if="stage.parent">Continues <a :href="`#${stage.parent}`">{{ label(stage.parent) }}</a></span>
        <span v-if="stage.children.length">Continued in <template v-for="(id, i) in stage.children" :key="id">{{ i ? ", " : "" }}<a :href="`#${id}`">{{ label(id) }}</a></template></span>
      </p>
    </header>
    <p v-if="stage.open_questions === 0" class="quiet" role="status">This Stage has no open questions.</p>
    <section v-if="historical.length" class="grid gap-1 [padding-block:0.75rem] border-bs border-default" :aria-labelledby="`${stage.id}-historical`">
      <h3 :id="`${stage.id}-historical`" class="eyebrow">Historical content in retained order</h3>
      <p class="quiet">Exact publication order across content types was not recorded. This retained order is not a proved chronology.</p>
      <ReadingEntry v-for="b in historical" :key="b.id" :block="b" />
    </section>
    <section v-if="historical.length && publications.length" class="grid gap-1 [padding-block:0.75rem] border-bs border-default" :aria-labelledby="`${stage.id}-publication`">
      <h3 :id="`${stage.id}-publication`" class="eyebrow">First-publication order starts here</h3>
      <p class="quiet">Positions below record each block's first publication to the Flow. Answers and revisions update their block in place.</p>
    </section>
    <ReadingEntry v-for="b in publications" :key="b.id" :block="b" :position="b.position" />
    <p v-if="!historical.length && !publications.length" class="quiet">Nothing recorded yet.</p>
  </section>
</template>

<script setup lang="ts">
import { current, jumpOpen, mapOpen, mapTab, tab } from "~/composables/navigation";
import { useReaderState } from "~/composables/reader";
import { questionHasConcern, stageWorkName } from "~/utils/flow";

const { flow } = useReaderState();
const f = computed(() => flow.value!);
const stage = computed(() => f.value.stage.get(tab.value));
const stageName = computed(() => stage.value ? stageWorkName(f.value, stage.value) : tab.value === "topics" ? "Topics" : "Overview");
const queue = computed(() => {
  if (!stage.value) return [];
  return f.value.next.flatMap((id) => {
    const q = f.value.question.get(id);
    if (!q || q.stage !== stage.value!.id) return [];
    return [{ q, concern: questionHasConcern(f.value, q) }];
  });
});
const selected = computed(() => queue.value.find(({ q }) => q.id === current.value));
const other = computed(() => f.value.stages.filter(st => st.id !== tab.value && st.open_questions > 0));
const slotSizes = computed(() => ({
  "--queue-slot": `${String(queue.value.at(-1)?.q.q ?? 1).length + 2}ch`,
  "--open-slot": `${String(queue.value.length).length + 6}ch`,
  "--other-slot": `${String(other.value.length).length + 1}ch`,
  "--floor": [
    ...(queue.value.length > Number(!!selected.value) ? ["var(--open-slot) + var(--chip-pad)"] : []),
    ...(other.value.length ? ["var(--other-slot) + var(--chip-pad)"] : []),
  ].join(" + var(--gap) + ") || "0px",
}));

const slots = useTemplateRef<HTMLElement>("slots");
const ruler = useTemplateRef<HTMLElement>("ruler");
const width = shallowRef(0);
const sizes = shallowRef<number[]>([]);
function measure() {
  if (!slots.value || !ruler.value) return;
  width.value = slots.value.getBoundingClientRect().width;
  sizes.value = [...ruler.value.children].map(el => el.getBoundingClientRect().width);
}
useResizeObserver([slots, ruler], measure);
watch(slotSizes, measure, { flush: "post" });
const packed = computed(() => {
  const active = Number(!!selected.value);
  const n = queue.value.length - active;
  const m = other.value.length;
  const [chip = 0, open = 0, waiting = 0, more = 0, gap = 0] = sizes.value;
  let questions = 0;
  let stages = 0;
  if (!chip || !width.value) return { questions, stages };
  const fits = (qs: number, sts: number) => {
    const hasOpen = Number(qs < n), hasMore = Number(sts < m);
    return (active + qs) * chip + sts * waiting + hasOpen * open + hasMore * more
      + Math.max(0, active + qs + sts + hasOpen + hasMore - 1) * gap <= width.value;
  };
  if (m && fits(0, 1)) stages = 1;
  questions = Math.min(n, Math.floor(width.value / chip));
  while (questions && !fits(questions, stages)) questions--;
  for (let i = Math.min(3, m); i > stages; i--) {
    if (fits(questions, i)) { stages = i; break; }
  }
  return { questions, stages };
});
const visibleQueue = computed(() => {
  let rest = packed.value.questions;
  return queue.value.filter(item => item === selected.value || rest-- > 0);
});
const hiddenQueue = computed(() => queue.value.length - visibleQueue.value.length);
const hiddenStages = computed(() => other.value.length - packed.value.stages);

function openMap() {
  mapTab.value = "stages";
  mapOpen.value = true;
}
</script>

<template>
  <nav class="bar sticky inset-bs-0 z-1 [grid-column:1/-1]! border-be border-default bg-default" aria-label="Flow navigation">
    <div class="bar-row" :style="slotSizes">
      <span class="identity project text-muted" :title="f.project" dir="auto">{{ f.project }}</span>
      <a href="#overview" class="identity flow-title text-default font-bold" :title="f.flow.title" :aria-current="tab === 'overview' ? 'page' : undefined" dir="auto">{{ f.flow.title }}</a>
      <span class="identity stage-title text-primary font-semibold" :title="stageName" :data-state="stage?.state" dir="auto">{{ stageName }}</span>

      <div ref="slots" class="slots" :class="{ 'has-current': selected }">
        <a v-for="{ q, concern } in visibleQueue" :key="q.id" :href="`#${q.id}`" class="chip queue-chip"
          :class="{ 'current-chip': current === q.id, 'concern-chip': concern }"
          :aria-current="current === q.id ? 'location' : undefined" :aria-label="`Q${q.q}. ${q.title}${concern ? ' · Concern recorded' : ''}`"
          :title="`${q.title}${concern ? ' · Concern recorded' : ''}`">Q{{ q.q }}<span v-if="concern" aria-hidden="true">!</span></a>
        <button v-if="hiddenQueue" type="button" class="chip open-count" aria-haspopup="dialog" @click="jumpOpen = true">+{{ hiddenQueue }} open</button>
        <a v-for="st in other.slice(0, packed.stages)" :key="st.id" :href="`#${st.id}`" class="chip waiting-chip"
          :title="`${stageWorkName(f, st)} · ${st.open_questions} open`" :aria-label="`${stageWorkName(f, st)} · ${st.open_questions} open`">
          <span class="truncate" dir="auto">{{ stageWorkName(f, st) }}</span><span class="shrink-0 text-warning">{{ st.open_questions }}</span>
        </a>
        <button v-if="hiddenStages" type="button" class="chip waiting-count" aria-haspopup="dialog"
          :aria-label="`+${hiddenStages} waiting ${hiddenStages === 1 ? 'Stage' : 'Stages'}`"
          :title="`+${hiddenStages} waiting ${hiddenStages === 1 ? 'Stage' : 'Stages'}`" @click="openMap">+{{ hiddenStages }}</button>
      </div>

      <button id="flow-stages" type="button" class="bar-action" aria-label="Stages" title="Stages (m)" aria-haspopup="dialog" aria-keyshortcuts="m" @click="openMap">
        <span class="action-label">Stages <kbd>m</kbd></span>
        <svg class="action-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H3m3 7H3m3 7H3m7-7h11m-11 7h11" /></svg>
      </button>
      <button id="flow-jump" type="button" class="bar-action" aria-label="Jump" title="Jump (g)" aria-haspopup="dialog" aria-keyshortcuts="g" @click="jumpOpen = true">
        <span class="action-label">Jump <kbd>g</kbd></span>
        <svg class="action-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h11M3 12h8m-8 6h8m4-6 3 3 3-3m-3 3V6" /></svg>
      </button>

      <div ref="ruler" class="ruler" aria-hidden="true"><span class="queue-chip" /><span class="open-count" /><span class="waiting-chip" /><span class="waiting-count" /><span class="gap-size" /></div>
    </div>
  </nav>
</template>

<style scoped>
.bar {
  block-size: var(--bar);
  container-type: inline-size;
}
.bar-row {
  --gap: 4px;
  --chip-pad: 10px;
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--gap);
  block-size: 100%;
  padding-inline: clamp(6px, 1.5cqi, 20px);
  white-space: nowrap;
  font-size: var(--fs-small);
}
.identity {
  overflow: hidden;
  text-overflow: ellipsis;
}
.project { max-inline-size: min(15cqi, 16ch); }
.flow-title { max-inline-size: min(27cqi, 32ch); }
.stage-title { max-inline-size: min(24cqi, 28ch); }
.flow-title, .stage-title {
  border-inline-start: 1px solid var(--ui-border);
  padding-inline-start: 6px;
}
.slots {
  flex: 1 0 0;
  display: flex;
  align-items: center;
  gap: var(--gap);
  min-inline-size: calc(var(--floor));
}
.slots.has-current { min-inline-size: calc(var(--floor) + var(--queue-slot) + var(--chip-pad) + var(--gap)); }
.chip, .bar-action {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.25em;
  border-radius: 4px;
  border: 1px solid var(--ui-border);
  color: var(--ui-text-toned);
  text-decoration: none;
  touch-action: manipulation;
  cursor: pointer;
}
.chip { min-block-size: 26px; padding-inline: 4px; }
.queue-chip { inline-size: calc(var(--queue-slot) + var(--chip-pad)); gap: 0; }
.waiting-chip { inline-size: calc(15ch + var(--chip-pad)); justify-content: space-between; }
.open-count { inline-size: calc(var(--open-slot) + var(--chip-pad)); }
.waiting-count { inline-size: calc(var(--other-slot) + var(--chip-pad)); }
.current-chip { border-color: var(--ui-primary); background: var(--ui-bg-accented); color: var(--ui-primary); }
.concern-chip { color: var(--ui-warning); }
.concern-chip span { font-weight: 800; }
.bar-action { min-block-size: 32px; padding-inline: 6px; }
.bar-row :is(a, button):focus-visible { outline-offset: -2px; }
.bar-row :is(a, button):active { color: var(--ui-secondary); }
@media (hover: hover) and (pointer: fine) {
  .bar-row :is(a, button):hover { color: var(--ui-secondary); }
}
.ruler {
  position: absolute;
  inset-inline-start: 0;
  display: flex;
  visibility: hidden;
  pointer-events: none;
}
.ruler > * { flex: none; }
.gap-size { inline-size: var(--gap); }
.action-icon { display: none; inline-size: 1.25em; }
@container (width < 520px) {
  .action-label { display: none; }
  .action-icon { display: block; }
}
</style>

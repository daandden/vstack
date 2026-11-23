<script setup lang="ts">
import Button from "~/components/ui/Button.vue";
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
  "--queue-count-slot": `${String(queue.value.length).length + 1}ch`,
  "--other-slot": `${String(other.value.length).length + 1}ch`,
  "--current-slot": selected.value ? "var(--queue-slot) + var(--chip-pad)" : "0px",
}));
const chipClass = "inline-flex min-h-control shrink-0 touch-manipulation cursor-pointer items-center justify-center gap-1 rounded-sm border border-flow-line text-flow-toned no-underline outline-offset-[-2px] @hover:text-flow-lavender active:text-flow-lavender";

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
  if (!chip || !width.value) return { questions, stages, openCount: false, waitingCount: false };
  const size = (qs: number, sts: number, hasOpen: boolean, hasMore: boolean) => {
    const count = active + qs + sts + Number(hasOpen) + Number(hasMore);
    return (active + qs) * chip + sts * waiting + Number(hasOpen) * open + Number(hasMore) * more
      + Math.max(0, count - 1) * gap;
  };
  const openCount = n > 0 && size(0, 0, true, false) <= width.value;
  const waitingCount = m > 0 && size(0, 0, openCount, true) <= width.value;
  const fits = (qs: number, sts: number) => size(qs, sts, openCount && qs < n, waitingCount && sts < m) <= width.value;
  if (m && fits(0, 1)) stages = 1;
  questions = Math.min(n, Math.floor(width.value / chip));
  while (questions && !fits(questions, stages)) questions--;
  for (let i = Math.min(3, m); i > stages; i--) {
    if (fits(questions, i)) { stages = i; break; }
  }
  return { questions, stages, openCount: openCount && questions < n, waitingCount: waitingCount && stages < m };
});
const visibleQueue = computed(() => {
  let rest = packed.value.questions;
  return queue.value.filter(item => item === selected.value || rest-- > 0);
});
const hiddenQueue = computed(() => queue.value.length - visibleQueue.value.length);
const hiddenStages = computed(() => other.value.length - packed.value.stages);
const waitingLabel = computed(() => `+${hiddenStages.value} waiting ${hiddenStages.value === 1 ? "Stage" : "Stages"}`);
const queueLabel = computed(() => `+${hiddenQueue.value} open`);

function openMap() {
  mapTab.value = "stages";
  mapOpen.value = true;
}
</script>

<template>
  <nav class="bar sticky inset-bs-0 z-1 [grid-column:1/-1]! border-be border-flow-line bg-flow-base" aria-label="Flow navigation">
    <div class="bar-row" :style="slotSizes">
      <span class="identity project text-flow-subtext" :title="f.project" dir="auto">{{ f.project }}</span>
      <a href="#overview" class="identity flow-title min-h-control content-center text-flow-text font-bold" :title="f.flow.title" :aria-current="tab === 'overview' ? 'page' : undefined" dir="auto">{{ f.flow.title }}</a>
      <span class="identity stage-title text-flow-blue font-semibold" :title="stageName" :data-state="stage?.state" dir="auto">{{ stageName }}</span>

      <div ref="slots" class="slots">
        <a v-for="{ q, concern } in visibleQueue" :key="q.id" :href="`#${q.id}`" class="queue-chip aria-[current=location]:border-flow-blue aria-[current=location]:bg-flow-accented"
          :class="[chipClass, concern ? 'text-flow-peach!' : current === q.id ? 'text-flow-blue!' : '']"
          :aria-current="current === q.id ? 'location' : undefined" :aria-label="`Q${q.q}. ${q.title}${concern ? ' · Concern recorded' : ''}`"
          :title="`${q.title}${concern ? ' · Concern recorded' : ''}`">Q{{ q.q }}<span v-if="concern" class="font-extrabold" aria-hidden="true">!</span></a>
        <Button v-if="packed.openCount" variant="bare" class="open-count" :class="chipClass" aria-haspopup="dialog" @click="jumpOpen = true">{{ queueLabel }}</Button>
        <a v-for="st in other.slice(0, packed.stages)" :key="st.id" :href="`#${st.id}`" class="waiting-chip" :class="chipClass"
          :title="`${stageWorkName(f, st)} · ${st.open_questions} open`" :aria-label="`${stageWorkName(f, st)} · ${st.open_questions} open`">
          <span class="truncate" dir="auto">{{ stageWorkName(f, st) }}</span><span class="shrink-0 text-flow-peach">{{ st.open_questions }}</span>
        </a>
        <Button v-if="packed.waitingCount" variant="bare" class="waiting-count" :class="chipClass" aria-haspopup="dialog"
          :aria-label="waitingLabel" :title="waitingLabel" @click="openMap">+{{ hiddenStages }}</Button>
      </div>

      <Button id="flow-stages" class="action shrink-0 text-small leading-none [--count-slot:var(--other-slot)]" aria-label="Stages"
        :aria-description="hiddenStages ? waitingLabel : undefined" :title="hiddenStages ? `Stages (m) · ${waitingLabel}` : 'Stages (m)'"
        aria-haspopup="dialog" aria-keyshortcuts="m" @click="openMap">
        <span class="action-label" aria-hidden="true">Stages</span>
        <span class="i-lucide-list-tree action-icon size-[1.25em]" aria-hidden="true" />
        <span class="action-hint" aria-hidden="true"><template v-if="hiddenStages && !packed.waitingCount">+{{ hiddenStages }}</template><kbd v-else>m</kbd></span>
      </Button>
      <Button id="flow-jump" class="action shrink-0 text-small leading-none [--count-slot:var(--queue-count-slot)]" aria-label="Jump"
        :aria-description="hiddenQueue ? queueLabel : undefined" :title="hiddenQueue ? `Jump (g) · ${queueLabel}` : 'Jump (g)'"
        aria-haspopup="dialog" aria-keyshortcuts="g" @click="jumpOpen = true">
        <span class="action-label" aria-hidden="true">Jump</span>
        <span class="i-lucide-list-end action-icon size-[1.25em]" aria-hidden="true" />
        <span class="action-hint" aria-hidden="true"><template v-if="hiddenQueue && !packed.openCount">+{{ hiddenQueue }}</template><kbd v-else>g</kbd></span>
      </Button>

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
  --gap: var(--spacing-1);
  --identity-pad: calc(1.5 * var(--spacing-1));
  --chip-pad: calc(2 * (var(--spacing-1) + 1px));
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--gap);
  block-size: 100%;
  padding-inline: clamp(var(--identity-pad), 1.5cqi, calc(5 * var(--spacing-1)));
  white-space: nowrap;
  font-size: var(--text-small);
}
.identity {
  overflow: hidden;
  text-overflow: ellipsis;
}
.project { max-inline-size: min(15cqi, 16ch); }
.flow-title { max-inline-size: min(27cqi, 32ch); }
.stage-title { max-inline-size: min(24cqi, 28ch); }
.flow-title, .stage-title {
  min-inline-size: min(72px, 24cqi);
  border-inline-start: 1px solid var(--color-line);
  padding-inline-start: var(--identity-pad);
}
.slots {
  flex: 1 0 0;
  display: flex;
  align-items: center;
  gap: var(--gap);
  min-inline-size: calc(var(--current-slot));
}
:is(.queue-chip, .waiting-chip, .open-count, .waiting-count) { padding-inline: var(--spacing-1); }
.queue-chip { inline-size: calc(var(--queue-slot) + var(--chip-pad)); gap: 0; }
.waiting-chip { inline-size: calc(15ch + var(--chip-pad)); justify-content: space-between; }
.open-count { inline-size: calc(var(--open-slot) + var(--chip-pad)); }
.waiting-count { inline-size: calc(var(--other-slot) + var(--chip-pad)); }
.ruler {
  position: absolute;
  inset-inline-start: 0;
  display: flex;
  visibility: hidden;
  pointer-events: none;
}
.ruler > * { flex: none; }
.gap-size { inline-size: var(--gap); }
.action-hint {
  display: grid;
  place-items: center;
  min-inline-size: max(2ch, var(--count-slot));
  font-variant-numeric: tabular-nums;
}
.action-icon { display: none; }
@container (width < 520px) {
  .action {
    display: grid;
    place-content: center;
    place-items: center;
    gap: 0;
    padding-inline: var(--spacing-1);
    min-inline-size: max(var(--spacing-control), calc(var(--count-slot) + var(--chip-pad)));
  }
  .action-label, .action-hint:has(kbd) { display: none; }
  .action-icon { display: block; }
}
</style>

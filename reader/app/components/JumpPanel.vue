<script setup lang="ts">
import Button from "~/components/ui/Button.vue";
import { current, jumpOpen, nextReadingIndex, shortcutEligible, tab } from "~/composables/navigation";
import { useReadingDialog, focusReadingItem } from "~/composables/reading-dialog";
import { useReaderState } from "~/composables/reader";
import { blockLabel, foldedQuestionOutcome, questionHasConcern, stageWorkName } from "~/utils/flow";
import { inlineLinkLabel } from "~/utils/format";

const { flow } = useReaderState();
const f = computed(() => flow.value!);
const stage = computed(() => f.value.stage.get(tab.value));
const label = computed(() => stage.value ? stageWorkName(f.value, stage.value) : tab.value === "topics" ? "Topics" : "Overview");
type Jump = { id: string; label: string; state?: string };
const entries = computed<Jump[]>(() => {
  if (tab.value === "overview") return [
    { id: "overview:decisions", label: "Open decisions" },
    { id: "overview:progress-row", label: "Progress" },
    { id: "observations", label: "Observations" },
    { id: "overview:visit-row", label: "Changed since your last visit" },
    { id: "overview:stages-row", label: "All Stages" },
    { id: "overview:topics-row", label: "Topics" },
  ];
  if (tab.value === "topics") return f.value.topics.map(t => ({ id: t.id, label: t.title }));
  const ordered: Jump[] = [];
  let includedAssumed = false;
  for (const blocks of [f.value.reading.historical, f.value.reading.publications]) {
    for (const block of blocks) {
      if (block.stage !== tab.value) continue;
      if (block.kind === "background" || block.kind === "result") ordered.push({ id: block.id, label: blockLabel(f.value, block) });
      else if (block.kind === "assumed" && !includedAssumed) {
        ordered.push({ id: `${block.id}-batch`, label: "Assumed picks" });
        includedAssumed = true;
      } else if (block.kind === "question") {
        const q = f.value.question.get(block.id);
        if (!q?.latest || f.value.latestAttempt.has(q.id)) continue;
        const state = q.open && questionHasConcern(f.value, q) ? "Concern" : q.answer.state === "open" && q.open ? "Open" : foldedQuestionOutcome(q);
        ordered.push({ id: q.id, label: `Q${q.q}. ${q.title}`, state });
      }
    }
  }
  return ordered;
});
const at = computed(() => {
  const id = current.value;
  if (!jumpOpen.value || !id) return;
  if (entries.value.some(entry => entry.id === id)) return id;
  const el = document.getElementById(id);
  if (!el) return;
  return entries.value.find(entry => document.getElementById(entry.id)?.contains(el))?.id;
});
const dialog = useTemplateRef<HTMLDialogElement>("dialog");
const links = () => [...dialog.value?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? []];
const { closed } = useReadingDialog(jumpOpen, dialog, () => links().find(a => a.getAttribute("aria-current")) ?? links()[0], "flow-jump");

function onKey(e: KeyboardEvent) {
  if (!shortcutEligible(e) || (e.key !== "j" && e.key !== "k")) return;
  e.preventDefault();
  const items = links();
  const i = items.indexOf(e.target as HTMLAnchorElement);
  const next = nextReadingIndex(i, items.length, e.key === "j" ? 1 : -1);
  focusReadingItem(items[next]);
}
</script>

<template>
  <dialog ref="dialog" class="m-auto [inline-size:min(40rem,100%_-_2rem)] [max-block-size:min(44rem,100%_-_2rem)] overflow-clip rounded-lg border border-flow-line bg-flow-muted p-0 text-flow-text open:flex open:flex-col backdrop:bg-[color-mix(in_oklch,var(--color-base)_70%,transparent)]" aria-labelledby="jump-title" @close="closed" @keydown="onKey" @click="(e) => e.target === dialog && (jumpOpen = false)">
    <header class="flex flex-none items-center justify-between gap-3 border-be border-flow-line px-4 py-2">
      <div class="min-w-0">
        <h2 id="jump-title">Jump</h2>
        <p class="quiet truncate" :title="label">{{ label }}</p>
      </div>
      <Button @click="jumpOpen = false">Close</Button>
    </header>
    <div class="min-h-0 overflow-auto overscroll-contain [scrollbar-gutter:stable] px-4 py-3">
      <ul v-if="entries.length" class="grid list-none gap-1">
        <li v-for="entry in entries" :key="entry.id">
          <a :href="`#${entry.id}`" :aria-current="entry.id === at ? 'location' : undefined" class="grid gap-x-3 sm:grid-cols-[1fr_auto] reader-control items-center py-2 wrap-anywhere no-underline text-flow-toned aria-[current]:bg-flow-accented aria-[current]:text-flow-blue focus-visible:-outline-offset-2">
            <span v-html="inlineLinkLabel(entry.label)" /><span v-if="entry.state" class="quiet">{{ entry.state }}</span>
          </a>
        </li>
      </ul>
      <p v-else class="quiet">Nothing to jump to here.</p>
    </div>
  </dialog>
</template>

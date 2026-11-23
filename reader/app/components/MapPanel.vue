<script setup lang="ts">
import { mapOpen, mapTab, nextReadingIndex, shortcutEligible } from "~/composables/navigation";
import { useReaderState } from "~/composables/reader";
import Button from "~/components/ui/Button.vue";
import { useReadingDialog, focusReadingItem as focusItem } from "~/composables/reading-dialog";

const { flow } = useReaderState();

const f = computed(() => flow.value!);
const tabs = computed(() => [
  ...(f.value.path ? [{ id: "path", label: "Matt flow path" }] : []),
  { id: "stages", label: "Stages" },
  ...(f.value.wayfinder ? [{ id: "wayfinder", label: "Wayfinder map" }] : []),
]);
const dialog = useTemplateRef<HTMLDialogElement>("dialog");
const items = () => [...dialog.value!.querySelectorAll<HTMLElement>("[data-map-item]")].filter(el => {
  const parent = el.localName === "summary" ? el.parentElement?.parentElement : el.parentElement;
  return el.getClientRects().length > 0 && !parent?.closest("details[data-navigation-fold]:not([open])");
});
const firstItem = () => items()[0] ?? dialog.value?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? undefined;
const { closed } = useReadingDialog(mapOpen, dialog, firstItem, "flow-stages");
watch(flow, () => {
  const d = dialog.value;
  if (!mapOpen.value || !d?.open || d.contains(document.activeElement)) return;
  focusItem(firstItem() ?? d);
}, { flush: "post" });
async function switchTab(id: string) {
  mapTab.value = id;
  await nextTick();
  focusItem(firstItem());
}
function onKey(e: KeyboardEvent) {
  if (!shortcutEligible(e)) return;
  const target = e.target instanceof Element ? e.target : null;
  if (e.key === "h" || e.key === "l") {
    e.preventDefault();
    const at = tabs.value.findIndex((t) => t.id === mapTab.value);
    void switchTab(tabs.value[Math.min(Math.max(at + (e.key === "l" ? 1 : -1), 0), tabs.value.length - 1)]!.id);
  } else if (e.key === "j" || e.key === "k") {
    e.preventDefault();
    const list = items();
    const at = list.indexOf(target?.closest<HTMLElement>("[data-map-item]")!);
    const next = nextReadingIndex(at, list.length, e.key === "j" ? 1 : -1);
    focusItem(list[next]);
  } else if (e.key === "Enter" && target?.matches("[data-map-item]:not(a, summary)")) {
    e.preventDefault();
    target.querySelector<HTMLAnchorElement>("a[href]")?.click();
  } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
    e.preventDefault();
    const pane = dialog.value?.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])');
    pane?.scrollBy({ left: e.key === "ArrowRight" ? 80 : e.key === "ArrowLeft" ? -80 : 0, top: e.key === "ArrowDown" ? 80 : e.key === "ArrowUp" ? -80 : 0, behavior: "instant" });
  }
}
</script>

<template>
  <dialog ref="dialog" class="map-panel m-auto [inline-size:min(48rem,100%_-_2rem)] [max-block-size:min(44rem,100%_-_2rem)] overflow-clip rounded-lg border border-flow-line bg-flow-muted p-0 text-flow-text open:flex open:flex-col backdrop:bg-[color-mix(in_oklch,var(--color-base)_70%,transparent)] [&_[data-map-item]:focus-visible]:outline-2 [&_[data-map-item]:focus-visible]:outline-flow-blue [&_[data-map-item]:focus-visible]:-outline-offset-2" aria-labelledby="map-title" @close="closed" @keydown="onKey" @click="(e) => e.target === dialog && (mapOpen = false)">
    <header class="flex flex-none items-center justify-between gap-2 border-be border-flow-line p-2">
      <h2 id="map-title">Map</h2>
      <Button class="map-control" @click="mapOpen = false">Close</Button>
    </header>
    <div class="map-tabs flex flex-none flex-wrap gap-2 p-2" role="tablist" aria-label="Map views">
      <Button v-for="t in tabs" :id="`map-tab-${t.id}`" :key="t.id" class="map-control" role="tab" :aria-selected="mapTab === t.id" :aria-controls="`map-${t.id}`" :tabindex="mapTab === t.id ? 0 : -1" @click="switchTab(t.id)">{{ t.label }}</Button>
    </div>
    <div v-if="f.path" id="map-path" class="map-content min-h-0 overflow-auto overscroll-contain [scrollbar-gutter:stable]" role="tabpanel" aria-labelledby="map-tab-path" :hidden="mapTab !== 'path'">
      <MattPath />
    </div>
    <div id="map-stages" class="map-content min-h-0 overflow-auto overscroll-contain [scrollbar-gutter:stable]" role="tabpanel" aria-labelledby="map-tab-stages" :hidden="mapTab !== 'stages'">
      <MapStages />
    </div>
    <div v-if="f.wayfinder" id="map-wayfinder" class="map-content min-h-0 overflow-auto overscroll-contain [scrollbar-gutter:stable]" role="tabpanel" aria-labelledby="map-tab-wayfinder" :hidden="mapTab !== 'wayfinder'">
      <WayfinderMap :tickets="f.wayfinder.tickets" />
    </div>
  </dialog>
</template>

<style scoped>
.map-panel { border-color: var(--color-surface1); }

.map-control {
  border-color: var(--color-surface1);
  font-weight: normal;
}

.map-control[aria-selected="true"] {
  border-color: var(--color-blue);
  color: var(--color-blue);
  background: color-mix(in oklch, var(--color-blue) 8%, var(--color-base));
}
</style>

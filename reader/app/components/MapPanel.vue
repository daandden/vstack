<script setup lang="ts">
import { useReaderState } from "~/composables/reader";
import Button from "~/components/ui/Button.vue";
import { mapOpen, mapTab, shortcutEligible } from "~/composables/navigation";

const { flow } = useReaderState();

const f = computed(() => flow.value!);
const tabs = computed(() => [
  ...(f.value.path ? [{ id: "path", label: "Matt flow path" }] : []),
  { id: "stages", label: "Stages" },
  ...(f.value.wayfinder ? [{ id: "wayfinder", label: "Wayfinder map" }] : []),
]);
const dialog = ref<HTMLDialogElement>();
const items = () => [...dialog.value!.querySelectorAll<HTMLElement>("[data-map-item]")].filter((el) => el.getClientRects().length > 0);
const focusItem = (el: HTMLElement | undefined) => {
  el?.focus({ preventScroll: true });
  el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
};
let opener: Element | null = null;
let openingHash = "";
watch(mapOpen, async (open) => {
  const d = dialog.value;
  if (!d) return;
  if (open && !d.open) {
    opener = document.activeElement;
    openingHash = location.hash;
    if (!tabs.value.some((t) => t.id === mapTab.value)) mapTab.value = tabs.value[0]!.id;
    d.showModal();
    await nextTick();
    focusItem(items()[0]);
  } else if (!open && d.open) d.close();
});
watch(flow, () => {
  const d = dialog.value;
  if (!mapOpen.value || !d?.open || d.contains(document.activeElement)) return;
  focusItem(items()[0] ?? d.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? d);
}, { flush: "post" });
function closed() {
  // A queued native close event can arrive after the dialog has reopened.
  const d = dialog.value;
  if (!d || d.open) return;
  mapOpen.value = false;
  const focused = document.activeElement;
  if (location.hash !== openingHash || (focused !== document.body && !d.contains(focused))) return;
  if (opener instanceof HTMLElement && opener.isConnected && opener !== document.body) {
    opener.focus({ preventScroll: true });
  } else {
    document.getElementById("stages-map-trigger")?.focus({ preventScroll: true });
  }
}
async function switchTab(id: string) {
  mapTab.value = id;
  await nextTick();
  focusItem(items()[0]);
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
    const next = at < 0 ? (e.key === "j" ? 0 : list.length - 1) : Math.min(Math.max(at + (e.key === "j" ? 1 : -1), 0), list.length - 1);
    focusItem(list[next]);
  } else if (e.key === "Enter" && target?.matches("[data-map-item]:not(a)")) {
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
      <StageGraph :stages="f.stages" />
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

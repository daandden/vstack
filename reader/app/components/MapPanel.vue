<script setup lang="ts">
import { flow } from "~/composables/reader";
import { mapOpen, mapTab, shortcutEligible } from "~/composables/navigation";

const f = computed(() => flow.value!);
const roots = computed(() => f.value.stages.filter((st) => !st.parent));
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
  mapOpen.value = false;
  if (opener instanceof HTMLElement && opener.isConnected && location.hash === openingHash) opener.focus({ preventScroll: true });
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
  <dialog ref="dialog" class="map-panel" aria-labelledby="map-title" @close="closed" @keydown="onKey" @click="(e) => e.target === dialog && (mapOpen = false)">
    <header>
      <h2 id="map-title">Map</h2>
      <button type="button" @click="mapOpen = false">Close</button>
    </header>
    <div class="map-tabs" role="tablist" aria-label="Map views">
      <button v-for="t in tabs" :id="`map-tab-${t.id}`" :key="t.id" type="button" role="tab" :aria-selected="mapTab === t.id" :aria-controls="`map-${t.id}`" :tabindex="mapTab === t.id ? 0 : -1" @click="switchTab(t.id)">{{ t.label }}</button>
    </div>
    <div v-if="f.path" id="map-path" class="map-content" role="tabpanel" aria-labelledby="map-tab-path" :hidden="mapTab !== 'path'">
      <MattPath />
    </div>
    <div id="map-stages" class="map-content" role="tabpanel" aria-labelledby="map-tab-stages" :hidden="mapTab !== 'stages'">
      <ul v-if="roots.length" class="tree">
        <StageTreeNode v-for="st in roots" :key="st.id" :stage="st" />
      </ul>
      <p v-else class="quiet">No Stages recorded.</p>
    </div>
    <div v-if="f.wayfinder" id="map-wayfinder" class="map-content" role="tabpanel" aria-labelledby="map-tab-wayfinder" :hidden="mapTab !== 'wayfinder'">
      <WayfinderMap :tickets="f.wayfinder.tickets" />
    </div>
    <p class="map-help quiet"><kbd>h</kbd> <kbd>l</kbd> tabs · <kbd>j</kbd> <kbd>k</kbd> items · Enter opens · arrows pan</p>
  </dialog>
</template>

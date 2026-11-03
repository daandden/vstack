<script setup lang="ts">
import { flow } from "~/composables/reader";
import { treeOpen } from "~/composables/navigation";

const f = computed(() => flow.value!);
const roots = computed(() => f.value.stages.filter((st) => !st.parent));
const dialog = ref<HTMLDialogElement>();
let opener: Element | null = null;
watch(treeOpen, async (open) => {
  const d = dialog.value;
  if (!d) return;
  if (open && !d.open) {
    opener = document.activeElement;
    d.showModal();
    d.querySelector<HTMLElement>("a")?.focus();
  } else if (!open && d.open) d.close();
});
function closed() {
  treeOpen.value = false;
  if (opener instanceof HTMLElement && opener.isConnected && !location.hash) opener.focus();
}
</script>

<template>
  <dialog ref="dialog" class="stage-tree" aria-labelledby="stage-tree-title" @close="closed" @click="(e) => e.target === dialog && (treeOpen = false)">
    <header>
      <h2 id="stage-tree-title">Stages</h2>
      <button type="button" @click="treeOpen = false">Close</button>
    </header>
    <ul class="tree">
      <StageTreeNode v-for="st in roots" :key="st.id" :stage="st" />
    </ul>
  </dialog>
</template>

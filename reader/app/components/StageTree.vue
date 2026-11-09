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
  <dialog ref="dialog" class="stage-tree [inline-size:min(40rem,100%_-_2rem)] [max-block-size:min(40rem,100%_-_2rem)] p-0 border border-default rounded-lg bg-muted text-default overscroll-contain backdrop:[background:color-mix(in_oklch,var(--base)_70%,transparent)]" aria-labelledby="stage-tree-title" @close="closed" @click="(e) => e.target === dialog && (treeOpen = false)">
    <header class="flex gap-3 items-center justify-between [padding-block:0.5rem] [padding-inline:1rem] border-be border-muted">
      <h2 id="stage-tree-title">Stages</h2>
      <UButton color="neutral" variant="soft" @click="treeOpen = false">Close</UButton>
    </header>
    <ul class="tree grid gap-1 list-none [padding-block:0.75rem] [padding-inline:1rem]">
      <StageTreeNode v-for="st in roots" :key="st.id" :stage="st" />
    </ul>
  </dialog>
</template>

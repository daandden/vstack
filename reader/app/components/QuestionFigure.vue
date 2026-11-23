<script setup lang="ts">
import { VISUAL_KINDS } from "#flow/fields.ts";
import type { Attachment, Figure } from "#flow/model.ts";
import { tab } from "~/composables/navigation";

const { figure, attachment } = defineProps<{ figure: Figure; attachment?: Attachment }>();
const title = computed(() => attachment ? withoutQuestionNumber(attachment.caption) : figure.kind ? VISUAL_KINDS[figure.kind] : "Historical figure");
const trigger = useTemplateRef<HTMLButtonElement>("trigger");
const dialog = useTemplateRef<HTMLDialogElement>("dialog");
const enlarged = shallowRef(false);

async function open() {
  if (dialog.value?.open) return;
  enlarged.value = true;
  await nextTick();
  if (!dialog.value?.isConnected || dialog.value.open || !enlarged.value) return;
  trigger.value?.focus({ preventScroll: true });
  dialog.value.showModal();
}

function openFromMedia(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Element) || !target.closest(".visual, .diagram, img, svg, video")) return;
  if (target.closest("a[href], button, summary, video[controls]")) return;
  void open();
}

function close() {
  if (dialog.value?.open) dialog.value.close();
  else enlarged.value = false;
}

function closed() {
  if (dialog.value?.open) return;
  enlarged.value = false;
  trigger.value?.focus({ preventScroll: true });
}

watch(tab, close);
</script>

<template>
  <div class="grid gap-2">
    <div class="decision-visual grid" @click="openFromMedia">
      <FigureList :figures="[figure]" part="inline" />
    </div>
    <button ref="trigger" type="button" aria-haspopup="dialog" :aria-label="`Enlarge figure: ${title}`" class="w-fit cursor-pointer rounded border border-default px-2 py-1 text-small text-info hover:bg-elevated active:bg-accented pointer-coarse:min-h-11" @click="open">
      Enlarge figure
    </button>
    <dialog ref="dialog" :aria-label="title" class="figure-dialog m-auto w-[calc(100%_-_2rem)] max-h-[calc(100%_-_2rem)] max-w-none overflow-clip rounded-lg border border-default bg-default p-0 text-default open:flex open:flex-col backdrop:bg-[color-mix(in_oklch,var(--base)_70%,transparent)]" @click.self="close" @close="closed" @keydown.stop>
      <header class="flex shrink-0 justify-end border-be border-default px-4 py-2">
        <UButton color="neutral" variant="outline" class="min-h-11" autofocus @click="close">Close figure</UButton>
      </header>
      <div v-if="enlarged" class="enlarged-visual grid min-h-0 gap-2 overflow-auto overscroll-contain p-4">
        <FigureList :figures="[figure]" part="enlarged" />
      </div>
    </dialog>
  </div>
</template>

<style scoped>
.decision-visual :deep(:is(.visual, .diagram)) {
  max-block-size: 16rem;
  overflow: auto;
  cursor: zoom-in;
}

.decision-visual :deep(:is(img, svg, video)) {
  max-block-size: 16rem;
  object-fit: contain;
  cursor: zoom-in;
}

.enlarged-visual :deep(img) {
  inline-size: 100%;
}

:global(html:has(.figure-dialog:modal)) {
  overflow: hidden;
}
</style>

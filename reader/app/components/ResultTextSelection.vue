<script setup lang="ts">
import { useEventListener } from "@vueuse/core";

const props = defineProps<{ content: HTMLElement | null }>();
const emit = defineEmits<{ select: [quote: string] }>();
const quote = shallowRef("");
const selectable = shallowRef<string>();
useEventListener(document, "selectionchange", () => {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (props.content?.contains(range.startContainer) && props.content.contains(range.endContainer)) quote.value = selection.toString();
});
function selectInField(event: Event) {
  const field = event.target as HTMLTextAreaElement;
  quote.value = field.value.slice(field.selectionStart, field.selectionEnd);
}
function choose() {
  emit("select", quote.value);
  selectable.value = undefined;
  quote.value = "";
}
</script>

<template>
  <div class="grid min-w-0 gap-2">
    <UButton label="Select text to comment" color="neutral" variant="ghost" :ui="{ label: 'whitespace-normal text-start' }" class="w-fit max-w-full whitespace-normal pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] active:bg-accented" @click="selectable = content?.innerText ?? ''" />
    <UFormField v-if="selectable !== undefined" label="Result text for selection" description="Select a passage with Shift and the arrow keys, then choose Comment on selected text.">
      <UTextarea :model-value="selectable" aria-readonly="true" :rows="5" class="w-full" @beforeinput.prevent @select="selectInField" />
    </UFormField>
    <UButton label="Comment on selected text" color="neutral" variant="soft" :disabled="!quote.trim()" :ui="{ label: 'whitespace-normal text-start' }" class="w-fit max-w-full whitespace-normal pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] active:bg-accented" @click="choose" />
  </div>
</template>

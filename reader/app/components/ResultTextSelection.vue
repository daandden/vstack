<script setup lang="ts">
import { useEventListener } from "@vueuse/core";
import Button from "./ui/Button.vue";
import Field from "./ui/Field.vue";
import Textarea from "./ui/Textarea.vue";

const props = defineProps<{ content: HTMLElement | null }>();
const emit = defineEmits<{ select: [quote: string] }>();
const quote = shallowRef("");
const selectable = shallowRef<string>();
const fieldId = useId();
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
    <Button variant="ghost" class="w-fit max-w-full whitespace-normal text-start media-pointer-coarse:min-h-[44px] media-pointer-coarse:min-w-[44px]" @click="selectable = content?.innerText ?? ''">Select text to comment</Button>
    <Field v-if="selectable !== undefined" :id="fieldId" v-slot="{ control }" label="Result text for selection" description="Select a passage with Shift and the arrow keys, then choose Comment on selected text.">
      <Textarea v-bind="control" :model-value="selectable" aria-readonly="true" :rows="5" @beforeinput.prevent @select="selectInField" />
    </Field>
    <Button variant="soft" :disabled="!quote.trim()" class="w-fit max-w-full whitespace-normal text-start media-pointer-coarse:min-h-[44px] media-pointer-coarse:min-w-[44px]" @click="choose">Comment on selected text</Button>
  </div>
</template>

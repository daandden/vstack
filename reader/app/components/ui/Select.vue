<script setup lang="ts" generic="T extends string | number">
import {
  SelectContent, SelectIcon, SelectItem, SelectItemIndicator, SelectItemText,
  SelectPortal, SelectRoot, SelectScrollDownButton, SelectScrollUpButton,
  SelectTrigger, SelectValue, SelectViewport,
} from "reka-ui";

defineOptions({ inheritAttrs: false });
const { items, placeholder, disabled, name, required } = defineProps<{
  items: readonly { value: T; label: string; disabled?: boolean }[];
  placeholder?: string;
  disabled?: boolean;
  name?: string;
  required?: boolean;
}>();
const value = defineModel<T>();
const label = computed(() => items.find((item) => item.value === value.value)?.label ?? placeholder);
</script>

<template>
  <SelectRoot v-model="value" :disabled="disabled" :name="name" :required="required">
    <SelectTrigger
      v-bind="$attrs"
      data-slot="select-trigger"
      class="reader-select inline-flex max-w-full min-h-8 items-center justify-between gap-2 rounded-md border border-flow-border bg-transparent px-2 py-1 text-start outline-none disabled:cursor-not-allowed disabled:opacity-75 focus-visible:border-flow-blue data-[state=open]:border-flow-blue"
    >
      <SelectValue data-slot="select-value" class="min-w-0 [overflow-wrap:anywhere]">{{ label }}</SelectValue>
      <SelectIcon as-child>
        <span class="i-lucide-chevron-down shrink-0 text-flow-dimmed" aria-hidden="true" />
      </SelectIcon>
    </SelectTrigger>
    <SelectPortal>
      <SelectContent
        position="popper"
        align="start"
        :side-offset="4"
        data-slot="select-content"
        class="z-50 flex max-h-[min(15rem,var(--reka-select-content-available-height))] min-w-[var(--reka-select-trigger-width)] max-w-[var(--reka-select-content-available-width)] flex-col overflow-hidden rounded-md border border-flow-border bg-[var(--base)]"
      >
        <SelectScrollUpButton class="flex justify-center py-1">
          <span class="i-lucide-chevron-up" aria-hidden="true" />
        </SelectScrollUpButton>
        <SelectViewport class="min-h-0 flex-1 p-1">
          <SelectItem
            v-for="item in items"
            :key="item.value"
            :value="item.value"
            :disabled="item.disabled"
            data-slot="select-item"
            class="flex min-h-7 items-center justify-between gap-2 rounded px-2 select-none outline-none data-[highlighted]:bg-[var(--mantle)] data-[disabled]:opacity-75"
          >
            <SelectItemText class="min-w-0 [overflow-wrap:anywhere]">{{ item.label }}</SelectItemText>
            <SelectItemIndicator as-child>
              <span class="i-lucide-check shrink-0 text-flow-blue" aria-hidden="true" />
            </SelectItemIndicator>
          </SelectItem>
        </SelectViewport>
        <SelectScrollDownButton class="flex justify-center py-1">
          <span class="i-lucide-chevron-down" aria-hidden="true" />
        </SelectScrollDownButton>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>

<style scoped>
.reader-select[aria-invalid="true"] {
  border-color: var(--red);
}

.reader-select[aria-invalid="true"]:is(:focus-visible, [data-state="open"]) {
  box-shadow: inset 0 0 0 1px var(--red);
}
</style>

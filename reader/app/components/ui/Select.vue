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
      class="reader-select u-inline-flex u-max-w-full u-min-h-8 u-items-center u-justify-between u-gap-2 u-rounded-md u-border u-border-flow-border u-bg-transparent u-px-2 u-py-1 u-text-start u-outline-none disabled:u-cursor-not-allowed disabled:u-opacity-75 focus-visible:u-border-flow-blue data-[state=open]:u-border-flow-blue"
    >
      <SelectValue data-slot="select-value" class="u-min-w-0 u-[overflow-wrap:anywhere]">{{ label }}</SelectValue>
      <SelectIcon as-child>
        <span class="i-lucide-chevron-down u-shrink-0 u-text-flow-dimmed" aria-hidden="true" />
      </SelectIcon>
    </SelectTrigger>
    <SelectPortal>
      <SelectContent
        position="popper"
        align="start"
        :side-offset="4"
        data-slot="select-content"
        class="u-z-50 u-flex u-max-h-[min(15rem,var(--reka-select-content-available-height))] u-min-w-[var(--reka-select-trigger-width)] u-max-w-[var(--reka-select-content-available-width)] u-flex-col u-overflow-hidden u-rounded-md u-border u-border-flow-border u-bg-[var(--base)]"
      >
        <SelectScrollUpButton class="u-flex u-justify-center u-py-1">
          <span class="i-lucide-chevron-up" aria-hidden="true" />
        </SelectScrollUpButton>
        <SelectViewport class="u-min-h-0 u-flex-1 u-p-1">
          <SelectItem
            v-for="item in items"
            :key="item.value"
            :value="item.value"
            :disabled="item.disabled"
            data-slot="select-item"
            class="u-flex u-min-h-7 u-items-center u-justify-between u-gap-2 u-rounded u-px-2 u-select-none u-outline-none data-[highlighted]:u-bg-[var(--mantle)] data-[disabled]:u-opacity-75"
          >
            <SelectItemText class="u-min-w-0 u-[overflow-wrap:anywhere]">{{ item.label }}</SelectItemText>
            <SelectItemIndicator as-child>
              <span class="i-lucide-check u-shrink-0 u-text-flow-blue" aria-hidden="true" />
            </SelectItemIndicator>
          </SelectItem>
        </SelectViewport>
        <SelectScrollDownButton class="u-flex u-justify-center u-py-1">
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

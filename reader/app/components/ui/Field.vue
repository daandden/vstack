<script setup lang="ts">
const { id, label, horizontal, required, description, errors } = defineProps<{
  id: string;
  label?: string;
  horizontal?: boolean;
  required?: boolean;
  description?: string;
  errors?: readonly (string | { message: string } | undefined)[];
}>();
const messages = computed(() => [...new Set(errors?.flatMap(error => {
  const message = typeof error === "string" ? error : error?.message;
  return message ? [message] : [];
}))]);
const control = computed(() => ({
  id,
  "aria-required": required || undefined,
  "aria-invalid": messages.value.length > 0 || undefined,
  "aria-describedby": messages.value.length ? `${id}-error` : description ? `${id}-description` : undefined,
}));
</script>

<template>
  <div role="group" data-slot="field" class="u-grid u-min-w-0 u-gap-1">
    <div class="u-min-w-0" :class="horizontal ? 'u-flex u-flex-wrap u-items-center u-gap-2' : 'u-grid u-gap-1'">
      <label v-if="label" :for="id">{{ label }}<span v-if="required" class="u-text-flow-red" aria-hidden="true">*</span></label>
      <slot :control="control" />
    </div>
    <p v-if="description" :id="`${id}-description`" class="u-text-flow-subtext">{{ description }}</p>
    <div v-if="messages.length" class="u-flex u-flex-wrap u-items-baseline u-justify-between u-gap-2 u-text-flow-red">
      <div :id="`${id}-error`" data-slot="field-error" role="alert">
        <p v-for="message in messages" :key="message">{{ message }}</p>
      </div>
      <slot name="error-detail" />
    </div>
  </div>
</template>

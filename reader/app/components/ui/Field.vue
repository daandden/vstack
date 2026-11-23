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
  <div role="group" data-slot="field" class="grid min-w-0 gap-1">
    <div class="min-w-0" :class="horizontal ? 'flex flex-wrap items-center gap-2' : 'grid gap-1'">
      <label v-if="label" :for="id">{{ label }}<span v-if="required" class="text-flow-red" aria-hidden="true">*</span></label>
      <slot :control="control" />
    </div>
    <p v-if="description" :id="`${id}-description`" class="text-flow-subtext">{{ description }}</p>
    <div v-if="messages.length" class="flex flex-wrap items-baseline justify-between gap-2 text-flow-red">
      <div :id="`${id}-error`" data-slot="field-error" role="alert">
        <p v-for="message in messages" :key="message">{{ message }}</p>
      </div>
      <slot name="error-detail" />
    </div>
  </div>
</template>

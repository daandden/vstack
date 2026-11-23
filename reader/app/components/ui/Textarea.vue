<script setup lang="ts">
const value = defineModel<string>();
</script>

<template>
  <textarea
    v-model="value"
    data-slot="textarea"
    class="reader-field w-full min-w-0 rounded-sm border border-flow-dimmed bg-flow-base px-2 py-0.5 text-body placeholder:text-flow-dimmed disabled:opacity-75"
  />
</template>

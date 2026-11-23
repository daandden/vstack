<script setup lang="ts">
const value = defineModel<string>();
</script>

<template>
  <textarea
    v-model="value"
    data-slot="textarea"
    class="reader-textarea w-full min-w-0 rounded-md border border-flow-dimmed bg-[var(--base)] px-2 py-1 outline-none placeholder:text-flow-dimmed disabled:opacity-75 focus:border-flow-blue"
  />
</template>

<style scoped>
.reader-textarea[aria-invalid="true"] {
  border-color: var(--red);
}

.reader-textarea[aria-invalid="true"]:focus {
  box-shadow: inset 0 0 0 1px var(--red);
}
</style>

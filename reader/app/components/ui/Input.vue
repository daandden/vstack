<script setup lang="ts">
const value = defineModel<string | number>();
</script>

<template>
  <input
    v-model="value"
    data-slot="input"
    class="reader-input min-h-8 w-full min-w-0 rounded-md border border-flow-border bg-transparent px-2 py-1 outline-none placeholder:text-flow-dimmed disabled:cursor-not-allowed disabled:opacity-75 focus:border-flow-blue"
  >
</template>

<style scoped>
.reader-input[aria-invalid="true"] {
  border-color: var(--red);
}

.reader-input[aria-invalid="true"]:focus {
  box-shadow: inset 0 0 0 1px var(--red);
}
</style>

<script setup lang="ts">
const value = defineModel<string | number>();
</script>

<template>
  <input
    v-model="value"
    data-slot="input"
    class="reader-input u-min-h-8 u-w-full u-min-w-0 u-rounded-md u-border u-border-flow-border u-bg-transparent u-px-2 u-py-1 u-outline-none placeholder:u-text-flow-dimmed disabled:u-cursor-not-allowed disabled:u-opacity-75 focus:u-border-flow-blue"
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

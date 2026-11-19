<script setup lang="ts">
const value = defineModel<string>();
</script>

<template>
  <textarea
    v-model="value"
    data-slot="textarea"
    class="reader-textarea u-w-full u-min-w-0 u-rounded-md u-border u-border-flow-dimmed u-bg-[var(--base)] u-px-2 u-py-1 u-outline-none placeholder:u-text-flow-dimmed disabled:u-opacity-75 focus:u-border-flow-blue"
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

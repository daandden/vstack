<script setup lang="ts">
const value = defineModel<string | number>();
</script>

<template>
  <input
    v-model="value"
    data-slot="input"
    class="reader-field reader-control w-full min-w-0 border border-flow-dimmed bg-flow-base py-0.5 text-body placeholder:text-flow-dimmed disabled:cursor-not-allowed disabled:opacity-75"
  >
</template>

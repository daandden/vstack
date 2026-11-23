<script setup lang="ts">
defineOptions({ inheritAttrs: false });
</script>

<template>
  <div data-slot="table-container" class="relative w-full overflow-auto">
    <table v-bind="$attrs" data-slot="table" class="w-full caption-bottom text-sm">
      <slot />
    </table>
  </div>
</template>

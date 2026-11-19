<script setup lang="ts">
defineOptions({ inheritAttrs: false });
</script>

<template>
  <div data-slot="table-container" class="u-relative u-w-full u-overflow-auto">
    <table v-bind="$attrs" data-slot="table" class="u-w-full u-caption-bottom u-text-sm">
      <slot />
    </table>
  </div>
</template>

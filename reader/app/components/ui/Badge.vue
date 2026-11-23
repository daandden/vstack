<script setup lang="ts">
import { Primitive } from "reka-ui";
</script>

<template>
  <Primitive
    as="span"
    data-slot="badge"
    class="inline-flex items-center justify-center gap-1 rounded-full bg-[var(--color-mauve)]/10 text-[color:var(--color-mauve)] text-xs font-medium"
  >
    <slot />
  </Primitive>
</template>

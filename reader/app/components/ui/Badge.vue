<script setup lang="ts">
import { Primitive } from "reka-ui";
</script>

<template>
  <Primitive
    as="span"
    data-slot="badge"
    class="u-inline-flex u-items-center u-justify-center u-gap-1 u-rounded-full u-bg-[var(--mauve)]/10 u-text-[color:var(--mauve)] u-text-xs u-font-medium"
  >
    <slot />
  </Primitive>
</template>

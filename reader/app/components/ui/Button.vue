<script setup lang="ts">
import { Primitive, type PrimitiveProps } from "reka-ui";
import { buttonVariants, type ButtonVariants } from "./button-variants";

const { as = "button", asChild, variant = "outline" } = defineProps<PrimitiveProps & {
  variant?: ButtonVariants["variant"];
}>();
</script>

<template>
  <Primitive
    data-slot="button"
    :data-variant="variant"
    :as="as"
    :as-child="asChild"
    :type="as === 'button' && !asChild ? 'button' : undefined"
    class="reader-button"
    :class="buttonVariants({ variant })"
  >
    <slot />
  </Primitive>
</template>

<style scoped>
.reader-button:not([data-variant="bare"]):active:enabled {
  background: var(--color-surface0);
}

@media (hover: hover) and (pointer: fine) {
  .reader-button[data-variant="soft"]:hover:enabled:not(:active) {
    background: color-mix(in oklch, var(--color-surface0) 75%, transparent);
  }

  .reader-button[data-variant="outline"]:hover:enabled:not(:active),
  .reader-button[data-variant="ghost"]:hover:enabled:not(:active) {
    background: color-mix(in oklch, var(--color-surface0) 55%, var(--color-mantle));
  }
}
</style>

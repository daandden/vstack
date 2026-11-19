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
.reader-button {
  outline-color: color-mix(in oklab, var(--text) 25%, transparent);
}

.reader-button:focus-visible {
  outline-width: 3px;
}

.reader-button[data-variant="soft"]:active:enabled {
  background: var(--surface0);
}

@media (hover: hover) and (pointer: fine) {
  .reader-button[data-variant="soft"]:hover:enabled:not(:active) {
    background: color-mix(in oklab, var(--surface0) 75%, transparent);
  }

  .reader-button[data-variant="outline"]:hover:enabled {
    background: var(--mantle);
  }
}
</style>

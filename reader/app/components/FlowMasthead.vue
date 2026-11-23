<script setup lang="ts">
import { useReaderState } from "~/composables/reader";
const { flow } = useReaderState();

const f = computed(() => flow.value!);
</script>

<template>
  <header class="masthead grid gap-1 pbe-2">
    <p v-if="f.flow.crumb" class="quiet" v-html="inline(f.flow.crumb)" />
    <h1 v-html="inline(f.flow.title)" />
  </header>
</template>

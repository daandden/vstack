<script setup lang="ts">
import { useReaderState } from "~/composables/reader";
const { flow } = useReaderState();

const f = computed(() => flow.value!);
</script>

<template>
  <header class="masthead grid gap-1.5 [padding-block:0.75rem_0.5rem]">
    <p v-if="f.flow.crumb" class="quiet" v-html="inline(f.flow.crumb)" />
    <h1 v-html="inline(f.flow.title)" />
  </header>
</template>

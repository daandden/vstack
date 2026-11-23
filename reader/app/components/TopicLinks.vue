<script setup lang="ts">
import { useReaderState } from "~/composables/reader";

const { flow } = useReaderState();
</script>

<template>
  <ul v-if="flow?.topics.length" class="bullets wrap-anywhere">
    <li v-for="t in flow.topics" :key="t.id"><a :href="`#${t.id}`" v-html="inline(t.title)" /> <span class="quiet" v-html="inline(t.summary)" /></li>
  </ul>
  <p v-else class="quiet">No Topic notes yet.</p>
</template>

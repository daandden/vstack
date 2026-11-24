<script setup lang="ts">
import { readingAge, useReadingClock } from "~/composables/reading-clock";

const { round, numbers } = defineProps<{ round: { id: string; n: number; time: string; session?: number }; numbers: number[] }>();
const now = useReadingClock();
const time = computed(() => Date.parse(round.time));
const age = computed(() => readingAge(time.value, now.value));
</script>

<template>
  <header :id="round.id" class="meta">
    <span v-if="round.session !== undefined">Session {{ round.session }}</span>
    <h3 :id="`${round.id}-title`">Round {{ round.n }}</h3>
    <time v-if="round.time" :datetime="round.time">{{ eventTime(round.time) }}</time>
    <span v-if="age">{{ age }}</span>
    <span>{{ numbers.map(n => `Q${n}`).join(", ") }}</span>
  </header>
</template>

<script lang="ts">
import { createSharedComposable, formatTimeAgoIntl, useIntervalFn } from "@vueuse/core";

const useReadingClock = createSharedComposable((initial: number) => {
  const now = shallowRef(initial);
  useIntervalFn(() => { now.value = Date.now(); }, 60_000);
  return now;
});
</script>

<script setup lang="ts">
const { round, numbers } = defineProps<{ round: { id: string; n: number; time: string; session?: number }; numbers: number[] }>();
const initial = useState("flow-reading-clock", () => Date.now());
const now = useReadingClock(initial.value);
const age = computed(() => {
  const time = Date.parse(round.time);
  if (!Number.isFinite(time)) return undefined;
  if (Math.abs(time - now.value) < 60_000) return "just now";
  return formatTimeAgoIntl(new Date(time), { locale: "en", relativeTimeFormatOptions: { numeric: "always" } }, now.value);
});
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

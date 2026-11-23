<script setup lang="ts">
import { useReaderState } from "~/composables/reader";
const { flow } = useReaderState();
import type { Attachment } from "~/utils/flow";

const props = defineProps<{ a: Attachment; anchor: string }>();
const f = computed(() => flow.value!);
const src = computed(() => `assets/${props.a.file}`);

const video = ref<HTMLVideoElement>();
onMounted(() => {
  const v = video.value;
  if (!v) return;
  const key = `flow-page:playback:${f.value.flow.id}:${src.value}`;
  const get = () => { try { return Number(localStorage.getItem(key)); } catch { return 0; } };
  const set = (t: number | null) => { try { if (t === null) localStorage.removeItem(key); else localStorage.setItem(key, String(t)); } catch {} };
  const resume = () => {
    const t = get();
    if (t > 0 && t < v.duration) v.currentTime = t;
  };
  if (v.readyState >= 1) resume();
  else v.addEventListener("loadedmetadata", resume, { once: true });
  let saved = 0;
  v.addEventListener("timeupdate", () => {
    if (Math.abs(v.currentTime - saved) < 1) return;
    saved = v.currentTime;
    set(saved);
  });
  v.addEventListener("pause", () => set(v.currentTime));
  v.addEventListener("ended", () => set(null));
});
</script>

<template>
  <ArtifactView v-if="a.type === 'artifact'" :a="a" :runtime="f.runtimes[a.id]" :anchor="anchor" />
  <figure v-else :id="anchor" class="figure attachment grid grid-cols-[minmax(0,1fr)] justify-items-start gap-1.5" :data-type="a.type" :data-availability="a.availability">
    <FigureCaption :a="a" :anchor="anchor" />
    <p v-if="a.availability === 'unavailable'" class="flex flex-wrap items-baseline gap-x-3 gap-y-1"><span class="font-semibold text-error">Not captured</span> <span v-html="inline(a.reason ?? '')" /></p>
    <div v-else-if="a.availability === 'external'" class="grid gap-1.5">
      <p class="font-semibold text-muted">How to run it</p>
      <div class="grid gap-1.5" v-html="prose(a.launch ?? '')" />
      <p v-if="a.url"><a :href="a.url" rel="noreferrer">{{ a.url }}</a></p>
    </div>
    <img v-else-if="a.type === 'image'" class="rounded bg-accented" :src="src" :alt="a.caption" loading="lazy">
    <DiagramFigure v-else-if="a.type === 'svg' || a.type === 'mermaid'" :a="a" />
    <video v-else-if="a.type === 'video'" ref="video" class="rounded bg-accented" :src="src" controls preload="metadata" :aria-label="a.caption" />
    <p v-else class="flex flex-wrap items-baseline gap-x-3 gap-y-1"><a :href="src" :download="a.name" target="_blank" rel="noopener">{{ a.name }}</a> <span class="text-small text-muted">{{ size(a.size ?? 0) }}</span></p>
  </figure>
</template>

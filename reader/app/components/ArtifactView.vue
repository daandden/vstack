<script setup lang="ts">
import type { Attachment, Runtimes } from "~/utils/flow";

const props = defineProps<{ a: Attachment; runtime?: Runtimes[string]; anchor: string }>();
const available = computed(() => !!props.runtime?.url && props.a.availability !== "unavailable");
const reason = computed(() => props.a.reason ?? props.runtime?.reason ?? "Start the runtime with the launch steps below.");
</script>

<template>
  <div class="grid grid-cols-[minmax(0,1fr)] justify-items-start gap-1.5" :data-artifact="a.id">
    <FigureCaption :a="a" :anchor="anchor" as="div" />
    <div class="grid justify-self-stretch justify-items-stretch gap-1.5 rounded-md bg-muted px-3 py-2.5">
      <template v-if="available">
        <p role="status" class="font-semibold text-success" data-availability="available">Available in an isolated viewer</p>
        <iframe :id="`${anchor}-viewer`" class="block aspect-video w-full border border-flow-line bg-default" :title="a.caption" :src="runtime!.url" sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer" />
      </template>
      <p v-else role="status" class="font-semibold text-warning" data-availability="unavailable">Unavailable: <span v-html="inline(reason)" /></p>
      <details :id="`${anchor}-instructions`" class="text-small open:grid open:gap-1.5 [&>:not(summary)]:text-body" :open="!available || undefined">
        <summary>How to run it</summary>
        <div class="grid gap-1.5" v-html="prose(a.launch ?? '')" />
        <p v-if="!a.runtime && a.url"><a :href="a.url" target="_blank" rel="noopener noreferrer">{{ a.url }}</a></p>
      </details>
    </div>
  </div>
</template>

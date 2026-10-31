<script setup lang="ts">
import type { Attachment, Runtimes } from "~/utils/flow";

// A runnable artifact runs only on the host's separate viewer origin, inside a sandboxed frame. When the host knows
// no viewer for it, the reader says why and shows the producer's real launch steps instead.
const props = defineProps<{ a: Attachment; runtime?: Runtimes[string]; anchor: string }>();
const available = computed(() => !!props.runtime?.url && props.a.availability !== "unavailable");
const reason = computed(() => props.a.reason ?? props.runtime?.reason ?? "Start the runtime with the launch steps below.");
</script>

<template>
  <div class="runnable" :data-artifact="a.id">
    <template v-if="available">
      <p role="status" data-availability="available">Available in an isolated viewer</p>
      <iframe :id="`${anchor}-viewer`" class="viewer" :title="a.caption" :src="runtime!.url" sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer" />
    </template>
    <p v-else role="status" data-availability="unavailable">Unavailable: <span v-html="inline(reason)" /></p>
    <p v-html="inline(a.caption)" />
    <details class="disclosure" :open="!available || undefined">
      <summary>How to run it</summary>
      <div class="prose" v-html="prose(a.launch ?? '')" />
      <p v-if="!a.runtime && a.url"><a :href="a.url" target="_blank" rel="noopener noreferrer">{{ a.url }}</a></p>
    </details>
    <p class="quiet">Origin: <span v-html="inline(a.origin)" />. Revision <code>{{ a.revision }}</code></p>
  </div>
</template>

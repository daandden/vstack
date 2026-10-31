<script setup lang="ts">
import type { Figure } from "#flow/model.ts";
import { flow } from "~/composables/reader";

defineProps<{ figures?: Figure[] }>();
const f = computed(() => flow.value!);
const attachment = (id: string) => f.value.attachments.find((a) => a.id === id);
// Migrated historical HTML figures were safety-checked at migration; their CSS applies only inside the figure.
const scoped = (css: string, id: string) => css.replace(/([^{}]+)\{([^{}]*)\}/g, (_, selectors: string, body: string) =>
  `${selectors.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (s === ":scope" ? `#${id}` : `#${id} ${s.replace(/^:scope\s*/, "")}`)).join(", ")} { ${body} }`);
const historical = (fig: { id: string; html: string; css?: string }) => `${fig.css ? `<style>${scoped(fig.css, fig.id)}</style>` : ""}${fig.html}`;
</script>

<template>
  <template v-for="fig in figures ?? []" :key="fig.id">
    <div v-if="'text' in fig" :id="fig.id" class="visual"><pre>{{ fig.text }}</pre></div>
    <div v-else-if="'html' in fig" :id="fig.id" class="visual" v-html="historical(fig)" />
    <figure v-else :id="fig.id" class="visual">
      <img v-if="attachment(fig.attachment)?.availability === 'captured'" :src="`assets/${attachment(fig.attachment)!.file}`" :alt="attachment(fig.attachment)!.caption">
      <p v-else class="unavailable"><span class="label">Figure unavailable</span> <span v-html="inline(attachment(fig.attachment)?.reason ?? 'The attachment is missing.')" /></p>
    </figure>
  </template>
</template>

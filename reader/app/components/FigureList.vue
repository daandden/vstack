<script setup lang="ts">
import type { Figure } from "#flow/model.ts";
import { flow } from "~/composables/reader";

const props = defineProps<{ figures?: Figure[]; question?: number }>();
const f = computed(() => flow.value!);
const attachment = (id: string) => f.value.attachments.find((a) => a.id === id);
const scoped = (css: string, id: string) => css.replace(/([^{}]+)\{([^{}]*)\}/g, (_, selectors: string, body: string) =>
  `${selectors.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (s === ":scope" ? `#${id}` : `#${id} ${s.replace(/^:scope\s*/, "")}`)).join(", ")} { ${body} }`);
const title = (caption: string) => props.question === undefined ? caption : `Q${props.question} · ${caption.replace(/^Q\d+ · /, "")}`;
const unknown = "Unrecorded example identity, theme, or viewport: unknown.";
const duplicate = (index: number, caption: string) => {
  const previous = props.figures?.[index - 1];
  return previous && "text" in previous && previous.text === title(caption);
};
const historical = (fig: { id: string; html: string; css?: string }) => {
  const doc = new DOMParser().parseFromString(fig.html, "text/html");
  for (const img of doc.querySelectorAll("img")) {
    const a = f.value.attachments.find((a) => a.file && img.getAttribute("src")?.split("#")[0] === `assets/${a.file}`);
    const caption = title(a?.caption || img.getAttribute("alt") || "Example identity unknown");
    const media = img.closest("picture") ?? img;
    const label = doc.createElement("div");
    label.className = "figure-caption prose";
    if (media.previousElementSibling?.textContent !== caption) {
      const heading = doc.createElement("p");
      heading.className = "label";
      heading.textContent = caption;
      label.append(heading);
    }
    const origin = doc.createElement("p");
    origin.className = "quiet";
    origin.textContent = `Origin: ${a?.origin ?? "unknown"}. ${unknown}`;
    label.append(origin);
    media.before(label);
  }
  return `${fig.css ? `<style>${scoped(fig.css, fig.id)}</style>` : ""}${doc.body.innerHTML}`;
};
</script>

<template>
  <template v-for="(fig, index) in figures ?? []" :key="fig.id">
    <div v-if="'text' in fig" :id="fig.id" class="visual"><pre>{{ fig.text }}</pre></div>
    <div v-else-if="'html' in fig" :id="fig.id" class="visual" v-html="historical(fig)" />
    <figure v-else :id="fig.id" class="visual">
      <figcaption v-if="attachment(fig.attachment)" class="figure-caption prose">
        <p v-if="!duplicate(index, attachment(fig.attachment)!.caption)" class="label">{{ title(attachment(fig.attachment)!.caption) }}</p>
        <p class="quiet">Origin: <span v-html="inline(attachment(fig.attachment)!.origin)" /></p>
        <p v-if="attachment(fig.attachment)!.type === 'image' || attachment(fig.attachment)!.type === 'svg'" class="quiet">{{ unknown }}</p>
      </figcaption>
      <DiagramFigure v-if="attachment(fig.attachment)?.availability === 'captured' && attachment(fig.attachment)!.type !== 'image'" :a="attachment(fig.attachment)!" />
      <img v-else-if="attachment(fig.attachment)?.availability === 'captured'" :src="`assets/${attachment(fig.attachment)!.file}`" :alt="attachment(fig.attachment)!.caption">
      <p v-else class="unavailable"><span class="label">Figure unavailable</span> <span v-html="inline(attachment(fig.attachment)?.reason ?? 'The attachment is missing.')" /></p>
    </figure>
  </template>
</template>

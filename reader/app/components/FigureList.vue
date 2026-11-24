<script setup lang="ts">
import type { Attachment, Figure } from "#flow/model.ts";
import { useReaderState } from "~/composables/reader";
const { flow } = useReaderState();

const { figures, part = "complete" } = defineProps<{ figures?: Figure[]; part?: "complete" | "inline" | "enlarged" | "source" }>();
const f = computed(() => flow.value!);
const attachment = (id: string) => f.value.attachments.find((a) => a.id === id);
const displayId = (id: string) => part === "enlarged" ? `${id}-enlarged` : id;
const scoped = (css: string, id: string) => css.replace(/([^{}]+)\{([^{}]*)\}/g, (_, selectors: string, body: string) =>
  `${selectors.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (s === ":scope" ? `#${id}` : `#${id} ${s.replace(/^:scope\s*/, "")}`)).join(", ")} { ${body} }`);
const withImages = (html: string) => /<img\b/i.test(html);
const hydrated = shallowRef(false);
onMounted(() => { hydrated.value = true; });

type HistoricalSource = { key: string; slot: string; a?: Attachment };
const sourcePrefix = useId();

const historical = (fig: { id: string; html: string; css?: string }, index: number) => {
  const sources: HistoricalSource[] = [];
  const stylesheet = fig.css && part !== "source" ? `<style>${scoped(fig.css, displayId(fig.id))}</style>` : "";
  if (!hydrated.value || !withImages(fig.html)) return { html: part === "source" ? "" : `${stylesheet}${fig.html}`, sources };
  const doc = new DOMParser().parseFromString(fig.html, "text/html");
  for (const img of doc.querySelectorAll("img")) {
    const src = img.getAttribute("src");
    const alt = img.getAttribute("alt");
    const file = src?.split("#", 1)[0];
    const a = f.value.attachments.find((a) => a.file && file === `assets/${a.file}`);
    const slot = `${sourcePrefix}-${index}-${sources.length}`;
    if (part === "source" || part === "complete") sources.push({ a, slot, key: JSON.stringify([fig.id, src, alt]) });
    if (part === "source") continue;
    const title = withoutQuestionNumber(a?.caption || alt || "Example identity unknown");
    const media = img.closest("picture") ?? img;
    const label = doc.createElement("div");
    label.className = "figure-caption grid justify-self-stretch gap-1";
    const previous = media.previousElementSibling;
    const heading = previous && withoutQuestionNumber(previous.textContent ?? "") === title ? previous : doc.createElement("p");
    heading.className = "figure-title font-heading text-body leading-heading [font-weight:var(--font-weight-heading)] text-flow-text text-balance";
    heading.textContent = title;
    label.append(heading);
    if (part === "complete") {
      const host = doc.createElement("div");
      host.dataset.figureSource = slot;
      label.append(host);
    }
    media.before(label);
  }
  return { html: part === "source" ? "" : `${stylesheet}${doc.body.innerHTML}`, sources };
};
const displays = computed(() => (figures ?? []).map((fig, index) => ({
  fig, legacy: "html" in fig ? historical(fig, index) : undefined,
})));
</script>

<template>
  <template v-for="{ fig, legacy } in displays" :key="fig.id">
    <template v-if="part === 'source'">
      <FigureSource v-if="'attachment' in fig && attachment(fig.attachment)" :id="`${fig.id}-source`" :a="attachment(fig.attachment)!" />
      <div v-else-if="legacy?.sources.length" class="grid gap-1">
        <FigureSource v-for="source in legacy.sources" :key="source.slot" :data-reload-key="source.key" :a="source.a" />
      </div>
    </template>
    <div v-else-if="'text' in fig" :id="displayId(fig.id)" class="visual relative grid grid-cols-[minmax(0,1fr)] justify-items-start gap-1 overflow-x-auto rounded-md bg-flow-muted p-2" :tabindex="part === 'complete' ? undefined : 0" @keydown="part !== 'complete' && $event.stopPropagation()"><pre>{{ fig.text }}</pre></div>
    <template v-else-if="'html' in fig" :key="legacy!.html">
      <div :id="displayId(fig.id)" class="grid grid-cols-[minmax(0,1fr)] justify-items-start gap-1 [&_img]:rounded [&_img]:bg-flow-accented [&_video]:rounded [&_video]:bg-flow-accented"
        :class="withImages(fig.html) ? 'figure' : 'visual relative overflow-x-auto rounded-md bg-flow-muted p-2'" v-html="legacy!.html" />
      <Teleport v-for="source in legacy!.sources" :key="source.slot" :to="`[data-figure-source='${source.slot}']`" defer>
        <FigureSource :data-reload-key="source.key" :a="source.a" />
      </Teleport>
    </template>
    <figure v-else :id="displayId(fig.id)" class="figure grid grid-cols-[minmax(0,1fr)] justify-items-start gap-1.5">
      <FigureCaption v-if="attachment(fig.attachment)" :a="attachment(fig.attachment)!" :anchor="displayId(fig.id)" :hide-source="part !== 'complete'" />
      <DiagramFigure v-if="attachment(fig.attachment)?.availability === 'captured' && attachment(fig.attachment)!.type !== 'image'" :a="attachment(fig.attachment)!" />
      <img v-else-if="attachment(fig.attachment)?.availability === 'captured'" class="rounded bg-flow-accented" :src="`assets/${attachment(fig.attachment)!.file}`" :alt="attachment(fig.attachment)!.caption">
      <p v-else class="flex flex-wrap items-baseline gap-x-3 gap-y-1"><span class="font-semibold text-flow-red">Figure unavailable</span> <span v-html="inline(attachment(fig.attachment)?.reason ?? 'The attachment is missing.')" /></p>
    </figure>
  </template>
</template>

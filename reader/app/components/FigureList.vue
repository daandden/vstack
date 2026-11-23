<script setup lang="ts">
import type { Attachment, Figure } from "#flow/model.ts";
import { useReaderState } from "~/composables/reader";
const { flow } = useReaderState();

defineProps<{ figures?: Figure[] }>();
const f = computed(() => flow.value!);
const attachment = (id: string) => f.value.attachments.find((a) => a.id === id);
const scoped = (css: string, id: string) => css.replace(/([^{}]+)\{([^{}]*)\}/g, (_, selectors: string, body: string) =>
  `${selectors.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (s === ":scope" ? `#${id}` : `#${id} ${s.replace(/^:scope\s*/, "")}`)).join(", ")} { ${body} }`);
const withImages = (html: string) => /<img\b/i.test(html);
const hydrated = shallowRef(false);
onMounted(() => { hydrated.value = true; });

function source(doc: Document, a: Attachment | undefined): HTMLDetailsElement {
  const details = doc.createElement("details");
  details.className = "source text-small open:grid open:gap-1.5 [&>:not(summary)]:text-body";
  const add = (tag: string, text: string, className?: string) => {
    const el = doc.createElement(tag);
    el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  details.append(add("summary", "Source"));
  if (a) {
    const facts = sourceFacts(a);
    const meta = add("p", "", "flex flex-wrap items-baseline gap-x-3.5 gap-y-0.5 text-small text-flow-subtext");
    meta.append(add("span", TYPE_LABELS[a.type] ?? a.type, "font-semibold text-flow-teal"), add("span", facts.state));
    if (facts.revision) meta.append(add("span", `Revision ${facts.revision}`));
    if (facts.from) meta.append(add("span", `From ${facts.from}`));
    meta.append(add("time", formatTime(a.time)));
    details.append(meta);
  }
  details.append(add("p", `Origin: ${a?.origin ?? "unknown"}`), add("p", UNKNOWN_EXAMPLE, "quiet"));
  return details;
}

const historical = (fig: { id: string; html: string; css?: string }) => {
  if (!hydrated.value) return `${fig.css ? `<style>${scoped(fig.css, fig.id)}</style>` : ""}${fig.html}`;
  const doc = new DOMParser().parseFromString(fig.html, "text/html");
  for (const img of doc.querySelectorAll("img")) {
    const a = f.value.attachments.find((a) => a.file && img.getAttribute("src")?.split("#")[0] === `assets/${a.file}`);
    const title = withoutQuestionNumber(a?.caption || img.getAttribute("alt") || "Example identity unknown");
    const media = img.closest("picture") ?? img;
    const label = doc.createElement("div");
    label.className = "figure-caption grid justify-self-stretch gap-1";
    const previous = media.previousElementSibling;
    const heading = previous && withoutQuestionNumber(previous.textContent ?? "") === title ? previous : doc.createElement("p");
    heading.className = "figure-title font-heading text-body leading-heading [font-weight:var(--font-weight-heading)] text-flow-text text-balance";
    heading.textContent = title;
    label.append(heading, source(doc, a));
    media.before(label);
  }
  return `${fig.css ? `<style>${scoped(fig.css, fig.id)}</style>` : ""}${doc.body.innerHTML}`;
};
</script>

<template>
  <template v-for="fig in figures ?? []" :key="fig.id">
    <div v-if="'text' in fig" :id="fig.id" class="visual relative grid grid-cols-[minmax(0,1fr)] justify-items-start gap-1 overflow-x-auto rounded-md bg-flow-muted p-2"><pre>{{ fig.text }}</pre></div>
    <div v-else-if="'html' in fig" :id="fig.id" class="grid grid-cols-[minmax(0,1fr)] justify-items-start gap-1 [&_img]:rounded [&_img]:bg-flow-accented [&_video]:rounded [&_video]:bg-flow-accented" :class="withImages(fig.html) ? 'figure' : 'visual relative overflow-x-auto rounded-md bg-flow-muted p-2'" v-html="historical(fig)" />
    <figure v-else :id="fig.id" class="figure grid grid-cols-[minmax(0,1fr)] justify-items-start gap-1.5">
      <FigureCaption v-if="attachment(fig.attachment)" :a="attachment(fig.attachment)!" />
      <DiagramFigure v-if="attachment(fig.attachment)?.availability === 'captured' && attachment(fig.attachment)!.type !== 'image'" :a="attachment(fig.attachment)!" />
      <img v-else-if="attachment(fig.attachment)?.availability === 'captured'" class="rounded bg-flow-accented" :src="`assets/${attachment(fig.attachment)!.file}`" :alt="attachment(fig.attachment)!.caption">
      <p v-else class="flex flex-wrap items-baseline gap-x-3 gap-y-1"><span class="font-semibold text-flow-red">Figure unavailable</span> <span v-html="inline(attachment(fig.attachment)?.reason ?? 'The attachment is missing.')" /></p>
    </figure>
  </template>
</template>

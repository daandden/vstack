<script setup lang="ts">
import { highlighter, markTrailing } from "#flow/code.ts";
import type { DocView } from "#flow/model.ts";
import type { Cites } from "~/utils/format";
import type { ResultView } from "~/utils/flow";

const props = defineProps<{ r: ResultView; doc: DocView; historical: boolean }>();
const cites = computed<Cites>(() => new Map(props.doc.citations.map((c) => [c.ref, { anchor: c.anchor, n: c.n }])));
const shown = computed(() => new Map(props.r.shown.map((a) => [a.id, a])));
const heading = (id: string) => props.doc.sections.find((s) => s.anchor === id)?.heading ?? id;
const code = (text: string, language?: string) => {
  const hl = highlighter(language);
  return text.split("\n").map((l) => markTrailing(hl.line(l)).map((t) => (t.kind ? `<span class="tok-${t.kind}">${esc(t.text)}</span>` : esc(t.text))).join("")).join("\n");
};
const stop = computed(() => (props.historical ? undefined : ""));
</script>

<template>
  <div class="document">
    <section v-for="sec in doc.sections" :id="sec.anchor" :key="sec.anchor" class="doc-section" :aria-labelledby="`${sec.anchor}-title`" :data-stop="stop">
      <h3 :id="`${sec.anchor}-title`" v-html="inline(sec.heading)" />
      <template v-for="(b, i) in sec.blocks" :key="i">
        <div v-if="'prose' in b" class="prose" v-html="prose(b.prose, cites)" />
        <component :is="b.ordered ? 'ol' : 'ul'" v-else-if="'list' in b" class="bullets">
          <li v-for="(t, j) in b.list" :key="j" v-html="inline(t, cites)" />
        </component>
        <figure v-else-if="'code' in b" class="code">
          <pre :data-language="b.language"><code v-html="code(b.code, b.language)" /></pre>
          <figcaption v-if="b.language || b.source" class="quiet">{{ [b.language, b.source].filter(Boolean).join(" · ") }}</figcaption>
        </figure>
        <AttachmentFigure v-else-if="shown.get(b.figure)" :a="shown.get(b.figure)!" :anchor="`${sec.anchor}-f${i + 1}`" />
      </template>
    </section>
    <section v-if="doc.limitations.length" :id="doc.limitationsAnchor" class="labelled limitations" :data-stop="stop">
      <p class="label">Limitations</p>
      <ul class="bullets"><li v-for="(l, i) in doc.limitations" :key="i" v-html="inline(l)" /></ul>
    </section>
    <section v-if="doc.citations.length" :id="doc.citationsAnchor" class="labelled" aria-label="Citations" :data-stop="stop">
      <p class="label">Citations</p>
      <ol class="bullets">
        <li v-for="c in doc.citations" :id="c.anchor" :key="c.anchor">
          <span v-html="inline(c.text)" />
          <a v-for="s in c.cited_in" :key="s" class="backlink" :href="`#${s}`"> Cited in <span v-html="inline(heading(s))" /></a>
        </li>
      </ol>
    </section>
    <details v-if="doc.sources.length" :id="doc.sourcesAnchor" class="disclosure">
      <summary>Sources ({{ doc.sources.length }})</summary>
      <ul class="bullets"><li v-for="(x, i) in doc.sourceTexts" :key="i" v-html="inline(x)" /></ul>
    </details>
  </div>
</template>

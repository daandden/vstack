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
  <div class="grid gap-2.5 [&_.cite]:text-small [&_.cite]:font-semibold [&_.cite]:tabular-nums [&_.cite]:no-underline [&_.bullets]:grid [&_.bullets]:list-disc [&_.bullets]:gap-0.5 [&_.bullets]:ps-5 [&_.bullets]:marker:text-dimmed">
    <section v-for="sec in doc.sections" :id="sec.anchor" :key="sec.anchor" class="doc-section grid gap-2.5 target:bg-accented" :aria-labelledby="`${sec.anchor}-title`" :data-stop="stop">
      <h3 :id="`${sec.anchor}-title`" class="text-secondary" v-html="inline(sec.heading)" />
      <template v-for="(b, i) in sec.blocks" :key="i">
        <div v-if="'prose' in b" class="grid gap-1.5" v-html="prose(b.prose, cites)" />
        <component :is="b.ordered ? 'ol' : 'ul'" v-else-if="'list' in b" class="grid list-disc gap-0.5 ps-5 marker:text-dimmed">
          <li v-for="(t, j) in b.list" :key="j" v-html="inline(t, cites)" />
        </component>
        <ol v-else-if="'steps' in b" aria-label="Procedure steps" role="list" class="list-none ps-3">
          <li v-for="(step, j) in b.steps" :key="j" class="relative grid gap-1.5 border-s border-flow-line ps-5 pbe-4 last:border-s-transparent last:pbe-0">
            <UBadge color="primary" variant="soft" class="absolute -inset-s-3 inset-bs-0 flex size-6 justify-center rounded-full p-0 tabular-nums">{{ j + 1 }}</UBadge>
            <h4 class="font-semibold" v-html="inline(step.title, cites)" />
            <div class="grid gap-1.5" v-html="prose(step.text, cites)" />
          </li>
        </ol>
        <CodeFrame v-else-if="'code' in b" :html="code(b.code, b.language)" :language="b.language">
          <template v-if="b.language || b.source" #caption>{{ [b.language, b.source].filter(Boolean).join(" · ") }}</template>
        </CodeFrame>
        <AttachmentFigure v-else-if="shown.get(b.figure)" :a="shown.get(b.figure)!" :anchor="`${sec.anchor}-f${i + 1}`" />
      </template>
    </section>
    <section v-if="doc.limitations.length" :id="doc.limitationsAnchor" class="grid gap-1.5" :data-stop="stop">
      <p class="font-semibold text-warning">Limitations</p>
      <ul class="grid list-disc gap-0.5 ps-5 marker:text-dimmed"><li v-for="(l, i) in doc.limitations" :key="i" v-html="inline(l)" /></ul>
    </section>
    <section v-if="doc.citations.length" :id="doc.citationsAnchor" class="grid gap-1.5" aria-label="Citations" :data-stop="stop">
      <p class="font-semibold text-[var(--pink)]">Citations</p>
      <ol class="grid list-disc gap-0.5 ps-5 marker:text-dimmed">
        <li v-for="c in doc.citations" :id="c.anchor" :key="c.anchor">
          <span v-html="inline(c.text)" />
          <a v-for="s in c.cited_in" :key="s" class="text-small font-semibold tabular-nums no-underline" :href="`#${s}`"> Cited in <span v-html="inline(heading(s))" /></a>
        </li>
      </ol>
    </section>
    <details v-if="doc.sources.length" :id="doc.sourcesAnchor" class="text-small open:grid open:gap-1.5 [&>:not(summary)]:text-body">
      <summary>Sources ({{ doc.sources.length }})</summary>
      <ul class="grid list-disc gap-0.5 ps-5 marker:text-dimmed"><li v-for="(x, i) in doc.sourceTexts" :key="i" v-html="inline(x)" /></ul>
    </details>
  </div>
</template>

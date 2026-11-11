<script setup lang="ts">
import type { ComparisonView } from "#flow/model.ts";
import type { Attachment } from "~/utils/flow";

const props = defineProps<{ c: ComparisonView; shown: Map<string, Attachment> }>();
const chosen = computed(() => props.c.alternatives.find((a) => a.ref === props.c.verdict.alternative));
const cells = (criterion: string) => props.c.cells.filter((x) => x.criterion === criterion);
const sides = computed(() => props.c.alternatives.filter((a) => a.attachments?.length));
</script>

<template>
  <div class="grid gap-2.5">
    <section :id="c.verdict.anchor" class="grid gap-1 rounded border-s-2 border-[var(--state)] bg-muted px-3 py-2" :class="c.verdict.outcome === 'chosen' ? '[--state:var(--green)]' : c.verdict.outcome === 'tie' ? '[--state:var(--lavender)]' : '[--state:var(--peach)]'" :data-outcome="c.verdict.outcome">
      <p class="font-semibold text-muted">Verdict</p>
      <p class="flex flex-wrap items-baseline gap-x-3 gap-y-1"><span class="text-small font-semibold text-flow-state">{{ VERDICT_LABELS[c.verdict.outcome] }}</span> <a v-if="chosen" class="font-bold no-underline" :href="`#${chosen.anchor}`" v-html="inline(chosen.name)" /></p>
      <div class="grid gap-1.5" v-html="prose(c.verdict.reason)" />
    </section>
    <div class="relative overflow-x-auto">
      <table class="border-collapse tabular-nums [&_th]:min-w-40 [&_th]:text-small [&_th]:font-semibold [&_th]:text-muted [&_th]:px-2 [&_th]:py-1 [&_th]:border-be [&_th]:border-flow-line [&_th]:text-start [&_th]:align-top [&_td]:min-w-40 [&_td]:px-2 [&_td]:py-1 [&_td]:border-be [&_td]:border-flow-line [&_td]:text-start [&_td]:align-top [&_tr:target]:bg-accented">
        <thead>
          <tr>
            <th scope="col">Criterion</th>
            <th v-for="a in c.alternatives" :id="a.anchor" :key="a.anchor" scope="col" :class="a.ref === c.verdict.alternative ? 'text-success!' : undefined" :data-chosen="a.ref === c.verdict.alternative ? '' : undefined">
              <span v-html="inline(a.name)" /><span v-if="a.ref === c.verdict.alternative" class="sr-only"> (chosen)</span>
              <p v-if="a.summary" class="text-small text-muted" v-html="inline(a.summary)" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="k in c.criteria" :id="k.anchor" :key="k.anchor">
            <th scope="row" class="text-body! text-default!"><span v-html="inline(k.name)" /><p v-if="k.description" class="text-small text-muted" v-html="inline(k.description)" /></th>
            <td v-for="x in cells(k.ref)" :id="x.anchor" :key="x.anchor" :data-gap="x.assessment ? undefined : ''">
              <span v-if="!x.assessment" class="font-semibold text-dimmed">Not assessed</span>
              <template v-else>
                <div class="grid gap-1.5" v-html="prose(x.assessment.finding)" />
                <p v-if="x.assessment.evidence" class="text-small text-muted"><span class="font-semibold">Evidence</span> <span v-html="inline(x.assessment.evidence)" /></p>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-for="a in sides" :key="a.anchor" class="grid gap-2.5">
      <p class="font-semibold text-muted">Evidence for <a :href="`#${a.anchor}`" v-html="inline(a.name)" /></p>
      <template v-for="id in a.attachments" :key="id">
        <AttachmentFigure v-if="shown.get(id)" :a="shown.get(id)!" :anchor="`${a.anchor}-${id}`" />
      </template>
    </div>
  </div>
</template>

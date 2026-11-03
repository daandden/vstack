<script setup lang="ts">
import type { ComparisonView } from "#flow/model.ts";
import type { Attachment } from "~/utils/flow";

const props = defineProps<{ c: ComparisonView; shown: Map<string, Attachment> }>();
const chosen = computed(() => props.c.alternatives.find((a) => a.ref === props.c.verdict.alternative));
const cells = (criterion: string) => props.c.cells.filter((x) => x.criterion === criterion);
const sides = computed(() => props.c.alternatives.filter((a) => a.attachments?.length));
</script>

<template>
  <div class="comparison">
    <section :id="c.verdict.anchor" class="verdict" :data-outcome="c.verdict.outcome">
      <p class="label">Verdict</p>
      <p class="verdict-line"><span class="tag">{{ VERDICT_LABELS[c.verdict.outcome] }}</span> <a v-if="chosen" :href="`#${chosen.anchor}`" v-html="inline(chosen.name)" /></p>
      <div class="prose" v-html="prose(c.verdict.reason)" />
    </section>
    <div class="table">
      <table class="compare">
        <thead>
          <tr>
            <th scope="col">Criterion</th>
            <th v-for="a in c.alternatives" :id="a.anchor" :key="a.anchor" scope="col" :data-chosen="a.ref === c.verdict.alternative ? '' : undefined">
              <span v-html="inline(a.name)" /><span v-if="a.ref === c.verdict.alternative" class="sr-only"> (chosen)</span>
              <p v-if="a.summary" class="quiet" v-html="inline(a.summary)" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="k in c.criteria" :id="k.anchor" :key="k.anchor">
            <th scope="row"><span v-html="inline(k.name)" /><p v-if="k.description" class="quiet" v-html="inline(k.description)" /></th>
            <td v-for="x in cells(k.ref)" :id="x.anchor" :key="x.anchor" :data-gap="x.assessment ? undefined : ''">
              <span v-if="!x.assessment" class="gap">Not assessed</span>
              <template v-else>
                <div class="prose" v-html="prose(x.assessment.finding)" />
                <p v-if="x.assessment.evidence" class="quiet"><span class="label">Evidence</span> <span v-html="inline(x.assessment.evidence)" /></p>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-for="a in sides" :key="a.anchor" class="attachments">
      <p class="label">Evidence for <a :href="`#${a.anchor}`" v-html="inline(a.name)" /></p>
      <template v-for="id in a.attachments" :key="id">
        <AttachmentFigure v-if="shown.get(id)" :a="shown.get(id)!" :anchor="`${a.anchor}-${id}`" />
      </template>
    </div>
  </div>
</template>

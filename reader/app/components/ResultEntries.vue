<script setup lang="ts">
import type { Figure } from "#flow/model.ts";
import { flow } from "~/composables/reader";
import type { ResultView } from "~/utils/flow";

const props = defineProps<{ r: ResultView }>();
const f = computed(() => flow.value!);
const shown = computed(() => new Map(props.r.shown.map((a) => [a.id, a])));
const linked = computed(() => props.r.entries.some((e) => e.questions.length));
const ask = (id: string) => f.value.question.get(id);
const str = (v: unknown) => v as string;
const figures = (v: unknown) => v as Figure[] | undefined;
const attachments = (v: unknown) => ((v as string[] | undefined) ?? []).map((id) => shown.value.get(id)).filter((a) => a !== undefined);
</script>

<template>
  <div v-if="r.shape === 'table'" class="table">
    <table>
      <thead>
        <tr><th v-for="(c, i) in r.columns" :key="i" scope="col" v-html="inline(c)" /><th v-if="linked" scope="col">Asked in</th></tr>
      </thead>
      <tbody>
        <tr v-for="e in r.entries" :id="e.anchor" :key="e.anchor">
          <td v-for="(c, i) in e.cells as string[]" :key="i"><span v-html="inline(c)" /></td>
          <td v-if="linked"><template v-for="(id, i) in e.questions" :key="id">{{ i ? "; " : "" }}<a :href="`#${id}`">Q{{ ask(id)?.q }}</a>: <span v-html="inline(ask(id)?.title ?? '')" /></template></td>
        </tr>
      </tbody>
    </table>
  </div>
  <ol v-else-if="r.shape === 'code'" class="entries">
    <CodeEntry v-for="e in r.entries" :key="e.anchor" :e="e" />
  </ol>
  <ol v-else-if="r.shape === 'timeline'" class="timeline">
    <li v-for="e in r.entries" :id="e.anchor" :key="e.anchor" class="event" :data-outcome="e.outcome">
      <p class="meta">
        <time v-if="e.time" :datetime="str(e.time)">{{ eventTime(str(e.time)) }}</time><span v-else class="gap">Time not recorded</span>
        <span class="outcome">{{ OUTCOME_LABELS[str(e.outcome)] }}</span>
      </p>
      <h3><span class="entry-id">{{ e.id }}</span><span v-html="inline(str(e.title))" /></h3>
      <div v-if="e.detail" class="prose" v-html="prose(str(e.detail))" />
      <dl v-if="e.evidence" class="fields"><dt>Evidence</dt><dd v-html="inline(str(e.evidence))" /></dl>
      <div v-if="attachments(e.attachments).length" class="attachments">
        <AttachmentFigure v-for="a in attachments(e.attachments)" :key="a.id" :a="a" :anchor="`${e.anchor}-${a.id}`" />
      </div>
      <EntryAsks :questions="e.questions" />
    </li>
  </ol>
  <ol v-else-if="r.shape === 'ledger'" class="entries">
    <li v-for="e in r.entries" :id="e.anchor" :key="e.anchor" class="claim" :data-status="e.status">
      <h3><span class="entry-id">{{ e.id }}</span><span v-html="inline(str(e.claim))" /></h3>
      <p class="tag">{{ CLAIM_LABELS[str(e.status)] }}</p>
      <dl class="fields">
        <dt>Evidence</dt><dd v-html="inline(str(e.evidence))" />
        <dt>Missing proof</dt><dd v-html="inline(str(e.missing_proof))" />
        <dt>Consequence</dt><dd v-html="inline(str(e.consequence))" />
      </dl>
      <EntryAsks :questions="e.questions" />
    </li>
  </ol>
  <ol v-else class="entries">
    <li v-for="e in r.entries" :id="e.anchor" :key="e.anchor" class="card" :data-blocking="e.blocking ? '' : undefined">
      <h3><span class="entry-id">{{ e.id }}</span><span v-html="inline(str(e.title))" /></h3>
      <p class="tag"><span v-html="inline(str(e.label))" /> ({{ e.blocking ? "blocking" : "non-blocking" }})</p>
      <dl class="fields">
        <dt>Impact</dt><dd v-html="inline(str(e.impact))" />
        <dt>Action</dt><dd v-html="inline(str(e.action))" />
        <template v-if="r.shape === 'review'">
          <dt>Axis</dt><dd>{{ AXIS_LABELS[str(e.axis)] }}</dd>
          <dt>Location</dt><dd v-html="inline(str(e.location))" />
        </template>
      </dl>
      <details class="disclosure"><summary>Evidence</summary><p v-html="inline(str(e.evidence))" /></details>
      <FigureList :figures="figures(e.figures)" />
      <EntryAsks :questions="e.questions" />
    </li>
  </ol>
</template>

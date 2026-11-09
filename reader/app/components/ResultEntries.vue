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
  <div v-if="r.shape === 'table'" class="relative overflow-x-auto">
    <table class="border-collapse tabular-nums [&_th]:text-small [&_th]:font-semibold [&_th]:text-muted [&_th]:px-2 [&_th]:py-1 [&_th]:border-be [&_th]:border-flow-line [&_th]:text-start [&_th]:align-top [&_td]:px-2 [&_td]:py-1 [&_td]:border-be [&_td]:border-flow-line [&_td]:text-start [&_td]:align-top [&_tr:target]:bg-accented">
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
  <ol v-else-if="r.shape === 'code'" class="grid list-none gap-3 ps-0">
    <CodeEntry v-for="e in r.entries" :key="e.anchor" :e="e" />
  </ol>
  <ol v-else-if="r.shape === 'timeline'" class="grid list-decimal ps-4">
    <li v-for="e in r.entries" :id="e.anchor" :key="e.anchor" class="event border-s border-flow-line pbs-0 pbe-4 ps-3 [&>*+*]:mbs-1.5 marker:text-[var(--outcome)] marker:tabular-nums target:bg-accented" :class="e.outcome === 'succeeded' ? '[--outcome:var(--green)]' : e.outcome === 'failed' ? '[--outcome:var(--red)]' : e.outcome === 'blocked' ? '[--outcome:var(--peach)]' : e.outcome === 'noted' ? '[--outcome:var(--blue)]' : '[--outcome:var(--subtext0)]'" :data-outcome="e.outcome">
      <p class="flex flex-wrap items-baseline gap-x-3.5 gap-y-0.5 text-small text-muted">
        <time v-if="e.time" :datetime="str(e.time)">{{ eventTime(str(e.time)) }}</time><span v-else class="font-semibold text-dimmed">Time not recorded</span>
        <span class="font-semibold text-[var(--outcome)]">{{ OUTCOME_LABELS[str(e.outcome)] }}</span>
      </p>
      <h3><span class="me-2 font-bold uppercase tabular-nums">{{ e.id }}</span><span v-html="inline(str(e.title))" /></h3>
      <div v-if="e.detail" class="grid gap-1.5" v-html="prose(str(e.detail))" />
      <dl v-if="e.evidence" class="grid grid-cols-[fit-content(12rem)_1fr] items-baseline gap-x-4 gap-y-1 [&_dt]:text-small [&_dt]:font-semibold [&_dt]:text-toned [&_dd]:ms-0"><dt>Evidence</dt><dd v-html="inline(str(e.evidence))" /></dl>
      <div v-if="attachments(e.attachments).length" class="grid gap-2.5">
        <AttachmentFigure v-for="a in attachments(e.attachments)" :key="a.id" :a="a" :anchor="`${e.anchor}-${a.id}`" />
      </div>
      <EntryAsks :questions="e.questions" />
    </li>
  </ol>
  <ol v-else-if="r.shape === 'ledger'" class="grid list-none gap-3 ps-0">
    <li v-for="e in r.entries" :id="e.anchor" :key="e.anchor" class="claim grid gap-1.5 border-be border-flow-line pbe-2 last:border-be-0 last:pbe-0 target:bg-accented" :data-status="e.status">
      <h3><span class="me-2 font-bold uppercase tabular-nums">{{ e.id }}</span><span v-html="inline(str(e.claim))" /></h3>
      <p class="text-small font-semibold" :class="e.status === 'confirmed' ? 'text-error' : e.status === 'cleared' ? 'text-success' : 'text-warning'">{{ CLAIM_LABELS[str(e.status)] }}</p>
      <dl class="grid grid-cols-[fit-content(12rem)_1fr] items-baseline gap-x-4 gap-y-1 [&_dt]:text-small [&_dt]:font-semibold [&_dt]:text-toned [&_dd]:ms-0">
        <dt>Evidence</dt><dd v-html="inline(str(e.evidence))" />
        <dt>Missing proof</dt><dd v-html="inline(str(e.missing_proof))" />
        <dt>Consequence</dt><dd v-html="inline(str(e.consequence))" />
      </dl>
      <EntryAsks :questions="e.questions" />
    </li>
  </ol>
  <ol v-else class="grid list-none gap-3 ps-0">
    <li v-for="e in r.entries" :id="e.anchor" :key="e.anchor" class="card grid gap-1.5 border-be border-flow-line pbe-2 last:border-be-0 last:pbe-0 target:bg-accented" :data-blocking="e.blocking ? '' : undefined">
      <h3><span class="me-2 font-bold uppercase tabular-nums">{{ e.id }}</span><span v-html="inline(str(e.title))" /></h3>
      <p class="text-small font-semibold" :class="e.blocking ? 'text-error' : 'text-muted'"><span v-html="inline(str(e.label))" /> ({{ e.blocking ? "blocking" : "non-blocking" }})</p>
      <dl class="grid grid-cols-[fit-content(12rem)_1fr] items-baseline gap-x-4 gap-y-1 [&_dt]:text-small [&_dt]:font-semibold [&_dt]:text-toned [&_dd]:ms-0">
        <dt>Impact</dt><dd v-html="inline(str(e.impact))" />
        <dt>Action</dt><dd v-html="inline(str(e.action))" />
        <template v-if="r.shape === 'review'">
          <dt>Axis</dt><dd>{{ AXIS_LABELS[str(e.axis)] }}</dd>
          <dt>Location</dt><dd v-html="inline(str(e.location))" />
        </template>
      </dl>
      <details class="text-small open:grid open:gap-1.5 [&>:not(summary)]:text-body"><summary>Evidence</summary><p v-html="inline(str(e.evidence))" /></details>
      <FigureList :figures="figures(e.figures)" />
      <EntryAsks :questions="e.questions" />
    </li>
  </ol>
</template>

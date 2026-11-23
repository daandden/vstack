<script setup lang="ts">
import { VISUAL_KINDS } from "#flow/fields.ts";
import { useReaderState } from "~/composables/reader";
const { flow } = useReaderState();
import { askLabel, optionLabel, questionOutcome, sourceText, type QuestionView } from "~/utils/flow";

const props = defineProps<{ q: QuestionView }>();
const f = computed(() => flow.value!);
const st = computed(() => f.value.stage.get(props.q.stage)!);
const now = computed(() => {
  const item = st.value.items.find(item => item.type === "round" && item.round.id === props.q.round);
  return item?.type === "round" ? item.round.now : undefined;
});
const recommended = computed(() => props.q.options.find(option => option.recommended !== undefined));
const picks = computed(() => new Set(props.q.answer.picks ?? []));
const ask = (id: string) => f.value.question.get(id);
const askedIn = (id: string) => {
  const other = ask(id);
  return other && other.stage !== props.q.stage ? ` in ${f.value.stage.get(other.stage)?.label}` : "";
};
const topics = computed(() => (props.q.topics ?? []).map((id) => f.value.topics.find((t) => t.id === id)).filter((t) => t !== undefined));
const reopened = computed(() => (props.q.reopens ? f.value.stages.flatMap((s) => s.assumed).find((a) => a.id === props.q.reopens) : undefined));
const label = (letter: string) => optionLabel(props.q, letter);
const outcome = computed(() => questionOutcome(props.q));
const latestAttempt = computed(() => f.value.latestAttempt.get(props.q.id));
const latestOutcome = computed(() => latestAttempt.value && questionOutcome(latestAttempt.value));
const earlierAttempts = computed(() => props.q.asked_again_by.filter(id => id !== latestAttempt.value?.id));

type Line = { label: string; html: string };
const NOT_ASKED: Record<string, string> = {
  "timed-out": "The ask timed out. This is not your answer.",
  cancelled: "The ask was cancelled. This is not your answer.",
  empty: "The ask came back empty. This is not your answer.",
};
const NOT_DECIDED: Record<string, string> = { question: "Question", concern: "Concern", ambiguous: "Not settled" };
const lines = computed(() => {
  const a = props.q.answer;
  const out: Line[] = [];
  if (a.legacy) {
    if (a.legacy.other !== undefined) out.push({ label: "Recorded", html: inline(a.legacy.other) });
    else out.push({ label: "Unanswered", html: inline(a.legacy.unanswered || "No answer was recorded.") });
    if (a.legacy.note) out.push({ label: "Note", html: inline(a.legacy.note) });
  }
  const r = a.response;
  if (r) {
    const on = r.note_on ? ` on ${r.note_on}` : "";
    if (r.status === "answered" && r.text !== undefined) out.push({ label: a.picks ? `Note${on}` : r.note_on ? `Words${on}` : "Your words", html: inline(r.text) });
    if (r.status === "headless") out.push({ label: "Headless", html: `No one was asked; ${inline(r.picks!.map(label).join(", "))} stands in as the recommended answer. This is not your answer.` });
    else if (r.status !== "answered") out.push({ label: "Unanswered", html: `${NOT_ASKED[r.status]}${r.picks ? ` The automatic selection, ${inline(r.picks.map(label).join(", "))}, is ignored.` : ""}` });
  }
  const rd = a.reading;
  if (rd?.outcome === "resolved") {
    out.push({ label: "Read as", html: inline(rd.decision) });
    out.push({ label: "Because", html: inline(rd.basis) });
    if (rd.maps_to) out.push({ label: "Matches", html: `${inline(label(rd.maps_to))}, which you did not pick` });
  } else if (rd) {
    out.push({ label: NOT_DECIDED[rd.outcome]!, html: "Not a decision." });
    out.push({ label: props.q.asked_again_by.length ? "Unresolved at this attempt" : "Still to ask", html: inline(rd.unresolved) });
  }
  if (props.q.retired) out.push({ label: "Retired", html: inline(props.q.retired.reason) });
  if (!out.length && !a.picks) {
    if (props.q.asked_again_by.length) out.push({ label: "Re-asked", html: "This attempt was asked again before an answer was recorded." });
    else out.push({ label: props.q.latest ? "Open" : "Not answered", html: props.q.open ? "Waiting for your answer." : "No answer was recorded." });
  }
  return out;
});
</script>

<template>
  <div class="grid gap-2.5">
    <div :id="`${q.id}-context`"><CorrectionNotice :notice="q.context" /></div>
    <h2 class="text-flow-mauve"><span class="me-2.5 tabular-nums">Q{{ q.q }}</span><span class="sr-only">: </span><span v-html="inline(q.title)" /></h2>
    <section v-if="q.brief && now !== undefined" aria-label="Decision brief" class="min-w-0 wrap-anywhere">
      <dl class="grid gap-1 [&_dd]:inline [&_dd]:ms-2 [&_dt]:inline [&_dt]:font-semibold [&_dt]:text-flow-teal">
        <div>
          <dt>Now</dt>
          <dd v-html="inline(now)" />
        </div>
        <div v-if="q.brief.asked_again_because">
          <dt>Asked again because</dt>
          <dd v-html="inline(q.brief.asked_again_because)" />
        </div>
        <div v-if="recommended?.recommended">
          <dt>Recommendation</dt>
          <dd><span v-html="inline(recommended.label)" />: <span v-html="inline(recommended.recommended)" /></dd>
        </div>
        <div v-else-if="q.brief.no_recommendation">
          <dt>No recommendation</dt>
          <dd v-html="inline(q.brief.no_recommendation)" />
        </div>
        <div>
          <dt>After you answer</dt>
          <dd><span v-html="inline(q.brief.unblocks)" /> <span class="font-semibold">Undo:</span> <span v-html="inline(q.brief.undo)" /></dd>
        </div>
      </dl>
    </section>
    <section aria-label="Current outcome" class="grid gap-1 text-small">
      <p :class="outcome.cls" v-html="outcome.html" />
      <p v-if="outcome.previous" :class="outcome.previous.cls" v-html="outcome.previous.html" />
      <nav aria-label="Question details" class="flex flex-wrap items-baseline gap-x-3.5 gap-y-0.5">
        <a :href="`#${q.id}-choices`">Choices</a>
        <a :href="`#${q.id}-evidence`">Evidence</a>
        <a v-if="latestAttempt" :href="`#${latestAttempt.id}`">Latest attempt: {{ askLabel(f, latestAttempt.id) }}{{ askedIn(latestAttempt.id) }}</a>
        <span v-if="latestOutcome" :class="latestOutcome.cls" v-html="latestOutcome.html" />
      </nav>
    </section>
    <section :id="`${q.id}-evidence`" aria-label="Question evidence" class="grid gap-2.5">
      <div class="grid gap-1.5" v-html="prose(q.description)" />
      <p class="flex flex-wrap items-baseline gap-x-3.5 gap-y-0.5 text-small text-muted [&_a]:no-underline">
        <a v-if="st.background" :href="`#${st.background.id}`">Background: <span v-html="inline(st.background.title)" /></a>
        <a v-for="t in topics" :key="t.id" :href="`#${t.id}`">Topic: <span v-html="inline(t.title)" /></a>
        <a v-for="link in q.result_links" :key="link.id" :href="`#${link.anchor}`">
          <span v-html="inline(link.title)" /> <span v-if="link.entry" class="entry-id">{{ link.entry }}</span>
        </a>
        <a v-if="q.again" :href="`#${q.again}`">Q{{ ask(q.again)?.q }}{{ askedIn(q.again) }}, asked earlier</a>
        <a v-for="id in earlierAttempts" :key="id" :href="`#${id}`">Q{{ ask(id)?.q }}{{ askedIn(id) }}, asked again</a>
        <a v-if="reopened" :href="`#${reopened.id}`">Reopens an Assumed pick: <span v-html="inline(reopened.decision)" /></a>
        <a v-if="q.decided_in" :href="`#${q.decided_in}`">Decision in the summary</a>
      </p>
      <details v-if="q.terms?.length" class="text-small open:grid open:gap-1.5 [&>:not(summary)]:text-body">
        <summary>Term notes ({{ q.terms.length }})</summary>
        <dl class="grid gap-0.5 [&_dt]:font-semibold [&_dt]:text-flow-teal [&_dd+dt]:mbs-1.5">
          <template v-for="t in q.terms" :key="t.term"><dt v-html="inline(t.term)" /><dd class="ms-0" v-html="inline(t.text)" /></template>
        </dl>
      </details>
      <details v-if="q.needs?.length" class="text-small open:grid open:gap-1.5 [&>:not(summary)]:text-body">
        <summary>Reader needs ({{ q.needs.length }})</summary>
        <ul class="grid list-disc gap-0.5 ps-5 marker:text-dimmed">
          <li v-for="(n, i) in q.needs" :key="i"><span v-html="inline(n.need)" /> <span class="text-small text-muted">{{ VISUAL_KINDS[n.kind] }}</span></li>
        </ul>
      </details>
      <div v-if="q.today?.length" class="grid gap-1.5">
        <p class="font-semibold text-[var(--pink)]">Today</p>
        <ul class="grid list-disc gap-0.5 ps-5 marker:text-dimmed">
          <li v-for="(fact, i) in q.today" :key="i"><span v-html="inline(fact.text)" /></li>
        </ul>
        <details class="text-small open:grid open:gap-1.5 [&>:not(summary)]:text-body">
          <summary>Sources ({{ q.today.length }})</summary>
          <ol class="grid list-disc gap-0.5 ps-5 marker:text-dimmed">
            <li v-for="(fact, i) in q.today" :key="i" v-html="inline(sourceText(f, fact.source))" />
          </ol>
        </details>
      </div>
      <div v-if="q.example" class="grid gap-1.5">
        <p class="font-semibold text-[var(--pink)]">Example</p>
        <p class="whitespace-pre-wrap" v-html="inline(q.example)" />
      </div>
      <FigureList :figures="q.figures" />
    </section>
    <div class="grid gap-4 pbs-1.5">
      <ol :id="`${q.id}-choices`" aria-label="Choices" class="options grid list-none gap-4 ps-0">
        <li v-for="o in q.options" :key="o.label" class="option group/option grid gap-1" :data-recommended="o.recommended ? '' : undefined" :data-picked="picks.has(o.label) ? '' : undefined">
          <h3 class="font-semibold text-info group-data-picked/option:font-bold group-data-picked/option:text-flow-yellow">
            <span v-html="inline(o.label)" />
            <span v-if="o.recommended" class="ms-2 font-bold text-flow-yellow" aria-hidden="true">*</span><span v-if="o.recommended" class="sr-only"> (recommended)</span>
            <span v-if="picks.has(o.label)" class="sr-only"> (your answer)</span>
          </h3>
          <FigureList v-if="o.preview" :figures="[o.preview]" />
          <p v-html="inline(o.does)" />
          <ul class="grid list-none ps-0">
            <li v-for="(g, i) in o.gains" :key="`g${i}`" class="relative ps-5 before:absolute before:[inset-inline-start:0] before:font-bold before:text-success before:content-['+']" v-html="inline(g)" />
            <li v-for="(c, i) in o.costs" :key="`c${i}`" class="relative ps-5 before:absolute before:[inset-inline-start:0] before:font-bold before:text-error before:content-['−']" v-html="inline(c)" />
          </ul>
          <p v-if="o.recommended && !q.brief" class="text-small text-muted">Recommended: <span v-html="inline(o.recommended)" /></p>
        </li>
      </ol>
      <section v-if="q.answer.correction || q.answer.corrects.length || q.answer.recorded_reading" :id="`${q.id}-reading`" class="grid gap-1.5">
        <CorrectionNotice :notice="q.answer" />
        <details v-if="q.answer.recorded_reading">
          <summary>Original agent reading, no longer current</summary>
          <template v-if="q.answer.recorded_reading.outcome === 'resolved'">
            <p v-html="inline(q.answer.recorded_reading.decision)" />
            <p v-html="inline(q.answer.recorded_reading.basis)" />
          </template>
          <p v-else v-html="inline(q.answer.recorded_reading.unresolved)" />
        </details>
      </section>
      <div v-if="lines.length" class="answer grid grid-cols-[12ch_minmax(0,1fr)] gap-x-3 gap-y-1 rounded border border-[var(--surface1)] px-3 py-2">
        <p v-for="(l, i) in lines" :key="i" class="col-span-full grid grid-cols-subgrid"><span class="font-semibold">{{ l.label }}</span><span v-html="l.html" /></p>
      </div>
    </div>
  </div>
</template>

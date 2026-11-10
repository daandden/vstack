<script setup lang="ts">
import { VISUAL_KINDS } from "#flow/fields.ts";
import { flow } from "~/composables/reader";
import { entryTitle, optionLabel, sourceText, type QuestionView } from "~/utils/flow";

const props = defineProps<{ q: QuestionView }>();
const f = computed(() => flow.value!);
const st = computed(() => f.value.stage.get(props.q.stage)!);
const picks = computed(() => new Set(props.q.answer.picks ?? []));
const rank = computed(() => f.value.next.indexOf(props.q.id));
const ask = (id: string) => f.value.question.get(id);
const askedIn = (id: string) => {
  const other = ask(id);
  return other && other.stage !== props.q.stage ? ` in ${f.value.stage.get(other.stage)?.label}` : "";
};
const topics = computed(() => (props.q.topics ?? []).map((id) => f.value.topics.find((t) => t.id === id)).filter((t) => t !== undefined));
const reopened = computed(() => (props.q.reopens ? f.value.stages.flatMap((s) => s.assumed).find((a) => a.id === props.q.reopens) : undefined));
const label = (letter: string) => optionLabel(props.q, letter);

type Line = { label: string; html: string; state?: string };
const NOT_ASKED: Record<string, string> = {
  "timed-out": "The ask timed out. This is not your answer.",
  cancelled: "The ask was cancelled. This is not your answer.",
  empty: "The ask came back empty. This is not your answer.",
};
const NOT_DECIDED: Record<string, string> = { question: "Your words ask a question", concern: "Your words raise a concern", ambiguous: "Your words do not settle it" };
const lines = computed(() => {
  const a = props.q.answer;
  const out: Line[] = [];
  if (a.picks) out.push({ label: "Your pick", html: inline(a.picks.join(", ")) });
  if (a.legacy) {
    if (a.legacy.other !== undefined) out.push({ label: "Your recorded answer", html: inline(a.legacy.other) });
    else out.push({ label: "Recorded as unanswered", html: inline(a.legacy.unanswered || "No answer was recorded.") });
    if (a.legacy.note) out.push({ label: "Recorded note", html: inline(a.legacy.note) });
  }
  const r = a.response;
  if (r) {
    const on = r.note_on ? ` (on ${label(r.note_on)}, not picked)` : "";
    if (r.status === "answered" && r.text !== undefined) out.push({ label: a.picks ? `Your note${on}` : `Your words${on}`, html: inline(r.text) });
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
    out.push({ label: "Still to ask", html: inline(rd.unresolved) });
  }
  if (props.q.retired) out.push({ label: "Retired", html: inline(props.q.retired.reason), state: "retired" });
  if (!out.length) out.push({ label: props.q.latest ? "Open" : "Not answered", html: props.q.open ? "Waiting for your answer." : "No answer was recorded." });
  return out;
});
</script>

<template>
  <article :id="q.id" class="question grid gap-2.5" :data-state="q.answer.state" :data-next="rank >= 0 ? rank : undefined" :data-retired="q.retired ? '' : undefined" data-stop>
    <h2 class="text-flow-mauve"><span class="me-2.5 tabular-nums">Q{{ q.q }}</span><span v-html="inline(q.title)" /></h2>
    <div class="grid gap-1.5" v-html="prose(q.description)" />
    <p class="flex flex-wrap items-baseline gap-x-3.5 gap-y-0.5 text-small text-muted [&_a]:no-underline">
      <a v-if="st.background" :href="`#${st.background.id}`">Background: <span v-html="inline(st.background.title)" /></a>
      <a v-for="t in topics" :key="t.id" :href="`#${t.id}`">Topic: <span v-html="inline(t.title)" /></a>
      <a v-for="ref in q.entries ?? []" :key="ref" :href="`#${ref.replace('/', '-')}`">
        <span v-html="inline(entryTitle(f, ref)?.result ?? ref)" /> <span class="entry-id">{{ entryTitle(f, ref)?.entry }}</span>
      </a>
      <a v-if="q.again" :href="`#${q.again}`">Q{{ ask(q.again)?.q }}{{ askedIn(q.again) }}, asked earlier</a>
      <a v-for="id in q.asked_again_by" :key="id" :href="`#${id}`">Q{{ ask(id)?.q }}{{ askedIn(id) }}, asked again</a>
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
    <ol class="options grid list-none ps-0">
      <li v-for="o in q.options" :key="o.label" class="option group/option grid gap-1 border-bs border-muted py-2" :data-recommended="o.recommended ? '' : undefined" :data-picked="picks.has(o.label) ? '' : undefined">
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
        <p v-if="o.recommended" class="text-small text-muted">Recommended: <span v-html="inline(o.recommended)" /></p>
      </li>
    </ol>
    <div class="answer grid gap-1 [border-inline-start:2px_solid_var(--state,var(--overlay0))] py-1.5 ps-3" :data-state="q.answer.state">
      <p v-for="(l, i) in lines" :key="i" :data-state="l.state"><span class="font-semibold" :class="l.state === 'retired' ? 'text-dimmed' : 'text-flow-state'">{{ l.label }}</span> <span v-html="l.html" /></p>
    </div>
  </article>
</template>

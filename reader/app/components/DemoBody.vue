<script setup lang="ts">
import type { Condition, Demo, DemoLiteral, Effect, Transition } from "#flow/model.ts";
import { flow } from "~/composables/reader";
import type { ResultView } from "~/utils/flow";

const props = defineProps<{ r: ResultView; demo: Demo }>();
const id = computed(() => `${props.r.anchor}-demo`);
const key = computed(() => `flow-page:demo:${flow.value!.flow.id}:${props.r.id}:r${props.r.revision}`);
type Now = { state: string; values: Record<string, DemoLiteral> };
const start = (): Now => ({ state: props.demo.start, values: Object.fromEntries(props.demo.values.map((v) => [v.name, v.initial])) });
const fits = (s: Now | null) => !!s && props.demo.states.some((x) => x.name === s.state) && props.demo.values.every((v) => typeof s.values?.[v.name] === typeof v.initial);

function holds(c: Condition, values: Record<string, DemoLiteral>): boolean {
  if ("all" in c) return c.all.every((x) => holds(x, values));
  if ("any" in c) return c.any.some((x) => holds(x, values));
  if ("not" in c) return !holds(c.not, values);
  const v = values[c.value]!;
  switch (c.op) {
    case "eq": return v === c.to;
    case "ne": return v !== c.to;
    case "lt": return v < c.to;
    case "le": return v <= c.to;
    case "gt": return v > c.to;
    default: return v >= c.to;
  }
}
function next(action: Demo["actions"][number], now: Now): Now | null {
  const t = action.transitions.find((x) => (!x.from || x.from.includes(now.state)) && (!x.when || holds(x.when, now.values)));
  if (!t) return null;
  const values = { ...now.values };
  for (const [name, e] of Object.entries(t.set ?? {})) values[name] = "add" in e ? (now.values[name] as number) + e.add : "toggle" in e ? !now.values[name] : e.set;
  return { state: t.to ?? now.state, values };
}

const now = ref<Now>(start());
onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem(key.value) ?? "null");
    if (fits(saved)) now.value = saved;
  } catch {}
});
const stateLabel = computed(() => props.demo.states.find((s) => s.name === now.value.state)?.label);
function run(action: Demo["actions"][number]) {
  const after = next(action, now.value);
  if (!after) return;
  now.value = after;
  try { localStorage.setItem(key.value, JSON.stringify(after)); } catch {}
}
function reset() {
  now.value = start();
  try { localStorage.removeItem(key.value); } catch {}
}

const label = computed(() => new Map([...props.demo.values, ...props.demo.states].map((x) => [x.name, x.label])));
const OPS: Record<string, string> = { eq: "is", ne: "is not", lt: "<", le: "≤", gt: ">", ge: "≥" };
function cond(c: Condition): string {
  const inner = (x: Condition) => ("all" in x || "any" in x ? `(${cond(x)})` : cond(x));
  if ("all" in c) return c.all.map(inner).join(" and ");
  if ("any" in c) return c.any.map(inner).join(" or ");
  if ("not" in c) return `not ${inner(c.not)}`;
  return `${label.value.get(c.value)} ${OPS[c.op]} ${demoValue(c.to)}`;
}
const effect = (name: string, e: Effect) =>
  "add" in e ? `${label.value.get(name)} ${e.add < 0 ? "−" : "+"} ${Math.abs(e.add)}` : "toggle" in e ? `${label.value.get(name)} flips` : `${label.value.get(name)} becomes ${demoValue(e.set)}`;
function rule(t: Transition): string {
  const from = t.from ? `From ${t.from.map((s) => label.value.get(s)).join(" or ")}` : "From any state";
  const when = t.when ? `, when ${cond(t.when)}` : "";
  const to = t.to ? `go to ${label.value.get(t.to)}` : "stay";
  const set = t.set ? `; ${Object.entries(t.set).map(([k, e]) => effect(k, e)).join(", ")}` : "";
  return `${from}${when}: ${to}${set}`;
}
</script>

<template>
  <div :id="id" class="demo grid justify-items-start gap-1.5 rounded-md bg-muted px-3 py-2.5">
    <div class="grid gap-1.5" aria-live="polite">
      <p class="flex flex-wrap items-baseline gap-x-3 gap-y-1"><span class="font-semibold text-muted">State</span> <strong :id="`${id}-state`" class="text-title text-primary">{{ stateLabel }}</strong></p>
      <template v-for="s in demo.states" :key="s.name">
        <div v-if="s.description && s.name === now.state" class="grid gap-1.5" v-html="prose(s.description)" />
      </template>
      <dl v-if="demo.values.length" class="grid grid-cols-[fit-content(12rem)_1fr] items-baseline gap-x-4 gap-y-1">
        <template v-for="v in demo.values" :key="v.name"><dt class="text-small font-semibold text-toned">{{ v.label }}</dt><dd :id="`${id}-v-${v.name}`" class="ms-0 text-flow-teal tabular-nums">{{ demoValue(now.values[v.name]!) }}</dd></template>
      </dl>
    </div>
    <div class="flex flex-wrap gap-2" role="group" aria-label="Actions">
      <UButton v-for="a in demo.actions" :key="a.name" type="button" :data-action="a.name" :aria-disabled="!next(a, now)" class="rounded border border-default bg-accented px-2.5 py-1 text-[length:var(--fs-body)] font-semibold text-default ring-0 hover:text-secondary active:bg-[var(--surface1)] active:text-secondary aria-disabled:cursor-not-allowed aria-disabled:border-dashed aria-disabled:text-dimmed aria-disabled:opacity-100" @click="run(a)">{{ a.label }}</UButton>
      <UButton type="button" class="rounded border border-default bg-transparent px-2.5 py-1 text-[length:var(--fs-body)] font-semibold text-toned ring-0 hover:text-secondary active:bg-[var(--surface1)] active:text-secondary" data-reset @click="reset">Reset</UButton>
    </div>
    <p class="text-small text-muted">Runs in this browser only. What you do here stays here: it answers no question and records no work.</p>
    <details class="text-small open:grid open:gap-1.5 [&>:not(summary)]:text-body">
      <summary>How it works</summary>
      <dl class="grid grid-cols-[fit-content(12rem)_1fr] items-baseline gap-x-4 gap-y-1 [&_dt]:text-small [&_dt]:font-semibold [&_dt]:text-toned [&_dd]:ms-0">
        <template v-for="a in demo.actions" :key="a.name">
          <dt>{{ a.label }}</dt>
          <dd><ul class="grid list-disc gap-0.5 ps-5 marker:text-dimmed"><li v-for="(t, i) in a.transitions" :key="i">{{ rule(t) }}</li></ul></dd>
        </template>
      </dl>
      <p class="text-small text-muted">The first line that applies runs; with none, the action is unavailable. Reset returns to {{ label.get(demo.start) }} with every starting value.</p>
    </details>
  </div>
</template>

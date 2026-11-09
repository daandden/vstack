<script setup lang="ts">
import type { MetricsView, ValueView } from "#flow/model.ts";

const props = defineProps<{ m: MetricsView }>();
const hasBaseline = computed(() => props.m.baseline !== undefined);
const facts = computed(() => [["Workload", props.m.workload], ...(props.m.environment ? [["Environment", props.m.environment]] : []), ["Outcome", props.m.outcome]] as [string, string][]);
const changeUnit = (unit: string) => (unit === "%" ? "pp" : unit);
const uncertainty = (v: ValueView) => {
  const u = v.uncertainty;
  if (!u) return '<span class="font-semibold text-dimmed">Not reported</span>';
  return "low" in u ? `${u.low} to ${u.high} <span class="text-small text-muted">(${inline(u.of)})</span>` : `±${u.plusminus} <span class="text-small text-muted">(${inline(u.of)})</span>`;
};
const change = (v: ValueView, unit: string) => {
  if (v.baseline) return '<span class="text-small text-muted">Baseline</span>';
  if (v.delta_unavailable) return '<span class="font-semibold text-dimmed">Outside numeric range</span>';
  if (v.delta === undefined) return '<span class="font-semibold text-dimmed">No baseline value</span>';
  return `${signed(v.delta)} ${inline(changeUnit(unit))}${v.relative !== undefined ? ` <span class="text-small text-muted">(${signed(Number(v.relative.toFixed(1)))}%)</span>` : ""}`;
};
</script>

<template>
  <div class="grid gap-2.5">
    <dl class="grid grid-cols-[fit-content(12rem)_1fr] items-baseline gap-x-4 gap-y-1 [&_dt]:text-small [&_dt]:font-semibold [&_dt]:text-toned [&_dd]:ms-0"><template v-for="[k, v] in facts" :key="k"><dt>{{ k }}</dt><dd v-html="inline(v)" /></template></dl>
    <section v-for="me in m.measurements" :id="me.anchor" :key="me.anchor" class="grid gap-2.5" :aria-labelledby="`${me.anchor}-title`">
      <h3 :id="`${me.anchor}-title`" class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-secondary">
        <span v-html="inline(me.name)" /> <span class="text-small text-muted">({{ me.unit }})</span>
        <span v-if="me.better" class="text-small text-muted">{{ me.better === "lower" ? "Lower is better" : "Higher is better" }}</span>
        <span v-if="me.verdict" class="text-small font-semibold data-[verdict=better]:text-success data-[verdict=worse]:text-error data-[verdict=no-difference]:text-warning data-[verdict=inconclusive]:text-warning" :data-verdict="me.verdict">{{ MEASURE_LABELS[me.verdict] }}</span>
      </h3>
      <MetricsChart v-if="typeof me.chart === 'string'" :measurement="me" />
      <div class="relative overflow-x-auto">
        <table class="border-collapse tabular-nums [&_th]:text-small [&_th]:font-semibold [&_th]:text-muted [&_th]:px-2 [&_th]:py-1 [&_th]:border-be [&_th]:border-flow-line [&_th]:text-start [&_th]:align-top [&_td]:px-2 [&_td]:py-1 [&_td]:border-be [&_td]:border-flow-line [&_td]:text-start [&_td]:align-top [&_td]:whitespace-nowrap [&_tr:target]:bg-accented">
          <thead>
            <tr><th scope="col">Series</th><th scope="col">Value</th><th scope="col">Samples</th><th scope="col">Uncertainty</th><th v-if="hasBaseline" scope="col">Change from baseline</th></tr>
          </thead>
          <tbody>
            <tr v-for="v in me.values" :id="v.anchor" :key="v.anchor" :data-missing="v.missing ? '' : undefined">
              <th scope="row" class="whitespace-nowrap text-body! font-normal! text-default!"><span v-html="inline(v.label)" /><span v-if="v.baseline" class="text-small text-muted"> (baseline)</span></th>
              <template v-if="v.missing">
                <td class="value"><span class="font-semibold text-dimmed">Missing</span> <span class="text-small text-muted" v-html="inline(v.missing.reason ?? 'Not reported')" /></td>
                <td /><td /><td v-if="hasBaseline" />
              </template>
              <template v-else>
                <td class="value">
                  <span v-if="v.value !== undefined" class="inline-flex items-center gap-2"><span class="min-w-[7ch] text-end">{{ v.value }} {{ me.unit }}</span><UProgress v-if="me.chart && typeof me.chart === 'object'" color="info" :model-value="v.value" :max="me.chart.max" aria-hidden="true" class="w-24" :ui="{ base: 'h-2 rounded bg-accented', indicator: 'rounded transition-none' }" /></span><span v-else class="text-small text-muted">No scalar reported</span>
                </td>
                <td><template v-if="v.samples !== undefined">{{ Array.isArray(v.samples) ? v.samples.length : v.samples }}</template><span v-else class="font-semibold text-dimmed">Not reported</span></td>
                <td v-html="uncertainty(v)" />
                <td v-if="hasBaseline" v-html="change(v, me.unit)" />
              </template>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { MetricsView, ValueView } from "#flow/model.ts";

const props = defineProps<{ m: MetricsView }>();
const hasBaseline = computed(() => props.m.baseline !== undefined);
const facts = computed(() => [["Workload", props.m.workload], ...(props.m.environment ? [["Environment", props.m.environment]] : []), ["Outcome", props.m.outcome]] as [string, string][]);
const changeUnit = (unit: string) => (unit === "%" ? "pp" : unit);
const uncertainty = (v: ValueView) => {
  const u = v.uncertainty;
  if (!u) return '<span class="gap">Not reported</span>';
  return "low" in u ? `${u.low} to ${u.high} <span class="quiet">(${inline(u.of)})</span>` : `±${u.plusminus} <span class="quiet">(${inline(u.of)})</span>`;
};
const change = (v: ValueView, unit: string) => {
  if (v.baseline) return '<span class="quiet">Baseline</span>';
  if (v.delta_unavailable) return '<span class="gap">Outside numeric range</span>';
  if (v.delta === undefined) return '<span class="gap">No baseline value</span>';
  return `${signed(v.delta)} ${inline(changeUnit(unit))}${v.relative !== undefined ? ` <span class="quiet">(${signed(Number(v.relative.toFixed(1)))}%)</span>` : ""}`;
};
</script>

<template>
  <div class="metrics">
    <dl class="fields"><template v-for="[k, v] in facts" :key="k"><dt>{{ k }}</dt><dd v-html="inline(v)" /></template></dl>
    <section v-for="me in m.measurements" :id="me.anchor" :key="me.anchor" class="measurement" :aria-labelledby="`${me.anchor}-title`">
      <h3 :id="`${me.anchor}-title`">
        <span v-html="inline(me.name)" /> <span class="quiet">({{ me.unit }})</span>
        <span v-if="me.better" class="quiet">{{ me.better === "lower" ? "Lower is better" : "Higher is better" }}</span>
        <span v-if="me.verdict" class="tag" :data-verdict="me.verdict">{{ MEASURE_LABELS[me.verdict] }}</span>
      </h3>
      <div class="table">
        <table>
          <thead>
            <tr><th scope="col">Series</th><th scope="col">Value</th><th scope="col">Samples</th><th scope="col">Uncertainty</th><th v-if="hasBaseline" scope="col">Change from baseline</th></tr>
          </thead>
          <tbody>
            <tr v-for="v in me.values" :id="v.anchor" :key="v.anchor" :data-missing="v.missing ? '' : undefined">
              <th scope="row"><span v-html="inline(v.label)" /><span v-if="v.baseline" class="quiet"> (baseline)</span></th>
              <template v-if="v.missing">
                <td class="value"><span class="gap">Missing</span> <span class="quiet" v-html="inline(v.missing.reason ?? 'Not reported')" /></td>
                <td /><td /><td v-if="hasBaseline" />
              </template>
              <template v-else>
                <td class="value">
                  <span class="bar-cell"><span class="num">{{ v.value }} {{ me.unit }}</span><meter v-if="me.chart" min="0" :max="me.chart.max" :value="v.value" aria-hidden="true" /></span>
                </td>
                <td><template v-if="v.samples !== undefined">{{ v.samples }}</template><span v-else class="gap">Not reported</span></td>
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

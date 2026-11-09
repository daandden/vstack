<script setup lang="ts">
import { defineChart } from "@tanstack/charts/scene";
import { mountChart } from "@tanstack/charts/dom";
import { lineY } from "@tanstack/charts/line";
import { dot } from "@tanstack/charts/dot";
import { rect } from "@tanstack/charts/rect";
import { binX } from "@tanstack/charts/transform/bin";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import type { TableColumn } from "@nuxt/ui";
import type { MetricsView } from "#flow/model.ts";

const props = defineProps<{ measurement: MetricsView["measurements"][number] }>();
const container = useTemplateRef<HTMLDivElement>("container");
const focused = shallowRef("");
const palette = ["var(--blue)", "var(--mauve)", "var(--teal)", "var(--peach)", "var(--pink)", "var(--green)", "var(--lavender)", "var(--yellow)"];
const series = computed(() => props.measurement.values.filter(v => !v.missing).map((v, i) => ({ ...v, color: palette[i % palette.length], name: `${v.label}${v.baseline ? " (baseline)" : ""}` })));
const histogram = computed(() => props.measurement.chart === "histogram");
const rows = computed(() => series.value.flatMap(v => histogram.value
  ? (Array.isArray(v.samples) ? v.samples : []).map((sample, i) => ({ series: v.name, index: i + 1, x: sample, y: undefined as number | undefined }))
  : (v.points ?? []).map((p, i) => ({ series: v.name, index: i + 1, x: p.x, y: p.y as number | undefined }))));
const columns = computed<TableColumn<typeof rows.value[number]>[]>(() => [
  { accessorKey: "series", header: "Series" },
  { accessorKey: "index", header: histogram.value ? "Sample" : "Point" },
  { accessorKey: "x", header: histogram.value ? `Value (${props.measurement.unit})` : "x" },
  ...(!histogram.value ? [{ accessorKey: "y", header: `y (${props.measurement.unit})` }] : []),
]);
const definition = computed(() => {
  const allSamples = series.value.flatMap(v => Array.isArray(v.samples) ? v.samples : []);
  const minimum = Math.min(...allSamples), maximum = Math.max(...allSamples);
  const marks = series.value.flatMap(v => {
    if (histogram.value) {
      const samples = (Array.isArray(v.samples) ? v.samples : []).map(value => ({ value }));
      if (!samples.length) return [];
      const bins = binX(samples, { value: "value", domain: [minimum, maximum === minimum ? minimum + 1 : maximum], thresholds: Math.min(20, Math.ceil(Math.sqrt(allSamples.length))) });
      const data = bins.map(b => ({ x: b.x, x1: b.x1, x2: b.x2, y: b.value, name: v.name, description: `${v.name}: ${b.x1} to ${b.x2} ${props.measurement.unit}, ${b.value} samples` }));
      return [rect(data, { id: v.series, x: "x", x1: "x1", x2: "x2", y: "y", y1: () => 0, y2: "y", fill: v.color, fillOpacity: 0.25, stroke: v.color, strokeWidth: v.baseline ? 2.5 : 1, inset: 1 })];
    }
    const data = [...(v.points ?? [])].sort((a, b) => a.x - b.x).map(p => ({ ...p, x1: p.x, x2: p.x, name: v.name, description: `${v.name}: x ${p.x}, y ${p.y} ${props.measurement.unit}` }));
    if (props.measurement.chart === "line") return [lineY(data, { id: v.series, x: "x", y: "y", stroke: v.color, strokeWidth: v.baseline ? 2.5 : 1.5, strokeDasharray: v.baseline ? "5 3" : undefined, points: true })];
    return [dot(data, { id: v.series, x: "x", y: "y", fill: v.baseline ? "var(--base)" : v.color, stroke: v.color, strokeWidth: v.baseline ? 2.5 : 1, r: 4 })];
  });
  return defineChart({
    marks,
    scales: {
      x: { scale: scaleLinear, nice: true, axis: { ticks: { count: 4 }, label: histogram.value ? props.measurement.unit : "x" } },
      y: { scale: scaleLinear, nice: true, grid: true, axis: { ticks: { count: 4 }, label: histogram.value ? "Samples" : props.measurement.unit } },
    },
    theme: { foreground: "var(--text)", muted: "var(--subtext0)", grid: "var(--line)", background: "transparent", palette, focusRing: { stroke: "var(--text)", strokeWidth: 2 } },
    keyboard: true, svgAnimation: false,
  });
});
watchEffect(onCleanup => {
  if (!container.value) return;
  const host = mountChart(container.value, {
    definition: definition.value, height: 260,
    ariaLabel: `${props.measurement.name} ${props.measurement.chart} chart`,
    ariaDescription: `Values in ${props.measurement.unit}. Arrow keys move through points. Home and End jump to the first and last point. Exact values are in the chart data table.`,
    className: "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
    onFocusChange: point => { focused.value = point?.datum.description ?? ""; },
  });
  onCleanup(() => host.destroy());
});
</script>

<template>
  <div class="grid min-w-0 gap-2.5">
    <ul class="flex flex-wrap gap-x-4 gap-y-1 text-small" aria-label="Chart series">
      <li v-for="v in series" :key="v.series" class="inline-flex min-w-0 items-baseline gap-1.5 [overflow-wrap:anywhere]">
        <span aria-hidden="true" :style="{ color: v.color }">{{ v.baseline ? '◇' : '●' }}</span><span>{{ v.name }}</span>
      </li>
    </ul>
    <div class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))] items-start gap-3">
      <div class="grid min-w-0 gap-1">
        <div ref="container" class="h-65 min-w-0" />
        <p class="min-h-lh text-small text-muted" role="status" aria-live="polite" aria-atomic="true">{{ focused }}</p>
      </div>
      <UTable :data="rows" :columns="columns" :caption="`${measurement.name} chart data`" class="min-w-0 tabular-nums" :ui="{ caption: 'text-start text-small text-muted', th: 'px-2 py-1 text-small whitespace-normal', td: 'px-2 py-1 text-small whitespace-normal [overflow-wrap:anywhere]', tr: 'hover:bg-transparent' }" />
    </div>
  </div>
</template>

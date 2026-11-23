<script setup lang="ts">
import { getCoreRowModel, useVueTable, type ColumnDef } from "@tanstack/vue-table";
import type { MetricsView } from "#flow/model.ts";
import Table from "~/components/ui/Table.vue";

const props = defineProps<{ measurement: MetricsView["measurements"][number] }>();
const palette = ["var(--color-blue)", "var(--color-mauve)", "var(--color-teal)", "var(--color-peach)", "var(--color-pink)", "var(--color-green)", "var(--color-lavender)", "var(--color-yellow)"];
const series = computed(() => props.measurement.values.filter(v => !v.missing).map((v, i) => ({ ...v, color: palette[i % palette.length]!, name: `${v.label}${v.baseline ? " (baseline)" : ""}` })));
const histogram = computed(() => props.measurement.chart === "histogram");
type DataRow = { series: string; index: number; x: number; y?: number };
const rows = computed<DataRow[]>(() => series.value.flatMap(v => histogram.value
  ? (Array.isArray(v.samples) ? v.samples : []).map((sample, i) => ({ series: v.name, index: i + 1, x: sample }))
  : (v.points ?? []).map((p, i) => ({ series: v.name, index: i + 1, x: p.x, y: p.y }))));
const columns = computed<ColumnDef<DataRow>[]>(() => [
  { accessorKey: "series", header: "Series" },
  { accessorKey: "index", header: histogram.value ? "Sample" : "Point" },
  { accessorKey: "x", header: histogram.value ? `Value (${props.measurement.unit})` : "x" },
  ...(!histogram.value ? [{ accessorKey: "y", header: `y (${props.measurement.unit})` }] : []),
]);
const table = useVueTable({
  data: rows,
  get columns() { return columns.value; },
  getCoreRowModel: getCoreRowModel(),
});
</script>

<template>
  <div class="grid min-w-0 gap-2">
    <ul class="flex flex-wrap gap-x-3 gap-y-1 text-small" aria-label="Chart series">
      <li v-for="v in series" :key="v.series" class="inline-flex min-w-0 items-baseline gap-1 [overflow-wrap:anywhere]">
        <span aria-hidden="true" :style="{ color: v.color }">{{ v.baseline ? '◇' : '●' }}</span><span>{{ v.name }}</span>
      </li>
    </ul>
    <div class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))] items-start gap-2">
      <div class="metrics-plot">
        <MetricsPlot :measurement="measurement" :series="series" />
      </div>
      <Table class="border-collapse tabular-nums">
        <caption data-slot="table-caption" class="chart-data-caption">{{ measurement.name }} chart data</caption>
        <thead data-slot="table-header">
          <tr v-for="group in table.getHeaderGroups()" :key="group.id" data-slot="table-row">
            <th v-for="{ id, column } in group.headers" :key="id" data-slot="table-head" scope="col" class="chart-data-cell">
              {{ column.columnDef.header }}
            </th>
          </tr>
        </thead>
        <tbody data-slot="table-body">
          <tr v-for="row in table.getRowModel().rows" :key="row.id" data-slot="table-row">
            <td v-for="cell in row.getVisibleCells()" :key="cell.id" data-slot="table-cell" class="chart-data-cell">{{ cell.getValue() }}</td>
          </tr>
        </tbody>
      </Table>
    </div>
  </div>
</template>

<style scoped>
.metrics-plot {
  min-block-size: calc(260px + 2lh);
  min-inline-size: 0;
}

.chart-data-caption,
.chart-data-cell {
  font-size: var(--text-small);
  text-align: start;
}

.chart-data-caption {
  caption-side: top;
  color: var(--color-subtext0);
}

.chart-data-cell {
  border-block-end: 1px solid var(--color-line);
  padding-block: var(--spacing-1);
  padding-inline: var(--spacing-2);
}

.chart-data-cell:first-child {
  overflow-wrap: anywhere;
}

.chart-data-cell:not(:first-child) {
  text-align: end;
}

th.chart-data-cell {
  color: var(--color-subtext0);
  font-weight: 600;
}
</style>

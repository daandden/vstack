<script setup lang="ts">
import {
  getCoreRowModel, getFilteredRowModel, getSortedRowModel, useVueTable,
  type Column, type ColumnDef, type FilterFn, type SortingFn,
} from "@tanstack/vue-table";
import { defaultDocument, useEventListener } from "@vueuse/core";
import Button from "~/components/ui/Button.vue";
import Input from "~/components/ui/Input.vue";
import Select from "~/components/ui/Select.vue";
import Table from "~/components/ui/Table.vue";
import { useReaderState } from "~/composables/reader";
import { askLabel, type ResultView } from "~/utils/flow";

type Entry = ResultView["entries"][number];
const props = defineProps<{ r: ResultView }>();
const { flow } = useReaderState();
const search = shallowRef("");
const labels = computed(() => (props.r.columns ?? []).map((c, i) => ({
  id: `cell${i}`, label: typeof c === "string" ? c : c.label, type: typeof c === "string" ? "text" : c.type ?? "text", index: i,
})));
const cells = (entry: Entry) => entry.cells as string[];
const linked = computed(() => props.r.entries.some(e => e.questions.length));
const askName = (id: string) => askLabel(flow.value!, id);
const ask = (id: string) => flow.value?.question.get(id);
const numberSort: SortingFn<Entry> = (a, b, id) => {
  const x = a.getValue<string>(id);
  const y = b.getValue<string>(id);
  const nx = x.trim() ? Number(x) : NaN;
  const ny = y.trim() ? Number(y) : NaN;
  const xIsNumber = Number.isFinite(nx);
  const yIsNumber = Number.isFinite(ny);
  if (xIsNumber && yIsNumber) return nx - ny;
  if (xIsNumber !== yIsNumber) return xIsNumber ? -1 : 1;
  return x.localeCompare(y);
};

const allStatuses = "all";
// Encode the option so empty and literal "all" statuses remain filterable.
const exactStatus: FilterFn<Entry> = (row, id, value: string) => row.getValue(id) === value;
exactStatus.resolveFilterValue = (value: string) => value.slice(1);

const columns = computed<ColumnDef<Entry>[]>(() => [
  ...labels.value.map((c): ColumnDef<Entry> => ({
    id: c.id,
    accessorFn: entry => cells(entry)[c.index],
    header: c.label,
    filterFn: c.type === "status" ? exactStatus : "includesString",
    sortingFn: c.type === "number" ? numberSort : "text",
  })),
  ...(linked.value ? [{ id: "questions", header: "Asked in" }] : []),
]);
const statuses = computed(() => labels.value.filter(c => c.type === "status").map(c => ({
  id: c.id,
  label: `Filter ${c.label}`,
  items: [
    { label: "All values", value: allStatuses },
    ...[...new Set(props.r.entries.map(e => cells(e)[c.index]!))].sort()
      .map(value => ({ label: value || "(empty)", value: `:${value}` })),
  ],
})));

const table = useVueTable({
  get data() { return props.r.entries; },
  get columns() { return columns.value; },
  getRowId: entry => entry.anchor,
  getCoreRowModel: getCoreRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  getSortedRowModel: getSortedRowModel(),
  state: { get globalFilter() { return search.value; } },
  globalFilterFn: "includesString",
  sortDescFirst: false,
  enableSortingRemoval: false,
});
const rows = computed(() => table.getRowModel().rows);
const count = computed(() => table.getFilteredRowModel().rows.length);
const sortState = (column: Column<Entry>) => {
  const sorted = column.getIsSorted();
  return sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none";
};
function statusValue(id: string) {
  const value: unknown = table.getColumn(id)?.getFilterValue();
  return typeof value === "string" ? value : allStatuses;
}
function setStatus(id: string, value: string | undefined) {
  table.getColumn(id)?.setFilterValue(value === allStatuses ? undefined : value);
}

useEventListener(defaultDocument, "flow-reveal", (event: Event) => {
  const id: unknown = (event as CustomEvent<unknown>).detail;
  if (typeof id !== "string" || !Object.hasOwn(table.getCoreRowModel().rowsById, id)) return;
  if (!Object.hasOwn(table.getFilteredRowModel().rowsById, id)) {
    search.value = "";
    table.resetColumnFilters();
  }
});
</script>

<template>
  <div class="grid min-w-0 gap-2">
    <div class="flex flex-wrap items-end gap-2">
      <div class="grid justify-items-start gap-1 text-small">
        <label :for="`${r.anchor}-search`" class="font-medium">Filter rows</label>
        <Input
          :id="`${r.anchor}-search`"
          :model-value="search"
          type="text"
          placeholder="Search this table"
          class="table-search"
          @update:model-value="search = String($event ?? '')"
        />
      </div>
      <div v-for="c in statuses" :key="c.id" class="grid justify-items-start gap-1 text-small">
        <label :for="`${r.anchor}-${c.id}`" class="font-medium">{{ c.label }}</label>
        <Select
          :id="`${r.anchor}-${c.id}`"
          :aria-label="c.label"
          :model-value="statusValue(c.id)"
          :items="c.items"
          @update:model-value="setStatus(c.id, $event)"
        />
      </div>
    </div>
    <p role="status" aria-live="polite" aria-atomic="true" class="text-[length:var(--text-small)] text-flow-subtext tabular-nums">{{ count }} of {{ r.entries.length }} rows</p>
    <Table class="border-collapse tabular-nums">
      <caption data-slot="table-caption" class="sr-only">{{ r.title }}</caption>
      <thead data-slot="table-header" class="result-head">
        <tr v-for="group in table.getHeaderGroups()" :key="group.id" data-slot="table-row">
          <th
            v-for="{ id, column } in group.headers"
            :key="id"
            data-slot="table-head"
            scope="col"
            :aria-sort="column.getCanSort() ? sortState(column) : undefined"
            class="result-cell text-start text-flow-subtext"
          >
            <Button v-if="column.getCanSort()" variant="ghost" class="sort-button" :aria-label="`Sort by ${column.columnDef.header}`" @click="column.toggleSorting()">
              <span v-html="inline(String(column.columnDef.header))" />
              <span aria-hidden="true">{{ column.getIsSorted() === 'asc' ? '↑' : column.getIsSorted() === 'desc' ? '↓' : '↕' }}</span>
            </Button>
            <template v-else>{{ column.columnDef.header }}</template>
          </th>
        </tr>
      </thead>
      <tbody data-slot="table-body">
        <tr v-for="row in rows" :key="row.id" data-slot="table-row" class="result-row">
          <td v-for="(cell, i) in row.getVisibleCells()" :key="cell.id" data-slot="table-cell" class="result-cell">
            <template v-if="cell.column.id === 'questions'">
              <template v-for="(id, j) in row.original.questions" :key="id">{{ j ? '; ' : '' }}<a :href="`#${id}`">{{ askName(id) }}</a>: <span v-html="inline(ask(id)?.title ?? '')" /></template>
            </template>
            <div v-else-if="i === 0" :id="row.id" class="min-h-[1lh]">
              <CorrectionNotice :notice="row.original" />
              <span v-html="inline(cell.getValue<string>() ?? '')" />
            </div>
            <span v-else v-html="inline(cell.getValue<string>() ?? '')" />
          </td>
        </tr>
        <tr v-if="!rows.length" data-slot="table-row">
          <td :colspan="columns.length" data-slot="table-cell" class="py-6 text-center text-flow-subtext">No matching rows.</td>
        </tr>
      </tbody>
    </Table>
  </div>
</template>

<style scoped>
.table-search {
  inline-size: auto;
  max-inline-size: 100%;
}

.result-head {
  border-block-end: 1px solid var(--color-overlay0);
}

.result-row + .result-row {
  border-block-start: 1px solid var(--color-line);
}

.result-row:has(:target) {
  background: var(--color-surface0);
}

.result-cell {
  padding-block: 0.25rem;
  padding-inline: 0.5rem;
  vertical-align: top;
  overflow-wrap: anywhere;
}

.sort-button {
  justify-content: start;
  margin-inline-start: -0.5rem;
  gap: 0.375rem;
}
</style>

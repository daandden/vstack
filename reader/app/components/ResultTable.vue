<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import { useEventListener } from "@vueuse/core";
import { flow } from "~/composables/reader";
import { askLabel, type ResultView } from "~/utils/flow";

type Entry = ResultView["entries"][number];
const props = defineProps<{ r: ResultView }>();
const table = useTemplateRef("table");
const search = shallowRef("");
const sorting = ref<{ id: string; desc: boolean }[]>([]);
const filters = ref<{ id: string; value: unknown }[]>([]);
const labels = computed(() => (props.r.columns ?? []).map((c, i) => ({
  id: `cell${i}`, label: typeof c === "string" ? c : c.label, type: typeof c === "string" ? "text" : c.type ?? "text", index: i,
})));
const cells = (entry: Entry) => entry.cells as string[];
const linked = computed(() => props.r.entries.some(e => e.questions.length));
const askName = (id: string) => askLabel(flow.value!, id);
const ask = (id: string) => flow.value?.question.get(id);
const columns = computed<TableColumn<Entry>[]>(() => [
  ...labels.value.map(c => ({
    id: c.id,
    accessorFn: (entry: Entry) => cells(entry)[c.index],
    header: c.label,
    enableSorting: true,
    sortDescFirst: false,
    filterFn: c.type === "status" ? (row, id, values: string[]) => values.includes(row.getValue(id)) : "includesString" as const,
    sortingFn: c.type === "number" ? (a: { original: Entry }, b: { original: Entry }) => {
      const x = cells(a.original)[c.index]!;
      const y = cells(b.original)[c.index]!;
      const nx = x.trim() ? Number(x) : NaN;
      const ny = y.trim() ? Number(y) : NaN;
      if (Number.isFinite(nx) && Number.isFinite(ny)) return nx - ny;
      if (Number.isFinite(nx) !== Number.isFinite(ny)) return Number.isFinite(nx) ? -1 : 1;
      return x.localeCompare(y);
    } : "text" as const,
  })),
  ...(linked.value ? [{ id: "questions", header: "Asked in", enableSorting: false }] : []),
]);
const statuses = computed(() => labels.value.filter(c => c.type === "status").map(c => ({
  ...c,
  items: [{ label: "All values", value: "all" }, ...[...new Set(props.r.entries.map(e => cells(e)[c.index]!))].sort().map(value => ({ label: value || "(empty)", value: JSON.stringify(value) }))],
})));
const statusValue = (id: string) => {
  const filter = filters.value.find(f => f.id === id);
  return filter ? JSON.stringify((filter.value as string[])[0]) : "all";
};
function setStatus(id: string, value: string) {
  filters.value = [...filters.value.filter(f => f.id !== id), ...(value === "all" ? [] : [{ id, value: [JSON.parse(value)] }])];
}
const count = computed(() => table.value?.tableApi.getFilteredRowModel().rows.length ?? props.r.entries.length);
useEventListener(document, "flow-reveal", (event: Event) => {
  const id = (event as CustomEvent<string>).detail;
  const entry = props.r.entries.find(e => e.anchor === id);
  if (entry && !table.value?.tableApi.getFilteredRowModel().rows.some(row => row.id === id)) {
    search.value = "";
    filters.value = [];
  }
});
</script>

<template>
  <div class="grid min-w-0 gap-2">
    <div class="flex flex-wrap items-end gap-2">
      <UFormField label="Filter rows" :name="`${r.anchor}-search`">
        <UInput v-model="search" aria-label="Filter rows" placeholder="Search this table" />
      </UFormField>
      <UFormField v-for="c in statuses" :key="c.id" :label="`Filter ${c.label}`" :name="`${r.anchor}-${c.id}`">
        <USelect :model-value="statusValue(c.id)" :items="c.items" :aria-label="`Filter ${c.label}`" @update:model-value="setStatus(c.id, $event)" />
      </UFormField>
    </div>
    <p role="status" aria-live="polite" aria-atomic="true" class="text-small text-muted tabular-nums">{{ count }} of {{ r.entries.length }} rows</p>
    <UTable
      ref="table" v-model:sorting="sorting" v-model:global-filter="search" v-model:column-filters="filters"
      :data="r.entries" :columns="columns" :caption="r.title" :get-row-id="e => e.anchor"
      :sorting-options="{ enableSortingRemoval: false }" :global-filter-options="{ globalFilterFn: 'includesString' }"
      :watch-options="{ deep: false }" empty="No matching rows."
      :ui="{ base: 'border-collapse tabular-nums', th: 'px-2 py-1 text-small text-muted align-top', td: 'px-2 py-1 text-body text-default align-top whitespace-normal [overflow-wrap:anywhere]', tr: 'has-[:target]:bg-accented', tbody: 'divide-flow-line' }"
    >
      <template v-for="c in labels" :key="c.id" #[`${c.id}-header`]="{ column }">
        <UButton color="neutral" variant="ghost" size="sm" :aria-label="`Sort by ${c.label}`" class="-ms-2 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] active:bg-accented" @click="column.toggleSorting(column.getIsSorted() === 'asc')">
          <span v-html="inline(c.label)" /><span aria-hidden="true">{{ column.getIsSorted() === 'asc' ? '↑' : column.getIsSorted() === 'desc' ? '↓' : '↕' }}</span>
        </UButton>
      </template>
      <template v-for="c in labels" :key="c.id" #[`${c.id}-cell`]="{ row }">
        <div v-if="c.index === 0" :id="row.original.anchor" class="block min-h-lh">
          <CorrectionNotice :notice="row.original" />
          <span v-html="inline(cells(row.original)[c.index] ?? '')" />
        </div>
        <span v-else v-html="inline(cells(row.original)[c.index] ?? '')" />
      </template>
      <template #questions-cell="{ row }">
        <template v-for="(id, i) in row.original.questions" :key="id">{{ i ? '; ' : '' }}<a :href="`#${id}`">{{ askName(id) }}</a>: <span v-html="inline(ask(id)?.title ?? '')" /></template>
      </template>
    </UTable>
  </div>
</template>

<script setup lang="ts">
import type { WayfinderTicket } from "#flow/model.ts";
import { useMapEdges, type MapLink } from "~/composables/mapEdges";

const props = defineProps<{ tickets: WayfinderTicket[] }>();
const graph = useTemplateRef<HTMLElement>("graph");
const arrow = useId();
const labels: Record<WayfinderTicket["state"], string> = {
  resolved: "Resolved", frontier: "On the frontier", blocked: "Blocked", claimed: "Claimed", "out-of-scope": "Out of scope",
};
const layout = computed(() => {
  const byId = new Map(props.tickets.map((t) => [t.id, t]));
  const dependents = new Map(props.tickets.map((t) => [t.id, [] as string[]]));
  const remaining = new Map(props.tickets.map((t) => [t.id, t.blockers.length]));
  const columns = new Map(props.tickets.map((t) => [t.id, 1]));
  for (const t of props.tickets) for (const id of t.blockers) dependents.get(id)!.push(t.id);
  const ready = props.tickets.filter((t) => !t.blockers.length).map((t) => t.id);
  for (let i = 0; i < ready.length; i++) for (const id of dependents.get(ready[i]!)!) {
    columns.set(id, Math.max(columns.get(id)!, columns.get(ready[i]!)! + 1));
    const left = remaining.get(id)! - 1;
    remaining.set(id, left);
    if (!left) ready.push(id);
  }
  const lanes: WayfinderTicket[][] = [];
  for (const ticket of props.tickets) (lanes[columns.get(ticket.id)! - 1] ??= []).push(ticket);
  const rows = new Map<string, number>();
  for (const [index, lane] of lanes.entries()) {
    const used = new Set<number>();
    let nextFree = 1;
    for (const ticket of lane) {
      const upstream = ticket.blockers.find(id => columns.get(id) === index);
      const preferred = upstream === undefined ? nextFree : rows.get(upstream)!;
      const row = used.has(preferred) ? nextFree : preferred;
      rows.set(ticket.id, row);
      used.add(row);
      while (used.has(nextFree)) nextFree++;
    }
  }
  const links: MapLink[] = [];
  const nodes = props.tickets.map((ticket) => {
    const column = columns.get(ticket.id)!;
    const row = rows.get(ticket.id)!;
    const blockers = ticket.blockers.map((id) => {
      links.push({ from: id, to: ticket.id, columnSpan: column - columns.get(id)! });
      return byId.get(id)!.title;
    });
    return { ticket, column, row, blockers };
  });
  return { nodes, links, columns: lanes.length };
});
const edges = useMapEdges(graph, () => layout.value.links, "data-ticket-node");
</script>

<template>
  <p v-if="!tickets.length" class="quiet p-2">No tickets charted yet.</p>
  <div v-else ref="graph" class="relative [inline-size:max-content] p-2">
    <svg class="pointer-events-none absolute inset-0 size-full text-flow-subtext" role="img" aria-label="Blocking links point from a blocker to the ticket it blocks">
      <defs><marker :id="arrow" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path fill="currentColor" d="M0 0L8 4L0 8z" /></marker></defs>
      <path v-for="edge in edges" :key="`${edge.from}:${edge.to}`" :data-blocker="edge.from" :data-ticket="edge.to" :d="edge.path" :marker-end="`url(#${arrow})`" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" />
    </svg>
    <ol class="relative grid list-none items-start gap-x-6 gap-y-4" :style="{ gridTemplateColumns: `repeat(${layout.columns}, 220px)` }" aria-label="Wayfinder tickets" role="list">
      <li v-for="node in layout.nodes" :key="node.ticket.id" class="grid min-h-23 content-start gap-1 wrap-anywhere rounded-sm border border-flow-line bg-flow-base p-2" :data-ticket-node="node.ticket.id" :data-state="node.ticket.state" :style="{ gridColumn: node.column, gridRow: node.row }">
        <a v-if="/^https?:\/\//i.test(node.ticket.url)" class="flex min-h-control items-center no-underline @hover:underline active:text-flow-lavender" data-map-item :href="node.ticket.url" target="_blank" rel="noopener noreferrer" dir="auto">{{ node.ticket.title }}</a>
        <div v-else data-map-item tabindex="0" dir="auto">
          {{ node.ticket.title }}
          <p class="quiet">{{ node.ticket.url }}</p>
        </div>
        <p class="text-small font-semibold" :class="{ resolved: 'text-flow-green', frontier: 'text-flow-blue', blocked: 'text-flow-red', claimed: 'text-flow-peach', 'out-of-scope': 'text-flow-subtext' }[node.ticket.state]" data-map-state>{{ labels[node.ticket.state] }}</p>
        <p v-if="node.blockers.length" class="quiet" dir="auto">Blocked by {{ node.blockers.join(", ") }}</p>
      </li>
    </ol>
  </div>
</template>

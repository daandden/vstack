<script setup lang="ts">
import type { WayfinderTicket } from "#flow/model.ts";

const props = defineProps<{ tickets: WayfinderTicket[] }>();
const graph = ref<HTMLElement>();
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
  const rows = new Map<number, number>();
  return props.tickets.map((ticket) => {
    const column = columns.get(ticket.id)!;
    const row = (rows.get(column) ?? 0) + 1;
    rows.set(column, row);
    return { ticket, column, row, blockers: ticket.blockers.map((id) => byId.get(id)!.title) };
  });
});
const columnCount = computed(() => layout.value.reduce((max, node) => Math.max(max, node.column), 1));
const edges = ref<{ blocker: string; ticket: string; path: string }[]>([]);
watchEffect((cleanup) => {
  const nodes = layout.value;
  const el = graph.value;
  if (!el) return;
  const measure = () => {
    const origin = el.getBoundingClientRect();
    if (!origin.width) return;
    const boxes = new Map([...el.querySelectorAll<HTMLElement>("[data-ticket-node]")].map((node) => [node.dataset.ticketNode!, node.getBoundingClientRect()]));
    edges.value = nodes.flatMap(({ ticket }) => ticket.blockers.map((blocker) => {
      const from = boxes.get(blocker)!, to = boxes.get(ticket.id)!;
      const x = from.right - origin.left, y = (from.top + from.bottom) / 2 - origin.top;
      const endX = to.left - origin.left, endY = (to.top + to.bottom) / 2 - origin.top;
      const middle = (x + endX) / 2;
      return { blocker, ticket: ticket.id, path: `M${x},${y} C${middle},${y} ${middle},${endY} ${endX},${endY}` };
    }));
  };
  const observer = new ResizeObserver(measure);
  observer.observe(el);
  for (const node of el.querySelectorAll<HTMLElement>("[data-ticket-node]")) observer.observe(node);
  measure();
  cleanup(() => observer.disconnect());
}, { flush: "post" });
</script>

<template>
  <p v-if="!tickets.length" class="wayfinder-empty quiet p-4">No tickets charted yet.</p>
  <div v-else ref="graph" class="wayfinder-graph relative [inline-size:max-content] min-w-full p-4">
    <svg class="wayfinder-links pointer-events-none absolute inset-0 [inline-size:100%] [block-size:100%] overflow-visible text-muted [&>path]:fill-none [&>path]:stroke-current [&>path]:[stroke-width:1.5] [&_marker_path]:fill-current" role="img" aria-label="Blocking links point from a blocker to the ticket it blocks">
      <defs><marker id="wayfinder-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" /></marker></defs>
      <path v-for="edge in edges" :key="`${edge.blocker}:${edge.ticket}`" :data-blocker="edge.blocker" :data-ticket="edge.ticket" :d="edge.path" marker-end="url(#wayfinder-arrow)" />
    </svg>
    <ol class="wayfinder-nodes relative m-0 grid list-none items-start gap-x-16 gap-y-8 p-0" :style="{ gridTemplateColumns: `repeat(${columnCount}, 18rem)` }" aria-label="Wayfinder tickets">
      <li v-for="node in layout" :key="node.ticket.id" class="min-w-0 wrap-anywhere rounded-md border border-default bg-default p-3" :data-ticket-node="node.ticket.id" :data-state="node.ticket.state" :style="{ gridColumn: node.column, gridRow: node.row }">
        <a v-if="/^https?:\/\//i.test(node.ticket.url)" class="block min-h-11 py-1.5 text-info active:bg-accented hover:bg-accented" data-map-item :href="node.ticket.url" target="_blank" rel="noopener noreferrer" dir="auto">{{ node.ticket.title }}</a>
        <div v-else data-map-item tabindex="0" dir="auto">
          {{ node.ticket.title }}
          <p class="quiet">{{ node.ticket.url }}</p>
        </div>
        <p class="wayfinder-state font-semibold" :class="{ resolved: 'text-success', frontier: 'text-info', blocked: 'text-error', claimed: 'text-flow-yellow', 'out-of-scope': 'text-default' }[node.ticket.state]" data-map-state>{{ labels[node.ticket.state] }}</p>
        <p v-if="node.blockers.length" class="quiet" dir="auto">Blocked by {{ node.blockers.join(", ") }}</p>
      </li>
    </ol>
  </div>
</template>

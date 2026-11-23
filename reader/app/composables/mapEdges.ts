import { shallowRef, watchEffect, type Ref } from "vue";

export type MapLink = { from: string; to: string; columnSpan?: number };

export function useMapEdges(graph: Readonly<Ref<HTMLElement | null>>, links: () => MapLink[], nodeAttribute: string) {
  const edges = shallowRef<(MapLink & { path: string })[]>([]);
  watchEffect((cleanup) => {
    const el = graph.value;
    const connections = links();
    if (!el || !connections.length) {
      edges.value = [];
      return;
    }
    const nodes = [...el.querySelectorAll<HTMLElement>(`[${nodeAttribute}]`)];
    const skipsColumns = connections.some(link => (link.columnSpan ?? 1) > 1);
    const measure = () => {
      const origin = el.getBoundingClientRect();
      if (!origin.width) return;
      const boxes = new Map(nodes.map(node => [node.getAttribute(nodeAttribute), node.getBoundingClientRect()]));
      const rail = skipsColumns ? parseFloat(getComputedStyle(el).paddingTop) / 2 : 0;
      edges.value = connections.map(link => ({
        ...link,
        path: route(origin, boxes.get(link.from)!, boxes.get(link.to)!, link.columnSpan ?? 1, rail),
      }));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const node of nodes) observer.observe(node);
    measure();
    cleanup(() => observer.disconnect());
  }, { flush: "post" });
  return edges;
}

function route(origin: DOMRect, from: DOMRect, to: DOMRect, columnSpan: number, rail: number) {
  const x = from.right - origin.left, y = from.top - origin.top + from.height / 2;
  const endX = to.left - origin.left, endY = to.top - origin.top + to.height / 2;
  if (columnSpan > 1) {
    // Fixed-width columns leave equal gutters. Route over intervening cards using the two nearest gutters.
    const halfGap = (endX - x - (columnSpan - 1) * from.width) / (2 * columnSpan);
    return `M${x} ${y} H${x + halfGap} V${rail} H${endX - halfGap} V${endY} H${endX}`;
  }
  if (y === endY) return `M${x} ${y} H${endX}`;
  return `M${x} ${y} H${(x + endX) / 2} V${endY} H${endX}`;
}

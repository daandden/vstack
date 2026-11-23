<script setup lang="ts">
import VisAxis from "@unovis/vue/components/axis";
import VisLine from "@unovis/vue/components/line";
import VisScatter from "@unovis/vue/components/scatter";
import VisXYContainer from "@unovis/vue/containers/xy-container";
import { CurveType } from "@unovis/ts/types/curve";
import { Scale } from "@unovis/ts/types/scale";
import { bin } from "d3-array";
import type { MetricsView, ValueView } from "#flow/model.ts";

type Series = ValueView & { name: string; color: string };
type Point = { x: number; y: number };
type Mark = Point & { series: Series; bounds?: [number, number] };
type Domain = [number, number];

const { measurement, series } = defineProps<{
  measurement: MetricsView["measurements"][number];
  series: Series[];
}>();
const histogram = computed(() => measurement.chart === "histogram");
const xScale = Scale.scaleLinear();
const yScale = Scale.scaleLinear();
const plotHeight = 260;
const baselineDash = [5, 3];
const x = (p: Point) => p.x;
const y = (p: Point) => p.y;
const stroke = (p: Mark) => p.series.color;
const pointFill = (p: Mark) => p.series.baseline ? "var(--color-base)" : stroke(p);
const pointStrokeWidth = (p: Mark) => p.series.baseline ? 2.5 : 1;

const pointSeries = computed(() => histogram.value ? [] : series.map(s => ({
  series: s.series,
  baseline: s.baseline,
  color: s.color,
  data: (s.points ?? []).map(p => ({ ...p, series: s })).sort((a, b) => a.x - b.x),
})));
const points = computed<Mark[]>(() => pointSeries.value.flatMap(s => s.data));
const distribution = computed(() => {
  if (!histogram.value) return;
  let min = Infinity, max = -Infinity, count = 0;
  for (const s of series) {
    if (!Array.isArray(s.samples)) continue;
    count += s.samples.length;
    for (const sample of s.samples) {
      min = Math.min(min, sample);
      max = Math.max(max, sample);
    }
  }
  if (!count) return;
  const domain: Domain = min === max && max + 1 === max
    ? [min - Math.abs(min) * 0.05, max]
    : [min, min === max ? max + 1 : max];
  const binSamples = bin().domain(domain).thresholds(Math.min(20, Math.ceil(Math.sqrt(count))));
  const marks: Mark[] = [];
  let largest = 1;
  for (const s of series) {
    if (!Array.isArray(s.samples)) continue;
    for (const b of binSamples(s.samples)) {
      const low = b.x0!, high = b.x1!;
      marks.push({ x: low / 2 + high / 2, y: b.length, series: s, bounds: [low, high] });
      largest = Math.max(largest, b.length);
    }
  }
  return { domain, marks, largest };
});
function niceDomain(marks: Mark[], accessor: (p: Point) => number): Domain {
  if (!marks.length) return [0, 1];
  let min = Infinity, max = -Infinity;
  for (const mark of marks) {
    const value = accessor(mark);
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1;
    min -= pad;
    max += pad;
  }
  const [start, end] = Scale.scaleLinear().domain([min, max]).nice(4).domain();
  return [start!, end!];
}
const xDomain = computed<Domain>(() => distribution.value?.domain ?? niceDomain(points.value, x));
const yDomain = computed<Domain>(() => distribution.value ? [0, distribution.value.largest] : niceDomain(points.value, y));
const histogramTicks = computed(() => distribution.value && yScale.copy().domain(yDomain.value).ticks(4).filter(Number.isInteger));

// Unovis owns sizing and scales. Its bar marks have one width per component,
// so draw the shared histogram intervals against those scales as exact rectangles.
const layout = shallowRef<{ width: number; height: number; left: number; top: number }>();
function onRender(_svg: SVGSVGElement, margin: { left?: number; top?: number }, _bleed: unknown, width: number, height: number) {
  layout.value = { width, height, left: margin.left ?? 0, top: margin.top ?? 0 };
}
const rectangles = computed(() => {
  if (!layout.value || !distribution.value) return [];
  return distribution.value.marks.map(mark => {
    const [low, high] = mark.bounds!;
    const top = yScale(mark.y);
    return { mark, x: xScale(low) + 1, y: top + 1, width: Math.max(0, xScale(high) - xScale(low) - 2), height: Math.max(0, yScale(0) - top - 2) };
  });
});
const navigation = computed(() => (distribution.value?.marks ?? points.value).toSorted((a, b) => a.x - b.x || b.y - a.y));
const focusIndex = shallowRef(-1);
let hover = false;
const focused = computed(() => navigation.value[focusIndex.value]);
const announcement = computed(() => {
  const p = focused.value;
  if (!p) return "";
  const { unit } = measurement;
  return p.bounds
    ? `${p.series.name}: ${p.bounds[0]} to ${p.bounds[1]} ${unit}, ${p.y} ${p.y === 1 ? "sample" : "samples"}`
    : `${p.series.name}: x ${p.x}, y ${p.y} ${unit}`;
});
const focusPosition = computed(() => {
  const p = focused.value;
  if (!p || !layout.value) return;
  const y = yScale(p.y);
  return { x: xScale(p.x), y: p.bounds ? (y + yScale(0)) / 2 : y };
});
watch(navigation, () => { focusIndex.value = -1; });
function focusFirst() {
  if (focusIndex.value < 0 && navigation.value.length) focusIndex.value = 0;
}
function clearFocus() {
  focusIndex.value = -1;
  hover = false;
}
function moveFocus(event: KeyboardEvent) {
  const last = navigation.value.length - 1;
  if (last < 0) return;
  switch (event.key) {
    case "Home": focusIndex.value = 0; break;
    case "End": focusIndex.value = last; break;
    case "ArrowLeft":
    case "ArrowUp": focusIndex.value = Math.max(0, focusIndex.value - 1); break;
    case "ArrowRight":
    case "ArrowDown": focusIndex.value = Math.min(last, focusIndex.value + 1); break;
    default: return;
  }
  hover = false;
  event.preventDefault();
}
function pointerFocus(event: PointerEvent) {
  if (!layout.value || !(event.currentTarget instanceof HTMLElement)) return;
  const box = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - box.left - layout.value.left;
  const y = event.clientY - box.top - layout.value.top;
  let closest = -1;
  let distance = 24 ** 2;
  for (const [index, p] of navigation.value.entries()) {
    const top = yScale(p.y);
    const bottom = p.bounds ? yScale(0) : top;
    const within = p.bounds && y >= top && y <= bottom && x >= xScale(p.bounds[0]) && x <= xScale(p.bounds[1]);
    const d = within ? 0 : (x - xScale(p.x)) ** 2 + (y - (top + bottom) / 2) ** 2;
    if (d <= distance) {
      distance = d;
      closest = index;
    }
  }
  hover = true;
  focusIndex.value = closest;
}
</script>

<template>
  <div class="plot-and-status">
    <div
      class="plot"
      role="img"
      aria-roledescription="chart"
      :aria-label="`${measurement.name} ${measurement.chart} chart`"
      :aria-description="`Values in ${measurement.unit}. Arrow keys move through points. Home and End jump to the first and last point. Exact values are in the chart data table.`"
      tabindex="0"
      @focus="focusFirst"
      @blur="clearFocus"
      @keydown="moveFocus"
      @pointermove="pointerFocus"
      @pointerleave="hover && clearFocus()"
    >
      <VisXYContainer
        :height="plotHeight"
        :duration="0"
        :x-scale="xScale"
        :y-scale="yScale"
        :x-domain="xDomain"
        :y-domain="yDomain"
        :on-render-complete="onRender"
        aria-hidden="true"
      >
        <template v-if="!histogram">
          <template v-if="measurement.chart === 'line'">
            <VisLine
              v-for="s in pointSeries"
              :key="s.series"
              :data="s.data"
              :x="x"
              :y="y"
              :color="s.color"
              :curve-type="CurveType.Linear"
              :line-width="s.baseline ? 2.5 : 1.5"
              :line-dash-array="s.baseline ? baselineDash : undefined"
            />
          </template>
          <VisScatter
            :data="points"
            :x="x"
            :y="y"
            :color="pointFill"
            :size="measurement.chart === 'line' ? 5 : 8"
            :stroke-color="stroke"
            :stroke-width="pointStrokeWidth"
          />
        </template>
        <VisAxis type="x" :label="histogram ? measurement.unit : 'x'" :num-ticks="4" :grid-line="false" tick-text-adaptive-sets />
        <VisAxis type="y" :label="histogram ? 'Samples' : measurement.unit" :num-ticks="4" :tick-values="histogramTicks" />
      </VisXYContainer>
      <svg v-if="layout" class="plot-overlay" :viewBox="`0 0 ${layout.width} ${layout.height}`" aria-hidden="true">
        <g :transform="`translate(${layout.left},${layout.top})`">
          <rect
            v-for="(rect, index) in rectangles"
            :key="index"
            :x="rect.x"
            :y="rect.y"
            :width="rect.width"
            :height="rect.height"
            :fill="stroke(rect.mark)"
            fill-opacity="0.25"
            :stroke="stroke(rect.mark)"
            :stroke-width="pointStrokeWidth(rect.mark)"
          />
          <circle v-if="focusPosition" :cx="focusPosition.x" :cy="focusPosition.y" r="6" fill="none" stroke="var(--color-text)" stroke-width="2" />
        </g>
      </svg>
    </div>
    <p role="status" aria-live="polite" aria-atomic="true" class="plot-status">{{ announcement }}</p>
  </div>
</template>

<style scoped>
.plot-and-status {
  display: grid;
  gap: 0.25rem;
}

.plot {
  position: relative;
  min-inline-size: 0;
  --vis-axis-font-family: var(--font-sans, monospace);
  --vis-axis-label-font-size: var(--text-small);
  --vis-axis-label-color: var(--color-subtext0);
  --vis-axis-tick-label-font-size: var(--text-small);
  --vis-axis-tick-label-color: var(--color-subtext0);
  --vis-axis-tick-color: var(--color-line);
  --vis-axis-grid-color: var(--color-line);
  --vis-axis-domain-color: var(--color-line);
}

.plot:focus-visible {
  outline: 2px solid var(--color-mauve);
  outline-offset: 2px;
}

.plot-overlay {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
  pointer-events: none;
}

.plot-status {
  min-block-size: 1lh;
  color: var(--color-subtext0);
  font-size: var(--text-small);
  overflow-wrap: anywhere;
}
</style>

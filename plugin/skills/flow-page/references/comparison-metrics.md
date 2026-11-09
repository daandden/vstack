# Comparison and Metrics fields, version 1

Read this reference before publishing a `comparison` or `metrics` Result. Use the common Result and revision fields in [Result fields](results.md).

Use `catalog` to list shapes and `describe comparison --compact` or `describe metrics --compact` for current field contracts. The rules below cover relationships, measurements, and reader behavior.

  - `comparison` puts alternatives side by side. It has `alternatives`, two or more `{ ref, name }` with an optional `summary` and `attachments` (that side's own evidence); `criteria`, one or more `{ ref, name }` with an optional `description`; `assessments`, at most one `{ alternative, criterion, finding }` per pair, with optional `evidence` (such as the file and line). And `verdict`, the verdict you recorded: `{ outcome, reason }`, where `outcome` is `chosen` with `alternative` naming the choice, or `tie` or `inconclusive` with no `alternative`. A pair with no assessment shows as not assessed.
  - `metrics` carries measurements. It has `workload` (what was measured, such as the operation and its inputs), an optional `environment`, `outcome` (the outcome as you report it), `series` (each `{ ref, label }`, such as a commit or a variant, with `baseline: true` on at most one), and `measurements`. Each measurement has `ref`, `name`, `unit`, optional `better` (`lower` or `higher`), an optional reported `verdict` (`better`, `worse`, `no-difference`, or `inconclusive`), and `values`. A value is `{ series, value }`, where `value` is a JSON number, with optional `samples` (the run count) and `uncertainty` (`{ low, high, of }` or `{ plusminus, of }`, where `of` names it, such as `min to max` or `95% CI`), or `{ series, missing }` with the reason there is none. A series with no value shows as missing, never as zero. The script draws each measurement's bars and computes each value's change from the baseline. It rates nothing, so a verdict appears only when you give one.
    - Each measurement's bars share a scale from zero. A measurement with a negative value keeps its numeric table and has no bars.
    - Deltas use the measurement's unit. A `%` measurement uses `pp` for its absolute delta. A zero baseline has no relative percentage. A delta outside the numeric range shows as unavailable.

## Metrics charts

A measurement may set `chart` to `line`, `scatter`, or `histogram`. Measurements without `chart` keep their numeric tables and zero-based bars.

- `line` and `scatter` require each measured series value to carry `points`, a non-empty array of `{ x, y }` pairs of finite JSON numbers. Lines connect points in increasing x order. Scatter draws dots without connections.
- `histogram` requires `samples`, a non-empty array of finite JSON numbers, instead of a sample count. The reader bins the samples on a shared scale across series. The data table retains every raw sample, including duplicates.
- A charted series value may omit its scalar `value`, or report it alongside the chart data. The reader never derives a scalar or a verdict from points or samples. Without scalar values on both sides, there is no scalar baseline delta.
- Point charts still accept an integer `samples` count. Scalar measurements still use `samples` as a positive integer count. Raw sample arrays require `chart: "histogram"`.
- `unit`, `better`, `verdict`, the baseline series, and reported `uncertainty` retain their meanings. Uncertainty describes the reported measurement, not per-point error bars. Explicit `{ series, missing }` values remain available for runs that produced no data.

For example, a line measurement can omit both scalar values:

```json
{
	"ref": "latency",
	"name": "Latency by concurrency",
	"unit": "ms",
	"better": "lower",
	"chart": "line",
	"values": [
		{ "series": "main", "points": [{ "x": 1, "y": 10 }, { "x": 8, "y": 24 }] },
		{ "series": "branch", "points": [{ "x": 1, "y": 8 }, { "x": 8, "y": 16 }] }
	]
}
```

The reader marks baseline series in the legend and uses dashed baseline lines or outlined baseline marks. Each chart has an exact-value data table and keyboard navigation. Tab focuses the chart; arrow keys move through points; Home and End reach the first and last points. Focused values are announced and shown below the chart. Theme colors update without a reload.

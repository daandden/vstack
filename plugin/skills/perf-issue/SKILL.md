---
name: perf-issue
description: Seven ordered performance strategies, benchmark vetting, and exact-operation measurement evidence.
disable-model-invocation: true
---

# Perf issue

Performance knowledge for diagnosing-bugs or implement. Tie each proposed fix to measurement evidence, not a source-reading guess.

Follow `skill://flow-page`'s "Stage entry/exit line" for an investigation run.

## Exact-operation baseline and comparison

Use an agent-runnable measurement that prints one number with its unit for the exact slow operation. Record the command, workload, environment, baseline number, and before trace. Keep the artifacts under the resolved Scratch dir. Freeze inputs and measurement conditions for the comparison. A synthetic result on another operation is not a baseline.

Vet the baseline with skill://benchmark-checklist before you plan a fix from it. Vet each later number the same way.

Trace the measured operation through the code. Ground each hypothesis in that trace and cite the relevant code.

Capture an after trace on the same original operation, inputs, environment, and unit. Parse and compare both traces. Report the baseline, post-fix number, absolute delta, and percentage delta when the baseline is nonzero. Name the command, workload, and artifact paths. Inconclusive numbers or evidence from another operation do not prove a fix.

Publish baseline and after as numeric series in a Metrics Result with the exact workload, environment, unit, sample count, uncertainty, and honest verdict. The renderer derives baseline deltas. An absent after capture is missing evidence, not a zero or a measured improvement. Use a Comparison Result for strategy assessments and verdict, a Document for the limiter and remaining uncertainty, and Code Results for relevant source changes. Attach redacted before and after traces and command outputs, preserving their Scratch files. Summarize its Results without a Flow link rather than writing a separate report page.

## Performance mantras

Try the performance mantras in order, cheapest first:

1. Don't do it. Stop work whose result nothing uses rather than cheapening it.
2. Do it, but don't do it again.
3. Do it less.
4. Do it later.
5. Do it when they're not looking.
6. Do it concurrently.
7. Do it cheaper.

When an earlier mantra meets the target, stop. For the first mantra, use skill://how to establish that nothing uses the result. A trace alone cannot prove that work is unnecessary.

---
name: perf-issue
description: Eight performance strategy families and exact-operation measurement evidence.
disable-model-invocation: true
---

# Perf issue

Performance knowledge for diagnosing-bugs or implement. Tie each proposed fix to measurement evidence, not a source-reading guess.

## Exact-operation baseline and comparison

Use an agent-runnable measurement that prints one number with its unit for the exact slow operation. Record the command, workload, environment, baseline number, and before trace. Keep the artifacts under the resolved Scratch dir. Freeze inputs and measurement conditions for the comparison. A synthetic result on another operation is not a baseline.

Capture an after trace on the same original operation, inputs, environment, and unit. Parse and compare both traces. Report the baseline, post-fix number, absolute delta, and percentage delta when the baseline is nonzero. Name the command, workload, and artifact paths. Inconclusive numbers or evidence from another operation do not prove a fix.

## Strategy families

Read [STRATEGIES.md](STRATEGIES.md) for the eight strategy families. Use them to form hypotheses, not a checklist of changes. A family earns an attempt only when the trace shows its signal. For elimination, use skill://how to establish that nobody needs the work. A trace alone cannot prove that work is unnecessary.

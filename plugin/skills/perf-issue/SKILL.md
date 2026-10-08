---
name: perf-issue
description: 'Fix measured slowness or a performance regression with a baseline and before → after proof. Use for "slow", "regressed", or "make X faster" when a one-off fix is wanted. Use hillclimb for sustained work against a metric target.'
---

# Perf issue

Own the measurement story. Tie every fix to a measurement, not a source-reading guess.

Read skill://implement/END-STATE.md before work. It owns shared steps 0a–0c, 3b, and 4–7. Reuse that block by reference, never maintain a copy here. Before task-specific items, copy its steps and step 1 below verbatim, including their paragraphs, into the todo list in execution order. Keep unfinished steps as `skip: <reason>`.

Run shared steps 0a–0c once. Reuse the caller's End state and run record.

## 1. Diagnose and fix the measured slowness

Run skill://diagnosing-bugs through all six phases, with the overlays below. Keep its red-capable loop, ranked falsifiable hypotheses, regression-test seam rules, and cleanup. Ground nontrivial work through skill://how. Do not claim a performance ceiling without running the measurement first.

In Phase 1, build an agent-runnable measurement that prints one number with its unit for the exact slow operation. Record the command, workload, environment, baseline number, and baseline trace. Keep the artifacts under the resolved Scratch dir. Freeze inputs and measurement conditions for the comparison. Capture the real app through the project's Verify skill using shared step 4's discovery and Launch/Drive procedure. If no Verify skill exists, record that and use the real operation's measurement script or profiler. A synthetic result on another operation is not a baseline.

In Phase 2, reproduce and minimize the slow case. Keep the original workload for the final comparison. Retain the user's exact symptom and baseline evidence as the diagnosis input when forensics already supplied it.

In Phase 3, read [STRATEGIES.md](STRATEGIES.md). Generate hypotheses from its eight strategy families, not a checklist of changes. A family earns an attempt only when the trace shows its signal. Elimination requires skill://how to establish that nobody needs the work. Rank falsifiable predictions through diagnosing-bugs' `ask` checkpoint before testing them.

Before Phase 4, if the fix crosses a function boundary, run skill://architect at its `sketch` stop only. Retain its design package and rationale, then implement against the sketch yourself. Do not hand implementation to another model or leave `not implemented` bodies in the deliverable.

In Phase 4, use diagnosing-bugs' perf branch. Measure first, then bisect and test one attempt at a time. Apply skill://principle-sequence-verifiable-units. Prove each attempt before trying the next. Reject or revert attempts whose numbers do not support the prediction.

In Phase 5, follow skill://tdd at the agreed regression-test seam before applying the accepted fix. Capture a post-fix trace on the same original loop, inputs, environment, and unit. Parse and compare both artifacts. Load JSON captures into sqlite when that enables the comparison, then query and diff the measured operation. Report baseline, post-fix, absolute delta, and percentage delta when the baseline is nonzero. Inconclusive numbers or proof from the wrong operation fail this step. Do not claim a fix or publish an unproven attempt. If tdd stops for missing red evidence, preserve that slice uncommitted and use the shared cap at commit.

Finish Phase 6. Remove tagged debug instrumentation and throwaway probes, keep the proof artifacts, and record the confirmed cause.

After all work, run shared step 3b, then step 4 for live proof of the final diff. Commit accepted, proven work through shared step 6, with before → after numbers and the cause in the body. Run shared step 5 once after the last work commit. Fix accepted findings in new commits and renew affected proof. Run shared step 7 once for the invocation. Pass the before → after numbers and artifact paths to open-pr for its Verification section.

## Reply

Report the baseline, post-fix number, unit, delta, command, workload, and artifact paths. State the requested and reached End state, commits, and any PR URL with observed status. Include live proof, Safety findings, skipped steps, stopped slices, open prune-comments work, and blockers. Include the decision-trail log and Attention result when open. Never call an inconclusive comparison a win.

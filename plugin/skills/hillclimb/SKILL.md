---
name: hillclimb
description: Frozen measurements and isolated hypotheses for sustained metric improvement, with one commit per accepted win.
disable-model-invocation: true
---

# Hillclimb

Own the metric and the experiment's integrity. One hypothesis, one measurement, keep or reject. Code inspection is not a measured win; follow skill://principle-prove-it-works.

## Start

The grill settles one metric, its unit, the direction that counts as better, the target, and a checkable stop predicate. The predicate pairs the target with a minimum attempt count. Use supplied numbers and ask about each missing decision before the grill closes. Pass this contract to implement. implement runs the loop without more questions about these decisions.

implement owns the branch, commits, and End state. Reuse its run record, absolute vstack root, and project Scratch dir. Fix the absolute attempt log path `<Scratch dir>/hillclimb/<run-id>/attempts.tsv` once, beside the run's evidence, and keep it for the whole loop. Every worker uses the Session model unless the user overrides it.

Read `skill://flow-page`, discover this session and agent's `bound` Flow, and open a `hillclimb` Stage there with the implement Stage as `--parent`. An unbound result-producing run starts a Flow. A reference read adds no Stage. Record any asks through this Stage. Only the parent publishes the workers' returned measurements and outcomes.

Before any hypothesis, require `omp config get task.isolation.enabled` to print `true`. If isolation is off, stop and point at `/skill:setup-vstack`.

## 1. Ground the workload and architecture

Run skill://how over the target. Name realistic workload dimensions that move the result: data size, history, state, and concurrency. Select a case that reproduces the complaint. If none does, fix the reproduction before measuring hypotheses. Use the metric, unit, direction, target, and stop predicate that the grill settled. If that contract is missing, report the gap instead of starting the loop or inventing numbers.

## 2. Build, prove, and freeze the harness

Follow skill://principle-build-the-lever. Run contrasting realistic workloads: the target reproduces the symptom and easier cases separate as expected. If not, revise the workload or metric before freezing. Vet the harness with skill://benchmark-checklist before you freeze it. Make the harness print its error count and a count of the work done. Freeze one repeatable command, its inputs, environment, sample count, statistic (median of N), and noise threshold. Save the harness and raw baseline samples as evidence under the project Scratch dir. Keep a hash or revision of the harness and named fixtures so each result can be tied to the frozen version.

Record the baseline and a green regression gate before changing product code. The gate is the agreed set of checks that must keep passing. For a user-facing metric, use the project's Verify skill as the measurement surface, discovering and maintaining it through shared step 4. Changes to the harness invalidate comparisons; restart measurement with a new declared baseline rather than calling it a product win.

## 3. Keep the attempt log

hillclimb owns its attempt log. It is a TSV file with six columns, and every cell is one line:

- `ts`: ISO8601 timestamp.
- `phase`: the wave or phase.
- `decision`: the hypothesis or choice, in one line.
- `why`: the reason in plain words.
- `evidence`: pointers that prove the claim, such as raw measurement paths, patch paths, and commit SHAs.
- `result`: the outcome, such as `kept`, `rejected`, `deferred`, or `INCONCLUSIVE`.

Only the parent appends, and only through the helper:

```sh
bash "$(realpath skill://hillclimb/scripts/log.sh)" "$logfile" "$phase" "$decision" "$why" "$evidence" "$result"
```

The helper takes the absolute log path, creates its parent dir, and writes the header on first use. It stamps `ts`, strips tabs, newlines, and carriage returns, and quotes spreadsheet formula prefixes `=`, `+`, `-`, and `@`. The log is append-only. Supersede a wrong row with a new row. Read the log before each wave.

Log every attempt from the workers' returned results, including rejects, failed workers, missing or empty patches, deferred winners, and parent-validation failures. Put the hypothesis in `decision`; put before → after, unit, delta, noise threshold, frozen-harness identity, gate command and outcome, and evidence paths in `evidence`/`result`. Cite raw measurements, patch paths, and accepted commit SHAs. Use one attempt row for each tested hypothesis and append a superseding outcome when selection or parent validation changes its verdict. Deferred wins are not kept wins.

Keep `attempts.tsv` as the canonical append-only export. Capture it as a file attachment on the Flow Result after each wave, preserving earlier snapshots. The Flow page does not replace the log or add another writer to it. Redact secrets before writing the log or capturing any evidence.

## 4. Ground the hypotheses

Derive each hypothesis from step 1's architecture model. Name a specific mechanism, tight edit scope, expected metric effect, and behavior that must remain unchanged. For a performance metric, order hypotheses by the performance mantras in skill://perf-issue. Borrow only their order, not their stop rule. Queue independent hypotheses against the current accepted baseline. Give a wave a stable baseline SHA and tree state; keep its candidate paths unchanged in the parent until selection. Follow skill://principle-separate-before-serializing-shared-state.

## 5. Run and select a wave

Each attempt makes one scoped change, measures before and after with the frozen harness, and runs the regression gate. A win exceeds the noise threshold in the declared direction and keeps the gate green. Inconclusive measurements and failed gates reject the attempt. Follow skill://principle-guard-the-context-window: keep reduced findings in the parent, with paths to full evidence.

For two or more independent live hypotheses, use the Fan-out line below.

Before this step, read skill://vstack-fan-out.

Fan-out (skill://vstack-fan-out): parts: one per independent hypothesis. One eval cell: per part, `agent(<prompt>, agent="vstack-worker", isolated=True, apply=False, merge=False)`; `wait()` on all handles. Each prompt: one hypothesis, its baseline and real target paths, the frozen harness and fixtures, noise threshold, regression gate, evidence return contract below, the vstack root, the Scratch dir. Recover each `patchPath` from its completion notice and apply only the best measured win after all results are read. If they cannot start or isolation is off, stop: hillclimb needs isolated attempts, so run `/skill:setup-vstack`.

For one live hypothesis, use one isolated worker:

Spawn one `vstack-worker` via eval `agent(<prompt>, agent="vstack-worker", isolated=True, apply=False, merge=False)`: one hypothesis with the same baseline, target paths, frozen harness, noise threshold, regression gate, evidence return contract, the vstack root, the Scratch dir. Wait for its result. If it cannot be spawned, stop: hillclimb needs isolated attempts, so run `/skill:setup-vstack`.

Worker return contract: hypothesis and changed paths; baseline identity; exact measurement and gate commands; before and after samples, median, unit, delta, noise decision, error and work counts, and gate outcome; absolute evidence paths; rationale and open questions. Write product changes inside the supplied clone at real target paths so they enter its patch. Use a distinct `<Scratch dir>/hillclimb/<run-id>/<wave>/<attempt>/` for evidence. Reuse supplied root and Scratch paths without resolving them again. Workers never write the attempt log, commit, push, or change the harness. Every rejection leaves its patch unapplied.

Pair handles and results in input order. A handle has no `patchPath` field. Recover that path from omp's completion notice: `Isolation: changes captured at <absolute patch path> (apply=false). Not applied.` Read the patch before selecting it. If structured output hides the notice, read the full completion through the handle's `output()` or `agent://<id>`. An unavailable notice, empty patch, failed worker, or missing measurement is a logged rejection, not a guessed patch path.

Read every diff and measurement. Compare only results on the same frozen harness and wave baseline. Rank passing wins by improvement in the declared direction; for indistinguishable gains, prefer the simpler change under skill://principle-laziness-protocol. Apply only the best measured win with `git apply -- "<chosen patchPath>"`. Leave losing patches untouched and cite their absolute paths. Queue other measured winners for fresh measurement against the new accepted baseline; never graft or apply their stale patches.

If applying the selected patch fails because the parent moved, stop and report instead of forcing it. Re-run the frozen measurement and regression gate in the parent before acceptance. If the win fails to reproduce or behavior breaks, undo only this attempt's changes, preserve unrelated work, and log the rejection. For a reproduced win, stage only its paths or hunks (`git add <files>`, never `-A`) and make one commit with before → after evidence. Record the commit and advance the accepted baseline. Follow skill://principle-sequence-verifiable-units: finish validation and logging before the next wave.

## 6. Push past the first plateau

On several rejects in a row, pivot category, re-read the source, combine near-misses as a new measured hypothesis, or try a different mechanism before concluding. Correctness and simplicity outrank the number. Revert a behavior-breaking win in a new commit and log why. A simplification that holds the number may be kept as a separately proved cleanup, not counted as a metric win. Re-establish the accepted baseline after any revert or cleanup.

## 7. Stop honestly

Stop when the target and attempt floor are both met, or when remaining ideas are marginal and not worth their cost. Keep cheap untried hypotheses in play. Surface a stuck run rather than spinning. Never relax the predicate to declare success; distinguish target reached from ideas exhausted or blocked. Count every measured hypothesis as an iteration, including deferred winners; remeasurement is a new attempt.

## 8. Return to implement

After the loop, implement resumes its End state chain. Keep accepted wins in separate commits and in landing order. Run code-review once after the last work commit. Put the review fixes in new commits. Live proof covers the final diff, including cleanup and Verify maintenance.

## Reply

Report metric, unit and target; initial baseline → final with percent delta; attempts run, kept, rejected, and deferred; each accepted fix on one line with its commit; raw measurement and live-proof paths; losing patch paths; the absolute `attempts.tsv` path; the best next idea; and requested versus reached End state. Include open cleanup, verification, target, or isolation gaps. Claim only checks and outcomes that were observed.

Publish that report as a Document Result. Use Metrics for the initial baseline and final accepted measurement, with workload, environment, units, samples, uncertainty, target, and frozen-harness identity. Use Comparison for each wave's alternatives and evidence-backed verdict, Code/diff for accepted changes, and Timeline for every attempt including rejects, deferrals, failed gates, and superseding outcomes. Keep unmeasured hypotheses and missing proof distinct from measured wins. Attach raw samples, gate outputs, live proof, losing patches, and the latest log snapshot. Record requested and actually reached End state through the common progress items without treating a measured win as delivery. Finish this Stage and restore implement's binding before returning. The reply summarizes Results on the Flow page, not a separate report page.

---
name: forensics
description: "Diagnose a runtime symptom (leak, CPU spin, glitch) through live instrumentation or a captured cpuprofile, trace, heap snapshot, or spindump. Return a cited diagnosis without editing tracked files, not a fix."
---

# Forensics

Own the diagnosis. Capture and query evidence before attributing a cause to source. Leave every tracked file unchanged.

Open the todo list with steps 1–7 copied verbatim before task-specific items. Keep an undone step as `skip: <reason>`. There is no End state, fix, commit, decision-trail, or throughput checkpoint in this skill. A request for a fix goes to the hand-back in step 7.

## 1. Choose the branch and evidence directory

If the user supplies a captured artifact, take the artifact branch. Treat it as a fixed dataset. Do not rerun its workload. If the request describes a running symptom, take the live branch.

Resolve the absolute vstack root and mode through the Private-mode rule. Resolve the project Scratch dir once through skill://vstack-tmp, with its path script run without a kind argument. Keep this run's captures, sqlite database, queries, logs, and notes under `<Scratch dir>/verify/<app>-<run-id>/`. Use `forensics` for `<app>` when no app name is known. Put disposable app data in that entry's `data/` directory. Preserve supplied artifacts and write derived files only in Scratch.

Record the artifact path, format, capture time, app revision when known, and the workload that triggered the symptom. Record unknown fields as unknown. This step ends with the branch and absolute evidence directory named.

## 2. Capture the live signal

In the artifact branch, mark this step `skip: capture supplied` and continue to step 3.

List the project's Verify skills named `verify-*`. In Private mode, also list `<vstack root>/skills/verify-*/` and deduplicate links and targets. In Private mode, if a link is missing, create `.omp/skills/verify-<app>` as an absolute symlink to `<vstack root>/skills/verify-<app>`. Never replace a tracked path. Add `.omp/skills/verify-*` to the git common dir's `info/exclude` when missing. Never change a tracked ignore file. Read the skill by absolute path for this session. Resolve its helpers relative to that directory.

Use the only Verify skill, or the one whose description names the symptom's app feature. If several match without a clear choice, use `ask`. If none exists, record that live proof lacks a Verify skill. Capture with the app's profiler, debugger, or CDP (Chrome DevTools Protocol) instead. Recommend a Matt run through `/skill:grill-with-docs` to set up a Verify skill in the reply.

Run the selected Verify skill's Doctor, Launch, and Drive steps to reach the symptom. Attach the matching profiler or debugger. Capture a CPU profile for a spinning process, a heap snapshot for a leak, or a CDP trace for a glitch. Route capture output and app data to this run's Scratch entry. Read launch and helper commands before running them. If they write tracked files, use runtime tools or a disposable source copy as described in step 4 instead.

Drift is a failure in the Verify skill's instructions while Doctor passes. A missing command, route, selector, or fixture is Drift. Wrong app behavior is a finding, never Drift. On Drift, record the failed step and its evidence. Capture through the app's profiler, debugger, or CDP instead. Never edit the Verify skill. Recommend a Matt run through `/skill:grill-with-docs` to repair the cited Drift in the reply.

This step ends with a real capture, or a cited capture blocker. Without a capture, report the blocker without claiming a diagnosis.

## 3. Identify, shape, and reduce the artifact

Identify the format before selecting a parser. Use the matching DevTools or trace parser for cpuprofile and compressed `.json.gz`, heap tooling for heapsnapshot, or text parsing for spindump. Keep the tooling generic.

Transform the artifact into sqlite before reading its raw contents in context. Keep one row per sample, frame, or node, with the identifiers and relations needed to query it. Preserve sample durations and units, frame parents, heap edges and roots, or thread stacks and wait reasons as the format permits. Save the parser command, schema, row counts, and SQL queries with the database. Name fields the artifact does not provide.

For large artifacts that would crowd the main context, use one parser for the capture set. This is a single subagent, not Fan-out. Read skill://principle-guard-the-context-window at this step. Keep only its reduced finding in the main thread.

Parser brief: identify the formats and parse the supplied captures into this run's sqlite database. Query the cause and return the reduced finding, counts or timings with units, evidence queries, source mapping, and absolute artifact paths. Follow skill://principle-guard-the-context-window. Preserve inputs. Never edit tracked files or rerun the captured workload. Write only under the named Scratch entry. Return open questions to the parent.

Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): the parser brief above with the absolute capture paths and this run's evidence directory, the user's override words, the vstack root, the Scratch dir. Wait for its result. If it cannot be spawned, do the work yourself.

For a small artifact, do the same parsing and queries yourself. Query frames that hold the most time and walk the call tree to the hot path. For a leak, follow the retainer chain from the leaked object to a GC root. For a spindump, identify the thread stuck on-CPU or blocked and its wait reason. For a glitch, narrow the trace to the visible event and the scheduling work around it. Distinguish observed signal from inferred cause.

This step ends with a reduced finding supported by saved queries and measurements, or a specific parsing or evidence gap.

## 4. Prove the live mechanism

In the artifact branch, mark this step `skip: fixed captured dataset` and continue to step 5.

Test the reduced finding with injected instrumentation through CDP evaluation or the running process's debugger. Tag every debug log with one unique prefix, such as `[DEBUG-a4f2]`, per skill://diagnosing-bugs. Save the probe, its output, and the condition it tests. For example, count scheduling calls with no input, or measure allocations and the objects that remain retained.

Instrumentation never edits tracked files. Pstack's live hotfix step is dropped. If a probe needs source changes, copy the needed app files into an untracked Scratch directory without `.git`. Instrument and run only that disposable copy. Keep the original checkout, Verify skill, and tracked files in every worktree unchanged. Record the copy's source revision and any carried-over local changes. If a worktree is needed to run the app, create it through skill://vstack-worktree and instrument only through runtime tools there. A plain checkout that lacks required deps or environment files cannot prove that run.

Repeat the same workload and capture the instrumented signal for comparison. Save the probe's effect on the symptom. Instrumentation alone is not a paired-capture confirmation. This step ends with evidence for or against the mechanism, or the missing live proof.

## 5. Attribute the finding to source

Map the hot frame, allocation, scheduling call, or blocked thread through the artifact's symbols and source maps. Cite `file:symbol:line` and the evidence query or trace event behind it. Read the mapped source to connect the observed signal to its mechanism.

If symbols are missing, try the matching build's symbols without modifying tracked files. If mapping remains unavailable, write `unmapped` and name what is missing. Do not invent a source location from a similar function name. This step ends with a cited location or an explicit mapping gap.

## 6. Compare paired captures and remove instrumentation

If a paired capture exists, parse both through step 3 and diff them on the same workload and units. Explain whether the pair supports the proposed mechanism. Account for capture duration and workload differences before comparing counts or time. An inconclusive or unrelated pair does not confirm a cause. Do not change product code to create an after capture.

Use `confirmed` only when a paired capture supports the mechanism. Without that evidence, label the result `strongest hypothesis`, even when live probes support it. State unresolved alternatives and missing evidence.

Remove this run's tagged logs, breakpoints, hooks, and injected instrumentation. Stop only processes this run started. Discard its disposable source copy and remove its worktree through skill://vstack-worktree. Keep captures, queries, probe evidence, and notes in Scratch. Leave pre-existing user changes untouched. This step ends with the evidence label and instrumentation cleanup recorded.

## 7. Hand back the cited diagnosis

Report the following:

- The live signal or supplied artifact and its format.
- The reduced finding, with query results and units.
- How the mechanism was proved, or what proof is missing.
- The source location as `file:symbol:line`, or `unmapped` with its mapping gap.
- Absolute paths to captures, the database, queries, and probe evidence.
- Whether a paired capture confirmed the mechanism, or the result remains the strongest hypothesis.
- Any Drift, capture blocker, skipped step, or remaining alternative, and instrumentation cleanup.

For a defect or slowness, recommend `/skill:diagnosing-bugs` through the Matt flow. Pass the cited diagnosis and evidence paths as Phase 1 input. Stop at the diagnosis. Do not apply a fix or start an End-state chain.

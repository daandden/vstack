---
name: forensics
description: "Diagnose a runtime symptom (leak, CPU spin, glitch) through live instrumentation or a captured cpuprofile, trace, heap snapshot, or spindump. Return a cited diagnosis without editing tracked files, not a fix."
---

# Forensics

Own the diagnosis. Capture and query evidence before attributing a cause to source. Leave every tracked file in the checkout unchanged. In the live branch, one isolated worker runs the app and every probe in its own clone.

Open the todo list with one item per step 1–7 before task-specific items. Each item holds the step's id and heading, such as `3. Identify, shape, and reduce the artifact`, its status, as `skip: <reason>` for an undone step, and any blocker. The full step text stays below. Do not copy it into the todo list. There is no End state, fix, commit, or throughput checkpoint in this skill. A request for a fix goes to the hand-back in step 7.

## 1. Choose the branch and evidence directory

If the user supplies a captured artifact, take the artifact branch. Treat it as a fixed dataset. Do not rerun its workload. If the request describes a running symptom, take the live branch.

Resolve the absolute vstack root and mode through the Private-mode rule. Resolve the project Scratch dir once through skill://vstack-tmp, with its path script run without a kind argument. Keep this run's captures, sqlite database, queries, logs, and notes under `<Scratch dir>/verify/<app>-<run-id>/`. Use `forensics` for `<app>` when no app name is known. Put disposable app data in that entry's `data/` directory. Preserve supplied artifacts and write derived files only in Scratch.

Record the artifact path, format, capture time, app revision when known, and the workload that triggered the symptom. Record unknown fields as unknown. This step ends with the branch and absolute evidence directory named.

Follow `skill://flow-page`'s "Stage entry/exit line". The read-only checkout rule permits Flow publication in Scratch, not tracked edits.

## 2. Capture the live signal

In the artifact branch, mark this step `skip: capture supplied` and continue to step 3.

List the project's Verify skills named `verify-*`. In Private mode, also list `<vstack root>/skills/verify-*/`. Deduplicate the links and their targets in the combined list. In Private mode, if a link is missing, create `.omp/skills/verify-<app>` as an absolute symlink to `<vstack root>/skills/verify-<app>`. The link carries into the worker's clone (ADR 0009). Never replace a tracked path. Add `.omp/skills/verify-*` to the git common dir's `info/exclude` when missing. Never change a tracked ignore file. Read the skill by absolute path for this session.

Use the only Verify skill, or the one whose description names the symptom's app feature. If several match without a clear choice, use `ask` under `skill://flow-page`'s "Every ask in a Flow" contract when enrolled, or plain `ask` outside a Flow. If none exists, record that live proof lacks a Verify skill. The worker then captures with the app's profiler, debugger, or CDP (Chrome DevTools Protocol). Recommend a Matt run through `/skill:grill-with-docs` to set up a Verify skill in the reply.

Live-run brief: work only in your clone and in this run's Scratch entry. Never commit. Read the Verify skill at its path in your clone. Resolve its helpers relative to that directory. Run its Doctor, Launch, and Drive steps to reach the symptom. Without a Verify skill, use the app's own commands to launch and drive it. Read launch and helper commands before running them. Start the app as a named bash service, which is the bash tool called with `name` and, when the app signals readiness, `ready`. A process started with `cmd &` in a plain bash call is gone by your next round, but a named service keeps running. Attach the matching profiler or debugger. Capture a CPU profile for a spinning process, a heap snapshot for a leak, or a CDP trace for a glitch. Route capture output and app data to this run's Scratch entry. Drift is a failure in the Verify skill's instructions while Doctor passes, such as a missing command, route, selector, or fixture. Wrong app behavior is a finding, never Drift. On Drift, record the failed step and its evidence. Then capture through the app's profiler, debugger, or CDP instead. Never edit the Verify skill. Keep the app service running, because later rounds arrive as messages on the same app instance. A paired capture compares captures from one app instance. If the app is gone at a later round, or a source-edit probe needs a relaunch, record the break in continuity. Then capture a new baseline on the relaunched app before that round's probe workload. The pair for that round uses the new baseline, not the step 2 capture. Return the capture paths, the workload, your clone's source revision, and any Drift or capture blocker.

Spawn one `vstack-worker` via eval `agent(<prompt>, agent="vstack-worker", isolated=True, apply=False, merge=False)`: the live-run brief above with the selected Verify skill's path relative to the checkout root, the symptom's workload, and this run's evidence directory, the vstack root, the Scratch dir. Wait for its result. If it cannot be spawned, stop: report the live branch as not captured, and point at `/skill:setup-vstack` when `task.isolation.enabled` is off.

Keep the worker's handle for steps 4 and 6. Follow skill://vstack-fan-out/WORKER-LIFECYCLE.md and record retention for live probe and closing rounds, including its named service. On reported Drift, recommend a Matt run through `/skill:grill-with-docs` to repair the cited Drift in the reply.

This step ends with the worker's real capture, or a cited capture blocker. Without a capture, report the blocker without claiming a diagnosis.

On every early exit after starting the live worker, including a capture blocker or unavailable parser, run step 6's closing round before deciding its lifecycle. If it is running or still needed for instrumentation or service cleanup, retain it with that reason. Preserve useful failed-run work and evidence outside its clone before release.

## 3. Identify, shape, and reduce the artifact

Identify the format before selecting a parser. Use the matching DevTools or trace parser for cpuprofile and compressed `.json.gz`, heap tooling for heapsnapshot, or text parsing for spindump. Keep the tooling generic.

Transform the artifact into sqlite before reading its raw contents in context. Keep one row per sample, frame, or node, with the identifiers and relations needed to query it. Preserve sample durations and units, frame parents, heap edges and roots, or thread stacks and wait reasons as the format permits. Save the parser command, schema, row counts, and SQL queries with the database. Name fields the artifact does not provide.

For large artifacts that would crowd the main context, use one parser for the capture set. This is a single subagent, not Fan-out. Read skill://principle-guard-the-context-window at this step. Keep only its reduced finding in the main thread.

Parser brief: identify the formats and parse the supplied captures into this run's sqlite database. Query the cause and return the reduced finding, counts or timings with units, evidence queries, source mapping, and absolute artifact paths. Follow skill://principle-guard-the-context-window. Preserve inputs. Never edit tracked files or rerun the captured workload. Write only under the named Scratch entry. Return open questions to the parent.

Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): the parser brief above with the absolute capture paths and this run's evidence directory, the vstack root, the Scratch dir. Wait for its result. If it cannot be spawned, stop: report the artifact as not parsed, with the capture paths and the evidence directory.

For a small artifact, do the same parsing and queries yourself. Query frames that hold the most time and walk the call tree to the hot path. For a leak, follow the retainer chain from the leaked object to a GC root. For a spindump, identify the thread stuck on-CPU or blocked and its wait reason. For a glitch, narrow the trace to the visible event and the scheduling work around it. Distinguish observed signal from inferred cause.

This step ends with a reduced finding supported by saved queries and measurements, or a specific parsing or evidence gap.

## 4. Prove the live mechanism

In the artifact branch, mark this step `skip: fixed captured dataset` and continue to step 5.

Send the reduced finding to the live-run worker through `write agent://<id>` or the handle's `.send()`. Take the worker's reply from the `wait` tool, which returns this round's new completion. The handle's `.wait()` returns only the step 2 result. Probe-round message: test the reduced finding on the running app. Inject instrumentation through CDP evaluation or the process's debugger. As an alternative to injection, probe through a source edit in your clone. A source-edit probe needs a relaunch of the app service from your clone. Tag every debug log with one unique prefix, such as `[DEBUG-a4f2]`, per skill://diagnosing-bugs. Save the probe, its output, and the condition it tests in this run's Scratch entry. For example, count scheduling calls with no input, or measure allocations and the objects that remain retained. Repeat the same workload. Capture the instrumented signal for comparison in this run's Scratch entry. Save the probe's effect on the symptom. Return the evidence paths, the capture path, your source edits, and any break in continuity with its new baseline path.

Probes never edit tracked files in the main checkout. Pstack's live hotfix step is dropped. Instrumentation alone is not a paired-capture confirmation. This step ends with evidence for or against the mechanism, or the missing live proof.

## 5. Attribute the finding to source

Map the hot frame, allocation, scheduling call, or blocked thread through the artifact's symbols and source maps. Cite `file:symbol:line` and the evidence query or trace event behind it. Read the mapped source to connect the observed signal to its mechanism.

If symbols are missing, try the matching build's symbols without modifying tracked files. If mapping remains unavailable, write `unmapped` and name what is missing. Do not invent a source location from a similar function name. This step ends with a cited location or an explicit mapping gap.

## 6. Compare paired captures and remove instrumentation

In the live branch, send the worker the closing round through `write agent://<id>` or the handle's `.send()`. Take the worker's reply from the `wait` tool, which returns this round's new completion. The handle's `.wait()` returns only the step 2 result. Closing-round message: remove this run's tagged logs, breakpoints, hooks, and injected instrumentation. Stop the app's named bash service through its `proc://<id>/kill` path. Stop only processes this run started. Return the cleanup record.

If a paired capture exists, parse both captures through step 3. Diff them on the same workload and units. If the worker recorded a break in continuity, pair the probe capture with that round's new baseline, not with the step 2 capture. Explain whether the pair supports the proposed mechanism. Account for capture duration and workload differences before comparing counts or time. An inconclusive or unrelated pair does not confirm a cause. Do not change product code to create an after capture.

Use `confirmed` only when a paired capture supports the mechanism. Without that evidence, label the result `strongest hypothesis`, even when live probes support it. State unresolved alternatives and missing evidence.

After the closing round and evidence preservation, release the settled worker through skill://vstack-fan-out/WORKER-LIFECYCLE.md and record the observed outcome. Never apply its patch. Keep captures, queries, probe evidence, and notes in Scratch. Leave pre-existing user changes untouched. This step ends with the evidence label, instrumentation cleanup, and worker lifecycle recorded; unresolved cleanup keeps the worker retained with its reason.

## 7. Hand back the cited diagnosis

Report the following:

- The live signal or supplied artifact and its format.
- The reduced finding, with query results and units.
- How the mechanism was proved, or what proof is missing.
- The source location as `file:symbol:line`, or `unmapped` with its mapping gap.
- Absolute paths to captures, the database, queries, and probe evidence.
- Whether a paired capture confirmed the mechanism, or the result remains the strongest hypothesis.
- Any Drift, capture blocker, skipped step, or remaining alternative, and instrumentation cleanup.

In a Flow, publish this hand-back as a Document Result with citations to the capture and source mapping. Put query measurements in Metrics Results with numeric values, units, capture duration, workload, sample counts, and uncertainty. Use Code Results for the saved SQL and relevant source excerpts, and a Timeline for captures, probes, and cleanup. Record mechanism claims in a ledger. Only paired-capture confirmation earns `confirmed`; otherwise keep `unproven`, the strongest-hypothesis label, alternatives, and missing proof.

In a Flow, capture the redacted artifacts, database, queries, and probe outputs as typed attachments on those Results. Strip secrets from the captured bytes before submission. Preserve the original evidence and derived files at their required Scratch paths. Write no separate report page.

For a defect or slowness, recommend `/skill:diagnosing-bugs` through the Matt flow. Pass the cited diagnosis and evidence paths as Phase 1 input. Stop at the diagnosis. Do not apply a fix or start an End-state chain.

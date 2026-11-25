---
name: diagnosing-bugs
description: Diagnosis loop for hard bugs and performance regressions. Use when the user says "diagnose"/"debug this", or reports something broken/throwing/failing/slow.
---

# Diagnosing Bugs

A discipline for hard bugs. Skip phases only when explicitly justified.

When exploring the codebase, read `GLOSSARY.md` (if it exists) to get a clear mental model of the relevant modules, and check ADRs in the area you're touching.

For CSS diagnosis or changes, read skill://good-css. For a frontend animation that stutters or drops frames, read skill://animation-performance before selecting probes or changing the driver. These conditions apply to main sessions and delegated diagnosis. Keep this skill's diagnosis loop and evidence ownership; unrelated failures do not need frontend guidance.

## Record the investigation

Follow `skill://flow-page`'s "Stage entry/exit line" before the first probe or ask. Use `ask` under its "Every ask in a Flow" contract when enrolled, or plain `ask` outside a Flow, for every question below.

Record the hypotheses that actually ran and their outcomes in execution order, plus each approved hypothesis that never ran alone. Use the Timeline and ledger below in a Flow, or chat outside a Flow. Base the hand-back on this record, not the planned order.

In a Flow, publish the repro command and redacted observed output as Code Results with source paths. Keep the ranked hypotheses and their falsifiable predictions in a Document Result, and the probes and their outcomes in a Timeline. A ledger distinguishes confirmed, cleared, and unproven claims and names missing proof. A hypothesis becomes confirmed only when the executed evidence establishes it. Add Metrics for timing or reproduction rates, with workload, environment, numeric values, units, samples, and uncertainty.

In a Flow, attach redacted repros, captures, raw outputs, and regression evidence before publishing their Results. Redact the files themselves because attachments retain their bytes. Update focused findings or publish a new captured Result revision as evidence changes. At hand-back, publish the cause, red and green evidence, cleanup, and remaining gaps in the Document. The reply summarizes the Results. Keep canonical regression tests and scripts at their required paths, and use the Flow page rather than a separate report page.

## Redact

This skill has you show commands, outputs and captured artifacts. **Redact every secret first**: write `<REDACTED>` in its place. Build loops against env vars, so the credential stays in the environment rather than in what you show. Captured artifacts carry auth headers: quote only the lines that carry the signal.

If redaction leaves too little evidence, look for safe local observations before treating the missing evidence as a blocker. Follow "When you genuinely cannot build a loop" for any needed question. Never share unredacted evidence.

## Phase 1: Build a feedback loop

**This is the skill.** Everything else is mechanical. If you have a **tight** pass/fail signal for the bug (one that goes red on _this_ bug), you will find the cause; bisection, hypothesis-testing, and instrumentation all just consume it. If you don't have one, no amount of staring at code will save you.

Spend disproportionate effort here. **Be aggressive. Be creative. Refuse to give up.**

### Ways to construct one, in roughly this order

1. **Failing test** at whatever seam reaches the bug: unit, integration, e2e.
2. **Curl / HTTP script** against a running dev server.
3. **CLI invocation** with a fixture input, diffing stdout against a known-good snapshot.
4. **Headless browser script** (Playwright / Puppeteer) that drives the UI and asserts on DOM/console/network.
5. **Replay a captured trace.** Save a real network request / payload / event log to disk; replay it through the code path in isolation.
6. **Throwaway harness.** Start a minimal subset of the system (one service, mocked deps) that exercises the bug code path with a single function call.
7. **Property / fuzz loop.** If the bug is "sometimes wrong output", run 1000 random inputs and look for the failure mode.
8. **Bisection harness.** If the bug appeared between two known states (commit, dataset, version), automate "boot at state X, check, repeat" so you can `git bisect run` it.
9. **Differential loop.** Run the same input through old-version vs new-version (or two configs) and diff outputs.
10. **HITL bash script.** Last resort. If a human must click, drive _them_ with `scripts/hitl-loop.template.sh` so the loop is still structured. Captured output feeds back to you.

Build the right feedback loop, and the bug is 90% fixed.

### Tighten the loop

Treat the loop as a product. Once you have _a_ loop, **tighten** it:

- Can I make it faster? (Cache setup, skip unrelated init, narrow the test scope.)
- Can I make the signal sharper? (Assert on the specific symptom, not "didn't crash".)
- Can I make it more deterministic? (Pin time, seed RNG, isolate filesystem, freeze network.)

A 30-second flaky loop is barely better than no loop; a 2-second deterministic one is tight, a debugging superpower.

### Non-deterministic bugs

The goal is not a clean repro but a **higher reproduction rate**. Loop the trigger 100×, parallelise, add stress, narrow timing windows, inject sleeps. A 50%-flake bug is debuggable; 1% is not, so keep raising the rate until it's debuggable.

### When you genuinely cannot build a loop

Stop and list what you tried. Apply the [Settle-or-ask test](../../rules/vstack-settle-or-ask.md). Use `ask` only for the missing access or redacted artifact the user can supply, or for permission to add temporary production instrumentation. If no such question can unblock the investigation, report the limit. A timed-out answer is not the user's. Re-ask once, using `again` in a Flow, and if that times out too, stop and say why. Cancellation or an unavailable picker grants no permission. Do not proceed to hypothesize without a loop.

### Completion criterion: a tight loop that goes red

Phase 1 is done when the loop is **tight** and **red-capable**: you can name **one command** (a script path, a test invocation, a curl) that you have **already run at least once** (show the invocation and its output, redacted), and that is:

- [ ] **Red-capable**: it drives the actual bug code path and asserts the **user's exact symptom**, so it can go red on this bug and green once fixed. Not "runs without erroring"; it must be able to _catch this specific bug_.
- [ ] **Deterministic**: same verdict every run (flaky bugs: a pinned, high reproduction rate, per above).
- [ ] **Fast**: seconds, not minutes.
- [ ] **Agent-runnable**: you can run it unattended; a human in the loop only via `scripts/hitl-loop.template.sh`.

If you catch yourself reading code to build a theory before this command exists, **stop: jumping straight to a hypothesis is the exact failure this skill prevents.** No red-capable command, no Phase 2.

## Phase 2: Reproduce + minimise

Run the loop. Watch it go red as the bug appears.

Confirm:

- [ ] The loop produces the failure mode the **user** described, not a different failure that happens to be nearby. Wrong bug = wrong fix.
- [ ] The failure is reproducible across multiple runs (or, for non-deterministic bugs, reproducible at a high enough rate to debug against).
- [ ] You have captured the exact symptom (error message, wrong output, slow timing) so later phases can verify the fix actually addresses it.

### Minimise

Once it's red, shrink the repro to the **smallest scenario that still goes red**. Cut inputs, callers, config, data, and steps **one at a time**, re-running the loop after each cut, and keep only what's load-bearing for the failure.

Why bother: a minimal repro shrinks the hypothesis space in Phase 3 (fewer moving parts left to suspect) and becomes the clean regression test in Phase 5.

Done when **every remaining element is load-bearing**: removing any one of them makes the loop go green.

Do not proceed until you have reproduced **and** minimised.

## Phase 3: Hypothesise

Generate **3–5 ranked hypotheses** before testing any of them. Single-hypothesis generation anchors on the first plausible idea.

Each hypothesis must be **falsifiable**: state the prediction it makes.

> Format: "If <X> is the cause, then <changing Y> will make the bug disappear / <changing Z> will make it worse."

If you cannot state the prediction, the hypothesis is a vibe: discard or sharpen it.

Run the probes in the order the evidence supports. Apply the [Settle-or-ask test](../../rules/vstack-settle-or-ask.md) before interrupting the investigation. Use `ask` only for a material fact or choice the evidence leaves open and the user can resolve.

## Phase 4: Instrument

Each probe must map to a specific prediction from Phase 3. **Change one variable at a time.**

If a candidate fix has a lasting cost, such as lost cache reuse, money per use, or latency, first run each cost-free hypothesis alone on the same Phase 1 loop. Compare the measured results from that loop against the agreed guarantees and budget. Apply the [Settle-or-ask test](../../rules/vstack-settle-or-ask.md) to the trade-off. For a choice the user still owns, show the compared results and use `ask`. A timed-out, cancelled, empty, or unavailable answer is not a pick. Re-ask once through `ask`, using `again` in a Flow. If no user pick follows, stop without choosing and say why.

Tool preference:

1. **Debugger / REPL inspection** if the env supports it. One breakpoint beats ten logs.
2. **Targeted logs** at the boundaries that distinguish hypotheses.
3. Never "log everything and grep".

**Tag every debug log** with a unique prefix, e.g. `[DEBUG-a4f2]`. Cleanup at the end becomes a single grep. Untagged logs survive; tagged logs die.

**Perf branch.** For performance regressions, logs are usually wrong. Instead: establish a baseline measurement (timing harness, `performance.now()`, profiler, query plan), then bisect. Measure first, fix second.

## Phase 5: Fix + regression test

Write the regression test **before the fix**, but only if there is a **correct seam** for it.

A correct seam is one where the test exercises the **real bug pattern** as it occurs at the call site. If the only available seam is too shallow (single-caller test when the bug needs multiple callers, unit test that can't replicate the chain that triggered the bug), a regression test there gives false confidence.

**If no correct seam exists, that itself is the finding.** Note it. The codebase architecture is preventing the bug from being locked down. Flag this for the next phase.

If a correct seam exists:

1. Turn the minimised repro into a failing test at that seam.
2. Watch it fail. If you forced the red by mutating code or a fixture, diff against a pristine copy to prove the mutation landed before trusting it.
3. Apply the fix.
4. Watch it pass.
5. Re-run the Phase 1 feedback loop against the original (un-minimised) scenario.
   If the fix removes or disables the channel watched by the assertion, a green run passes by construction and proves nothing.
   Re-point the assertion at the user's symptom. Show it go red on unfixed code, then green on fixed code before accepting the loop as proof.
   At hand-back, name the assertion and show both runs.

For a race or ordering bug, add regression coverage of the counterpart ordering that the guard must preserve, and pass both orderings before publication.

## Phase 6: Cleanup

Required before declaring done:

- [ ] Original repro no longer reproduces, with the matching assertion and run evidence required by Phase 5
- [ ] Regression test passes (or absence of seam is documented)
- [ ] All `[DEBUG-...]` instrumentation removed (`grep` the prefix)
- [ ] Throwaway prototypes deleted (or moved to a clearly-marked debug location)
- [ ] The hypothesis that turned out correct is stated in the commit / PR message, so the next debugger learns

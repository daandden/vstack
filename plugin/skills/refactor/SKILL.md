---
name: refactor
description: 'Make a behavior-preserving structural change: rename, extract, inline, dedupe, or move. Execute improve-codebase-architecture or code-review findings, or a direct refactoring request. Never add or correct behavior.'
---

# Refactor

Own the contract. Change structure, never behavior.

For large or cross-cutting work, stop and recommend /skill:wayfinder or /skill:to-spec then /skill:to-tickets. Run refactor per resulting ticket. Split a behavior change out and recommend /skill:to-spec. Split a found bug out, finish the structural commit against current behavior, then run skill://diagnosing-bugs separately.

Read skill://implement/END-STATE.md before work. It owns shared steps 0a–0c, 3b, and 4–7. Reuse that block by reference, never maintain a copy here. Before task-specific items, copy its steps and steps 1–8 below verbatim, including their paragraphs, into the todo list in execution order. Keep unfinished steps as `skip: <reason>`.

Run shared steps 0a–0c once. Reuse the caller's End state and run record. Refactor's numbered work steps below are distinct from the numbered shared steps.

## 1. Pin behavior

Run skill://how over the affected subsystem. Name the existing behavior contract and its callers. Before moving structure, write and run a characterization test, snapshot, or equivalence harness that captures current behavior. If coverage is absent, write the pin first. Typechecking and linting are not a pin. Save baseline outputs for later comparison. Do not begin structural edits until the pin passes against the unchanged code.

## 2. Name the missing structure

Apply skill://principle-encode-the-domain. Keep boring code when its shape is clear and local. Name the branches or invalid states the reshape removes. Do not add indirection without a demonstrated reduction in reader load.

## 3. Name the target shape

State the intended module layout, types, and call graph. Apply skill://principle-foundational-thinking and skill://principle-redesign-from-first-principles. If the target crosses a function boundary, run skill://architect at its `sketch` stop only. Retain its design package and rationale, then implement against the sketch yourself. Finish or remove every sketch body before hand-back.

## 4. Subtract first

Apply skill://principle-subtract-before-you-add. Delete dead code, collapse one-caller wrappers, drop redundant validators, and remove orphan references before introducing the new shape. Keep the behavior pin green. Apply skill://principle-laziness-protocol and ship the smallest change that reaches the target. Revert speculative cleanup that does not serve it.

## 5. Reshape in small steps

Make the edits yourself. Apply skill://principle-migrate-callers-then-delete-legacy-apis. Migrate every caller and delete the old API in one wave. Leave no compatibility shim, obsolete alias, or parallel old-and-new path. Spot-check every rename in actual files, including strings, prose, and back-references. Run the pin after each small change. A failed pin stops the reshape until behavior is restored.

## 6. Prove equivalence

Apply skill://principle-prove-it-works. Prove unchanged behavior on the real artifact, not just a successful compile. Diff old and new outputs, replay the recorded baseline, or drive the matching app through its Verify skill. For larger reshapes, run an explicit old-versus-new equivalence comparison. Record the command, inputs, outputs, and evidence paths. After all structural work, run shared step 3b and shared step 4. Live proof covers accepted comment cleanup too. Wrong behavior is a finding, never Verify Drift.

## 7. Measure reader load

Apply skill://principle-minimize-reader-load. Compare the old and new reading path. Name the branches, invalid states, wrappers, concepts, or files a reader no longer needs to follow. If reader load does not decrease somewhere, revert that change and repeat affected equivalence proof. Do not trade unchanged behavior for a cleaner-looking diff.

## 8. Commit the proven changes in order

Apply skill://principle-sequence-verifiable-units. Use shared step 6 to make small ordered work commits: subtraction, then reshape, then follow-on cleanup. Each behavior-preserving unit keeps the pin green before the next. Omit an empty commit and record why that category had no changes. Order only this run's unpushed commits. Never rewrite commits already pushed to a branch this run did not create. Keep Standard-mode Verify maintenance as its own commit and Private maintenance out of git.

Run shared step 5 once after the last work commit. Fix accepted findings in new commits and repeat affected equivalence and live proof. Run shared step 7 once after all tickets, with one PR by default. Do not run a chain per structural slice.

## Reply

Report the structure that changed, the behavior pin, equivalence proof and paths, reader-load delta, and what shipped or was reverted. State that no new behavior shipped only when the proof supports it. Include the requested and reached End state, commits, PR URL and observed status, live proof, Safety findings, skipped steps, open cleanup work, and blockers. Include the decision-trail log and Attention result when open.

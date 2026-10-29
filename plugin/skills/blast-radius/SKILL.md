---
name: blast-radius
description: "Blast radius knowledge for code-review: find breakage outside the diff and prove the facts that make a change safe."
disable-model-invocation: true
---

# Blast radius

Find what a change breaks outside the diff before it ships. `skill://how` explains what code does. `skill://why` explains why it has that shape. Blast radius checks breakage elsewhere.

Listing callers is not the job. Follow dependencies that a symbol search does not reveal and prove the facts that make the change safe.

Follow `skill://flow-page`'s "Stage entry/exit line" for a safety-review run. The coordinator publishes reviewer evidence.

## Do not trust your own writeup

A convincing writeup is not evidence. Find the one or two facts that safety depends on and prove them with real code.

For each fact, get as far down this proof ladder as is cheap. State where you stopped:

1. Assertion alone. This proves nothing.
2. Source citation. Point at a real `file:line` or the library's source.
3. Failure walkthrough. Show why the bad case cannot happen, step by step.
4. Executed proof. Run a script or test that calls the real code and fails if the fact is false.
5. Running app. Reproduce the case in the app.

Step 4 is usually a small script that imports the same library version that the app ships and calls the exact function at risk.

## Scratch

Read `skill://vstack-tmp`. The top-level agent runs its path script with no argument once, from the repo under review:

```sh
bun "$(realpath skill://vstack-tmp/scripts/path.ts)"
```

Use a distinct `<Scratch dir>/blast-radius/<run-id>/` entry for the proof scripts, outputs, and disposable data. Write these only in Scratch, not the product tree or a PR worktree. A child uses the absolute project Scratch dir from its prompt, appends `blast-radius/`, and never runs the path script. Nested runners each get a disjoint entry. The vstack root is separate from Scratch and is passed unchanged to nested writers.

## Steps

1. Read the change, its added, changed, and deleted symbols, and the behavior that the diff does not spell out. Pin the change once:
   - When the caller passes a pinned diff command and commit list, reuse them. Also reuse the caller's PR worktree path when it passes one, and create no second worktree.
   - Otherwise, when the user supplies a PR as a number or URL, resolve the vstack root once through the Private-mode rule, or use a supplied one. Then follow the PR case in step 1 of `skill://code-review`, with the purpose `blast-radius-<first 12 characters of the head SHA>`. On a plain checkout, install deps first when the proof needs them.
   - Otherwise resolve the ref, and pin `git diff <fixed-point>...HEAD` and `git log <fixed-point>..HEAD --oneline`. If the fixed point is unknown, use `ask`.

   Use step 2 of `skill://why` to trace PRs and commits.
2. Find the one fact that makes the change safe. For example, a cache operation only removes dead entries and has no other effect. Concentrate on proving that fact instead of listing hypothetical risks.
3. Look where a symbol search stops. Read the library source at its pinned version and any local patch. Trace microtasks, unmount and teardown, framework semantics, API JSON, database columns, wire formats, other languages reading the bytes, feature flags, and downstream consumers.
4. Assess each risk honestly. Name its likelihood and cost. Keep confirmed risks and list checked, cleared risks separately. Follow the evidence rules in `skill://why`. Cite a real `file:line`. Report a search with no results as such. Never invent callers or APIs.
5. Prove the safety fact. Write a script or test in this run's Scratch entry that executes the real code, run it, and paste the observed output. For a PR, run it from the PR worktree so that it executes the head SHA's code. Preserve its command and script path. If you cannot run a proof, state the missing prerequisite and mark the fact unproven. A source citation alone is not executed proof.
6. Run `skill://compare-attempts` only when the user explicitly asks for compare-attempts or several attempts. A big or wide diff alone never starts it. If the caller says "skip step 6", skip it even when the request mentions several attempts. Without an explicit ask, a big or wide diff gets one optional `ask` offering the pass, not an automatic run.

For step 6, declare kind `reply`. Give each runner the pinned diff command, commit list, any PR worktree path, this skill's steps 1–5, and "skip step 6" to prevent recursion. Require the full hand-back, proof script, command, and observed output. Pass the absolute Scratch dir and a distinct run entry for each runner.

Keep the rubric with the parent. It covers the safety fact, depth on the proof ladder, risks with real `file:line` citations, and cleared items. Pick the strongest hand-back as the draft. Graft confirmed risks from the others and drop unproven duplicates. Re-run every retained proof script in `<Scratch dir>/blast-radius/<run-id>/` and record its output. Apply no patch for kind `reply`. Retain the compare-attempts synthesis note and evidence paths.

The Blast radius reviewer in `skill://code-review` always skips step 6. That skill owns the Blast radius trigger list. Do not add a second trigger list here.

## What to hand back

- What it does. State the change, including behavior that is not obvious from the diff.
- The one fact that makes it safe. State the fact, its proof-ladder level, and the evidence. Mark it unproven if no executed proof established it.
- Risks. For each, name the failure, real `file:line`, likelihood, cost, and a way to check it. Paste the proof for material risks.
- Cleared. State what you checked and why it is safe.
- Before you merge. Name the cheapest test or repro that catches the real bug. Include the proof script, command, and observed output.

Cite real code, and strip private information before publishing. The reply must state whether the safety fact is proven or unproven.

Publish the hand-back as a Document Result and the safety facts as a ledger. Use `confirmed` only for executed proof that establishes the claim, `cleared` for checked risks, and `unproven` with missing proof for source-only or unavailable checks. Keep proof-ladder level, likelihood, cost, alternatives, and exact observed output. Use Code Results for the proof script or relevant diff and Timeline for executed, blocked, or skipped probes. Attach redacted proof scripts and outputs while preserving their Scratch paths. The reply summarizes Results on the Flow page, not a separate report page.

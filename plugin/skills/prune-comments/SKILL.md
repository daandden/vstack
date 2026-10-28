---
name: prune-comments
description: "Comment critique and direct fixes for implement's END-STATE step 3b."
disable-model-invocation: true
---

# Prune comments

Use the critic's fresh perspective. The critic edits comments. The caller of this skill fixes accepted code findings.

## Scope

Use the caller's files or diff. Otherwise use the current diff against the default branch, including the working tree.

For a critique run, read `skill://flow-page` and discover the session and agent's `bound` Flow. Open a `prune-comments` Stage there with the caller's Stage as `--parent`, or start a Flow if unbound. A reference read creates no Stage. The parent publishes the critic's returned evidence and owns the binding. Route any asks through this Stage.

## Steps

### 1. Get the critique

Spawn one `vstack-comment-critic` via `task` (`agent: "vstack-comment-critic"`): critique the scoped files or diff in the named tree and return its report, the vstack root, the Scratch dir. Wait for its result. If it cannot be spawned, stop: the critique needs a fresh context. Report prune-comments as not run.

Pass the scope without restating the critic's rules.

### 2. Accept or reject findings

Inspect the report and diff. Reject application-code edits, scope escapes, exception-protected deletions, and misstated `MUST KILL` reasons. Reject flags that treat kept intentional code as guilty. Reshape flags on our-code surprises stay actionable. Do not restore those comments. A keep survives only with proof about something we cannot change.

Audit missed scoped lint and TypeScript suppressions. Correctness or safety suppressions stay actionable `MUST KILL`s. Restore deletions only with exact exceptions and scoped proof. Before accepting thin `IMPORTANT` or `do not remove` kills or keeps, run `skill://how` or `skill://why` on their symbol. If a kill is ambiguous, do not restore it. If a keep is refuted or still ambiguous, delete it.

Revert a rejected report's edits and request one corrected run from the same critic with the failure named. Use its existing context, not a second critic. If the second report is rejected, report it open and fail prune-comments.

### 3. Fix the cause directly

If a fix needs a new shape, report it open. Make direct fixes only, such as deleting a dead path, dropping a parameter, or using the real API. Implement the smallest root-cause fix in scope. Remove every named workaround that a direct fix resolves. If the root cause is out of scope, make the smallest direct in-scope fix and report the rest open. Read `skill://principle-redesign-from-first-principles` for intent only. It does not authorize a new shape, wider scope, or fixes outside the scope. Never add symptom guards.

### 4. Delete constraint comments

Constraint comments say `do not remove`, `do not change wording`, or `talk to X before changing`. Leave keeps about things we cannot change. Delete each other constraint comment, with no encoding, no question, and no report.

### 5. Report

Report the deletion count, restored comments, reruns, direct fixes, fixes that need a new shape and remain open, and other open work.

Publish a Document Result with these counts and dispositions, and a Code/diff Result for reportable accepted changes with their real paths. Use a Timeline for reruns and their actual outcomes, and a ledger for claims that remain unproven or need a new shape. Capture redacted critic evidence and verification outputs as attachments. Keep step 4's intentionally unreported constraint deletions out of individual findings. A missing critic remains not run, not a clean pass. Finish the Stage and restore the caller's binding when nested. The reply summarizes the Flow Results, with no separate report page.

Never commit in this skill. The caller commits. On stop or failure, the caller keeps and commits accepted fixes, continues, and lists prune-comments as open.

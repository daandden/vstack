---
name: prune-comments
description: "Comment critique and direct fixes for implement's END-STATE step 3b, with encoding offers for claimed constraints."
disable-model-invocation: true
---

# Prune comments

Use the critic's fresh perspective. The critic edits comments. The caller of this skill fixes accepted code findings.

## Scope

Use the caller's files or diff. Otherwise use the current diff against the default branch, including the working tree.

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

### 4. Offer constraint encodings

Constraint comments say `do not remove`, `do not change wording`, or `talk to X before changing`. Leave keeps about things we cannot change. Offer the cheapest in-scope type, runtime, test, or CI lint that needs no new shape. Batch every offer into one question through `ask` and wait for approval. Add each approved encoding before deleting its comment. Otherwise delete the comment and report the constraint and any out-of-scope work open.

When decision-trail is running, the run is unattended. Delete the comment, report the constraint open, and append a row to the named trail log through `skill://decision-trail`. No End state pre-approves an encoding.

### 5. Report

Report the deletion count, restored comments, reruns, direct fixes, fixes that need a new shape and remain open, encoding offers, encodings, unenforced constraints, and other open work.

Never commit in this skill. The caller commits. On stop or failure, the caller keeps and commits accepted fixes, continues, and lists prune-comments as open.

---
name: babysit
description: PR merge-readiness, review threads, and CI.
disable-model-invocation: true
---

# Babysit

Never merge, enable auto-merge, enqueue a merge, retarget a base, or change stack topology. Do not call ship or the next skill in a chain. A request to ship belongs to the caller, not this loop.

Follow these rules in skill://implement/END-STATE.md:

- Step 0a: the chain facts, Code host routing, and the reuse of the vstack root and Scratch dir.
- Step 0b: the push to the remote branch, and the last SHA this run pushed. Fix waves are fast-forward pushes.
- Step 0c: logging to the decision-trail log.

## Establish the frontier

Accept the caller's chain facts. Use `drive` mode: repeat the loop until merge-ready or a human-owned blocker.

Resolve repository, PR number, head branch, base branch, and the bottom-to-top stack through `read-pr` and `list-prs`. The frontier is the lowest unmerged PR. Work only there. Read and batch upstack findings, but do not fix them while the frontier is blocked. If another actor merges it, refresh the stack and continue at the new frontier. If every PR is already merged, report that and stop without merging anything.

Before starting, check the session's active workers and ownership records for this stack. Reuse an existing babysitter or report its ownership; never start a second one. If stack order or ownership cannot be established, return the missing fact rather than guessing.

## Read the state

Use `read-pr` and `required-checks`. In drive mode, use `watch-checks` only after the fixes below. A watch returning is not proof of readiness: re-read the PR and threads. If `watch-checks` is unsupported, poll `required-checks` instead.

Read every page of `review-threads`, including thread IDs, resolved state, and comments with IDs, paths, bodies, authors, and commit references. A truncated first page cannot establish that all threads are resolved. Read requested changes even when there is no unresolved inline thread.

Merge-ready requires all four facts on the current head SHA:

- `read-pr` says that the PR can merge.
- Required checks are green, or the required-check query establishes there are none.
- No unresolved review threads remain.
- No review requests changes, as `read-pr` reports it.

Unknown mergeability, pending checks, missing permissions, or incomplete thread data are not green. No merge-queue handling is part of this skill.

## Drive loop

Work in this order: conflicts, review threads, then CI. Batch all known fixes into one push wave. Re-read after every wave or completed check watch. Answer a user question mid-loop and continue unless the user explicitly stops the run.

### Conflicts belong to the caller

On a conflict, stop before threads or CI. Report the branch that needs an update and the drift sweep: reconcile callers added on the base for code this stack deletes or moves. Babysit itself never merges a base into a branch, rebases, or force-pushes. The caller owns the conflict through the Conflict owner in END-STATE step 7.

### Review threads

Verify each claim against current code. Classify it as fix, dismiss with a reason, or ask through the `ask` tool. In a worker, return the question to the parent instead. Do not adopt a bot's claim without proof.

Fix real findings red-first with skill://tdd in the lowest PR that owns the code. Do not put an upstack fix in the frontier just to avoid its owning PR. If that owner already merged, make a new follow-up PR above the remaining stack through skill://open-pr; never rewrite merged history. This is the only sanctioned stack-list addition. If open-pr is unavailable, report the needed follow-up instead of fabricating it.

Push the batched wave before replying so replies cite the fix commit and proof. Write each reply as JSON data to a payload file under the run's Scratch entry, then send it through `reply-thread`. Never interpolate comment text or replies into shell commands. Resolve an addressed thread through `resolve-thread` only after the fix or reasoned dismissal is posted. If `resolve-thread` is unsupported, leave the thread for its reviewer and report it. A disputed request for changes needs its reviewer's action; do not pretend that resolving a thread removes it.

### CI

Read failing run and job logs through `ci-logs`. Classify the failure before retriggering:

- Diff-owned failure: fix with a red-first proof and include it in the push wave.
- Stale base: fetch the current base and check `git merge-base --is-ancestor <base-tip> <head>`. For failures outside the diff, inspect whether missing base changes explain them. Report the needed update to the caller's Conflict owner; do not spend a retry on it.
- Proven flake or infrastructure failure: one fresh full rerun through `rerun-ci` for that failure, not a failed-job-only retry. Record the retry so a new poll or worker does not reset the allowance. An identical second failure must be reclassified from child logs; never retry blindly. If `rerun-ci` is unsupported, report the flake for the human.

After publishing fixes, watch required checks, then read merge state, review decision, and all threads again. Stop at merge-ready. Owner approval, permissions, a conflict, or a policy decision is the human's line: report it, finish independent actionable items where safe, then return. Never merge to make a blocked state disappear.

## Hand-back

Return mode, frontier URL and branch, head SHA, the last SHA this run pushed, merge state, required checks, unresolved threads, review decision, fixed versus dismissed findings with reasons and proof, retries used, pending upstack work, and what needs the human.

Do not create a bot rubric or a dismissal-pattern PR.

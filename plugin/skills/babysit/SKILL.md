---
name: babysit
description: PR merge-readiness, review threads, and CI.
disable-model-invocation: true
---

# Babysit

Use `gh` for all GitHub reads and writes. Never merge, enable auto-merge, enqueue a merge, retarget a base, or change stack topology. Do not call ship or the next skill in a chain. A request to ship belongs to the caller, not this loop.

## Establish the frontier

Accept the caller's settled End state, branch ownership, last pushed SHAs, and any open decision-trail log path. Use `drive` mode: repeat the loop until merge-ready or a human-owned blocker.

Resolve repository, PR number, head branch, base branch, and the bottom-to-top stack through `gh pr view` and `gh pr list`. The frontier is the lowest unmerged PR. Work only there. Read and batch upstack findings, but do not fix them while the frontier is blocked. If another actor merges it, refresh the stack and continue at the new frontier. If every PR is already merged, report that and stop without merging anything.

Before starting, check the session's active workers and ownership records for this stack. Reuse an existing babysitter or report its ownership; never start a second one. If stack order or ownership cannot be established, return the missing fact rather than guessing.

Resolve the absolute project Scratch dir once through skill://vstack-tmp, with its path script and no kind argument. Reuse the caller's supplied Scratch dir.

## Read the state

Use `gh pr view <pr> --repo <owner/repo> --json number,url,state,headRefName,headRefOid,baseRefName,mergeStateStatus,reviewDecision,statusCheckRollup` and `gh pr checks <pr> --repo <owner/repo> --required`. In drive mode, use `gh pr checks <pr> --repo <owner/repo> --required --watch` only after the fixes below. A watch returning is not proof of readiness: re-read the PR and threads.

Read every page of GraphQL `reviewThreads`, including `id`, `isResolved`, and paginated comments with IDs, paths, bodies, authors, and commit references. Use `gh api graphql` with repository owner/name and PR number as variables; follow both thread and comment cursors. A truncated first page cannot establish that all threads are resolved. Read requested changes even when there is no unresolved inline thread.

Merge-ready requires all four facts on the current head SHA:

- `mergeStateStatus` is `CLEAN`.
- Required checks are green, or the required-check query establishes there are none.
- No unresolved review threads remain.
- No review requests changes (`reviewDecision` is not `CHANGES_REQUESTED`).

Unknown mergeability, pending checks, missing permissions, or incomplete thread data are not green. No merge-queue handling is part of this skill.

## Drive loop

Work in this order: conflicts, review threads, then CI. Batch all known fixes into one push wave. Re-read after every wave or completed check watch. Answer a user question mid-loop and continue unless the user explicitly stops the run.

### Conflicts belong to the caller

On a conflict, stop before threads or CI. Report the branch needing rebase and the drift sweep: reconcile callers added on the base for code this stack deletes or moves. Babysit itself never rebases or force-pushes.

The caller may rebase onto the default branch only if this run created the branch and the remote tip still equals the last SHA this run pushed. The caller checks both facts, rebases, pushes with `--force-with-lease`, then runs babysit again. Otherwise stop and report which branch needs the rebase.

### Review threads

Verify each claim against current code. Classify it as fix, dismiss with a reason, or ask through the `ask` tool. In a worker, return the question to the parent instead. Do not adopt a bot's claim without proof.

Fix real findings red-first with skill://tdd in the lowest PR that owns the code. Do not put an upstack fix in the frontier just to avoid its owning PR. If that owner already merged, make a new follow-up PR above the remaining stack through skill://open-pr; never rewrite merged history. This is the only sanctioned stack-list addition. If open-pr is unavailable, report the needed follow-up instead of fabricating it.

Push the batched wave before replying so replies cite the fix commit and proof. Write each reply as JSON data to a payload file under the run's Scratch entry, then send it with `gh api --method POST "repos/<owner>/<repo>/pulls/<pr>/comments/<comment-id>/replies" --input <payload.json>`. Never interpolate comment text or replies into shell commands. Resolve an addressed thread through `gh api graphql` only after the fix or reasoned dismissal is posted. A disputed request for changes needs its reviewer's action; do not pretend that resolving a thread removes it.

### CI

Read failing run and job logs with `gh run view <run-id> --log-failed`. Classify the failure before retriggering:

- Diff-owned failure: fix with a red-first proof and include it in the push wave.
- Stale base: fetch the current base and check `git merge-base --is-ancestor <base-tip> <head>`. For failures outside the diff, inspect whether missing base changes explain them. Report a needed rebase under the conflict-owner rule; do not spend a retry on it.
- Proven flake or infrastructure failure: one fresh `gh run rerun <run-id>` for that failure, not a failed-job-only retry. Record the retry so a new poll or worker does not reset the allowance. An identical second failure must be reclassified from child logs; never retry blindly.

After publishing fixes, watch required checks, then read merge state, review decision, and all threads again. Stop at merge-ready. Owner approval, permissions, a conflict, or a policy decision is the human's line: report it, finish independent actionable items where safe, then return. Never merge to make a blocked state disappear.

## Hand-back

Return mode, frontier URL and branch, head SHA, merge state, required checks, unresolved threads, review decision, fixed versus dismissed findings with reasons and proof, retries used, pending upstack work, and what needs the human.

When called in a chain, read skill://decision-trail and append meaningful decisions to the already-open log with its `scripts/log.sh` helper and the absolute path passed by the caller. This grants no writes to adjacent files. Never start a log here. Do not create a bot rubric or a dismissal-pattern PR.

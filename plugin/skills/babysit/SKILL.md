---
name: babysit
description: Drive a PR or stack to merge-ready by addressing conflicts, review threads, and CI. Use for "babysit this", "get it green", "check on PR X", "anything outstanding on X", or "address the review comments". Never merges.
---

# Babysit

Use `gh` for all GitHub reads and writes. Never merge, enable auto-merge, enqueue a merge, retarget a base, or change stack topology. Do not call ship or the next skill in a chain. A request to ship belongs to the caller, not this loop.

## Choose the mode and frontier

Declare the mode before polling:

- `drive`: default; always use it when called in the End-state chain. Repeat the loop until merge-ready or a human-owned blocker.
- `background`: one isolated worker runs drive while the parent continues other work.
- `threads-only`: read and address review threads; do not repair conflicts or CI, rerun checks, or wait for merge-ready.
- `check`: one read-only status pass. Default for small or docs-only PRs outside the chain and for status questions. Do not watch, edit, reply, resolve threads, or rerun checks.

An explicit mode overrides the outside-chain defaults. Resolve repository, PR number, head branch, base branch, and the bottom-to-top stack through `gh pr view` and `gh pr list`. The frontier is the lowest unmerged PR. Work only there. Read and batch upstack findings, but do not fix them while the frontier is blocked. If another actor merges it, refresh the stack and continue at the new frontier. If every PR is already merged, report that and stop without merging anything.

Before starting, check the session's active workers and ownership records for this stack. Reuse an existing babysitter or report its ownership; never start a second one. If stack order or ownership cannot be established, return the missing fact rather than guessing.

## Background mode

Read skill://vstack-tmp. Resolve the absolute project Scratch dir once, with its path script and no kind argument. Resolve the vstack root in the parent: the main checkout in Standard mode, or `$(git rev-parse --path-format=absolute --git-common-dir)/vstack` in Private mode. Pass both absolute paths to the worker. If `task.isolation.enabled` is off, stop and point at `/skill:setup-vstack`; never use a shared-checkout fallback.

Spawn one `vstack-worker` via eval `agent(<prompt>, agent="vstack-worker", isolated=True, apply=False, merge=False)`: run this skill in drive mode on the named repository and frontier; include stack order, branch ownership and last pushed SHAs, branches the parent is still editing, allowed checks, the user’s override words, the vstack root, the absolute project Scratch dir, and any open decision-trail log path. Do not wait; keep working. If it cannot be spawned, stop: isolated babysitting is required; use `/skill:setup-vstack` to enable task isolation.

The worker uses the supplied vstack root and never recomputes `--git-common-dir`. Scratch writes go only under the supplied project Scratch dir with a child-specific entry. It never asks the user: return open questions to the parent. It never changes, checks out, or publishes fixes on branches the parent is still editing; report those fixes instead. For other branches, follow the drive loop in its clone. Return changed files, tests and results, commit/push SHAs, remote effects, unresolved blockers, and proposed fixes not made. Do not apply or merge the worker's checkout automatically.

On completion, the parent reads the completion notice for the worker's `patchPath`; `wait()` can omit that field. Do not invent a path or use a branch result. Review the returned patch against current parent edits, apply the accepted patch explicitly, and reconcile it with any commits the worker already pushed. Never push those changes twice. If there is no patch path, retain the report and state that no patch was applied. The parent owns applying the patch and any conflict with its ongoing work.

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

The caller may rebase onto the default branch only if this run created the branch and the remote tip still equals the last SHA this run pushed. The caller checks both facts, rebases, pushes with `--force-with-lease`, then runs babysit again. Otherwise stop and report which branch needs the rebase. A background worker cannot claim ownership of a parent's branch merely because its prompt names it.

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

Return mode, frontier URL and branch, head SHA, merge state, required checks, unresolved threads, review decision, fixed versus dismissed findings with reasons and proof, retries used, pending upstack work, and what needs the human. In check mode, this is the single status snapshot; in threads-only, report thread outcomes without claiming the PR is merge-ready unless all four facts were read.

When called in a chain, append meaningful decisions to the already-open decision-trail log through the path passed by the caller. Never start a log here. Do not create a bot rubric or a dismissal-pattern PR.

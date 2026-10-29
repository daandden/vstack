---
name: babysit
description: PR merge-readiness, review threads, and CI.
disable-model-invocation: true
---

# Babysit

Never merge, enable auto-merge, enqueue a merge, retarget a base, or change stack topology. Do not call ship or the next skill in a chain. A request to ship belongs to the caller, not this loop.

Follow these rules in skill://implement/END-STATE.md:

- Step 0a: the chain facts, Code host and CI service routing, and the reuse of the vstack root and Scratch dir.
- Step 0b: the push to the remote branch, and the last SHA this run pushed. Fix waves are fast-forward pushes.

Follow `skill://flow-page`'s "Stage entry/exit line". Follow END-STATE.md's "Publish delivery progress" and keep frontier tasks and blockers current.

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

Read required checks and their status from `code-host.md` through `required-checks` and `watch-checks`. For each failed check, take the exact job and build or run only from that check's link. This rule applies to every CI service, including GitHub Actions.

If the failed check has no link, report the missing link and read no log and start no rerun for that check. Never find a substitute build by commit, the job's last build, or another lookup.

For a linked failure, read that exact build's logs through `ci.md`'s `ci-logs`. For a CLI config, use its command row. For an MCP config, read the named server's current tool descriptions and parameter schemas, select a read-only log tool, and bind the job and build or run from the failed check's link to its arguments. Follow its pagination to obtain the logs needed to classify the failure. The log tool is unpinned; only Check and `rerun-ci` are pinned. If no matching log tool is available, report the server and gap instead of guessing a tool or another build. Classify the failure before retriggering:

- Diff-owned failure: fix with a red-first proof and include it in the push wave.
- Stale base: fetch the current base and check `git merge-base --is-ancestor <base-tip> <head>`. For failures outside the diff, inspect whether missing base changes explain them. Report the needed update to the caller's Conflict owner; do not spend a retry on it.
- Proven flake or infrastructure failure: one fresh full rerun of that exact failed build, not a failed-job-only retry. Use only `ci.md`'s `rerun-ci` command row for a CLI config or its pinned rerun tool for an MCP config. Record the job, failed build or run, and consumed retry so a new poll or worker does not reset the allowance for that failure. An identical second failure must be reclassified from child logs; never retry blindly. If the command row or rerun pin is absent or `unsupported`, report the flake for the human and rerun nothing. Never substitute another rerun tool.

After publishing fixes, watch required checks, then read merge state, review decision, and all threads again. Stop at merge-ready. Owner approval, permissions, a conflict, or a policy decision is the human's line: report it, finish independent actionable items where safe, then return. Never merge to make a blocked state disappear.

Publish a delivery table for the frontier and pending upstack PRs, with current head, checks, threads, review decision, status, and evidence. Keep unknown or unavailable values explicit. Append Timeline events for each fix or dismissal, push wave, exact failed build and log classification, consumed rerun, refreshed frontier, and blocker. Update the Flow's existing `pr` and `check` ids from these reads. After all four current-head conditions hold, return readiness and the establishing head, check, thread, and review evidence. The owning END-STATE caller publishes reached merge-ready only after its final patch-id and accepted-Verdict gate. A standalone babysit run reports readiness without claiming independently verified delivery. Neither a completed watch nor the strip's observations replaces those reads.

## Hand-back

Return mode, frontier URL and branch, head SHA, the last SHA this run pushed, merge state, required checks, unresolved threads, review decision, fixed versus dismissed findings with reasons and proof, retries used, pending upstack work, and what needs the human.

Do not create a bot rubric or a dismissal-pattern PR.

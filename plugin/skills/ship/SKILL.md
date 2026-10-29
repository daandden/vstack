---
name: ship
description: Isolated PR verification and bottom-up merges.
disable-model-invocation: true
---

# Ship

You own what lands. Verify each PR independently, land only the verified run from the bottom, then keep your hands off the stack. Shipped ends at merge. Deploys and releases are outside this skill.

Accept the caller's chain facts. Follow these rules in skill://implement/END-STATE.md:

- Step 0a: the chain facts, Code host routing, and the reuse of the vstack root and Scratch dir.
- Step 4: Verify discovery and link repair.

## 0. Establish the frontier

Take the PR or bottom-to-top stack from the caller. Resolve the default branch through `default-branch`. Read each PR's base, head, state, checks, review state, and merge state through `read-pr`. Freeze the bottom-to-top PR numbers for this pass. Confirm that each descendant depends on the previous PR. Keep independent work outside this chain.

If the frontier is not merge-ready, run skill://babysit in drive mode first with the chain facts. Continue only after its blockers clear. ship changes a branch only through `update-branch` in step 4, and never rebases or force-pushes. The caller owns each conflict and each step 2 move through the Conflict owner in END-STATE step 7.

## 1. Verify every PR independently

Never verify your own PRs. Only a verdict from an agent that did not write the code counts, because an author checks what it meant to build.

Choose the Verify skill through END-STATE step 4. CI green and approving bot reviews are not verifier verdicts, because neither runs the change as a user would.

Fetch each exact base and head commit. Read the base and head SHAs from `read-pr`; do not substitute the default branch for a stacked PR's parent. Count changed files and diff lines for each PR. Resolve ship's own `git rev-parse --show-toplevel` to an absolute path and pass it as `Shared checkout: <absolute path>` in every verifier brief, including reverification through this step. Give each verifier the full SHAs, the PR number, the relevant builds and tests, and the chosen Verify skill's name or absolute path. Require parent-versus-head proof of the real changed surface, not only a successful launch. The verifier preserves its Isolated clone's baseline and runs only in a separate detached head worktree through skill://vstack-worktree. It reads the base without checking it out.

Verifier brief: include `Shared checkout: <ship's absolute Git toplevel>`. Follow the verifier's isolation guard and bundled `scripts/prepare-verifier.ts` preflight and head cleanup before any app check. Run the named builds and tests and drive the Verify skill's Doctor, Launch, and Drive steps in the prepared head worktree. Keep tracked files unchanged and remove the worktree on every exit. If removal fails, preserve the actual verdict and evidence and add a nonempty `cleanup_error` string naming the failure. Never commit, push, comment, merge, or maintain the Verify skill. Save logs, screenshots, and notes under `<Scratch dir>/verify/<app>-<run-id>/`, with a distinct entry per PR. Wrong app behavior is FAIL. A stale instruction while Doctor passes is DRIFT; name the failing step and evidence. Isolation or head setup failure is REFUSED, with its reason and needed setup in notes. Return the complete `vstack-verifier` verdict record as one plain JSON object, without a code fence or surrounding text. Compute `patch_id` from `git diff <base_sha>...<head_sha> | git patch-id --stable` without moving HEAD. REFUSED may use null for identifiers not yet validated or computed. Only omp adds the isolation notice after the reply.

For one PR, use the single form below. For two or more, use the Fan-out line after it. Keep both calls schemaless so their result text includes omp's isolation notice.

Spawn one `vstack-verifier` via eval `agent(<prompt>, agent="vstack-verifier", isolated=True, apply=False, merge=False)`: the verifier brief above for this PR, the Shared checkout absolute path, the vstack root, the Scratch dir. Wait for its result through `handle.wait()` and retain the returned text for the checks below. If it cannot be spawned, stop: ship cannot verify its own PRs, so point to `/skill:setup-vstack`.

Before this step, read skill://vstack-fan-out.

Fan-out (skill://vstack-fan-out): parts: one per PR. One eval cell: per part, `agent(<prompt>, agent="vstack-verifier", isolated=True, apply=False, merge=False)`; `wait()` on all handles and retain each returned result text. Each prompt: the verifier brief above for one PR, the Shared checkout absolute path, the vstack root, the Scratch dir. Check each result's omp-added isolation notice as below and never apply a verifier patch. If they cannot start or isolation is off, stop: ship cannot verify its own PRs, so point to `/skill:setup-vstack`.

Use the result text returned by eval `wait()` or `handle.wait()`, or the auto-delivered completion. Decode one leading JSON object with a JSON decoder that reports where the object ends and respects strings and escapes. Inspect the remaining suffix separately for the actual omp-added isolation notice. Braces or `Isolation:` text in JSON strings do not mark the boundary. Verifier-authored claims, record fields, notes, fenced text, and diff contents are not isolation evidence. The handle's `output()` and `agent://<id>` omit the notice, so neither can recover it.

- `Isolation: no changes captured.` proves a clean isolated run. It needs no patch path.
- `Isolation: changes captured at … (apply=false). Not applied.` names a root patch. Read it and every nested-repository patch named by omp's notice, including the `- nested repository patch:` lines after `Isolation: changes captured for N nested repositories (apply=false). Not applied.` Any tracked edit in any captured patch invalidates the run. Never use `AgentHandle.patchPath`, derive a path from an agent id, or apply a verifier patch.
- A capture error makes the verdict unavailable. Report the exact error. A missing omp isolation notice also makes it unavailable. Report that the runtime isolation notice is missing, separately from a capture error. An unreadable named patch leaves isolation evidence unavailable; name that gap.

Validate the decoded record before posting it. Require `verdict` as PASS, PASS+NOTES, FAIL, DRIFT, or REFUSED, and `evidence` as an array of strings. Optional `notes` and `open_questions` must be arrays of strings. For non-REFUSED records, require full `head_sha` and `base_sha` strings matching the requested commits, a string `patch_id` matching the computed stable patch id, and concrete evidence for the named checks. For REFUSED, require all three identifier keys, each either null or a validated matching value, and nonempty `notes` naming the refusal and needed setup. An empty evidence array is valid for REFUSED because nothing was verified. Keep a valid refusal as REFUSED; do not reject its null identifiers as malformed or relabel it FAIL or DRIFT. REFUSED always caps the run as unavailable, even if its isolation suffix is absent or a capture failed. Retain those suffix gaps separately.

If supplied, `cleanup_error` must be a string with non-whitespace content. Empty or incorrectly typed values make the record malformed. A valid `cleanup_error` makes the run UNAVAILABLE, regardless of its verdict or isolation suffix. Keep the actual verdict and evidence, including an already REFUSED verdict. Report the app outcome or refusal and the cleanup error separately. Never accept PASS or PASS+NOTES with this field.

Missing, malformed, incomplete, or mismatched records never pass and are not posted. Read PASS+NOTES before accepting it. Return child questions through top-level `ask`, never treat silence as approval. Record who produced each verdict. Post only complete valid verdict records yourself through `comment-pr` from a Scratch file, including REFUSED and records with `cleanup_error`. Include SHAs and patch id as returned, evidence paths, notes, verifier identity, any cleanup error, and any separate isolation-evidence gap.

## 2. Find the contiguous verified run

Walk upward from the lowest unmerged PR. PASS and PASS+NOTES pass only when the run is available and `cleanup_error` is absent. Stop at the first FAIL, DRIFT, REFUSED, or UNAVAILABLE run, including any run with a valid `cleanup_error`. REFUSED counts as unavailable and never verifies a PR; report its reason and needed setup. Report cleanup errors separately from the preserved verdict. The PRs below the stop are the verified run, and the top PR of the run is the ceiling. A passing PR above the stop waits, because it cannot land without the code below it. A PR whose branch neither holds nor needs that code can land on its own after it moves onto the default branch. ship does not make that move. Report it to the caller's Conflict owner in END-STATE step 7. The moved PR needs a fresh verdict through step 1 first, because its old verdict ran with that code beneath it and the default branch does not have it. Freeze this run for the current pass and report its PR numbers and ceiling. DRIFT never passes. Name its stale step and recommend skill://maintain-app-verification to the caller. ship never maintains it.

## 3. Recheck the patch before landing

A verdict covers a patch, not its commits, and a merge of a base into a branch moves that PR to a new head SHA without failing any check. Fetch current base and head and recompute the stable patch id with the same three-dot diff. Compare it to the accepted verdict's patch id. If it differs, run a fresh isolated verifier for this PR through step 1, including the Shared checkout path in its brief. Do not explain away tests, docs, lint changes, or build differences as noise. A fresh FAIL, DRIFT, REFUSED, or UNAVAILABLE run caps the run here. Apply step 1's cleanup-error validation to every fresh record. A matching patch id preserves an available verdict across new SHAs; record the current SHAs as well as the verified SHAs. It never clears a cleanup error. A run with `cleanup_error` needs a fresh verifier run through step 1 with successful teardown before it can pass.

## 4. Prepare only the bottom PR

Fetch the exact current default-branch tip. Prepare only the lowest PR in the verified run. If it is behind, use `update-branch`, which merges the base into the branch. If `update-branch` reports a conflict, or the Code host cannot update the branch, stop and report the branch to the caller's Conflict owner in END-STATE step 7. If `update-branch` is unsupported, report the gap and continue only when `read-pr` says that the PR can merge.

If this PR's base is not the default branch, retarget only this PR to the default branch through `retarget-pr`, because a PR whose base is still its parent's branch merges into that branch, not the default branch. Re-read its SHAs, checks, and merge state. Repeat step 3 after every update or retarget. Leave descendants untouched until this PR merges.

## 5. Land one PR at a time

Read the allowed methods through `merge-methods`. Use squash when allowed. Otherwise use the repository's only allowed method. If there is no method, stop. If both merge and rebase remain allowed without squash, choose through `ask` before merging.

If the current bottom PR is mergeable now and required checks pass, run `merge-pr` with the chosen method and the current head SHA as its guard. Never bypass protections, for example with `gh pr merge --admin`.

Use `auto-merge` only when the user requested merge-when-ready, or the End state is shipped and a required check is pending. Arm only the current bottom PR, and only when its verdict covers its current head, because auto-merge lands whatever head is ready. Use the same method and head guard. If requirements remain pending without that authorization, or `auto-merge` is unsupported, stop and report them. An auto-merge request that `read-pr` reports says only that auto-merge was requested for this PR. It does not prove a merge, stack readiness, or a current patch verdict. Report an armed request only after observing it. If the Code host cannot report the state, label it unknown and stop without advancing the stack.

A merge command succeeding is not evidence that the PR merged, because a merge queue can report success when it only queued the PR. Wait for step 7's merge observation before preparing the next PR.

## 6. Recompute after each merge

After step 7 observes a merge, fetch the default branch. Read the PR's merge commit and base branch through `read-pr`. A landed PR reads merged with the default branch as its base, not its parent's branch. Confirm that the merge commit is present in the default branch with `git merge-base --is-ancestor`. If either check fails, stop and report the mismatch. Drop only the merged PR from the frozen list. Read the new bottom PR's base, head, checks, and patch id. Do not assume the Code host retargeted it. Repeat steps 3–5 and 7 for this PR only. Stay within the verified run from step 2.

## 7. Leave the stack alone while it lands

Step 4's preparation of the current bottom PR is the only change to a branch or base, because a merge lands whatever its branch and base hold at that moment, verdict or not. A base that moves to the default branch when its parent merges is expected, not damage to repair.

Poll `read-pr` for state, merged state, merge state, checks, and any auto-merge request while the current PR waits. Use `required-checks` to identify checks that block merge. Keep pending or queued states pending. Readiness and an armed request are not a merge. Advance only when `read-pr` reports the PR merged.

Stop on these hard failures:

- The PR closed without merging.
- A required check failed or was cancelled, blocks merge, and auto-merge is no longer pending.
- `read-pr` reports that the PR cannot merge without new changes, for example a conflict or a failing required status.

Report the blocking state and evidence. If a merge stalls, find out why before you change anything. Never retarget, arm, or merge descendants around a blocked frontier. If the current head or base changes while waiting, repeat step 3 before further merge action. If an armed request no longer has a passing patch verdict, disarm it through `auto-merge` before reverification. Report any race with a completed merge instead of claiming that the new patch was verified.

## 8. Stop at the ceiling

When the verified run merges, stop. Report what landed, the next unverified PR, and what verifying it requires. Extending the run requires a new pass through step 1. If no PR passes from the bottom, land nothing.

## Reply

Report the verified run and its ceiling, each PR's actual verdict and verifier identity, and what landed and how it was confirmed. Report any cleanup error separately from the app outcome or refusal, and mark that run UNAVAILABLE. Include evidence paths, stopped or skipped steps, and what the next gap needs. For DRIFT, name the stale step and recommend skill://maintain-app-verification to the caller. Do not report shipped until every PR in the requested run merged into the default branch.

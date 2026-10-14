---
name: ship
description: Isolated PR verification and bottom-up merges.
disable-model-invocation: true
---

# Ship

You own what lands. Verify each PR independently, land only the verified run from the bottom, then keep your hands off the stack. Shipped ends at merge. Deploys and releases are outside this skill.

Run every Code host operation through the operation ids in the caller's `code-host.md`. Accept the caller's settled End state, `code-host.md` path, branch ownership, last pushed SHAs, and any open decision-trail log path.

## 0. Establish the frontier

Take the PR or bottom-to-top stack from the caller. Resolve the default branch through `default-branch`. Read each PR's base, head, state, checks, review state, and merge state through `read-pr`. Freeze the bottom-to-top PR numbers for this pass. Confirm that each descendant depends on the previous PR. Keep independent work outside this chain.

If the frontier is not merge-ready, run skill://babysit in drive mode first. Pass the End state, the `code-host.md` path, and whether this run created the branch. Continue only after its blockers clear. A conflict belongs to the run that created the branch. Rebase only when this run created it and its remote tip remains the last SHA this run pushed. Otherwise report the conflict and stop.

Resolve the absolute vstack root and mode through the Private-mode rule. Resolve the project Scratch dir once through skill://vstack-tmp, with its path script run without a kind argument. Pass both absolute paths to each verifier. If a decision-trail log is open, append decisions through skill://decision-trail to that exact log. Do not start a new log in a chained invocation.

## 1. Verify every PR independently

Read skill://vstack-fan-out and its FORMS.md. If eval is unavailable, isolation is off, or a verifier cannot start, stop and point to /skill:setup-vstack. Never verify your own PRs. Only a verdict from an agent that did not write the code counts, because an author checks what it meant to build. An inline gate still requires an isolated verifier.

List the project's Verify skills named `verify-*`. In Private mode, also list `<vstack root>/skills/verify-*/` and deduplicate links and targets. If a link is missing, repair the absolute `.omp/skills/verify-<app>` link at the top level as described in skill://setup-app-verification. Leave shared ignores unchanged. Read a newly linked skill by absolute path for this session. Resolve helpers relative to the directory from which SKILL.md was read.

Use the only Verify skill, or the one whose description names the changed surface. If several match without a clear choice, use one `ask`. If none exists, report that live proof is absent. Give the verifier the project's tests and scripts instead and recommend skill://setup-app-verification to the caller. CI green and approving bot reviews are not verifier verdicts, because neither runs the change as a user would.

Fetch each exact base and head commit. Read the base and head SHAs from `read-pr`; do not substitute the default branch for a stacked PR's parent. Count changed files and diff lines for each PR. Give each verifier these full SHAs, the PR number, the relevant builds and tests, and the chosen Verify skill's name or absolute path. Its brief requires parent-versus-head proof of the real changed surface, not only a successful launch. The verifier runs on its own clone and checks out only the supplied head SHA. It reads the base for comparison without moving its checkout to another commit.

Verifier brief: run the named builds and tests and drive the Verify skill's Doctor, Launch, and Drive steps. Keep tracked files unchanged. Never commit, push, comment, merge, or maintain the Verify skill. Save logs, screenshots, and notes under `<Scratch dir>/verify/<app>-<run-id>/`, with a distinct entry per PR. A wrong app behavior is FAIL. A stale instruction while Doctor passes is DRIFT; name the failing step and evidence. Return the `vstack-verifier` output schema: `verdict` (PASS, PASS+NOTES, FAIL, DRIFT), `head_sha`, `base_sha`, `patch_id`, `evidence`, and optional `notes` and `open_questions`. Compute `patch_id` as the first field of `git diff <base_sha>...<head_sha> | git patch-id --stable`.

For one PR, use the single form below. For two or more, run the gate and use its selected line.

Spawn one `vstack-verifier` via eval `agent(<prompt>, agent="vstack-verifier", isolated=True, apply=False, merge=False)`: the verifier brief above for this PR, the user's override words, the vstack root, the Scratch dir. Wait for its result. If it cannot be spawned, stop: ship cannot verify its own PRs.

Before this step, read skill://vstack-fan-out and run its gate on the block below.

Fan-out gate (skill://vstack-fan-out): parts: one per PR; size: changed files and diff lines per PR.
- fan-out → one eval cell: per part, `agent(<prompt>, agent="vstack-verifier", isolated=True, apply=False, merge=False)`; `wait()` on all handles. Each prompt: the verifier brief above for one PR, the user's override words, the vstack root, the Scratch dir. Read each completion notice's patch path and never apply a verifier patch.
- inline → Spawn one `vstack-verifier` via eval `agent(<prompt>, agent="vstack-verifier", isolated=True, apply=False, merge=False)` that checks every part in order: the verifier brief above for every PR with separate evidence and a schema record per PR, the user's override words, the vstack root, the Scratch dir. If it cannot be spawned, stop: ship cannot verify its own PRs.

For the inline multi-PR run, ask that verifier to save one schema-shaped JSON record per PR in its Scratch entry. Its schema-shaped final result describes the last checked PR and lists the absolute record paths in `evidence`. Read every record as an independent verdict. Never copy the last verdict onto other PRs.

Read each patch path from omp's completion notice, `Isolation: changes captured at … (apply=false). Not applied.` Never use `AgentHandle.patchPath` or derive a path from an agent id. Inspect a returned patch for tracked edits. A nonempty tracked patch invalidates that verifier's run. If the notice is unavailable, report that isolation evidence is missing and treat the result as unavailable. Never apply a verifier patch.

Require a schema record for each PR with the requested head and base SHAs, its computed patch id, and concrete check evidence. Missing, malformed, incomplete, or mismatched evidence does not pass. Read PASS+NOTES before accepting it. Return child questions through top-level `ask`, never treat silence as approval. Record who produced each verdict. Post each verdict yourself through `comment-pr` from a Scratch file. Include SHAs, patch id, evidence paths, notes, and verifier identity.

## 2. Find the contiguous verified run

Walk upward from the lowest unmerged PR. PASS and PASS+NOTES pass. Stop at the first FAIL, DRIFT, or unavailable verdict. The PRs below it are the verified run, and the top PR of the run is the ceiling. A passing PR above the stop waits, because it cannot land without the code below it. A PR whose branch neither holds nor needs that code can move onto the default branch under step 0's Conflict owner rule and land on its own. It needs a fresh verdict through step 1 first, because its old verdict ran with that code beneath it and the default branch does not have it. Freeze this run for the current pass and report its PR numbers and ceiling. DRIFT never passes. Name its stale step and recommend skill://maintain-app-verification to the caller. ship never maintains it.

## 3. Recheck the patch before landing

A verdict covers a patch, not its commits, and a chain rebase moves every PR above it to a new SHA without failing any check. Fetch current base and head and recompute the stable patch id with the same three-dot diff. Compare it to the accepted verdict's patch id. If it differs, run a fresh isolated verifier for this PR through step 1. Do not explain away tests, docs, lint changes, or build differences as noise. A fresh FAIL, DRIFT, or unavailable result caps the run here. A matching patch id preserves the verdict across rewritten SHAs; record the current SHAs as well as the verified SHAs.

## 4. Prepare only the bottom PR

Fetch the exact current default-branch tip. Prepare only the lowest PR in the verified run. If it is behind, rebase only under step 0's Conflict owner rule and push with `--force-with-lease`. Never force-push a branch this run did not create. Otherwise use `update-branch`, which never rebases or force-pushes. If the Code host cannot update the branch, stop and report the branch that needs its owner. If `update-branch` is unsupported, report the gap and continue only when `read-pr` says that the PR can merge.

If this PR's base is not the default branch, retarget only this PR to the default branch through `retarget-pr`, because a PR whose base is still its parent's branch merges into that branch, not the default branch. Re-read its SHAs, checks, and merge state. Repeat step 3 after every update, push, or retarget. Leave descendants untouched until this PR merges.

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

Report the verified run and its ceiling, each PR's verdict and verifier identity, and what landed and how it was confirmed. Include evidence paths, stopped or skipped steps, and what the next gap needs. For DRIFT, name the stale step and recommend skill://maintain-app-verification to the caller. Do not report shipped until every PR in the requested run merged into the default branch.

---
name: compare-attempts
description: Independent attempts, cross-judgment, and synthesis for the grill and implement.
disable-model-invocation: true
---

# Compare attempts

Run independent attempts at the same task. Read every candidate, pick a base, graft the best parts, and verify the result. All runners use the Session model unless the user overrides vstack-worker. Separate contexts give independence, not model diversity.

## Start

The grill uses kind `reply` for fact-finding. implement uses kind `tree` for changes at real target paths. Run only when the user's words ask for several attempts. A caller's preference alone does not authorize attempts. implement owns the End state.

Follow `skill://flow-page`'s "Stage entry/exit line" for a comparison run. The parent publishes candidate evidence.

## Phase A: Frame

The runners receive one shared prompt. The rubric stays with the parent.

1. State the task, the artifact, and its grounding paths. Use the caller's runner brief when it supplies one.
2. Declare the caller's artifact kind. implement uses `tree`, a change at real target paths in the working tree. The grill uses `reply`, a written answer. Its patch is evidence only, never a change to apply.
3. Derive 3–6 concrete criteria from what success means for this task. Keep the rubric out of every runner's prompt.
4. Use three runners by default. The user's count overrides this, such as "5 attempts". When the caller or user supplies directions, give each runner its direction line. Otherwise each gets the same prompt in a fresh context.
5. Resolve the absolute vstack root and, for nested Scratch writers, the project Scratch dir once. Follow "What every subagent prompt carries" in `skill://vstack-fan-out`. A child uses these paths from its prompt and never resolves them again.
6. For `tree`, name the real target paths relative to the checkout. Each runner writes them inside its own clone. Make sure that the target paths are not gitignored, because ignored files do not enter the patch. The candidate never goes through the vstack root. That path is only for nested writers of vstack artifacts, which must use disjoint paths. Follow `skill://principle-separate-before-serializing-shared-state`.

The shared prompt includes the task, artifact kind, target paths, grounding paths, and the caller's brief. It instructs the runner to produce the artifact plus a rationale naming the alternatives it considered and rejected. It also requires a plain-text final reply with the artifact for kind `reply`, the rationale, and every path written. For kind `tree`, the artifact is the patch, not a separate candidate directory. Pass the absolute vstack root. Pass the Scratch dir when any nested writer needs it.

omp captures the delta against the parent's working tree at the start of each runner, including its uncommitted state. Keep the candidate paths unchanged in the parent until Pick. Writes through the vstack root are immediate and are outside the patch.

## Phase B: Fan out

Before this step, read skill://vstack-fan-out.

Fan-out (skill://vstack-fan-out): parts: one per runner. One eval cell: per part, `agent(<prompt>, agent="vstack-worker", isolated=True, apply=False, merge=False)`; `wait()` on all handles. Each prompt: the shared runner brief from Frame and its direction line when given, the vstack root, the Scratch dir. The parent recovers each `patchPath` from the completion text and applies only the chosen base for kind `tree`. If they cannot start or isolation is off, stop: compare-attempts needs isolated attempts, so run `/skill:setup-vstack`.

Make sure that `omp config get task.isolation.enabled` prints `true` before starting. Every runner starts at once, each in its own clone.

Track each runner through skill://vstack-fan-out/WORKER-LIFECYCLE.md. Retain it while comparison, evaluation, grafting, or a question still needs its clone. Before every early stop or re-run, account for all started runners, including partial starts, unavailable candidates, and dropouts. Preserve useful answers, rationales, patches, and evidence outside their clones before release.

In Python eval, set `shared_prompt` to the complete brief from Frame and `runner_count` to the chosen count. Set `directions` to one supplied direction line per runner, or an empty list when none are given. Reuse supplied directions for extra runners. Start every handle before waiting:

```python
handles = [
    agent(
        shared_prompt + ("\nDirection: " + directions[index] if directions else ""),
        agent="vstack-worker", isolated=True, apply=False, merge=False,
    )
    for index in range(runner_count)
]
results = wait(handles, raise_errors=False)
for handle, result in zip(handles, results):
    print(handle.id, result, sep="\n")
```

Keep the handles and completion results paired in input order. A handle has no `patchPath` field. In the completion text, omp names the patch in its isolation notice:

```text
Isolation: changes captured at `<absolute patch path>` (apply=false). Not applied.
```

Read that path as `patchPath`. Read the patch itself before treating it as a candidate; never invent a path from an agent id. If structured output hides the notice, read the full completion with the handle's `output()` or `agent://<id>`. If the path still cannot be recovered, report that candidate as unavailable rather than applying an unknown patch.

A failed runner or one that produces no artifact drops out. For `tree`, an empty patch is no artifact. For `reply`, a substantive answer still counts when its evidence patch is empty. Note every dropout and continue with N−1. With fewer than two candidates left, stop and report.

## Phase C: Cross-judge

Start this step only after every runner finishes. Label the remaining candidates A/B/C, continuing for larger counts. Prepare each candidate's `patchPath`, rationale, and, for kind `reply`, its full answer. Keep runner ids and your scores out of the brief. Labels identify candidates; ids embedded in patch filenames are not evidence of quality.

Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): the artifact kind, the rubric, and the labeled candidates with their patch paths and rationales; read every candidate, score each criterion, recommend a base with reasons, and ignore runner identity in paths, the vstack root. Do not wait; keep working. If it cannot be spawned, skip it: the parent's scoring in Pick stands, and the synthesis note says `cross-judge: not run`.

This read-only explorer is not isolated. The cross-judge runs on the Session model unless the user overrides vstack-explorer. Name the model it ran on in the synthesis note. It uses a context that wrote no candidate and did not see your scores. On the Session model it buys independence, not a second model's taste. Agreement means the rubric reads one way. It does not rule out a blind spot you both share.

## Phase D: Pick a base

Read every patch and rationale end to end. For kind `reply`, read every answer too. Score each criterion before reading the cross-judge's scores. Then collect its result and compare before selecting a base. If the scores disagree, re-read both rationales and resolve the difference against the rubric.

Pick the candidate that a future maintainer can extend most easily without breaking invariants. On ties, prefer the cleaner interface or smaller API, per `skill://principle-laziness-protocol`.

For kind `tree`, run `git apply -- "<base patchPath>"` in the parent's checkout. Apply only that patch. If it fails because the parent's tree moved on those paths, stop and report. Leave the parent's state intact instead of forcing the patch. For kind `reply`, take the base answer as the draft and apply no patch.

## Phase E: Graft

Read each losing candidate again and identify the parts worth keeping. Graft them by hand, per `skill://principle-redesign-from-first-principles`. Rework each part to fit the base instead of pasting competing designs together. Record each graft's source and each rejection's reason.

When the candidates converge, use the consensus shape and omit grafts that add nothing. Report convergence as a weaker signal because every runner shares one model's priors. When the candidates diverge without a common frame, return to Frame. Reframe, then use `ask` for Re-run / Stop under `skill://flow-page`'s "Every ask in a Flow" contract before paying for another batch. A timed-out answer is not approval. Re-ask once through the same contract, setting `again` on the Flow-authored question, then stop if unanswered. Cancellation or an unavailable picker stops the re-run.

After grafting and evaluation no longer need a runner, release it through the shared lifecycle contract and record the observed outcome. Keep losing patches and evidence, with stable Scratch copies when their exact bytes matter. On failed base application or fewer than two candidates, preserve useful results and reconcile every runner before returning. Running or still-needed runners stay retained with reasons.

## Phase F: Verify

Verify the synthesized artifact per `skill://principle-prove-it-works`, using the task's agreed checks. For kind `reply`, exercise the claims and evidence that the answer keeps. If a missed problem comes from the frame, return to Frame and use `ask` before re-running, with the same unanswered and cancellation stops as Graft. If a losing candidate caught it, return to Graft. Fix the cause instead of hiding the failure.

## Outputs

Publish the synthesized artifact and synthesis note as Results on this Flow page. Use a Comparison Result with the candidates, rubric criteria, evidence-backed assessments, and chosen, tied, or inconclusive verdict. Preserve dropouts and unavailable candidates with their reasons rather than inventing assessments. A Document Result carries the full synthesis note and a `reply` artifact. Code/diff carries a `tree` artifact's relevant changes, with source paths and revisions. Attach redacted candidate evidence and verification outputs, keeping the real target files and losing patches unchanged. Add the synthesis note to the driving ticket when there is one. Write no separate synthesis file or report page. Return a short summary of the artifact and note in the reply.

The note names the base and why it won, each graft with its source, each rejection and why, the dropouts, the cross-judge's verdict or `cross-judge: not run`, every losing patch path, and the verification commands and observed results. State the artifact kind and any convergence or re-run. Never claim a check that did not run.

---
name: implement-spec
description: "Implement the result of /skill:to-spec and /skill:to-tickets in code."
disable-model-invocation: true
---

You have been provided a spec. This spec should have tickets associated with it, describing how to implement the spec.

The issue tracker should have been provided to you. If not, tell the user to run `/skill:setup-vstack`. Read it from `docs/vstack/issue-tracker.md` under the vstack root in Standard mode, or from `<vstack root>/config/issue-tracker.md` in Private mode.

For an MCP tracker such as Jira, read the named server's current tool list, descriptions, and parameter schemas. Select tools for searching and reading the spec, tickets, comments, parent-child relationships, blocking links, and status, and for closing work, using the recorded project facts. No per-operation config rows or assumed tool names are needed. Interpret blockers using the recorded blocking link type and its direction, and use the recorded close transition when step 8 calls for resolution. Keep already-closed blockers distinct from tickets completed in this run. If discovery or a needed capability is unavailable, name the server and gap and leave the affected work open. CLI, local-markdown, and no-tool prose configs keep their configured graph and closure rules.

The goal is the entire spec implemented on a single **integration branch**, with every ticket resolved the way the issue tracker closes work.

The tickets are not a list of steps. They are a **task graph** with blocking relationships between them. This means there is always a **frontier** of tickets which are ready to be grabbed.

Start every subagent with a fresh context window containing its brief and relevant context pointers, not the orchestrator's conversation history.

Communication to and from subagents should be sparse. Communicate primarily through **context pointers**: to the spec, tickets, research notes, and previous commits. Don't duplicate information already available via pointers.

**Implementer subagents** run in the background. You read the task graph, start subagents, act on their results, and route questions by END-STATE.md's "Question timing". For each Flow round, use `skill://flow-page/references/reader-needs.md` to write `now` and each question's Decision `brief`, including `asked_again_because` on re-asks. Publish the round, ask, and record the observed response through flow-page's "Every ask in a Flow" contract. You never build or merge a ticket yourself.

## Shared steps

Read skill://implement/END-STATE.md before work. It owns the shared steps 0a–0b, 3b, 4–6, 6b, and 7, also used by implement and hillclimb. Run each shared step once for the whole spec, not once per ticket.

Before task-specific items, open the todo list as END-STATE.md says, with the shared steps and the steps below as `local` steps. Steps 4–7 exist on both sides: `shared 5` is Review the whole diff and `local 5` is Merge each result.

Every subagent uses the Session model unless the user set a model for that agent. Resolve the vstack root, project Scratch dir, and Scratch session id as END-STATE.md says. Pass them to child writers. Open the marked `implement-spec` session folder through `skill://vstack-tmp` and create this run's `<run-id>/` entry inside it.

Before starting isolated work, read skill://vstack-fan-out/WORKER-LIFECYCLE.md. Record every implementer and review fixer by agent id, role, ticket or review wave, clone path, patch and evidence paths, and lifecycle decision. Apply that contract after each result and before every early return, including partial starts, missing patches, failed workers or mergers, and unanswered questions. Retain running or still-needed workers with concrete reasons; preserve useful unapplied work before releasing any settled worker.

Run shared steps 0a–0b once, before step 1. 0a finds the Flow by the spec alias and opens an implement-spec Stage. Add `alias run:<run-id>` and retain the Flow and Stage ids in the run record. Every question round of this run belongs to that Stage: the End state when 0a asks it, any Costly seam, each implementer question that step 5 relays, and the Verify skill choice. 0a settles one End state for the whole spec. If the issue tracker closes work through PRs and 0a asks, say in the End state question's description that End state commit leaves those tickets open.

## Steps

### 1. Read the task graph

Read the spec and tickets to understand the task graph. List the ready frontier: the open tickets whose blockers were all closed before this run, by the tracker's blocking rules.

Reuse the Flow's existing ticket tasks or create one per ticket. Publish the frontier and blocking relationships as a table Result, separate from the Stage tree. Keep ticket completion, spec completion, tracker closure, and delivery End state distinct.

Read the spec's Testing decisions. Before assignment, pick and record any missing seams by skill://tdd's "Seams: where tests go" rule. Route any Costly seam approval question by END-STATE.md's "Question timing".

Read the agreed responsibilities, interactions, observable guarantees, constraints, and rationale through the spec, tickets, and their existing decision-coverage and context pointers. Pass those pointers to each implementer, including the decisions its slice must preserve. Reuse supplied agreements without requiring a separate Architecture brief. Module build order does not replace vertical ticket slices or genuine blocking links. Build sessions select Addons fresh; discard inherited Addon pointers rather than passing them into briefs.

### 2. Explore (optional)

Use an **exploration subagent** only when the tickets need codebase files or external documentation that they do not point at. This lets **implementer subagents** focus on implementation rather than exploration.

Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): read the spec and tickets, explore the code and documentation they need, save markdown notes under `notes/` inside this run's marked `implement-spec` entry, and return each note path with a one-line gist, the vstack root, the Scratch dir and session id. Wait for its result. If it cannot be spawned, stop: report the tickets that need exploration notes and start no implementer.

Pass the note paths to every implementer as context pointers.

### 3. Use the integration branch

The integration branch is shared step 0b's branch. Keep it checked out in the Shared checkout for the whole run. Land each ticket as one commit.

A blocking found-defect repair gets its own commit alongside the ticket commits. It does not complete a ticket.

Open no draft PR. Shared step 7 opens the one PR after review and commit.

### 4. Start the implementers

Use **implementer subagents** to implement each ticket, each in its own isolated clone. Each implementer subagent:

- starts from the integration branch tip, because omp clones each isolated worker from the parent's working tree, uncommitted changes included.
- builds the ticket with skill://tdd.
- returns a patch and merges nothing. Its clone's refs are a snapshot, so the merger in step 5 lands the patch on the current tip.

Before the first implementer, require `omp config get task.isolation.enabled` to print `true`. If isolation is off, stop and point at `/skill:setup-vstack`.

Run the line below for the ready frontier now, and again in step 6 for each set of newly ready tickets. There is one part per ready ticket. With one ready ticket, the line starts one implementer. Start no implementer while a merger runs, because its uncommitted changes would enter the new clone.

Immediately before starting each batch, record the integration branch's full tip SHA as the base SHA for each implementer in that batch. Record the current tip again for a fresh attempt. Keep each base SHA with its handle rather than deriving it when the patch arrives.

Before this step, read skill://vstack-fan-out.

Fan-out (skill://vstack-fan-out): parts: one per ready ticket. One eval cell: per part, `agent(<prompt>, agent="vstack-worker", isolated=True, apply=False, merge=False)`; no `wait()`, because each handle delivers its own result when it settles. Each prompt: the implementer brief below for one ticket, the vstack root, the Scratch dir and session id. The merger in step 5 lands each `patchPath` on the integration branch, one ticket at a time. If they cannot start or isolation is off, stop: implement-spec needs isolated implementers, so run `/skill:setup-vstack` and report each ticket left open.

Record each handle's `agent://<id>` with its ticket and lifecycle entry in the run record. Act on each result in step 5 when it arrives. When nothing else needs you while implementers run, call the `wait` tool. It returns on the first result, so a slow ticket holds back no other ticket.

Implementer brief: build one ticket in your own clone. Read the spec, the ticket, and the exploration notes through their context pointers. Follow skill://implement's "Work within the agreement" contract using those inputs and their decision-coverage records. Choose coding details within the agreement. If evidence requires a consequential departure, pause affected work and return the governing decision, evidence, affected behavior, viable options with trade-offs and a recommendation, and the missing decision as an open question, with held-work paths. Use skill://tdd to build the ticket and follow its seam rule. Return its required seam records for the coordinator to record in the owning Stage. Return any Costly seam requiring approval as a question classified by END-STATE.md's "Question timing", with each unrun test and its proof gap. Prose-only work states its no-test limit instead of adding guidance-string assertions. Read `skill://implement-spec/LANDING-EVIDENCE.md` before checks. Record the scoped check plan even if passing proof is unavailable. Bind passing proof to the worktree that the checks actually ran on. Run typechecking and the single test files you touch regularly, and the full test suite once at the end. Write product changes at real target paths, so that they enter the patch. Commit nothing, merge nothing, and push nothing. Open the marked `implement-spec` session folder in explicit subagent mode. Save evidence under `<run-id>/<ticket>/` there, in separate directories for separate attempts. Return the ticket, changed paths including both ends of renames, the evidence reference, seam records, red and green evidence, checks with their outcomes, and open questions with their gating classification.

Return any [found defect](skill://implement/END-STATE.md#found-defects) with its reproduction evidence, the proof or End state it blocks, if any, and what repair or decision is needed. Keep repair hunks out of the ticket patch. The coordinator owns tracker writes and assigns blocking repairs.

### 5. Merge each result

When an implementer completes, take its result in arrival order. Land one patch at a time through the Merger in the Shared checkout.

#### Found defects

Apply [the shared found-defect route](skill://implement/END-STATE.md#found-defects) to findings from implementers, the Merger, review, and the delivery chain. Record every returned defect before handling a failed worker or missing patch. The coordinator files nonblocking defects and routes questions through END-STATE.md's "Question timing".

For a blocking repair, assign the affected ticket's implementation owner a separate isolated repair attempt. If the defect has no ticket owner, assign the same implementer role. Use the step 4 assignment and evidence rules with a local repair work item in place of a tracker ticket. Give it the spec pointer, baseline reproduction, accepted repair scope, and affected proof. Keep its patch and evidence separate from ticket or review-fix hunks. Include any applicable Addon drafting and gate requirements.

Use the step 5 Merger with that local work item as the ticket-mode landing subject. It lands one repair commit through the same branch, scope, and exact-tree proof guards. Record the repair SHA with the defect, not as a completed ticket or closing reference. Hold affected tickets and proof until the repair lands. Recheck the affected work on the repaired tip through the existing landing and proof routes. Preserve held patches and evidence under the worker lifecycle contract.

#### Ticket landings

Take the patch path only from omp's completion notice: `Isolation: changes captured at <absolute patch path> (apply=false). Not applied.` Keep the worker call schemaless so the auto-delivered completion or the result of `handle.wait()` includes the notice. A failed worker, an unavailable notice, or an empty patch leaves its ticket open. Report it, and never guess a patch path.

Record returned seam picks in this Stage under skill://tdd's seam rule. Route Costly seam approval questions by END-STATE.md's "Question timing", recording each unrun test and its proof gap.

Classify each implementer question by END-STATE.md's "Question timing". Hold non-gating questions in the run record without blocking the merger. If a question is gating, start no merger for that ticket. Hold its patch, record the path, and put the question and its evidence to the user through `ask` under the Flow publication contract above. This includes a necessary consequential departure from the supplied architecture agreement. A ticket whose gating question the user's own answer resolves goes back on the frontier once, with the answer and the held patch path in its brief. A recommendation, Headless automatic pick, timeout, cancellation, absent answer, or unavailable picker resolves no approval gate. Leave that ticket open and its patch unapplied.

Keep a worker with a gating question available until the answer and required follow-up resolve. Save a stable Scratch copy of its held patch before any later release. A fresh retry gets that copy and the answer; preserve the superseded worker's useful work and evidence before deciding its lifecycle.

Otherwise, retain the worker's reported changed paths and evidence reference in the run record. Pass the Merger only the slots below, without a rewritten landing brief. Start it in the Shared checkout with `isolated: false`. Let it settle before starting another Merger or implementer.

Spawn one `vstack-merger` via `task` (`agent: "vstack-merger"`): the ticket with its spec pointer, the captured patch path, the integration branch name, the worker's recorded base SHA, its reported changed paths, its evidence reference, the vstack root, the Scratch dir and session id. Wait for its result. If it cannot be spawned, stop: the main agent never merges a ticket itself, so report each unmerged patch path.

Preserve the failed attempt's useful patch, retry inputs, and evidence outside its clone. Retain it while conflict resolution or the retry still needs it. Otherwise release it through the shared lifecycle contract.

If the Merger returns a branch guard failure or an incomplete rollback, stop the run before another landing or worker starts. For the branch guard, follow shared step 0b. After an incomplete rollback, resume only when the Shared checkout is safely restored.

For another landing failure, put the ticket back on the frontier once for a fresh implementer from the current tip, after the Merger verifies restoration. The Merger's once-only recovery of its own check inputs is part of the same landing, not a fresh implementer attempt. A second landing failure leaves the ticket open.

A ticket is complete when its commit is on the integration branch and no gating question about it is unanswered. Only a complete ticket satisfies a blocker, counts toward the spec, and becomes a closing reference. Keep the Merger's return with the ticket's handle, base SHA, changed paths, evidence reference, seam picks, open questions, patch path, and commit SHA or held patch in the run record.

Once that integration commit has landed and nothing still needs its implementer, release the implementer and verify disappearance through the shared contract. Record the observed outcome beside the commit and preserved patch.

Update the ticket's task only after its integration commit lands with no open gating question. Append a Timeline event with that SHA, the worker's captured red, green, and live proof, its seam record, and the Merger's recorded tree IDs and proof outcome. A held patch, failed worker, or failed merge stays visible with its blocker and evidence; none completes the ticket. Update the delivery table as each result arrives, not only at the final reply.

### 6. Start newly ready tickets

If this changes the **frontier** of available tickets, kick off more **implementer subagents** to work on the new tickets. This allows for maximum concurrency.

After each merge, held patch, or answered question, recompute the frontier. A ticket is ready when every blocker is complete or was closed before this run. Pick each newly ready ticket's seams as step 1 says. Then run the step 4 line at once for the newly ready tickets.

A ticket that already failed in this run is not ready again: a failed worker, a missing or empty patch, a second failed merge, or a second gating question. Only the two once-only returns in step 5 put a ticket back. Report each ticket that stays open, with its reason: a failed worker, a missing patch, a failed merge, an unanswered gating question with its held patch, or an open blocker.

### 7. Review

Once no ticket is ready and no implementer or merger runs, run shared step 3b, then shared step 4. Run shared step 5 once, before shared step 6 (Matt's order). It runs skill://code-review over the whole integration-branch diff from the base SHA, the ticket commits included. Make every review fix that shared step 5 names in a single subagent. With no review fix, skip the fixer below.

When skill://vstack-maintain is loaded, include its drafting brief and review-fix-wave rule under "Knowledge for implement" in the fixer brief. State whether the branch was pushed. That rule owns the `prepare` and `gates` conditions for each wave.

When skill://vstack-maintain is not loaded, tell the fixer to follow `skill://implement-spec/LANDING-EVIDENCE.md` and return the evidence reference with its changed paths, including both ends of renames. The fixer records the scoped check plan even when passing proof is unavailable. It binds any passing proof to the exact tree it checked.

Immediately before starting a fixer, record the integration branch's full tip SHA as its base SHA. Keep it with that worker's handle and lifecycle entry. Record the current tip again for each fresh attempt.

Spawn one `vstack-worker` via eval `agent(<prompt>, agent="vstack-worker", isolated=True, apply=False, merge=False)`: make every review fix in your own clone from code-review's result and the integration branch tip, with skill://tdd where a fix changes behavior. Follow tdd's seam rule and return its required seam records for the coordinator to record in the owning Stage. Return any Costly seam requiring approval as a question classified by END-STATE.md's "Question timing", with each unrun test and its proof gap. Follow skill://implement's "Work within the agreement" rule for consequential departures. Prose-only work states its no-test limit instead of adding guidance-string assertions. Commit nothing, merge nothing, and push nothing. Return changed paths, seam records, checks with their outcomes, open questions with their gating classification, the vstack root, the Scratch dir and session id. Wait for its result. If it cannot be spawned, stop: the main agent only orchestrates, so report each review fix as open and point at `/skill:setup-vstack` when isolation is off.

Take the fixer's patch path from its completion notice as step 5 says, never from an inferred path. Reuse step 5's worker-failure, gating-question, and once-only retry handling for the review-fix wave instead of a ticket. Record its seam picks as step 5 says. Route Costly seam approval questions by END-STATE.md's "Question timing", recording each unrun test and its proof gap.

Give each fixer its own lifecycle entry, including fresh retries. Keep held questions and follow-up workers available as in step 5. After the merger or vstack-maintain landing rule has applied the accepted review-fix hunks and no need remains, release the fixer through the shared contract. Preserve useful failed or superseded work before release; an unavailable patch or failed apply never bypasses that accounting.

Hold non-gating fixer questions by END-STATE.md's "Question timing". With no open gating question, choose the landing rule by whether skill://vstack-maintain is loaded.

When skill://vstack-maintain is not loaded, record a stage-only wave with its identity and local pointers to the accepted review result and the spec. Reuse local snapshots or save them in the wave's Scratch entry. Keep the fixer's reported changed paths and evidence reference with the wave in the run record. Pass only the slots below. Start the Merger in the Shared checkout with `isolated: false`. The Merger opens the conflict pointers only if the apply conflicts.

Spawn one `vstack-merger` via `task` (`agent: "vstack-merger"`): the stage-only wave with its conflict pointers, the captured patch path, the integration branch name, the fixer's recorded base SHA, its reported changed paths, its evidence reference, the vstack root, the Scratch dir and session id. Wait for its result. If it cannot be spawned, stop: the main agent never lands this patch itself, so report the unmerged review-fix patch path.

Use step 5's landing failure routes for the wave, including its hard stops and once-only fresh fixer attempt. On success, retain the Merger's common return and staged paths in the run record. Leave the wave staged for shared step 6.

When skill://vstack-maintain is loaded, follow its landing rule after `gates` passes. Read the patch, then apply it atomically with `git apply -- "<patchPath>"`. A conflict lands nothing. Use the once-only retry above to send the wave to a fresh isolated fixer from the current integration branch tip. Resolve the conflict there and run the required `gates` after the final edit before landing the new patch. A second failed apply leaves the fixes open. Never resolve a conflict by editing plugin text in the parent checkout.

For a maintain wave, keep its gate evidence and apply outcome in the run record.

Draft review fixes only in the isolated worker, never directly in the parent checkout. If a required fix is blocked or still unlanded after its allowed retry, stop before shared step 6. Keep the ticket commits. Record the open fixes, blocker, held patches, and evidence, and reconcile worker lifecycles before returning. Do not verify a final head, close tickets, or continue the delivery chain.

### 8. Commit and close

Update the affected development checks. Then run shared step 6. It commits the review fixes after the ticket commits. Then run shared step 6b on the committed head.

Resolve tickets and the spec only after shared step 6b accepts the Verdict. Resolve each complete ticket the way the issue tracker closes work. The spec is done only when every one of its tickets is complete in this run or was closed before this run. Resolve a done spec the same way. A ticket that stays open keeps the spec open. If the tracker closes work through PRs, pass the complete tickets to open-pr in shared step 7 as the PR's closing references instead, and add the spec only when it is done. At End state commit, those tickets and the spec stay open.

Then run shared step 7 once, up to the settled or capped End state. It opens the one PR, ready for review.

### 9. Reconcile worker lifecycles

Reconcile every implementer and review fixer, including failed, held, superseded, and retry attempts, against skill://vstack-fan-out/WORKER-LIFECYCLE.md. Keep running or still-needed workers retained with concrete reasons. For each release, report its observed outcome and before/after status evidence; claim removal only when proven. Keep integration commits, stable held patches, and evidence outside released clones. This final accounting does not defer the earlier per-result and early-return duties.

## Reply

Report the requested and reached End state, the integration branch, commits read from `git log <base>..<integration branch>` (ticket commits, separate repair commits, and any review-fix commit), PR URLs and observed status, each ticket's outcome (resolved, open with its reason, or closing through the PR), the spec's outcome (resolved, closing through the PR, or open with the tickets that keep it open), development checks with evidence paths, each accepted Verdict with its verifier identity, patch id, and evidence paths, Blast radius findings, open prune-comments work, failed merges, unanswered questions with their held patch paths, worker patch paths, and every skipped step or blocker. Do not claim a PR, readiness, merge, End state, or closed ticket that the chain did not observe.

Include every worker's identity, role, ticket or review wave, retention reason or release outcome, stable patch paths, and lifecycle evidence. Separate cleanup failures and unverified removal from ticket and delivery outcomes.

Include the [found-defect outcomes](skill://implement/END-STATE.md#found-defects) from the run record, even if the run stopped before shared step 7.

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

Communication to and from subagents should be sparse. Communicate primarily through **context pointers**: to the spec, tickets, research notes, and previous commits. Don't duplicate information already available via pointers.

**Implementer subagents** run in the background for maximum concurrency. You are the orchestrator. You read the task graph, start subagents, act on their results, and put questions to the user through `ask` under `skill://flow-page`'s "Every ask in a Flow" contract. Publish each complete round through the Flow CLI and record the observed response separately. You never build or merge a ticket yourself.

## Shared steps

Read skill://implement/END-STATE.md before work. It owns the shared steps 0a–0b, 3b, 4–6, 6b, and 7, also used by implement and hillclimb. Run each shared step once for the whole spec, not once per ticket.

Before task-specific items, open the todo list as END-STATE.md says, with the shared steps and the steps below as `local` steps. Steps 4–7 exist on both sides: `shared 5` is Review the whole diff and `local 5` is Merge each result.

Every subagent uses the Session model unless the user set a model for that agent. Resolve the vstack root and the project Scratch dir once, as END-STATE.md says, and pass both to every subagent. This run keeps its notes and evidence under `<Scratch dir>/implement-spec/<run-id>/`.

Before starting isolated work, read skill://vstack-fan-out/WORKER-LIFECYCLE.md. Record every implementer and review fixer by agent id, role, ticket or review wave, clone path, patch and evidence paths, and lifecycle decision. Apply that contract after each result and before every early return, including partial starts, missing patches, failed workers or mergers, and unanswered questions. Retain running or still-needed workers with concrete reasons; preserve useful unapplied work before releasing any settled worker.

Run shared steps 0a–0b once, before step 1. 0a finds the Flow by the spec alias and opens an implement-spec Stage. Add `alias run:<run-id>` and retain the Flow and Stage ids in the run record. Every question round of this run belongs to that Stage: the End state when 0a asks it, each seam confirmation in steps 1 and 6, each implementer question that step 5 relays, each seam question from the fixer in step 7, and the Verify skill choice. 0a settles one End state for the whole spec. If the issue tracker closes work through PRs and 0a asks, say in the End state question's description that End state commit leaves those tickets open.

## Steps

### 1. Read the task graph

Read the spec and tickets to understand the task graph. List the ready frontier: the open tickets whose blockers were all closed before this run, by the tracker's blocking rules.

Reuse the Flow's existing ticket tasks or create one per ticket. Publish the frontier and blocking relationships as a table Result, separate from the Stage tree. Keep ticket completion, spec completion, tracker closure, and delivery End state distinct.

Read the spec's testing decisions. to-spec confirmed those seams with the user through the Flow question contract, so they are the pre-agreed seams for skill://tdd. If a ready ticket needs a seam that the spec does not confirm, settle it through one question round under the same contract before you assign the ticket. A timed-out answer is not the user's, so that ticket stays off the frontier and stays open. Cancellation, a headless recommendation, or an unavailable picker also leaves the seam unconfirmed.

### 2. Explore (optional)

Use an **exploration subagent** only when the tickets need codebase files or external documentation that they do not point at. This lets **implementer subagents** focus on implementation rather than exploration.

Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): read the spec and tickets, explore the code and documentation they need, save markdown notes under `<Scratch dir>/implement-spec/<run-id>/notes/`, and return each note path with a one-line gist, the vstack root, the Scratch dir. Wait for its result. If it cannot be spawned, stop: report the tickets that need exploration notes and start no implementer.

Pass the note paths to every implementer as context pointers.

### 3. Use the integration branch

The integration branch is shared step 0b's branch. Keep it checked out in the parent checkout for the whole run. Every merge lands on it as one commit per ticket.

Open no draft PR. Shared step 7 opens the one PR after review and commit.

### 4. Start the implementers

Use **implementer subagents** to implement each ticket, each in its own isolated clone. Each implementer subagent:

- starts from the integration branch tip, because omp clones each isolated worker from the parent's working tree, uncommitted changes included.
- builds the ticket with skill://tdd.
- returns a patch and merges nothing. Its clone's refs are a snapshot, so the merger in step 5 lands the patch on the current tip.

Before the first implementer, require `omp config get task.isolation.enabled` to print `true`. If isolation is off, stop and point at `/skill:setup-vstack`.

Run the line below for the ready frontier now, and again in step 6 for each set of newly ready tickets. There is one part per ready ticket. With one ready ticket, the line starts one implementer. Start no implementer while a merger runs, because its uncommitted changes would enter the new clone.

Before this step, read skill://vstack-fan-out.

Fan-out (skill://vstack-fan-out): parts: one per ready ticket. One eval cell: per part, `agent(<prompt>, agent="vstack-worker", isolated=True, apply=False, merge=False)`; no `wait()`, because each handle delivers its own result when it settles. Each prompt: the implementer brief below for one ticket, the vstack root, the Scratch dir. The merger in step 5 lands each `patchPath` on the integration branch, one ticket at a time. If they cannot start or isolation is off, stop: implement-spec needs isolated implementers, so run `/skill:setup-vstack` and report each ticket left open.

Record each handle's `agent://<id>` with its ticket and lifecycle entry in the run record. Act on each result in step 5 when it arrives. When nothing else needs you while implementers run, call the `wait` tool. It returns on the first result, so a slow ticket holds back no other ticket.

Implementer brief: build one ticket in your own clone. Read the spec, the ticket, and the exploration notes through their context pointers. Use skill://tdd to build the ticket at the seams the spec and this brief confirm. The user confirmed them, so tdd asks nothing about them. If the ticket needs another seam, write no test for it, and return the seam as an open question. Run typechecking and the single test files you touch regularly, and the full test suite once at the end. Write product changes at real target paths, so that they enter the patch. Commit nothing, merge nothing, and push nothing. Save evidence under `<Scratch dir>/implement-spec/<run-id>/<ticket>/`. Return the ticket, changed paths, red and green evidence, checks with their outcomes, and open questions.

### 5. Merge each result

Once an **implementer subagent** completes, merge its work to the integration branch with a **merger subagent**. Take one result at a time, in the order the results arrive.

A handle has no `patchPath` field. Recover that path from omp's completion notice: `Isolation: changes captured at <absolute patch path> (apply=false). Not applied.` If structured output hides the notice, read the full completion through the handle's `output()` or `agent://<id>`. A failed worker, an unavailable notice, or an empty patch leaves its ticket open. Report it, and never guess a patch path.

If the implementer returned an open question, start no merger for it. Hold its patch, record the path, and put the question to the user through `ask`. A ticket whose question the user answers goes back on the frontier once, with the answer and the held patch path in its brief. A timed-out, cancelled, headless, or unanswered question leaves the ticket open and its patch unapplied. An unavailable picker does not settle the question.

Keep the questioned worker available until the answer and required follow-up resolve. Save a stable Scratch copy of its held patch before any later release. A fresh retry gets that copy and the answer; preserve the superseded worker's useful work and evidence before deciding its lifecycle.

Otherwise, land the patch with one merger. Only one merger runs at a time.

Spawn one `vstack-worker` via `task` (`agent: "vstack-worker"`): the merger brief below for one ticket, with its patch path, the integration branch name, the vstack root, the Scratch dir. Wait for its result. If it cannot be spawned, stop: the main agent never merges a ticket itself, so report each unmerged patch path.

Merger brief: land one ticket's patch on the integration branch in the parent checkout. Read the patch and confirm that it holds only this ticket's work. If it holds other work, apply nothing and return that. Apply it to the current integration branch tip with `git apply --3way -- "<patchPath>"`. `--3way` stages every hunk it applies. If it conflicts, resolve the conflict against the ticket and the spec, and stage the resolution. If you cannot resolve the conflict, return the working tree and the index to their state before your apply, and commit nothing. Then run typechecking and the ticket's tests on this tree on every merge, with or without a conflict. This tree is the integration branch tip plus the ticket's hunks, so it is the tree that the commit holds. If a check fails, restore the working tree and the index in the same way, and commit nothing. When the checks pass, read `git diff --cached` and confirm that it holds only the ticket's hunks. If it holds other work, restore the working tree and the index in the same way, and commit nothing. Run `git symbolic-ref -q HEAD` immediately before committing. Require `refs/heads/<integration branch>`. A detached HEAD, another branch, or a failed lookup returns a branch guard failure naming the expected branch and the actual branch or detached SHA. For a branch guard failure, leave the index and working tree as they are and commit nothing. Commit the staged hunks as one commit on the integration branch. Use the repo's commit convention and write a body that names the ticket and the patch path. Right after the commit, capture `git rev-parse HEAD` and require it to equal `git rev-parse <integration branch>`. A mismatch or a failed lookup returns a branch guard failure with both results. Leave the integration branch tree clean. Push nothing. Save evidence under `<Scratch dir>/implement-spec/<run-id>/<ticket>/merge/`. Return the ticket, the checked commit SHA or the failure with its reason, each conflict with its resolution, and the check outcomes on the final tree.

If the merger returns a branch guard failure, stop the run with that blocker, as shared step 0b's branch guard says. If it returns any other failure, put its ticket back on the frontier once, for a fresh implementer from the current tip.

Preserve the failed attempt's useful patch, retry inputs, and evidence outside its clone. Retain it while conflict resolution or the retry still needs it; otherwise release it through the shared lifecycle contract. A second failure leaves the ticket open, not its worker unaccounted for.

A ticket is complete when its commit is on the integration branch and no question about it is unanswered. Only a complete ticket satisfies a blocker, counts toward the spec, and becomes a closing reference. Record each ticket's handle, changed paths, open questions, patch path, and commit SHA or held patch in the run record.

Once that integration commit has landed and nothing still needs its implementer, release the implementer and verify disappearance through the shared contract. Record the observed outcome beside the commit and preserved patch.

Update the ticket's task only after its integration commit lands with no open question. Append a Timeline event with that SHA and the worker's captured red, green, and live proof. A held patch, failed worker, or failed merge stays visible with its blocker and evidence; none completes the ticket. Update the delivery table as each result arrives, not only at the final reply.

### 6. Start newly ready tickets

If this changes the **frontier** of available tickets, kick off more **implementer subagents** to work on the new tickets. This allows for maximum concurrency.

After each merge, held patch, or answered question, recompute the frontier. A ticket is ready when every blocker is complete or was closed before this run. Settle each newly ready ticket's seam as step 1 says. Then run the step 4 line at once for the newly ready tickets.

A ticket that already failed in this run is not ready again: a failed worker, a missing or empty patch, a second failed merge, or a second open question. Only the two once-only returns in step 5 put a ticket back. Report each ticket that stays open, with its reason: a failed worker, a missing patch, a failed merge, an unanswered question with its held patch, or an open blocker.

### 7. Review

Once no ticket is ready and no implementer or merger runs, run shared step 3b, then shared step 4. Run shared step 5 once, before shared step 6 (Matt's order). It runs skill://code-review over the whole integration-branch diff from the base SHA, the ticket commits included. Make every review fix that shared step 5 names in a single subagent. With no review fix, skip the fixer below.

When skill://vstack-maintain is loaded, include its drafting brief and review-fix-wave rule under "Knowledge for implement" in the fixer brief. State whether the branch was pushed. That rule owns the `prepare` and `gates` conditions for each wave.

Spawn one `vstack-worker` via eval `agent(<prompt>, agent="vstack-worker", isolated=True, apply=False, merge=False)`: make every review fix in your own clone from code-review's result and the integration branch tip, with skill://tdd at the seams the spec confirms where a fix changes behavior. Commit nothing, merge nothing, and push nothing. Return changed paths, checks with their outcomes, and any new seam as an open question, the vstack root, the Scratch dir. Wait for its result. If it cannot be spawned, stop: the main agent only orchestrates, so report each review fix as open and point at `/skill:setup-vstack` when isolation is off.

Take the fixer's patch path from its completion notice as step 5 says, never from an inferred path. Reuse step 5's worker-failure, held-patch, seam-question, and once-only retry handling for the review-fix wave instead of a ticket. Put each returned seam question to the user through `ask` before landing the patch. A timed-out, cancelled, headless, or unanswered question leaves that fix open and its patch unapplied. An unavailable picker does not settle the question. Report it.

Give each fixer its own lifecycle entry, including fresh retries. Keep held questions and follow-up workers available as in step 5. After the merger or vstack-maintain landing rule has applied the accepted review-fix hunks and no need remains, release the fixer through the shared contract. Preserve useful failed or superseded work before release; an unavailable patch or failed apply never bypasses that accounting.

With no open question, choose the landing rule by whether skill://vstack-maintain is loaded.

When it is not loaded, use step 5's merger to inspect and land the patch on the integration branch. Reuse its patch application, conflict resolution, checks, and rollback behavior against the spec and code-review's result. The merger leaves the accepted review-fix hunks staged and uncommitted for shared step 6 instead of making a ticket commit.

When skill://vstack-maintain is loaded, follow its landing rule after `gates` passes. Read the patch, then apply it atomically with `git apply -- "<patchPath>"`. A conflict lands nothing. Use the once-only retry above to send the wave to a fresh isolated fixer from the current integration branch tip. Resolve the conflict there and run the required `gates` after the final edit before landing the new patch. A second failed apply leaves the fixes open. Never resolve a conflict by editing plugin text in the parent checkout.

Draft review fixes only in the isolated worker, never directly in the parent checkout.

### 8. Commit and close

Update the affected development checks. Then run shared step 6. It commits the review fixes after the ticket commits. Then run shared step 6b on the committed head.

Resolve tickets and the spec only after shared step 6b accepts the Verdict. Resolve each complete ticket the way the issue tracker closes work. The spec is done only when every one of its tickets is complete in this run or was closed before this run. Resolve a done spec the same way. A ticket that stays open keeps the spec open. If the tracker closes work through PRs, pass the complete tickets to open-pr in shared step 7 as the PR's closing references instead, and add the spec only when it is done. At End state commit, those tickets and the spec stay open.

Then run shared step 7 once, up to the settled or capped End state. It opens the one PR, ready for review.

### 9. Reconcile worker lifecycles

Reconcile every implementer and review fixer, including failed, held, superseded, and retry attempts, against skill://vstack-fan-out/WORKER-LIFECYCLE.md. Keep running or still-needed workers retained with concrete reasons. For each release, report its observed outcome and before/after status evidence; claim removal only when proven. Keep integration commits, stable held patches, and evidence outside released clones. This final accounting does not defer the earlier per-result and early-return duties.

## Reply

Report the requested and reached End state, the integration branch, commits read from `git log <base>..<integration branch>` (one per ticket, then the review-fix commit), PR URLs and observed status, each ticket's outcome (resolved, open with its reason, or closing through the PR), the spec's outcome (resolved, closing through the PR, or open with the tickets that keep it open), development checks with evidence paths, each accepted Verdict with its verifier identity, patch id, and evidence paths, Blast radius findings, open prune-comments work, failed merges, unanswered questions with their held patch paths, worker patch paths, and every skipped step or blocker. Do not claim a PR, readiness, merge, End state, or closed ticket that the chain did not observe.

Include every worker's identity, role, ticket or review wave, retention reason or release outcome, stable patch paths, and lifecycle evidence. Separate cleanup failures and unverified removal from ticket and delivery outcomes.

---
name: implement-spec
description: "Implement the result of /skill:to-spec and /skill:to-tickets in code."
disable-model-invocation: true
---

You have been provided a spec. This spec should have tickets associated with it, describing how to implement the spec.

The issue tracker should have been provided to you. If not, tell the user to run `/skill:setup-vstack`. Read it from `docs/vstack/issue-tracker.md` under the vstack root in Standard mode, or from `<vstack root>/config/issue-tracker.md` in Private mode.

The goal is the entire spec implemented on a single **integration branch**, with every ticket resolved the way the issue tracker closes work.

The tickets are not a list of steps. They are a **task graph** with blocking relationships between them. This means there is always a **frontier** of tickets which are ready to be grabbed.

Communication to and from subagents should be sparse. Communicate primarily through **context pointers**: to the spec, tickets, research notes, and previous commits. Don't duplicate information already available via pointers.

**Implementer subagents** run in the background for maximum concurrency. You are the orchestrator. You read the task graph, start subagents, act on their results, and put questions to the user on the flow's Grilling page through `ask`. You never build or merge a ticket yourself.

## Shared steps

Read skill://implement/END-STATE.md before work. It owns the shared steps 0a–0b, 3b, and 4–7, also used by implement and hillclimb. Run each shared step once for the whole spec, not once per ticket.

Before task-specific items, open the todo list as END-STATE.md says, with the shared steps and the steps below as `local` steps. Steps 4–7 exist on both sides: `shared 5` is Review the whole diff and `local 5` is Merge each result.

Every subagent uses the Session model unless the user set a model for that agent. Resolve the vstack root and the project Scratch dir once, as END-STATE.md says, and pass both to every subagent. This run keeps its notes and evidence under `<Scratch dir>/implement-spec/<run-id>/`.

Run shared steps 0a–0b once, before step 1. 0a finds the flow's Grilling page from the spec issue and adds an implement-spec Stage. Then append the page's `flow` record again with this run's id in `runs`. Every `ask` of this run is a question in that Stage: the End state, each seam confirmation in steps 1 and 6, each implementer question that step 5 relays, each seam question from the fixer in step 7, and the Verify skill choice. 0a settles one End state for the whole spec. If the issue tracker closes work through PRs and 0a asks, say in the End state question's description that End state commit leaves those tickets open.

## Steps

### 1. Read the task graph

Read the spec and tickets to understand the task graph. List the ready frontier: the open tickets whose blockers were all closed before this run, by the tracker's blocking rules.

Read the spec's testing decisions. to-spec confirmed those seams with the user through `ask`, so they are the pre-agreed seams for skill://tdd. If a ready ticket needs a seam that the spec does not confirm, settle it with one `ask` before you assign the ticket. An answer `ask` picks after a timeout is not the user's, so that ticket stays off the frontier and stays open.

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

Record each handle's `agent://<id>` with its ticket in the run record. Act on each result in step 5 when it arrives. When nothing else needs you while implementers run, call the `wait` tool. It returns on the first result, so a slow ticket holds back no other ticket.

Implementer brief: build one ticket in your own clone. Read the spec, the ticket, and the exploration notes through their context pointers. Use skill://tdd to build the ticket at the seams the spec and this brief confirm. The user confirmed them, so tdd asks nothing about them. If the ticket needs another seam, write no test for it, and return the seam as an open question. Run typechecking and the single test files you touch regularly, and the full test suite once at the end. Write product changes at real target paths, so that they enter the patch. Commit nothing, merge nothing, and push nothing. When tdd stops a slice for missing red evidence, keep its changes and list its paths and hunks. Save evidence under `<Scratch dir>/implement-spec/<run-id>/<ticket>/`. Return the ticket, changed paths, red and green evidence, checks with their outcomes, stopped slices with the missing red evidence, and open questions.

### 5. Merge each result

Once an **implementer subagent** completes, merge its work to the integration branch with a **merger subagent**. Take one result at a time, in the order the results arrive.

A handle has no `patchPath` field. Recover that path from omp's completion notice: `Isolation: changes captured at <absolute patch path> (apply=false). Not applied.` If structured output hides the notice, read the full completion through the handle's `output()` or `agent://<id>`. A failed worker, an unavailable notice, or an empty patch leaves its ticket open. Report it, and never guess a patch path.

If the implementer returned an open question, start no merger for it. Hold its patch, record the path, and put the question to the user through `ask`. A ticket whose question the user answers goes back on the frontier once, with the answer and the held patch path in its brief. A timed-out answer leaves the ticket open and its patch unapplied.

Otherwise, land the patch with one merger. Only one merger runs at a time.

Spawn one `vstack-worker` via `task` (`agent: "vstack-worker"`): the merger brief below for one ticket, with its patch path and the stopped slices its implementer listed, the vstack root, the Scratch dir. Wait for its result. If it cannot be spawned, stop: the main agent never merges a ticket itself, so report each unmerged patch path.

Merger brief: land one ticket's patch on the integration branch in the parent checkout. Read the patch and confirm that it holds only this ticket's work. If it holds other work, apply nothing and return that. Apply it to the current integration branch tip with `git apply --3way -- "<patchPath>"`. `--3way` stages every hunk it applies, stopped slices included. If it conflicts, resolve the conflict against the ticket and the spec, and stage the resolution. If you cannot resolve the conflict, return the working tree and the index to their state before your apply, and commit nothing. After the apply and any staged resolution, record the full tree with `git write-tree`. The full tree is the tip plus every hunk of the ticket, stopped slices included. Before any commit, take each stopped slice out of the index and the working tree as its own removal. For each removal, write only the hunks that it takes out to a new delta file, `<Scratch dir>/implement-spec/<run-id>/<ticket>/held/<n>.patch`, and run `git apply -R --index -- "<delta path>"`. After each removal, regenerate the recovery patch with `git diff --binary "$(git write-tree)" <full tree> > <Scratch dir>/implement-spec/<run-id>/<ticket>/stopped.patch`. `stopped.patch` holds every held hunk. Its base is the tree of kept hunks, so it applies only on the ticket commit, with `git apply`. Never apply it to the tip. It can change a file that only the ticket adds, and its context lines can include kept hunks. Then run typechecking and the ticket's tests on this tree on every merge, with or without a conflict. This tree is the integration branch tip plus the ticket's kept hunks, so it is the tree that the commit holds. If a check fails because a kept hunk depends on a stopped slice, take that hunk out as a new removal in the same way, and run the checks again. If a check fails for another reason, or no kept hunk remains, return the working tree and the index to their state before your apply, and commit nothing. `stopped.patch` does not apply on that restored tip, so return `<patchPath>` as the ticket's patch. When the checks pass, read `git diff --cached` and confirm that it holds only the ticket's checked hunks. If it holds a stopped hunk or other work, take that hunk out as a new removal in the same way, run the checks again, and read `git diff --cached` again. Commit the staged hunks as one commit on the integration branch. Use the repo's commit convention and write a body that names the ticket, the patch path, and each stopped slice. Leave the integration branch tree clean. Push nothing. Save evidence under `<Scratch dir>/implement-spec/<run-id>/<ticket>/merge/`. Return the ticket, the commit SHA or the failure with its reason, each conflict with its resolution, the check outcomes on the final tree, the `stopped.patch` path when you commit, and each kept hunk you moved into it.

If the merger returns a failure, put its ticket back on the frontier once, for a fresh implementer from the current tip.

A ticket is complete when its commit is on the integration branch, it has no stopped slice, and no question about it is unanswered. Only a complete ticket satisfies a blocker, counts toward the spec, and becomes a closing reference. A stopped slice keeps its hunks uncommitted in its held `stopped.patch`, keeps its ticket open, and caps the End state at commit, so an unproven fix never reaches a PR. Record each ticket's handle, changed paths, stopped slices with their held patch paths, open questions, patch path, and commit SHA or held patch in the run record.

### 6. Start newly ready tickets

If this changes the **frontier** of available tickets, kick off more **implementer subagents** to work on the new tickets. This allows for maximum concurrency.

After each merge, held patch, or answered question, recompute the frontier. A ticket is ready when every blocker is complete or was closed before this run. Settle each newly ready ticket's seam as step 1 says. Then run the step 4 line at once for the newly ready tickets.

A ticket that already failed in this run is not ready again: a failed worker, a missing or empty patch, a stopped slice, a second failed merge, or a second open question. Only the two once-only returns in step 5 put a ticket back. Report each ticket that stays open, with its reason: a failed worker, a missing patch, a stopped slice, a failed merge, an unanswered question with its held patch, or an open blocker.

### 7. Review

Once no ticket is ready and no implementer or merger runs, run shared step 3b, then shared step 4. Run shared step 5 once, before shared step 6 (Matt's order). It runs skill://code-review over the whole integration-branch diff from the base SHA, the ticket commits included. Make every review fix that shared step 5 names in a single subagent. With no review fix, skip the fixer below.

Spawn one `vstack-worker` via `task` (`agent: "vstack-worker"`): make every review fix in the parent checkout from code-review's result and the integration branch tip, with skill://tdd at the seams the spec confirms where a fix changes behavior, and return changed paths, checks with their outcomes, and any new seam as an open question, the vstack root, the Scratch dir. Wait for its result. If it cannot be spawned, stop: the main agent only orchestrates, so report each review fix as open. Put each returned seam question to the user through `ask` before the commit. A timed-out answer leaves that fix open. Report it.

### 8. Commit and close

Update the affected checks and live proof. Then run shared step 6. It commits the review fixes after the ticket commits.

Resolve each complete ticket the way the issue tracker closes work. The spec is done only when every one of its tickets is complete in this run or was closed before this run. Resolve a done spec the same way. A ticket that stays open keeps the spec open. If the tracker closes work through PRs, pass the complete tickets to open-pr in shared step 7 as the PR's closing references instead, and add the spec only when it is done. At End state commit, those tickets and the spec stay open.

Then run shared step 7 once, up to the settled or capped End state. It opens the one PR, ready for review.

### 9. Leave the workspaces to omp

Add no cleanup step. omp parks and reclaims the implementer workspaces. Leave the worker patches in omp's artifacts directory, and cite their paths in the reply.

## Reply

Print the flow's page path first. Then report the requested and reached End state, the integration branch, commits (one per ticket, then the review-fix commit), PR URLs and observed status, each ticket's outcome (resolved, open with its reason, or closing through the PR), the spec's outcome (resolved, closing through the PR, or open with the tickets that keep it open), checks and live proof with evidence paths, Safety findings, open prune-comments work, stopped slices with missing red evidence and their held patch paths, failed merges, unanswered questions with their held patch paths, worker patch paths, and every skipped step or blocker. Do not claim a PR, readiness, merge, or closed ticket that the chain did not observe.

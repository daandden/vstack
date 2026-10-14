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

Implementer subagents build the whole ready frontier at once, for maximum concurrency.

## Shared steps

Read skill://implement/END-STATE.md before work. It owns the shared steps 0a–0c, 3b, and 4–7, also used by implement and hillclimb. Run each shared step once for the whole spec, not once per ticket.

Before task-specific items, open the todo list with the shared steps and the steps below copied verbatim, including their paragraphs, in execution order. Keep each unfinished step as `skip: <reason>`.

Every subagent uses the Session model unless the user set a model for that agent. Resolve the vstack root and the project Scratch dir once, as END-STATE.md says, and pass both to every subagent. This run keeps its notes and evidence under `<Scratch dir>/implement-spec/<run-id>/`.

Run shared steps 0a–0c once. 0a settles one End state for the whole spec. If the issue tracker closes work through PRs and 0a asks, say in its `ask` text that End state commit leaves those tickets open. 0b's branch is the integration branch. Every merge lands on it.

## Read the task graph

Read the spec and tickets to understand the task graph. List the ready frontier: the open tickets whose blockers are all resolved, by the tracker's blocking rules.

Read the spec's testing decisions. to-spec confirmed those seams with the user through `ask`, so they are the pre-agreed seams for skill://tdd. If a ready ticket needs a seam that the spec does not confirm, settle it with one `ask` before you assign the ticket. An answer `ask` picks after a timeout is not the user's, so that ticket stays off the frontier and stays open.

## Explore (optional)

Explore only when the tickets need codebase files or external documentation that they do not point at. This lets **implementer subagents** focus on implementation rather than exploration.

Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): read the spec and tickets, explore the code and documentation they need, save markdown notes under `<Scratch dir>/implement-spec/<run-id>/notes/`, and return each note path with a one-line gist, the user's override words, the vstack root, the Scratch dir. Wait for its result. If it cannot be spawned, do the work yourself.

Pass the note paths to every later implementer as context pointers.

## Check isolation

Before the first implementer, require `omp config get task.isolation.enabled` to print `true`. If isolation is off, stop and point at `/skill:setup-vstack`. A gate choosing inline does not bypass this prerequisite. If isolated workers cannot start, stop and report. Never replace a failed isolated batch with workers in the shared checkout.

## Implement the frontier

Keep the integration branch checked out in the parent checkout. omp clones each isolated worker from the parent's working tree, uncommitted changes included, so each implementer starts from the integration branch tip with every merged patch.

For two or more ready tickets, use the following block. Before this step, read skill://vstack-fan-out and run its gate on the block below.

Fan-out gate (skill://vstack-fan-out): parts: one per ready ticket; size: files the ticket touches and acceptance criteria per ticket.
- fan-out → one eval cell: per part, `agent(<prompt>, agent="vstack-worker", isolated=True, apply=False, merge=False)`; `wait()` on all handles. Each prompt: the implementer brief below for one ticket, the user's override words, the vstack root, the Scratch dir. Merge each `patchPath` onto the integration branch as Merge each patch says, one ticket at a time.
- inline → do every part yourself, in order, from the same brief.

For one ready ticket, use one isolated implementer without a Fan-out gate:

Spawn one `vstack-worker` via eval `agent(<prompt>, agent="vstack-worker", isolated=True, apply=False, merge=False)`: the implementer brief below for that ticket, the user's override words, the vstack root, the Scratch dir. Wait for its result. If it cannot be spawned, stop: implement-spec needs isolated implementers; run `/skill:setup-vstack`.

Implementer brief: build one ticket in your own clone. Read the spec, the ticket, and the exploration notes through their context pointers. Use skill://tdd to build the ticket at the seams the spec and this brief confirm. The user confirmed them, so tdd asks nothing about them. If the ticket needs another seam, write no test for it, and return the seam as an open question. Run typechecking and the single test files you touch regularly, and the full test suite once at the end. Write product changes at real target paths, so that they enter the patch. Commit nothing and push nothing. When tdd stops a slice for missing red evidence, keep its changes and list its paths and hunks. Save evidence under `<Scratch dir>/implement-spec/<run-id>/<ticket>/`. Return the ticket, changed paths, red and green evidence, checks with their outcomes, stopped slices with the missing red evidence, and open questions.

When the gate chooses inline, build each ticket yourself in the parent checkout, in order, from the same brief. Finish and check one ticket before you start the next. Your changes land on the integration branch directly, so there is no patch to merge.

## Merge each patch

Pair handles and results in input order. A handle has no `patchPath` field. Recover that path from omp's completion notice: `Isolation: changes captured at <absolute patch path> (apply=false). Not applied.` If structured output hides the notice, read the full completion through the handle's `output()` or `agent://<id>`. A failed worker, an unavailable notice, or an empty patch leaves its ticket open. Report it, and never guess a patch path.

Read each patch before you merge it, and confirm that it holds only its ticket's work. Apply the patches to the integration branch one ticket at a time with `git apply -- "<patchPath>"`. If a patch does not apply because the integration branch moved on its paths, do not force it. Put its ticket back on the frontier once, for a new implementer from the current tip.

A worker that returns an open question leaves its ticket open. After the wave, put each question to the user through `ask`. A ticket whose question the user answers goes back on the frontier once, with the answer in its brief. A timed-out answer leaves the ticket open.

A merged ticket with no stopped slice is done for the frontier. A stopped slice keeps its hunks uncommitted, keeps its ticket open, and caps the End state at commit, so an unproven fix never reaches a PR. Record each ticket's changed paths, stopped slices, and patch path in the run record.

## Recompute the frontier

After each wave's merges, recompute the frontier. A ticket is ready when every blocker is merged with no stopped slice. A ticket that already failed in this run is not ready again: a failed worker, a missing or empty patch, a stopped slice, a second patch that does not apply, or a second open question. Only the two once-only returns in Merge each patch put a ticket back. Run the Implement the frontier step again on the new frontier. Repeat until no ticket is ready. Report each ticket that stays open, with its reason: a failed worker, a missing patch, a stopped slice, an unanswered question, or an open blocker.

## Review, commit, and close

After the last wave, run shared step 3b, then shared step 4. Run shared step 5 once, before shared step 6 (Matt's order). It runs skill://code-review over the whole integration-branch diff from the base SHA. Fix every accepted finding before the commit. With no accepted finding, skip the fixer below.

Spawn one `vstack-worker` via `task` (`agent: "vstack-worker"`): fix every accepted review finding in the parent checkout from the review's findings and the integration branch tip, with skill://tdd at the seams the spec confirms where a fix changes behavior, and return changed paths, checks with their outcomes, and any new seam as an open question, the user's override words, the vstack root, the Scratch dir. Wait for its result. If it cannot be spawned, do the work yourself.

Update the affected checks and live proof. Then run shared step 6. Its commit body names each merged ticket.

After shared step 6, resolve each merged ticket with no stopped slice the way the issue tracker closes work. The spec is done only when every one of its tickets is done: merged in this run with no stopped slice, or closed before this run. Resolve a done spec the same way. A ticket that stays open keeps the spec open. If the tracker closes work through PRs, pass those tickets to open-pr in shared step 7 as the PR's closing references instead, and add the spec only when it is done. At End state commit, those tickets and the spec stay open. Then run shared step 7 once, up to the settled or capped End state. It opens the one PR, ready for review.

Leave the worker patches in omp's artifacts directory, add no cleanup step, and cite their paths.

## Reply

Report the requested and reached End state, the integration branch, commits, PR URLs and observed status, each ticket's outcome (resolved, open with its reason, or closing through the PR), the spec's outcome (resolved, closing through the PR, or open with the tickets that keep it open), checks and live proof with evidence paths, Safety findings, open prune-comments work, stopped slices with missing red evidence, worker patch paths, and every skipped step or blocker. If a decision-trail is open, include its log and Attention result. Do not claim a PR, readiness, merge, or closed ticket that the chain did not observe.

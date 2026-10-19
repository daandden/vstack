---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

# Implement

Read [END-STATE.md](END-STATE.md) before work. It owns the shared steps 0a–0c, 3b, and 4–7, also used by hillclimb. Run them at the points below, not as a separate invocation per ticket.

Before task-specific items, open the todo list with the shared steps and steps 1–3 below copied verbatim, including their paragraphs, in execution order. Keep each unfinished step as `skip: <reason>`.

Run shared steps 0a–0c once.

## 1. Implement

Implement the work described by the user in the spec or tickets.

## 2. Use tdd

Use skill://tdd where possible, at pre-agreed seams.

When tdd stops a slice for missing red evidence, leave that slice's changes uncommitted in the working tree and continue independent slices. Track the stopped paths and hunks so accepted work can be staged separately. Cap the End state at commit: an unproven fix never reaches a PR. Report each stopped slice, the missing red evidence, and why it is missing. If stopped and accepted hunks cannot be separated safely, leave that dependent work uncommitted too.

## 3. Run checks

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

After all tickets and independent slices are finished, run shared step 3b, then step 4. Run shared step 5 once over the whole completed diff, before step 6 (Matt's order). Commit only accepted, proven work in step 6. Run step 7 once for the invocation, up to the settled or capped End state.

## Reply

Print the flow's page path first. Then report the requested and reached End state, commits, PR URLs and observed status, checks and live proof with evidence paths, Safety findings, open prune-comments work, stopped slices with missing red evidence, and every skipped step or blocker. If a decision-trail is open, include its log and Attention result. Do not claim a PR, readiness, or merge that the chain did not observe.

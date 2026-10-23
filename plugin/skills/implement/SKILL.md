---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

# Implement

Read [END-STATE.md](END-STATE.md) before work. It owns the shared steps 0a–0b, 3b, and 4–7, also used by hillclimb. Run them at the points below, not as a separate invocation per ticket.

Before task-specific items, open the todo list as END-STATE.md says, with the shared steps and steps 1–3 below as `local` steps.

Run shared steps 0a–0b once.

## 1. Implement

Implement the work described by the user in the spec or tickets.

## 2. Use tdd

Use skill://tdd where possible, at pre-agreed seams.

## 3. Run checks

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

After all tickets and independent slices are finished, run shared step 3b, then step 4. Run shared step 5 once over the whole completed diff, before step 6 (Matt's order). Commit only accepted, proven work in step 6. Run step 7 once for the invocation, up to the settled or capped End state.

## Reply

Print the flow's page path first. Then report the requested and reached End state, commits, PR URLs and observed status, checks and live proof with evidence paths, Blast radius findings, open prune-comments work, and every skipped step or blocker. Do not claim a PR, readiness, or merge that the chain did not observe.

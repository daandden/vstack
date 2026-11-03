---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

# Implement

Read [END-STATE.md](END-STATE.md) before work. It owns the shared steps 0a–0b, 3b, 4–6, 6b, and 7, also used by hillclimb and tune-llm-flow. Run them at the points below, not as a separate invocation per ticket.

When the gathered task intent calls for sustained, measured improvement of an app's LLM-flow quality, cost, or latency, read skill://tune-llm-flow and reuse the setup contract in the source. Keep the run-start `inject_principles` call; the contract carries task facts, not stored Addon picks.

Before task-specific items, open the todo list as END-STATE.md says, with the shared steps and steps 1–3 below as `local` steps.

Run shared steps 0a–0b once.

## Work within the agreement

Read the supplied spec and tickets, including their context pointers, testing decisions, and decision-coverage records. Carry their agreed responsibilities, interactions, observable guarantees, constraints, and rationale into each slice. Use the existing inputs; a separate Architecture brief is not a prerequisite. Build sessions select Addons fresh rather than inheriting Addon pointers from those inputs.

Choose signatures, local types, private decomposition, file layout, and ordinary algorithms within that agreement. A parameter adjustment or private helper extraction needs no new architecture approval when it preserves the agreed behavior. Judge consequences, not signatures or visibility: a matching provider interface can still change residency, security, durability, or failure guarantees.

If repository evidence shows that a slice requires a consequential departure from an agreed responsibility, contract, or guarantee, pause the affected work. Record the governing decision, evidence, affected behavior, viable options with trade-offs and a recommendation, and the missing decision as an open question. In a direct run, use ordinary `ask` in the existing Stage under `skill://flow-page`'s "Every ask in a Flow" contract, including CLI publication, verified live content, a visible chat URL, and separate answer recording. In a subagent, return it to the orchestrator with the held work and evidence paths. Preserve useful partial work, but commit no affected slice and claim no completed delivery while its decision is unresolved.

Resume affected work only after the user's own answer resolves the departure. A recommendation, Headless automatic pick, timeout, cancellation, or absent answer is not approval. Keep unresolved questions and held work visible in the existing run record and reply. Reuse agreed test seams; architecture preservation does not reopen them or authorize tests at a new, unconfirmed seam.

## 1. Settle the seams

Before the first code change, settle the seams that skill://tdd tests at. Reuse each agreed seam: one that the spec's testing decisions name, one that the ticket's own text names, or one that the user picked through `ask` in a seam question on the Flow page. Only the user's own pick of a seam agrees it. A headless answer, an unanswered or timed-out question, and a no-test pick leave the seam open. Ask tdd's seam question once through `ask` under `skill://flow-page`'s "Every ask in a Flow" contract, including its pre-ask live chat link. Author one question covering every slice with no agreed seam in implement's Stage.

## 2. Red then green per slice

Implement the work described by the user in the spec or tickets, one slice at a time through skill://tdd. Each slice goes red at its seam before its first code change, then gets only the code that turns it green. Build a slice with no confirmed seam without a test, and name its missing red evidence in the reply.

Publish each slice's red and green commands, observed outcomes, and captured proof through END-STATE.md's "Publish delivery progress". Prose-only work may have no meaningful failing behavior test; state that limit instead of adding guidance-string assertions. Keep the slice task active until its actual completion criterion holds.

## 3. Run checks

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

After all tickets and independent slices are finished, run shared step 3b, then step 4. Run shared step 5 once over the whole completed diff, before step 6 (Matt's order). Commit only accepted, checked work in step 6. Run step 6b on the committed head, then step 7 once for the invocation, up to the settled or capped End state.

## Reply

Report the requested and reached End state, commits, PR URLs and observed status, development checks with evidence paths, each accepted Verdict with its verifier identity, patch id, and evidence paths, Blast radius findings, open prune-comments work, and every skipped step or blocker. Do not claim a PR, readiness, merge, or End state that the chain did not observe.

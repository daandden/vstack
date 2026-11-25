---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user through `ask`, following flow-page's "Every ask in a Flow" contract when enrolled, until you reach a shared understanding. Map a design tree: every decision branches into the decisions that depend on it. Work in rounds. The frontier contains every decision whose prerequisites are settled. A question that depends on an open decision waits for a later round.

Word each question so that "yes" accepts the recommended answer. Keep the actual picker options explicit.

Follow `skill://flow-page`'s "Stage entry/exit line" for a grilling run. When a producer uses this reference only as its interviewing procedure, its own run owns the decisions and close.

## Find facts

Facts from files and tools are your job, not the user's. Resolve the vstack root using the project mode before assigning exploration. A running exploration is an unsettled prerequisite: only its downstream decisions wait; the rest of the frontier proceeds.

Give each fact explorer a fresh context window with its fact question and relevant context pointers.

Apply this principle to options in Flow and chat rounds. Present material trade-offs accurately and concretely. When a cost matters to the decision and can be estimated, state its approximate size in appropriate units. If it cannot be estimated, say so. Include significant costs carried over from earlier decisions when they affect the option.

For CSS audits or planning, read skill://good-css before gathering findings. Pass that CSS requirement in delegated exploration briefs. Keep source analysis read-only, separate defects from additive opportunities and rejected candidates, and use this owner's existing Flow round for explicit selection. Headless recommendations never authorize a selected change.

Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): find the environment fact needed by the frontier question and return evidence and open questions, the vstack root. Do not wait; keep working. If it cannot be spawned, stop: the decisions that depend on the fact stay open.

For two or more independent explorations, use this Fan-out line instead of repeated single calls:

Before this step, read skill://vstack-fan-out.

Fan-out (skill://vstack-fan-out): parts: one per independent fact question. One `task` call; `tasks[]` has one item per part, each with `agent: "vstack-explorer"`. Each `task`: find the fact, return evidence and open questions without edits, the vstack root. Do not wait; keep working. If they cannot start, stop: the decisions that depend on those facts stay open.

## Settle or ask

Apply the [Settle-or-ask test](../../rules/vstack-settle-or-ask.md) to each frontier decision. Record each Assumed pick with its reason. A note, Other text, or pushback can reopen a named pick even when the same response settles a different decision.

When the user corrects a design or visual you showed, use the shared rule's correction path. In a Flow, show the revised work through skill://flow-page's Result procedure and publish the `assumed` item with the instruction as its basis. In chat, show the revision and list the Assumed pick with its reason. If the remaining choice needs `ask`, put only that choice in the next question. Preserve any separately required answer. A correction in a note or composer message does not answer an open picker.

## Each round in a Flow

1. Prepare the newly settled `assumed` items followed by one complete `round` for the remaining questions. Each carries its Decision brief and any required visuals. If the whole frontier is settled without questions, submit only the Assumed items and recompute the frontier.
2. Publish and ask through `skill://flow-page`'s "Every ask in a Flow" contract. Wait for the response before advancing dependent decisions.
3. Record an `answer` for each question through that common contract, preserving the user's words separately from your interpretation:
   - Preserve cancellations, timeouts, empty and headless responses, including any automatic picks, as non-consent. Their decisions remain open.
   - An explicit pick settles its decision. A note beside a pick does not undo it; reply to the note in a Document Result or open a new frontier question when needed.
   - Words with no pick that plainly settle the decision get a resolved reading with its decision and basis, and `maps_to` only when they match an option. Preserve the user's words without inventing a pick or asking a settled decision again.
   - A question, concern, or ambiguous note gets its corresponding unresolved reading. Preserve the raw response and the reading separately. Reply in a Document Result and apply the [Settle-or-ask test](../../rules/vstack-settle-or-ask.md) before any `again` round. Record what the evidence settles as Assumed. Ask only about what the evidence leaves open and the test still permits. Use `again` to link that question to the earlier attempt. Explain what remains open in the Decision brief. The earlier answer and Q number stay intact.

   Recompute the frontier from explicit picks, resolved readings, and Assumed picks that still stand.

Outside a Flow, present newly settled decisions and the full context for the remaining frontier in chat, then use one plain `ask` for the round. Preserve the user's words and distinguish explicit picks, resolved readings, and unresolved concerns as above, without page records. Apply the same test before asking again. Recompute the frontier from explicit picks, resolved readings, and Assumed picks that still stand.

## Close

An empty frontier means every branch was visited and no decision remains silently assumed. Each one was asked or is Assumed in the open. In a Flow, follow flow-page's "Close the Stage" for the summary. Outside a Flow, give the complete summary and standing Assumed picks in chat. The close asks nothing. Follow the producer's own close steps, including any explicit same-turn continuation.

By default, the turn ends after the summary and the user's next prompt confirms it or pushes back. grill-me keeps this summary-only close and never chains. A pushback reopens the named decisions. In a Flow, open a new Stage with `--parent` when the earlier Stage is finished, and use `again` for its named questions or `reopens` for its Assumed picks. Keep the earlier record intact. grill-with-docs owns its same-turn to-spec continuation under ADR 0067. wayfinder and triage own their same-run writes under ADR 0068 and ADR 0061 respectively, including their unanswered and headless guards. Other callers that act after the grill still wait for a next prompt to confirm the summary. Finishing a Stage is not authorization.

When publication or `ask` is unavailable in a Flow, preserve the actual receipt and error. Apply the own-run recovery rule before stopping, with one retry for an infrastructure failure this run owns. A question the picker lost or never showed qualifies; a recorded cancellation, timeout, or empty response follows flow-page's existing re-ask rules instead. While an answer is pending, wait. If recovery needs shared-state changes, would weaken proof, or fails, report what was tried and stop actions that need user confirmation. Host unavailability follows flow-page's warn-and-open question contract; only an observed user answer grants consent. Leave recoverable work in progress until it completes or is deliberately abandoned. In a headless run, record any substituted recommendation as headless non-consent, not as the user's answer. In a Flow, use `response: { status: "headless", picks: [...] }`, add "Headless, not user-confirmed" to the close's `extra`, and finish with a `retire` reason for each unresolved question. Outside a Flow, state "Headless, not user-confirmed" and name every unresolved question in chat. Report each action not taken. A subagent returns open decisions to the top-level agent and never claims user confirmation.

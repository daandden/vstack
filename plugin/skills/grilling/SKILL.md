---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user through `ask`, following flow-page's "Every ask in a Flow" contract when enrolled, until you reach a shared understanding. Map a design tree: every decision branches into the decisions that depend on it. Work in rounds. The frontier contains every decision whose prerequisites are settled. A question that depends on an open decision waits for a later round.

Follow `skill://flow-page`'s "Stage entry/exit line" for a grilling run. When a producer uses this reference only as its interviewing procedure, its own run owns the decisions and close.

## Find facts

Facts from files and tools are your job, not the user's. Resolve the vstack root using the project mode before assigning exploration. A running exploration is an unsettled prerequisite: only its downstream decisions wait; the rest of the frontier proceeds.

Apply this principle to options in Flow and chat rounds. Present material trade-offs accurately and concretely. When a cost matters to the decision and can be estimated, state its approximate size in appropriate units. If it cannot be estimated, say so. Include significant costs carried over from earlier decisions when they affect the option.

For frontend motion audits or planning, read skill://good-css and its conditional audit references before gathering findings. Pass that requirement in delegated frontend exploration briefs. Keep source analysis read-only, separate defects from additive opportunities and rejected candidates, and use this owner's existing Flow round for explicit selection. Headless recommendations never authorize a selected change.

Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): find the environment fact needed by the frontier question and return evidence and open questions, the vstack root. Do not wait; keep working. If it cannot be spawned, stop: the decisions that depend on the fact stay open.

For two or more independent explorations, use this Fan-out line instead of repeated single calls:

Before this step, read skill://vstack-fan-out.

Fan-out (skill://vstack-fan-out): parts: one per independent fact question. One `task` call; `tasks[]` has one item per part, each with `agent: "vstack-explorer"`. Each `task`: find the fact, return evidence and open questions without edits, the vstack root. Do not wait; keep working. If they cannot start, stop: the decisions that depend on those facts stay open.

## Settle or ask

Settle frontier decisions on the Bookkeeping list without asking or requiring a cited repo fact (ADR 0067):

- Behavior-preserving refactors and cleanup, including removing code proven unused, merging duplicate instructions, and choosing not to merge look-alike code. Behavior, public contracts, scope, and proof must stay the same.
- Recording a decision the user already made as an ADR, including its placement and supersession links. Recording never settles a new fallback, guarantee, or policy.
- Carrying settled terms into the glossary and reusing existing definitions. Ask about a new product concept or a preferred public name.

Internal names, file locations, and investigation order are not on the Bookkeeping list. For every other frontier decision, settle it yourself only when all three of ADR 0037's conditions hold:

- A later edit can undo it, with no migration and no change to published text.
- It is not a matter of the user's taste. Names, wording, and looks are always the user's.
- Its pick follows from a repo fact, an ADR, or a convention that you cite.

Ask every other decision, including one where any of the three is in doubt.

Record each settled decision with its decision, pick, and why. For a Bookkeeping-list pick, give its kind and reason. For a pick under the three-part test, cite its repo fact with file and line, ADR, or convention. In a Flow, put it as an `assumed` item before the round in the contribution. Code owns the Assumed list and includes its current picks in the close. Outside a Flow, show the Assumed list in chat before asking.

A note, Other text, or pushback that names an Assumed decision reopens it, whatever else the answer picks. Ask it in the next round. In a Flow, use `reopens` naming the Assumed item's id. Code links the records and removes that pick from the current Assumed list.

## Each round in a Flow

1. Prepare the newly settled `assumed` items followed by one complete `round` containing every other frontier decision and its visuals. If the whole frontier is settled without questions, submit only the Assumed items and recompute the frontier.
2. Publish that complete contribution through the Flow CLI and call `ask` with the receipt's generated questions under flow-page's "Every ask in a Flow" contract. Wait for the response before advancing dependent decisions.
3. Record an `answer` for each question through that common contract, preserving the user's words separately from your interpretation:
   - Preserve cancellations, timeouts, empty and headless responses, including any automatic picks, as non-consent. Their decisions remain open.
   - An explicit pick settles its decision. A note beside a pick does not undo it; reply to the note in a Document Result or open a new frontier question when needed.
   - Words with no pick that plainly settle the decision get a resolved reading with its decision and basis, and `maps_to` only when they match an option. Preserve the user's words without inventing a pick or asking a settled decision again.
   - A question, concern, or ambiguous note gets its corresponding unresolved reading. Reply in a Document Result and ask the still-open part next round with `again` naming the earlier question. Code preserves the earlier answer and Q number.

   Recompute the frontier from explicit picks and resolved readings only.

Outside a Flow, present newly settled decisions and the full context for the remaining frontier in chat, then use one plain `ask` for the round. Preserve the user's words and distinguish explicit picks, resolved readings, and unresolved concerns as above, without page records. Recompute the frontier from explicit picks and resolved readings only.

## Close

An empty frontier means every branch was visited and no decision remains silently assumed. Each one was asked or is Assumed in the open. In a Flow, follow flow-page's "Close the Stage" for the summary. Outside a Flow, give the complete summary and standing Assumed picks in chat. The close asks nothing. Follow the producer's own close steps, including any explicit same-turn continuation.

By default, the turn ends after the summary and the user's next prompt confirms it or pushes back. grill-me keeps this summary-only close and never chains. A pushback reopens the named decisions. In a Flow, open a new Stage with `--parent` when the earlier Stage is finished, and use `again` for its named questions or `reopens` for its Assumed picks. Keep the earlier record intact. grill-with-docs owns its same-turn to-spec continuation under ADR 0065. wayfinder and triage own their same-run writes under ADR 0066 and ADR 0061 respectively, including their unanswered and headless guards. Other callers that act after the grill still wait for a next prompt to confirm the summary. Finishing a Stage is not authorization.

When publication or `ask` is unavailable in a Flow, preserve the actual receipt and error. Apply the own-run recovery rule before stopping, with one retry for an infrastructure failure this run owns. A question the picker lost or never showed qualifies; a recorded cancellation, timeout, or empty response follows flow-page's existing re-ask rules instead. While an answer is pending, wait. If recovery needs shared-state changes, would weaken proof, or fails, report what was tried and stop actions that need user confirmation. Host unavailability follows flow-page's warn-and-open question contract; only an observed user answer grants consent. Leave recoverable work in progress until it completes or is deliberately abandoned. In a headless run, record any substituted recommendation as headless non-consent, not as the user's answer. In a Flow, use `response: { status: "headless", picks: [...] }`, add "Headless, not user-confirmed" to the close's `extra`, and finish with a `retire` reason for each unresolved question. Outside a Flow, state "Headless, not user-confirmed" and name every unresolved question in chat. Report each action not taken. A subagent returns open decisions to the top-level agent and never claims user confirmation.

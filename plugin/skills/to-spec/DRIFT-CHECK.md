# Drift check

to-spec, to-tickets, and wayfinder check their draft against what the user decided before they publish it or show it. Each caller names its source, its draft, what Covered in names, and its Stage, and starts the checker, a `vstack-explorer`, with the single-subagent line in its own SKILL.md. Wayfinder adds its map checks from skill://wayfinder/references/drift-check.md.

## Collect the decisions

For a source Flow, use `flow-page show` to collect the latest close decisions and unreopened Assumed picks. Otherwise collect decisions from the conversation and supplied sources. Keep each decision's provenance and earlier versions. A pick or resolved reading is a user's decision. A timeout, cancellation, empty or headless response gives no consent. A close does not confirm its unresolved decisions. Carry open requirements as questions or publication limits. Cover Assumed picks as assumptions, not user answers.

## Checker brief

The caller passes this brief to the checker with the close decisions, the Assumed picks, the source, and the draft:

Compare the draft with each close decision, each Assumed pick, and each requirement of the source. Return a coverage table with one row per decision, Assumed pick, or requirement. Each row names the part of the draft that covers it, or the miss or contradiction. Mark each Assumed row "Assumed:". For each potential decision conflict, return the conflicting sources, their provenance, and the affected text to the caller. Never ask the user.

### Ticket acceptance check

When the draft is an implementation-ticket breakdown, also trace every acceptance criterion's prerequisites independently of the author's trace. Include unresolved human decisions, shared fixtures, and capabilities that the criterion's consumer needs. Full requirement coverage alone does not establish that a ticket can satisfy its acceptance.

Return an acceptance prerequisite table with columns Ticket, Criterion, Prerequisite, Supplied by, Blocking path, and Found. Name the affected criterion and concrete prerequisite in every finding. Keep each decision's identity, raw answer, separate reading, and unresolved or Assumed status. For a criterion without external prerequisites, record why its own work is sufficient.

For each prerequisite, identify existing evidence, work the ticket can complete before satisfying the criterion, or the ticket that supplies it. Compare required providers with the declared blocking graph. A direct or transitive path from the consumer through `blockedBy` to its provider is sufficient. Parent membership, coverage references, and explanatory body links are not blocking edges. An existing prerequisite needs evidence of its availability, not a new ticket.

Flag a missing blocking path, an unowned or unavailable fixture or capability, and a decision assigned downstream of the criterion that needs it. Check both declared graph cycles and cycles introduced by the required acceptance prerequisites. Show the path that makes acceptance circular. Do not repair a downstream prerequisite by adding a reverse edge that creates a cycle. Reorder or split the work instead.

An upstream ticket may own obtaining a still-needed human answer, but assigning that work does not settle the answer. Refuse a breakdown that relies on an unresolved choice as though it were confirmed. Do not invent the choice, a fixture, or a consumer capability to make the graph pass.

## Fix and show

1. Fix omissions and contradictions the sources settle. Use the current decision where its provenance supersedes an earlier answer or Assumed pick. Apply the [Settle-or-ask test](../../rules/vstack-settle-or-ask.md) to any remaining conflict. A checker finding is not itself a question.
2. For a conflict that still needs a user decision, hold the affected work and put only the unresolved choice to the user. In to-spec, use [Consequential gaps](SKILL.md#consequential-gaps) for a consequential architecture gap. Otherwise use `ask` under skill://flow-page's "Every ask in a Flow" contract when enrolled, or plain `ask` in chat. Preserve the raw answer and separate reading. Do not treat a recommendation as a resolution. If the user names an Assumed pick to reopen, follow the shared rule's reopen path for that pick alone.
3. Submit the coverage table as a table Result on the caller's Stage, with the columns Decision, Covered in, and Found and one row per checker row. Decision names the close decision, Assumed pick, or source requirement, preserving its provenance. Covered in names the part of the draft that covers it after your fixes. Found names the miss or contradiction that you fixed, or "None".
4. For an implementation-ticket breakdown, fix every acceptance prerequisite finding and recheck the corrected draft with the same independent checker. Publish its acceptance prerequisite table beside the coverage table, retaining the original findings and the fixes. Continue only when every criterion can be satisfied by its own work, evidenced existing inputs, and declared blockers. Keep any human answer still needed explicit.

If the checker does not start, stop as the caller's SKILL.md says. Do not publish the deliverable or show it as checked. The caller governs blocker evidence and any clearly marked unpublished draft. After the applicable checks and fixes, the caller goes on to publish or show the checked draft.

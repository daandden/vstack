# Drift check

to-spec and to-tickets check their draft against what the user decided before they publish it or show it. Each caller names its source, its draft, what Covered in names, and its Stage, and starts the checker, a `vstack-explorer`, with the single-subagent line in its own SKILL.md.

## Collect the decisions

Read the Flow through `flow-page show`. Collect the latest close decisions and unreopened Assumed picks, keeping each decision's provenance and earlier versions available. A pick or resolved reading is a user's decision; a timeout, cancellation, empty or headless response is not. A close does not make its unresolved decisions confirmed. Carry unresolved requirements as open questions or explicit publication limits, never as consent. Cover Assumed picks as visible assumptions, not user answers.

## Checker brief

The caller passes this brief to the checker with the close decisions, the Assumed picks, the source, and the draft:

Compare the draft with each close decision, each Assumed pick, and each requirement of the source. Return a coverage table with one row per decision, Assumed pick, or requirement. Each row names the part of the draft that covers it, or the miss or contradiction. Mark each Assumed row "Assumed:". Return each conflict between two decisions as an open question. Never ask the user.

## Fix and show

1. Fix every miss and contradiction in the draft.
2. If the checker returns a conflict between two decisions, put it to the user through `ask` following `skill://flow-page`'s "Every ask in a Flow", preserving the raw answer and separate reading. Fix the draft only to an explicit pick or resolved reading.
3. Submit the coverage table as a table Result on the caller's Stage, with the columns Decision, Covered in, and Found and one row per checker row. Decision names the close decision, Assumed pick, or source requirement, preserving its provenance. Covered in names the part of the draft that covers it after your fixes. Found names the miss or contradiction that you fixed, or "None".

If the checker does not start, the caller stops as its SKILL.md says, and nothing is published. After step 3, the caller goes on to publish or show the draft.

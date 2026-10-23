# Drift check

to-spec and to-tickets check their draft against what the user decided before they publish it or show it. Each caller names its source, its draft, what Covered in names, and its Stage, and starts the checker, a `vstack-explorer`, with the single-subagent line in its own SKILL.md.

## Collect the decisions

On the flow's Grilling page, read every `close` record. Collect each entry of its `decisions` and each `extra` bullet that starts with "Assumed:". An Assumed bullet is a pick that the grill settled in the open without asking, and the draft must cover it like an asked decision. A close of a Stage that asked nothing has an empty `decisions` list and only Assumed bullets.

## Checker brief

The caller passes this brief to the checker with the close decisions, the Assumed picks, the source, and the draft:

Compare the draft with each close decision, each Assumed pick, and each requirement of the source. Return a coverage table with one row per decision, Assumed pick, or requirement. Each row names the part of the draft that covers it, or the miss or contradiction. Mark each Assumed row "Assumed:". Return each conflict between two decisions as an open question. Never ask the user.

## Fix and show

1. Fix every miss and contradiction in the draft.
2. If the checker returns a conflict between two decisions, put it to the user through `ask` as a question on the page, as grilling-page's "Every ask in a flow" says. Fix the draft to the answer.
3. Append the coverage table as a table Report block on the caller's Stage, with the columns Decision, Covered in, and Found and one row per checker row. Decision names the close decision, the Assumed pick, or the source requirement. Covered in names the part of the draft that covers it after your fixes. Found names the miss or contradiction that you fixed, or "None".

If the checker does not start, the caller stops as its SKILL.md says, and nothing is published. After step 3, the caller goes on to publish or show the draft.

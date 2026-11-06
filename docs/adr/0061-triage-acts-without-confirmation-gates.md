# Triage acts without confirmation gates

> This amends [ADR 0032](0032-the-grill-closes-with-its-summary-and-no-ask.md) for triage only. The grill still closes with its summary and no `ask`, and wayfinder and other grill callers still wait for the user's next prompt.

triage decides the category and state roles itself, enters grilling without asking when an item needs it, and writes its outcome to the tracker in the same turn as the grill's close, or as soon as it has no grill to run. That outcome includes labels, comments, agent briefs, and `wontfix` closes. Only a rejected enhancement also gets an `.out-of-scope/` record. A rejected bug or an already-implemented request gets none, as `triage/OUT-OF-SCOPE.md` says, so rejection matching sees only real rejections. The user wanted triage with less friction: a wait for the next prompt cost a turn on every triaged item, and a label, comment, or close on the tracker is quick to correct.

Two human checks remain. The grill's own questions need the user's answers: when one stays unanswered after its single re-ask, or the run is headless, triage writes nothing from that grill and reports the open questions. Reconsidering an earlier `.out-of-scope/` rejection still asks, because it reverses what the project decided against. Confirming such a match or judging the items distinct does not ask.

## Considered Options

- Keep ADR 0032's next-prompt wait for triage. A pushback before the write costs nothing to undo, but the user answers a gate on every item, even when the summary is what they expected.
- Keep a check before `wontfix` only. Rejections stay human, but the user wanted no gate there.
- Post the grill's recommended picks when its questions go unanswered. Every item would finish in one run, but a public comment would rest on picks nobody confirmed.

## Consequences

- A pushback on the summary now means correcting the tracker: relabeling, editing or adding a comment, or reopening the item.
- Discovery still lets the user pick which item to work on. Picking work is not a confirmation gate.
- A quick state override applies the role at once. Moving to `ready-for-agent` without a grill writes the agent brief.
- Conflicting state roles and unusual transitions are decided by triage, which explains the choice in its comment.
- Every tracker comment keeps the AI disclaimer.

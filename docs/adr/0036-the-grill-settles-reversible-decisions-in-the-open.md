# The grill settles reversible decisions in the open

> This refines how grilling treats decisions. It does not reopen [ADR 0032](0032-the-grill-closes-with-its-summary-and-no-ask.md): the grill still closes with its summary and no `ask`.

grilling settles a frontier decision itself only when all three hold: a later edit can undo it with no migration and no change to published text, it is not a matter of the user's taste (names, wording, looks), and its pick follows from a repo fact, an ADR, or a convention that the agent cites. It asks every other decision. The settled decisions are Assumed. They go in a table Report block on the running Stage with the columns Decision, Pick, and Why, appended before the round's `ask` and again whenever a decision is added or reopened. A note, Other text, or pushback that names an Assumed decision reopens it as a normal question in the next round. The close lists every Assumed pick that still stands, so no decision remains silently assumed: each one is assumed in the open. We chose this because grills asked every decision they found, up to 26 questions on one page, including ones whose recommended answer was plainly right, and the user wants their attention spent on decisions that are costly to undo or theirs to make.

## Considered Options

- Keep asking every decision. Nothing is decided out of the user's sight, but the user answers questions whose answer the repo already gives.
- Settle what the agent is at least 90% sure the user would pick. This cuts the most questions, but confidence is not checkable, and taste calls slip through.
- Settle only what an ADR or written convention already answers. This is the safest rule, but it cuts few questions.

## Consequences

- The close's `decisions` keep one entry per asked Q number. The Grilling page has no new record kind: the Assumed list is a table Report block, and each standing Assumed pick is an `extra` bullet of the close record.
- A reopened decision's row stays in the Assumed block and links to the question that asks it again.
- ADR 0032 still holds: the user's next prompt confirms the summary, Assumed picks included, or pushes back, and a pushback can name an Assumed pick.
- A headless grill applies the same test. Its asked decisions take the recommended answer, as before.

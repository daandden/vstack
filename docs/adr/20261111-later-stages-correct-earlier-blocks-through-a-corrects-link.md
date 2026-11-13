# Later Stages correct earlier blocks through a corrects link

The user chose this in the `vstack-session-health-review-fa87f3` grill. A finished Stage takes no more content ([ADR 0047](0047-flow-questions-require-a-live-page-and-recoverable-stages.md)), so a wrong Result, Background, or answer reading stayed current on the page with nothing marking it. In about ten reviewed sessions corrections landed in separate Stages or could not be recorded, and in one an answer reading turned "possibly a technical shaft, not sure" into an authorization that the page could not withdraw.

A Correction is ordinary content that a later Stage publishes, such as a Result, a Background note, or a new answer reading, with a `corrects` link to the earlier block in the same contribution. Any authored block can be a target: Results and their entries, answer readings, Backgrounds, Topic notes, question context, and close decisions. The original stays as published, keeps its reading position, and shows a banner above it with the reason and a link to the Correction. The model derives both directions. One relation covers withdrawal too: a Correction can state that a claim is withdrawn and why.

A corrected answer reading becomes the current reading in Overview, `show`, and close summaries. The user's own words never change, and a correction never creates an answer or consent. A decision left unsettled is asked again with `again`. A later Correction of the same block replaces the earlier Correction's effect but not its record, and competing Corrections of one block are refused. A closed Flow is corrected by reopening it, as today.

Reader comments are not Corrections: readers write them, they change no authored content ([ADR 0073](0073-reader-comments-are-saved-to-the-flow-and-never-answer.md)).

## Alternatives rejected

- Corrections only through replacement Results. An answer reading or a Background is not a Result.
- A self-contained correction item with its own replacement text. It would need its own copy of every Result shape or stay plain text.
- Reopen finished Stages for revision. It breaks the guarantee that a finished Stage's record never changes.
- A separate `retracts` relation. No session needed withdrawal to look different from correction.
- Notice only, keeping the original reading current. Agents reading `show` could still act on a false authorization.
- Corrections on closed Flows without reopening. A closed Flow could change, and cleanup timing would need a new rule.

# grill-with-docs continues into to-spec without a typed start

> This amends [ADR 0032](0032-the-grill-closes-with-its-summary-and-no-ask.md), [ADR 0053](0053-architecture-agreement-belongs-in-the-grill.md), and [ADR 0063](0063-the-flow-page-shows-the-matt-flow-path-and-replies-name-no-next-skill.md).

In the 50 newest omp sessions that ran vstack, the user typed the next Matt skill by hand 41 times. After 24 of 31 grills, the next prompt was a build skill, usually with nothing else in it, and no session showed a pushback on the summary in that gap. Now, when grill-with-docs reaches shared understanding, it publishes its close, finishes its Stage, and runs to-spec in the same turn. It opens a to-spec Stage with `--parent` on the same Flow and calls `inject_addons` with to-spec's intent, because reading a skill inline gives no run-start Addon reminder. The chain stops once to-spec has published the spec. The user then starts implement or to-tickets. grill-me never chains, so a check or an open exploration runs on grill-me. When to-spec finds a consequential gap, it opens a nested grill-with-docs Stage, asks the gap's questions there, and resumes, instead of stopping for two typed restarts. The drift checks in to-spec and to-tickets stay.

## Considered Options

- The End state carries the Flow from the grill to delivery. It removes every typed hop, but the user wanted to choose implement or to-tickets after seeing the spec.
- The grill asks how far to go once in its first round, or ends with one Build it ask. Both keep a question that the user answered the same way almost every time, and a closing ask waits a median 6 minutes for the user.
- The agent picks the one-session or spec path by size. The user chose one path after grill-with-docs: always a spec.
- The extension starts to-spec through `session_stop` or `sendUserMessage`. In omp 18.18.3, `sendUserMessage` does not expand slash commands, so it cannot replay a typed skill start, and the chain has only one hop.

## Consequences

- The user gets no turn to read the summary before the spec is published. A pushback reopens the grill, and to-spec's next revision follows it.
- Every change that starts with grill-with-docs gets a spec. A one-session change goes from that spec to implement.
- Addon dedup stays session-wide, so Addons that the grill already received are not selected again for to-spec.
- The Matt flow glossary entry changes to match.

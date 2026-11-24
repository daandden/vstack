# Flow questions require a Decision brief

The user chose this in the `flow-page-decision-context-243080` interview on 2026-11-23, in Grill with docs Q2 and Domain modeling Q1. It amends [ADR 0042](0042-every-grilling-question-declares-its-reader-needs.md) and [ADR 0044](0044-structured-flow-data-drives-server-rendered-pages.md). These are accepted design decisions, not a claim that the implementation is complete.

The user runs several vstack tasks at once and reaches each question cold from the Flow panel. On a 34-Stage Flow, no question said where the work stood, why it was asked or asked again, what the agent would pick, or what the answer would unblock, so the user asked the agent in a `/btw` side chat. Every new question now carries a Decision brief as typed fields: where the run stands, a reason with every re-ask, exactly one of a recommendation or a reason for none, and what the answer unblocks and how it can be undone. `validate` and `submit` refuse a new question without them and commit nothing. The reader shows the brief as labelled lines under the question title. Questions stored earlier stay readable with no brief, and none is invented for them.

## Considered Options

- **A convention in the first paragraph of `description`.** All 15 GPT reviewers preferred it for needing no schema change. The reader cannot find or label those lines, and nothing stops an agent from skipping them. ADR 0042 recorded that failure: guidance in context was skipped and only a refusal held.
- **The same typed fields, optional.** Labelled when present, but an agent can still skip them.

## Consequences

- Every skill that asks in a Flow writes the brief, and their references change in the same cutover.
- Reader needs stay required at publication, but the page stops showing them (ADR 20261123-the-flow-page-leads-with-the-open-decision).

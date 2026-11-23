# Flow records native ask values as submitted

[tern-plugins retired its custom Picker](https://github.com/daandden/tern-plugins/issues/35). Native omp `ask` can return the same value when the user selects a listed option or types its exact value into Other. In the `tern-picker-cutover-1900e9` grill, the user accepted that both submissions can have the same result. When native `ask` reports an explicit submission without input-source metadata, Flow records an exact match as the listed pick and an unmatched value as the user's words.

Flow preserves an explicit Other marker when the host provides one, and leaves earlier answers unchanged. Timeout values, interrupted drafts, cancellations, empty submissions, and headless recommendations never become consent. This amends only the answer-origin assumption in [ADR 0047](0047-flow-questions-require-a-live-page-and-recoverable-stages.md). Publication and answer recording stay separate.

We considered waiting for omp to report input origin and asking again about every indistinguishable match. Neither is needed now that an explicit submission of the same value counts as the same answer.

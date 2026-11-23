# Visual architecture agreement

Use this reference for the two shapes in a `skill://grill-with-docs` Architecture assessment. Use the [module and interface vocabulary](SKILL.md#glossary). The grill owns screening, the design question, and the Architecture brief.

- Show who owns each piece of state, which modules interact, and the contracts callers rely on. Compare the shapes at the same level against the same constraints. Leave signatures, local types, private decomposition, and file layout to implementation.
- Draw the smallest useful view through `skill://vstack-figures`. Show responsibility and dependencies, or show interaction or placement when ordering, failure, recovery, or isolation distinguishes the shapes.
- State the gains, costs, and observable guarantees. If a constraint rules out a shape, show how it fails. Use it to explain the exclusion, not as an available option.
- Capture the visuals the question needs with the question and its Decision brief, using `skill://flow-page`'s reader needs and visual kinds. A visual only in a Result or Background does not satisfy a question's visual need.

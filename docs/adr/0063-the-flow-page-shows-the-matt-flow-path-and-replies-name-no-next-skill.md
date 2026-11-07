# The Flow page shows the Matt flow path, and replies name no next skill

Agents named the next skill inconsistently at the end of a Matt run. In the newest 200 omp sessions, 22 to-spec runs ended with `/skill:to-tickets` 7 times, `/skill:implement` 3 times, and nothing 12 times. Only grill-with-docs had a next-skill rule (ADR 0032), so every other skill improvised. Now no Matt skill names a next skill in its reply, and no rule tells it not to. The Flow model holds one Matt flow table and derives the path and the current position from the Stages that ran. The reader shows that path and position at the top of the Flow page. The page shows no command to type.

The path follows the Matt flow in the glossary: a grill (grill-with-docs or grill-me), then either implement, or to-spec, to-tickets, and implement-spec. Until the user starts to-spec or implement, the page shows both branches after the grill. The page never contradicts the Stages that ran. A Flow with no Stage on the path shows no path.

When both branches have Stages, the branch with the most recently opened Stage keeps its unrun steps. The other branch shows only steps that ran. For example, after to-spec finishes and implement starts, the multi-session branch shows only to-spec. It does not show to-tickets or implement-spec. Stage links use the distinct Stage labels, while path steps keep skill names.

Replies still name a skill as a fix for a blocker, such as `/skill:setup-vstack` when isolation is off or `/skill:grill-with-docs` when to-spec finds a consequential gap. setup-vstack keeps its closing hand-off to `/skill:grill-with-docs`, because setup has no Flow path to show it.

## Considered Options

- A fixed closing line in each chain skill, as ADR 0032 did for grill-with-docs. The chain stays spread over several skills, and the chat line is what drifted.
- A sentence in the extension's run-start message, or an always-on rule, that forbids next-skill suggestions. The user wanted no new rule. The page carries the path instead.
- A closing reply that ends with the Flow link. The user chose the page only.
- The grill records the path, one-session or multi-session, and the model checks it. This keeps the grill's size judgment, but the user preferred a page derived only from facts that the Flow already records.
- Each skill writes its next step on the page. That moves the same per-skill drift onto the page.
- The page also shows the next command, such as `/skill:to-tickets #392`. The user chose path and position only.

## Consequences

- This amends ADR 0032: grill-with-docs no longer names the skill to type next after its summary.
- An agent can still suggest a next skill without any instruction. The user accepted that risk in exchange for no new rule.
- A completion reply carries no Flow link, as before. The user finds the path on a page that the user already has open.

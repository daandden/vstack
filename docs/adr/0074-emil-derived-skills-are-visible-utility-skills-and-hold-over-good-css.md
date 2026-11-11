# Emil-derived skills are visible Utility skills and hold over good-css

The skills derived from the UI upstream, including choreograph and gestures, are visible Utility skills. They load from their own descriptions in any session, and the user can start each one by name. They have no Addon catalog question. Where their guidance and good-css disagree or repeat each other, the Emil text holds and good-css loses its copy. This covers animation and CSS alike, including logical positioning, fluid type, overflow, overscroll, and resets. good-css stays a Utility skill for the CSS techniques that no Emil skill covers, without pointers between it and the Emil skills. The user chose this after comparing 14 conflicts and 10 repeated rules side by side. One owner per rule removes contradictory guidance, and visible descriptions reach UI work outside a Matt run.

## Considered options

- Keep them hidden Addons, as spec 338 assumed. Rejected because selection then happens only in a Matt run or through good-css's pointers.
- Make them hidden Utility skills reached only through `skill://` pointers. Rejected because motion work that never touches styles would stop loading them.
- Let good-css hold on CSS conflicts and Emil on animation only, as ADR 0051 did. Rejected for every conflict, one by one.
- Drop good-css and the CSS upstream. Withdrawn because the user kept the CSS-only techniques and the page lint.

## Consequences

- This amends [ADR 0051](0051-selected-emil-skills-govern-animation-guidance.md). Emil precedence is no longer limited to animation. Its rule for reconciling disagreements among Emil's own skills still stands. Use browser-specific behavior and observed evidence, and preserve motion-review blocking verdicts justified by the applicable rule and evidence.
- This amends [ADR 0015](0015-matt-skills-are-the-core-and-addons-supplement-them.md)'s list of Utility skills. Catalog questions and sample-prompt labels for these skills go away under [ADR 0019](0019-a-catalog-key-makes-an-addon-and-implement-spec-joins-the-matt-flow.md).
- Twelve visible motion and UI descriptions overlap. Selection-only trigger evals and the live Addon judge check are optional Costly seam tests. implement obtains explicit approval through `ask` before either runs. A declined or unanswered approval leaves a named proof gap, including unproven selection overlap, rather than blocking delivery.
- Matt skills and agents retain execution, review, verification, and evidence ownership. Their good-css instruction covers CSS, without promising UI guidance through it. Emil guidance arrives through its descriptions, including in delegated work.
- The page lint on vstack's own pages becomes a vstack original. It copies the CSS upstream's `check-css.mjs` with its MIT notice and drops the logical, ease-in, transition-all, motion, and duration checks. These checks enforce the losing side of the conflicts. The hover, outline, and color checks stay. check-register runs this copy instead of the css Pin's `page_lint`, so vstack maintains the script without Upstream fixes.

These are the agreed decisions for spec #455, not a claim that every consequence has landed. Ticket #457 converts the ten existing skills and records this decision. Ticket #458 adds choreograph and gestures, #459 prunes good-css and the cross-pointers, and #456 changes the page lint.

---
status: accepted
---

# Flow content keeps first-publication order

This is an accepted design, not an implemented change. It amends the Stage-tab-primary reading model in [ADR 0029](0029-a-flow-keeps-one-grilling-page-tabbed-by-stage.md) and [ADR 0044](0044-structured-flow-data-drives-server-rendered-pages.md), alongside the frontend decision in [ADR 0045](0045-flow-reader-uses-nuxt-with-vite-plus-on-bun.md).

Make one reading sequence across the Flow's Stages the main reader experience. New content takes its position at its first successful publication to the Flow. Retain submitted item order within a contribution and declared question order within a round. Persist that order rather than derive it from author timestamps, Stage opening order, content kind, or the latest update time.

For example, research drafted before a question but published after it belongs after that question. The shared publication order also distinguishes concurrent contributions without depending on equal or unsynchronized author clocks. An already committed contribution keeps its positions when replayed; it does not create duplicate reading entries.

Answers and revisions update their original blocks in place. Keep answers with their questions and retain accessible Result history and captured source revisions. An edit does not move a block or append a duplicate full-content update entry. Live publication retains the current reading position.

## Historical content

When exact historical ordering cannot be proved, keep the affected content in its retained order behind an explicit historical-content boundary. The exact new reading sequence begins when durable publication ordering is available. Preserve existing content, identities, links, and evidence; do not invent creation timestamps or imply that retained historical order is a proved cross-type chronology.

Use the same reader for historical and new content. The boundary does not require a parallel legacy renderer. Known historical ordering evidence remains useful, but it must not conceal gaps in the relation between content types.

## Why this order

Grouping all Results before questions moves research away from the point at which the reader received it. Separate Stage tabs as the only reading path require the reader to reconstruct work across skill runs. Author creation timestamps can insert late publications above already-read content. Appending an entry for every answer or revision produces an activity history rather than the selected concise reading model.

The user chose first-publication order, in-place updates, and a clear historical boundary over a mixed stream with uncertain relationships. Stage identity, parent relationships, lifecycle state, and links remain available. The prototype decides the navigation and visual layout without changing this canonical reading order.

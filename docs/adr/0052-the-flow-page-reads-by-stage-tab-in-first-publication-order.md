---
status: accepted
---

# The Flow page reads by Stage tab in first-publication order

> [ADR 20261123-the-flow-page-leads-with-the-open-decision](20261123-the-flow-page-leads-with-the-open-decision.md) replaces the sticky tab row and Jump row with one bar, moves the Stage list into the Map panel, and lands a URL with no fragment on Overview. Stage views and first-publication order within them stay.

The chronological reader of [ADR 0048](0048-flow-content-keeps-first-publication-order.md) put every Stage into one long sequence and moved navigation into a closed disclosure that scrolls away. On a Flow with many Stages, the reader could no longer see where one skill run ended or jump between Stages. The Flow page goes back to the tabs of [ADR 0029](0029-a-flow-keeps-one-grilling-page-tabbed-by-stage.md): Overview, one tab per Stage in the order the Stages opened, and Topics. A sticky header holds the tab row and the selected tab's Jump row. Inside a Stage tab, content keeps the first-publication order of ADR 0048, so a Result published after a question stays below it rather than being grouped first as ADR 0029 did.

Stage tabs are the only reading path. There is no tab that shows all Stages in one sequence. Publication positions, in-place answers and revisions, and the historical-content boundary of ADR 0048 stay as they are. They now order content within a tab, not across the Flow.

## Considered Options

- An All tab with today's cross-Stage sequence, plus Stage tabs that filter it. It keeps ADR 0048's sequence, but every block lives in two views, and a fragment link has to pick one.
- One page with a new Stage heading wherever the Stage changes. Global order stays exact, but the page stays long, and a Stage that resumes after another Stage appears in several sections.
- One page with one contiguous section per Stage. Each Stage reads as one piece, but later content moves above earlier content of other Stages.

## Consequences

- A reader who follows work across Stages switches tabs. ADR 0048 rejected Stage tabs for this reason, and the user accepted the cost.
- With no fragment, the page opens on the tab of the first question in the `n` queue, or on Overview when no question is open.

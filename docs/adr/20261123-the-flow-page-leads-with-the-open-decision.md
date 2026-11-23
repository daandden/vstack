# The Flow page leads with the open decision

The user chose this in the `flow-page-decision-context-243080` interview on 2026-11-23, in Grill with docs Q1 and Q3 to Q8, after 20 reviewers judged the page for a reader who arrives cold from another task. It amends [ADR 0052](0052-the-flow-page-reads-by-stage-tab-in-first-publication-order.md), [ADR 0029](0029-a-flow-keeps-one-grilling-page-tabbed-by-stage.md), [ADR 0071](0071-a-map-panel-on-m-shows-the-path-stages-and-wayfinder-map.md), [ADR 0042](0042-every-grilling-question-declares-its-reader-needs.md), [ADR 0057](0057-figure-captions-are-short-titles-with-source-behind-a-disclosure.md), and [ADR 0065](0065-n-stays-in-the-focused-stage-and-tern-tabs-follow-their-selected-session.md). These are accepted design decisions, not a claim that the implementation is complete.

On a 34-Stage Flow the sticky header took 360 of 768 px with every Stage tab and a Jump row that printed whole Assumed decisions, and the options of the open question started about 400 px below the fold. Now the only sticky element is one 44 px bar: the project, the Flow title, the Focused Stage with its work name, chips for its open questions, and up to three other Stages that wait. All Stages open in the Map panel's Stages tab, with Stages that wait first and finished Stages folded by ticket. The Jump row opens on `g`, lists the latest attempt of each question with its state, and shows Assumed picks as one entry. A question reads: its round's header, title and status, Decision brief, options beside the deciding figure, then closed Sources and context and Earlier attempt rows. The inline figure is capped in size and enlarges on click. Settled questions, earlier attempts, and Assumed picks fold to one line at their place that keeps who decided. Each round has one header, and its questions print no publication position or round line. Overview opens with Open decisions grouped by Stage, and a URL with no fragment lands there. The second open-state box and the Reader needs list leave the page, the theme switch and revision move to the footer, and question titles grow from 15 to 17 px in the same IosevkaTerm face.

## Considered Options

- **Tab row for only the Stages that wait, or today's tabs with only the Jump row folded.** Both still grow with every parallel ticket.
- **The figure above the options, capped.** The options start near the bottom of the first screen.
- **Fold only earlier attempts, or nothing.** Long Stages stay several screens tall, and the open question hides among finished ones.
- **No round headers, or one round line per question without the position.** The first hides rounds; the second keeps the repetition.
- **System sans for prose.** It would amend ADR 0072's look; the user kept IosevkaTerm.

## Consequences

- Stage views, first-publication order within a Stage, `h` and `l` across Stages, and `n` inside the Focused Stage stay. The Focused Stage is the Stage the page shows, not a visible tab.
- The earlier grill decision to show Choices and Evidence links under each question title, described in `docs/maintainer.md`, is reversed. Their fragment targets keep working.
- The page shows no marker for Picker presence, as ADR 0065 says.
- Consent provenance stays visible in folded rows: an explicit pick, an agent reading, and every non-consent state keep distinct words.

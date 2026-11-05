# Chronological Flow reader design review

> [ADR 0052](../adr/0052-the-flow-page-reads-by-stage-tab-in-first-publication-order.md) replaced variant A's On this page outline with Stage tabs and a sticky Jump row. This page keeps the #312 review as it happened.

The user approved ticket [#312](https://github.com/daandden/vstack/issues/312)'s `reader-review-r3`, variant A, in Flow question 18. They required a compact layout based on the current Flow page, Catppuccin Mocha dark mode, and Catppuccin Latte light mode. #313 implements durable publication order, and #314 ships the Nuxt reader through the Bun host. The sections below retain the prototype choices and captured evidence. Spec #309 and #316 remain open because the independent final integrated proof and refreshed first-publication evaluation are unavailable.

## Why revision 3 is smaller

The user reviewed the r2 annotated ledger, editorial folio, and indexed casebook and selected none. Their feedback was: "make it clean and be more minimalism, take obsidian and notion for inspiration".

Revision `reader-review-r3` uses that direction for restraint, not copied product styling or assets. Both alternatives use one centred reading column, neutral text, a single blue accent, small Stage metadata, whitespace between publications, and inline disclosures for evidence, rationale, and history. Large position numbers, tinted rails, permanent sidebars, and boxed reading panels are gone. The prior captured source sketch remains unchanged as fixture evidence.

## Two navigation structures

- **A, Document outline**, opens with `?variant=A`. An inline "On this page" toggle contains the Jump row. Another toggle contains related notes and backlinks. Navigation stays in the document and uses native disclosures. Opening it moves later content down, and returning to the outline requires scrolling or keyboard navigation.
- **B, Reading panes**, opens with `?variant=B`. The document has two quiet navigation buttons instead of inline navigation sections. Outline and context open in modal side panes, without changing the reading column's width or document layout. Links close the pane and focus their destination. Escape closes it and returns focus to its trigger. This keeps the document shorter, but context inspection temporarily blocks reading behind the pane. These are on-demand modal panes, not persistent split editors.

The review recommended A because native document disclosures avoid modal focus changes on a phone. B reduces document length but blocks comparison of context with the current paragraph. The user chose A with the compactness and theme requirements recorded above.

## Reading behavior retained

Both alternatives retain the uncertain historical boundary, then Q7 in S1, research in child Stage S2, Q8 in S1, and interactive evidence in child Stage S3. Each publication names its Stage, parent, and state. Positions describe first publication, not draft timestamps. The historical examples retain their unknown dates and missing needs metadata.

Question-local comparisons explain cross-Stage order and in-place updates. Background, Topic, Term, progress, citations, original captured bytes, and revision history remain reachable. Authored progress and read-only observations have separate labels. Fixture controls add an answer to Q7, revise the research in place, append a new publication, or refresh only the observation. These actions never authorize work or record a real user answer.

## Evidence

The self-contained throwaway bundle and evidence are outside the product patch at:

`/Users/vanguyen/.vstack/tmp/vstack-a7925b/implement-spec/309-20261030-01a18bad/312-r3/`

- `bundle/index.html`, `style.css`, `app.js`, `capture.svg`, and `tone.wav` are the complete runnable resources. The latter four files are in `bundle/` beside the entry.
- `capture-contribution.json` describes revision `reader-review-r3` for the parent's existing isolated HTML artifact viewer. `bundle-manifest.json` records every resource's hash and byte size.
- `final/observations.json` and the four `final/{A,B}-{1280,360}-walkthrough.json` files record the actual browser actions and state.
- `final/measurements.json` records viewport, scale, order, overflow, and state preservation. `final/navigation-measurements.json` covers opened navigation.
- `final/screenshots.json` lists full-resolution lossless WebP captures of the start, question, outline, full document, and B's backlinks pane. Matching ARIA snapshots are in `final/`.
- `handoff.md` gives launch steps, walkthrough details, limits, and the review question. `checks.json` and `full-suite.log` record the requested repository check.

Chrome 150.0.7871.24 was driven at 1280 by 900 and 360 by 900 CSS pixels, both at scale 1. Document overflow was zero in all four scenarios and with navigation open. Across all sixteen fixture transitions, focus, fragment, open disclosures, the local draft and option selection, demo count, Quiz attempt, and paused media state were retained. Settled anchor offsets changed by at most 0.485 CSS pixels. The media retained a position of 3.25 seconds and volume 0.35. The ordered publications stayed at positions 01 through 04, with only the new publication receiving 05.

## Limits

This is fixture UI, not Nuxt integration, live host updates, durable publication ordering, authenticated Quiz persistence, or an authoring evaluation. The bundle contains no external dependencies, copied logos, proprietary icons, parent access, or authoring credentials. Its production baseline is `9a3a54bbb269732d548c0cc00af18497657d6933`; r3 is a throwaway design revision on that fixture scenario.

The prototype browser walkthrough is observational evidence, not permanent test coverage or an accessibility audit with assistive technology. The driver waits for positioning to settle before measuring queued updates. Earlier positioning measurements are retained separately and are not the final update result. That walkthrough makes no Safari, Firefox, production-reader, or long-session reliability claim. The prototype skill exempts these throwaway variants from permanent tests. The checkout has no configured typecheck. #313 and #314's implementation and later targeted checks do not supply the missing #316 full-spec proof.

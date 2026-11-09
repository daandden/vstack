# Read the Flow page

Read this reference when navigating the page or explaining its keyboard controls.

A sticky header stays at the top of the page. Its first row has the tabs: Overview, one tab per Stage in the order the Stages opened, and Topics when the Flow has Topic notes, then the Stages button. Its second row is the selected tab's Jump row. On a narrow screen both rows wrap. The Flow heading and the theme control sit below the header and scroll away. The theme control follows the system light or dark preference until the reader picks Light or Dark, and the page remembers that choice.

When the Flow has a Matt flow path, a banner above the Flow heading shows the path and current position from the recorded Stages.

A link with no fragment opens the tab of the first open question in Flow-wide order, or Overview when no question is open. A fragment opens the tab that holds its target.

A Stage tab starts with the Stage's state, parent, and children, then lists that Stage's content in first-publication order. Backgrounds, Topic notes, questions, Results, Assumed picks, and summaries keep their original positions. Each published block shows its position in the whole Flow, so gaps in the numbers mark content published in other Stages meanwhile. Answers and Result revisions update those blocks in place, and earlier Result revisions remain available in disclosures. Overview holds progress, read-only observations, and the Stage list. Topics lists every Topic note.

Historical content whose exact publication order was not recorded sits at the top of its Stage tab behind an explicit retained-order boundary. That section is not a claim of cross-type chronology. New contributions follow it in durable publication order.

The Focused Stage is the Stage tab the page shows. On a Stage tab, `n` cycles only that Stage's actionable questions in Stage order and wraps to its first. When the Stage has no open questions, `n` stays put and the page says so. A tab click, a fragment, or `h` and `l` changes the Focused Stage.

When a content update publishes a new open question in the Focused Stage, the page selects it and scrolls to it without a key press, even if you are reading another block. Questions in other Stages and questions becoming answered, retired, or superseded do not move the page. While focus is in an input, textarea, select, or editable content, the page holds navigation, including fragment changes from outside the page. When focus leaves editable content, the page applies only the latest held move.

On Overview and Topics, `n` uses the Flow-wide order: newest in-progress Stage first, then older in-progress Stages. Once it opens a question's Stage tab, the next `n` stays in that Stage. Finished Stages, retired questions, settled answers, and superseded asks are excluded in both cases. Stage labels include ticket ids when known. Unticketed repeats get distinct labels.

`t` or the Stages button opens a clickable Stage-only tree with each Stage's state and open-question count. A continued Stage sits under its parent. This tree does not describe ticket dependencies. Stage links open the Stage's tab.

`j` and `k`, or the down and up arrows, select reading stops in the selected tab, update the URL fragment, and move focus to the target. The Jump row marks the block that holds the stop; the stop itself has no focus ring. `h` and `l`, or the left and right arrows, select the previous and next tab and stop at the first and last. Content links open the tab that holds their destination, including earlier revisions inside disclosures. Old fragment links from migrated pages and earlier tab links still reach their content. Shortcuts do nothing while typing in an input, textarea, select, or editable content, inside media controls, or with a modifier key held.

Diagrams keep their intrinsic label size rather than shrinking to fit a narrow screen. Swipe or scroll inside a wide diagram to read the rest. For keyboard panning, Tab to the diagram and use the arrow keys; those keys do not move the page's reading stop while the diagram has focus. Tab out to resume reading navigation. Captured Mermaid source and historical Pele SVGs follow the same rule in both themes.

Follow a question's Background and Topic note links for its context, and open Term notes for its local definitions. Result-entry links lead to the cited finding or evidence, including earlier revisions inside disclosures.

## Reader comments

Each Result revision has a separate Reader comments area. Choose **Add Reader comment**, select the whole Result block or one of its entries, enter a note, and choose **Save comment**. Comments are plain text, up to 4096 characters. The list names the Stage, Result, revision, and block or entry, with the saved time.

Comments are saved to the Flow and appear after a reload, in another browser, and after a Local Flow host restart. They remain on the Result revision they name. Open **Earlier revisions** to read comments on an earlier revision.

The comments endpoint shares Quiz progress's Flow-scoped HttpOnly, SameSite=Strict cookie. Writes require that cookie, the host's own Origin, and `application/json`. Comments are stored separately from authored records. They never change authored content, answers, workflow progress, or the authored Flow revision, and never answer a question or count as consent.

When the user points at Reader comments, `show` lists them separately in `reader_comments`. Each record has `id`, `stage`, `result`, `revision`, `anchor`, `text`, and `time`. An anchor is `{ kind: "block" }` or `{ kind: "entry", entry: "<entry id>" }`. No notification or automatic context injection delivers comments to the agent.

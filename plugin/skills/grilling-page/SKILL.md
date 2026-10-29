---
name: grilling-page
description: How a flow keeps its Grilling page. Covers the every-ask rule, the flow folder, the render script, its records, Stages, Report blocks, reader needs and Visual kinds, visuals and previews, and the printed path. Each skill that asks in a flow loads it.
disable-model-invocation: true
---

The skill that asks says when each page step happens. This skill says how to do it.

## Every ask in a flow

Every `ask` in a flow is a question on the flow's Grilling page, whichever skill asks it. Before each `ask`, add its question to the running Stage, as Add a round says, and print the page path. The `ask` question is one line that starts with its Q number. List the `ask` questions in Q-number order, the order the page shows them. Each `ask` option carries only its label. The page question carries the description, the trade-offs, and the context. When `ask` returns, record the answer on the page. The page is a record, not an input form, so answers come only through `ask`.

A subagent never asks. It returns its open questions. The top-level agent puts them on the page and asks them.

## Find or start the page

A skill continues the page of the flow that it belongs to. Use the page path that this session already printed, or the flow folder whose `flow.json` names the calling skill's issue, spec, ticket, branch, or run. Match tracker identities in `spec` and `tickets` in any case, retaining underscores. For a folder-key lookup, lowercase the issue key and replace each underscore with a hyphen, so `MY_PROJ-12` becomes `my-proj-12`. Confirm the original tracker identity in `flow.json` before reusing a normalized folder name, because different issue keys can normalize to the same page key. If neither exists, start a new flow folder.

To start one, read `skill://vstack-tmp` and run its path script with kind `grilling` from the repo being discussed. A flow keeps its page in one flow folder there, `<Scratch dir>/grilling/<project>-<key>/`. The key is the issue number for an issue, or the normalized issue key on a tracker such as Jira. Use the same normalization above for both the folder suffix and the initial flow record's `key`. Keep the original tracker identities in `spec` and `tickets`. Refuse an existing folder belonging to another identity instead of overwriting it. Without an issue, use a topic slug. Resolve `<project>` as the main checkout's basename, not a worktree's; outside Git use the current directory's basename. Choose a 3–5 word kebab topic slug at the first round and keep it. The flow folder holds:

- `page.jsonl`: the state file.
- `page.html`: the page.
- `flow.json`: the flow's identity, which the script writes from the `flow` record. A later Stage matches a flow by any value in it.
- `figures/`: the page's figures. The script makes this folder.

Never write the page's HTML. `scripts/grilling-page.ts` beside this skill renders it from the state file and `templates/grilling-page.html` (ADR 0013). Run it with `bun "$(realpath skill://grilling-page/scripts/grilling-page.ts)" <command> <state.jsonl> ...`:

- `append <state.jsonl> [<records.jsonl> | -]` adds records from a file or stdin.
- `answer <state.jsonl> <question-id>=<spec> ...` records answers. A spec is `A`, `A,B`, `A:<note>`, `other:<text>`, or `unanswered[:<reason>]`.
- `render <state.jsonl>` renders again, for example after a template change.
- `rename <state.jsonl> <new-key>` normalizes the new key by the rule above, so pass an issue key as the tracker shows it. It moves the flow folder to `<project>-<normalized-key>/`, adds the old key to the `flow` record's `old_keys`, renders again, and prints the new page path. It leaves `spec` and `tickets` unchanged. Before the move, it stores each absolute SVG path into the folder again as a path relative to the folder. It refuses and writes nothing if another folder already has the target name, or if an SVG visual does not resolve after the move. If the render from the new folder or a write fails, it moves the folder back with its state file as it was. A `rename` whose normalized key is the flow's current key checks the records, writes nothing, not even the page or `flow.json`, and prints the page path.

Each command checks every record, renders the whole page, writes `flow.json` from the `flow` record, and prints the page's absolute path. The one exception is a `rename` to the current key, which only checks the records and prints the path. On exit 1 it names the bad record and writes nothing: fix the record and run the command again. Each line of the state file is one JSON record with a `type` and an `id` of lowercase letters, digits, and hyphens. A later line with the same `id` replaces the earlier one, so change a record by appending it again; never rewrite the file. Inside a tab, the Background renders first, then Report blocks, then rounds and summaries, whatever the order of the records. A round lists its questions in Q-number order. Every other kind renders in the order its ids first appear.

On `append`, omit ids to let the script assign unique ids, or supply an id to link records in the same batch. After a successful write, stderr contains one compact JSON array in input order. Each item contains `type` and `id`, plus `stage`, `question`, `again`, `order`, `session`, `round`, `q`, and `time` when present. It contains no content text. Use these ids and Q numbers before asking, without a separate state read. Stdout remains only the absolute page path. The script owns Stage order, session and round numbers, timestamps, and Q numbers, replacing supplied values for new records. Replacements keep their assigned values. Existing state files retain their stored numbers on `render`, `answer`, and `rename`. Append rounds before their questions. Use `again` to keep an earlier decision's Q number in the same session.

Commands on the same state file serialize their read, assignment, checks, render, and writes, so concurrent appends use the latest stored records. On Darwin and Linux, Bun calls the system library's advisory `flock`. Closing the descriptor or terminating the process releases the lock. Empty lock files remain in the directory returned by `node:os`'s `tmpdir()` so waiting writers keep the same inode. A rename also reserves its destination. If the folder moves while a command waits, that command refuses without writing. Continue from the new page path.

- `page`: `title`, and `crumb` for the map breadcrumb or topic line. Put a ticket link in `crumb` as `[title](url)`.
- `stage`: `skill` (the skill that runs the Stage) and `state` (`not-started`, `in-progress`, or `finished`). The script assigns its `order` and derives a short tab label from `STAGE_LABELS` in `scripts/grilling-page.ts`. Register a new skill there before it adds a Stage. Repeated labels get a number, such as Review 2. Old `title` fields are ignored. To change the state, append the same record again. A reopened Stage gets a new id.
- `round`: `stage` (the id of its Stage). The script assigns `session`, `round`, and `time`.
- `question`: `title`, `description`, `needs`, optional `round` (the round id, defaulting to the last round), optional `again` (the earlier question id when asking a decision again), optional `today`, `terms`, `topics`, `example`, `visual`, `report_entries`, and `options` in `ask` order. The script assigns its Q number. The `title` is one question that ends with "?", matching the `ask` question after its Q number. The `description` explains what is being decided and why it matters. A blank line starts a paragraph. A block of `- ` lines is a bullet list. `needs` lists the reader needs, one or more `{ need, kind }`, as Add a round says; the page shows them under the description. Evidence goes in `today`, a list of `{ text, source }` facts with file-and-line sources. Define unfamiliar names in `terms`, a list of `{ term, text }` one-line definitions. `topics` lists shared Topic note ids. `example` preserves line breaks and leading spaces. `report_entries` lists `<report id>/<entry id>` links. Each option has `label`, `does`, `gains` and `costs` lists, optional `recommended` reason, and optional `preview`. Labels start with their letter and period, such as `A. Prose paragraphs`, and appear unchanged on the page and in `ask`.
- `answer`: written by the `answer` command.
- `close`: `stage`, `decisions` (one `{ question, text }` for the latest ask of each Q number so far, or an empty list when the Stage asked nothing), and optional `extra`. A close with no decisions needs at least one `extra` bullet, such as its Assumed picks. The script assigns `session` from the Stage, or the next session when the Stage has no round yet. Existing close records keep their session when appended again.
- `flow`: `slug` (the key that the flow folder started with), `key` (the current key, at the end of the folder name), `state` (`open` or `closed`), and optional `spec` (the spec issue), `tickets` (ticket ids), `branch`, `runs` (run ids), and `old_keys`. A page has one `flow` record. Append it with the `page` record. Append it again with the same id when the flow gets a spec, a ticket, a branch, or a run, or when it closes. Only `rename` changes `key`.
- `report`: `stage` (the id of its Stage), `title`, `shape` (`cards`, `ledger`, or `table`), an optional `summary` line, and an optional `jump` (its short link text in the Jump row). A Report block shows a Stage's results before the questions that they lead to: code-review's findings, architecture candidates, a ticket breakdown, or run results. Cards and a ledger have `entries`. A table has `columns` (a list of column names) and `rows`. Each entry and row has an `id` that is unique in its report, and an optional `question` (the id of the question that it leads to).
  - A card has `title`, `label` (such as `issue` or `suggestion`), `blocking` (`true` or `false`), `impact`, `action` (the suggested change), `evidence`, and an optional `visual`. The card reads Impact, then Action, then Evidence, and the page folds Evidence under a label that one click opens. In a review finding, `impact` opens with what a user or caller sees, then states the decision the user faces, and `evidence` gives the file and line for whoever fixes it.
  - A ledger entry has `claim`, `status` (`confirmed`, `cleared`, or `unproven`), `evidence`, `missing_proof` (the proof that settles the claim), and `consequence` (what follows if the claim holds).
  - A table row has `cells`, one string per column.
- `background`: `stage` (the id of its Stage), `title`, `summary` (one line), `sections` (a list of one or more `{ heading, body }`), `sources` (a list of one or more strings, such as `GLOSSARY.md` or `[text](url)`), an optional `jump` (its short link text in the Jump row), and an optional `visual`. A Stage has at most one Background. A `body` has the same paragraphs and bullet lists as a `description`.
- `topic`: `title`, `summary` (one line), `body` (paragraphs and bullet lists, as in a `description`), and `sources`. The Topics tab shows each Topic note once. Each question that lists the topic in `topics` links to it and shows its summary.

Link a question and its report entries both ways: give the question `report_entries`, and give each entry `question`. The script refuses a link to a question, a report, or an entry that does not exist. If a decision is asked again in a new question record, append the report again with the new question id.

If the decision of a question changes something that already exists, give the question `today`. A question about something new has no `today`. Give a Term note for each name that a newcomer does not know: glossary terms, skill, tool, and file names, and each ADR number with what that ADR decided. Today and Term notes are on the page only, and the `ask` question stays one line.

Put each explanation in one place, so that the page explains nothing twice:

- A question's own rationale goes in its `description`.
- Context that every question of a Stage needs goes in the Stage's Background. Append it before the Stage's first round.
- A concept that questions in more than one round or Stage build on goes in a Topic note. Append the `topic` once, and list its id in the `topics` of each question that needs it.
- A name that one line defines is a Term note on its question.

Text fields are plain text; `` `code` `` and `[text](url)` are kept. Link targets can be `http://`, `https://`, `file://`, or `#` anchors. Relative Markdown links render literally, so local artifact links need absolute `file://` targets. A `preview` is one visual, and the `visual` of a question, a card, or a Background is one visual or a list that renders in order. A visual is one of `{ "text" }`, `{ "html", "css" }`, or `{ "svg": "<path>" }`. A question's visual and an option's `preview` also carry `kind`, the id of the Visual kind they show; a card or Background visual has no `kind`. A raster image, such as a screenshot for a Source view, is an `html` visual `<img src="figures/<file>" alt="<what it shows>">`, with the file copied into the flow folder's `figures/`. The script reads each SVG file again on every render. In a flow folder, store an SVG path relative to the folder, such as `figures/context.svg`, so that the path still resolves after `rename`. The script parses HTML and SVG the way a browser does and refuses scripts, `on…` attributes, `javascript:`, `vbscript:`, and `data:` URLs (entities included), frames, forms, and SVG animation. It scopes `css` to the element and refuses at-rules in it. An SVG file can keep its `<style>`, but the script refuses an `@import` in it.

A page that exists with no state file was written by hand before the script, and a question with `plain`, `why`, and `settled` comes from a page before the description. The script refuses both. Start a new page with a new slug and do not link the old one.

The page opens on Overview, followed by Stage tabs in assigned order and Topics last when present. Overview is built from each Stage's state and latest ask of every Q number, showing its title and picked option labels, Other text, or Open. It includes no summary prose. A finished Stage with no questions and Assumed picks in its latest close shows "No questions; N decisions assumed", linked to that Stage's summary. N counts the close's `extra` bullets that start with `Assumed:`, with "decision" for 1. Other Stages with no questions show "No questions yet.". A Stage tab holds its Background, Report blocks, rounds, and summaries. Under the tabs, the Jump row of the open tab links each of them in page order: the Background, each Report block, each question, and the latest summary. A Background or Report block link shows its `jump` text, or else Background, Report, Report 2, and so on. Only the latest unanswered ask of a Q number counts as open. Press `n` to jump to the first open question across the whole page and open its tab. Repeated presses stay there until an answer is recorded and the page renders again. With none open, `n` does nothing. Use h/l or left/right arrows for tabs, and j/k or up/down arrows to step through the Jump row's targets, or the Topic notes, within a tab. Cross-tab links open their target tab. Older rounds without a Stage render in one implicit Grilling tab, finished when its last record is a close.

## Add a Stage

Each skill that asks in a flow runs its part as one Stage. Before its first question, append `skill` and `state: "in-progress"`. Keep its assigned id to link rounds and update its state. A nested skill joins its caller's Stage. When the caller finishes, append that Stage again with `state: "finished"`. A later return after completion gets a new Stage id.

Each Stage is one session. The script assigns the next session to its first round, numbers rounds across the page, and starts Q numbers at Q1 in each session. To ask a decision again, set `again` to the earlier question id. When the Stage asks no more, append a close with its Stage id and decisions. A Stage that settled every decision as Assumed closes with no round and an empty `decisions` list.

## Add a round

Append one `round` record. Then prepare each question of the next `ask` completely, with its needs and visuals, and append its `question` record once. Append the questions in Q-number order: a question asked again, with its earlier Q number, comes before new ones. The agent executing this step prepares each question itself, including a subagent executing the step in its own session.

For each question:

1. Write the title, description, options, and any Today facts.
2. List the reader needs in `needs`: what the reader must recognize, know, or compare to choose between the options. Name a concrete distinction required for this decision, not a generic instruction to read the page. Each need is one `{ need, kind }`, and `kind` is the id of the Visual kind that shows it. Prose is a valid kind when the description's words are enough.
3. Build only the visuals needed for non-prose needs, and give each visual the matching `kind`. One concise visual can meet several needs of the same kind. Keep prose when sufficient, and omit overlapping figures or definitions that add no decision information.
4. Cut from the description and from Today what a visual now shows. Keep what is being decided and why it matters. Keep each Today fact with its source, and shorten its text to what the visuals do not show. Preserve supplied qualifications, unresolved choices, and evidence limits in every representation. Label authored examples hypothetical.
5. Append the complete question.

| Visual kind | `kind` | Use it when the reader must | Format |
| --- | --- | --- | --- |
| Source view | `source-view` | recognize the real artifact the question is about, such as a floor plan, a screen, or a page. Crop or screenshot it, mark the subject, and keep enough surroundings to locate it. | `html` image for a raster file; `svg` for an existing SVG or a crop of it |
| Source excerpt | `source-excerpt` | read exact code, config, or output lines. Give the file and line. | `text` |
| Context diagram | `context-diagram` | follow how the thing works today: steps, branches, states, parts, or time. | `svg` figure |
| Option diagram | `option-diagram` | compare how the options differ in shape, such as ownership, where work runs, handoffs, states, or timing, in one figure. | `svg` figure |
| Option preview | `option-preview` | see what one option produces, as the user would see it: a page, a UI element, a layout, a color, a message, a file, or command output. Only on an option's `preview`. | `html` and `css`, `text`, or `svg` |
| Before and after | `before-after` | see, for one option, the current state next to the state it would produce. | `html` and `css`, or `svg` |
| Comparison table | `comparison-table` | compare the options on shared attributes, one row per option. | `html` table |
| Data chart | `data-chart` | weigh the measured numbers the decision turns on, such as cost, time, or counts, as a bar or line chart. State the measurement scope and what the values establish. Aggregate counts do not identify particular changed failures. | `svg` figure |
| Scenario walkthrough | `scenario` | follow one concrete case through each option, step by step, to see where the options part. | `svg` figure |
| Prose | `prose` | know something that the description's words say well enough. | none |

A question's needs are met only by visuals on that question or on its options. A Stage Background visual does not meet them. When a question needs a figure that the Background or a report card already shows, put the same file on the question too; one figure can repeat across questions. Put a Context diagram before an Option diagram. If a source that a need calls for is unavailable, such as a screen that cannot be captured, give that need the kind `prose` and say in the description what is missing. Missing sources do not permit invented facts or changed option meanings.

The script refuses a question that `append` adds when it has no `needs`, when a need other than prose has no visual or preview of its kind on the question, or when a visual or preview has a `kind` that no need names. Fix the record and append it again. Questions already in the state file render as they are.

Draw every diagram through `skill://vstack-figures`: a Context diagram, an Option diagram, a Data chart, a Scenario walkthrough, and any other figure with boxes, arrows, trees, timelines, axes, or states, including one that is small. Choose each figure's Mermaid type from vstack-figures' [Mermaid type reference](../vstack-figures/references/mermaid-types.md); the executing agent makes this choice itself, without a model judge. Write each figure's Mermaid and render it into the flow folder's `figures/`, with a unique basename per figure. Pass each SVG as `{ "svg": "figures/<file>", "kind": "<kind>" }`. HTML is for Source view images, mockups, previews, and tables, and `text` is for source excerpts, code, command output, and messages. For a raster Source view, copy the image or its crop into `figures/` with a unique basename and mark the subject in the crop or with an outline in the `html` and `css`.

A preview shows the real result, so it keeps the colors of that result.

## Print the path

Never open the page. Print the plain absolute path that the script printed, with no `file://` prefix.

## Record answers

Record each returned answer with the `answer` command, including custom notes (`A:<note>`) and Other answers (`other:<text>`). Record text with no pick as `other:<text>`. For a note-only answer, the text is each note with its option, such as `other:Note on B, not picked: <text>`. Record an empty, missing, cancelled, or timed-out answer with `unanswered`. In a headless run, record the recommended answer with the note `headless: recommended answer, not the user's`.

When grilling reopens a decision, write its reply in the existing records, where it reads best. One place is the description of the question that asks the decision again.

## Close the page

Append a `close` record. Write each decision as "what is now true" in one or two plain sentences, not as the option label. List each Assumed pick that was not reopened as its own `extra` bullet, "Assumed: <what is now true> (<its Why>)". When the Stage asked nothing, `decisions` is an empty list and the Assumed bullets carry the close. Add other `extra` bullets only when they apply: "Unchanged from earlier: ..." for earlier decisions that still hold, "Glossary: ..." for added terms and ADR or no ADR, with the reason, and "Headless, not user-confirmed" for a close in a headless run.

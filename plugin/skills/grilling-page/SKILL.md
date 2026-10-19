---
name: grilling-page
description: How a flow keeps its Grilling page. Covers the every-ask rule, the flow folder, the render script, its records, Stages, Report blocks, the visual judge, visuals and previews, and the printed path. Each skill that asks in a flow loads it.
disable-model-invocation: true
---

The skill that asks says when each page step happens. This skill says how to do it.

## Every ask in a flow

Every `ask` in a flow is a question on the flow's Grilling page, whichever skill asks it. Before each `ask`, add its question to the running Stage, as Add a round says, and print the page path. The `ask` question is one line that starts with its Q number. Each `ask` option carries only its label. The page question carries the description, the trade-offs, and the context. When `ask` returns, record the answer on the page. A closing gate, such as grilling's, goes on the page as the answer of a `close` record. The page is a record, not an input form, so answers come only through `ask`.

A subagent never asks. It returns its open questions. The top-level agent puts them on the page and asks them.

## Find or start the page

A skill continues the page of the flow that it belongs to. Use the page path that this session already printed, or the flow folder whose `flow.json` names the calling skill's issue, spec, ticket, branch, or run. If neither exists, start a new flow folder.

To start one, read `skill://vstack-tmp` and run its path script with kind `grilling` from the repo being discussed. A flow keeps its page in one flow folder there, `<Scratch dir>/grilling/<project>-<key>/`. The key is the issue number for an issue, otherwise the topic slug. Resolve `<project>` as the main checkout's basename, not a worktree's; outside Git use the current directory's basename. Choose a 3–5 word kebab topic slug at the first round and keep it. The flow folder holds:

- `page.jsonl`: the state file.
- `page.html`: the page.
- `flow.json`: the flow's identity, which the script writes from the `flow` record. A later Stage matches a flow by any value in it.
- `figures/`: the page's figures. The script makes this folder.

Never write the page's HTML. `scripts/grilling-page.ts` beside this skill renders it from the state file and `templates/grilling-page.html` (ADR 0013). Run it with `bun "$(realpath skill://grilling-page/scripts/grilling-page.ts)" <command> <state.jsonl> ...`:

- `append <state.jsonl> [<records.jsonl> | -]` adds records from a file or stdin.
- `answer <state.jsonl> <question-id>=<spec> ...` records answers. A spec is `A`, `A,B`, `A:<note>`, `other:<text>`, or `unanswered[:<reason>]`.
- `render <state.jsonl>` renders again, for example after a template change.
- `rename <state.jsonl> <new-key>` moves the flow folder to `<project>-<new-key>/`, adds the old key to the `flow` record's `old_keys`, renders again, and prints the new page path. Before the move, it stores each absolute SVG path into the folder again as a path relative to the folder. It refuses and writes nothing if the target folder exists, or if an SVG visual would not resolve after the move.

Each command checks every record, renders the whole page, writes `flow.json` from the `flow` record, and prints the page's absolute path. On exit 1 it names the bad record and writes nothing: fix the record and run the command again. Each line of the state file is one JSON record with a `type` and an `id` of lowercase letters, digits, and hyphens. A later line with the same `id` replaces the earlier one, so change a record by appending it again; never rewrite the file. Inside a tab, Report blocks render first, then rounds and summaries. Each kind renders in the order its ids first appear.

- `page`: `title`, and `crumb` for the map breadcrumb or topic line. Put a ticket link in `crumb` as `[title](url)`.
- `stage`: `skill` (the skill that runs the Stage), `title`, `state` (`not-started`, `in-progress`, or `finished`), and `order`, a whole number that places its tab. To change the state, append the same record again with the new state. A reopened Stage gets a new id.
- `round`: `session`, `round`, `time` (ISO timestamp), and `stage` (the id of its Stage).
- `question`: `round` (the round id), `q` (its Q number), `title`, `description`, optional `today` and `terms`, an optional `example`, an optional `visual`, optional `report_entries`, and `options` in `ask` order. The `title` is one question that ends with "?", the same text as the `ask` question after its Q number. The `description` is the long form under the title. It reads like a chat answer to "explain Qxx". It says first what is being decided and why it matters to the user, in short chat sentences. Evidence goes in `today`, and names that a newcomer does not know go in `terms`. A blank line starts a new paragraph, and a block of lines that start with `- ` is a bullet list. `today` is a list of one or more `{ text, source }` facts about how things work now, where `source` is the file and line, such as `scripts/grilling-page.ts:120`. `terms` is a list of one or more `{ term, text }` Term notes, each a one-line definition of a name. Each renders as its own block under the description. The `example` keeps its line breaks and leading spaces, so it can show rows as they look on screen. `report_entries` lists the report entries that the question decides, each as `<report id>/<entry id>`, and renders as links under the description. Each option has `label`, `does`, `gains` and `costs` (lists), an optional `recommended` (the reason), and an optional `preview`. The `label` is the `ask` label as it is, starting with its letter and a period (`A. Prose paragraphs`); the script checks the letter and the page hides it.
- `answer`: written by the `answer` command.
- `close`: `session`, `decisions` (one `{ question, text }` for the latest ask of each Q number so far), an optional `extra` list, and `answer` and `note` once the gate is answered.
- `flow`: `slug` (the key that the flow folder started with), `key` (the current key, at the end of the folder name), `state` (`open` or `closed`), and optional `spec` (the spec issue), `tickets` (ticket ids), `branch`, `runs` (run ids), and `old_keys`. A page has one `flow` record. Append it with the `page` record. Append it again with the same id when the flow gets a spec, a ticket, a branch, or a run, or when it closes. Only `rename` changes `key`.
- `report`: `stage` (the id of its Stage), `title`, `shape` (`cards`, `ledger`, or `table`), and an optional `summary` line. A Report block shows a Stage's results before the questions that they lead to: code-review's findings, architecture candidates, a ticket breakdown, or run results. Cards and a ledger have `entries`. A table has `columns` (a list of column names) and `rows`. Each entry and row has an `id` that is unique in its report, and an optional `question` (the id of the question that it leads to).
  - A card has `title`, `label` (such as `issue` or `suggestion`), `blocking` (`true` or `false`), `impact`, `evidence`, `action` (the suggested change), and an optional `visual`.
  - A ledger entry has `claim`, `status` (`confirmed`, `cleared`, or `unproven`), `evidence`, `missing_proof` (the proof that would settle the claim), and `consequence` (what follows if the claim holds).
  - A table row has `cells`, one string per column.

Link a question and its report entries both ways: give the question `report_entries`, and give each entry `question`. The script refuses a link to a question, a report, or an entry that does not exist. If a decision is asked again in a new question record, append the report again with the new question id.

If the decision of a question changes something that already exists, give the question `today`. A question about something new has no `today`. Give a Term note for each name that a newcomer does not know: glossary terms, skill, tool, and file names, and each ADR number with what that ADR decided. Today and Term notes are on the page only, and the `ask` question stays one line.

Text fields are plain text; `` `code` `` and `[text](url)` are kept. A `preview` is one visual, and the `visual` of a question or a card is one visual or a list that renders in order. A visual is one of `{ "text" }`, `{ "html", "css" }`, or `{ "svg": "<path>" }`. The script reads each SVG file again on every render. In a flow folder, store an SVG path relative to the folder, such as `figures/context.svg`, so that the path still resolves after `rename`. The script parses HTML and SVG the way a browser does and refuses scripts, `on…` attributes, `javascript:`, `vbscript:`, and `data:` URLs (entities included), frames, forms, and SVG animation. It scopes `css` to the element and refuses at-rules in it. An SVG file can keep its `<style>`, but the script refuses an `@import` in it.

A page that exists with no state file was written by hand before the script, and a question with `plain`, `why`, and `settled` comes from a page before the description. The script refuses both. Start a new page with a new slug and do not link the old one.

The page opens on an Overview tab, then has one tab per Stage, in `order`. The Overview lists each Stage with its state color, the decisions of its latest summary in each session, and its open questions, each linked into its tab. A Stage tab holds the Stage's Report blocks, then its rounds and summaries. A summary renders in the tab of its session's last round. A question is open until it has an answer that is not `unanswered`. The user switches tabs with h/l or the left and right arrow keys, and moves between the questions and summaries of the open tab with j/k or the up and down arrow keys. A link to a question or a report entry in another tab opens that tab. Rounds with no `stage` come from a page before Stages. They render in one implicit Grilling tab before the other tabs. That tab is finished when its last record is an answered `close`.

## Add a Stage

Each skill that asks in a flow runs its part as one Stage. Before its first question, append a `stage` record: `skill` is the skill's name, `title` names its part of the flow, `state` is `in-progress`, and `order` is one more than the highest `order` on the page. A skill that runs inside another skill's Stage adds no Stage of its own, and its questions join that Stage. For example, domain-modeling's challenges inside grill-with-docs join the grill-with-docs Stage. When the skill that added the Stage ends its part, it marks the Stage finished: append the same `stage` record with state `finished`. A skill that comes back after its Stage finished adds a new Stage with a new id.

Each Stage is one session on the page. Its first `round` takes the next session number, and each of its rounds names the Stage in `stage`. Round numbers continue across the page. Q numbers start at Q1 in each session and increase across it. A decision that is asked again, because it was unanswered or reopened, keeps its Q number in a new question record. When the Stage asks no more, append a `close` record for its session with its decisions, so that the Overview lists them. Only a closing gate, such as grilling's, gives the `close` an `answer`.

## Add a round

Append one `round` record and one `question` record per question of the next `ask`, with no `visual` or `preview` yet.

Then let the jev judge decide each question's diagrams. Run this in one Python eval cell, with `skill` set to this skill's directory:

```python
skill = "<grilling-page skill dir>"
exec(open(f"{skill}/scripts/visual_judge.py").read())
await judge_round(skill, "<state.jsonl>", "<round id>")
```

The helper sends jev one request per question. The request's judge state holds the question and diagram-design's visual-type guide, so jev reads the guide once. Its four questions are one yes-or-no question and one type ranking for each diagram kind in `references/visual-judge.json`. For each question, it prints one line per diagram kind:

- A context diagram shows the logic that the description and Today explain: steps, branches, states, parts, or time.
- An option diagram shows how the options differ in shape, in one figure.

A kind under its threshold, or a judge error, prints `none`. A kind at or over it prints `draw it` and the three diagram-design types that fit best. Draw each such diagram as a type from those three. Choose it with diagram-design's visual-type guide and its semantic-pattern table.

Add other visuals when they help:

- If the options produce something the user sees (a page, a UI element, a layout, a color, a message, a file, or command output), give each option a `preview` of its result.
- If three or more options differ on the same attributes, add an HTML table with one row per option.
- If code, config, a diff, or output makes the question concrete, add it as a `text` visual or an `example`.

Append the question record again with its visuals. Put a context diagram first and an option diagram second. Then cut from the description and from Today the logic that a diagram now shows. Keep what is being decided and why it matters. Keep each Today fact with its source. Shorten the text of each fact to what the diagram does not show.

Use diagram-design for every diagram: any figure with boxes, arrows, trees, timelines, or states, including one that is small. HTML is for mockups and tables, and `text` is for code, command output, and messages. Draw the round's diagrams through `skill://vstack-figures`, one brief per diagram, as soon as the judge has printed. The out dir is the flow folder's `figures/`, and each figure gets a unique basename. Write the previews, tables, and descriptions while the drawers run. Collect the figures before you append the question records again, and pass each exported file as `{ "svg": "figures/<file>" }`. Never use Mermaid as a fallback.

A preview shows the real result, so it keeps the colors of that result.

## Print the path

Never open the page. Print the plain absolute path that the script printed, with no `file://` prefix.

## Record answers

Record each returned answer with the `answer` command, including custom notes (`A:<note>`) and Other answers (`other:<text>`). Record text with no pick as `other:<text>`. For a note-only answer, the text is each note with its option, such as `other:Note on B, not picked: <text>`. Record an empty, missing, cancelled, or timed-out answer with `unanswered`. In a headless run, record the recommended answer with the note `headless: recommended answer, not the user's`.

When grilling reopens a decision, write its reply in the existing records, where it reads best. One place is the description of the question that asks the decision again.

## Close the page

Append a `close` record. Write each decision as "what is now true" in one or two plain sentences, not as the option label. Add `extra` bullets only when they apply: "Unchanged from earlier: ..." for earlier decisions that still hold, and "Glossary: ..." for added terms and ADR or no ADR, with the reason. Record the closing answer by appending the same `close` record with `answer` and `note`. After Not yet, the next close is a new record with a new id. When the gate stops after a second timeout, put the reason in the close `note`. In a headless run, the close `answer` is "Headless, not user-confirmed".

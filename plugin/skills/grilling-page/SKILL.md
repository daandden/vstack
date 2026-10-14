---
name: grilling-page
description: How a grilling session keeps its Grilling page. Covers the state file, the render script, its records, the visual judge, visuals and previews, and the printed path. grilling loads it.
disable-model-invocation: true
---

grilling says when each page step happens. This skill says how to do it.

## Start the page

Read `skill://vstack-tmp` and run its path script with kind `grilling` from the repo being discussed. The state file is `<Scratch dir>/grilling/<project>-<issue>.jsonl` for an issue, otherwise `<project>-<topic-slug>.jsonl`, and the page is the same path with `.html`. Resolve `<project>` as the main checkout's basename, not a worktree's; outside Git use the current directory's basename. Choose a 3–5 word kebab topic slug at the first round and keep it.

Never write the page's HTML. `scripts/grilling-page.ts` beside this skill renders it from the state file and `templates/grilling-page.html` (ADR 0013). Run it with `bun "$(realpath skill://grilling-page/scripts/grilling-page.ts)" <command> <state.jsonl> ...`:

- `append <state.jsonl> [<records.jsonl> | -]` adds records from a file or stdin.
- `answer <state.jsonl> <question-id>=<spec> ...` records answers. A spec is `A`, `A,B`, `A:<note>`, `other:<text>`, or `unanswered[:<reason>]`.
- `render <state.jsonl>` renders again, for example after a template change.

Each command checks every record, renders the whole page, and prints the page's absolute path. On exit 1 it names the bad record and writes nothing: fix the record and run the command again. Each line of the state file is one JSON record with a `type` and an `id` of lowercase letters, digits, and hyphens. A later line with the same `id` replaces the earlier one, so change a record by appending it again; never rewrite the file. Records render in the order their ids first appear.

- `page`: `title`, and `crumb` for the map breadcrumb or topic line. Put a ticket link in `crumb` as `[title](url)`.
- `round`: `session`, `round`, and `time` (ISO timestamp).
- `question`: `round` (the round id), `q` (its Q number), `title`, `description`, an optional `example`, an optional `visual`, and `options` in `ask` order. The `title` is one question that ends with "?", the same text as the `ask` question after its Q number. The `description` is the long form under the title: what the choice changes, why it is open now, and which earlier decisions it builds on. A blank line starts a new paragraph, and a block of lines that start with `- ` is a bullet list. The `example` keeps its line breaks and leading spaces, so it can show rows as they look on screen. Each option has `label`, `does`, `gains` and `costs` (lists), an optional `recommended` (the reason), and an optional `preview`. The `label` is the `ask` label as it is, starting with its letter and a period (`A. Prose paragraphs`); the script checks the letter and the page hides it.
- `answer`: written by the `answer` command.
- `close`: `session`, `decisions` (one `{ question, text }` for the latest ask of each Q number so far), an optional `extra` list, and `answer` and `note` once the gate is answered.

Text fields are plain text; `` `code` `` and `[text](url)` are kept. A `preview` is one visual, and a question's `visual` is one visual or a list that renders in order. A visual is one of `{ "text" }`, `{ "html", "css" }`, or `{ "svg": "<path>" }`. The script parses HTML and SVG the way a browser does and refuses scripts, `on…` attributes, `javascript:`, `vbscript:`, and `data:` URLs (entities included), frames, forms, and SVG animation. It scopes `css` to the element and refuses at-rules in it. An SVG file can keep its `<style>` and a Google Fonts `@import`, as diagram-design exports have.

A page that exists with no state file was written by hand before the script, and a question with `plain`, `why`, and `settled` comes from a page before the description. The script refuses both. Start a new page with a new slug and do not link the old one. To continue a page, append a new `round` with the next session number. Continue page round numbers; question numbers start at Q1 for each session and increase across it. A repeated unanswered decision keeps its Q number in a new question record.

## Add a round

Append one `round` record and one `question` record per frontier decision, with no `visual` or `preview` yet.

Then let the jev judge decide each question's diagrams. Run this in one Python eval cell, with `skill` set to this skill's directory:

```python
skill = "<grilling-page skill dir>"
exec(open(f"{skill}/scripts/visual_judge.py").read())
await judge_round(skill, "<state.jsonl>", "<round id>")
```

For each question, it prints one line per diagram kind in `references/visual-judge.json`:

- A context diagram shows the logic the description explains: steps, branches, states, parts, or time.
- An option diagram shows how the options differ in shape, in one figure.

A kind under its threshold, or a judge error, prints `none`. A kind at or over it prints `draw it` and the three diagram-design types that fit best. Draw each such diagram as a type from those three. Choose it with diagram-design's visual-type guide and its semantic-pattern table.

Add other visuals when they help:

- If the options produce something the user sees (a page, a UI element, a layout, a color, a message, a file, or command output), give each option a `preview` of its result.
- If three or more options differ on the same attributes, add an HTML table with one row per option.
- If code, config, a diff, or output makes the question concrete, add it as a `text` visual or an `example`.

Append the question record again with its visuals. Put a context diagram first and an option diagram second. Then cut from the description the logic that a diagram now shows. Keep why the choice is open, what it builds on, and the evidence.

Use diagram-design for every diagram: any figure with boxes, arrows, trees, timelines, or states, including one that is small. HTML is for mockups and tables, and `text` is for code, command output, and messages. Draw the round's diagrams through `skill://vstack-figures`, one brief per diagram, as soon as the judge has printed. Give each the dark variant and the `catppuccin-latte` profile, whose dark column is Catppuccin Mocha, the page's palette. When that profile does not exist, use the project's profile, still dark. The out dir is the same `grilling/` Scratch kind, and each figure gets a unique basename. Write the previews, tables, and descriptions while the drawers run. Collect the figures before you append the question records again, and pass each exported file as `{ "svg": "<path>" }`. Never use Mermaid as a fallback.

A preview shows the real result, so it keeps the colors of that result, light or dark.

## Print the path

Never open the page. Print the plain absolute path that the script printed, with no `file://` prefix.

## Record answers

Record each returned answer with the `answer` command, including custom notes (`A:<note>`) and Other answers (`other:<text>`). Record a missing, cancelled, or timed-out answer with `unanswered`. In a headless run, record the recommended answer with the note `headless: recommended answer, not the user's`.

## Close the page

Append a `close` record. Write each decision as "what is now true" in one or two plain sentences, not as the option label. Add `extra` bullets only when they apply: "Unchanged from earlier: ..." for earlier decisions that still hold, and "Glossary: ..." for added terms and ADR or no ADR, with the reason. Record the closing answer by appending the same `close` record with `answer` and `note`. After Not yet, the next close is a new record with a new id. When the gate stops after a second timeout, put the reason in the close `note`. In a headless run, the close `answer` is "Headless, not user-confirmed".

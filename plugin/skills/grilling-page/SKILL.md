---
name: grilling-page
description: How a grilling session keeps its Grilling page. Covers the state file, the render script, its records, visuals and previews, and the printed path. grilling loads it.
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
- `round`: `session`, `round`, `time` (ISO timestamp), and an optional `note` for known facts and what the last round settled.
- `question`: `round` (the round id), `q` (its Q number), `title`, `plain` (one sentence that says what the choice changes), `why`, `settled` (settled decisions and ADRs), an optional `example`, an optional `visual`, and `options` in `ask` order. Each option has `label`, `does`, `gains` and `costs` (lists), an optional `recommended` (the reason), and an optional `preview`.
- `answer`: written by the `answer` command.
- `close`: `session`, `decisions` (one `{ question, text }` for the latest ask of each Q number so far), an optional `extra` list, and `answer` and `note` once the gate is answered.

Text fields are plain text; `` `code` `` and `[text](url)` are kept. A `visual` or `preview` is one of `{ "text" }`, `{ "html", "css" }`, or `{ "svg": "<path>" }`. The script parses HTML and SVG the way a browser does and refuses scripts, `on…` attributes, `javascript:`, `vbscript:`, and `data:` URLs (entities included), frames, forms, and SVG animation. It scopes `css` to the element and refuses at-rules in it. An SVG file can keep its `<style>` and a Google Fonts `@import`, as diagram-design exports have.

A page that exists with no state file was written by hand before the script. The script refuses it. Start a new page with a new slug and do not link the old one. To continue a page, append a new `round` with the next session number. Continue page round numbers; question numbers start at Q1 for each session and increase across it. A repeated unanswered decision keeps its Q number in a new question record.

## Add a round

Append one `round` record and one `question` record per frontier decision. Add an `example` only when the options are abstract.

Give a question one `visual` only when its words are not enough. When options produce something the user sees (a page or UI, a message, a file, command output), give each option a `preview` of its result. When options differ in shape or flow, read `skill://diagram-design` and draw under the same `grilling/` Scratch kind. Fix the figure's type, size, and content as the caller; this skips its confirm-before-drawing, not its first-use style gate. Read its `references/export.md`, run `scripts/export_svg.py` through Python eval, and pass the exported file as `{ "svg": "<path>" }`. Give each source figure a unique basename so SVG IDs stay unique. Never draw a substitute figure yourself or use Mermaid as a fallback.

## Print the path

Never open the page. Print the plain absolute path that the script printed, with no `file://` prefix.

## Record answers

Record each returned answer with the `answer` command, including custom notes (`A:<note>`) and Other answers (`other:<text>`). Record a missing, cancelled, or timed-out answer with `unanswered`. In a headless run, record the recommended answer with the note `headless: recommended answer, not the user's`.

## Close the page

Append a `close` record. Write each decision as "what is now true" in one or two plain sentences, not as the option label. Add `extra` bullets only when they apply: "Unchanged from earlier: ..." for earlier decisions that still hold, and "Glossary: ..." for added terms and ADR or no ADR, with the reason. Record the closing answer by appending the same `close` record with `answer` and `note`. After Not yet, the next close is a new record with a new id. When the gate stops after a second timeout, put the reason in the close `note`. In a headless run, the close `answer` is "Headless, not user-confirmed".

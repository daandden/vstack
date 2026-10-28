---
name: flow-page
description: How a Flow keeps its Flow page through Stage-bound authoring. Covers opening or joining a Stage, the typed contribution format, the receipt and its ask payload, answers, closes, and refusals.
disable-model-invocation: true
---

The skill that runs a Stage says when each page step happens. This skill says how to do it. The Flow page replaces the Grilling page. Until a skill moves to this one, it keeps using `skill://grilling-page`.

You send meaning: questions, answers, decisions, notes, and Results. The script owns everything else: ids, Stage order and tab labels, round and Q numbers, option letters, timestamps, the links between records, storage, and the page itself. It renders the page from its own template and escapes every string you send. You never write HTML, CSS, or scripts, and a contribution that carries them is refused.

Run the script with the bash tool of this omp session, which sets `PI_SESSION_ID`, from inside the repo the work is about:

```sh
bun "$(realpath skill://flow-page/scripts/flow-page.ts)" <command> ...
```

Every command prints one JSON receipt on stdout. Exit 1 prints the refusal on stderr and writes nothing: fix what it names and run the command again. Exit 2 is a usage error.

## Open or join a Stage

A result-producing run is one Stage. Open it once, before its first contribution:

- `open --skill <name> --title <title>` starts a new Flow with its first Stage. `--title` is the Flow page's heading. A `--slug` of 3 to 5 words is optional; the script derives one from the title.
- `open --skill <name> --flow <id>` adds a Stage to an existing Flow. A return to finished work opens a new Stage.
- Add `--ticket <id>` when the Stage works on one ticket, such as one wayfinder ticket. Its tab label then names the ticket.

Any skill name works; the tab label comes from it. `open` binds this session's agent to the new Stage. Later commands from the same session write there without naming it. `bind --flow <id> --stage <id>` joins an existing Stage instead, for example when a nested skill continues its caller's Stage. A binding belongs to one session and one agent. `--agent <id>` names a second agent in the same session; it defaults to `main`.

Loading this skill, reading a page, `show`, and `bind` open no Stage. A run that only reads a reference skill or helper adds nothing to the page.

Parallel callers, and callers outside an omp session, name the target on each write: `submit --flow <id> --stage <id>`. There is no other default. A session with no binding and no named target is refused.

Find a Flow by the id that an earlier receipt printed. `show [--flow <id>]` prints the Flow's structure: Stages with their labels and states, rounds, Q numbers, answer states, Results, and every link and backlink.

## Submit a contribution

`submit [<file> | -]` reads one contribution from a file or stdin:

```json
{ "version": 1, "items": [ { "kind": "round", "questions": [ ... ] } ] }
```

The script applies all items to the bound Stage, or refuses all of them. Give a new question, Topic note, Result, or Result entry a `ref` (lowercase letters, digits, and hyphens) when another item names it. An item can name a ref from the same contribution, or an id from an earlier receipt. Name a Result entry as `<result ref or id>/<entry ref or id>`.

Item kinds and their fields:

- `background`: `title`, `summary` (one line), `sections` (one or more `{ heading, body }`), and `sources` (one or more strings, such as `GLOSSARY.md` or `[text](url)`). A Stage has one Background. Submit it before the Stage's first round.
- `topic`: optional `ref`, `title`, `summary`, `body`, and `sources`. The Topics tab shows each Topic note once and lists the questions that cite it.
- `result`: optional `ref`, `shape`, `title`, and an optional `summary` line. A Result shows a Stage's output before the questions it leads to, such as review findings, candidates, a ticket breakdown, or run results.
  - `cards` has `entries`, each with optional `ref`, `title`, `label` (such as `issue`), `blocking` (`true` or `false`), `impact`, `action`, and `evidence`. In a review finding, `impact` opens with what a user or caller sees, and `evidence` gives the file and line.
  - `ledger` has `entries`, each with optional `ref`, `claim`, `status` (`confirmed`, `cleared`, or `unproven`), `evidence`, `missing_proof`, and `consequence`.
  - `table` has `columns` and `rows`, each row with optional `ref` and `cells`, one string per column.
- `round`: `questions`, in `ask` order. One contribution holds at most one round, because one round is one `ask`. Each question has optional `ref`, `title` (one question that ends with "?"), `description`, and `options`. Each option has `label` (the label alone; the script adds `A. `, `B. `), `does`, `gains`, `costs`, and an optional `recommended` reason on at most one option. A question can add:
  - `again`: the earlier question it asks again, from an earlier round of the same Stage. It keeps that Q number.
  - `today`: `{ text, source }` facts about how things work now, each with its file-and-line source. Use it when the decision changes something that exists.
  - `terms`: `{ term, text }` Term notes, one line each, for names a newcomer does not know.
  - `topics`: Topic notes it builds on.
  - `results`: the Result entries it comes from. The page links them both ways.
  - `example`: text that makes the question concrete.
- `answer`: `question` and exactly one of `picks` (letters, with an optional `note`), `other` (text), or `unanswered` (the reason, or an empty string).
- `close`: `decisions`, one `{ question, text }` for the latest ask of each Q number of the Stage, and optional `extra` bullets. A close with no decisions needs `extra`.
- `stage`: `{ "kind": "stage", "state": "finished" }` finishes the bound Stage. A finished Stage takes no more content.

Put each explanation in one place, so the page explains nothing twice. A question's own rationale goes in its `description`. Context that every question of the Stage needs goes in the Background. A concept that questions in several rounds or Stages build on goes in a Topic note. A name that one line defines is a Term note. The script stores each source string once, however many records cite it.

Text fields are plain text. A blank line starts a paragraph, a block of `- ` lines is a bullet list, and `` `code` `` and `[text](https://url)` links are kept.

## The receipt

A submit receipt holds the Flow and Stage ids, the committed `revision`, the absolute `page` path, `refs` (each ref you gave, mapped to its assigned id), and, when the contribution has a round, `ask`. It does not repeat your content.

`ask` is the payload for the `ask` tool, in Q-number order: each question's id, its one-line `question` that starts with its Q number (`Q3. ...`), its option labels with their letters, and the index of the recommended option. Pass it to `ask` as it is.

## Every ask in a Flow

Every `ask` in a Flow is a question on its page, whichever skill asks it. Submit the round first, then ask with the receipt's `ask` payload and print the page path. The page question carries the description, trade-offs, and context; the `ask` carries only the numbered title and labels. A subagent never asks. It returns its open questions, and the top-level agent puts them on the page and asks them.

When `ask` returns, submit an `answer` for each question. A picked option is `picks`, with any custom note as `note`. Text with no pick is `other`. An empty, cancelled, or timed-out answer is `unanswered`, because it is not the user's answer. In a headless run, record the recommended pick with the note `headless: recommended answer, not the user's`.

## Close the Stage

Submit a `close`. Write each decision as what is now true, in one or two plain sentences, not as the option label. List each Assumed pick that was not reopened as its own `extra` bullet, "Assumed: <what is now true> (<its Why>)". Add other `extra` bullets only when they apply: "Unchanged from earlier: ...", "Glossary: ...", and "Headless, not user-confirmed" for a close in a headless run. Then submit `{ "kind": "stage", "state": "finished" }` when the Stage's skill finishes.

## Print the path

Never open the page. Print the plain absolute `page` path from the receipt, with no `file://` prefix.

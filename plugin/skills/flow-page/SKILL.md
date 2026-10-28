---
name: flow-page
description: How a Flow keeps its Flow page through Stage-bound authoring. Covers opening or joining a Stage, finding a Flow by alias, moving its folder, the typed contribution format, Document Results, typed attachments and captured revisions, focused Result revisions, the receipt and its ask payload, answers, closes, and refusals.
disable-model-invocation: true
---

The skill that runs a Stage says when each page step happens. This skill says how to do it. The Flow page replaces the Grilling page. Until a skill moves to this one, it keeps using `skill://grilling-page`.

You send meaning: questions, answers, decisions, notes, and Results. The script owns everything else: ids, Stage order and tab labels, round and Q numbers, option letters, timestamps, the links between records, storage, and the page itself. It renders the page from its own template and escapes every string you send. You never write HTML, CSS, or scripts, and a contribution that carries them is refused.

Run the script with the bash tool of this omp session, which sets `PI_SESSION_ID`, from inside the repo the work is about:

```sh
bun "$(realpath skill://flow-page/scripts/flow-page.ts)" <command> ...
```

Every command prints one JSON receipt on stdout. Exit 1 prints the refusal on stderr and writes nothing: fix what it names and run the command again. Exit 2 is a usage error.

A receipt always means the content is committed. Its `presentation` says what the page shows: `current`, or `stale` with the older `revision` the page still shows and the `error` that stopped the new page. A stale page keeps its last good content. Run `render --flow <flow>` to publish it again, and never resubmit committed content.

## Open or join a Stage

A result-producing run is one Stage. Open it once, before its first contribution:

- `open --skill <name> --title <title>` starts a new Flow with its first Stage. `--title` is the Flow page's heading. A `--slug` of 3 to 5 words is optional; the script derives one from the title.
- `open --skill <name> --flow <flow>` adds a Stage to an existing Flow. A return to finished work opens a new Stage with `--parent <stage>`, the Stage it continues; the finished Stage stays as it was.
- Add `--ticket <id>` when the Stage works on one ticket, such as one wayfinder ticket. Its tab label then names the ticket.

Any skill name works; the tab label comes from it. `open` binds this session's agent to the new Stage. Later commands from the same session write there without naming it. `bind --flow <flow> --stage <id>` joins an existing Stage instead, for example when a nested skill continues its caller's Stage. A binding belongs to one session and one agent. `--agent <id>` names a second agent in the same session; it defaults to `main`.

Loading this skill, reading a page, `show`, and `bind` open no Stage. A run that only reads a reference skill or helper adds nothing to the page.

Parallel callers, and callers outside an omp session, name the target on each write: `submit --flow <flow> --stage <id>`. There is no other default. A session with no binding and no named target is refused. Callers bound to different Stages of one Flow, such as two wayfinder tickets, write at the same time safely: each contribution commits whole against the latest state.

`show [--flow <flow>]` prints the Flow's structure: Stages with their labels and states, rounds, Q numbers, answer states, Results with each entry and the revision that last `changed` it, every link and backlink, its aliases, and its `presentation`.

## Find a Flow

`<flow>` is the Flow id that a receipt printed, or a qualified alias: `spec:<n>`, `ticket:<n>`, `branch:<name>`, `run:<id>`, `folder:<key>`, or `slug:<slug>`. The id never changes. Aliases only find it.

- `find <kind>:<value>` prints the one Flow that has the alias. No match, or several, is refused with the Flows it found; name one by id. Lookup never guesses.
- `alias [--flow <flow>] <kind>:<value>...` adds aliases, such as `spec:267` when a spec is published. Each Stage's ticket, the slug, and every folder the Flow has had are aliases already. Adding one again changes nothing.
- `move [--flow <flow>] --to <key>` moves the Flow's folder to the folder key `<key>`. Bindings, ids, anchors, and the old folder key keep working; only the `page` path changes. A key in use is refused, and a failed move leaves the Flow where it was.

Flows belong to the project of the current repo. Every worktree of the project sees the same Flows, and no other project can find or write them, even by id.

## Submit a contribution

`submit [<file> | -]` reads one contribution from a file or stdin:

```json
{ "version": 1, "items": [ { "kind": "round", "questions": [ ... ] } ] }
```

The script applies all items to the bound Stage, or refuses all of them. Give a new question, Topic note, Result, or Result entry a `ref` (lowercase letters, digits, and hyphens) when another item names it. An item can name a ref from the same contribution, or an id from an earlier receipt. Name a Result entry as `<result ref or id>/<entry ref or id>`.

Submitting the Stage's latest contribution again, for example after a lost receipt, applies nothing and prints its first receipt with `repeated: true`.

Item kinds and their fields:

- `background`: `title`, `summary` (one line), `sections` (one or more `{ heading, body }`), and `sources` (one or more strings, such as `GLOSSARY.md` or `[text](url)`). A Stage has one Background. Submit it before the Stage's first round.
- `topic`: optional `ref`, `title`, `summary`, `body`, and `sources`. The Topics tab shows each Topic note once and lists the questions that cite it.
- `result`: optional `ref`, `shape`, `title`, and an optional `summary` line. A Result shows a Stage's output before the questions it leads to, such as review findings, candidates, a ticket breakdown, run results, or a report.
  - `cards` has `entries`, each with optional `ref`, `title`, `label` (such as `issue`), `blocking` (`true` or `false`), `impact`, `action`, and `evidence`. In a review finding, `impact` opens with what a user or caller sees, and `evidence` gives the file and line.
  - `ledger` has `entries`, each with optional `ref`, `claim`, `status` (`confirmed`, `cleared`, or `unproven`), `evidence`, `missing_proof`, and `consequence`.
  - `table` has `columns` and `rows`, each row with optional `ref` and `cells`, one string per column.
  - `document` is long-form content, such as an explanation, research findings, or an investigation report. It has `sections`, in reading order, each with a `heading` and `blocks`. A block is one of `{ prose }`, `{ list, ordered }` (`ordered` is optional), `{ code, language, source }` (`language` and `source` are optional; `source` is the file and line), or `{ figure }`, naming an attachment. Optional `citations` are `{ ref, source }`; cite one in prose or a list item as `[@<ref>]`, and the script numbers it and links both ways. Optional `limitations` lists what the Document does not show, and optional `sources` lists what it was built from.
  - Any shape takes optional `attachments`, the attachments it shows, and `canonical`, the canonical record it was made from: `{ file }` (a path in the project), `{ commit }` (a hash), or `{ tracker, revision }` (such as `daandden/vstack#267` and the issue's updated time).
  - `revises` publishes a new revision of an earlier Result of the bound Stage, named by its id. Send the whole Result again. The page shows the new revision and keeps the earlier ones readable, and `show` gives the committing revision as the Result's and each entry's `changed`. A `{ file }` canonical link carries over with the file's current revision. A `{ commit }` or `{ tracker }` link must be given again with its new revision.
- `revise`: changes one Result of the bound Stage without resending it. `result` names the Result, or one entry as `<result>/<entry>`.
  - `set` replaces only the fields it names: an entry's fields, or a Result's `title` and `summary`. It needs `base`, the revision that `show` printed as that entry's or Result's `changed`. When someone changed it after `base`, the edit is refused as a conflict: run `show` and decide again.
  - `add` appends new entries or rows to a Result, in its shape. It needs no `base`.
- `attachment`: optional `ref`, `type`, `caption`, and `origin` (what produced it, such as the command or the browser step). `type` is `image` (PNG, JPEG, GIF, or WebP), `video` (MP4 or WebM), `svg`, `file`, `trace`, `evidence`, or `artifact`. Give `path`, the file to capture, or `unavailable`, the reason there is none. An `artifact` is a runnable thing that runs outside the page: give `launch` (how to run it) and `revision` (such as a commit) instead, and an optional `http(s)` `url`. Name each attachment in a Result's `attachments` or a Document `figure` in the same contribution.
- `assumed`: optional `ref`, `decision`, `pick`, and `why`, one decision settled without asking. `why` cites its repo fact with file and line, its ADR, or its convention. The page lists each Assumed pick before the rounds, and the close lists every one no question reopened.
- `round`: `questions`, in `ask` order. One contribution holds at most one round, because one round is one `ask`. Each question has optional `ref`, `title` (one question that ends with "?"), `description`, and `options`. Each option has `label` (the label alone; the script adds `A. `, `B. `), `does`, `gains`, `costs`, and an optional `recommended` reason on at most one option. A question can add:
  - `again`: the earlier question it asks again. In the same Stage it names a question of an earlier round and keeps that Q number. From a finished Stage it names that Stage's latest ask of the Q number and takes a new Q number here; both questions link to each other.
  - `reopens`: the Assumed pick it reopens, of this Stage or a finished one. That pick leaves the close; this question's decision replaces it.
  - `today`: `{ text, source }` facts about how things work now, each with its file-and-line source. Use it when the decision changes something that exists.
  - `terms`: `{ term, text }` Term notes, one line each, for names a newcomer does not know.
  - `topics`: Topic notes it builds on.
  - `results`: the Result entries it comes from. The page links them both ways.
  - `example`: text that makes the question concrete.
- `answer`: `question`, `response`, and, for words with no pick, `reading`. A question takes one answer. To reopen it, ask it again with `again`, which keeps the earlier answer beside the new one.
- `close`: `decisions`, one `{ question, text }` for the latest ask of each Q number of the Stage, and optional `extra` bullets. The close adds every Assumed pick of the Stage that no question reopened, and marks each decision as the user's pick, read from the user's words, or not the user's answer. A close with no decisions and no Assumed picks needs `extra`.
- `stage`: `{ "kind": "stage", "state": "finished" }` finishes the bound Stage. A finished Stage takes no more content. Add `retire`, one `{ question, reason }` for each latest ask that has no pick and no settled reading, saying why the Stage leaves it unresolved. Retired questions leave current work and keep their answer and reason.

Put each explanation in one place, so the page explains nothing twice. A question's own rationale goes in its `description`. Context that every question of the Stage needs goes in the Background. A concept that questions in several rounds or Stages build on goes in a Topic note. A name that one line defines is a Term note. The script stores each source string once, however many records cite it.

Text fields are plain text. A blank line starts a paragraph, a block of `- ` lines is a bullet list, and `` `code` `` and `[text](https://url)` links are kept. In Document and attachment text, a link to anything but `https://`, `http://`, or a `#` anchor is refused.

## Captured revisions

The script reads an attachment's file once, when you submit it, and stores its bytes in the Flow under their sha256. A `{ file }` canonical link records the file's sha256 at that time. Editing a source file later changes nothing on the page. To show the new content, submit the Result again with `revises`.

A `path` is relative to the working directory, or absolute, and must be a regular file inside the project or its Scratch dir. A path that leaves both, directly or through a symlink, is refused. An image or video must be one of the formats above, and an SVG with scripts, event handlers, embedded HTML, or script URLs is refused.

The script stores evidence byte for byte. Redact it as the producing skill's contract requires before you attach it, for example with every secret replaced by `<REDACTED>`.

## The receipt

A submit receipt holds the Flow and Stage ids, the committed `revision`, the absolute `page` path, its `presentation`, `refs` (each ref you gave, mapped to its assigned id), and, when the contribution has a round, `ask`. It does not repeat your content.

`ask` is the payload for the `ask` tool, in Q-number order: each question's id, its one-line `question` that starts with its Q number (`Q3. ...`), its option labels with their letters, and the index of the recommended option. Pass it to `ask` as it is.

## Every ask in a Flow

Every `ask` in a Flow is a question on its page, whichever skill asks it. Submit the round first, then ask with the receipt's `ask` payload and print the page path. The page question carries the description, trade-offs, and context; the `ask` carries only the numbered title and labels. A subagent never asks. It returns its open questions, and the top-level agent puts them on the page and asks them.

When `ask` returns, submit an `answer` for each question. `response` is what `ask` returned, unchanged: `status`, then `picks` (letters), `text` (the custom or Other text, or a note), and `note_on` (the letter of an option a note was written on without picking it), each only when present.

- `answered`: the user picked or wrote something. A pick is the answer, whatever its note says; it takes no `reading`.
- `empty`, `cancelled`, `timed-out`: the user gave no answer. Keep any automatic selection in `picks`; it stays out of the decision.
- `headless`: no user was asked. `picks` is the recommended option you substituted.

Words with no pick need a `reading`, your interpretation, kept apart from the words:

- `{ "outcome": "resolved", "decision", "basis", "maps_to"? }` when the words plainly settle the decision. `decision` is what is now true, `basis` is why the words settle it, and `maps_to` is the letter of the option they match. The page shows the user's words, your reading, and its basis, and records no pick.
- `{ "outcome": "question" | "concern" | "ambiguous", "unresolved" }` when they ask for information, raise a concern, or leave the choice open. `unresolved` is the part still to decide. Ask that part in the next round with `again`, and reply to the rest on the page.

Only a pick or a resolved reading is the user's answer. Everything else keeps the question open until it is asked again or its Stage retires it.

## Close the Stage

Submit a `close`. Write each decision as what is now true, in one or two plain sentences, not as the option label. Add `extra` bullets only when they apply: "Unchanged from earlier: ...", "Glossary: ...", and "Headless, not user-confirmed" for a close in a headless run. Then submit `{ "kind": "stage", "state": "finished" }` with its `retire` reasons when the Stage's skill finishes. If a retired question still matters later, ask it in the current Stage with `again`.

Finishing a Stage authorizes nothing. An action that needs the user's confirmation of the summary, such as a tracker write, still waits for the user's next prompt, as the calling skill says.

## Print the path

Never open the page. Print the plain absolute `page` path from the receipt, with no `file://` prefix.

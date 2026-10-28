---
name: flow-page
description: How a Flow keeps its Flow page through Stage-bound authoring. Covers opening or joining a Stage, historical page migration, finding a Flow by alias, moving its folder, closing and reopening the Flow, the typed contribution format, Document, Comparison, and Metrics Results, declarative state demos, typed attachments and captured revisions, focused Result revisions, the receipt and its ask payload, answers, closes, and refusals.
disable-model-invocation: true
---

The skill that runs a Stage says when each page step happens. This skill says how to do it. The Flow page replaces the Grilling page. Until a skill moves to this one, it keeps using `skill://grilling-page`.

You send meaning: questions, answers, decisions, notes, and Results. The script owns everything else: ids, Stage order and tab labels, round and Q numbers, option letters, timestamps, the links between records, storage, and the page itself. It renders the page from its own template and escapes every string you send. You never write HTML, CSS, or scripts, and a contribution that carries them is refused.

Run the script with the bash tool of this omp session, which sets `PI_SESSION_ID`, from inside the repo the work is about:

```sh
bun "$(realpath skill://flow-page/scripts/flow-page.ts)" <command> ...
```

Every command prints one JSON receipt on stdout. Exit 1 prints the refusal on stderr and writes nothing: fix what it names and run the command again. Exit 2 is a usage error.

A receipt always means the content is committed. Its `presentation` says what the static page shows: `current`, or `stale` with the older `revision` and the `error` that stopped the new page. A stale page keeps its last good content. Run `render --flow <flow>` to publish it again, and never resubmit committed content. `live` separately reports the Local Flow host.

## Continue a historical Grilling page

Run `migrate <grilling-folder>` from the project the page belongs to. The folder must be under that project's Scratch dir and contain `page.jsonl`. The receipt names the new Flow and its page. The original folder, page, and other Scratch files stay untouched. A handwritten page with no structured state is refused and stays readable as it is.

The migration keeps record ids, Q numbers, round times, questions, answers, sources, Topic notes, figures, and old fragment anchors. Report blocks become Results with their entries and question links. Text and HTML figures keep their content. Historical HTML is safety-checked and its CSS is scoped, not accepted as a new authoring format. SVG files become captured attachments. A missing or unsafe SVG stays unavailable with its reason, never fabricated.

Old Other answers show the recorded words, with no invented pick or reading. Old unanswered reasons stay unanswered. Unresolved asks of finished Stages retire from current work. Missing historical timestamps stay missing. The old records, including superseded versions, remain in the migrated provenance.

A historically closed Flow stays closed. Its 90-day retention starts at migration time because the historical format has no Flow close timestamp. Migration never backdates that lifecycle event to a round or Stage.

Run `show --flow <id>` to find the in-progress Stage, then `bind --flow <id> --stage <id>` to continue it. For finished work in an open Flow, open a new Stage. Use `reopen` for a closed Flow. Migration binds no session. Use only the new authoring contract after the cutover. Repeating `migrate` on unchanged state returns the same Flow with `repeated: true`; changed source state is refused instead of overwriting later work.

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

## Close or reopen the Flow

A Flow is open until it is closed. The skill that runs its last Stage says when the Flow's work is done.

- `close [--flow <flow>]` closes the Flow. Every Stage has to be finished first. A closed Flow takes no new Stage and no content, and its page stays readable. The receipt's `closed` is the close time.
- `reopen --skill <name> [--flow <flow>] [--parent <stage>] [--ticket <id>]` continues a closed Flow. It records the reopen and opens the new Stage in one step, and binds this session's agent to that Stage, as `open` does. The finished Stages stay as they were. `open --flow` refuses a closed Flow.

`show` prints `open` and the `lifecycle` records, oldest first. The page heading says when the Flow was closed or reopened.

Scratch cleanup never deletes an open Flow. It offers a closed Flow for deletion only after the Flow has been closed for 90 days, and the user still confirms the deletion. Reading the page, `show`, `find`, and `render` never move that date. The Flow's data, page, and captured files go together. Its id is never used again, so a later command that names it is refused with the report that its content is gone.

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
  - `prototype` is a declarative state demo the reader tries on the page. It has `demo`, with `states`, `start`, `actions`, and optional `values`:
    - `values` are what the demo shows, each `{ name, label, initial }`. `initial` is a number, `true` or `false`, or a string, and fixes the value's type.
    - `states` are `{ name, label, description }` (`description` is optional). `start` names the state the demo begins in.
    - `actions` are the reader's buttons, each `{ name, label, transitions }`. A transition has optional `from` (the states it leaves; any state when left out), `when` (a condition), `to` (the next state; the same state when left out), and `set` (value changes). An action runs its first transition that leaves the current state and whose `when` holds. With none, its button is unavailable.
    - A condition is `{ "value": "<name>", <op>: <literal> }` with op `eq`, `ne`, `lt`, `le`, `gt`, or `ge` (the last four compare numbers), or `{ "all": [...] }`, `{ "any": [...] }`, or `{ "not": {...} }`, nested at most 4 deep. A `set` change is a literal of the value's type, `{ "add": <number> }`, or `{ "toggle": true }` for a true-or-false value.
    - Names are lowercase letters, digits, and hyphens. A demo has at most 16 values, 32 states, 32 actions, and 16 transitions per action, and every state must be reachable from `start`. Nothing in a demo is evaluated as code: a condition or change written as an expression is refused.
    - The page adds Reset, which returns to `start` and every `initial`. The demo runs in the reader's browser, also in the static page, and keeps its state there. Clicking through it answers no question, records nothing in the Flow, and authorizes nothing. A video attachment's playback position stays in the browser the same way.
  - `comparison` puts alternatives side by side. It has `alternatives`, two or more `{ ref, name }` with an optional `summary` and `attachments` (that side's own evidence); `criteria`, one or more `{ ref, name }` with an optional `description`; `assessments`, at most one `{ alternative, criterion, finding }` per pair, with optional `evidence` (such as the file and line); and `verdict`, the verdict you recorded: `{ outcome, reason }`, where `outcome` is `chosen` with `alternative` naming the choice, or `tie` or `inconclusive` with no `alternative`. A pair with no assessment shows as not assessed.
  - `metrics` carries measurements. It has `workload` (what was measured, such as the operation and its inputs), an optional `environment`, `outcome` (the outcome as you report it), `series` (each `{ ref, label }`, such as a commit or a variant, with `baseline: true` on at most one), and `measurements`. Each measurement has `ref`, `name`, `unit`, optional `better` (`lower` or `higher`), an optional reported `verdict` (`better`, `worse`, `no-difference`, or `inconclusive`), and `values`. A value is `{ series, value }`, where `value` is a JSON number, with optional `samples` (the run count) and `uncertainty` (`{ low, high, of }` or `{ plusminus, of }`, where `of` names it, such as `min to max` or `95% CI`), or `{ series, missing }` with the reason there is none. A series with no value shows as missing, never as zero. The script draws each measurement's bars and computes each value's change from the baseline; it rates nothing, so a verdict appears only when you give one.
    - Each measurement's bars share a scale from zero. A measurement with a negative value keeps its numeric table and has no bars.
    - Deltas use the measurement's unit. A `%` measurement uses `pp` for its absolute delta. A zero baseline has no relative percentage. A delta outside the numeric range shows as unavailable.
  - Any shape takes optional `attachments`, the attachments it shows, and `canonical`, the canonical record it was made from: `{ file }` (a path in the project), `{ commit }` (a hash), or `{ tracker, revision }` (such as `daandden/vstack#267` and the issue's updated time).
  - `revises` publishes a new revision of an earlier Result of the bound Stage, named by its id. Send the whole Result again. The page shows the new revision and keeps the earlier ones readable, and `show` gives the committing revision as the Result's and each entry's `changed`. A `{ file }` canonical link carries over with the file's current revision. A `{ commit }` or `{ tracker }` link must be given again with its new revision.
- `revise`: changes one Result of the bound Stage without resending it. `result` names the Result, or one entry as `<result>/<entry>`. A Document, Comparison, Metrics Result, or demo has no entries; publish its next revision with `revises`.
  - `set` replaces only the fields it names: an entry's fields, or a Result's `title` and `summary`. It needs `base`, the revision that `show` printed as that entry's or Result's `changed`. When someone changed it after `base`, the edit is refused as a conflict: run `show` and decide again.
  - `add` appends new entries or rows to a Result, in its shape. It needs no `base`.
- `attachment`: optional `ref`, `type`, `caption`, and `origin` (what produced it, such as the command or the browser step). `type` is `image` (PNG, JPEG, GIF, or WebP), `video` (MP4 or WebM), `svg`, `file`, `trace`, `evidence`, or `artifact`. Give `path`, the file to capture, or `unavailable`, the reason there is none. An `artifact` is a runnable thing that runs outside the page: give `launch` (how to run it) and `revision` (such as a commit) instead, and an optional `http(s)` `url`. Name each attachment in a Result's `attachments`, a Document `figure`, or a Comparison alternative's `attachments` in the same contribution.
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
- `task`, `blocker`, `end-state`, `pr`, and `check` record workflow progress, as [Record progress](#record-progress) says.

Put each explanation in one place, so the page explains nothing twice. A question's own rationale goes in its `description`. Context that every question of the Stage needs goes in the Background. A concept that questions in several rounds or Stages build on goes in a Topic note. A name that one line defines is a Term note. The script stores each source string once, however many records cite it.

Text fields are plain text. A blank line starts a paragraph, a block of `- ` lines is a bullet list, and `` `code` `` and `[text](https://url)` links are kept. In Document, Comparison, Metrics, and attachment text, a link to anything but `https://`, `http://`, or a `#` anchor is refused.

## Captured revisions

The script reads an attachment's file once, when you submit it, and stores its bytes in the Flow under their sha256. A `{ file }` canonical link records the file's sha256 at that time. Editing a source file later changes nothing on the page. To show the new content, submit the Result again with `revises`.

A `path` is relative to the working directory, or absolute, and must be a regular file inside the project or its Scratch dir. A path that leaves both, directly or through a symlink, is refused. An image or video must be one of the formats above, and an SVG with scripts, event handlers, embedded HTML, or script URLs is refused.

The script stores evidence byte for byte. Redact it as the producing skill's contract requires before you attach it, for example with every secret replaced by `<REDACTED>`.

## The receipt

A submit receipt holds the Flow and Stage ids, the committed `revision`, the absolute static `page` path, its `presentation`, `live`, `refs` (each ref you gave, mapped to its assigned id), and, when the contribution has a round, `ask`. It does not repeat your content.

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

## Record progress

The Overview opens with a progress strip built from these items. Each is its own fact. A finished Stage, a task count, a PR, a check, and the End state never stand in for one another, and the script never derives one from another. Record what you did and saw; the strip shows nothing you did not record.

- `task`: a step of the Flow's work. A new task has optional `ref`, `title`, and optional `state`, `evidence`, and `reason`. Update it with `{ "kind": "task", "task": "<ref or id>", ... }` and only the fields that change. Do not send the title again. The states are `pending` (the default), `active`, `done`, `skipped`, and `inapplicable`.
  - `done` needs `evidence`: one or more strings, such as a command and its outcome, a commit, or a path. Evidence adds to what the task has.
  - `skipped` and `inapplicable` need a `reason`. They are not left work. Use `inapplicable` for a step that does not apply to this Flow, such as the commit in an explanation.
  - Any in-progress Stage of the Flow can update a task, such as an implement Stage that finishes a task that a to-tickets Stage recorded.
- `blocker`: `text` and optional `ref` and `tasks` it blocks. An open blocker marks its tasks blocked. Resolve it with `{ "kind": "blocker", "blocker": "<ref or id>", "resolved": "<what cleared it>" }`.
- `end-state`: `requested` is `commit`, `merge-ready`, `shipped`, or `none` for a Flow that delivers no commit or PR, such as an explanation. Record it when the Flow settles it. `reached` is `commit`, `merge-ready`, or `shipped`, with `evidence`, when the delivery actually got there. A Flow with `none` reaches no End state.
- `pr`: a new PR has `url`, `state` (`open`, `merged`, or `closed`), and optional `ref` and `title`. Update it with `{ "kind": "pr", "pr": "<ref or id>", "state": ... }`.
- `check`: `name`, `outcome` (`passed`, `failed`, or `pending`), and optional `ref`. A passed or failed check needs `evidence`. Update it with `{ "kind": "check", "check": "<ref or id>", "outcome": ..., "evidence": [...] }`.

The strip reads complete when the Flow has at least one task, no task is `pending` or `active`, no blocker is open, and its requested End state is `none` or reached. It does not close the Flow. `show` prints the same facts under `progress`.

## Present the page

Never open the page automatically. When `live.state` is `serving`, print `live.url`. That scoped read link stays the same across folder moves and host restarts. When `live.state` is `unavailable`, print the plain absolute `page` path and `live.error`. The contribution remains committed. `live.state: "off"` means static-only mode.

The script starts one detached Local Flow host for the user's home. The default loopback port is `42000 + uid % 10000`. `VSTACK_FLOW_PORT` selects a different port before startup. The running host's discovery record takes precedence until it stops. Hosts with different code or Bun runtimes report incompatibility instead of serving a page with an old renderer. Run `host stop` to stop that authenticated host, then retry the original command.

`host status` reports the host without starting it. `host stop` stops only the host authenticated by this home's private credential. A port held by another program or another home's host stays untouched. The private discovery and secrets live under `<home>/.vstack/host/`; do not attach these files as evidence.

The host stops after 30 idle minutes with no connected reader, publication, or progress sync. `VSTACK_FLOW_IDLE_SECONDS` changes that duration. Set `VSTACK_FLOW_HOST=off` for static-only authoring. Static pages remain readable with the server stopped. Browser links grant read access to one Flow, never authoring, host control, commands, tracker mutations, or merging.

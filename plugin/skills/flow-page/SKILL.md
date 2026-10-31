---
name: flow-page
description: Publish Flow questions and results through the shared Stage, ask, and receipt protocol.
disable-model-invocation: true
---

The skill that runs a Stage says when each page step happens. This skill says how to do it. The Flow page replaced the Grilling page, and this script is the only page writer.

You send meaning: questions, answers, decisions, notes, and Results. The script owns ids, Stage labels, round and Q numbers, option letters, timestamps, links, storage, and the page. It escapes every string you send. You never write raw HTML, CSS, or scripts into contributions. Safe text figures are escaped, and SVGs and images are captured attachments.

Result block is the canonical name for a Stage's output. Result is its authoring short form.

Run the script from inside the repo the work is about. The extension supplies your `--session` and `--agent` arguments before each turn. Use them on authoring commands, especially in subagents: bash sets `PI_SESSION_ID` but supplies no agent id.

```sh
bun "$(realpath skill://flow-page/scripts/flow-page.ts)" <command> ...
```

Every command prints one JSON receipt on stdout. Exit 1 prints the refusal on stderr and commits no Flow content. On-demand startup may still write host lifecycle metadata. Fix what the refusal names and run the command again. Exit 2 is a usage error.

A receipt always means the content is committed. Its `presentation` says what the static page shows: `current`, or `stale` with the older `revision` and the `error` that stopped the new page. A stale page keeps its last good content. Run `render --flow <flow>` to publish it again, and never resubmit committed content. `live` separately reports the Local Flow host.

## Continue a historical Grilling page

Run `migrate <grilling-folder>` from the project the page belongs to. The folder must be under that project's Scratch dir and contain `page.jsonl`. The receipt names the new Flow and its page. The original folder, page, and other Scratch files stay untouched. A handwritten page with no structured state is refused and stays readable as it is.

The migration keeps record ids, Q numbers, round times, questions, answers, sources, Topic notes, figures, and old fragment anchors. Declared reader needs and visual kinds survive. Records that predate them stay unknown rather than receiving invented needs. Report blocks become Results with their entries and question links. Text and HTML figures keep their content. Historical HTML is safety-checked and its CSS is scoped, not accepted as a new authoring format. SVG files become captured attachments. A missing or unsafe SVG stays unavailable with its reason, never fabricated.

Old Other answers show the recorded words, with no invented pick or reading. Old unanswered reasons stay unanswered. Unresolved asks of finished Stages retire from current work. Missing historical timestamps stay missing. The old records, including superseded versions, remain in the migrated provenance.

A historically closed Flow stays closed. Its 90-day retention starts at migration time because the historical format has no Flow close timestamp. Migration never backdates that lifecycle event to a round or Stage.

Run `show --flow <id>` to find the in-progress Stage, then `bind --flow <id> --stage <id>` to continue it. For finished work in an open Flow, open a new Stage. Use `reopen` for a closed Flow. Migration binds no session. Use only the new authoring contract after the cutover. Repeating `migrate` on unchanged state returns the same Flow with `repeated: true`. Changed source state is refused instead of overwriting later work.

## Stage entry/exit line

Every result-producing skill follows this line once per run. Producers cite this section and specify only their own content. Reading a reference, using a helper, returning machine facts, or performing another test cycle within an existing run opens no empty Stage.

1. Discover the Flow through [Find a Flow](#find-a-flow). Use the extension's `--session` and `--agent` on every command. Save the caller's binding and Stage before a nested run. A binding belongs to one project, session, and agent, never the globally last active Stage.
2. Open one Stage before the run's first contribution or ask. Use `open --skill <name> --flow <flow>` on an open Flow, adding `--parent <caller-stage>` for a nested run or continuation of finished work and `--ticket <id>` for ticket work. A closed Flow requires explicit `reopen --skill <name> --flow <flow>` with those same context flags. Only after discovery proves no matching modern or supported historical Flow exists, start one with `open --skill <name> --title <title>`. Its optional `--slug` has 3 to 5 words.
3. Publish the run's Results and every real ask through [Submit a contribution](#submit-a-contribution), [The receipt](#the-receipt), and [Every ask in a Flow](#every-ask-in-a-flow). A nested result-producing run owns its own Stage even when its caller has an active Stage. A helper that only supplies evidence returns it to the owning producer without creating a separate run. Pass explicit Flow and Stage ids to parallel workers. Workers return structured results and open questions to their coordinator unless the brief explicitly assigns publication. A run-only verifier returns its machine record without authoring.
4. On every return, including blocked returns, publish the actual outcome and follow [Close the Stage](#close-the-stage). Restore the saved caller binding with `bind --flow <flow> --stage <caller-stage>` when that Stage is still in progress. A finished caller cannot accept a new binding or more content. Leave the Flow open unless [Close or reopen the Flow](#close-or-reopen-the-flow) applies.

`open` binds only this session's agent to the new Stage. Later commands use that binding. `bind --flow <flow> --stage <id>` resumes an existing in-progress run, not a new nested result-producing run. Loading this skill, reading a page, `show`, and `bind` open no Stage. An unbound write without an explicit target is refused.

Parallel callers and callers outside an omp session name `--flow <flow> --stage <id>` on every write. Contributions from different Stages commit whole against the latest state. Reading content takes its immutable position at the first successful commit, in submitted item order and declared question order. Answers and Result revisions update their original blocks with history, not duplicate publications. Refusal allocates no positions; replay preserves the committed positions. Content whose publication order was not recorded stays behind an explicit retained-order historical boundary.

`show [--flow <flow>]` prints the Flow's structure: Stages with their labels, states, and open-question counts, rounds, Q numbers, answer states, Results with each entry and the revision that last `changed` it, every link and backlink, its aliases, and its `presentation`. Its `reading` separates retained historical references from durable publications with immutable `position` and committing `publication` revision. Its `next` lists actionable questions in navigation order, newest in-progress Stage first, independently of reading order.

`bound` returns this session and agent's binding with its `page`, projection status, and `live` status. When none exists, it returns `{"binding":null}` without starting a host or creating a Flow. Bindings persist across session continuation. A different session or agent gets only its own binding, never the last active Stage.

The extension presents the bound Flow URL after every main-agent reply, including blockers and follow-up explanations with no new Result. It starts no model turn and opens no browser. When live serving fails, it presents the static path and the observed error. Your reply still summarizes the work. It need not repeat the link.

## Find a Flow

`<flow>` is the immutable id from a receipt or a qualified alias: `spec:<n>`, `ticket:<n>`, `branch:<name>`, `run:<id>`, `folder:<key>`, or `slug:<slug>`. Every worktree of the project sees the same Flows. Other projects cannot find or write them.

1. Use a supplied Flow id or historical source path first. Otherwise run `find` for the work's known alias, including a ticket's parent spec, then use this session and agent's `bound` Flow when no work-specific identity is supplied.
2. `find <kind>:<value>` searches modern Flows and supported structured historical sources before reporting no match. A modern match returns the Flow. A historical match returns `migration_required: true` and `historical` candidates with `source`, `title`, `aliases`, and `open`. Run explicit `migrate <source>` and continue the returned Flow. Discovery itself migrates nothing. Multiple modern or historical matches are ambiguous. Resolve the named ids or source paths instead of guessing or starting a duplicate Flow.
3. Start a new Flow only after discovery reports no match. Failed migration is not a missing Flow. An expired identity stays expired even when its retained historical source still exists.

`alias [--flow <flow>] <kind>:<value>...` adds aliases, such as `spec:267` after publication. A Stage's ticket, the slug, and every folder the Flow has had are aliases already. Adding one again changes nothing.

`move [--flow <flow>] --to <key>` changes the folder key. Bindings, ids, anchors, and the old folder alias keep working. Only the static `page` path changes. A key in use is refused. A failed move leaves the Flow where it was.

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

Read only the field contract for the kind you are about to publish:

- Before a Background, Topic note, round, answer, Assumed pick, close, Stage state, or progress item, read the relevant section of [Contribution fields, version 1](references/contributions.md).
- Before publishing or revising a Result, read [Result fields, version 1](references/results.md). It includes cards, review, ledger, table, Document, Code/diff, and Timeline.
- Before Comparison or Metrics, also read [Comparison and Metrics fields](references/comparison-metrics.md).
- Before a prototype demo, runnable-artifact Result, or Quiz, also read [Interactive Result fields](references/interactive-results.md).
- Before capturing attachments, canonical file revisions, question/Background figures, option previews, or real HTML/app/terminal artifacts, read [Captured attachments](references/attachments.md). Capture actual redacted evidence and preserve canonical deliverables.
- Before every new or re-asked question, read [Reader needs and Visual kinds](references/reader-needs.md). Declare and satisfy the actual needs, then publish the complete question once, atomically with its visuals.


## The receipt

A submit receipt holds the Flow and Stage ids, the committed `revision`, the absolute static `page` path, its `presentation`, `live`, `refs` (each ref you gave, mapped to its assigned id), and, when the contribution has a round, `ask`. It does not repeat your content.

`ask` is the payload for the `ask` tool, in Q-number order: each question's id, its one-line `question` that starts with its Q number (`Q3. ...`), its option labels with their letters, and the index of the recommended option. Pass it to `ask` as it is.

## Every ask in a Flow

Every `ask` in a Flow is a question on its page, whichever skill asks it. Submit the round first, then ask with the receipt's `ask` payload and print the page path. The page question carries the description, trade-offs, and context. The `ask` carries only the numbered title and labels. A subagent never asks. It returns its open questions, and the top-level agent puts them on the page and asks them.

For Ratchet's native approval gate, publish the complete question and review material first, then pass its receipt's numbered title and page pointer to `r.approve()` as `skill://tune-llm-flow` says. The native gate, not a second ordinary `ask`, collects that approval. Record only the outcome the native host identifies, preserving reused approval, revision feedback, abort, dismissal, cancellation, and unanswered states separately.

When `ask` returns, normalize its native output into one `answer` per question. The Flow's `response` has `status`, optional `picks` as letters, `text` for the user's verbatim custom words or note, and `note_on` for the letter of an unpicked option the note concerns. These are Flow fields, not a claim that the native tool returns those field names.

Observed native omp forms:

- A multi-question result has `details.results[]` entries with question ids. Match each entry to the receipt by id. A single-question result can instead have `details.question` and no id. It belongs to the one question just asked.
- `selectedOptions` contains labels, such as `"A. Keep local"`. Match them to the receipt's options and record their letters in `picks`. Set `status: "answered"` only for an explicit user selection, not a default supplied after timeout, cancellation, or a headless run.
- `customInput` becomes `text` unchanged. When the user supplied it with an empty `selectedOptions`, it is words without a pick, so record `status: "answered"` and a separate reading.
- A whole-call cancellation can return a tool error saying the ask was cancelled, with no per-question results. Record `cancelled` for each unanswered question in that call. Preserve earlier recorded answers, but never reconstruct a partial answer that the tool did not return.

Keep any other observed note text, note target, timeout, cancellation, and automatic-selection evidence honest. Use `note_on`, `timed-out`, or `cancelled` only when the tool reports that meaning. An empty selection alone proves neither timeout nor cancellation. An unrelated tool failure is not a cancelled answer: report the failure on the Stage and leave its questions unanswered. Never invent native fields or interpret a supplied default as the user's choice.

- `answered`: the user picked or wrote something. A pick is the answer, whatever its note says. It takes no `reading`.
- `empty`, `cancelled`, `timed-out`: the user gave no answer. Keep any automatic selection in `picks`. It stays out of the decision.
- `headless`: no user was asked. `picks` is the recommended option you substituted.

Words with no pick need a `reading`, your interpretation, kept apart from the words:

- `{ "outcome": "resolved", "decision", "basis", "maps_to"? }` when the words plainly settle the decision. `decision` is what is now true, `basis` is why the words settle it, and `maps_to` is the letter of the option they match. The page shows the user's words, your reading, and its basis, and records no pick.
- `{ "outcome": "question" | "concern" | "ambiguous", "unresolved" }` when they ask for information, raise a concern, or leave the choice open. `unresolved` is the part still to decide. Ask that part in the next round with `again`, and reply to the rest on the page.

Only a pick or a resolved reading is the user's answer. Everything else keeps the question open until it is asked again or its Stage retires it.

## Close the Stage

Submit a `close`. Write each decision as what is now true, in one or two plain sentences, not as the option label. Add `extra` bullets only when they apply: "Unchanged from earlier: ...", "Glossary: ...", and "Headless, not user-confirmed" for a close in a headless run. Then submit `{ "kind": "stage", "state": "finished" }` with its `retire` reasons when the Stage's skill finishes. If a retired question still matters later, ask it in the current Stage with `again`.

Finishing a Stage authorizes nothing. An action that needs the user's confirmation of the summary, such as a tracker write, still waits for the user's next prompt, as the calling skill says.

## Record progress

Before recording tasks, blockers, End state, PRs, or checks, read [Record progress](references/contributions.md#record-progress). Authored records and host observations stay separate. Neither a finished Stage nor a green observation authorizes delivery or closes the Flow.

## Configure or present the local host

Before configuring adapters, recovering checkout context, diagnosing host startup, choosing an isolated `--home` namespace, or presenting a live/static fallback, read [Local host and read-only observations](references/host-observations.md). It defines the GitHub built-ins, the separate provider-neutral HTTP JSON override, GitLab limits, freshness states, port ownership, credentials, and lifecycle settings.

For keyboard navigation or reader help, read [Read the Flow page](references/reading.md).

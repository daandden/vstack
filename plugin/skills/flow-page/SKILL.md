---
name: flow-page
description: Publish Flow questions and Results, use ordinary ask, and record observed responses.
disable-model-invocation: true
---

The skill that runs a Stage says when each page step happens. This skill says how to do it. The Flow page replaced the Grilling page, and this script is the only page writer.

You send meaning: questions, answers, decisions, notes, and Results. The script owns ids, Stage labels, round and Q numbers, option letters, timestamps, links, and storage. The Local Flow host serves the page as a built reader. You never write raw HTML, CSS, or scripts into contributions: the reader shows every string you send as text. Safe text figures stay text. Diagrams are captured Mermaid source that the reader draws with Pele. SVGs and images are captured attachments.

Result block is the canonical name for a Stage's output. Result is its authoring short form.

Run the script from inside the repo the work is about. The extension supplies your `--session` and `--agent` arguments before each turn. Use them on authoring commands, especially in subagents: bash sets `PI_SESSION_ID` but supplies no agent id.

```sh
bun "$(realpath skill://flow-page/scripts/flow-page.ts)" <command> ...
```

Commands print JSON on stdout, except `describe --compact`, which prints field lines. `validate` returns `{ "ok": true, "diagnostics": [] }` on success. A refused `validate` or `submit` returns `{ "ok": false, "diagnostics": [...] }`, prints a readable refusal on stderr, and exits 1 without committing Flow content. Other commands print their receipt on success and their refusal on stderr. Exit 2 is a usage error.

A successful submit receipt means the content is committed. Its `live` says whether the reader can show it: `serving` with the Flow `url`, `unavailable` with the `error` the host reported, or `off` when `VSTACK_FLOW_HOST=off`. The reader needs the Local Flow host. There is no static file to open instead. When the host is unavailable, never resubmit committed content: fix what `error` names, then run `bound` or `show` for the URL.

## Continue a historical Grilling page

Run `migrate <grilling-folder>` from the project the page belongs to. The folder must be under that project's Scratch dir and contain `page.jsonl`. The receipt names the new Flow and its `live` URL. The original folder, page, and other Scratch files stay untouched. A handwritten page with no structured state is refused and stays readable as it is.

The migration keeps record ids, Q numbers, round times, questions, answers, sources, Topic notes, figures, and old fragment anchors. Declared reader needs and visual kinds survive. Records that predate them stay unknown rather than receiving invented needs. Report blocks become Results with their entries and question links. Text and HTML figures keep their content. Historical HTML is safety-checked and its CSS is scoped, not accepted as a new authoring format. SVG files become captured attachments. A missing or unsafe SVG stays unavailable with its reason, never fabricated.

Old Other answers show the recorded words, with no invented pick or reading. Old unanswered reasons stay unanswered. Unresolved asks of finished Stages retire from current work. Missing historical timestamps stay missing. The old records, including superseded versions, remain in the migrated provenance.

A historically closed Flow stays closed. Its 15-day retention starts at migration time because the historical format has no Flow close timestamp. Migration never backdates that lifecycle event to a round or Stage.

Run `show --flow <id>` to find the in-progress Stage, then `bind --flow <id> --stage <id>` to continue it. For finished work in an open Flow, open a new Stage. Use `reopen` for a closed Flow. Migration binds no session. Use only the new authoring contract after the cutover. Repeating `migrate` on unchanged state returns the same Flow with `repeated: true`. Changed source state is refused instead of overwriting later work.

## Stage entry/exit line

Every result-producing skill checks enrollment once per run, before discovery or creation. Producers cite this section and specify only their own content. A run enters a Flow only when one of these holds:

- The caller supplies a Flow or Stage for this work.
- This session and agent already hold a binding for this work. The extension's per-turn context names their own binding when one exists.
- The user typed `/skill:<name>` for the running skill, or asked in words for a page or Flow. omp's native `User invoked the "<name>" skill` header is that expanded typed command, even when the slash token is absent.

When any case matches, execute the numbered Stage entry/exit steps below. For a typed run without a binding, discover its Flow and use `open` to create the binding.

Selecting or reading research, explain, or another skill from its description is not enrollment. Reading a reference, using a helper, returning machine facts, or performing another test cycle within an existing run opens no empty Stage.

Without enrollment, run the producer as chat. Skip Flow discovery, authoring, Stage, and receipt steps, and put the full useful output in chat rather than a page-only summary. Use plain `ask` for questions, with their context in chat. Still write canonical research notes and every other file the producer requires. The steps below and producers' Flow publication instructions apply only in a Flow.

For a long run without enrollment, only the main agent posts interim progress through `out://`; omp refuses subagents. Use the `write` tool to `out://` or a short bash `> out://` command in the foreground. Never post from inside a long or backgrounded command: omp refuses writes once a job moves to the background, including automatic backgrounding after 60 seconds.

`out://` is available by default in the interactive TUI, or in any session with `out.enabled` set. Print, RPC, and ACP sessions refuse writes by default. If a write is refused or unavailable, continue the run, stop posting through `out://` for that run, and put its progress in the final reply. An enrolled run keeps progress on the Flow page only.

1. Discover the Flow through [Find a Flow](#find-a-flow). Use the extension's `--session` and `--agent` on every command. Save the caller's binding and Stage before a nested run. A binding belongs to one project, session, and agent, never the globally last active Stage.
2. Open one Stage before the run's first contribution or ask. Use `open --skill <name> --flow <flow>` on an open Flow, adding `--parent <caller-stage>` for a nested run or continuation of finished work and `--ticket <id>` for ticket work. A closed Flow requires explicit `reopen --skill <name> --flow <flow>` with those same context flags. Only after discovery proves no matching modern or supported historical Flow exists, start one with `open --skill <name> --title <title>`. Its optional `--slug` has 3 to 5 words.
3. Publish the run's Results and every real ask through [Submit a contribution](#submit-a-contribution), [The receipt](#the-receipt), and [Every ask in a Flow](#every-ask-in-a-flow). A nested result-producing run owns its own Stage even when its caller has an active Stage. A helper that only supplies evidence returns it to the owning producer without creating a separate run. Pass explicit Flow and Stage ids to parallel workers. Workers return structured results and open questions to their coordinator unless the brief explicitly assigns publication. A run-only verifier returns its machine record without authoring.
4. On every return, publish the actual outcome. A recoverable blocker leaves the owning Stage in progress; record the blocker and resume that Stage when it clears. Follow [Close the Stage](#close-the-stage) only when the skill's work completes or is deliberately abandoned. Restore the saved caller binding with `bind --flow <flow> --stage <caller-stage>` when that Stage is still in progress. A finished caller cannot accept a new binding or more content. Leave the Flow open unless [Close or reopen the Flow](#close-or-reopen-the-flow) applies.

`open` binds only this session's agent to the new Stage. Later commands use that binding. `bind --flow <flow> --stage <id>` resumes an existing in-progress run, not a new nested result-producing run. Loading this skill, reading a page, `show`, and `bind` open no Stage. An unbound write without an explicit target is refused.

Parallel callers and callers outside an omp session name `--flow <flow> --stage <id>` on every write. Contributions from different Stages commit whole against the latest state. Reading content takes its immutable position at the first successful commit, in submitted item order and declared question order. Answers and Result revisions update their original blocks with history, not duplicate publications. Refusal allocates no positions; replay preserves the committed positions. Content whose publication order was not recorded stays behind an explicit retained-order historical boundary.

`show [--flow <flow>]` prints the Flow's structure: Stages with their labels, states, and open-question counts, rounds, Q numbers, answer states, Results with each entry and the revision that last `changed` it, every link and backlink, its aliases, and its `live` status. Its `reading` separates retained historical references from durable publications with immutable `position` and committing `publication` revision. Its `next` lists actionable questions in navigation order, newest in-progress Stage first, independently of reading order.

When the Flow has a Matt flow path, `show` also prints its path and current position, derived from the recorded Stages.

`bound` returns this session and agent's binding with its `live` status. When none exists, it returns `{"binding":null}` without starting a host or creating a Flow. Bindings persist across session continuation. A different session or agent gets only its own binding, never the last active Stage.

`target --session <id>` returns that session's main-agent page target for Tern. [Session targets and Picker presence](references/host-observations.md#session-targets-and-picker-presence) defines its runtime query and extension-owned presence commands.

Present Flow links only at question handoffs under "Every ask in a Flow", including Ratchet's native approval exception. Result-only replies and completion summaries have no Flow link or path reminder. The extension supplies hidden authoring context without a post-reply message, and `/vstack-clean` writes nothing to a Flow. Never open a browser automatically.

## Find a Flow

`<flow>` is the immutable id from a receipt or a qualified alias: `spec:<n>`, `ticket:<n>`, `branch:<name>`, `run:<id>`, `folder:<key>`, or `slug:<slug>`. Every worktree of the project sees the same Flows. Other projects cannot find or write them.

1. Use a supplied Flow id or historical source path first. Otherwise run `find` for the work's known alias, including a ticket's parent spec, then use this session and agent's `bound` Flow when no work-specific identity is supplied.
2. `find <kind>:<value>` searches modern Flows and supported structured historical sources before reporting no match. A modern match returns the Flow. A historical match returns `migration_required: true` and `historical` candidates with `source`, `title`, `aliases`, and `open`. Run explicit `migrate <source>` and continue the returned Flow. Discovery itself migrates nothing. Multiple modern or historical matches are ambiguous. Resolve the named ids or source paths instead of guessing or starting a duplicate Flow.
3. Start a new Flow only after discovery reports no match. Failed migration is not a missing Flow. An expired identity stays expired even when its retained historical source still exists.

`alias [--flow <flow>] <kind>:<value>...` adds aliases, such as `spec:267` after publication. A Stage's ticket, the slug, and every folder the Flow has had are aliases already. Adding one again changes nothing.

`move [--flow <flow>] --to <key>` changes the folder key. Bindings, ids, anchors, the Flow URL, and the old folder alias keep working. A key in use is refused. A failed move leaves the Flow where it was.

## Close or reopen the Flow

A Flow is open until it is closed. The skill that runs its last Stage says when the Flow's work is done.

- `close [--flow <flow>]` closes the Flow. Every Stage has to be finished first. A closed Flow takes no new Stage and no content, and its page stays readable. The receipt's `closed` is the close time.
- `reopen --skill <name> [--flow <flow>] [--parent <stage>] [--ticket <id>]` continues a closed Flow. It records the reopen and opens the new Stage in one step, and binds this session's agent to that Stage, as `open` does. The finished Stages stay as they were. `open --flow` refuses a closed Flow.

`show` prints `open` and the `lifecycle` records, oldest first. The page heading says when the Flow was closed or reopened.

Scratch cleanup never deletes an open Flow. It offers a closed Flow for deletion only after the Flow has been closed for 15 days, and the user still confirms the deletion. Reading the page, `show`, and `find` never move that date. The Flow's data and captured files go together. Its id is never used again, so a later command that names it is refused with the report that its content is gone.

## Submit a contribution

`submit [<file> | -]` reads a version 1 contribution with an `items` array from a file or stdin. Use it for question rounds, Results, answers, Stage state, and progress. A question contribution includes exactly one complete `round`, with its related Results, Assumed picks, and new attachments when needed. Publication and ordinary `ask` are separate operations.

The script applies all items to the bound Stage, or refuses all of them. Give a new question, Topic note, Result, or Result entry a `ref` (lowercase letters, digits, and hyphens) when another item names it. An item can name a ref from the same contribution, or an id from an earlier receipt. Name a Result entry as `<result ref or id>/<entry ref or id>`.

To correct a finished Stage's Result or entry, publish ordinary replacement content and a `corrects` item together in a later Stage. Read [Correction fields](references/contributions.md) before writing the relation. The original stays in place with a warning and link. A closed Flow must be reopened first.

Submitting the Stage's latest contribution again, for example after a lost receipt, applies nothing and prints its first receipt with `repeated: true`. This deduplicates publication, not asking. If the picker lost or never showed a question and no response is recorded, apply the own-run recovery rule: resubmit the same contribution to recover its receipt, then retry `ask` once with the same generated payload. A recorded cancellation, timeout, or empty response is not an infrastructure failure. Once a non-consent response is recorded, author a linked round with `again` before asking it again; preserve the earlier attempt and Q number.

## Validate without publishing

`validate [<file> | -]` checks the same contribution that `submit` accepts, from a file or stdin. Both commands use the bound Stage, or an explicit `--flow <flow> --stage <id>`. Validation checks against the current Flow, including references, captured files, and revision conflicts. A later concurrent write can change that context before submission.

Validation starts no Stage or host, publishes no assets or content, and leaves the Flow revision and the contribution file unchanged. It returns all independent diagnostics with stable `code`, JSON `path`, `message`, and `allowed` values or an expected type where applicable. Dependent checks wait until their containing field has a valid shape.

For example, an invalid option's gains can produce:

```json
{ "ok": false, "diagnostics": [{ "code": "invalid_type", "path": "$.items[0].questions[0].options[0].gains", "message": "must be array of non-empty strings", "allowed": "array of non-empty strings" }] }
```

The codes are `required_field`, `unknown_field`, `invalid_type`, `invalid_enum`, `invalid_union`, `too_few_items`, `too_many_items`, `invalid_length`, `out_of_range`, `invalid_value`, `invalid_reference`, and `invalid_json`. Correct every reported field, validate again, then submit the unchanged contribution. `submit` uses the same validator and returns the same diagnostics if the Flow and files have not changed.

## Discover contribution fields

Run `catalog` to list every Result shape with its one-line purpose and every contribution kind. Run `describe <shape>` or `describe <kind>` for its JSON field contract. Add `--compact` for one line per field. For example, `describe round` includes questions and options, and `describe answer` includes responses and readings. These commands need no Flow binding, start no host, and write no Flow content. Without `--home`, `describe` and `catalog` run the installed runtime, so an older install lacks newer kinds until the plugin is updated.

Discovery reads the same field metadata as `validate` and `submit`. JSON includes nested `fields`, `required`, enum `values`, array bounds, and `variants`. Conditional contracts include `selection`, which says when each variant applies. Progress kinds with separate creation and update fields expose both variants. String items marked `expected: "non-empty string"` reject empty or whitespace-only values. `oneOf` requires exactly one of the named fields. Recursive contracts use `$ref` paths within `contract`.

Compact lines show the field path, type, `required=true` or `required=false`, enum values, and applicable bounds. `[]` means an array item, `[*]` a record value, and `<name>` a union variant. A variant's required fields apply when that variant is selected. A field marked `oneOf` belongs to an exclusive required group even if its individual required flag is false.

Use discovery for field shapes. Read the references below for semantics, references between records, and rules beyond field metadata.


Read the semantic rules for the kind you are about to publish:

- Before a Background, Topic note, round, answer, Assumed pick, close, Stage state, or progress item, read the relevant section of [Contribution fields, version 1](references/contributions.md).
- Before publishing or revising a Result, read [Result fields, version 1](references/results.md). It includes cards, review, ledger, table, Document, Code/diff, and Timeline.
- Before a wayfinder ticket graph, read the `wayfinder` item in [Contribution fields, version 1](references/contributions.md).
- Before Comparison or Metrics, also read [Comparison and Metrics fields](references/comparison-metrics.md).
- Before a prototype demo, runnable-artifact Result, or Quiz, also read [Interactive Result fields](references/interactive-results.md).
- Before capturing attachments, canonical file revisions, question/Background figures, option previews, or real HTML/app/terminal artifacts, read [Captured attachments](references/attachments.md). Capture actual redacted evidence and preserve canonical deliverables.
- Before every new or re-asked question, read [Reader needs and Visual kinds](references/reader-needs.md). Declare and satisfy the actual needs, then publish the complete question once, atomically with its visuals.


## The receipt

A submit receipt holds the Flow and Stage ids, the committed `revision`, `live`, `refs` (each ref you gave, mapped to its assigned id), and, when the contribution has a round, `ask`. It does not repeat your content.

The receipt's `ask` contains the generated questions in declared round order, with assigned ids, numbered titles, lettered option labels, `multi` when present, and recommendations. A reask can retain an earlier Q number without moving ahead of a newly declared question. Use those generated values for the existing `ask` tool and to match its responses. Do not regenerate the full question or change option labels for a second authoring step.

## Every ask in a Flow

This contract applies only to enrolled runs. Outside a Flow, use plain `ask` as the Stage entry rule says. Inside a Flow, every ordinary question follows this sequence:

1. Prepare the complete round and visuals under [Reader needs and Visual kinds](references/reader-needs.md), then publish them once with CLI `submit`.
2. If `live.state` is `serving`, fetch the receipt URL's read-scoped `content` endpoint and verify its Flow id, committed revision, generated question ids, and authored context. A generic successful Nuxt shell response is not proof. A mismatch needs correction before asking. Publication failure still leaves the question unanswered. Host unavailability or `off` does not block a committed question or authorize an answer.
3. Call the existing `ask` tool with the receipt's generated questions. Preserve its ordinary retry, cancellation, approval tier, timeout, and integration behavior. A repeated publication receipt does not prevent a separate ask call.
4. Record each observed answer through CLI `submit`, preserving raw words and non-consent separately from interpretation as below.

The extension owns link presentation. While a main-agent `ask` picker is open in an interactive TUI with this session and agent's binding, it shows a Flow panel above the composer. The panel's title is `Flow page` and its body is the full clickable live URL ending in the first asked Flow question's fragment. For several questions, it follows their order in the picker. When no question id belongs to the bound Flow, the link targets the bound Stage instead. The picker opens at once, with no dismissal step, and the panel goes away when the picker returns, whether answered, cancelled, timed out, or failed. Several questions in one call share one panel; each later call or retry gets a fresh one. The extension looks up the binding and URL itself. The panel text stays in the UI, outside session entries, model context, compaction, and branch summaries. Write no pre-ask chat link and put no URL in the picker payload. There is no notification, card, delivery queue, or retry gate.

When the bound host is unavailable or off, the panel shows its actual error or state beside the picker. Apply the own-run recovery rule to host failures, without resubmitting a committed question just to repair its host. A shared-host restart needs the maintainer; host unavailability alone still does not block asking a committed question. Unbound sessions, subagents, print, RPC, and ACP get no panel. A subagent never asks; it returns open questions to its coordinator for publication and ordinary `ask`.

For Ratchet's native approval gate, publish the complete question and review material first and apply the same current-content check when serving. Pass the receipt's numbered title and page pointer to `r.approve()` as `skill://tune-llm-flow` says. The extension composes with the existing `ui.askDialog` integration and shows the same panel while its original dialog is open. Ratchet supplies no Flow question ids, so its panel link ends in the bound Stage's fragment. Reused current approval opens neither dialog nor panel. Ratchet's `ui.select` fallback when `askDialog` is absent is not covered. The native gate, not a second ordinary picker, collects approval. Preserve reused approval, revision feedback, abort, cancellation, and unanswered states separately.

### Record the raw answer and separate reading

The Flow answer's `response` has `status`, optional `picks` as letters, `text` for the user's verbatim custom words or note, and `note_on` for the letter of an unpicked option the note concerns. These are Flow fields, not host response field names.

Ordinary `ask` can return a multi-question `details.results[]` with question ids, or a single-question `details.question` without an id. Match returned ids to the receipt; an idless single-question result belongs only to the one question just asked. Map exact `selectedOptions` labels such as `"A. Keep"` to the receipt's letters. Preserve observed custom words, notes, images and `timedOut`, using the actual returned fields rather than a wrapper-specific response envelope.

Set `status: "answered"` only for an explicit user selection or user-authored words. A reported timeout remains `timed-out`, even if selections are supplied. A whole-call cancellation can be a cancelled tool error without per-question results; record cancellation for the unanswered questions in that call. Preserve earlier answers and do not reconstruct partial answers the tool did not return.

An empty selection alone proves neither timeout nor cancellation. Use `note_on` only when the host actually returns a structured note target such as `noteOption`. The omp-tools mapper can merge notes and omit that metadata. Never reconstruct it from the text. An unrelated failure, unavailable route, repeated call, or chat response is not a cancelled or approved answer. Report the observed outcome and leave unanswered questions open.

- `answered`: the user picked or wrote something. A pick is the answer, whatever its note says. It takes no `reading`.
- `empty`, `cancelled`, `timed-out`: the user gave no answer. Keep any observed automatic selection in `picks`, outside the decision.
- `headless`: no user was asked. Any recorded recommendation is an assumption, not consent. Stop actions that require user confirmation.

Words with no pick need a `reading`, your interpretation, kept apart from the words:

- `{ "outcome": "resolved", "decision", "basis", "maps_to"? }` when the words plainly settle the decision. `decision` is what is now true, `basis` is why the words settle it, and `maps_to` is the letter of the option they match. The page shows the user's words, your reading, and its basis, and records no pick.
- `{ "outcome": "question" | "concern" | "ambiguous", "unresolved" }` when they ask for information, raise a concern, or leave the choice open. `unresolved` is the part still to decide. Ask that part in the next round with `again`, and reply to the rest on the page.

Only a pick or a resolved reading is the user's answer. Everything else keeps the question open until it is asked again or its Stage retires it.

## Close the Stage

Submit a `close`. Write each decision as what is now true, in one or two plain sentences, not as the option label. Add `extra` bullets only when they apply: "Unchanged from earlier: ...", "Glossary: ...", and "Headless, not user-confirmed" for a close in a headless run. Then submit `{ "kind": "stage", "state": "finished" }` with its `retire` reasons when the Stage's skill finishes. If a retired question still matters later, ask it in the current Stage with `again`.

Finishing a Stage authorizes nothing. Follow the calling skill's action policy. A required explicit user pick still gates its action, while tracker and config writes that the calling skill authorizes proceed without a next-prompt confirmation.

## Record progress

Before recording tasks, blockers, End state, PRs, or checks, read [Record progress](references/contributions.md#record-progress). Authored records and host observations stay separate. Neither a finished Stage nor a green observation authorizes delivery or closes the Flow.

## Configure or present the local host

Before configuring adapters, recovering checkout context, diagnosing host startup or an unavailable reader, choosing an isolated `--home` namespace, or presenting the Flow URL, read [Local host and read-only observations](references/host-observations.md). It defines the GitHub built-ins, the separate provider-neutral HTTP JSON override, GitLab limits, freshness states, port ownership, credentials, and lifecycle settings.

For keyboard navigation or reader help, read [Read the Flow page](references/reading.md).

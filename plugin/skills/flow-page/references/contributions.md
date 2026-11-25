# Contribution fields, version 1

Read the relevant section before publishing a Background, Topic note, round, answer, Assumed pick, Correction, close, Stage state, or progress item. These are fields of the version 1 envelope described in flow-page. Result and attachment branches have separate triggered references below.

`validate [<file> | -]` checks these fields against the bound or explicitly named Flow and Stage without publishing. It leaves the contribution, Stages, assets, and Flow revision unchanged. `submit` runs the same validator before committing. Both commands report independent errors together with stable codes, JSON paths, messages, and allowed values or expected types. See [Validate without publishing](../SKILL.md#validate-without-publishing) for output and exit codes.

`catalog` lists contribution kinds alongside Result shapes. `describe <kind>` exposes the same field metadata used by validation, including nested question options, response and reading variants, close decisions, Stage state, and progress creation and updates. Add `--compact` for field lines. The metadata describes field structure. The rules below also govern references and state transitions.

Item kinds and their fields:

- `background`: optional `ref`, `title`, `summary` (one line), `sections` (one or more `{ heading, body }`), and `sources` (one or more strings, such as `GLOSSARY.md` or `[text](url)`). A Stage has one Background. Submit it before the Stage's first round. Optional `figures` is an array of `{ attachment: "<ref or id>" }` captured figure references.
- `topic`: optional `ref`, `title`, `summary`, `body`, and `sources`. Each Topic note appears in its Stage's publication order and in the Topics tab, with links to the questions that cite it.
- Before a `result` or `revise`, read [Result fields](results.md). That reference directs Comparison/Metrics and interactive branches to their own field contracts.
- `corrects`: `target`, `replacement`, and `reason`. Endpoints accept a whole Result as `<result ref or id>`, an entry as `<result ref or id>/<entry ref or id>`, a Background, Topic note, Assumed pick, or standalone reading by ref or id. Scoped targets are `<question id>/context`, `<question id>/reading`, and `<close ref or id>/<question id>` for one close decision. The target belongs to an earlier finished Stage. Publish ordinary replacement content in the same contribution. Backgrounds and Topic notes can replace question context without asking a new question. Item order does not affect reference resolution. The relation and content commit together or neither commits. The reason appears in a warning banner above the original, and the replacement links back. The model records endpoint revisions and derives the current correction head. Original content, evidence, identity, publication position, and snapshots stay intact. A historical Topic without recorded Stage ownership cannot be targeted.
  - To correct a Correction, finish its Stage, open a later Stage, and target its replacement. A stale competing successor, overlapping whole-Result and entry successors, dangling endpoint, or cycle is refused. Do not retarget the original after it already has a successor.
  - For withdrawal, the ordinary replacement says what was withdrawn and why. There is no separate `retracts` kind or rich-content grammar. Reader comments remain separate feedback. Historical text without an explicit relation gets no inferred Correction.
  - For a closed Flow, `reopen` it, publish in the new Stage, finish that Stage, and `close` again. Do not edit finished Stages or submit annotations to a closed Flow.
  - A reading target takes a new `reading` of the same recorded answer. A close decision takes a new close decision for the same question. Neither a Result nor another kind of note can replace a reading or a close decision.
  - Corrections change an agent's interpretation, never the user's words, explicit picks, or non-consent statuses. A reading Correction only withdraws: its replacement reading is never `resolved`, so it cannot turn an unresolved reading into consent or swap one resolved decision for another. If a withdrawn decision is still needed, publish a new question with `again` in the active Stage, call the ordinary picker, and record its actual answer. Correcting an Assumed pick does not turn it into a user answer or replace the existing `reopens` rules.
- Before an `attachment`, figure, option preview, captured revision, or real runnable artifact, read [Captured attachments](attachments.md).
- `assumed`: optional `ref`, `decision`, `pick`, and `why`, one decision settled without asking. `why` cites the basis or names the Bookkeeping kind and explains why the pick fits. Submit it before the round when it explains a remaining question. The close lists every Assumed pick no question reopened. An Assumed pick is not a user answer.
- `round`: `now`, a shared account of where the work stands, and `questions` in declared reading order. Both `ask.html` and `ask.questions` keep that order, including re-asks that retain an earlier Q number. One contribution holds at most one round. Each question has `title`, `description`, `brief`, nonempty `needs` as `{ need, kind }`, and `options`. Use a question title that ends with `?`. A question can also have a `ref` to use in another item. Follow the [question checklist](reader-needs.md) for Decision brief wording, context, evidence, and trade-offs.
  - `brief`: requires `unblocks`, what the answer lets the author do, and `undo`, how to reverse the decision or why it cannot be undone. With `again`, add `asked_again_because`, even if the earlier attempt never received an answer. Otherwise omit it. Give exactly one option a `recommended` reason or set `brief.no_recommendation` to explain why there is no recommended option. With no recommendation, the picker starts with nothing selected. The brief records context, not an answer or consent. Stored questions without briefs keep their original descriptions and choices.
  - `brief.ask_reason` and `brief.evidence_checked` are required on every new or re-asked question. Use a reason from the [Settle-or-ask test](../../../rules/vstack-settle-or-ask.md). State what you checked and what it established or left open in nonempty `evidence_checked` text. `describe round` lists the allowed reason values. The reader shows both fields with the Decision brief, not in the picker. Stored questions without these fields remain readable and answerable without invented values.
  - Each option requires `label`, `does`, `gains`, and `costs`. Give the label alone; the CLI adds the letter. Explain material trade-offs, including significant costs carried over from earlier decisions. Estimate each cost that matters in appropriate units, or say when there is no estimate. An option can include `preview: { attachment: "<ref or id>", kind: "<Visual kind>" }` or `{ text: "<actual output or usage>", kind: "<Visual kind>" }`.
  - `multi`: optional boolean, default false. Set true for one question that accepts several selections. The picker uses checkboxes. Set `brief.no_recommendation` and omit `recommended` when no preselection is allowed.
  - `again`: the earlier question it asks again. In the same Stage it names a question of an earlier round and keeps that Q number. From a finished Stage it names that Stage's latest ask of the Q number and takes a new Q number here. Both questions link to each other.
  - `reopens`: the Assumed pick it reopens, of this Stage or a finished one. That pick leaves the close. This question's decision replaces it.
  - `today`: `{ text, source }` facts about how things work now, each with its file-and-line source.
  - `terms`: `{ term, text }` Term notes, one line each, for names a newcomer does not know.
  - `topics`: Topic notes it builds on.
  - `results`: a list of whole Results as `<result ref or id>` and precise entries as `<result ref or id>/<entry ref or id>`. Both forms can share a list. Whole-Result links land at the header, which links back under **Asked in**. Entry links retain their precise anchors and backlinks. Code resolves the targets and derives both directions, so do not maintain reciprocal links manually. Unknown targets refuse the entire contribution and explain both forms. Assumed, not a user answer: links address the current Result revision, matching existing entry links. These links never replace self-contained question wording or required question-local visuals.
  - `example`: text that makes the question concrete.
  - `figures`: an array of `{ attachment: "<ref or id>", kind: "<Visual kind>" }` captured figure references or `{ text: "<source excerpt or output>", kind: "<Visual kind>" }` escaped text figures.

  Option `gains` and `costs` are lists with one or more nonempty strings. Empty lists, scalar strings, and empty or whitespace-only elements are refused.

  A new round is refused when different questions reuse text in `brief.unblocks`, `brief.undo`, `brief.asked_again_because`, `brief.no_recommendation`, the description, a reader need, or an option's `does`, `gains`, `costs`, or `recommended` field. The check ignores finding and question numbers such as F01 or Q3. Reused option labels are allowed. Put shared status in `now` and shared background in the Stage Background. The check does not apply to stored or migrated questions.
- `answer`: `question`, `response`, and, for words with no pick, `reading`. A question takes one answer. To reopen it, ask it again with `again`, which keeps the earlier answer beside the new one.
- `reading`: optional `ref`, `question`, and `reading`, using the same outcome fields as an answer's reading. It is ordinary agent-authored content, not another answer. It needs an existing answered response with words and no explicit pick, and must be the replacement of an atomic `corrects` relation. Its id is a later correction target. Overview and `show` use the current reading. The original answer's payload stays unchanged, and `show` retains the earlier interpretation as `recorded_reading`.
- `close`: optional `ref`, `decisions`, one `{ question, text }` for the latest ask of each Q number of the Stage, and optional `extra` bullets. A later Stage can also include an earlier question only when that decision is the replacement in an atomic Correction of an earlier close decision. The close adds every Assumed pick of the Stage that no question reopened, and records each decision's answer provenance. A close with no decisions and no Assumed picks needs `extra`. Historical close text and recorded provenance stay unchanged. Its projected `current_answer`, `current_reading`, and `current_text` expose corrected state, and `affected` marks summaries changed by a Correction.
- `stage`: `{ "kind": "stage", "state": "finished" }` finishes the bound Stage. A finished Stage takes no more content. Add `retire`, one `{ question, reason }` for each latest ask that has no pick and no settled reading, saying why the Stage leaves it unresolved. Retired questions leave current work and keep their answer and reason.
- `task`, `blocker`, `end-state`, `pr`, and `check` record workflow progress, as [Record progress](#record-progress) says.
- `wayfinder`: `tickets`, a complete graph snapshot, which may be empty. Each ticket has `id`, `title`, `url`, `state`, and `blockers`. The id and title are nonempty strings. The `url` is an absolute `http://` or `https://` tracker link or a local `.md` ticket file path, relative or absolute. For the Local Markdown tracker, pass the ticket file path, such as `.scratch/<effort>/issues/01-storage.md`, or its absolute path under the vstack root in Private mode. Other URL schemes and empty references are refused. The reader displays local paths as selectable text, not links. State is `resolved`, `frontier`, `blocked`, `claimed`, or `out-of-scope`. Blockers is an array of ticket ids in this snapshot, including resolved blockers. Ticket ids and blocker ids within one ticket are unique. Self-blocking, unknown blockers, and blocking cycles are refused. Names, states, and edges come from wayfinder's tracker reads, never from a captured figure. Unknown fields are refused. The script records the owning Stage and committed revision. `show.wayfinder` exposes the latest snapshot with earlier snapshots in `history`, oldest first. Replaying the latest contribution adds no snapshot.

Text fields are plain text. A blank line starts a paragraph, a block of `- ` lines is a bullet list, and `` `code` `` and `[text](https://url)` links are kept. In Document, Comparison, Metrics, and attachment text, a link to anything but `https://`, `http://`, or a `#` anchor is refused. The script stores each source string once, however many records cite it.

## Example round

This contribution recommends **Keep**. The picker selects it by default, but that default is not a recorded answer.

```json
{
	"version": 1,
	"items": [{
		"kind": "round",
		"now": "One retry recovered interrupted requests in the local tests. Release review is next.",
		"questions": [{
			"title": "Keep one retry for interrupted requests?",
			"description": "The retry waits one second before trying the request again.",
			"brief": {
				"ask_reason": "undecided-by-evidence",
				"evidence_checked": "Local tests show that one retry recovers the request. The release policy does not say whether the extra second is acceptable.",
				"unblocks": "Finalize the retry policy for the release.",
				"undo": "Restore the no-retry setting and redeploy."
			},
			"needs": [{ "need": "Compare recovery against a faster failure notice.", "kind": "prose" }],
			"options": [{
				"label": "Keep",
				"does": "Retries the interrupted request once.",
				"gains": ["The reader does not have to repeat the request."],
				"costs": ["The failure notice can arrive one second later."],
				"recommended": "The local test recovered without another reader action."
			}, {
				"label": "Remove",
				"does": "Reports the interruption without retrying.",
				"gains": ["The reader sees the interruption at once."],
				"costs": ["The reader has to repeat the request."]
			}]
		}]
	}]
}
```

## Record progress

The **Progress** row on Overview opens a strip built from these items. Each is its own fact. A finished Stage, a task count, a PR, a check, and the End state never stand in for one another. Authored PRs and checks stay labelled as reported, beside the host's separate read-only observations.

- `task`: a step of the Flow's work. A new task has optional `ref`, `title`, and optional `state`, `evidence`, and `reason`. Update it with `{ "kind": "task", "task": "<ref or id>", ... }` and only the fields that change. Do not send the title again. The states are `pending` (the default), `active`, `done`, `skipped`, and `inapplicable`.
  - `done` needs `evidence`: one or more strings, such as a command and its outcome, a commit, or a path. Evidence adds to what the task has.
  - `skipped` and `inapplicable` need a `reason`. They are not left work. Use `inapplicable` for a step that does not apply to this Flow, such as the commit in an explanation.
  - Any in-progress Stage of the Flow can update a task, such as an implement Stage that finishes a task that a to-tickets Stage recorded.
- `blocker`: `text` and optional `ref` and `tasks` it blocks. An open blocker marks its tasks blocked. Resolve it with `{ "kind": "blocker", "blocker": "<ref or id>", "resolved": "<what cleared it>" }`.
- `end-state`: `requested` is `commit`, `merge-ready`, `shipped`, or `none` for a Flow that delivers no commit or PR, such as an explanation. Record it when the Flow settles it. `reached` is `commit`, `merge-ready`, or `shipped`, with `evidence`, when the delivery actually got there. A Flow with `none` reaches no End state.
- `pr`: a new PR has `url`, `state` (`open`, `merged`, or `closed`), and optional `ref` and `title`. Update it with `{ "kind": "pr", "pr": "<ref or id>", "state": ... }`.
- `check`: `name`, `outcome` (`passed`, `failed`, or `pending`), and optional `ref`. A passed or failed check needs `evidence`. Update it with `{ "kind": "check", "check": "<ref or id>", "outcome": ..., "evidence": [...] }`.

The strip reads complete when the Flow has at least one task, no task is `pending` or `active`, no blocker is open, and its requested End state is `none` or reached. It does not close the Flow. `show` prints the same facts under `progress`.

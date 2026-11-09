# Contribution fields, version 1

Read the relevant section before publishing a Background, Topic note, round, answer, Assumed pick, close, Stage state, or progress item. These are fields of the version 1 envelope described in flow-page. Result and attachment branches have separate triggered references below.

`validate [<file> | -]` checks these fields against the bound or explicitly named Flow and Stage without publishing. It leaves the contribution, Stages, assets, and Flow revision unchanged. `submit` runs the same validator before committing. Both commands report independent errors together with stable codes, JSON paths, messages, and allowed values or expected types. See [Validate without publishing](../SKILL.md#validate-without-publishing) for output and exit codes.

Item kinds and their fields:

- `background`: `title`, `summary` (one line), `sections` (one or more `{ heading, body }`), and `sources` (one or more strings, such as `GLOSSARY.md` or `[text](url)`). A Stage has one Background. Submit it before the Stage's first round. Optional `figures` is an array of `{ attachment: "<ref or id>" }` captured figure references.
- `topic`: optional `ref`, `title`, `summary`, `body`, and `sources`. Each Topic note appears in its Stage's publication order and in the Topics tab, with links to the questions that cite it.
- Before a `result` or `revise`, read [Result fields](results.md). That reference directs Comparison/Metrics and interactive branches to their own field contracts.
- Before an `attachment`, figure, option preview, captured revision, or real runnable artifact, read [Captured attachments](attachments.md).
- `assumed`: optional `ref`, `decision`, `pick`, and `why`, one decision settled without asking. `why` cites its repo fact with file and line, its ADR, or its convention. Submit it before the round when it explains a remaining question. The close lists every Assumed pick no question reopened.
- `round`: `questions`, in declared reading order. The receipt's native `ask` keeps that same order, including reasks that retain an earlier Q number. One contribution holds at most one round, because one round is one `ask`. Each question has optional `ref`, `title` (one question that ends with "?"), `description`, required nonempty `needs` as `{ need, kind }`, and `options`. Before preparing a question, follow the authoritative [Reader needs and Visual kinds checklist](reader-needs.md) for self-contained context, evidence, option tradeoffs, and where shared explanations belong. Each option has `label` (the label alone. The script adds `A. `, `B. `), `does`, `gains`, `costs`, and an optional `recommended` reason on at most one option. `costs` covers general downsides and trade-offs, including qualitative ones. Present material trade-offs accurately and concretely. When a cost matters to the decision and can be estimated, state its approximate size in appropriate units. If it cannot be estimated, say so. Include significant costs carried over from earlier decisions when they affect the option. An option can add `preview: { attachment: "<ref or id>", kind: "<Visual kind>" }` or `{ text: "<actual output or usage>", kind: "<Visual kind>" }`. A question can add:
  - `multi`: optional boolean, default false. Set true for one question that accepts several selections. The generated picker receives the same value; omit `recommended` options when no preselection is allowed.
  - `again`: the earlier question it asks again. In the same Stage it names a question of an earlier round and keeps that Q number. From a finished Stage it names that Stage's latest ask of the Q number and takes a new Q number here. Both questions link to each other.
  - `reopens`: the Assumed pick it reopens, of this Stage or a finished one. That pick leaves the close. This question's decision replaces it.
  - `today`: `{ text, source }` facts about how things work now, each with its file-and-line source.
  - `terms`: `{ term, text }` Term notes, one line each, for names a newcomer does not know.
  - `topics`: Topic notes it builds on.
  - `results`: the Result entries it comes from. The page links them both ways.
  - `example`: text that makes the question concrete.
  - `figures`: an array of `{ attachment: "<ref or id>", kind: "<Visual kind>" }` captured figure references or `{ text: "<source excerpt or output>", kind: "<Visual kind>" }` escaped text figures.

  A newly submitted round is refused when different questions reuse the same description, need text, or option `does`, `gains`, or `costs` text, ignoring finding and question identifiers such as F01 or Q3. Reused option labels are allowed. This check catches copied wording, not whether the questions explain meaningful differences. Apply the reader-needs checklist before submission. The refusal applies only within the new round, not to stored questions, answers, or historical data.
- `answer`: `question`, `response`, and, for words with no pick, `reading`. A question takes one answer. To reopen it, ask it again with `again`, which keeps the earlier answer beside the new one.
- `close`: `decisions`, one `{ question, text }` for the latest ask of each Q number of the Stage, and optional `extra` bullets. The close adds every Assumed pick of the Stage that no question reopened, and marks each decision as the user's pick, read from the user's words, or not the user's answer. A close with no decisions and no Assumed picks needs `extra`.
- `stage`: `{ "kind": "stage", "state": "finished" }` finishes the bound Stage. A finished Stage takes no more content. Add `retire`, one `{ question, reason }` for each latest ask that has no pick and no settled reading, saying why the Stage leaves it unresolved. Retired questions leave current work and keep their answer and reason.
- `task`, `blocker`, `end-state`, `pr`, and `check` record workflow progress, as [Record progress](#record-progress) says.

Text fields are plain text. A blank line starts a paragraph, a block of `- ` lines is a bullet list, and `` `code` `` and `[text](https://url)` links are kept. In Document, Comparison, Metrics, and attachment text, a link to anything but `https://`, `http://`, or a `#` anchor is refused. The script stores each source string once, however many records cite it.

## Record progress

The Overview opens with a progress strip built from these items. Each is its own fact. A finished Stage, a task count, a PR, a check, and the End state never stand in for one another. Authored PRs and checks stay labelled as reported, beside the host's separate read-only observations.

- `task`: a step of the Flow's work. A new task has optional `ref`, `title`, and optional `state`, `evidence`, and `reason`. Update it with `{ "kind": "task", "task": "<ref or id>", ... }` and only the fields that change. Do not send the title again. The states are `pending` (the default), `active`, `done`, `skipped`, and `inapplicable`.
  - `done` needs `evidence`: one or more strings, such as a command and its outcome, a commit, or a path. Evidence adds to what the task has.
  - `skipped` and `inapplicable` need a `reason`. They are not left work. Use `inapplicable` for a step that does not apply to this Flow, such as the commit in an explanation.
  - Any in-progress Stage of the Flow can update a task, such as an implement Stage that finishes a task that a to-tickets Stage recorded.
- `blocker`: `text` and optional `ref` and `tasks` it blocks. An open blocker marks its tasks blocked. Resolve it with `{ "kind": "blocker", "blocker": "<ref or id>", "resolved": "<what cleared it>" }`.
- `end-state`: `requested` is `commit`, `merge-ready`, `shipped`, or `none` for a Flow that delivers no commit or PR, such as an explanation. Record it when the Flow settles it. `reached` is `commit`, `merge-ready`, or `shipped`, with `evidence`, when the delivery actually got there. A Flow with `none` reaches no End state.
- `pr`: a new PR has `url`, `state` (`open`, `merged`, or `closed`), and optional `ref` and `title`. Update it with `{ "kind": "pr", "pr": "<ref or id>", "state": ... }`.
- `check`: `name`, `outcome` (`passed`, `failed`, or `pending`), and optional `ref`. A passed or failed check needs `evidence`. Update it with `{ "kind": "check", "check": "<ref or id>", "outcome": ..., "evidence": [...] }`.

The strip reads complete when the Flow has at least one task, no task is `pending` or `active`, no blocker is open, and its requested End state is `none` or reached. It does not close the Flow. `show` prints the same facts under `progress`.

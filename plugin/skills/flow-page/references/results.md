# Result fields, version 1

Read this reference before publishing or revising a Result block. Result is its authoring short form.

- `result`: optional `ref`, `shape`, `title`, and an optional `summary` line. A Result shows a Stage's output, such as review findings, candidates, a ticket breakdown, run results, or a report. Submit it before a question when the reader needs it to decide. The reader preserves publication order rather than moving Results ahead of questions.

  - Any shape takes optional `attachments`, the attachments it shows, and `canonical`, the canonical record it was made from: `{ file }` (a path in the project), `{ commit }` (a hash), or `{ tracker, revision }` (such as `daandden/vstack#267` and the issue's updated time).
  - `revises` publishes a new revision of an earlier Result of the bound Stage, named by its id. Send the whole Result again. The block keeps its original reading position and earlier revisions remain readable. `show` gives the committing revision as the Result's and each entry's `changed`. A `{ file }` canonical link carries over with the file's current revision. A `{ commit }` or `{ tracker }` link must be given again with its new revision.

- `revise`: changes one Result of the bound Stage without resending it. `result` names the Result, or one entry as `<result>/<entry>`. The block keeps its reading position and retains the previous revision in history. A Document, Comparison, Metrics Result, Quiz, or demo has no entries. Publish its next revision with `revises`.
  - `set` replaces only the fields it names: an entry's fields, or a Result's `title` and `summary`. It needs `base`, the revision that `show` printed as that entry's or Result's `changed`. When someone changed it after `base`, the edit is refused as a conflict: run `show` and decide again.
  - `add` appends new entries or rows to a Result, in its shape. It needs no `base`.

Before a `prototype` or `quiz`, read [Interactive Result fields](interactive-results.md). Before a `comparison` or `metrics`, read [Comparison and Metrics fields](comparison-metrics.md). Before capturing attachments or canonical file revisions, read [Captured attachments](attachments.md). The remaining shapes are defined below.

## Static Result shapes

  - `cards` has `entries`, each with optional `ref`, `title`, `label` (such as `issue`), `blocking` (`true` or `false`), `impact`, `action`, and `evidence`. In a review finding, `impact` opens with what a user or caller sees, and `evidence` gives the file and line.
  - `review` has `axes` and `entries`. State each of `standards`, `spec`, and `blast-radius` exactly once as `{ axis, status, reason? }`. `status` is `findings`, `clean`, `skipped`, `unavailable`, or `blocked`. Every status except `findings` needs a `reason`. `findings` needs at least one entry. `blocked` may have entries established before the blocker, while clean, skipped, and unavailable axes have none. `entries` may be empty when the review has no findings. Each entry has the `cards` fields plus required `axis` and `location`, the source file and line or named interface. A Stage has one review Result. Its opening summary table is derived from these entries and links to the full impact, action, and evidence cards. Keep findings in reviewer order within their axis. Never submit a duplicate summary table. `show` exposes the derived rows under `review`, including each finding's `target` anchor. Focused entry revisions update the summary automatically. Revise the Result's `axes` with `set` and its `base` when a review's availability changes.
  - `ledger` has a nonempty `entries` array. The [ledger entry contract](#ledger-entry-contract) defines its fields and a checked contribution example.
  - `table` has `columns` and `rows`, each row with optional `ref` and `cells`, one string per column.
  - `document` is long-form content, such as an explanation, research findings, or an investigation report. It has `sections`, in reading order, each with a `heading` and `blocks`. A block is one of `{ prose }`, `{ list, ordered }` (`ordered` is optional), `{ code, language, source }` (`language` and `source` are optional; `source` is the file and line), or `{ figure }`, naming an attachment. Optional `citations` are `{ ref, source }`. Cite one in prose or a list item as `[@<ref>]`, and the script numbers it and links both ways. Optional `limitations` lists what the Document does not show, and optional `sources` lists what it was built from.
  - `code` shows code excerpts or unified diffs. It has `entries`, each with optional `ref`, required `file` naming the source path, and exactly one of `code` or `diff`. Optional `language` selects syntax highlighting. Common JS, TS, Python, shell, Go, Rust, C-family, SQL, JSON, YAML, and TOML names work. Other languages remain plain. Optional `revision` names the source revision, and optional `note` explains the excerpt. A code excerpt takes optional `line`, the positive whole-number source line it starts at. Leave `line` out when it is unknown. A diff has one file's unified `@@` hunks, optionally with its file headers. Each hunk's counts must match its lines. The page preserves tabs, line breaks, and trailing spaces, numbers the old and new lines separately, and links to each hunk. Known lines have anchors ending in `-L<n>` for old or excerpt lines and `-R<n>` for new lines.
  - `timeline` has `entries` in the order the events happened. Code preserves that order, even when a clock went backward. Each event has optional `ref`, required `title` and `outcome`, and optional `time`, `detail`, `evidence`, and `attachments`. `outcome` is `succeeded`, `failed`, `blocked`, `skipped`, `unknown`, or `noted`. `time` is an ISO 8601 date, such as `2026-10-28`, or a date-time with its offset, such as `2026-10-28T10:05:00+07:00`. Leave it out when it is unknown. `attachments` names the evidence shown with that event. A later `revise` with `add` appends events, and `set` updates a recorded outcome against its `base`.

## Ledger entry contract

Each ledger entry is an object with these fields. All five fields are mandatory. The authoring command refuses missing fields, unknown fields, invalid statuses, and text that is empty or contains only whitespace.

| Field | Type | Meaning |
| --- | --- | --- |
| `claim` | Nonempty string | The claim or concern being tracked. |
| `status` | String, exactly `confirmed`, `cleared`, or `unproven` | The claim's current status. |
| `evidence` | Nonempty string | The available evidence and its limits. When no evidence exists, state that absence explicitly. |
| `missing_proof` | Nonempty string | The proof still needed. When none is missing, state that and the scope it applies to. |
| `consequence` | Nonempty string | What the claim's current status means for the work or decision. |

An entry also accepts an optional `ref`, the contribution-local reference used to link to it. These requirements apply to initial entries, appended entries, and entries updated through `revise.set`. An update resends only the fields it changes, while the complete resulting entry must remain valid.

### Checked contribution example

This is illustrative authoring input, not a test receipt or a claim that a browser run passed. It records an unproven claim without inventing evidence. The command-level regression test reads the JSON below, submits it through the Flow-authoring command, and checks the persisted ledger fields. It does not pin this reference's prose.

```json
{
	"version": 1,
	"items": [
		{
			"kind": "result",
			"ref": "reader-proof",
			"shape": "ledger",
			"title": "Illustrative browser proof gap",
			"entries": [
				{
					"ref": "seventh-reader",
					"claim": "Illustrative, unestablished claim: a seventh reader renders while six readers remain open.",
					"status": "unproven",
					"evidence": "No browser run, screenshot, or runtime receipt is attached to this example.",
					"missing_proof": "An owned-host browser run that keeps six readers open and inspects the seventh rendered document.",
					"consequence": "Keep the claim unproven and do not report responsive navigation as verified."
				}
			]
		}
	]
}
```

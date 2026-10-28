# Flow page

The flow-page script takes typed contributions for one bound Stage, assigns ids, Q numbers, option letters, tab labels, and links, and publishes the whole static Flow page. Overview opens with a progress strip of tasks, blockers, the requested and reached End state, and reported PRs and checks, then shows each Stage's state and the latest ask of every Q number. Stage tabs show the Background, Results, rounds, answers, and summaries. The Topics tab lists each Topic note with the questions that cite it.

## Sub-features

- `flow-open`: `open` starts a Flow with a Stage for any skill name, or adds a Stage to an existing Flow, and binds the calling session's agent.
- `flow-bind`: a session writes only through its own binding or an explicit `--flow` and `--stage`. `bind` and `show` create no Stage and no revision.
- `flow-submit`: a contribution returns assigned refs, the numbered label-only `ask` payload, the revision, and the page path, with no content echoed.
- `flow-refuse`: an unsupported version, unknown kind or field, missing link, `again` cycle, or invalid transition is refused, naming the item, and changes no file.
- `flow-links`: questions link to Result entries and Topic notes, and the page shows the backlinks. A re-ask links to its earlier ask, and a decided question links to its summary.
- `flow-answers`: an answer keeps the raw `ask` response apart from the agent's reading. Only an explicit pick or a resolved reading counts as the user's answer, and the page shows a resolved reading's basis with no option marked picked. Question-notes, concerns, ambiguous notes, timeouts, cancellations, empty and headless responses stay open as non-consent.
- `flow-lifecycle`: finishing a Stage retires each unresolved question with a reason. A later Stage opened with `--parent` asks a retired question again with `again`, and the two questions link to each other. A second answer to one question is refused. The close lists every decision with its provenance and every Assumed pick no question reopened.
- `flow-view`: tabs carry skill-derived labels with ticket ids, a card's Evidence opens with one click, and a 360px pane has no horizontal overflow.
- `flow-concurrent`: callers bound to two ticket Stages of one Flow submit and add aliases at the same time, and every contribution and alias lands once. A repeat of a Stage's latest contribution prints its first receipt with `repeated: true`. A `revise` of one entry with an old `base` after another revise of it is refused as a conflict.
- `flow-identity`: `find` and `--flow` take qualified aliases (`spec:`, `ticket:`, `branch:`, `run:`, `folder:`, `slug:`) and refuse a missing or ambiguous one. `move --to <key>` keeps the id, bindings, anchors, and the old folder key, and a taken key or a failed rename leaves the Flow where it was. Another project cannot find or write the Flow; a worktree of the same project can.
- `flow-stale`: when the page cannot be written, the receipt has the new `revision` and `presentation.state: "stale"` with the older revision the page shows, and the page keeps its last good content until `render` publishes again.
- `flow-document`: a `document` Result shows its sections in order, numbered citations that link both ways, code with its whitespace, figures, limitations, and sources.
- `flow-attach`: `attachment` items of every type keep their caption, origin, captured revision, and availability. Captured files are stored in the Flow by sha256 and shown from there. A path outside the project and its Scratch dir, a symlink out of them, an image that is not an image, an unsafe SVG, and a link with an unsafe scheme are refused.
- `flow-revision`: a Result keeps the content and assets it captured after its sources change. `revises` publishes the next revision, with the canonical file's new sha256, and the earlier revision stays readable.
- `flow-progress`: `task`, `blocker`, `end-state`, `pr`, and `check` items put progress on the Overview's strip. A task changes state through a focused update with no resend. Skipped and inapplicable tasks are not left work. The Flow reads complete only when no task or blocker is open and a delivery reached its requested End state. A finished Stage, a merged PR, and a passed check are each their own line and complete nothing.

## How to get to it (user POV)

- A skill runs `bun "$(realpath skill://flow-page/scripts/flow-page.ts)" open|bind|submit|alias|find|move|show|render ...` and prints the receipt's page path.
- The user opens that path in a browser.

## Driving it with bash and the omp browser

Preconditions:

- Follow the baseline in `README.md` and run Doctor.
- Set `SCRIPT="$CHECKOUT/plugin/skills/flow-page/scripts/flow-page.ts"` and `H="$VERIFY_RUN_DIR/data/flow-home"`. Pass `--home "$H"` and an explicit `--session verify-1` to every command. Run from `$CHECKOUT`.

Steps:

- `bun "$SCRIPT" open --skill grill-with-docs --title "Verify flow page" --home "$H" --session verify-1`. The receipt has `flow`, `stage`, `revision`, `page`, and `bound: true`.
- Pipe a contribution with a `background`, a `topic` with `ref`, and a `round` of two questions to `submit -`. The receipt's `ask.questions` read `Q1. ...` and `Q2. ...`, with options `A. ...` and `B. ...`. Submit answers: one `{"status":"answered","picks":["A"]}` and one `{"status":"timed-out","picks":["A"]}`. Then submit a second round whose question has `again` set to the timed-out question's id, its answer `{"status":"answered","text":"..."}` with reading `{"outcome":"resolved","decision":"...","basis":"...","maps_to":"B"}`, a `close`, and `{"kind":"stage","state":"finished"}`.
- For `flow-lifecycle`, start a second Flow, add an `assumed` item and a round of two questions, answer one with a pick, close, and finish with `retire` for the other. `open --flow <id> --skill grill-me --parent <first stage>` and submit a round with `again` naming the retired question.
- `open --flow <id> --skill code-review`, then submit `cards`, `ledger`, and `table` Results with refs and a round whose question lists `results: ["<result ref>/<entry ref>"]`. Open two `wayfinder` Stages with `--ticket 270` and `--ticket 271`.
- Submit with `--session verify-2` and no target: exit 1, and a hash of every file under `$H` is unchanged. Submit an item with an `html` field, then a round whose questions name each other in `again`: each exits 1 naming the item, and the hashes are unchanged.
- `open --flow <id> --skill research`. Set `S` to the Scratch dir of the receipt's page, three directories up from the page path (`<S>/flow/<id>/index.html`). Write a PNG screenshot, an MP4 or WebM clip, an SVG, a CSV file, a JSON trace, a redacted log, and `research-note.md` under `$S/verify-assets/`. Submit one `attachment` of each type (plus an `artifact` with `launch`, `revision`, and an `http://127.0.0.1` `url`, and an `unavailable` video), and a `document` Result with two sections that cite with `[@ref]`, a `code` block with tabs and double spaces, a `figure`, `limitations`, `sources`, `canonical: { file: "<S>/verify-assets/research-note.md" }`, and `attachments` naming the rest. `show` lists each attachment's `availability` and `revision`; each captured `revision` equals `shasum -a 256` of its file.
- Edit the research note and the screenshot, then run `render --flow <id>`: `show` and the page's figure bytes are unchanged. Submit the Document again with `revises: <result id>` and a new screenshot attachment: `show` gives `revision: 2`, the note's new sha256, and both revisions under `revisions`.
- Submit an attachment with `path: "../outside.png"`, a symlink to a file outside the project and `$S`, an SVG holding `<script>`, and prose with `[x](javascript:alert(1))`: each exits 1 naming the problem, and the hashes are unchanged.
- Open `file://` plus the page path with a named tab, `app: { tern: false, relay: false }`, and a 1280 by 900 viewport.
  - Overview lists every Stage with its state. Grill's Q1 shows the picked label, Q2 shows the reading's decision marked as read from the user's words, and Code review's Q1 shows Open. Tabs read `Grill with docs`, `Code review`, `Wayfinder #270`, `Wayfinder #271`, and `Topics`.
  - In Grill, the first Q2 ask shows the timeout as not the user's answer and no option picked. The second shows the user's words, the reading, and its basis apart from each other, with option B unmarked. The summary marks each decision's provenance.
  - In the `flow-lifecycle` Flow, the finished Stage shows the retired question with its reason, the Assumed pick, and a link to the child Stage. The child Stage shows its parent link, and its question links back to the retired one. `n` skips the retired question.
  - In Code review, the card's Evidence is closed. One click on its summary opens it.
  - Click the question's link to the card entry, the card's and the table row's links back to the question, and the question's Topic note link and the Topic note's link back. Each opens the target's tab and puts the target below the bar.
  - Press `n` from Topics: it opens Code review's Q1, not the superseded Grill ask.
  - At 360px wide, `scrollWidth - clientWidth` is 0.
  - In the Document's Stage tab, click citation `[1]`: the citation comes into view below the bar, and its "Cited in" link returns to the section. The code block keeps its tabs and spaces. The image, the video, and the SVG show; the file, trace, and evidence links download the captured bytes; the artifact shows its launch steps and URL; the unavailable video shows its reason. Open "Earlier revisions": revision 1 shows the first screenshot.
- Progress: on the Code review Stage, which is still in progress, submit `{"kind":"end-state","requested":"shipped"}`, two `task` items with refs, an `active` one and a `pending` one, and a `blocker` naming the active task. Then submit a focused `{"kind":"task","task":"<id>","state":"done","evidence":[...]}`, a task `inapplicable` with a `reason`, a `pr` with `state: "merged"`, a `check` with `outcome: "passed"` and `evidence`, and `{"kind":"end-state","reached":"merge-ready","evidence":[...]}`. `show` has `progress.complete: false`, `end_state.met: false`, and the blocker in `remaining`.
  - Overview's first block is the strip. It names the requested End state (Shipped) apart from the reached one (Merge-ready), lists the open blocker with a link to its task, marks the blocked task, shows the inapplicable task with its reason and not as left work, and reads Not complete. The task's Evidence is closed and opens with one click.
  - Resolve the blocker, settle the last task, and submit `reached: "shipped"`. After a reload, the strip reads Complete. A second Flow with `requested: "none"`, one `done` task, and one `inapplicable` task reads Complete with no PR and no reached End state.
- Concurrency and identity (`flow-concurrent`, `flow-identity`):
  - Bind `--session verify-a` and `--session verify-b` to the two wayfinder Stages with `bind`. Start six `submit -` rounds and six `alias run:<n>` per session at once as background jobs, and wait for all of them. Every exit is 0, every receipt `revision` differs, and `show` lists six questions per Stage and all twelve `run:` aliases.
  - `alias spec:9270`, then `move --to verify-9270`. `find spec:9270`, `find folder:verify-9270`, and `find folder:<old folder key>` print the same `flow`. A `submit` through `verify-a`'s binding lands in the moved Flow, and its receipt `page` is the moved path.
  - Go to `file://` plus the moved page path in the same tab: both wayfinder tabs, their questions, and cross-tab links work as before the move.
- Stale page (`flow-stale`): `chmod 555` the Flow folder, submit a round, then `chmod 755`. The submit exits 0 with a stderr note, its receipt says `stale`, and reloading the page in the tab shows the older revision without the new question. `render --flow <id>` publishes it; reload shows the question and the page meta revision equals the receipt's.

## Gotchas

- Without `--session` and outside an omp session, `open` still creates the Flow but binds nothing, and later `submit` needs `--flow` and `--stage`.
- The Flow lands under the repo key of the current directory. Run from the checkout, or the Flow goes under `_global`.
- After a CLI write, go to `about:blank` or call `tab.reload()` before reading the page again.
- Full-page screenshots after scrolling can show the sticky bar midway down. Take them right after a tab click.

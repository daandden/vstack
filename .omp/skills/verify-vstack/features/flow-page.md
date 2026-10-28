# Flow page

The flow-page script takes typed contributions for one bound Stage, assigns ids, Q numbers, option letters, tab labels, and links, and publishes the whole static Flow page. Overview shows each Stage's state and the latest ask of every Q number. Stage tabs show the Background, Results, rounds, answers, and summaries. The Topics tab lists each Topic note with the questions that cite it.

## Sub-features

- `flow-open`: `open` starts a Flow with a Stage for any skill name, or adds a Stage to an existing Flow, and binds the calling session's agent.
- `flow-bind`: a session writes only through its own binding or an explicit `--flow` and `--stage`. `bind` and `show` create no Stage and no revision.
- `flow-submit`: a contribution returns assigned refs, the numbered label-only `ask` payload, the revision, and the page path, with no content echoed.
- `flow-refuse`: an unsupported version, unknown kind or field, missing link, `again` cycle, or invalid transition is refused, naming the item, and changes no file.
- `flow-links`: questions link to Result entries and Topic notes, and the page shows the backlinks. A re-ask links to its earlier ask, and a decided question links to its summary.
- `flow-view`: tabs carry skill-derived labels with ticket ids, a card's Evidence opens with one click, and a 360px pane has no horizontal overflow.

## How to get to it (user POV)

- A skill runs `bun "$(realpath skill://flow-page/scripts/flow-page.ts)" open|bind|submit|show|render ...` and prints the receipt's page path.
- The user opens that path in a browser.

## Driving it with bash and the omp browser

Preconditions:

- Follow the baseline in `README.md` and run Doctor.
- Set `SCRIPT="$CHECKOUT/plugin/skills/flow-page/scripts/flow-page.ts"` and `H="$VERIFY_RUN_DIR/data/flow-home"`. Pass `--home "$H"` and an explicit `--session verify-1` to every command. Run from `$CHECKOUT`.

Steps:

- `bun "$SCRIPT" open --skill grill-with-docs --title "Verify flow page" --home "$H" --session verify-1`. The receipt has `flow`, `stage`, `revision`, `page`, and `bound: true`.
- Pipe a contribution with a `background`, a `topic` with `ref`, and a `round` of two questions to `submit -`. The receipt's `ask.questions` read `Q1. ...` and `Q2. ...`, with options `A. ...` and `B. ...`. Submit answers (one `picks`, one `unanswered`), a second round whose question has `again` set to the unanswered question's id, an `other` answer, a `close`, and `{"kind":"stage","state":"finished"}`.
- `open --flow <id> --skill code-review`, then submit `cards`, `ledger`, and `table` Results with refs and a round whose question lists `results: ["<result ref>/<entry ref>"]`. Open two `wayfinder` Stages with `--ticket 270` and `--ticket 271`.
- Submit with `--session verify-2` and no target: exit 1, and a hash of every file under `$H` is unchanged. Submit an item with an `html` field, then a round whose questions name each other in `again`: each exits 1 naming the item, and the hashes are unchanged.
- Open `file://` plus the page path with a named tab, `app: { tern: false, relay: false }`, and a 1280 by 900 viewport.
  - Overview lists every Stage with its state. Grill's Q1 shows the picked label, Q2 shows the Other text, and Code review's Q1 shows Open. Tabs read `Grill with docs`, `Code review`, `Wayfinder #270`, `Wayfinder #271`, and `Topics`.
  - In Code review, the card's Evidence is closed. One click on its summary opens it.
  - Click the question's link to the card entry, the card's and the table row's links back to the question, and the question's Topic note link and the Topic note's link back. Each opens the target's tab and puts the target below the bar.
  - Press `n` from Topics: it opens Code review's Q1, not the superseded Grill ask.
  - At 360px wide, `scrollWidth - clientWidth` is 0.

## Gotchas

- Without `--session` and outside an omp session, `open` still creates the Flow but binds nothing, and later `submit` needs `--flow` and `--stage`.
- The Flow lands under the repo key of the current directory. Run from the checkout, or the Flow goes under `_global`.
- After a CLI write, go to `about:blank` or call `tab.reload()` before reading the page again.
- Full-page screenshots after scrolling can show the sticky bar midway down. Take them right after a tab click.

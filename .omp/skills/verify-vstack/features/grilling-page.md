# Grilling page

The page script builds each flow's page from JSONL content records. Overview shows the latest ask of every question and its recorded answer. Stage tabs contain Background, Report blocks, rounds, questions, and summaries. The script assigns structure and numbers; the browser supplies keyboard navigation.

## Sub-features

- `page-append`: append content records, assign ids and numbers, write the page and flow identity, print the absolute page path on stdout, and return compact metadata on stderr.
- `page-answer`: record picks, Other text, notes, or an unanswered result.
- `page-refuse`: reject invalid input without changing the state or page.
- `page-concurrent`: serialize concurrent commands, retain every appended question with unique assigned ids and Q numbers, and release the lock when a writer terminates.
- `page-overview`: show Stage state and the latest questions with picked labels, Other text, or Open. Summary prose stays in its Stage. A finished Stage with no questions and `Assumed:` bullets in its close shows `No questions; N decision(s) assumed`, linked to its summary.
- `page-view`: use Iosevka Term Slab headings and Iosevka Term content, a 100rem content column, visible option letters, and labels above full-width report fields and Term notes. Term names are teal, bold, and body size. The Term notes, Topic notes, and From the report labels are pink. Unpicked option headings are blue, and the picked one is yellow and bold. An answer line's label takes its answer's color, such as yellow `Your note` and red `Unanswered`. Report field labels stay gray. A card's Evidence starts collapsed and opens with one click. Background content stays expanded. The tab bar has no key hint.
- `page-tabs`: use short skill-derived labels, numbering repeated labels. h/l and left/right arrows switch tabs.
- `page-keys`: j/k and down/up arrows move through the current tab's Jump row targets: its Background, Report blocks, questions in Q-number order, and summary. n opens the first unanswered question across all Stages. Repeated presses stay there. Superseded asks do not count as open.
- `page-links`: links reveal their target tab, mark their target as current, and scroll it below the bar, including a deep link to a question in another tab. A report entry is not a Jump row target, so a link to one marks its report as current.
- `page-rename`: move the flow folder, retain its identity, and keep relative and in-folder absolute SVG paths working. Refuse an existing destination or an SVG that would stop resolving.

## How to get to it (user POV)

- A flow's skill runs `bun "$(realpath skill://grilling-page/scripts/grilling-page.ts)" append|answer|render ...` on its state file and prints the page path.
- The user opens that path in a browser.
- to-spec and wayfinder run `rename` when the flow gets its spec or map key.

## Driving it with bash and the omp browser

Preconditions:

- Follow the baseline in `README.md` and run Doctor.
- Set `G="$VERIFY_RUN_DIR/grilling-page"`, `F="$G/grilling/vstack-verify-flow-page"`, and `SCRIPT="$CHECKOUT/plugin/skills/grilling-page/scripts/grilling-page.ts"`. Use a fresh directory. Keep proof outside `data/` so Cleanup preserves it.
- Run CLI commands with the bash tool's `cwd` set to `CHECKOUT`.

Write `$G/records.jsonl` with these records. Explicit ids let later records link within the batch. Omit Stage titles, order, session and round numbers, timestamps, and Q numbers.

```jsonl
{"type":"page","id":"page","title":"Verify page topic"}
{"type":"flow","id":"flow","slug":"verify-flow-page","key":"verify-flow-page","state":"open"}
{"type":"stage","id":"docs","skill":"grill-with-docs","state":"in-progress"}
{"type":"background","id":"docs-bg","stage":"docs","title":"Notes background","summary":"Notes need one home.","sections":[{"heading":"Context","body":"The team writes notes every day."}],"sources":["GLOSSARY.md"]}
{"type":"topic","id":"stores","title":"Note stores","summary":"A store is where notes live.","body":"Each store keeps the notes of one team.","sources":["GLOSSARY.md"]}
{"type":"round","id":"s1-r1","stage":"docs"}
{"type":"question","id":"s1-r1-q1","title":"Which store keeps the notes?","description":"The choice sets where notes live.","topics":["stores"],"terms":[{"term":"Store","text":"The home of a team's notes."},{"term":"`sync`","text":"Copying notes between devices."},{"term":"[Upstream](https://example.com/upstream)","text":"Where the store's code comes from."}],"options":[{"label":"A. Local files","does":"Write to disk.","gains":["Offline access"],"costs":["No sync"],"recommended":"No server."},{"label":"B. Hosted store","does":"Share on a server.","gains":["Team sync"],"costs":["Connectivity"]}]}
{"type":"question","id":"s1-r1-q2","title":"Who can read the notes?","description":"The choice sets sharing.","options":[{"label":"A. Only me","does":"Keep notes private.","gains":["Privacy"],"costs":["No sharing"]},{"label":"B. My team","does":"Share with the team.","gains":["Sharing"],"costs":["Access rules"]}]}
```

1. Run `bun "$SCRIPT" append "$F/page.jsonl" "$G/records.jsonl"`. Expect exit 0 and only `$F/page.html` on stdout. Stderr is one compact JSON array in input order, with each record's `type`, `id`, and applicable `stage`, `question`, `again`, `order`, `session`, `round`, `q`, and `time`. It contains no prose or content text. Save both streams separately. Inspect the written state, `flow.json`, and `figures/`. The Stage order is 1, the first round is session 1 and round 1 with a current timestamp, and the questions are Q1 and Q2.
2. Run `bun "$SCRIPT" answer "$F/page.jsonl" 's1-r1-q1=B:only with sync' 's1-r1-q2=unanswered:Timed out'`. Expect exit 0 and the same path.
3. Save hashes of the state and page. Append a question whose second label is `Second` instead of `B. Second`. Expect exit 1 naming option B and unchanged hashes. Preserve stdout, stderr, and exit code in `$G/refuse.txt`.
4. Write two text-only SVG fixtures in `figures/`, named `context.svg` and `option.svg`, with distinguishable text. Store one relative path and one absolute path in the question below.
5. Write `$G/review.jsonl` from the records below, substituting the absolute `$F` path. Run `bun "$SCRIPT" append "$F/page.jsonl" "$G/review.jsonl"`. Expect exit 0. The close references its Stage, not a caller-assigned session number.

```jsonl
{"type":"close","id":"s1-close","stage":"docs","decisions":[{"question":"s1-r1-q1","text":"Notes live in a hosted store."},{"question":"s1-r1-q2","text":"Sharing stays open."}]}
{"type":"stage","id":"docs","skill":"grill-with-docs","state":"finished"}
{"type":"stage","id":"review","skill":"code-review","state":"in-progress"}
{"type":"report","id":"review-cards","stage":"review","title":"Review findings","shape":"cards","entries":[{"id":"store-card","title":"Check the store","label":"suggestion","blocking":false,"impact":"Notes could split across stores. This long field should wrap across the available width rather than beside a narrow label column.","evidence":"Q1 picks one store.","action":"Keep one store.","question":"s1-r1-q1"}]}
{"type":"report","id":"review-ledger","stage":"review","title":"Review proof ledger","shape":"ledger","entries":[{"id":"sync-proof","claim":"Sync works offline.","status":"confirmed","evidence":"The store keeps a local copy.","missing_proof":"None.","consequence":"Ship the store.","question":"s2-r2-q1"}]}
{"type":"report","id":"review-table","stage":"review","title":"Review runs","shape":"table","columns":["Run","Result"],"rows":[{"id":"run-1","cells":["run-1","passed"],"question":"s2-r2-q1"}]}
{"type":"round","id":"s2-r2","stage":"review"}
{"type":"question","id":"s2-r2-q1","title":"Is the review proof enough?","description":"The choice sets when the change merges.","report_entries":["review-ledger/sync-proof","review-table/run-1"],"visual":[{"svg":"figures/context.svg"},{"svg":"$F/figures/option.svg"}],"options":[{"label":"A. Ship it","does":"Merge the change.","gains":["Done today"],"costs":["One risk left"],"recommended":"The proof is confirmed."},{"label":"B. Hold it","does":"Wait for more proof.","gains":["Less risk"],"costs":["A later merge"]}]}
{"type":"stage","id":"review-again","skill":"code-review","state":"not-started"}
```

Open `file://` plus `$F/page.html` with a named browser tab, `app: { tern: false }`, and a 1280 by 900 viewport. Save ARIA snapshots and full-resolution lossless WebP screenshots as the Verify skill describes.

- Overview is selected. The tabs are Overview, Grill, Review, Review 2, and Topics. Grill is Finished. Q1 shows `B. Hosted store`; Q2 shows Open. Review's Q1 shows Open. The close's decision prose is absent from Overview.
- Click `role/tab[name="Grill" exact]`. Background precedes session 1, round 1, with the assigned time. Option headings retain `A.` and `B.`; the picked heading has `(your answer)`, and the note says `only with sync`. Term labels sit above their definitions. Term names have computed color teal (`#94e2d5`) at the body font size, including the code term `sync` and the linked term Upstream, which keeps its underline and turns lavender (`#b4befe`) on hover. The Term notes and Topic notes labels are pink (`#f5c2e7`). The unpicked option headings are blue (`#89b4fa`), and the picked `B. Hosted store` heading is yellow (`#f9e2af`). The `Your note` label is yellow and the `Unanswered` label is red (`#f38ba8`). The page sets colors in OKLCH, so read each rendered color by painting the computed `color` onto a 1-pixel canvas and reading its hex. The summary contains its decisions with no Closing gate row.
- Click `role/tab[name="Review" exact]`. Cards, ledger, and table precede the question. A card reads Impact, then Action, each above its full-width text, then a collapsed Evidence disclosure: the text `Q1 picks one store.` is absent from the ARIA snapshot and not visible. Click the Evidence summary once. The disclosure is open and the evidence text is visible and in the ARIA snapshot. In the ledger, Evidence, Missing proof, and Consequence sit above their full-width text. In cards and ledger claims, Question sits above its full-width navigation link. The figures have distinguishable text. The tab bar has no key hint. Save ARIA snapshots and screenshots of the closed and open card.
- Start on Overview again. Check h/l, arrows, and j/k. On Overview j/k mark nothing. In Grill the Jump row reads Background, Q1, Q2, Summary; j visits Background, Q1, Q2, then Summary, and k returns to Q2. In Review the Jump row reads Report, Report 2, Report 3, then Q1. Review 2 has no questions, and j/k do nothing there.
- Press n from Review 2 or Topics. It opens Grill at Q2, not the older answered Q1. Press n again: it stays on Q2. Record the selected tab, current question, hash, and scroll position in `$G/keys.json`.
- Append a round for docs with a new question first and then a question with `again: "s1-r1-q2"`. The new one is Q3; the reask keeps Q2 and renders before Q3 in the round and in the Jump row. Answer both and reload. The old timed-out ask is superseded; n now opens Review at its Q1. Answer Review's Q1 and reload. With all latest asks answered, n leaves the current tab and position unchanged.
- Exercise Overview-to-question, report-to-question, question-to-report, and question-to-Topic links. Each reveals the target tab. Use scoped selectors, since Q1 occurs in several places, for example `#q-s2-r2-q1 a[href="#report-review-ledger_sync-proof"]`. The question-to-report link marks `Report 2` as current in the Jump row, since the entry itself is not a Jump target. Navigate to `page.html#q-s2-r2-q1` from a blank tab: the Review tab opens and the question's top sits at least the bar's height below the viewport top. Save results in `$G/links.json`.
- At 1900px viewport width, the content track is 1600px. Check computed body and heading font families and the actual rendered fonts. At 360px, the page has no horizontal document overflow. Preserve screenshots at both widths.
- Append a round and question without ids or numbers in a fresh page. Get the assigned round id, question id, and Q number from stderr metadata, then answer using that id without reading state first. Replacement records return their existing assigned numbering.
- In another fresh page, seed a round and a question with a 4,000,000-character description to overlap rendering. Spawn eight CLI appends concurrently, each with one idless question titled `Writer <i>?`. Require eight exit-0 results, eight persisted worker questions (nine questions with the seed), eight unique worker ids, worker Q numbers 2 through 9, and all eight worker titles in the final page. Save command output and counts as `$G/concurrency.json`.
- On Darwin and Linux, exercise termination at the CLI seam. Make an SVG FIFO, append a question that reads it, and open the FIFO's writer nonblocking to confirm that rendering holds the state lock. Keep that descriptor open, kill the CLI with SIGKILL, and close the writer. Require a subsequent append to complete and render its question. The interrupted command must not have appended its question. Record the host platform and results as `$G/kill-reacquire.json`. Prove Darwin and Linux separately; a run on one platform does not exercise the other's system-library path. Empty temporary lock files remain by design, but their kernel locks must be released.
- Run `rename "$F/page.jsonl" 9151`. The folder moves to `vstack-9151`, flow identity retains `verify-flow-page` in `slug` and `old_keys`, `key` is `9151`, and both SVGs still render. The latest record stores the absolute in-folder SVG path as relative; the earlier record keeps its old text, since the state is append-only. Set `F` to the moved folder. A same-key rename changes no files.
- Prove each rename refusal against its own snapshot. Existing destination: `mkdir -p "$G/grilling/vstack-taken"`, hash the folder's files, then `rename "$F/page.jsonl" taken` exits 1 with `rename: <path>/vstack-taken already exists` and `Nothing was written.` SVG that would stop resolving: append to round `s2-r2` a question whose `visual` is `[{"svg":"../vstack-9151/figures/context.svg"}]`, which resolves now. The append changes `page.jsonl` and `page.html`, so hash the folder's files again after it. Then `rename "$F/page.jsonl" 9152` exits 1 with `question <id>: ../vstack-9151/figures/context.svg would not resolve after the move`. Compare each refusal with the hashes taken just before its rename command: neither changes them or creates its destination. Keep the failed command output and both before/after hash pairs.
- In another fresh page at `$G/grilling/vstack-verify-assumed`, append a `page`, a `flow` with key `verify-assumed`, a finished `grill-with-docs` Stage `grill`, and `{"type":"close","id":"assumed-close","stage":"grill","decisions":[],"extra":["Assumed: Keep local files.","A note about Assumed: picks."]}`, with no round. Stderr gives the close session 1. Overview shows the link `No questions; 1 decision assumed` to `#close-assumed-close`; only bullets that start with `Assumed:` count. Append the close again with two `Assumed:` bullets: the link reads `No questions; 2 decisions assumed`. A close with `decisions: []` and no `extra` exits 1 with `a close lists one or more decisions or extra bullets` and changes no hashes. In the browser, click the link: Grill opens, its Jump row reads only Summary, and Summary is current. A later Stage's first round gets session 2.

## Gotchas

- Use `app: { tern: false }`. A Tern picture-in-picture pane is too narrow for desktop proof. Do not pass `allow_file_access` to shared Chromium.
- Reload keeps the hash and opens its tab. Navigate to the plain page URL to start on Overview.
- After a CLI write, `tab.goto` to the same page with only a new hash does not load the new file. The tab keeps showing the old page. Go to `about:blank` first, or call `tab.reload()`, before you read the result.
- Keyboard handlers ignore modifier keys. The page must have focus.
- Take full-page screenshots immediately after a tab click. After scrolling, a sticky bar can appear midway through the capture.
- The card's Evidence summary has no stable role selector: `generic` and `DisclosureTriangle` role selectors do not resolve it. Observe the page, then click the observed element named Evidence with state `expanded=false`. Read `details.open` and the evidence paragraph's `checkVisibility()`; `getClientRects()` still reports boxes for closed content.
- Automatic numbering happens on append. Render, answer, and rename preserve existing stored numbers.
- Re-asks need `again` to reuse a Q number. An old unanswered ask does not remain an n target once superseded.
- The flow key must match its folder suffix. Use a fresh folder per run and retain failed proof rather than deleting it for a retry.

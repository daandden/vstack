# Grilling page

The page script builds each flow's page from JSONL content records. Overview shows the latest ask of every question and its recorded answer. Stage tabs contain Background, Report blocks, rounds, questions, and summaries. The script assigns structure and numbers; the browser supplies keyboard navigation.

## Sub-features

- `page-append`: append content records, assign ids and numbers, write the page and flow identity, print the absolute page path on stdout, and return compact metadata on stderr.
- `page-answer`: record picks, Other text, notes, or an unanswered result.
- `page-refuse`: reject invalid input without changing the state or page.
- `page-concurrent`: serialize concurrent commands, retain every appended question with unique assigned ids and Q numbers, and release the lock when a writer terminates.
- `page-overview`: show Stage state and the latest questions with picked labels, Other text, or Open. Summary prose stays in its Stage.
- `page-view`: use Iosevka Term Slab headings and Iosevka Term content, a 100rem content column, visible option letters, and labels above full-width report fields and Term notes. Background content stays expanded. The tab bar has no key hint.
- `page-tabs`: use short skill-derived labels, numbering repeated labels. h/l and left/right arrows switch tabs.
- `page-keys`: j/k and down/up arrows move among questions and summaries in the current tab. n opens the first unanswered question across all Stages. Repeated presses stay there. Superseded asks do not count as open.
- `page-links`: links reveal their target tab and mark a question as current.
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
{"type":"question","id":"s1-r1-q1","title":"Which store keeps the notes?","description":"The choice sets where notes live.","topics":["stores"],"terms":[{"term":"Store","text":"The home of a team's notes."}],"options":[{"label":"A. Local files","does":"Write to disk.","gains":["Offline access"],"costs":["No sync"],"recommended":"No server."},{"label":"B. Hosted store","does":"Share on a server.","gains":["Team sync"],"costs":["Connectivity"]}]}
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
- Click `role/tab[name="Grill" exact]`. Background precedes session 1, round 1, with the assigned time. Option headings retain `A.` and `B.`; the picked heading has `(your answer)`, and the note says `only with sync`. Term labels sit above their definitions. The summary contains its decisions with no Closing gate row.
- Click `role/tab[name="Review" exact]`. Cards, ledger, and table precede the question. Impact, Evidence, Action, Missing proof, and Consequence sit above their full-width text. In cards and ledger claims, Question sits above its full-width navigation link. The figures have distinguishable text. The tab bar has no key hint.
- Start on Overview again. Check h/l, arrows, and j/k. On Overview j/k mark nothing. In Grill j visits Q1, Q2, then Summary, and k returns to Q2. Review 2 has no questions, and j/k do nothing there.
- Press n from Review 2 or Topics. It opens Grill at Q2, not the older answered Q1. Press n again: it stays on Q2. Record the selected tab, current question, hash, and scroll position in `$G/keys.json`.
- Append a round for docs and a new question with `again: "s1-r1-q2"`. It keeps Q2. Answer it and reload. The old timed-out ask is superseded; n now opens Review at its Q1. Answer Review's Q1 and reload. With all latest asks answered, n leaves the current tab and position unchanged.
- Exercise Overview-to-question, report-to-question, question-to-report, and question-to-Topic links. Each reveals the target tab. Use scoped selectors, since Q1 occurs in several places. Save results in `$G/links.json`.
- At 1900px viewport width, the content track is 1600px. Check computed body and heading font families and the actual rendered fonts. At 360px, the page has no horizontal document overflow. Preserve screenshots at both widths.
- Append a round and question without ids or numbers in a fresh page. Get the assigned round id, question id, and Q number from stderr metadata, then answer using that id without reading state first. Replacement records return their existing assigned numbering.
- In another fresh page, seed a round and a question with a 4,000,000-character description to overlap rendering. Spawn eight CLI appends concurrently, each with one idless question. Require eight exit-0 results, eight persisted question lines, eight unique assigned ids, eight unique Q numbers, and all eight questions in the final page. Save command output and counts as `$G/concurrency.json`.
- On Darwin and Linux, exercise termination at the CLI seam. Make an SVG FIFO, append a question that reads it, and open the FIFO's writer nonblocking to confirm that rendering holds the state lock. Keep that descriptor open, kill the CLI with SIGKILL, and close the writer. Require a subsequent append to complete and render its question. The interrupted command must not have appended its question. Record the host platform and results as `$G/kill-reacquire.json`. Prove Darwin and Linux separately; a run on one platform does not exercise the other's system-library path. Empty temporary lock files remain by design, but their kernel locks must be released.
- Run `rename "$F/page.jsonl" 9151`. The folder moves to `vstack-9151`, flow identity retains `verify-flow-page` in `slug` and `old_keys`, and both SVGs still render. The absolute in-folder SVG path becomes relative. A same-key rename changes no files.
- Hash the folder's files. An existing destination and an SVG path that would stop resolving each cause rename to exit 1 without changing those hashes. Keep the failed command output and before/after hashes.

## Gotchas

- Use `app: { tern: false }`. A Tern picture-in-picture pane is too narrow for desktop proof. Do not pass `allow_file_access` to shared Chromium.
- Reload keeps the hash and opens its tab. Navigate to the plain page URL to start on Overview.
- Keyboard handlers ignore modifier keys. The page must have focus.
- Take full-page screenshots immediately after a tab click. After scrolling, a sticky bar can appear midway through the capture.
- Automatic numbering happens on append. Render, answer, and rename preserve existing stored numbers.
- Re-asks need `again` to reuse a Q number. An old unanswered ask does not remain an n target once superseded.
- The flow key must match its folder suffix. Use a fresh folder per run and retain failed proof rather than deleting it for a retry.

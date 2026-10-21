# Grilling page

Every `ask` in a flow goes on the flow's Grilling page: an HTML page with each Stage's Background, Report blocks, rounds, questions, options, the recommended option, the user's answers, and summaries. The grilling-page script renders it from the `page.jsonl` state file in the flow folder `<Scratch dir>/grilling/<project>-<key>/`, next to `page.html`, `flow.json`, and `figures/`. The page opens on an Overview tab, then has one tab per Stage and a Topics tab. The user opens the printed path in a browser, switches tabs with the keyboard, and moves between the questions of a tab with the keyboard.

## Sub-features

- `page-append` `append <state.jsonl> <records.jsonl>` checks the records, renders the page next to the state file, and prints its absolute path. With a `flow` record, it also writes `flow.json` from that record and makes `figures/` in the flow folder.
- `page-answer` `answer <state.jsonl> <question-id>=<spec>` marks the picked option as `(your answer)` and shows a note when the spec has one.
- `page-refuse` a bad record exits 1, names the record and the fix, and writes nothing.
- `page-overview` the page opens on the Overview tab. The tabs are Overview, one tab per `stage` in `order`, and Topics last. The Overview lists each Stage with its state and skill, the decisions of its summary, and its open questions.
- `page-view` a Stage tab shows the Background first, then the Report blocks (cards, ledger, table), then each round with its questions, descriptions, options, `(recommended)`, `(your answer)`, the note, links to Topic notes and report entries, and SVG figures, then the session summary. The Topics tab shows each Topic note.
- `page-tabs` `l` or the right arrow opens the next tab, and `h` or the left arrow opens the previous one.
- `page-keys` inside a Stage tab, `j` or the down arrow moves to the next question or summary, and `k` or the up arrow moves back. The link of the current stop in the question bar gets `aria-current="true"`. On the Overview tab, `j` and `k` mark nothing.
- `page-links` a link to a question, a report entry, or a Topic note opens the tab that holds it. A link to a question marks that question as current.
- `page-rename` `rename <state.jsonl> <new-key>` moves the flow folder to `<project>-<new-key>/`, adds the old key to `old_keys` in the `flow` record and `flow.json`, stores each absolute SVG path in the folder as a relative path, and prints the new page path.
- `page-rename-refuse` `rename` exits 1 and writes nothing when the target folder exists, or when an SVG path does not resolve after the move.

## How to get to it (user POV)

- An agent in a skill that asks in a flow, such as `/skill:grilling`, `/skill:grill-with-docs`, `/skill:to-spec`, `/skill:to-tickets`, or `/skill:code-review`, runs `bun "$(realpath skill://grilling-page/scripts/grilling-page.ts)" append|answer|render ...` on the flow's `page.jsonl` and prints the page path.
- `/skill:to-spec` and `/skill:wayfinder` run `rename` to key the flow folder by the spec or map issue, and print the new path.
- The user opens that path in a browser.

## Driving it with bash and the omp browser

Preconditions:

- The baseline from `README.md`.
- `G="$VERIFY_RUN_DIR/grilling-page"`, made with `mkdir -p "$G"`. `F="$G/grilling/vstack-verify-flow-page"` is the flow folder, in the same `grilling/<project>-<key>/` shape as the Scratch dir. The flow folder and page are proof, so they go under `$G`, not in `data/` and not in the real Scratch dir. The first `append` makes `$F`.

- Records. Write `$G/records.jsonl` with the first Stage: one `page`, one `flow`, one `stage`, one `background`, one `topic`, one `round`, and two `question` records:

  ```jsonl
  {"type":"page","id":"page","title":"Verify page topic"}
  {"type":"flow","id":"flow","slug":"verify-flow-page","key":"verify-flow-page","state":"open"}
  {"type":"stage","id":"docs","skill":"grill-with-docs","title":"Grill with docs","state":"in-progress","order":1}
  {"type":"background","id":"docs-bg","stage":"docs","title":"Notes background","summary":"Notes need one home.","sections":[{"heading":"Context","body":"The team writes notes every day."}],"sources":["GLOSSARY.md"]}
  {"type":"topic","id":"stores","title":"Note stores","summary":"A store is where notes live.","body":"Each store keeps the notes of one team.","sources":["GLOSSARY.md"]}
  {"type":"round","id":"s1-r1","session":1,"round":1,"time":"2026-10-11T10:00:00+07:00","stage":"docs"}
  {"type":"question","id":"s1-r1-q1","round":"s1-r1","q":1,"title":"Which store keeps the notes?","description":"The choice sets where notes live.\n\n- one store\n- `two` stores","topics":["stores"],"options":[{"label":"A. Local files","does":"Writes notes to disk","gains":["No server"],"costs":["No sync"],"recommended":"it needs no server"},{"label":"B. Hosted store","does":"Writes notes to a server","gains":["Sync"],"costs":["A server to run"]}]}
  {"type":"question","id":"s1-r1-q2","round":"s1-r1","q":2,"title":"Who can read the notes?","description":"The choice sets sharing.","options":[{"label":"A. Only me","does":"Keeps notes private","gains":["Privacy"],"costs":["No sharing"]},{"label":"B. My team","does":"Shares notes with the team","gains":["Sharing"],"costs":["Access rules"],"recommended":"the team needs the notes"}]}
  ```
- Append. With the bash tool's `cwd` set to `CHECKOUT`, run `bun plugin/skills/grilling-page/scripts/grilling-page.ts append "$F/page.jsonl" "$G/records.jsonl"`. Exit 0, and stdout is `$F/page.html`. `ls "$F"` prints `figures`, `flow.json`, `page.html`, and `page.jsonl`. `jq -c . "$F/flow.json"` prints `{"id":"flow","slug":"verify-flow-page","key":"verify-flow-page","state":"open"}`.
- Answer. In the same `cwd`, run `bun plugin/skills/grilling-page/scripts/grilling-page.ts answer "$F/page.jsonl" 's1-r1-q1=B:only with sync'`. Exit 0, and stdout is the same page path.
- Refuse. In the same `cwd`, run `printf '%s\n' '{"type":"question","id":"s1-r1-q3","round":"s1-r1","q":3,"title":"Bad?","description":"d","options":[{"label":"A. First","does":"x","gains":["g"],"costs":["c"]},{"label":"Second","does":"y","gains":["g"],"costs":["c"]}]}' | bun plugin/skills/grilling-page/scripts/grilling-page.ts append "$F/page.jsonl" - 2>&1 | tee "$G/refuse.txt"; echo "exit=${PIPESTATUS[1]}"`. The output is the line `grilling-page.ts: line 10: question s1-r1-q3: option B: label must start with "B. ", the same text as the ask label`, then `Nothing was written.` and `exit=1`. The line number counts the state file's 9 lines first. `grep -c s1-r1-q3 "$F/page.jsonl"` prints `0`.
- Figures. Write two SVG files into the `figures/` folder that `append` made: `printf '%s\n' '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="100" viewBox="0 0 640 100"><text x="10" y="50" fill="#cdd6f4">Relative figure</text></svg>' | tee "$F/figures/context.svg"`, and the same with the text `Absolute figure` to `$F/figures/option.svg`.
- Second Stage. Write `$G/review.jsonl` with these lines. Replace `$F` in the second `svg` path with its absolute value, so that one figure has a relative path and one an absolute path. The lines close session 1, finish the first Stage, add a Code review Stage with a cards, a ledger, and a table Report block and one round, and append `s1-r1-q1` again with its report link:

  ```jsonl
  {"type":"close","id":"s1-close","session":1,"decisions":[{"question":"s1-r1-q1","text":"Notes live in a hosted store."},{"question":"s1-r1-q2","text":"Sharing stays open."}]}
  {"type":"stage","id":"docs","skill":"grill-with-docs","title":"Grill with docs","state":"finished","order":1}
  {"type":"stage","id":"review","skill":"code-review","title":"Code review","state":"in-progress","order":2}
  {"type":"report","id":"review-cards","stage":"review","title":"Review findings","shape":"cards","entries":[{"id":"store-card","title":"Check the store","label":"suggestion","blocking":false,"impact":"Notes could split across stores.","evidence":"Q1 picks one store.","action":"Keep one store.","question":"s1-r1-q1"}]}
  {"type":"report","id":"review-ledger","stage":"review","title":"Review proof ledger","shape":"ledger","entries":[{"id":"sync-proof","claim":"Sync works offline.","status":"confirmed","evidence":"The store keeps a local copy.","missing_proof":"None.","consequence":"Ship the store.","question":"s2-r2-q1"}]}
  {"type":"report","id":"review-table","stage":"review","title":"Review runs","shape":"table","columns":["Run","Result"],"rows":[{"id":"run-1","cells":["run-1","passed"],"question":"s2-r2-q1"}]}
  {"type":"round","id":"s2-r2","session":2,"round":2,"time":"2026-10-11T11:00:00+07:00","stage":"review"}
  {"type":"question","id":"s2-r2-q1","round":"s2-r2","q":1,"title":"Is the review proof enough?","description":"The choice sets when the change merges.","report_entries":["review-ledger/sync-proof","review-table/run-1"],"visual":[{"svg":"figures/context.svg"},{"svg":"$F/figures/option.svg"}],"options":[{"label":"A. Ship it","does":"Merges the change","gains":["Done today"],"costs":["One risk left"],"recommended":"the proof is confirmed"},{"label":"B. Hold it","does":"Waits for more proof","gains":["Less risk"],"costs":["A later merge"]}]}
  {"type":"question","id":"s1-r1-q1","round":"s1-r1","q":1,"title":"Which store keeps the notes?","description":"The choice sets where notes live.\n\n- one store\n- `two` stores","topics":["stores"],"report_entries":["review-cards/store-card"],"options":[{"label":"A. Local files","does":"Writes notes to disk","gains":["No server"],"costs":["No sync"],"recommended":"it needs no server"},{"label":"B. Hosted store","does":"Writes notes to a server","gains":["Sync"],"costs":["A server to run"]}]}
  ```

  In the same `cwd`, run `bun plugin/skills/grilling-page/scripts/grilling-page.ts append "$F/page.jsonl" "$G/review.jsonl"`. Exit 0, and stdout is `$F/page.html`.
- Overview. In a JS eval cell, open the page: `const tab = await browser.open({ name: "verify-grilling", url: "file://" + F + "/page.html", app: { tern: false }, viewport: { width: 1280, height: 900 } })`. Save `await tab.ariaSnapshot()` to `$G/overview.aria.txt`. It holds `tab "Overview" [selected]`, then the tabs `Grill with docs`, `Code review`, and `Topics` in that order, `heading "Grill with docs Finished grill-with-docs"` with the decisions `Notes live in a hosted store.` and `Sharing stays open.` and the open question `Who can read the notes?`, and `heading "Code review In progress code-review"` with `No decisions yet.` and the open question `Is the review proof enough?`. Before you press any key, capture and convert as `../SKILL.md` Evidence step 5 says, with `out` set to `$G/overview.webp`. Read it. The `Grill with docs` tab and row have a green dot, and the `Code review` ones an orange dot.
- Stage tab. Click `role/tab[name="Grill with docs"]`. Save `await tab.ariaSnapshot()` to `$G/stage.aria.txt`. It holds `tab "Grill with docs" [active] [selected]`, `navigation "Questions in Grill with docs"` with the links `Q1`, `Q2`, and `Summary`, `heading "Notes background"` before `heading "Session 1, round 1 11 Oct 2026, 10:00"`, `heading "Q1Which store keeps the notes?"`, the link `Review findings store-card`, the link `Note stores`, `heading "Local files (recommended)"`, `heading "Hosted store (your answer)"`, the note `only with sync`, `heading "Q2Who can read the notes?"`, `heading "My team (recommended)"`, and `heading "Summary of session 1"` with the decisions `Notes live in a hosted store.` and `Sharing stays open.`, and no `Closing gate`. Capture `$G/stage.webp` the same way and read it. It shows the Background, both questions, a star on each recommended option, the answered option in yellow, the `Your note` line, and the summary.
- Report tab. Click `role/tab[name="Code review"]`. Save the snapshot to `$G/review.aria.txt`. It holds the regions `Review findings`, `Review proof ledger`, and `Review runs`, in that order, before `Session 2, round 2 11 Oct 2026, 11:00`. The card shows `suggestion (non-blocking)`, the ledger entry shows `Confirmed`, and the table has the row `run-1 passed Q1: Is the review proof enough?`. The question has the links `Review proof ledger sync-proof` and `Review runs run-1`, and two figures with the texts `Relative figure` and `Absolute figure`. Capture `$G/review.webp` the same way and read it. It shows the three Report blocks above the question, and both figure texts in light letters.
- Tabs and keys. Run `await tab.goto("file://" + F + "/page.html")`, so the page opens on Overview again. Read where the page is with `const where = () => tab.evaluate(() => ({ tab: document.querySelector('[role="tab"][aria-selected="true"]').textContent.trim(), current: [...document.querySelectorAll('nav:not([hidden]) a[aria-current="true"]')].map((a) => a.textContent.trim()), hash: location.hash }))`. After load, it is `{ tab: "Overview", current: [], hash: "" }`. Press each key with `await tab.press(key)` and read `where()` after it:

  | Key | `tab` | `current` |
  | --- | --- | --- |
  | `j` | `Overview` | `[]` |
  | `l` | `Grill with docs` | `[]` |
  | `l` | `Code review` | `[]` |
  | `h` | `Grill with docs` | `[]` |
  | `ArrowRight` | `Code review` | `[]` |
  | `ArrowLeft` | `Grill with docs` | `[]` |
  | `j` | `Grill with docs` | `["Q1"]` |
  | `j` | `Grill with docs` | `["Q2"]` |
  | `k` | `Grill with docs` | `["Q1"]` |
  | `ArrowDown` | `Grill with docs` | `["Q2"]` |
  | `ArrowUp` | `Grill with docs` | `["Q1"]` |
  | `j` | `Grill with docs` | `["Q2"]` |
  | `j` | `Grill with docs` | `["Summary"]` |
  | `l` | `Code review` | `[]` |
  | `l` | `Topics` | `[]` |
  | `l` | `Topics` | `[]` |
  | `h` | `Code review` | `[]` |

  Write each key and its `where()` value to `$G/keys.json`.
- Links. Run `await tab.goto("file://" + F + "/page.html")` again. Click each selector with `await tab.click(selector)` and read `where()` after it:

  | Link | Selector | `tab` | `current` | `hash` |
  | --- | --- | --- | --- | --- |
  | Overview open question | `#overview a[href="#q-s2-r2-q1"]` | `Code review` | `["Q1"]` | `#q-s2-r2-q1` |
  | Question to ledger entry | `role/link[name="Review proof ledger sync-proof"]` | `Code review` | `[]` | `#report-review-ledger_sync-proof` |
  | Ledger entry to question | `#report-review-ledger_sync-proof a[href="#q-s2-r2-q1"]` | `Code review` | `["Q1"]` | `#q-s2-r2-q1` |
  | Question to table row | `role/link[name="Review runs run-1"]` | `Code review` | `[]` | `#report-review-table_run-1` |
  | Card to question in another tab | `#report-review-cards_store-card a[href="#q-s1-r1-q1"]` | `Grill with docs` | `["Q1"]` | `#q-s1-r1-q1` |
  | Question to card in another tab | `role/link[name="Review findings store-card"]` | `Code review` | `[]` | `#report-review-cards_store-card` |
  | Overview tab | `role/tab[name="Overview"]` | `Overview` | `[]` | `#overview` |
  | Overview decision | `#overview a[href="#q-s1-r1-q1"]` | `Grill with docs` | `["Q1"]` | `#q-s1-r1-q1` |
  | Question to Topic note | `#stage-docs a[href="#topic-stores"]` | `Topics` | `["Note stores"]` | `#topic-stores` |

  Write each link and its `where()` value to `$G/links.json`. Save the snapshot to `$G/topics.aria.txt`. It holds `heading "Note stores"`, `A store is where notes live.`, and `Each store keeps the notes of one team.`. Close the tab with `await tab.close()`.
- Rename. In the same `cwd` as Append, run `bun plugin/skills/grilling-page/scripts/grilling-page.ts rename "$F/page.jsonl" 9151`. Exit 0, and stdout is `$G/grilling/vstack-9151/page.html`. Set `N="$G/grilling/vstack-9151"`. `test -e "$F"` exits 1. `ls "$N"` prints `figures`, `flow.json`, `page.html`, and `page.jsonl`. `jq -c . "$N/flow.json"` prints `{"id":"flow","slug":"verify-flow-page","key":"9151","state":"open","old_keys":["verify-flow-page"]}`. `jq -cs '[.[] | select(.id == "s2-r2-q1")] | last | .visual' "$N/page.jsonl"` prints `[{"svg":"figures/context.svg"},{"svg":"figures/option.svg"}]`: the absolute path is now relative. `grep -c 'Relative figure\|Absolute figure' "$N/page.html"` prints `2`.
- Refuse an existing target. Run `mkdir "$G/grilling/vstack-taken"`, then `find "$G/grilling" -type f -exec shasum -a 256 {} + | sort | tee "$G/before-taken.txt"`. In the same `cwd`, run `bun plugin/skills/grilling-page/scripts/grilling-page.ts rename "$N/page.jsonl" taken 2>&1 | tee "$G/refuse-taken.txt"; echo "exit=${PIPESTATUS[0]}"`. The output is `grilling-page.ts: rename: $G/grilling/vstack-taken already exists`, with `$G` as its absolute value, then `Nothing was written.` and `exit=1`. Run the same `find` with `tee "$G/after-taken.txt"`. `diff "$G/before-taken.txt" "$G/after-taken.txt"` exits 0.
- Refuse an SVG that does not resolve after the move. Give `s2-r2-q1` an SVG path that leaves the folder by its old name: `grep '"id":"s2-r2-q1"' "$G/review.jsonl" | jq -c '.visual = [{"svg":"../vstack-9151/figures/context.svg"}]' | bun plugin/skills/grilling-page/scripts/grilling-page.ts append "$N/page.jsonl" -`. Exit 0. Run the same `find` with `tee "$G/before-svg.txt"`. Run `bun plugin/skills/grilling-page/scripts/grilling-page.ts rename "$N/page.jsonl" moved 2>&1 | tee "$G/refuse-svg.txt"; echo "exit=${PIPESTATUS[0]}"`. The output is `grilling-page.ts: rename: question s2-r2-q1: ../vstack-9151/figures/context.svg would not resolve after the move. Store each SVG as a path relative to the flow folder`, then `Nothing was written.` and `exit=1`. Run the same `find` with `tee "$G/after-svg.txt"`. `diff "$G/before-svg.txt" "$G/after-svg.txt"` exits 0, and `test -e "$G/grilling/vstack-moved"` exits 1.

## Gotchas

- Use `app: { tern: false }`. Inside Tern, the default tab is a narrow picture-in-picture pane, and the page renders one letter per line.
- Do not pass `allow_file_access`. The shared Chromium refuses it, and `file://` pages open without it.
- The page opens on the Overview tab, which holds no questions. Open a Stage tab before you look for question headings or press `j` and `k`.
- `j` and `k` do nothing while a modifier key is down, and the page must have focus. Press them after the page loads, not in the address bar.
- `role/link[name="Q1"]` matches several links: the Overview, the question bar, and report entries each have one. Select a question link by its panel and target, such as `#overview a[href="#q-s2-r2-q1"]`. The question bars of the other tabs are hidden but still in the page, so `role/link[name="Note stores"]` matches a zero-size link and the click times out. Use `#stage-docs a[href="#topic-stores"]`.
- A tab click and a key replace the URL hash. `tab.reload()` keeps that hash and opens its tab. Use `tab.goto` with the plain page URL to start again on Overview.
- After a key scrolls the page, a `fullPage` screenshot draws the sticky question bar in the middle of the image. Take each screenshot right after its tab click, before any key.
- A question needs one or more options. A record with no options fails with `options must list one or more options` before the label check runs.
- The `flow` record's `key` must match the end of the flow folder's name. Keep `F` ending in `-verify-flow-page`.
- A state file that exists from an earlier run keeps its records, and `rename` refuses a target folder that exists. Use a new `$G` for each run.
- The script refuses a page file that exists with no state file, so do not copy a page into `$G` by hand.

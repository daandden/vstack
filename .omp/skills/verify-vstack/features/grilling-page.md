# Grilling page

During a grilling session, the agent keeps a Grilling page: an HTML page with each round's questions, their options, the recommended option, and the user's answers. The grilling-page script renders it from a JSONL state file. The user opens the printed path in a browser and moves between questions with the keyboard.

## Sub-features

- `page-append` `append <state.jsonl> <records.jsonl>` checks the records, renders the page next to the state file, and prints its absolute path.
- `page-answer` `answer <state.jsonl> <question-id>=<spec>` marks the picked option as `(your answer)` and shows a note when the spec has one.
- `page-refuse` a bad record exits 1, names the record and the fix, and writes nothing.
- `page-view` the page shows the title, a round heading, each question with its description and options, and `(recommended)` on the recommended option.
- `page-keys` `j` or the down arrow moves to the next question, and `k` or the up arrow moves back. The question link in the top bar gets `aria-current="true"`.

## How to get to it (user POV)

- An agent in `/skill:grilling` runs `bun "$(realpath skill://grilling-page/scripts/grilling-page.ts)" append|answer|render ...` and prints the page path.
- The user opens that path in a browser.

## Driving it with bash and the omp browser

Preconditions:

- The baseline from `README.md`.
- `G="$VERIFY_RUN_DIR/grilling-page"`, made with `mkdir -p "$G"`. The state file and page are proof, so they go there, not in `data/`.

- Records. Write `$G/records.jsonl` with one `page`, one `round`, and two `question` records:

  ```jsonl
  {"type":"page","id":"page","title":"Verify page topic"}
  {"type":"round","id":"s1-r1","session":1,"round":1,"time":"2026-10-11T10:00:00+07:00"}
  {"type":"question","id":"s1-r1-q1","round":"s1-r1","q":1,"title":"Which store keeps the notes?","description":"The choice sets where notes live.\n\n- one store\n- `two` stores","options":[{"label":"A. Local files","does":"Writes notes to disk","gains":["No server"],"costs":["No sync"],"recommended":"it needs no server"},{"label":"B. Hosted store","does":"Writes notes to a server","gains":["Sync"],"costs":["A server to run"]}]}
  {"type":"question","id":"s1-r1-q2","round":"s1-r1","q":2,"title":"Who can read the notes?","description":"The choice sets sharing.","options":[{"label":"A. Only me","does":"Keeps notes private","gains":["Privacy"],"costs":["No sharing"]},{"label":"B. My team","does":"Shares notes with the team","gains":["Sharing"],"costs":["Access rules"],"recommended":"the team needs the notes"}]}
  ```
- Append. With the bash tool's `cwd` set to `CHECKOUT`, run `bun plugin/skills/grilling-page/scripts/grilling-page.ts append "$G/verify.jsonl" "$G/records.jsonl"`. Exit 0, and stdout is `$G/verify.html`.
- Answer. In the same `cwd`, run `bun plugin/skills/grilling-page/scripts/grilling-page.ts answer "$G/verify.jsonl" 's1-r1-q1=B:only with sync'`. Exit 0, and stdout is the same page path.
- Refuse. In the same `cwd`, run `printf '%s\n' '{"type":"question","id":"s1-r1-q3","round":"s1-r1","q":3,"title":"Bad?","description":"d","options":[{"label":"A. First","does":"x","gains":["g"],"costs":["c"]},{"label":"Second","does":"y","gains":["g"],"costs":["c"]}]}' | bun plugin/skills/grilling-page/scripts/grilling-page.ts append "$G/verify.jsonl" - 2>&1 | tee "$G/refuse.txt"; echo "exit=${PIPESTATUS[1]}"`. The output is `question s1-r1-q3: option B: label must start with "B. "`, then `Nothing was written.` and `exit=1`. `grep -c s1-r1-q3 "$G/verify.jsonl"` prints `0`.
- View. In a JS eval cell, open the page: `const tab = await browser.open({ name: "verify-grilling", url: "file://" + G + "/verify.html", app: { tern: false }, viewport: { width: 1280, height: 900 } })`. Save `await tab.ariaSnapshot()` to `$G/page.aria.txt`. It holds `heading "Verify page topic"`, `heading "Q1Which store keeps the notes?"`, `heading "Local files (recommended)"`, `heading "Hosted store (your answer)"`, and the note `only with sync`.
- Screenshot. Before you press any key, capture and convert as `../SKILL.md` Evidence step 5 says, with `out` set to `$G/page.webp`. Read it. It shows both questions, a star on each recommended option, the answered option in yellow, and the `Your note` line.
- Keys. Read the two links with `await tab.attr('role/link[name="Q1"]', "aria-current")` and the same for `Q2`. After load, both are `"false"`. Press `j` with `await tab.press("j")`: `Q1` is `"true"`. Press `j` again: `Q2` is `"true"` and `Q1` is `"false"`. Press `k`: `Q1` is `"true"` again. `ArrowDown` and `ArrowUp` do the same as `j` and `k`. Write each step and its two values to `$G/keys.txt`. Close the tab with `await tab.close()`.

## Gotchas

- Use `app: { tern: false }`. Inside Tern, the default tab is a narrow picture-in-picture pane, and the page renders one letter per line.
- Do not pass `allow_file_access`. The shared Chromium refuses it, and `file://` pages open without it.
- `j` and `k` do nothing while a modifier key is down, and the page must have focus. Press them after the page loads, not in the address bar.
- After a key scrolls the page, a `fullPage` screenshot draws the sticky question bar in the middle of the image. Take the screenshot first.
- A question needs two or more options. A record with one option fails with `options must list two or more options` before the label check runs.
- A state file that exists from an earlier run keeps its records. Use a new `$G` for each run.
- The script refuses a page file that exists with no state file, so do not copy a page into `$G` by hand.

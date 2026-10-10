# A script renders the Grilling page from a JSONL state file

grilling-page ships `scripts/grilling-page.ts`. The agent no longer writes the Grilling page. Each round, it appends JSON records to a `.jsonl` state file beside the page: one line per round, question, answer, or close. A later line with the same `id` replaces an earlier one, so the agent can change a record with one more line instead of rewriting the file. Each command checks every record, renders the whole page from `templates/grilling-page.html`, and prints the page's absolute path. The agent writes only what changes from question to question: the words, and the optional previews and visuals.

## Considered Options

- The agent writes HTML from the template, as before. This was rejected. Pages differed from session to session, parts went missing, and every style change depended on the agent copying the template correctly.
- One JSON file for each page, with a render command. This was rejected. The agent rewrites a file that grows each round, and a rewrite can break an earlier answer.
- The agent writes the HTML for each question, and the script wraps it in the page. This was rejected. The look of each question still depends on the agent.

## Consequences

- Layout, the Q-number row, answer marks, the summary table, and HTML escaping all come from the script, so a style change is one template edit.
- The script refuses input that has a missing part, such as an option with no cost line, an answer for an unknown question, or a script in a preview. The agent fixes the record and runs the command again.
- A preview or visual in HTML keeps its own CSS. The script scopes that CSS to the element's id, so it cannot change the rest of the page.
- A page that the agent wrote by hand before this change has no state file. The script does not continue it. A continued session starts a new page and does not link the old one.
- The page is light only, with the Catppuccin Latte palette and Latte Blue as the primary color. The template is built for a side pane about 880px wide.

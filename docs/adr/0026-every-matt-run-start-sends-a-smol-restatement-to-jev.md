# Every Matt run start sends a smol restatement to jev

> [ADR 0030](0030-a-closing-pick-gets-addon-picks-through-an-extension-tool.md) amends this decision. A skill that the user picks at a grill's closing ask runs inside the grill's Matt run. It gets Addon picks from the `vstack_pick_addons` tool, which sends the closing summary to jev with no smol call.

Every Matt run start gets its Addon picks from a `smol` restatement, also when the start is the first prompt of the session. The extension asks smol with the in-your-own-words instruction and the frame of ADR 0021. On a fresh start, the input is the user's words after `User:` alone. The user wants jev to read the goal in one form on every run start. Later prompts in a run still send the cleaned prompt and call no smol. smol reads the raw words, so a start skips smol only when its raw words and its earlier talk are both empty. One 25-second vstack cap covers smol and jev together on every restated start. At the cap the start gets no picks and the warning `vstack: no Addon picks for this run start (timed out)`. When smol fails with an error on a fresh start (no `smol` model, no key, an error, or an empty reply), jev reads the cleaned words instead, and the warning is `vstack: Addon picks from your words, restatement failed (<reason>)`. A fresh start's words are its whole goal, so they are a sound fallback. If the cleaned words are empty, the fresh start gets no picks and the warning `vstack: no Addon picks for this run start (<reason>)`. A mid-session start still gets no picks on any failure, because its words can miss the goal from the earlier talk.

## Considered Options

- Restate every prompt in a run. A smol call of 7 to 17 seconds before every prompt costs more than it gains, as ADR 0021 found.
- Keep the 4-second deadline on a fresh start. Only 18 of the 125 fresh-start restatements in the corpus finished within 4 seconds, so most fresh starts get no restatement under that deadline.
- Keep omp's 30-second hook cap. When the cap ends the hook, the extension can do nothing more, and omp shows its own error.
- Fall back to the cleaned words at the cap, by stopping smol at 23 seconds for a fresh start or for every start. The user chose one plain cap with no fallback.
- No picks when smol fails on a fresh start, as on a mid-session start. With this option, a smol outage removes all picks from every run start.
- Fall back silently. With this option, a broken smol setup goes unnoticed on fresh starts.
- Store restated copies for a subset of the plain samples, or none. With this option, the check does not measure requests outside the subset in their run-start form.
- Label each restated copy afresh. Picks that smol invented could be labeled as expected, which hides the risk that this change exists to measure.

## Consequences

- This amends ADR 0021, which rejected restating the start of a fresh run and let a restated prompt wait for omp's 30-second cap. It also amends ADR 0018 for fresh starts: the judge reads a restatement of the user's words, not the words themselves.
- The first turn of every Matt run starts later by the smol time. Mid-session smol calls took 7 to 17 seconds (ADR 0021). The 125 fresh-start restatements in the corpus took 1.5 to 14.8 seconds, with a median of 4.8 seconds.
- A fresh bare `/skill:<matt skill>` with no words still makes no request. Prompts that are not restated keep the 4-second deadline.
- `sample-prompts.json` gains one `restated` copy of each of its 125 plain samples, which holds smol's stored restatement of the words alone. Each copy keeps its plain sample's `expected` and `allowed` lists, so the check flags a pick that restatement adds or loses. The copies get fresh baselines from 3 runs. After review, the user allowed two added picks on their copies: `principle-encode-lessons-in-structure` on `fresh-cart-off-by-cent` and `principle-outcome-oriented-execution` on `fresh-h-legacy-config-api`. The two lost picks, `session` on `fresh-session-correct-1` and `principle-encode-lessons-in-structure` on `fresh-g-graphql-codegen`, stay flagged.

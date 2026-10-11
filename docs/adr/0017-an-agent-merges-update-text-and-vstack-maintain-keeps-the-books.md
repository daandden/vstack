# An agent merges Update text, and vstack-maintain keeps the books

The vstack-maintain Addon replaces vstack-update and vstack-edit, and `scripts/vstack-maintain.ts` replaces their scripts. In an Update, implement's agent writes each row's Upstream change into the vstack text. The script does not replay a `git merge-file` result. The script writes only the bookkeeping: the Decision register, Pins, Hold fields, House style rows, adopt copies and taken items from the Pin, the version, and the CHANGELOG. `merge` stays as a read-only preview, so the grill can see where an Upstream change overlaps vstack's own edits before it asks about that row. The Update gates no longer run jev on the sample prompts.

We chose this because the user now confirms decisions in the grill, before implement writes, and not the finished text in a report. The per-row replay existed so that the script could rebuild the text from confirmed row steps. Without a confirmation between a preview and an apply, nothing needs that rebuild. jev ran in the preview phase only, so that the user saw its flags before confirming.

## Considered Options

- Keep `git merge-file` and replay accepted row steps, as before. The user rejected this option: an agent merges instead.
- Delete `merge` entirely. The user rejected this option, because the grill asks better questions when it sees the overlaps.
- Keep jev in the gates, as a failure for flags on changed principles or as a report only. The user removed jev from this Addon.

## Consequences

- House style rows still run mechanically on both Upstream sides in `plan`, before the agent reads the diff. ADR 0008 still holds.
- The merged text can differ between runs, and no script checks that every Upstream hunk landed. implement's code-review pass carries the Addon's review checks and has to catch a missed hunk.
- A Hold means that implement leaves that row's text alone. The script keeps the Hold fields.
- This amends ADR 0002: an Update no longer reruns the stored sample prompts. Where that check runs is open on the redesign map, under the Addon judge catalog.
- This amends ADR 0014: a Hand edit's conflict with newer Upstream text shows up at the next Update, where the agent merges it and not a per-row three-way merge.

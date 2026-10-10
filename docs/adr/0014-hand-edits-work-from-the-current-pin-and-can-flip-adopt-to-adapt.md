# Hand edits work from the current Pin and can flip adopt to adapt

A Hand edit reads Upstream data only at the current Pin. vstack-edit takes an Upstream item at the current Pin and checks a new name against the Upstream items there. It never fetches or compares a newer Upstream version, because that work belongs to the Update. A Hand edit can also change an adopt item. After the user confirms, the row flips to adapt with a new reason. Before this decision, skill-creator and session-lessons refused adopt edits.

## Considered Options

- vstack-edit could show the Upstream diff since the Pin before you draft. The user turned this down. A conflict with newer Upstream text shows up at the next Update, and vstack-update resolves it there with its per-row three-way merge.
- vstack-update could take Upstream items at the current Pin. It was rejected because vstack-update refuses to run when no Pin moved, and a mode for that case adds work to vstack-update for no gain.
- vstack could keep refusing adopt edits. It was rejected because a fix to an adopt item then waited for an Upstream release or an Update.

## Consequences

- A Hand edit to an adapt item can conflict at the next Update with Upstream text that changed after the Pin. Then the user resolves the conflict a second time.
- An adopt item that a Hand edit touches stops tracking Upstream byte for byte (ADR 0001). Later Updates merge it and stop copying it.

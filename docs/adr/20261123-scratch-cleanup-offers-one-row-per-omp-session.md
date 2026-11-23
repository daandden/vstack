---
status: accepted
---

# Scratch cleanup offers one row per omp session

The user chose this in the `vstack-clean-current-behavior-19c221` grill on 2026-11-23. The cleanup popup listed one row per item under `<repo-key>/<kind>/`, so runs that wrote loose files filled it with 2,814 rows, 1,160 of them from one folder. Now a row is one omp session's Scratch in one repo, aged by the newest file among its entries. Scratch writers put each run under `<repo-key>/<kind>/<session-id>/`, and a subagent writes under the session of the run that spawned it. The path script creates and marks every session folder, and only a marked folder counts as session-owned without an archive search. A subagent runs the path script in a mode that takes the Scratch dir and session id it was given and resolves no repo identity. One row builder behind the cleanup script owns row membership, age, and live state. It recomputes them from the Scratch layout, omp session archives, and omp session leases on every listing and again before a delete. It keeps no index.

Older Scratch has no session folder. The row builder links it to the session whose archive names it, using the session with the latest archive activity when several do. Entries no session names form one row per `<repo-key>/<kind>` folder. Closed Flows and to-tickets records keep their own rows and retention. The popup never offers a running session, and it withholds only the rows whose evidence is missing, with the reason. Before deleting anything in a ticked row, the cleanup script rebuilds the row and deletes nothing in it unless its entries, newest file, and live state all still match.

This amends [ADR 20261116-scratch-cleanup-moves-to-a-tern-popup](20261116-scratch-cleanup-moves-to-a-tern-popup.md), whose popup listed and deleted single entries. The Command still only opens the popup. It also amends [ADR 0007](0007-isolated-subagents-write-artifacts-through-the-vstack-root.md), where a subagent never ran the path script. That rule kept an isolated clone from resolving the wrong repo key, and the subagent mode resolves none.

## Considered options

- Group the existing per-entry rows under folder headers in the popup. The list would still load every entry, and the delete could not check what a header stood for.
- A persistent index of entry-to-session links. Listings would open faster, but the index would be a second copy of the links to keep in step with growing archives, and the delete check needs fresh evidence anyway.
- Search archives only, with writers unchanged. Each listing would pay the search forever, and script-written files would stay unlinked.
- Writers that fall back to the old layout when no session id is set. That would bring back the loose Scratch that caused the long list, so the path script refuses instead.
- Subagents that create and mark their session folder by hand. The mark's format would live in skill text, the path script, and the cleanup script, and a forgotten mark would make a run's output look like old Scratch.

## Consequences

- Listing takes about 14 seconds on a machine with 19 GB of session archives while older Scratch remains. New Scratch needs no search.
- Ownership by latest archive activity can move an old entry to another session between listing and delete, and the row check then skips that row.
- Lease detection does not work on Windows, so no session row is offered there.

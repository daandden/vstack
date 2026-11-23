# Scratch cleanup moves to a Tern popup, with a 15-day retention

The user chose this in the `vstack-clean-tern-ui-fb1420` grill on 2026-11-16. Before, `/vstack-clean` listed expired Scratch as one long notification, asked Apply all, Choose items, or Cancel, and reopened a checkbox picker after every toggle.

`/vstack-clean` now opens a cleanup popup from a new `vstack-clean` Tern plugin. The popup floats over the pane that ran the Command, like tern-plugins' Go to picker. It lists only expired entries from every project, with a count of kept ones, and every row starts unticked. Select all ticks every row. Delete first opens a confirmation sheet that names the count and total size and lists each ticked entry. The popup runs the Scratch cleanup script itself and shows its outcome. The Command only checks that the plugin is ready in the calling Tern instance and opens the popup with the age to use. It does not wait for the popup's outcome, and it publishes no Flow Result. Outside Tern, or when the plugin is not ready, the Command deletes nothing and says why. The default age is 15 days for every kind of Scratch, and a closed Flow is offered once it has been closed for 15 days. `/vstack-clean <age>` still overrides the default.

This amends [ADR 0044](0044-structured-flow-data-drives-server-rendered-pages.md) and flow-page's 90-day closed-Flow retention, [ADR 0047](0047-flow-questions-require-a-live-page-and-recoverable-stages.md)'s cleanup Result, and [ADR 0066](0066-to-tickets-keeps-its-publication-record-in-scratch.md)'s 90-day to-tickets offer.

## Considered options

- A native card in the omp pane that keeps the omp pickers. The per-toggle picker loop would stay, and the card would not be a surface of its own.
- A cleanup page served by the Local Flow host. The host would gain its first destructive endpoint, and the page would not be native Tern UI.
- Adding the popup to `vstack-flow`, or renaming that plugin to `vstack`. A plugin named for Flow pages would also delete Scratch, or every user would have to relink.
- Keeping the pickers as the Command's fallback outside Tern. There would be two confirmation flows for the same irreversible delete.
- Keeping the Flow Result. The Command would need a return channel from the plugin and would have to wait for a popup that can close on a focus change.
- A palette command, age presets in the popup, or a 90-day floor for closed Flows or to-tickets records. The user rejected each one.

## Consequences

- Scratch cleanup needs Tern with the `vstack-clean` plugin linked. Without it, the only way to clean up is to run the cleanup script by hand.
- `tern open` cannot report whether the popup opened through its exit code: it exits 0 whether a plugin handled the open or none claimed it and it opened an empty file pane. `tern open --json` lists the file blocks it opened, none for a handled open. So the Command checks the plugin's readiness before the open, accepts only an open that lists no blocks, and reports any other launch result. The plugin shows an error toast when it cannot open the popup.
- A closed Flow's page can be deleted 15 days after the Flow closes, and a blocked to-tickets batch's record 15 days after its newest file.

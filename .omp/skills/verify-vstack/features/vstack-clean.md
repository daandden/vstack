# Scratch cleanup popup

The model-free `/vstack-clean [age]` Command opens the Scratch cleanup popup over the caller's Tern pane. It lists expired session and record rows, kept counts, and withheld reasons. A confirmed delete rechecks each selected row before removing anything in it. The default age is `15d`. Cleanup publishes no Flow Result or Stage.

## Sub-features

- `clean-open` opens a focused `vstack-clean.popup` float over the caller pane, titled `Scratch cleanup, older than <age>`.
- `clean-readiness` requires a `vstack-clean` plugin row with `status: "ready"`, `window: true`, and a block named `popup`.
- `clean-list` lists unticked session, Flow, and to-tickets rows with project, label, age, and size. Session labels use the archive title or short id. The kept count includes live sessions, open Flows, and rows that are too new.
- `clean-tick` Space or a click toggles one row. `a` toggles all offered rows. The dock shows the count and total size.
- `clean-confirm` `d` or Enter opens confirmation with the ticked rows only. Enter or the sheet's Delete button confirms. `d` does nothing in confirmation. Back and Backspace return to the list.
- `clean-recheck` deletion skips a changed row before removing any of its entries.
- `clean-outcome` reports deleted, skipped, and partly deleted rows. A skipped row shows its reason. A partly deleted row shows each failed entry.
- `clean-empty` shows `Scratch is clean` only if there are no offered or withheld rows.
- `clean-error` a failed listing shows `Scratch cleanup failed` and Retry. An interrupted delete shows `Delete did not finish` and List again. The new list starts unticked.
- `clean-close` Esc, Close, or focus leaving the popup closes it, in every state including confirmation.
- `clean-close-during-delete` a delete already started finishes on disk after the popup closes.
- `clean-open-flow` an open Flow older than the age is never listed; it counts as kept.
- `clean-unlinked` with the plugin unlinked, real `/vstack-clean` refuses in omp and opens nothing.
- `clean-replace` another trigger replaces the open popup rather than adding one.
- `clean-reload` plugin reload closes stale popup panes.

## How to get to it (user POV)

- Inside omp in Tern, type `/vstack-clean` or `/vstack-clean <age>`. Ages match `^\d+[hdw]?$`.
- Tick rows with Space, a click on the row, or Select all, then use Delete or `d` to open the confirmation sheet. Confirm with the sheet's Delete or Enter, return with Back or Backspace, or close with Esc.
- After a failed listing, click Retry to list again.
- Close the popup with Esc or Close, focus another pane, or run the Command again to replace it.

## Driving it with tern-verify

Preconditions:

- Use the Tern baseline in `README.md`. Set `V="$SKILL_DIR/scripts/tern-verify"`, `RUN="$VERIFY_RUN_DIR"`, and `VSTACK_CHECKOUT="$CHECKOUT"` in the helper's environment.
- Use a new run with no `data/` directory. Export `TERN_VERIFY_HOME="$RUN/data/home"` before start and retain it for every helper call. Keep native socket paths short.
- Set `FH="$TERN_VERIFY_HOME"`. The fixture guards each cleanup invocation against any other home. Confirm only after the popup and its actual call arguments match this fixture.
- The shell trigger proves the packaged popup. Step `vstack-clean-omp` proves the native Command.
- Use only the helper-owned control socket for input. Before typing, focus the shell and require its id in `ctl state`. After mutations, poll `tern ls` and `ctl state` with an eight-second limit for the expected pane and focus state.
- Run `"$V" clear "$RUN"` before every key, click, or typed line. Cards such as Stencil sign-in and macOS permissions open at any time and take every key; Enter on the sign-in card signs the window in through the user's browser. `clear` closes them with their own close button. If it exits nonzero, send nothing and record the step unavailable. Closing a card can move focus and close the popup: after `clear`, require `ctl state` to name the expected pane before the key.

1. Step `vstack-clean-start`: Run `"$V" start "$RUN"`. With an isolated HOME, start polls for cards for four seconds and closes them. Require `"$V" doctor "$RUN"` to exit 0, including `overlay: none`; Doctor fails while a card is open. The isolated HOME skips the account check. Save the initial shell id as `SHELL_PANE` from `"$V" tern "$RUN" ls`.
2. Step `vstack-clean-profile`: In a supervised background process run `bun "$SKILL_DIR/scripts/tern-clean-fixture.ts" "$RUN"`. Save its stdout to `$RUN/seed.json`. Keep the process alive; it owns the witness lease. The fixture installs a Bun wrapper in the isolated login profile. The wrapper validates `--home`, logs each call to `$RUN/process-argv.txt`, and forwards to the real CLI.
3. Step `vstack-clean-seed`: Read the ready JSON after the holder starts. Set `WITNESS=$(jq -er .ids.WITNESS "$RUN/seed.json")` and `S=$(jq -er .scratch "$RUN/seed.json")`. The fixture uses `path.ts` to mark three expired sessions and the witness, writes their archive headers, and adds open and closed Flows and one expired to-tickets slug. Save `find "$FH/.vstack/tmp" -type f | sort` to `$RUN/before.files`.
4. Step `vstack-clean-readiness`: Run `"$V" tern "$RUN" plugin list --json` and save the output to `$RUN/pane-plugin-list.json`. Require the `vstack-clean` plugin to have `status: "ready"`, `window: true`, and a `popup` block.
5. Step `vstack-clean-open`: Run `"$V" tern "$RUN" open --json "$FH/.vstack/clean-popup/$SHELL_PANE/15d/$WITNESS"`. Save stdout, stderr, and the exit code. Require exit `0` and a JSON `blocks` array equal to `[]`. Separately, `"$V" tern "$RUN" ls --json` must show a focused `vstack-clean.popup` with `pip.owner` equal to `SHELL_PANE`, and args equal to the fixture home, `15d`, and the witness. Save its id as `POPUP`.
6. Step `vstack-clean-list`: Read `ctl a11y` and `ctl tree '.tn-pane.on .sf-stat-value'`. Require Expired 5, Kept 2, and Selected 0. The session titles are `Done with diagnostic checks`, `Scratch changed after listing`, and `Partly removable run`. The first and third combine two kinds and show 15 B each. The list includes `closed-native-fixture` and `native-fixture`, and excludes the open Flow and `Live verification witness`. Check `process-argv.txt` for both home flags and the witness. If anything differs, stop before deletion.
7. Step `vstack-clean-tick`: Press Space once and require one tick. Press Space to clear it. Press `a` and require all five ticks and `Clear all`. Press `a` to clear, then again to select all.
8. Step `vstack-clean-confirm-back`: Press `d`. Require `Delete 5 rows` in the sheet with the total bytes from the list. Require the five ticked labels and `This cannot be undone.` Press `d` again, then Backspace. The sheet returns to the list with the five ticks intact. Compare `find "$FH/.vstack/tmp" -type f | sort` with `before.files`.
9. Step `vstack-clean-delete-recheck`: Set `SKIPPED=$(jq -er .ids.SKIPPED "$RUN/seed.json")` and `PARTIAL=$(jq -er .ids.PARTIAL "$RUN/seed.json")`. Write `$S/verify/$SKIPPED/late.txt`. Write `remove` to `$RUN/data/fault` and the absolute path `$S/verify/$PARTIAL/report.txt` to `$RUN/data/fault-path`. Press `d`, then Enter on the focused popup only. The named fault comes from the filesystem boundary, not from cleanup code.
10. Step `vstack-clean-outcome`: Require Deleted 3, Skipped 1, and Partly deleted 1. Require `Newer than the TTL` for the changed session and `Injected removal failure` beside the failed `verify` entry. Save a filesystem listing and compare it to the outcome. The changed session, open Flow, witness, and failed entry remain. The partly deleted session's `explain` entry, the finished session, the closed Flow, and the to-tickets record are gone.
11. Step `vstack-clean-escape`: Press Escape. `POPUP` disappears from `tern ls` and the shell remains focused.
12. Step `vstack-clean-empty`: Before reopening, set `lease` in `$RUN/data/fault` and empty `fault-path`. Reopen the 15d route from step 5. The just-written session is too new. Require `2 rows withheld`, the injected lease failure, and `No rows offered.` Require no `Scratch is clean` text.
13. Step `vstack-clean-replace`: Run `"$V" tern "$RUN" open --json "$FH/.vstack/clean-popup/$SHELL_PANE/30d/$WITNESS"`. Require the same handled response as in step 5. In `tern ls --json`, the previous id disappears and exactly one new popup is focused over the same shell with the new age.
14. Step `vstack-clean-focus-out`: Focus the shell using `"$V" tern "$RUN" focus "$SHELL_PANE"`. The popup disappears. Reopen it with `15d` and click its Close button. Require the same disappearance.
15. Step `vstack-clean-reload`: Open the 15d route again and retain the popup id. Run `"$V" tern "$RUN" plugin reload`. Require the stale pane to disappear and the plugin's readiness shape to remain. Reopen once and close with Escape.
16. Step `vstack-clean-omp`: Use a fresh isolated Tern run with a persisted omp session. Add the absolute Bun, Tern, and omp executable dirs to that run's isolated `.zprofile`. Type `env HOME='$TERN_VERIFY_HOME' '$OMP' --no-skills --no-rules --no-context-files --no-extensions -e '$CHECKOUT/plugin/extensions/vstack.ts'` with the actual paths expanded. If provider setup opens, send `ctrl+c` to the omp pane. Wait for the Message composer. Use `ctl type '/vstack-clean'` and require `ctl tree | jq -e 'any(.. | objects; .class? == "sf-ed-text" and .text? == "/vstack-clean")'` before Enter. Require the popup to open over that pane with args that name the isolated home, `15d`, and the persisted session id. Require no launch error. This step lists only.
17. Step `vstack-clean-unlinked`: Close the popup and unlink the plugin with `"$V" tern "$RUN" plugin unlink vstack-clean`. Require the plugin list to omit it. Repeat the real Command draft and Enter. The omp pane reports that the plugin is not ready and `Nothing deleted.` No new popup or file pane opens. Relink the checkout plugin before stopping.
18. Step `vstack-clean-close-during-delete`: In a fresh fixture, put many old files in one `to-tickets/big-run/` record. Open the popup, select only that row, and confirm. Close during the deleting state with Escape. Require no popup, then show that cleanup finishes and removes `big-run`. Do not claim closure during delete if the process had already finished.
19. Step `vstack-clean-error`: Use a fresh isolated home whose `.vstack/tmp` is a regular file. Open its trigger with the witness argument. Require `Scratch cleanup failed`, `is not a directory`, and Retry. Remove the owned fixture file, click Retry, and require `Scratch is clean` with zero kept.
20. Step `vstack-clean-interrupted`: On the fixture after step 12, seed two to-tickets slugs, `interrupt-first` and `interrupt-second`, with files older than the other rows. Make the first older than the second. Set the `interrupt` fault at the second slug's `approved.json` and reopen the popup. After confirming both rows, require the first to be gone and the second to remain. Require `Delete did not finish`. Remove `fault` and click **List again**. Require the second row to be unticked, with Delete 0 disabled. Check `process-argv.txt` for a new listing and no replay.
21. Step `vstack-clean-real-list`: If checking the maintainer's real Scratch, run the cleanup CLI with `--home "$HOME"` and no `--delete`. Retain counts and reasons, not archive titles or snapshots. Never confirm a delete against that home.

## Proof

Step `vstack-clean-proof`: Preserve each action's command, exit code where applicable, before-and-after `tern ls`, `ctl state`, `ctl a11y`, `ctl tree`, and filesystem listings outside `data/`. Use `"$V" shot "$RUN" <step-name>` for full-resolution lossless WebP and layout evidence. Keep the shell's `pane-plugin-list.json`, `open.stdout`, `open.stderr`, and `open.exit`, plus the fake home's fixture timestamps and before-and-after inventories. Record the Command seam-test evidence separately from this native trigger proof. An automated confirmation is test input, not the user's consent to delete real Scratch.

## Cleanup

Step `vstack-clean-cleanup`: Stop the fixture process so that it stops its lease holder. Then run `"$V" stop "$RUN"` to close the owned window and daemon and remove `data/`. Preserve the proof and `notes.md`.

## Gotchas

- The trigger is a claimed path, not a file to create. Using the real home in that path would target real Scratch.
- A successful `tern open --json` with no file blocks proves Tern handled the trigger. Use `tern ls --json` to verify the popup's owner pane and arguments.
- The popup's cleanup process uses a login shell. A PATH available only in the driver's shell does not prove Bun is available in the isolated HOME.
- Moving focus to the shell closes the popup. Use the driver's file tools for the late-file fixture and the helper's direct `tern open` for replacement.
- Esc closes the popup in every state, confirmation included. Backspace or the Back button returns from confirmation to the list.
- A delete already started runs to completion after the popup closes: the cleanup process does not stop with the block.
- A command typed as `omp` in the isolated shell can become a Tern-managed agent pane that runs with the user's real HOME. Without `env HOME=...` and the marker guard, its popup lists and deletes the user's real Scratch. This happened once in development and deleted a real closed Flow.

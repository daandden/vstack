# Scratch cleanup popup

The model-free `/vstack-clean [age]` Command opens a Scratch cleanup popup over the caller's Tern pane. It lists expired entries with every row unticked and shows how many entries cleanup kept. The user selects rows and confirms deletion. Cleanup re-checks each selected entry before deleting it, then the popup reports deleted and skipped paths. The default age is `15d`. Cleanup publishes no Flow Result or Stage.

## Sub-features

- `clean-open` opens a focused `vstack-clean.popup` float over the caller pane, titled `Scratch cleanup, older than <age>`.
- `clean-readiness` requires a `vstack-clean` plugin row with `status: "ready"`, `window: true`, and a block named `popup`.
- `clean-list` shows stat tiles for Expired (count and size on disk), Kept, Oldest, and Selected, then a table of project, kind badge, entry, age with a status dot, a size bar, and size. Rows sort oldest first, then largest. Every row starts with an empty checkbox.
- `clean-tick` Space toggles the selected row's checkbox, and clicking a row toggles that row. `a` selects all rows, or clears them when all are ticked; the button then reads `Clear all`.
- `clean-confirm` `d` or Enter opens a modal sheet over the list that lists only the ticked entries, titled with their count and size, with `This cannot be undone.` beside the title. Only Enter or the sheet's Delete button confirms; another `d` does nothing. The sheet's Back button or Backspace returns to the list without deleting.
- `clean-recheck` deletion re-checks the selected paths and skips an entry that became newer than the TTL after listing.
- `clean-outcome` shows Deleted, Freed, and Skipped tiles, the line `Deleted <n> entries, freed <size>. Skipped <n>.`, and one row per deleted or skipped entry with its project and kind. A skipped row shows its reason.
- `clean-empty` shows a `Scratch is clean` card with `No expired Scratch entries. Nothing to delete.` and the kept count when no entry expires.
- `clean-error` a failed listing shows a `Scratch cleanup failed` card with the script's stderr and a Retry button that lists again.
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
- Set `FH="$RUN/data/fakehome"`. Every trigger below names this fake home, not the user's home or the evidence directory. The user's real Scratch remains untouched.
- Steps 1 to 15 drive the plugin's trigger route from a shell. Step 16 drives the real `/vstack-clean` Command in a real omp session in the same isolated window. Use `scratch-dir.md` for RPC refusal drives.
- Use only the helper-owned control socket for input. Before typing, focus the shell and require its id in `ctl state`. After mutations, poll `tern ls` and `ctl state` with an eight-second limit for the expected pane and focus state.
- Run `"$V" clear "$RUN"` before every key, click, or typed line. Cards such as Stencil sign-in and macOS permissions open at any time and take every key; Enter on the sign-in card signs the window in through the user's browser. `clear` closes them with their own close button. If it exits nonzero, send nothing and record the step unavailable. Closing a card can move focus and close the popup: after `clear`, require `ctl state` to name the expected pane before the key.

1. Step `vstack-clean-start`: Run `"$V" start "$RUN"`. With an isolated HOME, start polls for cards for four seconds and closes them. Require `"$V" doctor "$RUN"` to exit 0, including `overlay: none`; Doctor fails while a card is open. The isolated HOME skips the account check. Save the initial shell id as `SHELL_PANE` from `"$V" tern "$RUN" ls`.
2. Step `vstack-clean-profile`: Resolve the real Bun and Tern executables in the driver's environment. Write the isolated login profile so the popup's cleanup process can find Bun:

   ```sh
   BUN_BIN=$(command -v bun)
   TERN_BIN=$(command -v tern)
   printf 'export PATH="%s:%s:/usr/bin:/bin:/usr/sbin:/sbin"\n' \
   	"$(dirname "$BUN_BIN")" "$(dirname "$TERN_BIN")" > "$TERN_VERIFY_HOME/.zprofile"
   ```

   Keep this profile inside the isolated HOME. If the initial shell cannot resolve `tern`, use the resolved absolute `TERN_BIN` in the typed commands below.
3. Step `vstack-clean-seed`: Seed two expired runs and one fresh entry in the fake home. On macOS, compute the timestamp 20 days before the drive:

   ```sh
   OLD="$FH/.vstack/tmp/proj-aaaaaa/verify"
   FRESH="$FH/.vstack/tmp/proj-aaaaaa/explain"
   mkdir -p "$OLD/old-run-1" "$OLD/old-run-2" "$FRESH"
   printf 'one\n' > "$OLD/old-run-1/notes.txt"
   printf 'two\n' > "$OLD/old-run-2/notes.txt"
   printf 'fresh\n' > "$FRESH/fresh.html"
   STAMP=$(date -v-20d +%Y%m%d%H%M)
   touch -t "$STAMP" "$OLD/old-run-1/notes.txt" "$OLD/old-run-2/notes.txt"
   touch -t "$STAMP" "$OLD/old-run-1" "$OLD/old-run-2"
   find "$FH/.vstack/tmp" -type f | sort > "$RUN/before.txt"
   ```

   Both old entries contain 4 bytes. The fresh entry remains too young to delete. Then add an open Flow in the fake home, from a throwaway git repo so it gets its own repo key, and age every file in it:

   ```sh
   git init -q "$RUN/data/flow-repo"
   (cd "$RUN/data/flow-repo" && VSTACK_FLOW_HOST=off bun "$CHECKOUT/plugin/skills/flow-page/scripts/flow-page.ts" open --skill explain --title "Open fixture" --home "$FH" --session verify --agent main)
   find "$FH/.vstack/tmp" -path '*/flow/*' -exec touch -h -t "$STAMP" {} +
   ```
4. Step `vstack-clean-readiness`: With the shell focused, run `"$V" type "$RUN" "tern plugin list --json > '$RUN/pane-plugin-list.json'"`. Read the resulting file and require the `vstack-clean` row's exact readiness shape: `status: "ready"`, `window: true`, and a `popup` block. Retain the complete JSON, not only the row's name or status. The Command's missing-plugin and malformed-readiness refusals belong to the seam tests.
5. Step `vstack-clean-open`: Type the trigger in the shell, preserving its own `TERN_PANE`. Use `sh -c` to capture the exit code consistently even when the pane uses fish:

   ```sh
   "$V" type "$RUN" "sh -c 'tern open --json \"$FH/.vstack/clean-popup/\$TERN_PANE/15d\" > \"$RUN/open.stdout\" 2> \"$RUN/open.stderr\"; echo \$? > \"$RUN/open.exit\"'"
   ```

   Require exit `0`, empty stderr, and stdout JSON whose `blocks` is `[]`. This is Tern's handled-route response; an unclaimed open also exits 0 but lists the empty file block it opened. Require `tern ls` to show one focused `vstack-clean.popup`, `pip br over <SHELL_PANE>`, titled `Scratch cleanup, older than 15d`. Save its id as `POPUP`.
6. Step `vstack-clean-list`: Save `"$V" ctl "$RUN" a11y`, `ctl tree`, and a shot. `ctl tree '.tn-pane.on .sf-stat-value'` reads `2`, `2`, `20 d`, `0` in order: Expired, Kept, Oldest, and Selected. Both old runs appear with project `proj-aaaaaa`, kind `verify`, age near 20 days, and size `4 B`. `ctl tree '.tn-pane.on .sf-tbl-ic[data-tone="accent"]'` counts 0 ticked checkboxes. The fresh entry and the open Flow are absent from the table. The dock says `Nothing ticked`; Delete 0 is disabled.
7. Step `vstack-clean-tick`: Run `"$V" ctl "$RUN" key Space`. Only the selected row's checkbox ticks, so the accent checkbox count is 1, and the dock says `1 of 2 selected · 4 B`, allowing layout whitespace. Press Space again to clear it. Run `"$V" ctl "$RUN" key a`: both rows tick, the dock says `2 of 2 selected · 8 B`, and the button reads `Clear all`. Press `a` again to clear both, then once more to select both. Capture the checkbox count, the Selected tile, and the dock after each change.
8. Step `vstack-clean-confirm-back`: Run `"$V" ctl "$RUN" key d`. Read `ctl a11y` for the Delete, Back, and Close buttons. `ctl tree '.tn-pane.on .sf-ov-title'` reads `Delete 2 entries, 8 B?` and `ctl tree '.tn-pane.on .sf-ov-meta'` reads `This cannot be undone.` Press `d` again: the sheet stays open and every file is unchanged. Press `"$V" ctl "$RUN" key Backspace` to take Back. The sheet closes, the list returns with both rows still ticked, and all files are unchanged. Press Enter from the list to ask again, then click the Back button: take the first node of `ctl tree '.tn-pane.on button'` whose text starts with `Back` (the text carries its key hint, `Back⌫`) and click the centre of its rect with `ctl click X Y`. Require `ok: true` from the click and the list's `Clear all` button in `ctl a11y` before sending any other key; otherwise stop and record the step failed. The same list and unchanged files return. Press `d` once more and then Escape: the popup closes and every file is unchanged. Reopen the `15d` trigger and tick both rows again before step 9. Save the button evidence and a file listing after each step.
9. Step `vstack-clean-delete-recheck`: After listing, write `printf 'late\n' > "$OLD/old-run-1/late.txt"` from the driver. Leave the popup's original selection intact. Press `d` to ask again, then `"$V" ctl "$RUN" key Enter` to confirm. Require a completed outcome rather than only the confirmation or deleting state. `old-run-2` is gone, `old-run-1` and its late file remain, and the fresh file remains. Save `find "$FH/.vstack/tmp" -type f | sort` as `$RUN/after-delete.txt`.
10. Step `vstack-clean-outcome`: Read `ctl a11y`, `ctl tree`, and a shot. `ctl tree '.tn-pane.on .sf-stat-value'` reads `1`, `4 B`, `1`: Deleted, Freed, and Skipped. The outcome line reads `Deleted 1 entry, freed 4 B. Skipped 1.` One row shows `old-run-2` with `proj-aaaaaa / verify` and a check mark. Another shows `old-run-1` with `proj-aaaaaa / verify`, a warning mark, and `newer than the TTL`. Require the filesystem result from the previous step to match these rows.
11. Step `vstack-clean-escape`: Run `"$V" ctl "$RUN" key Escape`. `POPUP` disappears from `tern ls`, and the shell remains. Reopen the same fake-home `15d` trigger from that shell. The remaining entries are fresh or an open Flow, so the new popup has no expired rows.
12. Step `vstack-clean-empty`: Require a `Scratch is clean` card with `No expired Scratch entries. Nothing to delete.` and `3 entries kept, none older than 15d`, and a Close button in `ctl a11y`. Capture a shot. Keep this popup open for the replacement check.
13. Step `vstack-clean-replace`: Without focusing the shell first, run `"$V" tern "$RUN" open --json "$FH/.vstack/clean-popup/$SHELL_PANE/30d"`. Preserve its stdout, stderr, and exit code. The prior popup id disappears and exactly one new popup is focused over the same shell, titled `Scratch cleanup, older than 30d`, with the empty card reading `none older than 30d`. The handled-route exit and output follow the same rule as the first open.
14. Step `vstack-clean-focus-out`: Run `"$V" tern "$RUN" focus "$SHELL_PANE"`. Require the replacement popup to disappear and focus to settle on the shell. Reopen the `15d` trigger, read the Close button from `ctl a11y`, and click its actual selector from `ctl tree`. Require that popup to disappear too.
15. Step `vstack-clean-reload`: Open the `15d` trigger once more and retain the popup id. Run `"$V" tern "$RUN" plugin reload`, then `"$V" tern "$RUN" plugin list --json`. Require `vstack-clean` to be ready with the same window and popup block shape. The stale popup id disappears and no popup remains. Reopen once after reload to prove the route still works, then close it with Esc.
16. Step `vstack-clean-omp`: Real `/vstack-clean` in real omp. Use a fresh run, because omp needs its own pane.
    1. Run steps 1 and 2: start, dismiss the sign-in card, write the profile, and pass Doctor.
    2. Find omp in the driver with `OMP=$(command -v omp)`. Add its directory to the profile PATH.
    3. Seed exactly one expired marker entry in the isolated HOME, never in the user's home. Set `M="$TERN_VERIFY_HOME/.vstack/tmp/verify-marker-000000/verify/vstack-clean-verify-marker"`. Write one file into `M`. Age the file and `M` to 20 days with `touch -t`.
    4. Type in the shell: `env HOME=$TERN_VERIFY_HOME $OMP --no-skills --no-rules --no-context-files --no-extensions -e $CHECKOUT/plugin/extensions/vstack.ts --no-session`. Wait for the agent pane.
    5. A fresh HOME opens omp's setup. Leave it with `"$V" tern "$RUN" send <pane> keys ctrl+c`.
    6. Run `"$V" clear "$RUN"`; never press Enter on a card.
    7. Require `ctl state` to name the omp pane as focused. Run `"$V" ctl "$RUN" type '/vstack-clean'`. Before Enter, require the native draft to hold it: `"$V" ctl "$RUN" tree | jq -e 'any(.. | objects; .class? == "sf-ed-text" and .text? == "/vstack-clean")'`, and `ctl a11y` reads `omp Draft: /vstack-clean`. Then run `"$V" ctl "$RUN" key Enter`. Send Enter again only if the completion menu took the first. `tern send <pane> text` does not reach omp 19's native draft, and its Enter opens provider setup instead.
    8. Require a popup `pip br over <omp pane>`, focused. Require no error notification in the omp pane.
    9. Guard before any delete key. Read the popup's tiles from `ctl tree '.tn-pane.on .sf-stat-value'` and its text from `ctl tree '.tn-pane.on:not(.off)'`. Require Expired `1`, Kept `0`, and `vstack-clean-verify-marker`. Any other listing means the popup reads another home. Then press Escape, send no other key, and record a FAIL with the listing.
    10. Press Space, d, and Enter in that order. Before each key, require `ctl state` to name the popup as focused. If focus moved, stop sending keys and record it, because a key sent to the omp pane becomes a model prompt.
    11. Require `Deleted 1 entry, freed 1 B.` Require the marker's key dir to be gone from `$TERN_VERIFY_HOME/.vstack/tmp`.
17. Step `vstack-clean-unlinked`: In the same omp run, close the popup. Run `"$V" tern "$RUN" plugin unlink vstack-clean` and require `plugin list` without it. Run `"$V" clear "$RUN"`, then enter `/vstack-clean` in the omp pane again with sub-step 7's focus check, `ctl type`, draft check, and `ctl key Enter`. Require no new pane in `tern ls`, no empty file pane, and an error notification in the omp pane that names the vstack-clean Tern plugin as not ready and ends `Nothing deleted.` Relink with `"$V" tern "$RUN" plugin link "$CHECKOUT/plugin/tern/vstack-clean"` before stopping.
18. Step `vstack-clean-close-during-delete`: In a fresh run (steps 1 and 2), seed one entry with many small files so deletion takes seconds: `BIG="$FH/.vstack/tmp/proj-bbbbbb/verify/big-run"`, 40 directories of 1500 empty files each, every path aged 20 days with `touch -h -t`. Open the `15d` trigger and wait until `ctl a11y` shows `Select all`. Press Space and `d`, require the Delete, Back, and Close buttons, then press Enter and Escape 0.1 seconds apart. Require no popup in `tern ls` and some files still under `BIG` right after the close. Within 30 seconds, require `BIG` to be gone.
19. Step `vstack-clean-error`: In any run past step 2, make a fake home whose Scratch root is a file: `BAD="$RUN/data/badhome"`, `mkdir -p "$BAD/.vstack"`, `printf x > "$BAD/.vstack/tmp"`. Open `"$BAD/.vstack/clean-popup/$SHELL_PANE/15d"` with `"$V" tern "$RUN" open`. Require a `Scratch cleanup failed` card whose text includes `is not a directory`, and a Retry button in `ctl a11y`. Run `rm "$BAD/.vstack/tmp"` from the driver. Take the first node of `ctl tree '.tn-pane.on button'` whose text starts with `Retry` and click the centre of its rect with `ctl click X Y`. Require the `Scratch is clean` card with `0 entries kept`. Capture a shot of each state, then close the popup with Esc.

## Proof

Step `vstack-clean-proof`: Preserve each action's command, exit code where applicable, before-and-after `tern ls`, `ctl state`, `ctl a11y`, `ctl tree`, and filesystem listings outside `data/`. Use `"$V" shot "$RUN" <step-name>` for full-resolution lossless WebP and layout evidence. Keep the shell's `pane-plugin-list.json`, `open.stdout`, `open.stderr`, and `open.exit`, plus the fake home's fixture timestamps and before-and-after inventories. Record the Command seam-test evidence separately from this native trigger proof. An automated confirmation is test input, not the user's consent to delete real Scratch.

## Cleanup

Step `vstack-clean-cleanup`: After success or failure, run `"$V" stop "$RUN"` to close only the owned window and daemon and remove the isolated HOME and fake-home fixtures under `data/`. Preserve proof and `notes.md` outside `data/`. Keep the user's working Tern window and real Scratch untouched.

## Gotchas

- The trigger is a claimed path, not a file to create. Using the real home in that path would target real Scratch.
- Only exit 0 with `--json` stdout listing no `blocks` counts as an accepted `tern open`. A listed block, another error, or another exit code is not success.
- The popup's cleanup process uses a login shell. A PATH available only in the driver's shell does not prove Bun is available in the isolated HOME.
- Moving focus to the shell closes the popup. Use the driver's file tools for the late-file fixture and the helper's direct `tern open` for replacement.
- Esc closes the popup in every state, confirmation included. Backspace or the Back button returns from confirmation to the list.
- A delete already started runs to completion after the popup closes: the cleanup process does not stop with the block.
- A command typed as `omp` in the isolated shell can become a Tern-managed agent pane that runs with the user's real HOME. Without `env HOME=...` and the marker guard, its popup lists and deletes the user's real Scratch. This happened once in development and deleted a real closed Flow.

# vstack Flow links

A Cmd-click on a Flow link, a link to a vstack Flow page on this machine, opens the page in Tern beside the pane that holds the link, while other web links keep following Tern's `link_target` setting. A second click on a link of the same Flow in the same tab goes to its question in the page that is already open. Cmd+⌥-click on a Flow link is Tern's own.

## Sub-features

- `flow-open` opens a Flow link in a browser pane beside the opener pane, focused.
- `flow-reuse` goes to the clicked question in the tab's open page of the same Flow and focuses it, without a new pane.
- `flow-other` opens a new page beside the opener pane when the tab shows only another Flow, or the same Flow only in another tab.
- `flow-float` opens a Flow link clicked in a floating pane beside the tiled pane under that float.
- `flow-alt` leaves Cmd+⌥-click on a Flow link to Tern, which opens a new browser pane and leaves the open page alone.
- `flow-not-claimed` leaves every other web link to Tern's `link_target`.

## How to get to it (user POV)

- Cmd-click the link in omp's "Flow page" panel above an open picker.
- Cmd-click a Flow link that a program printed in a pane, such as a skill's receipt.
- Cmd+⌥-click either of them.

## Driving it with tern-verify

Preconditions:

- Set `V="$SKILL_DIR/scripts/tern-verify"` and `RUN="$VERIFY_RUN_DIR"`.
- Set `VSTACK_CHECKOUT="$CHECKOUT"` in the helper's environment when driving another checkout.
- The isolated Tern baseline from `README.md`, with focus on the shell pane. The copied `settings.json` keeps `link_click: Command` and `link_target: Browser`; check both in `RUN/data/config/settings.json` before driving, because `flow-alt` and `flow-not-claimed` depend on them.
- Create a disposable Flow with `bun "$CHECKOUT/plugin/skills/flow-page/scripts/flow-page.ts" open --skill grill-with-docs --title "Verify Tern links" --home "$RUN/data/flow-home" --session <own-session> --agent <own-agent>`. Choose a free `VSTACK_FLOW_PORT` first. `FLOW` is the receipt's `live.url`, ending in `/`. `OTHER` changes the last hex character before that slash, so it names a different Flow to the route.
- Run `"$V" lens "$RUN"`. Print each link with `"$V" type "$RUN" 'echo PROBE_LINK <url>'`. Click it with `"$V" ctl "$RUN" click "\".tn-pane.on:not(.off) .sf-link[title^='<url>  ']\"" cmd`. The two spaces after the URL separate it from Tern's tooltip hint, so a short URL cannot match a longer link. Pass separate trailing `cmd` and `alt` tokens for Cmd+Option-click.
- To focus a shell, run `"$V" tern "$RUN" focus <id>`, then poll `ctl state` until `.focused.id` names it. CLI-created tabs and splits do not take focus. `type` into a browser pane fails with `no running shell has focus`.
- When the shell shares its tab with another tiled pane, zoom it with `"$V" ctl "$RUN" click '".tn-pane.on:not(.off) .tn-zoomb"'` so the URL fits on one line. For a float, first poll `"$V" ctl "$RUN" tree '.tn-pane.on:not(.off)'` until its class includes `pip-focus` and excludes `pip-moving`. Click that zoom button, then poll until the class includes `pip-expanded` and excludes `pip-moving`. Verify `.focused.id` still names the float before typing. Clicking the Flow link brings the tiled layout back.
- After each click, poll `"$V" tern "$RUN" browser '{"op":"blocks"}'` with an eight-second limit for the expected URL, pane count, and `driven: false`. Read `"$V" tern "$RUN" ls` for tab membership and `"$V" ctl "$RUN" state` for focus. A successful click response alone proves no resulting state.

- `flow-open`. Print and Cmd-click `<FLOW>#question-1`. A new browser pane opens in the same tab, tiled to the right of the shell (no `pip` in `tern ls`), with focus, and `blocks` lists it with the clicked URL and `driven: false`.
- `flow-reuse`. Focus the shell, print and Cmd-click `<FLOW>#question-2`. `tern ls` lists no new pane. The same browser pane now has the `#question-2` URL in `blocks`, and it has focus.
- `flow-other`. Focus the shell, print and Cmd-click `<OTHER>#question-1`. A second browser pane opens beside the shell; the first keeps its URL. Then run `"$V" tern "$RUN" new tab`, which prints the new shell's id, focus that shell, print `<FLOW>#question-3` there and Cmd-click it. A browser pane opens in the new tab; the page of the first tab keeps `#question-2`.
- `flow-float`. In a fresh tab (focus its shell), run `"$V" tern "$RUN" split @focused right` for a second shell, then `"$V" tern "$RUN" pip <its id>` to float it and focus it. In the float, print and Cmd-click `<FLOW>#question-1`. The page opens tiled beside the tab's tiled shell, not as a float.
- `flow-alt`. In the tab of `flow-open`, focus the shell, print and Cmd+⌥-click `<FLOW>#question-4`. Tern's own handling opens a new browser pane (link_target `Browser`, so ⌥ picks Tern), and the existing page keeps `#question-2`.
- `flow-not-claimed`. Print and Cmd-click each of `http://127.0.0.1:9/f/not-a-flow/`, `<FLOW>extra` with more path after the capability, `<FLOW>` with its host replaced by `127.0.0.1:9@outside.invalid`, and the ordinary web URL `http://127.0.0.1:<port>/`. After each click no browser pane opens in Tern and existing page URLs stay unchanged. Tern sends these links to the default browser.
- Reload. Run `"$V" tern "$RUN" plugin reload` and `plugin list`; `vstack-flow` is `ready`. Repeat `flow-open` once in a fresh tab.
- Proof. Save each step's `tern ls`, `blocks` and `state` output before and after the click, and a shot.
- Cleanup. Stop the owned Flow host with `bun "$CHECKOUT/plugin/skills/flow-page/scripts/flow-page.ts" host stop --home "$RUN/data/flow-home"`. Then run `"$V" stop "$RUN"`. Preserve the proof files and notes.

## Gotchas

- A selector-centre click on a link that wraps to two lines can land between the lines and click nothing. The full-width shell of a fresh tab fits a Flow URL on one line; a split or floating shell needs the zoom step of the preconditions.
- `flow-not-claimed` and a red run before the plugin exists hand the link to the default browser, which opens a tab there. Name that in `notes.md`.
- A Cmd+⌥ chord written as one `cmd+alt` token is read as part of the selector and clicks nothing.
- Control shots show a browser pane's cover, not the page's pixels. Read the page's URL from `blocks`, not from a shot.
- The link lens proves clicked-link routing for native links. The native omp panel link and raw terminal OSC 8 links remain separate entry points, untested by this recipe.
- A page that the plugin opens shows Tern's `agent` website data chip, while Tern's own link opens show `Share`. Tern picks the store for pages opened through browser automation; the plugin cannot choose it.

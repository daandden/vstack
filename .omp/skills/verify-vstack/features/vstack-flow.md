# vstack Flow links and tab following

A Cmd-click on a Flow link, a link to a vstack Flow page on this machine, opens the page in Tern beside the pane that holds the link, while other web links keep following Tern's `link_target` setting. A second click on a link of the same Flow in the same tab goes to its question in the page that is already open. Cmd+⌥-click on a Flow link is Tern's own.

Each tab's existing Flow page also follows the most recently focused omp session in that tab. A session switch targets its bound Stage, and a newly opened picker targets its first question. Page and non-omp focus keep the selected session. Following never creates a page or moves another tab's page.

## Sub-features

- `flow-open` opens a Flow link in a browser pane beside the opener pane, focused.
- `flow-reuse` goes to the clicked question in the tab's open page of the same Flow and focuses it, without a new pane.
- `flow-other` opens a new page beside the opener pane when the tab shows only another Flow, or the same Flow only in another tab.
- `flow-float` opens a Flow link clicked in a floating pane beside the tiled pane under that float.
- `flow-alt` leaves Cmd+⌥-click on a Flow link to Tern, which opens a new browser pane and leaves the open page alone.
- `flow-not-claimed` leaves every other web link to Tern's `link_target`.
- `flow-follow-focus` switches between two omp sessions' bound Stages within one tab.
- `flow-follow-picker` follows a new picker token, including when the new picker asks the same question again.
- `flow-follow-hold` preserves a draft, selection, and scroll while typing, then applies the latest move on blur.
- `flow-follow-guards` preserves reading position on repeated focus, picker refresh, closure, or expiry; unbound sessions and sessions of another Flow move nothing.
- `flow-follow-tabs` keeps the same Flow's page in another tab unchanged and never opens a page automatically.

## How to get to it (user POV)

- Cmd-click the link in omp's "Flow page" panel above an open picker.
- Cmd-click a Flow link that a program printed in a pane, such as a skill's receipt.
- Cmd+⌥-click either of them.
- Focus an omp pane, then the other omp pane in the same tab.
- Open a picker in the selected session while reading its Flow page.

## Driving it with tern-verify

Preconditions:

- Set `V="$SKILL_DIR/scripts/tern-verify"` and `RUN="$VERIFY_RUN_DIR"`.
- Set `VSTACK_CHECKOUT="$CHECKOUT"` in the helper's environment when driving another checkout.
- The isolated Tern baseline from `README.md`, with focus on the shell pane. The copied `settings.json` keeps `link_click: Command` and `link_target: Browser`; check both in `RUN/data/config/settings.json` before driving, because `flow-alt` and `flow-not-claimed` depend on them.
- Create a disposable Flow with `bun "$CHECKOUT/plugin/skills/flow-page/scripts/flow-page.ts" open --skill grill-with-docs --title "Verify Tern links" --home "$RUN/data/flow-home" --session <own-session> --agent <own-agent>`. Choose a free `VSTACK_FLOW_PORT` first. `FLOW` is the receipt's `live.url`, ending in `/`. `OTHER` changes the last hex character before that slash, so it names a different Flow to the route.
- Run `"$V" lens "$RUN"`. Print each link with `"$V" type "$RUN" 'echo PROBE_LINK <url>'`. Click it with `"$V" ctl "$RUN" click "\".tn-pane.on:not(.off) .sf-link[title^='<url>  ']\"" cmd`. The two spaces after the URL separate it from Tern's tooltip hint, so a short URL cannot match a longer link. Pass separate trailing `cmd` and `alt` tokens for Cmd+Option-click.
- To focus a shell, run `"$V" tern "$RUN" focus <id>`, then poll `ctl state` until `.focused.id` names it. CLI-created tabs and splits do not take focus. Before `type`, require the expected shell id, not a browser or native omp pane.
- When the shell shares its tab with another tiled pane, zoom it with `"$V" ctl "$RUN" click '".tn-pane.on:not(.off) .tn-zoomb"'` so the URL fits on one line. For a float, first poll `"$V" ctl "$RUN" tree '.tn-pane.on:not(.off)'` until its class includes `pip-focus` and excludes `pip-moving`. Click that zoom button, then poll until the class includes `pip-expanded` and excludes `pip-moving`. Verify `.focused.id` still names the float before typing. Clicking the Flow link brings the tiled layout back.
- After each click, poll `"$V" tern "$RUN" browser '{"op":"blocks"}'` with an eight-second limit for the expected URL, pane count, and `driven: false`. Read `"$V" tern "$RUN" ls` for tab membership and `"$V" ctl "$RUN" state` for focus. A successful click response alone proves no resulting state.

- Step `vstack-flow-open`: `flow-open`. Print and Cmd-click `<FLOW>#question-1`. A new browser pane opens in the same tab, tiled to the right of the shell (no `pip` in `tern ls`), with focus, and `blocks` lists it with the clicked URL and `driven: false`.
- Step `vstack-flow-reuse`: `flow-reuse`. Focus the shell, print and Cmd-click `<FLOW>#question-2`. `tern ls` lists no new pane. The same browser pane now has the `#question-2` URL in `blocks`, and it has focus.
- Step `vstack-flow-other`: `flow-other`. Focus the shell, print and Cmd-click `<OTHER>#question-1`. A second browser pane opens beside the shell; the first keeps its URL. Then run `"$V" tern "$RUN" new tab`, which prints the new shell's id, focus that shell, print `<FLOW>#question-3` there and Cmd-click it. A browser pane opens in the new tab; the page of the first tab keeps `#question-2`.
- Step `vstack-flow-float`: `flow-float`. In a fresh tab (focus its shell), run `"$V" tern "$RUN" split @focused right` for a second shell, then `"$V" tern "$RUN" pip <its id>` to float it and focus it. In the float, print and Cmd-click `<FLOW>#question-1`. The page opens tiled beside the tab's tiled shell, not as a float.
- Step `vstack-flow-alt`: `flow-alt`. In the tab of `flow-open`, focus the shell, print and Cmd+⌥-click `<FLOW>#question-4`. Tern's own handling opens a new browser pane (link_target `Browser`, so ⌥ picks Tern), and the existing page keeps `#question-2`.
- Step `vstack-flow-not-claimed`: `flow-not-claimed`. Print and Cmd-click each of `http://127.0.0.1:9/f/not-a-flow/`, `<FLOW>extra` with more path after the capability, `<FLOW>` with its host replaced by `127.0.0.1:9@outside.invalid`, and the ordinary web URL `http://127.0.0.1:<port>/`. After each click no browser pane opens in Tern and existing page URLs stay unchanged. Tern sends these links to the default browser.
- Step `vstack-flow-reload`: Reload. Run `"$V" tern "$RUN" plugin reload` and `plugin list`; `vstack-flow` is `ready`. Repeat `flow-open` once in a fresh tab.
- Step `vstack-flow-proof`: Proof. Save each step's `tern ls`, `blocks` and `state` output before and after the click, and a shot.
- Step `vstack-flow-cleanup`: Cleanup. Stop the owned Flow host with `bun "$CHECKOUT/plugin/skills/flow-page/scripts/flow-page.ts" host stop --home "$RUN/data/flow-home"`. Then run `"$V" stop "$RUN"`. Preserve the proof files and notes.

### Tab following

Use a fresh run, not the link-routing run. This fixture makes real native omp sessions but sends no model prompt. `scripts/tern-session.js` persists only runtime-generated session metadata through the existing session-manager getters. `scripts/tern-flow-fixture.ts` seeds test data in the run's throwaway Flow home. The driver issues no Flow authoring command of its own for these sessions or bindings.

1. Step `vstack-flow-follow-start`: Choose a free `VSTACK_FLOW_PORT`. Export `TERN_VERIFY_HOME="$RUN/data/home"` before `"$V" start "$RUN"` and keep it set for all helper calls. Use a short physical RUN path for native sockets, with evidence copied to the caller's longer run-note path if necessary. Start dismisses the Stencil sign-in overlay in this isolated HOME. Require Doctor to pass, including `overlay: none`. Local following needs no account. Keep the user's normal HOME and Flow bindings untouched.
2. Step `vstack-flow-follow-profile`: After start, create `"$TERN_VERIFY_HOME/.zprofile"` with a PATH containing the directories of the real `bun` and `tern` executables. This is the fixture's login profile, not a product setting. The helper launches Tern with a launcher-like PATH, so a working login profile is necessary.
3. Step `vstack-flow-follow-sessions`: Set `EXT="$SKILL_DIR/scripts/tern-session.js"`. Get the initial shell id `A` from `tern ls`. Run `"$V" tern "$RUN" run "$A" "omp --no-extensions --no-skills --no-rules --no-context-files -e $EXT --session-dir $RUN/data/sessions-a"`. Use an absolute `omp` path if the isolated shell cannot resolve it. Split a second pane with `"$V" tern "$RUN" split "$A" down --cwd "$RUN/data" -- <absolute-omp> --no-extensions --no-skills --no-rules --no-context-files -e "$EXT" --session-dir "$RUN/data/sessions-b"`. Save its id as `B`. Do not send either session a prompt.
4. Step `vstack-flow-follow-session-files`: Poll `"$V" tern "$RUN" inspect --json` for each pane's non-null `omp_session_file` and wait for the metadata extension to persist it. Save these absolute file paths as `AF` and `BF`. Read each `type: session` record for its runtime `id` and `cwd`, and require zero `message` records. Do not derive association from inherited `TERN_PANE`.
5. Step `vstack-flow-follow-seed`: Set `F="$SKILL_DIR/scripts/tern-flow-fixture.ts"`. Run `bun "$F" seed "$RUN" "$AF" "$BF"` and retain its JSON receipt. This writes disposable main-agent bindings directly as test data, not through impersonated CLI authoring. It refuses any home except `TERN_VERIFY_HOME=RUN/data/home`, a missing live isolated-start marker, symlinks in that home, session files or working directories outside RUN/data, sessions with messages, and existing bindings. The receipt gives `FLOW` as `url`, `SA` and `SB` as `sessions[0].stage` and `sessions[1].stage`, and B's seeded `question` and quiz `result` fragments. Create one page with `"$V" tern "$RUN" browser '{"op":"open","owner":<A>,"how":"beside","url":"<FLOW>#<SA>"}'`, save its block as `PAGE`, then release it with `{"op":"release","block":<PAGE>}`. This explicit fixture action opens the page, not the plugin.
6. Step `vstack-flow-follow-other-tab`: Create a second tab with `tern new tab`, then explicitly open and release a page of `FLOW#SA` beside that tab's shell. Save its block as `OTHER_PAGE`. Record its URL before every following case and require it to remain unchanged afterward.
7. Step `vstack-flow-follow-focus`: `flow-follow-focus`. Focus A, then B, then A. After each change, require PAGE's URL to end in that session's Stage fragment within eight seconds. Assert no pane was created. Run `tern ls` and `ctl state` to prove membership and focus.
8. Step `vstack-flow-follow-picker`: `flow-follow-picker`. Select B. Run `bun "$F" target "$RUN" "$BF"` and require its Stage target. Navigate PAGE to `FLOW#SA` so the reader's own question following cannot satisfy this check. Run `bun "$F" picker "$RUN" "$BF" open fixture-round-1`. Without another pane-focus action, require PAGE to reach B's seeded question. The read-only `target` receipt must include that question's URL and `picker: fixture-round-1`. Run `bun "$F" picker "$RUN" "$BF" clear fixture-round-1`, navigate away, and open `fixture-round-2` for the same question. Require another move. Retain elapsed time as an observation, not a 500 ms acceptance limit. The fixture sends presence only to its isolated authenticated host, not to an omp session.
9. Step `vstack-flow-follow-hold`: `flow-follow-hold`. Navigate PAGE to B's seeded quiz Result fragment. Poll browser `snapshot` for the Answer textbox, then use browser `act` with `action: fill`, its ref, and `text: My draft`. Read the selected `.bar .jump-row a[aria-current]`, `scrollY`, active element, active input value, and selection with browser `eval`. Measure `document.activeElement.value`, not the first input in the document, since other Stages have inputs too. Open a new picker token with the fixture's `picker` command. The URL fragment changes but the selected block, scroll, input focus, selection, and draft stay unchanged. Press Tab with browser `act`, `action: press`, the textbox ref, and `keys: Tab`. Poll until the selected Jump link reaches the asked question and the draft remains.

   Repeat while PAGE's URL already names the held question. A new picker for that same question must preserve the input and draft until blur, rather than reload the document. Also scroll away from a question without changing its fragment, open a new picker for it, and require selection and scroll to return to it.

10. Step `vstack-flow-follow-guards`: `flow-follow-guards`. Navigate PAGE to another block of B's Stage, focus PAGE, then re-focus B. Require no movement. Focus a plain shell in that tab and open a new picker for B. It must still navigate, proving that non-omp focus preserved B. Add a third native omp pane C with its own session directory and the same metadata extension. Save its reported session file as `CF`. Leave C unbound, focus it, and open a picker in B. Require no movement and no new page. Run `bun "$F" other "$RUN" "$CF"` to seed a different disposable Flow for C. Focus B then C, and require both original pages to stay put.
11. Step `vstack-flow-follow-picker-refresh`: With B selected, open a picker token and wait for its question. Navigate PAGE elsewhere, refresh the same token with `bun "$F" picker "$RUN" "$BF" open <same-token>`, then clear it. Neither operation moves PAGE. Open a new token, navigate away after its first move, leave it unrefreshed for at least 31 seconds, and require expiry to leave PAGE unchanged. Read `target` again and require `picker: null`. Focusing B again also leaves PAGE unchanged.
12. Step `vstack-flow-follow-tabs`: `flow-follow-tabs`. Across all cases require OTHER_PAGE's URL and the browser-block count to stay unchanged. Repeat `flow-open`, `flow-reuse`, and `flow-alt` from the routing recipe in a fresh tab after following is active. Reload the plugin, confirm `ready`, then repeat focus and picker following.
13. Step `vstack-flow-follow-cleanup`: Save the commands, fixture receipts, session-file association, before/after `blocks`, `ls`, `state`, typing DOM measurements, and lossless WebP shots. Re-read every native session file and require zero message records. Clear the last fixture picker with `bun "$F" picker "$RUN" "$BF" clear <last-token>`, then run `bun "$F" stop "$RUN"` before `"$V" stop "$RUN"`. The first stops only the authenticated isolated Flow host; the second removes the isolated HOME and bindings with its data. Preserve proof outside data.

## Gotchas

- A selector-centre click on a link that wraps to two lines can land between the lines and click nothing. The full-width shell of a fresh tab fits a Flow URL on one line; a split or floating shell needs the zoom step of the preconditions.
- `flow-not-claimed` and a red run before the plugin exists hand the link to the default browser, which opens a tab there. Name that in `notes.md`.
- A Cmd+⌥ chord written as one `cmd+alt` token is read as part of the selector and clicks nothing.
- Control shots show a browser pane's cover, not the page's pixels. Read the page's URL from `blocks`, not from a shot.
- The link lens proves clicked-link routing for native links. The native omp panel link and raw terminal OSC 8 links remain separate entry points, untested by this recipe.
- A page that the plugin opens shows Tern's `agent` website data chip, while Tern's own link opens show `Share`. Tern picks the store for pages opened through browser automation; the plugin cannot choose it.
- ACP conversations expose no selected-session signal. This recipe covers ordinary native omp panes, not conversation switching inside an ACP pane.
- Browser `eval` and `act` can mark a page driven. Release it after inspection when checking ordinary link ownership. Reading only its URL does not prove the typing hold; retain the selected Jump link, scroll, active input, and draft as well.
- An omp session file may not exist before its first message. `appendEntry` alone does not force that first write. The fixture extension writes the runtime's own header and entries, without creating any model conversation.
- Keep native run paths short. macOS rejects control-socket paths beyond its Unix socket path limit.

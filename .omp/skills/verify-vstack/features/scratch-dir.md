# Scratch dir

Ordinary Scratch goes under `~/.vstack/tmp/<repo-key>/<kind>/<session-id>/`. The path script prints the project Scratch dir or creates a marked session folder. The cleanup script lists expired rows and explains why others are withheld. The `/vstack-clean` Command opens the Tern popup for selection and confirmation.

## Sub-features

- `scratch-path` the path script creates and prints the project Scratch dir, a marked session folder, or the reserved `to-tickets` dir, with a trailing slash.
  The explicit subagent mode uses the dir and parent session id it receives, not the current repo.
- `scratch-key` worktrees and concurrent callers of one repo share its key: the main checkout's name plus 6 hex chars. A real Git reply remains usable when returned capture buffers are lost.
- `scratch-bad-kind` a kind that is not one lowercase path segment exits 2 and creates nothing.
- `scratch-bad-session` a missing or invalid session id exits 2 before creating any directory. An existing unmarked folder with the session id as its name stays unchanged.
- `scratch-identity-failure` unavailable Git, operational failure, or invalid identity output fails before creating a storage namespace. Only a genuine outside-repository reply selects `_global`; owned process-output files do not remain after success or failure.
- `clean-list` list mode returns `rows`, `kept`, and `withheld` without changing Scratch. The Flow page recipe's `flow-page-retention` covers lifecycle rows.
- `clean-delete` `--delete <snapshot>...` rechecks the listed rows and reports `deleted`, `skipped`, `partial`, and `pruned`.
- `clean-command-outside-tern` the Command refuses when `TERN_PANE` is unset and deletes nothing.
- `clean-command-invalid-age` an age outside `^\d+[hdw]?$` is refused before opening a popup.
- `clean-command-no-ui` the Command refuses without a UI and deletes nothing.
- The [Scratch cleanup popup](./vstack-clean.md) recipe covers selection, confirmation, deletion, and popup lifecycle. Cleanup publishes no Flow Result or Stage.

## How to get to it (user POV)

- An agent runs `bun "$(realpath skill://vstack-tmp/scripts/path.ts)" [<kind>]` when a skill needs Scratch.
- A user types `/vstack-clean [age]` inside omp in Tern. The extension requires the ready `vstack-clean` plugin and opens its popup over the caller pane. No agent turn runs. The default age for the Command and `clean.ts` is `15d`.

## Driving it with bash and drive.ts

Preconditions:

- The baseline from `README.md`.
- `V="$VERIFY_RUN_DIR/data/vhome"` for direct CLI checks. Pass `--home "$V"` to every CLI command.
- For Command checks, use only the drive's isolated home at `$VERIFY_RUN_DIR/data/home`. The Command uses that process's home and cannot accept a `--home` argument.

### Direct CLI checks

- Step `scratch-dir-path`: Default mode. Set `SID=019abcde-1234-7abc-8def-000000000001`. With `cwd` set to `CHECKOUT`, run `P=$(bun plugin/skills/vstack-tmp/scripts/path.ts --home "$V")`, then `D=$(PI_SESSION_ID="$SID" bun plugin/skills/vstack-tmp/scripts/path.ts --home "$V" verify)`. Both exit 0. `P` ends with `<repo-key>/`, and `D` is `${P}verify/$SID/`. Save `ls -la "$D"` as proof that the new folder holds its mark.
- Step `scratch-dir-subagent-path`: Explicit mode. Set `S="$VERIFY_RUN_DIR/data/parent-scratch"`. Run `bun plugin/skills/vstack-tmp/scripts/path.ts --home "$V" --scratch-dir "$S" --session-id "$SID" verify`. It prints `$S/verify/$SID/` and creates a marked folder there, outside the namespace it would get from `CHECKOUT`.
- Step `scratch-dir-bad-session`: Invalid or missing id. Run `PI_SESSION_ID=bad bun plugin/skills/vstack-tmp/scripts/path.ts --home "${V}-invalid" verify`, then `bun plugin/skills/vstack-tmp/scripts/path.ts --scratch-dir "${S}-missing" verify`. Both exit 2 with a fix hint and no stdout. Neither `${V}-invalid` nor `${S}-missing` exists.
- Step `scratch-dir-session-collision`: Refusal. Run `mkdir -p "${P}explain/$SID"` and write a file there. Run `PI_SESSION_ID="$SID" bun plugin/skills/vstack-tmp/scripts/path.ts --home "$V" explain`. It exits 2, reports the unmarked entry, and leaves that folder and file unchanged. Remove only this fixture afterward.
- Step `scratch-dir-tickets-path`: Reserved kind. Run `PI_SESSION_ID= bun plugin/skills/vstack-tmp/scripts/path.ts --home "$V" to-tickets`. It prints `${P}to-tickets/`. Run it again with `PI_SESSION_ID="$SID"` and require the same path. Neither invocation adds a session folder.
- Step `scratch-dir-bad-kind`: Bad kind. In the same `cwd`, run `bun plugin/skills/vstack-tmp/scripts/path.ts --home "$V" Bad/Kind; echo "exit=$?"`. stderr starts with `path.ts: kind must be one lowercase path segment`, and stdout ends with `exit=2`.
- Step `scratch-dir-seed`: Set `K="${P}verify/"` and `R="${P}to-tickets/cli-verify"`. Run `mkdir -p "${K}old-entry" "$R"`. Write `old` to `${K}old-entry/notes.md`, `${D}report.md`, and `$R/approved.json`. Set the three files' times to 20 days ago with `touch -t "$(date -v-20d +%Y%m%d%H%M)"`.
- Step `scratch-dir-list`: Run `bun plugin/skills/vstack-tmp/scripts/clean.ts --home "$V" --older-than 14d | tee "$VERIFY_RUN_DIR/scratch-clean-list.json"`. Exit 0. Require one `to-tickets` row for `cli-verify`, and one attribution reason with count 2. The unmarked `verify` folder and the session row are withheld in this project.
- Step `scratch-dir-no-deletion`: Save `find "$V/.vstack/tmp" -type f | sort` to `scratch-after-list.txt`. The three fixture files and the mark remain.
- Step `scratch-dir-delete`: Select `S=$(jq -er '.rows[] | select(.kind == "to-tickets" and .label == "cli-verify") | .snapshot' "$VERIFY_RUN_DIR/scratch-clean-list.json")`. Run `bun plugin/skills/vstack-tmp/scripts/clean.ts --home "$V" --older-than 14d --delete "$S" | tee "$VERIFY_RUN_DIR/scratch-clean-delete.json"`. Exit 0. `deleted[0].removed` holds only the record path. `skipped` and `partial` are empty.
- Step `scratch-dir-deletion`: Save `find "$V/.vstack/tmp" -type f | sort` to `scratch-after-delete.txt`. The to-tickets record is gone. The unmarked `verify` entry and the marked folder remain.
- Step `scratch-dir-key`: Key. Make a throwaway repo with one worktree: `R="$VERIFY_RUN_DIR/data/keyrepo"; git init -q "$R/main" && git -C "$R/main" -c user.name=v -c user.email=v@v commit -q --allow-empty -m init && git -C "$R/main" worktree add -q "$R/wt"`. Run `bun "$CHECKOUT/plugin/skills/vstack-tmp/scripts/path.ts" --home "$V"` twice: once with the bash tool's `cwd` set to the absolute path of `$R/main`, and once with it set to that of `$R/wt`. Both print the same `$V/.vstack/tmp/main-<hex>/`. `main` is the main checkout's dir name, and `<hex>` is the first 6 characters that `printf %s "$(realpath "$R/main/.git")" | shasum -a 256` prints.

### Identity acquisition (`scratch-key`, `scratch-identity-failure`)

Preconditions: use the owned main checkout and linked worktree from the Key check above. Use the fixture Git environment from `tests/support/fixture.ts`: discard inherited Git settings and disable global/system Git config. Give each scenario a fresh isolated `--home`; do not reuse cleanup's seeded home. Set its child `TMPDIR` to an empty owned directory under `$VERIFY_RUN_DIR/data/`, and retain commands, exit codes, stdout, stderr, and final directory listings above `data/`.

1. Step `scratch-dir-identity-control`: Control and lost capture. From the fixture's main checkout, run `bun "$CHECKOUT/plugin/skills/vstack-tmp/scripts/path.ts" --home "$CAPTURE_HOME"`. Save its exact stdout. Repeat from that checkout and its linked worktree with `bun --preload "$CHECKOUT/tests/support/empty-git-capture.ts" "$CHECKOUT/plugin/skills/vstack-tmp/scripts/path.ts" --home "$CAPTURE_HOME"`. Both exit 0 and print the control path, whose directory exists. That home contains only the expected repository key.
2. The preload calls real Git before discarding only Bun's returned stdout/stderr buffers. It does not replace Git's actual output or application code. Use the head-tree fixture, preserve it with the evidence, and report its fault injection as synthetic rather than claiming it reproduces the unknown upstream timing failure.
3. Step `scratch-dir-identity-outside`: Genuine outside-repository behavior. Make an owned directory outside every Git repo. Run the path command there with a new `$OUTSIDE_HOME`, first normally and then with the same preload. Both exit 0 and print exactly `$OUTSIDE_HOME/.vstack/tmp/_global/`, with a trailing newline. No repository namespace appears.
4. Step `scratch-dir-identity-concurrent`: Concurrent Flow callers. Follow `flow-page.md`'s direct CLI binding recipe in a fresh isolated home with `VSTACK_FLOW_HOST=off`. Open one owned Flow and two Stages with distinct session identities, from the main checkout and linked worktree. Submit distinct contributions concurrently, adding `--preload "$CHECKOUT/tests/support/empty-git-capture.ts"` before the Flow script path. Each receipt must name its expected Flow and Stage; all returned Topic or question IDs must remain in `show`, with one shared repository namespace. `show` projects Topic IDs and questions, not Topic body text: do not assert hidden bodies from that projection. Finish and close only the owned fixture Flow.
5. Step `scratch-dir-identity-empty-git`: Actual empty Git reply. In a fresh owned bin directory, write an executable `git` containing `#!/bin/sh` and `exit 0`. Run the path command from the known repository with only that child's PATH prefixed by the bin, a new isolated home, and the owned `TMPDIR`. Require a nonzero exit, empty stdout, and no `.vstack` directory in that home.
6. Step `scratch-dir-identity-failure`: Operational failure. Repeat with a separate executable Git fixture containing `exit 73` and another fresh home. Require the same refusal, not `_global`. Keep these actual-empty/failure cases separate from the lost-buffer fixture: valid OS-written output must work, while invalid replies must not choose a namespace.
7. Step `scratch-dir-identity-unavailable-git`: Unavailable Git. Resolve Bun's absolute executable path before changing the child environment, then launch it with PATH containing only an empty owned directory. The CLI must fail without a namespace. Do not accidentally test failure to launch Bun itself.
8. Step `scratch-dir-identity-tmpdir`: After every scenario, inspect the owned `TMPDIR`: no process-output files or directories remain. Preserve evidence before the normal Verify Cleanup removes `data/`. Do not stop the maintainer's host, alter its binding, retry unchanged failures until green, or install a plain-checkout fallback.


### Command refusals through RPC

`drive.ts` starts outside Tern with `TERN_PANE` unset. These drives prove refusals only, not the popup. The Command needs no model request or UI dialog reply. Use [Scratch cleanup popup](./vstack-clean.md) for native trigger proof.

1. Step `scratch-dir-command-setup`: Initialize the isolated home and plugin link with `bun "$SKILL_DIR/scripts/drive.ts" --plugin "$CHECKOUT/plugin" --run "$VERIFY_RUN_DIR" --name clean-command-setup '{"type":"get_state"}'`.
2. Step `scratch-dir-command-fixtures`: Set `C="$VERIFY_RUN_DIR/data/home/.vstack/tmp/_global/verify"`. Create fixtures with `mkdir -p "$C/old-one" "$C/old-two" "$C/new-entry" && echo one > "$C/old-one/notes.txt" && echo two > "$C/old-two/notes.txt" && echo new > "$C/new-entry/notes.txt" && touch -t 202601010000 "$C/old-one/notes.txt" "$C/old-one" "$C/old-two/notes.txt" "$C/old-two"`.
3. Step `scratch-dir-command-before`: Save `find "$C" -type f | sort` as `$VERIFY_RUN_DIR/clean-command-before.txt`.
4. Step `scratch-dir-command-outside-tern`: Run `bun "$SKILL_DIR/scripts/drive.ts" --plugin "$CHECKOUT/plugin" --run "$VERIFY_RUN_DIR" --name clean-command-outside-tern '{"type":"prompt","message":"/vstack-clean"}'`. Exit 0. The prompt result is `completed` with `agentInvoked: false`, and `model_requests` is `0`. The error notification is exactly `/vstack-clean: it needs Tern with the vstack-clean plugin; run it in a Tern pane. Nothing deleted.` No selection or confirmation request appears. Read notifications with `jq -r 'select(.type=="extension_ui_request" and .method=="notify") | .message' "$VERIFY_RUN_DIR/clean-command-outside-tern/rpc.jsonl"`.
5. Step `scratch-dir-command-invalid-age`: Run the same helper with `--name clean-command-invalid-age` and `'{"type":"prompt","message":"/vstack-clean yesterday"}'`. It completes without invoking the agent or requesting a dialog. Its error notification starts with `/vstack-clean:`, reports the invalid age, and ends with `Nothing deleted.` Age validation takes precedence over the outside-Tern refusal.
6. Step `scratch-dir-command-refusal-files`: After each refusal, save `find "$C" -type f | sort` outside `data/` and compare it with `clean-command-before.txt` using `diff -u`. All three files remain.

### Refusal without a UI

1. Step `scratch-dir-no-ui-fixtures`: If this is a fresh run, initialize the isolated home with the `clean-command-setup` drive above. Set `C="$VERIFY_RUN_DIR/data/home/.vstack/tmp/_global/verify"`. Restore the fixtures with `mkdir -p "$C/old-one" "$C/new-entry" && echo one > "$C/old-one/notes.txt" && echo new > "$C/new-entry/notes.txt" && touch -t 202601010000 "$C/old-one/notes.txt" "$C/old-one"`. Save `find "$C" -type f | sort` as `$VERIFY_RUN_DIR/clean-command-no-ui-before.txt`.
2. Step `scratch-dir-no-ui-drive`: Run Doctor for this fresh session. Then run `bun "$SKILL_DIR/scripts/drive.ts" --plugin "$CHECKOUT/plugin" --run "$VERIFY_RUN_DIR" --name clean-command-no-ui --no-ui '{"type":"prompt","message":"/vstack-clean 15d"}'`. Capture stdout, stderr, and the exit code. The helper starts `omp --mode rpc --no-ui --no-session --no-title --model stub/stub-model`, so the extension context has no UI.
3. Step `scratch-dir-no-ui-files`: Save `find "$C" -type f | sort` as `$VERIFY_RUN_DIR/clean-command-no-ui-after.txt`. Compare it with the before listing using `diff -u`. Every fixture file remains. Read `clean-command-no-ui/summary.json` and `clean-command-no-ui/rpc.jsonl`: the Command completes with `agentInvoked: false`, zero model requests, and `ui_requests` of `0`.
4. Step `scratch-dir-no-ui-message`: The refusal is a displayed custom message, because `--no-ui` drops extension notifications. Run `jq -r 'select(.type=="message_end" and .message.customType=="vstack-clean") | .message.content' "$VERIFY_RUN_DIR/clean-command-no-ui/rpc.jsonl"`. It must print `/vstack-clean requires an interactive UI to confirm deletion. Nothing deleted.` Record the exact text. If it prints nothing, record a product finding: the no-UI refusal has no observable message. Unchanged files or a completed Command are not proof of the message. `--mode json --no-ui` is invalid and must not be used.


## Gotchas

- The direct CLIs use the cwd's git repo key, or `_global` outside a repo. Cleanup scans all keys in the supplied home.
- Age comes from the newest file or link, not from a directory timestamp or the session mark. A closed Flow must exceed both the requested age and 15 days since close.
- Never change your own session's `HOME`. Direct CLIs use `--home`. Only the isolated omp process gets a throwaway `HOME`.
- Pass snapshots, not paths, to `--delete`. Use the same home and age as the listing. After an interruption, list again before getting a new confirmation.
- RPC proof must come from the linked checkout. Command seam tests and the native trigger proof cover popup opening together. RPC refusal drives and the cleanup CLI do not prove that native popup entry point.

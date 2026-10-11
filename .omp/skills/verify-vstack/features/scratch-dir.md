# Scratch dir

vstack skills write throwaway output to Scratch, `~/.vstack/tmp/<repo-key>/<kind>/<entry>`. The vstack-tmp path script prints and creates the Scratch dir. Its cleanup script lists expired entries. The model-free `/vstack-clean` Command previews those entries and deletes only the user's confirmed choices.

## Sub-features

- `scratch-path` the path script prints and creates `<home>/.vstack/tmp/<repo-key>/` or a kind directory, with a trailing slash.
- `scratch-key` worktrees of one repo share its key: the main checkout's name plus 6 hex chars.
- `scratch-bad-kind` a kind that is not one lowercase path segment exits 2 and creates nothing.
- `clean-list` list mode prints expired entries and the `kept` count as JSON, without deletion.
- `clean-delete` `--delete <path>...` deletes named expired entries and prints `deleted`, `skipped`, and `pruned`.
- `clean-command-table` `/vstack-clean [age]` shows repo key, kind, entry, age, size, and totals before confirmation.
- `clean-command-choose` Choose items opens a checklist. Done deletes only marked entries.
- `clean-command-cancel` Cancel at either selection deletes nothing.
- `clean-command-no-ui` the Command refuses without a UI and deletes nothing.

## How to get to it (user POV)

- An agent runs `bun "$(realpath skill://vstack-tmp/scripts/path.ts)" [<kind>]` when a skill needs Scratch.
- A user types `/vstack-clean [age]`. The extension runs `plugin/skills/vstack-tmp/scripts/clean.ts`, shows the dry-run table, and offers Apply all, Choose items, and Cancel. No agent turn runs. The default age is `14d`.

## Driving it with bash and drive.ts

Preconditions:

- The baseline from `README.md`.
- `V="$VERIFY_RUN_DIR/data/vhome"` for direct CLI checks. Pass `--home "$V"` to every CLI command.
- For Command checks, use only the drive's isolated home at `$VERIFY_RUN_DIR/data/home`. The Command uses that process's home and cannot accept a `--home` argument.

### Direct CLI checks

- Path. With the bash tool's `cwd` set to `CHECKOUT`, run `bun plugin/skills/vstack-tmp/scripts/path.ts --home "$V" verify`. Exit 0, stdout ends with `<repo-key>/verify/`, and that directory exists.
- Bad kind. In the same `cwd`, run `bun plugin/skills/vstack-tmp/scripts/path.ts --home "$V" Bad/Kind; echo "exit=$?"`. stderr starts with `path.ts: kind must be one lowercase path segment`, and stdout ends with `exit=2`.
- Seed entries. Run `D=$(bun plugin/skills/vstack-tmp/scripts/path.ts --home "$V" verify)`, then `mkdir -p "${D}old-entry" "${D}new-entry" && echo old > "${D}old-entry/notes.md" && echo new > "${D}new-entry/notes.md" && touch -t 202601010000 "${D}old-entry/notes.md" "${D}old-entry"`.
- List. Run `bun plugin/skills/vstack-tmp/scripts/clean.ts --home "$V" --older-than 14d | tee "$VERIFY_RUN_DIR/scratch-clean-list.json"`. Exit 0. `entries` holds only `old-entry`, and `kept` is `1`.
- Prove no deletion. Run `find "$V/.vstack/tmp" -mindepth 3 -maxdepth 3 | tee "$VERIFY_RUN_DIR/scratch-after-list.txt"`. Both entries remain.
- Delete. Run `bun plugin/skills/vstack-tmp/scripts/clean.ts --home "$V" --older-than 14d --delete "${D}old-entry" | tee "$VERIFY_RUN_DIR/scratch-clean-delete.json"`. Exit 0. `deleted` holds that path.
- Prove deletion. Run `find "$V/.vstack/tmp" -mindepth 3 -maxdepth 3 | tee "$VERIFY_RUN_DIR/scratch-after-delete.txt"`. Only `new-entry` remains.

### Command table through RPC

1. Initialize the isolated home and plugin link with `bun "$SKILL_DIR/scripts/drive.ts" --plugin "$CHECKOUT/plugin" --run "$VERIFY_RUN_DIR" --name clean-command-setup '{"type":"get_state"}'`.
2. Set `C="$VERIFY_RUN_DIR/data/home/.vstack/tmp/_global/verify"`. Create fixtures with `mkdir -p "$C/old-one" "$C/old-two" "$C/new-entry" && echo one > "$C/old-one/notes.txt" && echo two > "$C/old-two/notes.txt" && echo new > "$C/new-entry/notes.txt" && touch -t 202601010000 "$C/old-one/notes.txt" "$C/old-one" "$C/old-two/notes.txt" "$C/old-two"`.
3. Save `find "$C" -type f | sort` as `$VERIFY_RUN_DIR/clean-command-before.txt`.
4. Run `bun "$SKILL_DIR/scripts/drive.ts" --plugin "$CHECKOUT/plugin" --run "$VERIFY_RUN_DIR" --name clean-command-table '{"type":"prompt","message":"/vstack-clean 14d"}'`.
5. Read `$VERIFY_RUN_DIR/clean-command-table/rpc.jsonl`. The `extension_ui_request` with `method: "notify"` shows a dry-run table with `old-one` and `old-two`, their ages and sizes, the total, and one kept entry. The following `method: "select"` request offers Apply all, Choose items, and Cancel.
6. Save `find "$C" -type f | sort` as `$VERIFY_RUN_DIR/clean-command-after-table.txt`. Compare it with the before listing. All three files must remain.

`drive.ts` sends commands in order and waits for each response. It cannot answer a `ctx.ui.select` request while that command waits. An `extension_ui_response` supplied as a later argument cannot pass that wait. With the expired fixtures, this drive times out after 90 seconds and exits 1. Record the table and choice request as observed, and record selection completion as skipped. A timeout is not proof of Cancel, Choose items, or refusal without a UI. No model request is needed for the Command.

### Choose items and Cancel through the isolated TUI

The current driver cannot complete these dialogs. Use the same isolated home in a terminal, or report these checks as skipped if no terminal is available. Do not substitute a direct cleanup CLI call for Command proof.

1. Read the target of `$VERIFY_RUN_DIR/data/outside`. Set the bash tool's `cwd` to `<target>/proj`.
2. Start `env -i PATH="$PATH" HOME="$VERIFY_RUN_DIR/data/home" TERM=xterm-256color omp --no-session --no-title --model stub/stub-model` with a PTY. The stub server from the drive is stopped. Enter only Commands, which need no model.
3. Type `/vstack-clean 14d`. Capture the table and select Cancel. Save `find "$C" -type f | sort` after the action. All three fixture files remain.
4. Type `/vstack-clean 14d` again. Select Choose items, mark `old-one`, then select Cancel. Capture the checklist and resulting notification. All three files remain.
5. Type `/vstack-clean 14d` again. Select Choose items, mark only `old-one`, then select Done. Capture the checklist before Done and the deletion notification. A new file listing holds only `old-two` and `new-entry`.
6. To cover Apply all, type `/vstack-clean 14d` once more and select Apply all. The notification names one deleted entry. Only `new-entry` remains.
7. Exit the isolated omp session. Keep the terminal captures and file listings at the top level of `VERIFY_RUN_DIR`.

### Refusal without a UI

1. If this is a fresh run, initialize the isolated home with the `clean-command-setup` drive from Command table step 1. Set `C="$VERIFY_RUN_DIR/data/home/.vstack/tmp/_global/verify"`. Restore the fixtures with `mkdir -p "$C/old-one" "$C/new-entry" && echo one > "$C/old-one/notes.txt" && echo new > "$C/new-entry/notes.txt" && touch -t 202601010000 "$C/old-one/notes.txt" "$C/old-one"`. Save `find "$C" -type f | sort` as `$VERIFY_RUN_DIR/clean-command-no-ui-before.txt`.
2. Run Doctor for this fresh session. Then run `bun "$SKILL_DIR/scripts/drive.ts" --plugin "$CHECKOUT/plugin" --run "$VERIFY_RUN_DIR" --name clean-command-no-ui --no-ui '{"type":"prompt","message":"/vstack-clean 14d"}'`. Capture stdout, stderr, and the exit code. The helper starts `omp --mode rpc --no-ui --no-session --no-title --model stub/stub-model`, so the extension context has no UI.
3. Save `find "$C" -type f | sort` as `$VERIFY_RUN_DIR/clean-command-no-ui-after.txt`. Compare it with the before listing using `diff -u`. Both fixture files must remain. Read `clean-command-no-ui/summary.json` and `clean-command-no-ui/rpc.jsonl`: the Command must complete with `agentInvoked: false`, zero model requests, and no deletion dialog.
4. The refusal is a displayed custom message, because `--no-ui` drops extension notifications. Run `jq -r 'select(.type=="message_end" and .message.customType=="vstack-clean") | .message.content' "$VERIFY_RUN_DIR/clean-command-no-ui/rpc.jsonl"`. It must print `/vstack-clean requires an interactive UI to confirm deletion. Nothing deleted.` Record the exact text. If it prints nothing, record a product finding: the no-UI refusal has no observable message. Unchanged files or a completed Command are not proof of the message. `--mode json --no-ui` is invalid and must not be used.

## Gotchas

- The direct CLIs use the cwd's git repo key, or `_global` outside a repo. The Command scans all keys in its isolated home.
- An entry's age is its newest mtime, including descendants. Touch files first and the entry directory last.
- Never change your own session's `HOME`. Direct CLIs use `--home`. Only the isolated omp process gets a throwaway `HOME`.
- `--delete` needs absolute entry paths at `<repo-key>/<kind>/<entry>` depth. Other paths exit 2 before deletion.
- TUI and RPC proof must come from the linked checkout. The fake extension host and cleanup CLI prove different entry points.

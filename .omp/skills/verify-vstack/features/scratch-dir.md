# Scratch dir

vstack skills write throwaway output to Scratch, `~/.vstack/tmp/<repo-key>/<kind>/<entry>`. The vstack-tmp path script prints and creates the Scratch dir. Its cleanup script lists expired entries. The model-free `/vstack-clean` Command previews those entries and deletes only the user's confirmed choices.

## Sub-features

- `scratch-path` the path script prints and creates `<home>/.vstack/tmp/<repo-key>/` or a kind directory, with a trailing slash.
- `scratch-key` worktrees of one repo share its key: the main checkout's name plus 6 hex chars.
- `scratch-bad-kind` a kind that is not one lowercase path segment exits 2 and creates nothing.
- `clean-list` list mode prints expired entries and the `kept` count as JSON, without deletion. A Flow in the `flow` kind is judged by its lifecycle; the Flow page recipe's `flow-retention` covers it.
- `clean-delete` `--delete <path>...` deletes named expired entries and prints `deleted`, `skipped`, and `pruned`.
- `clean-command-table` `/vstack-clean [age]` shows repo key, kind, entry, age, size, and totals before confirmation.
- `clean-command-choose` Choose items opens a checklist. Done deletes only marked entries.
- `clean-command-cancel` Cancel at either selection deletes nothing.
- `clean-command-no-ui` the Command refuses without a UI and deletes nothing.
- `clean-command-flow` a bound Command publishes its outcome and raw diagnostics in its own finished Stage, then restores an in-progress caller's binding. An unbound Command creates no Flow.

## How to get to it (user POV)

- An agent runs `bun "$(realpath skill://vstack-tmp/scripts/path.ts)" [<kind>]` when a skill needs Scratch.
- A user types `/vstack-clean [age]`. The extension runs `plugin/skills/vstack-tmp/scripts/clean.ts`, shows the dry-run table, and offers Apply all, Choose items, and Cancel. No agent turn runs. The default age is `90d`.

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
- Key. Make a throwaway repo with one worktree: `R="$VERIFY_RUN_DIR/data/keyrepo"; git init -q "$R/main" && git -C "$R/main" -c user.name=v -c user.email=v@v commit -q --allow-empty -m init && git -C "$R/main" worktree add -q "$R/wt"`. Run `bun "$CHECKOUT/plugin/skills/vstack-tmp/scripts/path.ts" --home "$V"` twice: once with the bash tool's `cwd` set to the absolute path of `$R/main`, and once with it set to that of `$R/wt`. Both print the same `$V/.vstack/tmp/main-<hex>/`. `main` is the main checkout's dir name, and `<hex>` is the first 6 characters that `printf %s "$(realpath "$R/main/.git")" | shasum -a 256` prints.

### Command dialogs through RPC

`drive.ts --ui-replies` answers the Command's `select` dialogs in order, as `../SKILL.md` Launch says. The Command needs no model request.

1. Initialize the isolated home and plugin link with `bun "$SKILL_DIR/scripts/drive.ts" --plugin "$CHECKOUT/plugin" --run "$VERIFY_RUN_DIR" --name clean-command-setup '{"type":"get_state"}'`.
2. Set `C="$VERIFY_RUN_DIR/data/home/.vstack/tmp/_global/verify"`. Create fixtures with `mkdir -p "$C/old-one" "$C/old-two" "$C/new-entry" && echo one > "$C/old-one/notes.txt" && echo two > "$C/old-two/notes.txt" && echo new > "$C/new-entry/notes.txt" && touch -t 202601010000 "$C/old-one/notes.txt" "$C/old-one" "$C/old-two/notes.txt" "$C/old-two"`.
3. Save `find "$C" -type f | sort` as `$VERIFY_RUN_DIR/clean-command-before.txt`.
4. Each step below is one drive. Write its UI replies to `$VERIFY_RUN_DIR/<drive>-ui.json`. Then run `bun "$SKILL_DIR/scripts/drive.ts" --plugin "$CHECKOUT/plugin" --run "$VERIFY_RUN_DIR" --name <drive> --ui-replies "$VERIFY_RUN_DIR/<drive>-ui.json" '{"type":"prompt","message":"/vstack-clean 14d"}'`. Exit 0, the prompt result is `completed` with `agentInvoked: false`, and `model_requests` is `0`. Read the last notification with `jq -r 'select(.type=="extension_ui_request" and .method=="notify") | .message' "$VERIFY_RUN_DIR/<drive>/rpc.jsonl" | tail -n 1`. Save `find "$C" -type f | sort` as `$VERIFY_RUN_DIR/<drive>-after.txt`.
5. Table, then Cancel. Drive `clean-command-cancel` with `[{"value":"Cancel"}]`. The first `notify` request is the dry-run table: `old-one` and `old-two` with their ages and sizes, then `Total: 2 entries, 8 bytes. Kept 1 entries.` The next `select` request has the title `Delete expired Scratch entries?` and the options `Apply all`, `Choose items`, and `Cancel`. The last notification is `Nothing deleted.`, and the listing equals the before listing.
6. Choose items, then Cancel. Drive `clean-command-choose-cancel` with `[{"value":"Choose items"},{"pick":"old-one"},{"value":"Cancel"}]`. `ui-responses.jsonl` shows the checklist `Choose Scratch entries to delete`, with one option per expired entry and then `Done` and `Cancel`. The last notification is `Nothing deleted.`, and all three files remain.
7. Choose items, then Done. Drive `clean-command-choose` with `[{"value":"Choose items"},{"pick":"old-one"},{"value":"Done"}]`. The last notification is `Deleted 1 entry; freed 4 bytes. Skipped 0 entries.` The listing holds only `old-two` and `new-entry`.
8. Apply all. Drive `clean-command-apply` with `[{"value":"Apply all"}]`. The last notification names one deleted entry. Only `new-entry` remains.

### Refusal without a UI

1. If this is a fresh run, initialize the isolated home with the `clean-command-setup` drive from Command dialogs step 1. Set `C="$VERIFY_RUN_DIR/data/home/.vstack/tmp/_global/verify"`. Restore the fixtures with `mkdir -p "$C/old-one" "$C/new-entry" && echo one > "$C/old-one/notes.txt" && echo new > "$C/new-entry/notes.txt" && touch -t 202601010000 "$C/old-one/notes.txt" "$C/old-one"`. Save `find "$C" -type f | sort` as `$VERIFY_RUN_DIR/clean-command-no-ui-before.txt`.
2. Run Doctor for this fresh session. Then run `bun "$SKILL_DIR/scripts/drive.ts" --plugin "$CHECKOUT/plugin" --run "$VERIFY_RUN_DIR" --name clean-command-no-ui --no-ui '{"type":"prompt","message":"/vstack-clean 14d"}'`. Capture stdout, stderr, and the exit code. The helper starts `omp --mode rpc --no-ui --no-session --no-title --model stub/stub-model`, so the extension context has no UI.
3. Save `find "$C" -type f | sort` as `$VERIFY_RUN_DIR/clean-command-no-ui-after.txt`. Compare it with the before listing using `diff -u`. Both fixture files must remain. Read `clean-command-no-ui/summary.json` and `clean-command-no-ui/rpc.jsonl`: the Command must complete with `agentInvoked: false`, zero model requests, and `ui_requests` of `0`, so no deletion dialog was shown.
4. The refusal is a displayed custom message, because `--no-ui` drops extension notifications. Run `jq -r 'select(.type=="message_end" and .message.customType=="vstack-clean") | .message.content' "$VERIFY_RUN_DIR/clean-command-no-ui/rpc.jsonl"`. It must print `/vstack-clean requires an interactive UI to confirm deletion. Nothing deleted.` Record the exact text. If it prints nothing, record a product finding: the no-UI refusal has no observable message. Unchanged files or a completed Command are not proof of the message. `--mode json --no-ui` is invalid and must not be used.

### Bound Flow outcome

Use the session-enabled drive with the stub's bash reply to run the checkout's `flow-page.ts open --skill implement --title "Cleanup proof" --agent main` before `/vstack-clean`. Keep both prompts in one drive so they share the session identity. Seed expired Scratch as above, then confirm Apply all. Observe `agentInvoked: false` for the Command and no extra model request for publication. Use `show --flow <receipt flow>` from that drive's project with its isolated `--home` to inspect a finished `vstack-clean` Stage and its Result. `bound --session <session id> --agent main` must still name the caller's Stage.

Open the live Flow URL in the browser. Select the cleanup Stage and read its outcome, preview JSON, deletion JSON, and exit codes. Capture the page and ARIA snapshot. Repeat with Cancel and without a UI; the Result must report no deletion and the files must remain. Run an unbound Command in another session and confirm `bound` is null and no Flow folder appeared. Keep the existing confirmation UI proof above.


## Gotchas

- The direct CLIs use the cwd's git repo key, or `_global` outside a repo. The Command scans all keys in its isolated home.
- An entry's age is its newest mtime, including descendants. Touch files first and the entry directory last. A Flow in the `flow` kind is the exception: its close time decides, and an open Flow is never listed.
- Never change your own session's `HOME`. Direct CLIs use `--home`. Only the isolated omp process gets a throwaway `HOME`.
- `--delete` needs absolute entry paths at `<repo-key>/<kind>/<entry>` depth. Other paths exit 2 before deletion.
- RPC proof must come from the linked checkout. The fake extension host and cleanup CLI prove different entry points.
- RPC `select` frames do not carry the checklist's check marks. The proof that a mark worked is what Done deletes. Only the omp TUI shows the marks.
- A dialog with no UI reply left is cancelled, so a missing reply looks like Cancel. Compare `ui_requests` in `summary.json` with the number of replies you wrote.
- Checklist labels hold the entry's age in days, which changes every day. Use `pick` with the entry name, not `value` with the whole label.

# Scratch dir

vstack skills write throwaway output to Scratch, `~/.vstack/tmp/<repo-key>/<kind>/<entry>`. The vstack-tmp path script prints and creates the Scratch dir for the current repo, or one kind dir in it. The vstack-clean script lists Scratch entries older than a TTL and deletes the ones the user picks.

## Sub-features

- `scratch-path` the path script prints `<home>/.vstack/tmp/<repo-key>/` or `<home>/.vstack/tmp/<repo-key>/<kind>/` with a trailing slash and creates it.
- `scratch-key` every worktree of one repo gets the same `<repo-key>`, the main checkout's dir name plus 6 hex chars.
- `scratch-bad-kind` a kind that is not one lowercase path segment exits 2 with a usage message and creates nothing.
- `clean-list` the list mode prints JSON with every entry older than the TTL and a `kept` count, and deletes nothing.
- `clean-delete` `--delete <path>...` deletes the named old entries and prints `deleted`, `skipped`, and `pruned`.

## How to get to it (user POV)

- An agent runs `bun "$(realpath skill://vstack-tmp/scripts/path.ts)" [<kind>]` when a skill tells it to write Scratch.
- A user runs `/skill:vstack-clean [age]`. The agent runs `clean.ts` in list mode, shows the table, asks, then runs it with `--delete`.

## Driving it with bash

Preconditions:

- The baseline from `README.md`.
- `V="$VERIFY_RUN_DIR/data/vhome"`. Every command passes `--home "$V"`, so nothing touches the real `~/.vstack/`.

- Path. With the bash tool's `cwd` set to `CHECKOUT`, run `bun plugin/skills/vstack-tmp/scripts/path.ts --home "$V" verify`. Exit 0, and stdout is `$V/.vstack/tmp/<repo-key>/verify/`. The dir exists.
- Bad kind. In the same `cwd`, run `bun plugin/skills/vstack-tmp/scripts/path.ts --home "$V" Bad/Kind; echo "exit=$?"`. stderr starts with `path.ts: kind must be one lowercase path segment`, and the output ends with `exit=2`.
- Seed two entries. In the same `cwd`, run `D=$(bun plugin/skills/vstack-tmp/scripts/path.ts --home "$V" verify)`, then `mkdir -p "${D}old-entry" "${D}new-entry" && echo old > "${D}old-entry/notes.md" && echo new > "${D}new-entry/notes.md" && touch -t 202601010000 "${D}old-entry/notes.md" "${D}old-entry"`.
- List. In the same `cwd`, run `bun plugin/skills/vstack-clean/scripts/clean.ts --home "$V" --older-than 14d | tee "$VERIFY_RUN_DIR/scratch-clean-list.json"`. Exit 0, `entries` holds only `old-entry` with `kind` `verify`, and `kept` is `1`.
- List deleted nothing. Run `find "$V/.vstack/tmp" -mindepth 3 -maxdepth 3 | tee "$VERIFY_RUN_DIR/scratch-after-list.txt"`. Both entries are there.
- Delete. In the same `cwd`, run `bun plugin/skills/vstack-clean/scripts/clean.ts --home "$V" --older-than 14d --delete "${D}old-entry" | tee "$VERIFY_RUN_DIR/scratch-clean-delete.json"`. Exit 0, and `deleted` holds the `old-entry` path.
- After delete. Run `find "$V/.vstack/tmp" -mindepth 3 -maxdepth 3 | tee "$VERIFY_RUN_DIR/scratch-after-delete.txt"`. Only `new-entry` is left.

## Gotchas

- Run both scripts with the cwd in `CHECKOUT`. The repo key comes from the cwd's git repo, and outside a repo it is `_global`.
- An entry's age is the newest mtime of the entry and of everything in it. Touch the files first and the entry dir last, or the dir's own mtime keeps the entry new.
- Never set `HOME` for these scripts. Use `--home`.
- `--delete` needs absolute entry paths at `<repo-key>/<kind>/<entry>` depth. Any other path exits 2 before it deletes anything.

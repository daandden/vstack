---
name: vstack-clean
description: Deletes expired vstack Scratch under ~/.vstack/tmp/ after a dry run and the user's confirmation. Run as /skill:vstack-clean [age].
disable-model-invocation: true
---

# vstack-clean

Deletes Scratch entries (`~/.vstack/tmp/<repo-key>/<kind>/<entry>`) older than the TTL. It never touches anything else under `~/.vstack/`, and nothing runs it on its own.

The TTL is 14 days. An age the user gives after the command (`7d`, `36h`, `2w`, or a bare number of days) replaces it for this run. Below, `<age>` is that age, or `14d`.

1. List. Run `bun "$(realpath skill://vstack-clean/scripts/clean.ts)" --home "$HOME" --older-than <age>` with the bash tool. It prints JSON. `entries` holds every entry older than the TTL, with `path`, `repo_key`, `kind`, `entry`, `age_days`, and `size` in bytes. `kept` counts the newer entries. An entry's age comes from the newest mtime anywhere in it, so a log that something still appends to never expires. If `entries` is empty, say that nothing has expired, give the `kept` count, and stop.
2. Show the dry run. Print one table with a row per entry: repo key, kind, entry, age in days, and size in KB, MB, or GB. Give the total size under it. Delete nothing yet.
3. Confirm. Call `ask` once with three options: Apply all (delete every listed entry), Choose items (pick the entries to delete), and Cancel (delete nothing). On Choose items, call `ask` again with `multi: true` and one option per entry; the entries left unpicked stay. An answer marked `timedOut: true` is not the user's: call `ask` once more, and if that times out too, stop without deleting and say why. On Cancel or an empty pick, stop.
4. Delete. Run `bun "$(realpath skill://vstack-clean/scripts/clean.ts)" --home "$HOME" --older-than <age> --delete <path>...` with the picked paths. It deletes without following symlinks, skips an entry that was written to since step 1, and removes the kind and key dirs it leaves empty.
5. Report. Give the number of entries deleted and the space freed, and list each skipped entry with its reason.

To keep an entry, leave it out at Choose items. There is no keep marker.

---
name: vstack-tmp
description: Resolve the project Scratch dir or create a marked Scratch folder for an omp session.
disable-model-invocation: true
---

# vstack-tmp

Scratch holds vstack output such as explanations, proof, and eval workspaces. Ordinary Scratch goes under `~/.vstack/tmp/<repo-key>/<kind>/<session-id>/`. Flows and to-tickets publication records have their own paths and can be read by later runs. The `/vstack-clean` Command opens the Tern popup. Outside Tern the Command deletes nothing.

## Get the dir

At the top level, run the path script with the bash tool from inside the repo the work is about. In a subagent, use the [explicit mode](#subagents) instead.

```sh
bun "$(realpath skill://vstack-tmp/scripts/path.ts)"
bun "$(realpath skill://vstack-tmp/scripts/path.ts)" <kind>
```

The script creates the directory and prints its absolute path with a trailing slash. With no kind it prints `~/.vstack/tmp/<repo-key>/`. An ordinary kind uses `PI_SESSION_ID` and prints `<repo-key>/<kind>/<session-id>/`. The script writes the mark and checks it before reusing a session folder. If the id is missing or invalid, the script exits 2 with a fix hint and creates no directories. It refuses an existing unmarked folder and leaves its contents alone.

- `<repo-key>` is the dir name of the main checkout plus the first 6 hex chars of a SHA-256 hash of the absolute git common dir. All worktrees of a repo get the same key. Outside a git repo the key is `_global`.
- Identity probes run synchronously with Git's stdout and stderr redirected to owned temporary files. Resolution reads those files after Git exits, independent of Bun's returned capture buffers, and closes and removes the temporary resources on success or failure.
- If Git cannot run, reports an operational failure, or returns invalid project identity output, identity resolution fails before selecting a Scratch or Flow namespace. `_global` is reserved for Git's genuine outside-repository result.
- An ordinary `<kind>` is one lowercase path segment. Use the kind your skill names, such as `explain`, `verify`, or `blast-radius`. No skill writes the historical `grilling` kind.
- Put each run's output inside its session folder. Open or unreadable historical Grilling pages stay protected. flow-page's `migrate` reads a historical source without changing it.
- flow-page's script writes the `flow` kind itself, with no path script run: one entry per Flow, named by its Flow id until `move` gives it another folder key. The `/vstack-clean` Command uses lifecycle retention, not file times. It never deletes an open Flow and offers a closed Flow after 15 days, or longer when the Command's age is longer. The Flow's data, page, and captured files expire together, and its bindings go with it. Identity, binding, and migration registries are metadata, not cleanup entries. A retained historical source cannot resurrect an expired migrated Flow. Unrelated Scratch kinds keep the newest-file rule.
- `to-tickets` is reserved. Its path command prints `<repo-key>/to-tickets/` without a session id. In Standard mode, to-tickets stores each batch's approved input and publication record in `<feature-slug>/` under that directory. `resume` can find the record from any session or worktree. Cleanup applies the newest-file rule and deletes the record only after confirmation (ADR 0066).

## Clean up

The popup offers one row per inactive omp session in each project. It uses the newest file across that session's Scratch and defaults to 15 days. Cleanup searches omp session archives for unmarked Scratch. If that archive evidence is missing or unreadable, cleanup withholds the affected project's session rows and unmarked folder rows. It also withholds rows that lack verified lease evidence. Flow and to-tickets rows use their own retention checks. Stray files directly under the `flow` kind stay protected.

For a CLI listing, run `bun "$(realpath skill://vstack-tmp/scripts/clean.ts)" --home "$HOME"`. Supply `--witness <session-id>` and, if different from `--home`, `--omp-home <dir>` to verify leases against a running omp session. Without verified lease evidence the script withholds dependent rows. Listing makes no changes to Scratch.

After the user confirms, pass the selected rows' `snapshot` strings to `--delete` with the same home and age. The script rebuilds each row before its first removal and reports deleted, skipped, and partly deleted rows separately. After an interruption, list again and get fresh confirmation from the user through the popup or through `ask`. In a Flow, follow `skill://flow-page`'s "Every ask in a Flow" contract. An agent never confirms on its own.

## Subagents

The top-level agent runs the script with no kind when a child needs Scratch. Pass the absolute project Scratch dir and your `PI_SESSION_ID` as the Scratch session id.

A subagent never uses the identity-resolving mode. To write Scratch, use the explicit mode with the dir and session id from the brief:

```sh
bun "$(realpath skill://vstack-tmp/scripts/path.ts)" --scratch-dir "$SCRATCH_DIR" --session-id "$PARENT_SESSION_ID" <kind>
```

The explicit mode resolves no repo identity and uses no session id from the environment. Put run-specific files or subfolders inside the marked folder it prints. Forward the dir and session id unchanged to any child that writes Scratch. If the brief omits either value, write no Scratch and return the missing value as an open question.

## Not Scratch

- A temp file that a script makes with `mktemp` and deletes itself.
- `~/.cache/vstack/upstreams/`, `local://` files, omp worktrees, and artifacts under the vstack root. They stay where they are.

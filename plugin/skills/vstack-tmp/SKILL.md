---
name: vstack-tmp
description: Where vstack writes Scratch. Its path script prints the project Scratch dir, or one kind dir in it, under ~/.vstack/tmp/.
disable-model-invocation: true
---

# vstack-tmp

Scratch is a vstack output that nothing reads after its run: an explanation page, proof evidence, an eval workspace, a hillclimb attempt log. It lives at `~/.vstack/tmp/<repo-key>/<kind>/<entry>` until the `/vstack-clean` Command deletes it. The Command runs `scripts/clean.ts` beside this skill.

## Get the dir

Run the path script with the bash tool from inside the repo the work is about:

```sh
bun "$(realpath skill://vstack-tmp/scripts/path.ts)"          # the project Scratch dir
bun "$(realpath skill://vstack-tmp/scripts/path.ts)" <kind>   # one kind dir in it
```

`bun` is an external program and never sees `skill://` paths, so `realpath` turns the URL into the file path first. The script creates the dir and prints its absolute path with a trailing slash, such as `/Users/me/.vstack/tmp/shop-3f9a1c/` or `/Users/me/.vstack/tmp/shop-3f9a1c/explain/`.

- `<repo-key>` is the dir name of the main checkout plus the first 6 hex chars of a SHA-256 hash of the absolute git common dir. All worktrees of a repo get the same key. Outside a git repo the key is `_global`.
- `<kind>` is one lowercase path segment. Use the kind your skill names: explain, verify, skill-creator, blast-radius, explorer, hillclimb, handoff, flow, how, teach, session, implement-spec, or vstack-figures. No skill writes the historical `grilling` kind any more.
- Put each run's output in its own entry in the kind dir: one file, or one dir when the run writes several files. The `/vstack-clean` Command normally deletes whole entries older than 90 days, using the newest file's time. A historical Grilling folder (`grilling/<project>-<key>/`) is one entry. Supported structured open historical pages are protected until explicitly migrated or closed. flow-page's `migrate` reads a historical source without changing it.
- flow-page's script writes the `flow` kind itself, with no path script run: one entry per Flow, named by its Flow id until `move` gives it another folder key. The `/vstack-clean` Command uses lifecycle retention, not file times. It never deletes an open Flow and offers a closed Flow after 90 days, or longer when the Command's age is longer. The Flow's data, page, and captured files expire together, and its bindings go with it. Identity, binding, and migration registries are metadata, not cleanup entries. A retained historical source cannot resurrect an expired migrated Flow. Unrelated Scratch kinds keep the newest-file rule.

## Subagents

- The top-level agent runs the script with no argument once. It puts the Scratch dir it printed in the prompt of every subagent that writes Scratch, the same way it passes the vstack root. It never passes a kind dir.
- A subagent never runs the script. It appends its own kind, writes only under `<Scratch dir>/<kind>/`, and creates that dir if it is missing (ADR 0007).

## Not Scratch

- A temp file that a script makes with `mktemp` and deletes itself.
- `~/.cache/vstack/upstreams/`, `local://` files, omp worktrees, and artifacts under the vstack root. They stay where they are.

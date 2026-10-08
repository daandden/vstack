---
name: vstack-tmp
description: Where vstack writes Scratch. Its path script prints the project Scratch dir, or one kind dir in it, under ~/.vstack/tmp/.
disable-model-invocation: true
---

# vstack-tmp

Scratch is a vstack output that nothing reads after its run: an explanation page, proof evidence, an eval workspace, a decision-trail log. It lives at `~/.vstack/tmp/<repo-key>/<kind>/<entry>` until `/skill:vstack-clean` deletes it.

## Get the dir

Run the path script from inside the repo the work is about:

```sh
bun skill://vstack-tmp/scripts/path.ts          # the project Scratch dir
bun skill://vstack-tmp/scripts/path.ts <kind>   # one kind dir in it
```

It creates the dir and prints its absolute path with a trailing slash, such as `/Users/me/.vstack/tmp/shop-3f9a1c/` or `/Users/me/.vstack/tmp/shop-3f9a1c/explain/`.

- `<repo-key>` is the dir name of the main checkout plus the first 6 hex chars of a SHA-256 hash of the absolute git common dir. All worktrees of a repo get the same key. Outside a git repo the key is `_global`.
- `<kind>` is one lowercase path segment. Use the kind your skill names: explain, verify, skill-creator, blast-radius, explorer, decision-trail, architecture-review, handoff, grilling, how, or teach.
- Put each run's output in its own entry in the kind dir: one file, or one dir when the run writes several files. vstack-clean deletes whole entries, and it judges an entry's age by the newest file in it.

## Subagents

- The top-level agent runs the script with no argument once. It puts the Scratch dir it printed in the prompt of every subagent that writes Scratch, the same way it passes the vstack root. It never passes a kind dir.
- A subagent never runs the script. It appends its own kind, writes only under `<Scratch dir>/<kind>/`, and creates that dir if it is missing (ADR 0007).

## Not Scratch

- A temp file that a script makes with `mktemp` and deletes itself.
- `~/.cache/vstack/upstreams/`, `local://` files, omp worktrees, and artifacts under the vstack root. They stay where they are.

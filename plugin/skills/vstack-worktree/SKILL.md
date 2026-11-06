---
name: vstack-worktree
description: Open and remove vstack checkouts through ovnfs, with an omp wt fallback when an installed ovnfs fails.
disable-model-invocation: true
---

# vstack-worktree

Every separate checkout vstack makes goes through `scripts/worktree.ts`. The script uses ovnfs on PATH or at omp's `ovnfs.path`. Without ovnfs it stops and points at `/skill:setup-vstack`. Only a failed `ovnfs new` permits the `omp wt add` fallback (ADR 0058).

omp owns isolated subagent checkouts and PR checkouts created by its GitHub tool. For the user's own session, use `/wt`. To inventory leftovers, use `/skill:clean-wt`.

## Open a checkout

Choose a purpose slug and a new absolute record path in the run's Scratch entry, outside the checkout. A prototype that must survive sessions keeps the record with its artifacts instead. Run the script from the source repo with one revision selection:

```sh
bun "$(realpath skill://vstack-worktree/scripts/worktree.ts)" open --repo <source-repo> --purpose <slug> --commit <commit> --record <record.json>
bun "$(realpath skill://vstack-worktree/scripts/worktree.ts)" open --repo <source-repo> --purpose <slug> --new-branch <branch> --ref <start> --record <record.json>
bun "$(realpath skill://vstack-worktree/scripts/worktree.ts)" open --repo <source-repo> --purpose <slug> --branch <existing-branch> --record <record.json>
```

`--new-branch` defaults its start to HEAD. It creates the branch without moving the source checkout. `--commit` opens a detached checkout through `ovnfs new --rev`, with that commit's tracked files and the source's ignored build inputs. Checkout names have a unique suffix, so concurrent runs do not share paths. An existing record or new-branch collision is refused.

Each command prints one JSON record and saves it at `--record`. Use its `path`, not a computed path. The record includes:

- `repo`, `purpose`, `name`, and `path` identify the checkout and its source.
- `backend` is `ovnfs` or `omp-wt`.
- `fallback` is true only after `ovnfs new` fails. `fallbackReason` contains that failure, or null without fallback.
- `cloned` is null for ovnfs. For `omp-wt`, true means omp printed its `Cloned from ... via ...` signal. False means a plain checkout with tracked files only.
- `branch` is null for a detached checkout. `branchCreated` says whether this open created the source branch.
- `removed` is false after open and true after successful removal.

A failed command exits 2 and prints one JSON object with `error`. Report that failure instead of using the source checkout. Keep the record until cleanup succeeds.

## Handle a fallback

The fallback uses `$OMP_WORKTREE_DIR`, else omp's `worktree.base`, else `~/.omp/wt`. Report `fallbackReason`. Only the fallback can be a plain checkout. The calling skill decides whether tracked files alone are enough.

If ignored or excluded inputs are required and `backend` is `omp-wt` with `cloned: false`, remove the checkout through the script, stop, and name `worktree.clone` and `/skill:setup-vstack`. Otherwise use the checkout under the caller's existing dependency rules.

## Remove a checkout

Run this on every completion and early stop, except a prototype deliberately retained until its verdict:

```sh
bun "$(realpath skill://vstack-worktree/scripts/worktree.ts)" remove --record <record.json>
```

The script uses `ovnfs rm` for ovnfs and `git worktree remove --force` for the fallback. It deletes a branch only when this open created it. Keep and report a removal failure. Opening a checkout starts no session-bound process, so its path and record remain usable across sessions until removal.

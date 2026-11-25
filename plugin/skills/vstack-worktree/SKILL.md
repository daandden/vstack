---
name: vstack-worktree
description: Open and remove vstack checkouts through ovnfs, with an omp wt fallback when an installed ovnfs fails.
disable-model-invocation: true
---

# vstack-worktree

Every separate checkout vstack makes goes through `scripts/worktree.ts`. The script uses omp's configured `ovnfs.path`, or PATH when unset. A missing or invalid executable stops at `/skill:setup-vstack`. A failed `ovnfs new` permits the `omp wt add` fallback only for a source outside ovnfs. An ovnfs source never falls back to a checkout that could share its private Git directory (ADR 0059).

omp owns isolated subagent checkouts and PR checkouts created by its GitHub tool. For the user's own session, use `/wt`. To inventory leftovers, use `/skill:clean-wt`.

## Open a checkout

Choose a purpose slug and a new absolute record path in the caller's marked Scratch session folder, outside the checkout. A prototype that must survive sessions keeps the record with its artifacts instead. Run the script from the source repo with one revision selection:

```sh
bun "$(realpath skill://vstack-worktree/scripts/worktree.ts)" open --repo <source-repo> --purpose <slug> --commit <commit> --record <record.json>
bun "$(realpath skill://vstack-worktree/scripts/worktree.ts)" open --repo <source-repo> --purpose <slug> --new-branch <branch> --ref <start> --record <record.json>
bun "$(realpath skill://vstack-worktree/scripts/worktree.ts)" open --repo <source-repo> --purpose <slug> --branch <existing-branch> --record <record.json>
```

`--new-branch` defaults its start to HEAD. It creates the branch without moving the source checkout. `--commit` opens an independent checkout through `ovnfs new`, then forces and validates the requested detached revision while keeping ignored build inputs. This also works when the source is an ovnfs checkout. Names are lowercase, backend-valid, and at most 64 characters, including a unique suffix. An existing record or new-branch collision is refused.

For independent verification, add `--inputs <absolute inputs.json>` to `open --commit`. The file contains a JSON array of required relative untracked runtime paths, or `[]`. This mode removes all other carried untracked files, including ignored caches, and records the declaration as `inputs`. It preserves the requested committed source and declared dependencies without changing the source checkout. Declare a directory or symlink itself, not a path beneath a symlink. Inputs that overlap committed source, missing inputs, nested repositories outside the declaration, and a plain fallback refuse preparation. A missing input names the path and adds omp clone setup advice only for the `omp-wt` fallback. Ordinary opens without `--inputs` keep their existing carried-input behavior. The Verifier still runs ship's `prepare-verifier.ts clean-head` after construction to refuse hidden undeclared source or altered tracked bytes.

Each command prints one JSON record and saves it at `--record`. Use its `path`, not a computed path. The record includes:

- `repo`, `purpose`, `name`, and `path` identify the checkout and its source.
- `backend` is `ovnfs` or `omp-wt`.
- `fallback` is true only after `ovnfs new` fails. `fallbackReason` contains that failure, or null without fallback.
- `cloned` is null for ovnfs. For `omp-wt`, true means omp printed its `Cloned from ... via ...` signal. False means a plain checkout with tracked files only.
- `branch` is null for a detached checkout. `branchCreated` says whether this open created the source branch.
- `removed` is false after open and true after successful removal.

A failed command exits 2 and prints one JSON object with `error`. If open fails after creating a checkout, it removes that checkout and any source branch it created. Its `cleanup` object reports their identities, removal outcomes, and errors. Report any cleanup failure with those identities instead of using the source checkout. Keep a successful open's record until removal succeeds.

## Handle a fallback

The fallback uses `$OMP_WORKTREE_DIR`, else omp's `worktree.base`, else `~/.omp/wt`. Report `fallbackReason`. Only the fallback can be a plain checkout. The calling skill decides whether tracked files alone are enough.

If ignored or excluded inputs are required and `backend` is `omp-wt` with `cloned: false`, remove the checkout through the script, stop, and name `worktree.clone` and `/skill:setup-vstack`. Otherwise use the checkout under the caller's existing dependency rules.

## Remove a checkout

Run this on every completion and early stop, except a prototype deliberately retained until its verdict:

```sh
bun "$(realpath skill://vstack-worktree/scripts/worktree.ts)" remove --record <record.json>
```

The script uses `ovnfs rm` for ovnfs and `git worktree remove --force` for the fallback. It deletes a branch only when this open created it. Keep and report a removal failure. Opening a checkout starts no session-bound process, so its path and record remain usable across sessions until removal.

If ovnfs refuses because the checkout has unsaved commits, treat the refusal as a guard. Keep the checkout record and report the reason. Save the commits under the calling skill's rules. If the caller proposes `ovnfs rm --force`, `ovnfs land`, or `ovnfs apply`, present each applicable action and its consequences. Run only the action the user picks through `ask`. In a Flow, follow skill://flow-page's "Every ask in a Flow", including CLI publication before the picker and separate answer recording. A subagent returns the question to its caller. Without the user's pick, leave the checkout and branch in place.

# Vstack

A pinned, generated skill stack for Oh My Pi. The delivered foundation ([#13](https://github.com/daandden/vstack/issues/13)) includes source generation, installation, the full disposition inventory, and one complete retained skill, `wizard`. Explicit upstream sync and whole-transition approval ([#15](https://github.com/daandden/vstack/issues/15)) are available through the public CLI. Other retained families remain assigned to their implementation tickets, not installed as placeholders. See [source dispositions](docs/source-dispositions.md).

## Build and install

Requires Git, tar, Bun 1.3.14 or newer, and OMP (verified with 18.2.8). Initial generation needs access to the two upstream Git repositories. Subsequent builds use local cached objects without polling upstream.

```sh
bun install --frozen-lockfile
bun run build
bun run install:workspace /absolute/path/to/your/workspace
cd /absolute/path/to/your/workspace
omp
```

Installation writes an absolute `skills.customDirectories` pointer into the workspace's `.omp/config.yml`. No launch wrapper or `--config` argument is needed. It preserves other setting values and existing custom directories, putting vstack first for its approved names. YAML formatting/comments are not retained. Linked config files are rejected rather than overwritten. No global config, model binding, or unrelated skill is changed. Choose the workspace deliberately; installation is an explicit local config edit.

In OMP, invoke `/skill:wizard`, or ask for a manual-setup wizard. Its supporting template resolves through `skill://wizard/template.sh`. OMP's standalone `omp read` command is not the acceptance surface for project custom-directory discovery; use a launched session. Model configuration belongs to #14, not this installer.

The installed pointer follows later successful local regeneration. If this repository moves, rerun installation from its new location and remove the obsolete directory pointer from workspace config. To uninstall, remove only this repository's pointer from `skills.customDirectories`; leave unrelated entries intact.

## Source and overlay contract

- `config/sources.lock.json` records URLs, accepted tag or approved SHA, full commits, exact allowlists, licenses, active patches, and installed skill selections. Pstack's initial pin was explicitly approved by the user during this implementation.
- `vendor/<id>/<sha>/` is a regenerable pristine mirror of the allowed pinned files, not an editable skill tree. Git object caches live under `.cache/`. Both are ignored; reproducibility comes from the committed pins, not machine-specific caches. Cached builds use the accepted SHA and never check remote tags.
- `overlays/<source>/*.patch` contains minimal patches against source-root paths. The wizard overlay supplies native OMP tool/resource references and explicit publication permissions. Its upstream description and supporting template are unchanged.
- Complete new vstack skills, when approved, belong under `overlays/additions/`, with entries in the lock's `additions` list. Do not copy modified upstream trees there.
- `generated/releases/<digest>/` contains the flat `skills/` tree, upstream licenses, and provenance. `generated/current` points to the last completed release. Never hand-edit releases. Preparation and patch failures leave that pointer unchanged; modified mirrors/releases cause an error instead of overwriting local work. Old releases are retained rather than automatically deleted.

Only installed selections become discoverable. Source mirrors and research are not added to OMP discovery. Complete selected directories are copied, including references, executable resources, and Codex UI metadata. Explicit-only Codex invocation policy requires an OMP frontmatter overlay before activation; Codex metadata never selects a model.

Changing pins or selections is a source transition, not routine regeneration. Existing direct build/install commands remain available. A Git-clean patch is not a behavioral review. Preserve local changes outside generated/vendor paths before rebuilding; do not discard unexpected edits to make generation pass.

## Explicit upstream sync

Run from this repository, after building the accepted stack:

```sh
bun scripts/stack.ts sync prepare matt
bun scripts/stack.ts sync prepare pstack <full-40-character-sha>
bun scripts/stack.ts sync show <candidate-id>
bun scripts/stack.ts sync approve <candidate-id> <decision.json>
bun scripts/stack.ts sync activate <candidate-id>
```

Choose one source to prepare; these are command forms, not an unattended update script. Matt selection uses stable full SemVer tags with a consistent prefix, excludes prereleases, and rejects ambiguous highest equal-precedence tags. Pstack SHA nomination is not approval: activation requires an explicit decision. Only no-source-tree-change or narrowly verified existing non-executable Codex UI metadata transitions can omit approval; unknown, mixed, new-skill, moved-tag, and affected-patch transitions require whole-transition approval. Even automatic-eligible candidates need an explicit `activate`.

The [sync workflow](docs/sync-workflow.md) explains candidate inspection, exact decision fields, human semantic review, behavioral evidence, and recovery. Preparation and approval do not change the active stack. Activation revalidates the candidate before updating the accepted lock and local release pointer. Changed candidates need fresh preparation and approval; activating another source makes an older candidate stale. Sync never commits, pushes, opens a PR, or grants publication permission. Maintainers commit the dated sync record with the accepted lock.

## Verification

```sh
bun run build                 # populate pinned source caches first
bun run typecheck
bun test tests/installation.test.ts
bun test tests/sync.test.ts
bun test
```

The deterministic regression uses the public build/install CLI, corrupts a candidate patch, and launches real OMP in a disposable workspace. It checks continued discovery and preservation of unrelated user work. It needs `omp` on PATH and an OMP installation able to start RPC without a model turn. Cached upstream objects make regeneration independent of network timing.

`bunfig.toml` limits test discovery to `tests/`; vendored upstream suites are not part of vstack's regression suite.

[Installation verification](docs/verification/issue-13.md) covers wizard invocation and its supporting resource. [Sync verification](docs/verification/issue-15.md) records deterministic transition scenarios and live model reads of the old stack while approval was pending and the new stack after activation. OMP discovery checks do not establish semantic compatibility. Other workflow families, model entitlement, watchers, and panel isolation are not claimed as verified here.

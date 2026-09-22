# Vstack

A pinned, generated skill stack for Oh My Pi. This delivery implements [#13](https://github.com/daandden/vstack/issues/13): source generation, installation, the full disposition inventory, and one complete retained skill, `wizard`. Other retained families remain assigned to their implementation tickets, not installed as placeholders. See [source dispositions](docs/source-dispositions.md).

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
- `vendor/<source>/` is a regenerable pristine mirror of the allowed pinned files, not an editable skill tree. Git object caches live under `.cache/`. Both are ignored; reproducibility comes from the committed pins, not machine-specific caches.
- `overlays/<source>/*.patch` contains minimal patches against source-root paths. The wizard overlay supplies native OMP tool/resource references and explicit publication permissions. Its upstream description and supporting template are unchanged.
- Complete new vstack skills, when approved, belong under `overlays/additions/`, with entries in the lock's `additions` list. Do not copy modified upstream trees there.
- `generated/releases/<digest>/` contains the flat `skills/` tree, upstream licenses, and provenance. `generated/current` points to the last completed release. Never hand-edit releases. Preparation and patch failures leave that pointer unchanged; modified mirrors/releases cause an error instead of overwriting local work. Old releases are retained rather than automatically deleted.

Only installed selections become discoverable. Source mirrors and research are not added to OMP discovery. Complete selected directories are copied, including references, executable resources, and Codex UI metadata. Explicit-only Codex invocation policy requires an OMP frontmatter overlay before activation; Codex metadata never selects a model.

Changing pins or selections is a source transition, not routine regeneration. Follow #15's separately owned approval/sync workflow when delivered. This CLI does not implement upstream update selection or imply that a Git-clean patch is a behavioral review. Preserve local changes outside generated/vendor paths before rebuilding; do not discard unexpected edits to make generation pass.

## Verification

```sh
bun run build                 # populate pinned source caches first
bun run typecheck
bun test tests/installation.test.ts
bun test
```

The deterministic regression uses the public build/install CLI, corrupts a candidate patch, and launches real OMP in a disposable workspace. It checks continued discovery and preservation of unrelated user work. It needs `omp` on PATH and an OMP installation able to start RPC without a model turn. Cached upstream objects make regeneration independent of network timing.

`bunfig.toml` limits test discovery to `tests/`; vendored upstream suites are not part of vstack's regression suite.

[Verification record](docs/verification/issue-13.md) covers the live model-driven invocation and supporting-resource exercise. Workflow families, model entitlement, upstream update approval, watchers, and panel isolation owned by later tickets are not claimed as verified here.

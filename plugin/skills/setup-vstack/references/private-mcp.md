# Share Private MCP configuration

Use this procedure only in Private mode, before the complete-config shortcut or after writing the first `<vstack_root>/config/` directory. Standard mode and user-level MCP configuration stay unchanged.

Run the helper from the repository checkout:

```sh
bun "$(realpath skill://setup-vstack/scripts/private-mcp.ts)" plan
bun "$(realpath skill://setup-vstack/scripts/private-mcp.ts)" apply --plan <run entry>/mcp-plan.json [--choices <run entry>/mcp-choices.json]
```

## Reconcile the main and shared files

1. Save `plan`'s JSON as `<run entry>/mcp-plan.json`. The plan changes no repository configuration. It names the main checkout's `.omp/mcp.json`, the canonical `<common_dir>/vstack/mcp/mcp.json`, input fingerprints, conflicting JSON pointers, hook ownership, and the creator-selected Git's executable, version, and capability.
2. Report an unsupported Git as incomplete. The inspected creator environment needs configuration-hook-capable Git, available upstream from 2.54. The helper probes a real configuration hook in a disposable repository, not just `git hook run` or acceptance of unknown config keys. Leave machine-wide Git selection unchanged. A later creator PATH change needs a fresh check.
3. On invalid JSON, a tracked destination, a foreign link, or an unowned or changed hook definition, report the prerequisite and stop this procedure. Preserve the source files and hook settings. The MCP link also needs effective Git exclusion. If higher-priority repository rules re-include it, settle that prerequisite separately. Do not change tracked ignores, remove a tracked file from the index, or redirect another hook to make setup pass.
4. When `conflicts` is nonempty, present the affected JSON pointers and source paths without credential values. Use `ask` under the setup run's Flow question contract. Offer Main configuration, Shared configuration, and Leave unresolved for each conflict, with no recommended winner. The user can inspect the values locally. Never put raw MCP configuration or credentials in a Flow, transcript, or published decision context.
5. Record each settled choice in `<run entry>/mcp-choices.json`, an object mapping the plan's exact JSON pointer to `"main"` or `"shared"`. For example, `{"/mcpServers/example/args":"main"}` selects that value, not the whole file. An unanswered or declined conflict leaves setup incomplete. Do not apply it.
6. Run `apply` with the saved plan and, for conflicts, the choices file. The helper reconciles the captured, fingerprint-validated bytes and rechecks for drift after Git prerequisites, before replacement. A changed input requires a new plan and choices for that configuration. Never retry with a rewritten fingerprint. With no conflicts, omit `--choices`.
7. Retain the apply receipt's `backups` paths. These are byte-for-byte originals under `<common_dir>/vstack/mcp/`, made before replacing a source. Existing unchanged files remain recoverable in place. Keep originals private. The receipt reports the canonical file, not its values.
8. Run `project.ts state` again. Continue only when `private_mcp.pending` is false. Include an unresolved prerequisite or failed apply in the setup Result, never a complete-setup claim.

The helper preserves disjoint servers and unfamiliar fields from both raw JSON objects, including numbers beyond JavaScript's exact integer range. Numerically equivalent forms such as `1.0` and `1e0` do not conflict. Arrays keep their selected order and literal environment or secret references stay literal. It installs an absolute main-checkout link, adds only `/.omp/mcp.json` to repository-local `info/exclude`, and registers only its owned `hook.vstack-private-mcp` configuration hook. It checks effective exclusion before installing a link and when reporting completion. Unrelated exclusions, hooks, `core.hooksPath`, tracked ignore files, and global Git settings stay unchanged.

If preflight fails, the helper restores previous local exclusion bytes only while the path still has the same file identity and candidate bytes that this apply wrote. It preserves an independent edit, deletion, or replacement and reports that rollback no longer owns the path. In that case the narrow MCP exclusion may remain beside the independent edit. Inspect `info/exclude` and resolve the reported prerequisite before rerunning setup.

## Future worktrees and editing

The checkout hook installs or verifies that absolute link only in eligible future linked worktrees. It checks each worktree's effective exclusion first, because a branch's tracked ignore rules can override the shared local exclusion. An ineffective exclusion causes a visible refusal, without installing a link or editing those rules. It records the Git-directory identities of checkouts present at first setup and leaves them unchanged, even when their config is missing. Rerunning setup does not expand that exclusion. Reusing an old checkout path does not exclude a genuinely new worktree.

Outside the selected main-file reconciliation, a regular MCP file or foreign-target link is a conflict, not permission to merge or overwrite it. Hook failures remain observable. A creator such as omp can report failure after materializing the worktree. Preserve that checkout and its configuration for inspection, rather than deleting it or suppressing the failure.

Edit the canonical file reported by the helper, `<common_dir>/vstack/mcp/mcp.json`, then run `/mcp reload` in each session that needs the change. A write through an existing symlink reaches that same file only when the writer preserves the link. Editors that replace the pathname can break sharing.

Native project-scoped MCP add, removal, enable, and disable mutations are outside this guarantee. The inspected omp 18.18.8 writer renames a temporary regular file over `.omp/mcp.json` without resolving the link. Use canonical-file editing instead. Recheck setup after changing the creator's Git environment or finding a replaced project link. Existing worktree configurations are not migrated by this procedure.

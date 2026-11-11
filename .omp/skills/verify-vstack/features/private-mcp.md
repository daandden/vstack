# Private MCP setup

Private mode reconciles native project MCP JSON into one private shared file, links the main checkout and eligible future worktrees, and preserves conflicts and existing hooks. Standard mode and user-level MCP configuration stay unchanged.

## Sub-features

- `private-mcp-reconcile`: fresh setup, disjoint raw JSON, exact numeric values and equivalent numeric forms, explicit per-value conflicts, literal references, exact-byte originals, unanswered choices, invalid inputs, and drift during actual Git prerequisites.
- `private-mcp-state`: pending MCP work remains visible with complete Markdown configuration and after effective exclusion changes.
- `private-mcp-exclusions`: failed preflight restores exact prior bytes when its candidate is unchanged, but preserves an independent append, deletion, same-content file replacement, or foreign symlink and reports pending setup.
- `private-mcp-hooks`: real named-hook dispatch, existing hook coexistence, conservative ownership, old checkout exclusion, path reuse, tracked-destination refusal, effective exclusion under branch-specific ignore rules, and repeated no-ops.
- `private-mcp-creator`: creator-selected Git identity and configuration-hook capability, with an incomplete result for unsupported Git.
- `private-mcp-clone`: actual ignored-file-cloned omp creation, absolute link inspection, shared-value edits, and a preserved regular-file conflict with an observable hook failure.

## How to get to it (user POV)

- Run `/skill:setup-vstack` and select Private mode, or rerun it in an existing Private repository.
- The skill uses `plugin/skills/setup-vstack/scripts/private-mcp.ts plan` and `apply --plan <plan.json> [--choices <choices.json>]`.
- Create future worktrees with `omp worktree add <path> --branch <branch>` on configuration-hook-capable Git.
- Edit the canonical shared JSON file and run `/mcp reload`. Native project MCP mutations are outside the symlink-sharing guarantee.

## Driving it with isolated CLI fixtures

Preconditions: `bun`, `omp`, and configuration-hook-capable Git 2.54 or later are on the creator's PATH. Use a supplied checkout and a new evidence directory. No credentials or network are needed. The tests check successful Git prerequisites explicitly and use a deterministic unsupported executable boundary. They initialize repositories with an empty Git template instead of depending on installation-template files.

1. Run the production-process tests from `CHECKOUT`:

   ```sh
   bun test --timeout 30000 tests/setup-vstack-private-mcp.test.ts tests/setup-vstack-project.test.ts
   ```

   They create and remove disposable repositories and homes. Inspect the resulting JSON, backups, absolute symlinks, local exclusion bytes, actual installed-hook execution, and exit codes. A clean test run covers the reconciliation and hook cases above, not omp's cloning implementation or the model's consent reasoning.

2. Run the real omp helper against the supplied checkout:

   ```sh
   bun "$SKILL_DIR/scripts/private-mcp.ts" "$CHECKOUT" "$VERIFY_RUN_DIR/private-mcp-clone"
   ```

   The helper enables ignored-file cloning only in its disposable HOME, creates a disposable repository, installs the production hook, and calls the real `omp worktree add`. On macOS it separately records `/usr/bin/git`'s actual identity and capability. When that Git is unsupported, it requires an incomplete apply with no configuration writes. It does not assume Apple Git is always unsupported. Require `summary.json` to have `ok: true`. Require the captured `Cloned from ... via ...` output. A plain-checkout fallback fails this proof.

3. Read the numbered command records and `summary.json`. They retain each command, cwd, stdout, stderr, exit code, creator versions, main and cloned link identities, absolute targets, shared edits observed through both links, and the conflict's preserved bytes and checkout. The unrelated fixture hook creates that conflict before the owned hook runs. The expected native failure status is 2 with the inspected omp version. The helper deletes only its own disposable HOME and repositories after retaining proof.

4. Preserve failed attempts and use a new evidence directory for another drive. If any command first reaches 180 seconds, stop further use of that seam and return its exact command and evidence for Costly seam approval.

## Gotchas

- Run the helper from the checkout under test, never through the session's installed `skill://` resolution.
- Do not run its setup commands in a real user repository or modify real MCP settings, global Git settings, or hooks.
- The main checkout's MCP file must become the absolute link before ignored-file cloning. A copied regular file is not a shared configuration.
- A local exclusion line is not proof of effective exclusion. Setup, state, and eligible-worktree hooks must detect higher-priority re-inclusion. Refuse rather than changing tracked ignore files or installing an unignored private link.
- Existing worktree MCP files, including missing files, are not migrated. A new worktree at an old path is different from the old Git-directory identity.
- A successful fresh plugin load proves packaging only. It does not prove reconciliation, coexistence, cloning, or consent.

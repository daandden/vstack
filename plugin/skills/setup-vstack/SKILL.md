---
name: setup-vstack
description: Check this machine's omp settings for vstack, then configure this repo for the vstack skills (its issue tracker, triage label vocabulary, and domain doc layout) in Standard or Private mode. Run once before first use of the other vstack skills.
disable-model-invocation: true
---

# Setup vstack

Two parts, in this order. The machine section checks the omp settings vstack needs. The project section writes this repo's vstack config:

- Issue tracker: where issues live (GitHub by default; local markdown also works out of the box).
- Triage labels: the strings used for the five canonical triage roles.
- Domain docs: where `GLOSSARY.md` and ADRs live, and the rules for reading them.

This is a prompt-driven skill with helper scripts. Explore, present what you found, settle each choice through `ask`, then write.

Every question to the user goes through `ask`. An answer marked `timedOut: true` is not the user's: put a gate to the user once more with `ask`, and if that times out too, stop without acting and say why.

Run the scripts with the bash tool, from inside the repo when there is one:

```sh
bun "$(realpath skill://setup-vstack/scripts/machine.ts)" <args>
bun "$(realpath skill://setup-vstack/scripts/project.ts)" <args>
bun "$(realpath skill://setup-vstack/scripts/migrate.ts)" <args>
```

Below, `machine.ts`, `project.ts`, and `migrate.ts` stand for these commands.

## Machine section

0. Confirm the machine scan roots through `ask`. Offer Scan my home (Recommended), with the absolute `$HOME` path, and Use other roots. Collect the other absolute paths through the Other answer. The scan prunes `node_modules`, `.venv`, and `Library` and never follows directory symlinks. A checkout outside these roots cannot be found, even when its separate git dir is inside them. Keep these confirmed roots for this run. Pass one `--scan-root <absolute path>` per root to every check and Migration command below.
1. Look at your own tool list. The vstack extension registers `vstack_rename_session` when a session starts, so that tool is there only when the extension loaded in this session.
2. Run `machine.ts --extension-loaded yes --scan-root <root>...` when `vstack_rename_session` is there, else use `--extension-loaded no`. It checks:
   - 1, TypeSafe credentials exist.
   - 2, `modelRoles.judge` is `typesafe/jev-latest`.
   - 3, `task.agentModelOverrides` has no key for a vstack agent. This one only warns.
   - 4, the vstack extension is enabled and loaded in this session. When `disabledExtensions` lists it, a new session alone does not load it, so the remedy removes it from the list first. When it is enabled but not loaded (for example, just after linking or pulling), the remedy is a new session.
   - 5, eval Python is ready: `eval.py` is on and `omp setup python --check` passes. This one only warns.
   - 6, no Matt leftovers. It resolves every `.git` entry to its common dir and deduplicates them, including linked worktrees, submodules, and separate git dirs. It also finds the Matt-sourced skills in the skills CLI lock, diagram-design and good-css copies, global rule hits, and the old profile library.
   - 7, `task.isolation.enabled` is on (ADR 0007). Skills that need an isolated subagent stop without it.
   - 8, `worktree.clone` is on. In Private mode, prototype mounts app-bound prototypes in an `omp wt add` clone and stops on a plain checkout.

   When every check passes, it prints one `OK` line. Otherwise it prints one line per check that does not pass: `FAIL <n> <name>: <what is wrong>. Remedy: <what fixes it>.`, or `WARN` in place of `FAIL` for checks 3 and 5. Exit 0 means no `FAIL` line, 1 means at least one, and 2 means the script did not run: show its message and go on to the project section.
3. Show the output to the user as it is.
4. The settings writer fixes only checks 2, 7, and 8, with the user's approval. For each failed setting, call one `ask` with Set it (Recommended) and Leave it. Then run `machine.ts --set <name>...` with only the approved names: `judge` for 2, `isolation` for 7, `clone` for 8. It uses `omp config set` and preserves the other judge roles. Never change omp settings any other way. Run step 2 again and show its output.
5. Leave checks 1, 3, 4, and 5 to the user. TypeSafe credentials come from `/login typesafe`, which only the user can run. The extension needs a new session. Done repeats every line still failing.
6. If check 6 fails, run the machine Migration below. If it passes, go on to the project section.

### Machine Migration

1. Run `migrate.ts plan --scan-root <root>...`. It reads machine state and prints JSON without changing it. If `scan_errors` is not empty, show every path and error. Stop the Migration until the scan covers every confirmed root.
2. Show one plan with all `items`, their ids, moves, diffs, removals, and destructive flags. Name the roots and the pruned directories. List `standard_projects` as "migrates when you run setup-vstack there". Change none of those projects in the machine part.
3. Include every notice in the plan. State the downgrade from Matt `main` to the Base Pin `v1.2.3`. The skills removal runs `npx --yes skills@1.7.0 remove -g <names> -y`. It removes CLI copies, lock entries, and agent links. Other harnesses also lose those copies. Non-Matt skills stay, except the diagram-design and good-css copies that vstack replaces. The command fetches that CLI if it is not cached.
4. Explain that private moves are mandatory. Each common dir gets one move, with its hand edits and unknown directories kept. The script renames `docs-agents` to `config` and removes old-storage `docs/agents` symlinks and their exclude line. It creates no compatibility symlink. Outside links to old artifacts break. Relative path rows run only when the common dir is this repo's `.git`. Profiles move without a compatibility link too. The old private rule is a mandatory removal, only after every private and profile move succeeds.
5. For every `manual_hits` entry, read the file and propose a diff before confirmation. Use the known common dir for non-ordinary relative paths. Bare storage words need a context-specific edit, not a global substitution. Add those proposed diffs to this same plan. Keep filename changes for the project Migration.
6. Call `ask` once for the machine plan with Apply all (Recommended), Choose items, and Cancel. On Choose items, use one multi-select `ask` for optional item ids only. Keep every mandatory item selected. A user cannot deselect a private move. On Cancel, cancel the whole machine Migration, including skill removals, rule edits, profiles, and old-rule deletion. Change nothing from the plan and stop this skill.
7. Save the script's original plan JSON under the Scratch dir from `skill://vstack-tmp`. Run `migrate.ts apply --plan <absolute plan path>`. For Choose items, add one `--skip <id>` per unselected optional item. The script refuses a stale plan or a skipped mandatory item before it writes anything. If it reports changed state, show the new plan through `ask` before acting.
8. Apply each approved manual diff only after its parent move succeeds. Use the new `after_path` for a moved file. Leave declined manual edits as remaining hits. Show `applied`, `skipped`, `warnings`, `failures`, and `manual_hits`. Skill removal failures warn because the plugin shadows the old copies. Private or profile move failures leave the old rule in place and the Migration incomplete. Name every failed common dir and its error.
9. Run step 2 of the machine section again with the confirmed roots. Remaining rule or private-file hits keep check 6 failing. After any applied Migration, tell the user to start a new session with `/new`. Combine this instruction with the extension-load instruction when both apply.
10. Continue to the project Migration detection below. While this repo's old private store remains, its fallback move or conflict-deletion offer is the only project action allowed; fresh setup stays blocked.


## Project section

Outside a git repo, skip this section and say that it runs only inside a git checkout.

### 1. Read the state

Run `project.ts state`. It prints JSON:

- `root`: this checkout. `common_dir`: the git common dir that every worktree of the repo shares. `vstack_root`: `<common_dir>/vstack`.
- `matt_pocock`: the path of Matt Pocock's private storage, `<common_dir>/matt-pocock`, or null.
- `mode`: `private` when `<vstack_root>/config/` exists, `standard` when `docs/vstack/` holds config, else null.
- `block_file`: `CLAUDE.md` when it exists, else `AGENTS.md` when it exists, else null. `block_exists`: that file already holds a `## vstack` block. `block_file_dirty`: that file has uncommitted changes.

Run `migrate-project.ts plan` before fresh setup, even when `matt_pocock` is null. It detects Matt config, instruction blocks and rule hits, old domain filenames (including nested contexts and Private domain files), and a `.diagram-design` marker. An empty plan means no Migration is needed.

### Project Migration

1. When the plan has items, show all ids, moves, proposed diffs, manual hits, destructive flags, and notices. Move is recommended: tracked config and domain files use `git mv`, untracked files use `mv`; House style rows preserve hand edits. Changes stay uncommitted. A tracked Matt config makes `private_available` true. In that case call `ask` with Move (Recommended) and Private mode instead. For Private, run `migrate-project.ts plan --mode private` and show that plan instead: tracked Matt config and instructions stay for teammates; substituted config goes under `<common_dir>/vstack/config/`, with private artifact and domain paths. This mode choice is not approval to write.
2. When old and new config or storage both exist, vstack wins. Show every old-versus-new diff and the offer to delete the old copy; keep no merged copy. Old storage stays a setup blocker until its deletion is approved. A winning private store without `config/` needs the destination resolved first; application refuses to delete the old store there.
3. The private fallback move is mandatory, covers every registered worktree of this common dir, and uses the machine move's rollback, path substitutions, symlink and exclude cleanup. It keeps unknown directories. A failed move stops all later project actions and fresh setup. There is no compatibility link; outside links to old storage break.
4. For every manual hit, read its surrounding text and propose a context-specific diff in this same plan. Resolve relative private paths against the known common dir. Keep the script's original JSON unchanged for the stale-state check.
5. Call `ask` once for this project plan with Apply all (Recommended), Choose items, and Cancel. Choose items uses one multi-select `ask` for optional ids and manual diffs; mandatory ids stay selected. Cancel runs `migrate-project.ts cancel`, writes nothing, and stops this skill.
6. Save the original JSON in Scratch. Run `migrate-project.ts apply --plan <absolute plan path>`, adding `--skip <id>` for declined optional items. Stale state or a skipped mandatory id exits 2 before writes: show a fresh plan through `ask`. Exit 1 means incomplete; show the failure and stop. Apply approved manual diffs only after their parent succeeds, at its `after_path`. Show applied and skipped ids and remaining hits.
7. Tell the user to start a new session with `/new`. Stop this run after applying Migration: never let fresh setup re-seed or commit the migrated files. If the only operation was resolving an old-store conflict, run detection again and present any remaining domain or marker plan through `ask` before applying it. A clean re-run in Private mode leaves the team's tracked Matt files alone.

When `matt_pocock` still exists after detection, stop before Mode and change no fresh config or instruction block. Otherwise an empty plan continues below. 

### 2. Mode

When `mode` is set, tell the user that this repo is already set up in that mode, and keep it. Otherwise call `ask` with two options:

- Standard (Recommended): the config is tracked in `docs/vstack/`, with a `## vstack` block in `CLAUDE.md` or `AGENTS.md`, and setup-vstack commits it.
- Private: the config lives in `<vstack_root>/config/`, inside the git common dir, so every worktree of this repo shares it and git never tracks it. Nothing is committed. The `vstack-private-mode` rule then sends every vstack skill there.

### 3. Explore

Look at the repo to understand its starting state. Read whatever exists; do not assume:

- `git remote -v` and `.git/config`: does a remote point at GitHub or GitLab, and at which repo?
- `CLAUDE.md` and `AGENTS.md` at the repo root, and the `## vstack` block in one of them.
- `GLOSSARY.md` and `GLOSSARY-MAP.md` at the repo root, and in Private mode also under `<vstack_root>/domain/`.
- `docs/adr/` and any `src/*/docs/adr/` directories.
- The config from an earlier run: `docs/vstack/` in Standard mode, `<vstack_root>/config/` in Private mode.
- `.scratch/`: a sign that a local-markdown issue tracker is already in use.
- Monorepo signals: a `pnpm-workspace.yaml`, a `workspaces` field in `package.json`, or a populated `packages/*` with its own `src/`. Only a large multi-package repo has them. Without them the repo is single-context, which is almost every repo.

### 4. Present findings and settle each section

Summarize what is present and what is missing. Then take the sections in order, one `ask` per section. Put the recommended answer first and mark it Recommended, so the user can accept it in one pick. Add a one-line explainer only when the choice really branches.

Section A, issue tracker.

> Explainer: The issue tracker is where issues live for this repo. Skills like to-tickets, triage, and to-spec read from it and write to it. They need to know whether to call `gh issue create`, write a markdown file, or follow some other workflow you describe. Pick the place where you actually track work for this repo.

Recommend GitHub when a remote points at GitHub, GitLab when a remote points at GitLab (`gitlab.com` or a self-hosted host), and local markdown otherwise. The `ask` options:

- GitHub: issues live in the repo's GitHub Issues (uses the `gh` CLI).
- GitLab: issues live in the repo's GitLab Issues (uses the [`glab`](https://gitlab.com/gitlab-org/cli) CLI).
- Local markdown: issues live as files under `.scratch/<feature>/` in Standard mode, or `<vstack_root>/artifacts/<feature>/` in Private mode. Good for solo projects or repos without a remote.
- Other (Jira, Linear, and so on): the user describes the workflow in one paragraph through the Other answer of `ask`, and that goes into the file as prose.

The GitHub and GitLab templates carry a "PRs as a request surface" flag, off by default. Leave it off and do not raise it. A user who wants external PRs in the triage queue can change the flag in the file later.

Section B, triage labels. This section always runs, because triage always ships. Call `ask` with one question, whether to keep the default triage labels, and the options Keep the defaults (Recommended) and Use other names. The defaults are the five canonical roles, each label string equal to its name: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. Only on Use other names (usually because the tracker already uses other names, such as `bug:triage` for `needs-triage`), call `ask` once more with one question per role to collect the names, so triage applies the existing labels instead of creating duplicates.

Section C, domain docs. Default to single-context: one `GLOSSARY.md` plus `docs/adr/` at the repo root. This fits almost every repo; write it without a question. Only when exploration found monorepo signals, call `ask` with single-context and multi-context (a root `GLOSSARY-MAP.md` that points to one `GLOSSARY.md` per context).

### 5. Draft and confirm

Write the drafts from the seed templates in this skill's directory:

- [issue-tracker-github.md](./issue-tracker-github.md): GitHub issue tracker
- [issue-tracker-gitlab.md](./issue-tracker-gitlab.md): GitLab issue tracker
- [issue-tracker-local.md](./issue-tracker-local.md): local-markdown issue tracker
- [triage-labels.md](./triage-labels.md): label mapping
- [domain.md](./domain.md): domain doc consumer rules and layout

For an Other issue tracker, write `issue-tracker.md` from scratch from the user's description.

In Private mode, change two drafts so that they point under the vstack root by absolute path:

- `issue-tracker.md` for local markdown: replace every `.scratch/` path, the Wayfinding map, ticket, and frontier paths included, with `<vstack_root>/artifacts/`.
- `domain.md`: the domain docs live in `<vstack_root>/domain/`, as `GLOSSARY.md` (or `GLOSSARY-MAP.md`) and `adr/`, in place of the repo-root files. Add one line saying that the repo's own tracked `GLOSSARY.md` and `docs/adr/` are read as well when they exist.

Show the user the three drafts and, in Standard mode, the `## vstack` block (see Write). Then call `ask` with the options Write it (Recommended) and Change something. On Change something, make the user's edits, show the new drafts, and call `ask` again.

### 6. Write

Standard mode:

1. When `block_file_dirty` is true, tell the user that `<block_file>` has uncommitted changes and that the setup commit is going to include them. Call `ask` with the options Go on and include them, and Stop so I can commit them first. On Stop, stop.
2. Write `docs/vstack/issue-tracker.md`, `docs/vstack/triage-labels.md`, and `docs/vstack/domain.md`.
3. Pick the file for the block. When `CLAUDE.md` exists, edit it. Else when `AGENTS.md` exists, edit it. When neither exists, call `ask` with the options `CLAUDE.md` and `AGENTS.md` and no recommended option, and create the one the user picks. Never create `AGENTS.md` when `CLAUDE.md` exists, or the other way round.
4. When the file already has a `## vstack` block, update that block in place instead of adding a second one, and leave the other sections as they are. The block:

   ```markdown
   ## vstack

   ### Issue tracker

   [one-line summary of where issues are tracked]. See `docs/vstack/issue-tracker.md`.

   ### Triage labels

   [one-line summary of the label vocabulary]. See `docs/vstack/triage-labels.md`.

   ### Domain docs

   [one-line summary of the layout: "single-context" or "multi-context"]. See `docs/vstack/domain.md`.
   ```

5. Commit. Take the title from the repo's convention: read `git log --format=%s -n 20` on the default branch (`git symbolic-ref --short refs/remotes/origin/HEAD`, else the current branch) and follow the pattern you see there. When no convention is visible, use Conventional Commits: `chore: set up vstack config`. Run `project.ts commit --title "<title>"`. It stages only the three config files and the block file, never `-A`, and commits them alone on the current branch; anything else the user had staged stays staged. It prints `commit`, `title`, and `paths` as JSON, with `commit` null when nothing changed since the last setup commit. Exit 2 means it refused: show its message.

Private mode:

1. Write `issue-tracker.md`, `triage-labels.md`, and `domain.md` to `<vstack_root>/config/`. Creating that directory turns Private mode on for every worktree of this repo.
2. Write no `## vstack` block, change no tracked file and no ignore file, and commit nothing.

### 7. Done

Tell the user the setup is complete, in which mode, and where the config is. Repeat every machine line that still fails.

List the skills that read the config:

- `issue-tracker.md`: to-spec, to-tickets, triage, wayfinder, code-review, and why.
- `triage-labels.md`: triage, to-spec, and to-tickets.
- `domain.md` and the domain docs: domain-modeling, grill-with-docs, improve-codebase-architecture, codebase-design, diagnosing-bugs, tdd, and wait-what.

Say that the user can edit these files directly later. Re-running this skill is needed only to switch issue trackers or to start over.

Then name the next step. setup-app-verification creates this project's Verify skill, which gives live proof to implement, perf-issue, forensics, refactor, hillclimb, and ship's verifiers. Tell the user to run `/skill:setup-app-verification` in a new session (`/new`). Never run it, and never offer to run it.

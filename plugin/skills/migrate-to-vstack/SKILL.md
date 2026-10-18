---
name: migrate-to-vstack
description: Move a Matt Pocock machine or project setup onto vstack through confirmed Migration plans. Preserve hand edits and leave project changes uncommitted.
disable-model-invocation: true
---

# Migrate to vstack

Migration moves a machine or project set up for Matt Pocock's skills onto vstack. It is separate from fresh setup. Run this skill before `skill://setup-vstack` when moving from Matt's skills.

The machine section handles installed skills, global rules, and Private-mode stores. The project section handles this checkout's config, Code host file, instruction block, and domain files. Standard projects found during the machine scan change only when you run this skill in each checkout. Migration leaves diagram profile files and a `.diagram-design` marker where they are. vstack does not read them.

Every question goes through `ask`. A `timedOut: true` answer is not the user's answer. Repeat the question once. If that also times out, stop without applying the plan.

Run these helpers with the bash tool, from inside the project when there is one:

```sh
bun "$(realpath skill://migrate-to-vstack/scripts/migrate.ts)" <args>
bun "$(realpath skill://migrate-to-vstack/scripts/migrate-project.ts)" <args>
```

Below, `migrate.ts` and `migrate-project.ts` stand for these commands. The helpers use the shipped [House style rows](references/house-style.yaml) for path and reference changes. Preserve that file as replacement data.

Read `skill://vstack-tmp` and resolve the project Scratch dir once. Save each helper's original plan JSON there, unchanged. Proposed manual diffs stay separate from that JSON.

## Scope

1. Ask "What should this Migration cover?" through `ask`. Inside a git repo, offer Only this project (Recommended), Scan my home with the absolute `$HOME` path, and Use other roots, in that order. Outside a git repo, offer Scan my home (Recommended) and Use other roots. Collect other absolute paths through the tool's custom answer.
2. On Only this project, skip Machine Migration and continue to Project Migration. Project Migration changes the config, instruction, rule, and domain files of this checkout only. Other worktrees of this repo do not get those uncommitted changes. All worktrees share the Private-mode store under the git common dir, so a change there applies to every worktree.
3. On Scan my home or Use other roots, keep the roots for this run and run Machine Migration. Pass one `--scan-root <absolute path>` per root to every machine plan command. The scan prunes `node_modules`, `.venv`, and `Library` and never follows directory symlinks. A checkout outside these roots cannot be found, even when its separate git dir is inside them.

## Machine Migration

1. Run `migrate.ts plan --scan-root <root>...`. It reads machine state and prints JSON without changing it. If `scan_errors` is not empty, show every path and error. Stop until the scan covers every confirmed root. If `items` is empty, continue to Project Migration.
2. Show all items, ids, moves, diffs, removals, destructive flags, and notices in one plan. Name the roots and pruned directories. List `standard_projects` as projects to migrate by running `/skill:migrate-to-vstack` in each checkout. Change none of them in this section.
3. State the downgrade from Matt `main` to the Base Pin `v1.2.3`. Skill removal runs `npx --yes skills@1.7.0 remove -g <names> -y`. It removes CLI copies, lock entries, and agent links. Other harnesses also lose those copies. Non-Matt skills stay, except the diagram-design and good-css copies that vstack replaces. The command fetches that CLI if it is not cached.
4. Explain the mandatory private moves. Each git common dir gets one move that keeps hand edits and unknown directories. The helper renames the config directory and removes old-storage symlinks and their exclude line, using the House style rows. It creates no compatibility symlink. Outside links to old artifacts break. Relative path rows run only for this repo's ordinary `.git` directory. The old private rule is removed only after every private move succeeds.
5. For every `manual_hits` entry, read the file and propose a diff before confirmation. Use the known common dir for non-ordinary relative paths. Bare storage words need a context-specific edit, not a global substitution. Add these diffs to the same presented plan. Keep filename changes for Project Migration.
6. Call `ask` once with Apply all (Recommended), Choose items, and Cancel. On Choose items, use one multi-select `ask` for optional item ids and manual diffs. Keep every mandatory item selected. A private move cannot be deselected. On Cancel, run `migrate.ts cancel` and stop. Change nothing from the machine plan.
7. Save the original plan JSON in Scratch. Run `migrate.ts apply --plan <absolute plan path>`. Add one `--skip <id>` per unselected optional item. The helper refuses a stale plan or skipped mandatory item before writing. If state changed, show a fresh plan through `ask` before acting.
8. Apply each approved manual diff only after its parent move succeeds. Use `after_path` for a moved file. Leave declined manual edits as remaining hits. Show `applied`, `skipped`, `warnings`, `failures`, and `manual_hits`. Skill removal failures warn because the plugin shadows old copies. Failed private moves leave the old rule in place. Name every failed common dir and its error.
9. Run `migrate.ts plan --scan-root <root>...` again. Machine Migration is complete when `items` and `scan_errors` are empty. Report remaining items and errors. Continue to Project Migration for this checkout, including its fallback move or conflict-deletion plan.

## Project Migration

Outside a git repo, skip this section. Report that project Migration runs inside each git checkout.

1. Run `migrate-project.ts plan`. It detects Matt config, instruction blocks, rule hits, and old domain filenames. It includes nested contexts and Private-mode domain files. An empty plan needs no project Migration. Continue to Done.
2. If the plan has items, show all ids, moves, proposed diffs, manual hits, destructive flags, and notices. Move is recommended. Tracked config and domain files use `git mv`, and untracked files use `mv`. House style rows preserve hand edits. Changes stay uncommitted. When `private_available` is true, use `ask` with Move (Recommended) and Private mode instead. For Private, run `migrate-project.ts plan --mode private` and show that plan instead. It leaves tracked Matt config and instructions for teammates. It writes substituted config under `<common_dir>/vstack/config/`, with private artifact and domain paths. This mode choice is not approval to write.

   Matt's config has no Code host. When the plan moves or copies config and the remote is on `github.com` or `gitlab.com`, the plan adds a `code-host` item. It writes `code-host.md` beside the moved config from setup-vstack's GitHub or GitLab template, with the repo filled in. When the old config or private store already holds a `code-host.md`, the plan moves that file as a hand edit and adds no seed. For any other remote, the plan has a notice instead, and setup-vstack maps that Code host after Migration.
3. When old and new config or storage both exist, vstack wins. Show each old-versus-new diff and offer to delete the old copy. Keep no merged copy. Old storage keeps Migration incomplete until the user approves deletion. If the winning store has no `config/`, resolve that destination first. The helper refuses to delete old storage without it.
4. The fallback private move is mandatory and covers every registered worktree of this common dir. It uses the machine move's rollback, path changes, symlink removal, and exclude cleanup. It keeps unknown directories. A failed move stops later project actions. No compatibility link remains, so outside links to old storage break.
5. For every manual hit, read its surrounding text and propose a context-specific diff in the same presented plan. Resolve relative private paths against the known common dir. Keep the helper's original JSON unchanged for its stale-state check.
6. Call `ask` once with Apply all (Recommended), Choose items, and Cancel. Choose items uses one multi-select `ask` for optional ids and manual diffs. Mandatory ids stay selected. Cancel runs `migrate-project.ts cancel`, writes nothing, and stops this skill.
7. Save the original JSON in Scratch. Run `migrate-project.ts apply --plan <absolute plan path>`. Add `--skip <id>` for each declined optional item. Stale state or a skipped mandatory id exits 2 before writes. Show a fresh plan through `ask` before acting. Exit 1 means incomplete. Show the failure and stop. Apply approved manual diffs only after their parent succeeds, at `after_path`. Show applied and skipped ids and remaining hits.
8. If the only operation resolved an old-store conflict, run detection again. Present remaining domain plans through `ask` before applying them. A clean re-run in Private mode leaves the team's tracked Matt files alone.

## Done

Report the machine and project results separately, including skipped items, remaining hits, and failures. State that project changes stay uncommitted for review.

After Only this project, report that Machine Migration did not run. Say that a new run of this skill with Scan my home or Use other roots migrates the machine: Matt's global skills, the old private rule, and the Private-mode stores of other repos. A skipped Machine Migration does not make this run incomplete.

After any applied Migration, tell the user to start a new session with `/new`. If Migration remains incomplete, name the remaining work and stop. Otherwise tell the user to run `/skill:setup-vstack` for machine configuration and fresh project setup. Do not run setup-vstack in this session or commit migrated files.

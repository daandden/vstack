---
name: setup-vstack
description: Check this machine's omp settings for vstack, then configure this repo's issue tracker, Code host, CI service, triage labels, and domain docs in Standard or Private mode. Offers to migrate a repo set up for Matt Pocock's skills first. Re-run to add missing config files.
disable-model-invocation: true
---

# Setup vstack

Two parts, in this order. The machine section checks the omp settings vstack needs. The project section writes this repo's vstack config:

- Issue tracker: where issues live (GitHub by default; local markdown also works out of the box).
- Code host: the service that holds the remote and its PRs, and the tool that runs each PR operation.
- CI service: the service that runs the repo's builds and checks, independently of its Code host.
- Triage labels: the strings used for the five canonical triage roles.
- Domain docs: where `GLOSSARY.md` and ADRs live, and the rules for reading them.

The project section first checks this repo for Matt Pocock's config. When it finds some, it offers a Migration before setup, in the same run. Migration changes only this repo and its shared private store. It never changes machine state such as global skills, global rules, or diagram profiles.

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

1. Run `machine.ts`. It checks:
   - 1, TypeSafe credentials exist.
   - 2, `modelRoles.judge` is `typesafe/jev-latest`.
   - 3, `task.agentModelOverrides` keys for vstack agents. vstack agents use the Session model by default, and a key the user sets overrides it. This check never fails. It prints a note that names each overridden agent and its model.
   - 4, the vstack extension is enabled. When `disabledExtensions` lists it, a new session alone does not load it, so the remedy removes it from the list first. Otherwise this check never fails. omp loads the extension only at session start, so it prints a note to start a new session with `/new` after linking or pulling vstack.
   - 5, eval Python is ready: `eval.py` is on and `omp setup python --check` passes. This one only warns.
   - 6, `task.isolation.enabled` is on (ADR 0007). Skills that need an isolated subagent stop without it.
   - 7, `worktree.clone` is on. In Private mode, prototype mounts app-bound prototypes in an `omp wt add` clone and stops on a plain checkout.

   When every check passes, it prints one `OK` line. Otherwise it prints one line per check that does not pass: `FAIL <n> <name>: <what is wrong>. Remedy: <what fixes it>.`, or `WARN` in place of `FAIL` for check 5. Check 3 prints `NOTE 3 <name>: <the overrides>.` when a key exists. Check 4 prints `NOTE 4 <name>: <the new-session note>.` when the extension is enabled. A `NOTE` line has no remedy. Exit 0 means no `FAIL` line, 1 means at least one, and 2 means the script did not run: show its message and go on to the project section.
2. Show the output to the user as it is.
3. The settings writer fixes only checks 2, 6, and 7, with the user's approval. For each failed setting, call one `ask` with Set it (Recommended) and Leave it. Then run `machine.ts --set <name>...` with only the approved names: `judge` for 2, `isolation` for 6, `clone` for 7. It uses `omp config set` and preserves the other judge roles. Never change omp settings any other way. Run step 1 again and show its output.
4. Leave checks 1, 3, 4, and 5 to the user. TypeSafe credentials come from `/login typesafe`, which only the user can run. The extension needs a new session. Done repeats every line still failing.

## Project section

Outside a git repo, skip this section, the Matt check included, and say that it runs only inside a git checkout.

### 1. Read the state

Run `project.ts state`. It prints JSON:

- `root`: this checkout. `common_dir`: the git common dir that every worktree of the repo shares. `vstack_root`: `<common_dir>/vstack`.
- `mode`: `private` when `<vstack_root>/config/` exists, `standard` when `docs/vstack/` holds config, else null.
- `missing_config`: the config files that the mode's config directory does not have yet, from `issue-tracker.md`, `code-host.md`, `triage-labels.md`, `domain.md`, and `ci.md`.
- `block_file`: `CLAUDE.md` when it exists, else `AGENTS.md` when it exists, else null. `block_exists`: that file already holds a `## vstack` block. `block_file_dirty`: that file has uncommitted changes.

Keep `block_file_dirty` from this first read for step 7. Edits that this run's Migration makes to the block file do not count.

### 2. Matt check

Read `skill://vstack-tmp` and resolve the project Scratch dir once. Every worktree of the repo shares that dir, so this run needs its own entry. Run `mkdir -p <Scratch dir>/setup-vstack && mktemp -d <Scratch dir>/setup-vstack/run-XXXXXX`. Keep the path it prints as the run entry. Run `migrate.ts plan > <run entry>/plan-1.json`. The plan reads this repo and changes nothing. When its `items` list is empty, go on to step 3. Otherwise read [references/migration.md](references/migration.md) and follow it. The Matt files are the `from` paths of the plan's items inside `root` or `common_dir`. A `code-host` item's `from` is a shipped template, not a Matt file. The reference returns here in one of three ways:

- The user set up beside the Matt files, through the first question or Cancel. Keep the Matt files for step 8 and go on to step 3.
- The Migration is incomplete. Stop the run after showing the failure.
- The Migration applied. Run `project.ts state` again. Use its facts from here on, except `block_file_dirty`. Keep the Migration paths and the mode that Migration settled. Migration does not seed `ci.md`; the missing file takes this run straight to the CI section in step 5 after exploration.

### 3. Mode

When `mode` is set, or Migration settled the mode, tell the user the mode and keep it. Then take the first branch that applies:

- `missing_config` is empty and this run's Migration changed nothing: tell the user that every config file exists and that they can edit any of them directly. Skip to step 8.
- `missing_config` is empty and this run's Migration changed files, in Standard mode: skip steps 4 and 5. Draft only the `## vstack` block in step 6. Go on to the commit in step 7.
- `missing_config` is empty and this run's Migration changed files, in Private mode: skip to step 8.
- Otherwise: run only the sections for the missing files in step 5. Draft and write only those files, except for the CI cutover below. When `ci.md` is missing and `code-host.md` exists, follow Section C's re-setup branch and include its revised `code-host.md` in the same confirmation. Leave every other existing config file unchanged.

When `mode` is null, call `ask` with two options:

- Standard (Recommended): the config is tracked in `docs/vstack/`, with a `## vstack` block in `CLAUDE.md` or `AGENTS.md`, and setup-vstack commits it.
- Private: the config lives in `<vstack_root>/config/`, inside the git common dir, so every worktree of this repo shares it and git never tracks it. Nothing is committed. The `vstack-private-mode` rule then sends every vstack skill there.

### 4. Explore

Look at the repo to understand its starting state. Read whatever exists; do not assume:

- `git remote -v` and `.git/config`: does a remote point at GitHub, GitLab, Bitbucket, or another host, and at which repo?
- `.github/workflows/`, `.gitlab-ci.yml`, and `Jenkinsfile` at the repo root: these CI signals guide the separate CI service recommendation.
- The MCP servers this session reaches (tools named `mcp__<server>_<tool>`, top-level or under `xd://`), when the remote is not GitHub or GitLab. A server for the Code host is a likely tool for it.
- `CLAUDE.md` and `AGENTS.md` at the repo root, and the `## vstack` block in one of them.
- `GLOSSARY.md` and `GLOSSARY-MAP.md` at the repo root, and in Private mode also under `<vstack_root>/domain/`.
- `docs/adr/` and any `src/*/docs/adr/` directories.
- The config from an earlier run: `docs/vstack/` in Standard mode, `<vstack_root>/config/` in Private mode.
- `.scratch/`: a sign that a local-markdown issue tracker is already in use.
- Monorepo signals: a `pnpm-workspace.yaml`, a `workspaces` field in `package.json`, or a populated `packages/*` with its own `src/`. Only a large multi-package repo has them. Without them the repo is single-context, which is almost every repo.

### 5. Present findings and settle each section

Summarize what is present and what is missing. Then take the missing-file sections in order, one `ask` per section. When there is a recommendation, put it first and mark it Recommended. Otherwise keep the listed order with no recommendation. Add a one-line explainer only when the choice really branches.

MCP discovery, shared by Sections A, B, and C. Use this rule when the user names an MCP server for an Other choice. Read that server's current tool list, descriptions, and parameter schemas. If discovery fails or the server is unreachable, name the server and the failure, tell the user to connect it, and stop before writing or committing project config. Draft the section's config with its service, the named MCP server, its project facts, and its pins, and with no operation rows. A Check pin is one tool whose description establishes a read-only connection check. Name a tool only when this server's list contains it, and derive its arguments from that tool's schema. If no tool fits a pin, mark that pin `unsupported`; invent no pin or replacement. Project facts hold values that the tool descriptions cannot supply. Collect missing facts through `ask`. Tell the config's reader to select every unpinned operation from the named server's current descriptions and parameter schemas, using these facts. Show the draft for confirmation in step 6.

Section A, issue tracker.

> Explainer: The issue tracker is where issues live for this repo. Skills like to-tickets, triage, and to-spec read from it and write to it. They need to know whether to call `gh issue create`, write a markdown file, or follow some other workflow you describe. Pick the place where you actually track work for this repo.

Recommend GitHub when a remote points at GitHub, GitLab when a remote points at GitLab (`gitlab.com` or a self-hosted host), and local markdown otherwise. The `ask` options:

- GitHub: issues live in the repo's GitHub Issues (uses the `gh` CLI).
- GitLab: issues live in the repo's GitLab Issues (uses the [`glab`](https://gitlab.com/gitlab-org/cli) CLI).
- Local markdown: issues live as files under `.scratch/<feature>/` in Standard mode, or `<vstack_root>/artifacts/<feature>/` in Private mode. Good for solo projects or repos without a remote.
- Other, such as Jira or Linear: the user names, through the Other answer of `ask`, the MCP server or CLI already set up for this project, or says that there is no tool.

The GitHub and GitLab templates carry a "PRs as a request surface" flag, off by default. Leave it off and do not raise it. A user who wants external PRs in the triage queue can change the flag in the file later.

For Other with an MCP server, follow MCP discovery. Draft `issue-tracker.md` with the tracker and one pin, Check.

For Jira, the project facts are the project key, the issue type for tickets, the transition that closes an issue, the blocking link type, and the mapping from the five canonical triage roles to Jira labels. Use the settled Section D names or the existing `triage-labels.md` for that mapping. Collect missing facts without guessing defaults. Keep create, comment, label, close, and blocking tools out of the config. Jira uses Other; there is no Jira template.

For Other with a CLI, read its `--help` for the relevant command groups. Draft the tracker workflow, project facts, and a read-only Check command from that help. Invent no command. For Other with no MCP server or CLI, collect the user's workflow in one paragraph through `ask` and keep it as prose, with no invented tool or Check call.

Section B, Code host.

> Explainer: The Code host is the service that holds this repo's remote and its PRs. implement's PR chain (open-pr, babysit, ship), code-review, blast-radius, why, and session run every PR operation through `code-host.md`. A repo without it can only commit, and code-review and blast-radius cannot review a PR. The Code host is a separate choice from the issue tracker. For example, a Bitbucket repo can track its issues in Jira.

Recommend GitHub when a remote points at `github.com`, GitLab when a remote points at GitLab (`gitlab.com` or a self-hosted host), and no option otherwise. The `ask` options:

- GitHub: PRs live on GitHub (uses the `gh` CLI).
- GitLab: merge requests live on GitLab (uses the `glab` CLI).
- Other (Bitbucket Cloud, Bitbucket Data Center, and so on): the user names, through the Other answer of `ask`, the MCP server or CLI that is already set up for this project.

For Other with a CLI, read its `--help` output for each command group. Write one command row per operation id in [code-host-github.md](./code-host-github.md), in the same order, with the arguments it needs. Write `unsupported` when no command matches. Draft a read-only Check command from that help too. Never name a command that the help does not show.

For Other with an MCP server, follow MCP discovery. Draft `code-host.md` with the host and one pin, Check. Its project facts are the repo, the review reference in commit titles, and how to obtain and fetch the PR's exact base and head commits, including a fork's head. Bitbucket uses Other; there is no Bitbucket template.

Section C, CI service.

> Explainer: The CI service runs this repo's builds and checks. It can differ from the Code host. Its logs, build reruns, secrets, and variables belong in `ci.md`.

When `ci.md` is missing and `code-host.md` exists, read that file before presenting a service-choice question. If it holds any of `ci-logs`, `rerun-ci`, `set-secret`, or `set-variable`, draft `ci.md` from those rows and their recorded service, tool, repo, and Check. Keep unsupported operations and their reasons. Reuse the recorded CI choice and facts.

- For a CLI source, copy the four rows that exist verbatim, including hand-edited arguments, input handling, and policy notes. The exception is a `rerun-ci` row that does not rerun the linked failed build in full, such as the earlier GitLab template's `glab api --method POST projects/:id/merge_requests/<iid>/pipelines`, which starts a new pipeline. Draft that operation as `unsupported` with the reason, as [ci-gitlab.md](./ci-gitlab.md) does. Draft `code-host.md` with only those rows removed. Keep every other row and note unchanged, including `required-checks` and `watch-checks`.
- For an MCP source, carry the rows' user-specific values, arguments, and policies into `ci.md`'s project facts. Follow MCP discovery and draft `ci.md` with Section C's MCP pins. Select `ci-logs`, `set-secret`, and `set-variable` from current tool descriptions, not copied pins. Draft `code-host.md` in Section B's short shape, keeping its server, project facts, and read-only Check pin, with no operation rows. Preserve Code host facts embedded in the old rows, such as exact-commit fetching and the review reference.

Show both complete drafts together in step 6 and call `ask` once for their write confirmation. Write neither file before that confirmation. The agent drafts this cutover; `project.ts` has no row-move command. Skip the service-choice question below when the old rows already supply that choice. Collect only a missing fact needed for these drafts through `ask`, not unrelated setup sections.

If the existing `code-host.md` has no CI rows, use the normal CI choices below. Still include an MCP Code host's short-shape draft in the same confirmation. A CLI Code host with no CI rows stays unchanged.

Recommend from the CI signals found in step 4, not from the remote or the Code host. Exactly one signal gives a recommendation: `.github/workflows/` means GitHub Actions, `.gitlab-ci.yml` means GitLab CI, and `Jenkinsfile` means Other. With none or several, recommend nothing. The `ask` options:

- GitHub Actions: builds and checks run on GitHub Actions, using the `gh` CLI.
- GitLab CI: builds and checks run on GitLab CI, using the `glab` CLI.
- Other: the user names, through the Other answer of `ask`, the MCP server or CLI already set up for this project.

For Other with a CLI, read its `--help` for each command group. Draft one row per operation id in [ci-github-actions.md](./ci-github-actions.md), in the same order, with the command and its arguments. Use `unsupported` where no command matches. Draft a read-only Check command from that help too. Never invent a command.

For Other with an MCP server, follow MCP discovery. Draft `ci.md` with the CI service and two pins:

- Check.
- `rerun-ci`: one tool that starts a fresh full rerun of the exact existing build with the same parameters and script. Record how its arguments come from the failed check's link. A changed-script replay, a new build using defaults, and a failed-stage-only retry do not fit.

`ci-logs`, `set-secret`, and `set-variable` stay unpinned. The project facts include values such as the Jenkins URL and job folder. A folder is not a substitute for the failed check's build link. Jenkins uses Other; there is no Jenkins template.

Section D, triage labels. This section runs whenever `triage-labels.md` is missing, whatever the tracker, because triage always ships. Call `ask` with one question, whether to keep the default triage labels, and the options Keep the defaults (Recommended) and Use other names. The defaults are the five canonical roles, each label string equal to its name: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. Only on Use other names (usually because the tracker already uses other names, such as `bug:triage` for `needs-triage`), call `ask` once more with one question per role to collect the names, so triage applies the existing labels instead of creating duplicates.

Section E, domain docs. Default to single-context: one `GLOSSARY.md` plus `docs/adr/` at the repo root. This fits almost every repo; write it without a question. Only when exploration found monorepo signals, call `ask` with single-context and multi-context (a root `GLOSSARY-MAP.md` that points to one `GLOSSARY.md` per context).

### 6. Draft and confirm

Write the drafts from the seed templates in this skill's directory:

- [issue-tracker-github.md](./issue-tracker-github.md): GitHub issue tracker
- [issue-tracker-gitlab.md](./issue-tracker-gitlab.md): GitLab issue tracker
- [issue-tracker-local.md](./issue-tracker-local.md): local-markdown issue tracker
- [code-host-github.md](./code-host-github.md): GitHub Code host
- [code-host-gitlab.md](./code-host-gitlab.md): GitLab Code host
- [ci-github-actions.md](./ci-github-actions.md): GitHub Actions CI service
- [ci-gitlab.md](./ci-gitlab.md): GitLab CI service
- [triage-labels.md](./triage-labels.md): label mapping
- [domain.md](./domain.md): domain doc consumer rules and layout

For an Other issue tracker with an MCP server, use Section A's server, facts, and Check pin, without per-operation tool rows. For a CLI, use Section A's workflow and Check command. With no tool, write `issue-tracker.md` from the user's prose paragraph.
For an Other Code host with a CLI, write `code-host.md` in the shape of `code-host-github.md`, with the host, repo, tool, read-only Check command, review reference, and drafted command rows. For an MCP Code host, use Section B's server, project facts, and Check pin, without operation rows. In every `code-host.md`, fill in the repo from the remote and, for self-hosted GitLab, the host.
For an Other CI service with a CLI, write `ci.md` in the shape of `ci-github-actions.md`, with the CI service, repo, tool, read-only Check command, and drafted rows. Fill in the CI repo and, for self-hosted GitLab, its host. Keep CI logs, build reruns, secrets, and variables only in `ci.md`.
For an Other CI service with an MCP server, use Section C's short shape, not the CLI operation rows.

For Section C's re-setup branch, use the existing rows and facts as directed there instead of replacing hand edits with seed-template text. The two drafts are the new `ci.md` and the revised existing `code-host.md`. Leave every other existing config file out of the draft and write set.

In Private mode, change two drafts so that they point under the vstack root by absolute path:

- `issue-tracker.md` for local markdown: replace every `.scratch/` path, the Wayfinding map, ticket, and frontier paths included, with `<vstack_root>/artifacts/`.
- `domain.md`: the domain docs live in `<vstack_root>/domain/`, as `GLOSSARY.md` (or `GLOSSARY-MAP.md`) and `adr/`, in place of the repo-root files. Add one line saying that the repo's own tracked `GLOSSARY.md` and `docs/adr/` are read as well when they exist.

Show the user each complete draft and, in Standard mode, the `## vstack` block changes (see step 7). Then call `ask` once for the whole write set, with the options Write it (Recommended) and Change something. On Change something, make the user's edits, show the new drafts, and call `ask` again. A section choice is not write approval. Until this confirmation, keep the project files unchanged.

### 7. Write

Standard mode:

1. When `block_file_dirty` from step 1 is true, tell the user that `<block_file>` has uncommitted changes and that the setup commit is going to include them. Call `ask` with the options Go on and include them, and Stop so I can commit them first. On Stop, stop.
2. Write each config file that this run drafted: `docs/vstack/issue-tracker.md`, `docs/vstack/code-host.md`, `docs/vstack/ci.md`, `docs/vstack/triage-labels.md`, and `docs/vstack/domain.md`, or only the missing ones on a re-run plus Section C's confirmed `code-host.md` cutover.
3. Pick the file for the block. When `CLAUDE.md` exists, edit it. Else when `AGENTS.md` exists, edit it. When neither exists, call `ask` with the options `CLAUDE.md` and `AGENTS.md` and no recommended option, and create the one the user picks. Never create `AGENTS.md` when `CLAUDE.md` exists, or the other way round.
4. When the file already has a `## vstack` block, update it in place instead of adding a second one, and leave the other sections as they are. On a CI-only re-run, preserve its existing subsections and add only a missing CI service subsection. The block:

   ```markdown
   ## vstack

   ### Issue tracker

   [one-line summary of where issues are tracked]. See `docs/vstack/issue-tracker.md`.

   ### Code host

   [one-line summary of the Code host and its tool]. See `docs/vstack/code-host.md`.

   ### CI service

   [one-line summary of the CI service and its tool]. See `docs/vstack/ci.md`.

   ### Triage labels

   [one-line summary of the label vocabulary]. See `docs/vstack/triage-labels.md`.

   ### Domain docs

   [one-line summary of the layout: "single-context" or "multi-context"]. See `docs/vstack/domain.md`.
   ```

5. Commit. Take the title from the repo's convention: read `git log --format=%s -n 20` on the default branch (`git symbolic-ref --short refs/remotes/origin/HEAD`, else the current branch) and follow the pattern you see there. When no convention is visible, use Conventional Commits: `chore: set up vstack config`. Run `project.ts commit --title "<title>"`, with one `--migration-path <path>` per Migration path from step 2. It stages the five config files, the block file, and the Migration paths, deletions and both sides of a move included, never `-A` on the whole repo. It commits them alone on the current branch; anything else the user had staged stays staged. It prints `commit`, `title`, and `paths` as JSON, with `commit` null when nothing changed since the last setup commit. Exit 2 means it refused: show its message.

Private mode:

1. Write each drafted config file to `<vstack_root>/config/`: `issue-tracker.md`, `code-host.md`, `ci.md`, `triage-labels.md`, and `domain.md`, or only the missing ones on a re-run plus Section C's confirmed `code-host.md` cutover. Creating that directory turns Private mode on for every worktree of this repo.
2. Write no `## vstack` block, change no tracked file and no ignore file, and commit nothing.

In both modes, check each config that this run or its Migration wrote. For a CLI config, run its read-only Check command once. For an MCP config, call its pinned read-only Check tool exactly once with the recorded arguments. A config with no tool or an unsupported Check gets a reported gap, not an invented call.

On failure, print `WARN <config name>: <named tool or command and observed failure>. Remedy: <log in to the CLI, or connect the named MCP server>.` Keep the written file. An MCP connection check is one tool call, not a fallback sequence.

### 8. Done

Tell the user the setup is complete, in which mode, and where the config is. Repeat every machine line that still fails. Report the Migration result: applied and skipped items, remaining manual hits, and notices. When the user set up beside the Matt files, name the Matt files that remain.

List the skills that read the config:

- `issue-tracker.md`: to-spec, to-tickets, triage, wayfinder, code-review, and why.
- `code-host.md`: implement and its PR chain (open-pr, babysit, and ship), implement-spec, hillclimb, code-review, blast-radius, why, and session. Without it, implement offers only End state commit, and code-review and blast-radius cannot review a PR.
- `ci.md`: implement, babysit, and wizard. Without it, implement offers only End state commit. Logs, build reruns, secrets, and variables use this file.
- `triage-labels.md`: triage, to-spec, and to-tickets.
- `domain.md` and the domain docs: domain-modeling, grill-with-docs, improve-codebase-architecture, codebase-design, diagnosing-bugs, tdd, and wait-what.

Say that the user can edit these files directly later. Re-running this skill adds only missing config files, with one cutover when `ci.md` is missing: it also removes the moved CI rows from `code-host.md` and reduces an MCP Code host to its short shape after confirmation. Every other existing config stays unchanged. To switch a choice, edit its file, or delete the file and run this skill again.

Then name the next step. setup-app-verification creates this project's Verify skill, which gives live proof to implement, forensics, hillclimb, and ship's verifiers. Tell the user to start a new session (`/new`) and run `/skill:grill-with-docs` to plan live proof. implement uses `skill://setup-app-verification` to create the Verify skill in that run.

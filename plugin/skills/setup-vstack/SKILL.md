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

The project section first checks this repo for Matt Pocock's config. When it finds some, it offers a Migration before setup, in the same run. Migration changes only this repo and its shared private store. It never changes machine state such as global skills or global rules.

This is a prompt-driven skill with helper scripts. Explore, present what you found, settle each choice through `ask`, then write.

Every question to the user follows `skill://flow-page`'s "Every ask in a Flow", with Flow CLI publication of the complete round and separate recording of the observed response. A timed-out answer is not the user's. Re-ask a gate once through the same contract, setting `again` on the Flow-authored question. If it times out again, stop without acting and say why. Unavailable questioning grants no approval.

## Flow page and diagnostics

Follow `skill://flow-page`'s "Stage entry/exit line" before the first check. All setup and Migration questions belong to this run.

Keep each helper's command, exit code, stdout, and stderr in this run's `setup-vstack` Scratch entry. Keep machine diagnostics verbatim, including remaining FAIL, WARN, and NOTE lines. Redact credentials before capturing them. Project config and Migration exports stay canonical at their existing paths.

Before every exit, including incomplete Migration, unavailable discovery, and a declined confirmation, submit a Document Result with the observed machine checks, project mode, config paths, Migration outcome, remaining failures, and next action. Include the raw diagnostics in code blocks and capture their files as evidence attachments. A skipped section says why. An incomplete setup is not complete. Link written project files as sources, not a separate report page.

Continue with the machine section below.

Run the scripts with the bash tool, from inside the repo when there is one:

```sh
bun "$(realpath skill://setup-vstack/scripts/machine.ts)" <args>
bun "$(realpath skill://setup-vstack/scripts/project.ts)" <args>
bun "$(realpath skill://setup-vstack/scripts/migrate.ts)" <args>
```

Below, `machine.ts`, `project.ts`, and `migrate.ts` stand for these commands.

## Machine section

1. Run `machine.ts`. It checks:
   - 1, TypeSafe credentials exist. It runs only when the judge role's provider is `typesafe`. Otherwise it passes.
   - 2, `modelRoles.judge` is set. When it is not, the remedy sets `typesafe/jev-latest`. The Addon judge is the model that this role names, so another role also passes, with a note that vstack calibrates the Addon judge against jev.
   - 3, `task.agentModelOverrides` keys for vstack agents. vstack agents use the Session model by default, and a key the user sets overrides it. This check never fails. It prints a note that names each overridden agent and its model.
   - 4, the vstack extension is enabled. When `disabledExtensions` lists it, a new session alone does not load it, so the remedy removes it from the list first. Otherwise this check never fails. omp loads the extension only at session start, so it prints a note to start a new session with `/new` after linking or pulling vstack.
   - 5, eval Python is ready: `eval.py` is on and `omp setup python --check` passes. This one only warns.
   - 6, `task.isolation.enabled` is on (ADR 0007). Skills that need an isolated subagent stop without it.
   - 7, `worktree.clone` is on. It serves the `omp wt add` fallback, `/wt`, and PR checkouts.
   - 8, `ratchet.enabled` is on (ADR 0041). Ratchet optionally improves an LLM flow against approved cases. Disabled Ratchet only warns, so Leave it still passes a machine with no other failures. An unavailable setting also warns with an omp 18.4.5-or-later upgrade remedy, not a setting change.
   - 9, an executable `ovnfs` is available through omp's `ovnfs.path`, or on PATH when that setting is unset (ADR 0059). Without it, isolated roles and vstack's separate checkouts stop. The remedy installs ovnfs or corrects its configured path.
   - 10, `isolation.backend` is `auto`, so omp uses ovnfs for isolated subagents. Another backend fails even when ovnfs is installed.
   - 11, `bash.gitGuard` is on. This optional check warns when it is off. Before offering Set it, explain that it is machine-wide: it also refuses git commands that discard or move work in main checkouts in the user's non-vstack sessions.

   When every check passes, it prints one `OK` line. Otherwise it prints one line per check that does not pass: `FAIL <n> <name>: <what is wrong>. Remedy: <what fixes it>.`, or `WARN` in place of `FAIL` for checks 5, 8, and 11. Check 2 prints `NOTE 2 <name>: <the role and the jev note>.` when the role names a model other than `typesafe/jev-latest`. Check 3 prints `NOTE 3 <name>: <the overrides>.` when a key exists. Check 4 prints `NOTE 4 <name>: <the new-session note>.` when the extension is enabled. A `NOTE` line has no remedy. `machine.ts --json` prints one JSON record with a `checks` array containing every check's `id`, `name`, and `status`, plus `detail` and `remedy` where applicable. Exit 0 means no required failure, 1 means at least one, and 2 means the script did not run: show its message and go on to the project section.
2. Show the output to the user as it is.
3. The settings writer fixes checks 2, 6, 7, disabled-setting WARN 8, 10, and WARN 11 only with the user's approval. For each of these setting remedies, call one `ask` with Set it (Recommended) and Leave it. An unavailable Ratchet setting needs the reported omp upgrade instead; offer no Set it for that warning. Include the machine-wide gitGuard consequence from check 11 in its offer.
   Run `machine.ts --set <name>...` with only the approved names: `judge` for 2, `isolation` for 6, `clone` for 7, `ratchet` for disabled 8, `backend` for 10, and `gitGuard` for 11. Leave it keeps that setting unchanged. If no names are approved, do not run the writer. It uses `omp config set` to write the machine-wide user configuration and preserves unrelated settings, including other model roles. Never enable Ratchet in project or session configuration. Never change omp settings any other way. After a write, run step 1 again and show its output.
4. Leave checks 1, 3, 4, 5, and 9 to the user. TypeSafe credentials come from `/login typesafe`, which only the user can run. The extension needs a new session. Missing ovnfs needs installation or a corrected `ovnfs.path`. Done repeats every line still failing.

## Project section

Outside a git repo, skip this section, the Matt check included, and say that it runs only inside a git checkout.

### 1. Read the state

Run `project.ts state`. It prints JSON:

- `root`: this checkout. `common_dir`: the git common dir that every worktree of the repo shares. `vstack_root`: `<common_dir>/vstack`.
- `mode`: `private` when `<vstack_root>/config/` exists, `standard` when `docs/vstack/` holds config, else null.
- `missing_config`: the config files that the mode's config directory does not have yet, from `issue-tracker.md`, `code-host.md`, `triage-labels.md`, `domain.md`, and `ci.md`.
- `missing_default_end_state`: true when the mode's config directory has `code-host.md` and that file has no line `- Default End state: <commit|merge-ready|shipped>` with one of those three values exactly. False when the line is there or `code-host.md` is missing; a missing file is already in `missing_config`.
- `missing_landing_method`: true when the mode's config directory has `code-host.md` and that file does not have exactly one `- Landing method: <method>` line that names one of its Code host's methods: `squash`, `merge`, or `rebase` for GitHub, `squash`, `merge`, `rebase_merge`, or `ff` for GitLab, and any lowercase method name for another host. An invalid line or a second line also makes it true. False when the one valid line is there or `code-host.md` is missing.
- `block_file`: `CLAUDE.md` when it exists, else `AGENTS.md` when it exists, else null. `block_exists`: that file already holds a `## vstack` block. `block_file_dirty`: that file has uncommitted changes.

Keep `block_file_dirty` from this first read for step 7. Edits that this run's Migration makes to the block file do not count.

### 2. Matt check

Read `skill://vstack-tmp` and resolve the project Scratch dir once. Every worktree of the repo shares that dir, so this run needs its own entry. Run `mkdir -p <Scratch dir>/setup-vstack && mktemp -d <Scratch dir>/setup-vstack/run-XXXXXX`. Keep the path it prints as the run entry. Run `migrate.ts plan > <run entry>/plan-1.json`. The plan reads this repo and changes nothing. When its `items` list is empty, go on to step 3. Otherwise read [references/migration.md](references/migration.md) and follow it. The Matt files are the `from` paths of the plan's items inside `root` or `common_dir`. A `code-host` item's `from` is a shipped template, not a Matt file. The reference returns here in one of three ways:

- The user set up beside the Matt files, through the first question or Cancel. Keep the Matt files for step 8 and go on to step 3.
- The Migration is incomplete. Stop the run after showing the failure.
- The Migration applied. Run `project.ts state` again. Use its facts from here on, except `block_file_dirty`. Keep the Migration paths and the mode that Migration settled. Migration does not seed `ci.md`; the missing file takes this run straight to the CI section in step 5 after exploration. A `code-host.md` that Migration seeds has no default End state and no Landing method, so `missing_default_end_state` and `missing_landing_method` add Section B's two questions.

### 3. Mode

When `mode` is set, or Migration settled the mode, tell the user the mode and keep it. Then take the first branch that applies:

- `missing_config` is empty, `missing_default_end_state` and `missing_landing_method` are false, and this run's Migration changed nothing: tell the user that every config file exists and that they can edit any of them directly. Skip to step 8.
- `missing_config` is empty, `missing_default_end_state` and `missing_landing_method` are false, and this run's Migration changed files, in Standard mode: skip steps 4 and 5. Draft only the `## vstack` block in step 6. Go on to the commit in step 7.
- `missing_config` is empty, `missing_default_end_state` and `missing_landing_method` are false, and this run's Migration changed files, in Private mode: skip to step 8.
- Otherwise: run only the sections for the missing files in step 5. Draft and write only those files, except for the CI cutover, the default End state, and the Landing method below. When `ci.md` is missing and `code-host.md` exists, follow Section C's re-setup branch and include its revised `code-host.md` in the same confirmation. When `missing_default_end_state` is true, ask only Section B's default End state question for the existing `code-host.md` and add its one line there. When `missing_landing_method` is true, do the same with Section B's Landing method question. Leave every other existing config file unchanged.

When `mode` is null, call `ask` with one question and two options:

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

Summarize what is present and what is missing. Then take the missing-file sections in order, one round through `ask` per section. When there is a recommendation, put it first and mark it Recommended. Otherwise keep the listed order with no recommendation. Add a one-line explainer only when the choice really branches.

MCP discovery, shared by Sections A, B, and C. Use this rule when the user names an MCP server for an Other choice. Read that server's current tool list, descriptions, and parameter schemas. If discovery fails or the server is unreachable, name the server and the failure, tell the user to connect it, and stop before writing or committing project config. Draft the section's config with its service, the named MCP server, its project facts, and its pins, and with no operation rows. A Check pin is one tool whose description establishes a read-only connection check. Name a tool only when this server's list contains it, and derive its arguments from that tool's schema. If no tool fits a pin, mark that pin `unsupported`; invent no pin or replacement. Project facts hold values that the tool descriptions cannot supply. Collect missing facts through `ask`. Tell the config's reader to select every unpinned operation from the named server's current descriptions and parameter schemas, using these facts. Show the draft for confirmation in step 6.

Section A, issue tracker.

> Explainer: The issue tracker is where issues live for this repo. Skills like to-tickets, triage, and to-spec read from it and write to it. They need to know whether to call `gh issue create`, write a markdown file, or follow some other workflow you describe. Pick the place where you actually track work for this repo.

Recommend GitHub when a remote points at GitHub, GitLab when a remote points at GitLab (`gitlab.com` or a self-hosted host), and local markdown otherwise. The question's options:

- GitHub: issues live in the repo's GitHub Issues (uses the `gh` CLI).
- GitLab: issues live in the repo's GitLab Issues (uses the [`glab`](https://gitlab.com/gitlab-org/cli) CLI).
- Local markdown: issues live as files under `.scratch/<feature>/` in Standard mode, or `<vstack_root>/artifacts/<feature>/` in Private mode. Good for solo projects or repos without a remote.
- Other, such as Jira or Linear: the user names, through the picker's custom answer, the MCP server or CLI already set up for this project, or says that there is no tool.

The GitHub and GitLab templates carry a "PRs as a request surface" flag, off by default. Leave it off and do not raise it. A user who wants external PRs in the triage queue can change the flag in the file later.

For Other with an MCP server, follow MCP discovery. Draft `issue-tracker.md` with the tracker and one pin, Check.

For Jira, collect the project key, ticket issue type, closing transition, blocking link type and direction, and the five canonical triage-role values. Use the settled Section D names or the existing `triage-labels.md`. Record which field carries readiness separately from system `labels`, including its custom field id when applicable. Use the issue type name when the live create schema requires a name, such as `issue_type: "Task"`, rather than substituting an id.

When the server has no tool that returns the authenticated user's identity, collect the token owner's tracker username and draft it as the `owner` project fact. It becomes `facts.owner` in to-tickets' approved input. A project listing or assignee lookup does not establish the authenticated identity. Collect missing facts without guessing defaults. Keep per-operation tool names out of the config. To-tickets drafts and obtains approval for its MCP binding from the live tools when it prepares a batch. Jira uses Other; there is no Jira template.

For Other with a CLI, read its `--help` for the relevant command groups. Draft the tracker workflow, project facts, and a read-only Check command from that help. Invent no command. For Other with no MCP server or CLI, collect the user's workflow in one paragraph through `ask` and keep it as prose, with no invented tool or Check call.

Section B, Code host.

> Explainer: The Code host is the service that holds this repo's remote and its PRs. implement's PR chain (open-pr, babysit, ship), code-review, blast-radius, why, and session run every PR operation through `code-host.md`. A repo without it can only commit, and code-review and blast-radius cannot review a PR. The Code host is a separate choice from the issue tracker. For example, a Bitbucket repo can track its issues in Jira.

Recommend GitHub when a remote points at `github.com`, GitLab when a remote points at GitLab (`gitlab.com` or a self-hosted host), and no option otherwise. The question's options:

- GitHub: PRs live on GitHub (uses the `gh` CLI).
- GitLab: merge requests live on GitLab (uses the `glab` CLI).
- Other (Bitbucket Cloud, Bitbucket Data Center, and so on): the user names, through the picker's custom answer, the MCP server or CLI that is already set up for this project.

For Other with a CLI, read its `--help` output for each command group. Write one command row per operation id in [code-host-github.md](./code-host-github.md), in the same order, with the arguments it needs. Write `unsupported` when no command matches. Draft a read-only Check command from that help too. Never name a command that the help does not show.

For Other with an MCP server, follow MCP discovery. Draft `code-host.md` with the host and one pin, Check. Its project facts are the repo, the review reference in commit titles, and how to obtain and fetch the PR's exact base and head commits, including a fork's head. Bitbucket uses Other; there is no Bitbucket template.

Section B's round carries a second question, the project's default End state, with the options commit, merge-ready, and shipped. Recommend shipped in Standard mode and commit in Private mode.

> Explainer: implement, implement-spec, and hillclimb take this End state, with no question, when your words and the ticket name none. Commit stays on the current branch. Merge-ready opens a PR and drives it until it can merge. Shipped also merges it into the default branch.

Add the answer to the drafted `code-host.md`'s facts list, beside Host and Repo, as the line `- Default End state: <commit|merge-ready|shipped>`. The line is the same in the CLI shape and the MCP short shape. When `code-host.md` already exists and `missing_default_end_state` is true, ask this question alone and draft the existing file with only that line added. If Section C's cutover also revises `code-host.md`, add the line to that draft.

Then ask the project's Landing method in its own round, because its options depend on the Code host answer. Run the drafted `merge-methods` operation once: its command row, or the read-only tool that MCP discovery matches to it for an MCP Code host. Offer each Landing method that it allows now, with the Code host's own name, as the template's `merge-methods` row describes. On GitHub, recommend `rebase` when it is allowed. On another host, recommend the allowed method that lands without squash, such as the GitLab project's `merge_method`. Recommend nothing when the method to recommend is not allowed. If `merge-methods` is unsupported or fails, name the gap and skip this question. The line stays out, ship keeps squash first, and a later re-run asks again.

> Explainer: ship lands each PR with this method. Squash puts one commit on the default branch. A rebase puts each of the PR's commits there with new SHAs. A merge commit keeps the PR's commits and adds one commit that joins them.

Add the answer to the drafted `code-host.md`'s facts list, under the default End state, as the line `- Landing method: <method>`. When `code-host.md` already exists and `missing_landing_method` is true, ask this question alone and draft the existing file with only that line changed: remove every existing `- Landing method:` line and add the one chosen line. On a GitLab Code host, that draft also replaces the existing `merge-methods`, `merge-pr`, and `auto-merge` rows with the rows in [code-host-gitlab.md](./code-host-gitlab.md). Earlier GitLab rows do not read `squash_option` or send `squash=false`, so a non-squash pick could still squash. Show the replaced rows in the confirmation. If Section C's cutover or the default End state question also revises `code-host.md`, make these changes in that draft.

Section C, CI service.

> Explainer: The CI service runs this repo's builds and checks. It can differ from the Code host. Its logs, build reruns, secrets, and variables belong in `ci.md`.

When `ci.md` is missing and `code-host.md` exists, read that file before presenting a service-choice question. If it holds any of `ci-logs`, `rerun-ci`, `set-secret`, or `set-variable`, draft `ci.md` from those rows and their recorded service, tool, repo, and Check. Keep unsupported operations and their reasons. Reuse the recorded CI choice and facts.

- For a CLI source, copy the four rows that exist verbatim, including hand-edited arguments, input handling, and policy notes. The exception is a `rerun-ci` row that does not rerun the linked failed build in full, such as the earlier GitLab template's `glab api --method POST projects/:id/merge_requests/<iid>/pipelines`, which starts a new pipeline. Draft that operation as `unsupported` with the reason, as [ci-gitlab.md](./ci-gitlab.md) does. Draft `code-host.md` with only those rows removed. Keep every other row and note unchanged, including `required-checks` and `watch-checks`.
- For an MCP source, carry the rows' user-specific values, arguments, and policies into `ci.md`'s project facts. Follow MCP discovery and draft `ci.md` with Section C's MCP pins. Select `ci-logs`, `set-secret`, and `set-variable` from current tool descriptions, not copied pins. Draft `code-host.md` in Section B's short shape, keeping its server, project facts, and read-only Check pin, with no operation rows. Preserve Code host facts embedded in the old rows, such as exact-commit fetching and the review reference.

Include both complete drafts together as Results with step 6's write-confirmation round in the Flow CLI contribution before `ask`. Write neither file before that confirmation. The agent drafts this cutover; `project.ts` has no row-move command. Skip the service-choice question below when the old rows already supply that choice. Collect only a missing fact needed for these drafts through `ask`, not unrelated setup sections.

If the existing `code-host.md` has no CI rows, use the normal CI choices below. Still include an MCP Code host's short-shape draft in the same confirmation. A CLI Code host with no CI rows stays unchanged.

Recommend from the CI signals found in step 4, not from the remote or the Code host. Exactly one signal gives a recommendation: `.github/workflows/` means GitHub Actions, `.gitlab-ci.yml` means GitLab CI, and `Jenkinsfile` means Other. With none or several, recommend nothing. The question's options:

- GitHub Actions: builds and checks run on GitHub Actions, using the `gh` CLI.
- GitLab CI: builds and checks run on GitLab CI, using the `glab` CLI.
- Other: the user names, through the picker's custom answer, the MCP server or CLI already set up for this project.

For Other with a CLI, read its `--help` for each command group. Draft one row per operation id in [ci-github-actions.md](./ci-github-actions.md), in the same order, with the command and its arguments. Use `unsupported` where no command matches. Draft a read-only Check command from that help too. Never invent a command.

For Other with an MCP server, follow MCP discovery. Draft `ci.md` with the CI service and two pins:

- Check.
- `rerun-ci`: one tool that starts a fresh full rerun of the exact existing build with the same parameters and script. Record how its arguments come from the failed check's link. A changed-script replay, a new build using defaults, and a failed-stage-only retry do not fit.

`ci-logs`, `set-secret`, and `set-variable` stay unpinned. The project facts include values such as the Jenkins URL and job folder. A folder is not a substitute for the failed check's build link. Jenkins uses Other; there is no Jenkins template.

Section D, triage labels. This section runs whenever `triage-labels.md` is missing, whatever the tracker, because triage always ships. Call `ask` with one question, whether to keep the default triage labels, and the options Keep the defaults (Recommended) and Use other names. The defaults are the five canonical roles, each label string equal to its name: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. Only on Use other names (usually because the tracker already uses other names, such as `bug:triage` for `needs-triage`), call `ask` once more with one round containing one question per role to collect the names, so triage applies the existing labels instead of creating duplicates.

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
For an Other Code host with a CLI, write `code-host.md` in the shape of `code-host-github.md`, with the host, repo, tool, read-only Check command, review reference, and drafted command rows. For an MCP Code host, use Section B's server, project facts, and Check pin, without operation rows. In every `code-host.md`, fill in the repo from the remote and, for self-hosted GitLab, the host, and add Section B's default End state and Landing method lines. The seed templates have neither line.
For an Other CI service with a CLI, write `ci.md` in the shape of `ci-github-actions.md`, with the CI service, repo, tool, read-only Check command, and drafted rows. Fill in the CI repo and, for self-hosted GitLab, its host. Keep CI logs, build reruns, secrets, and variables only in `ci.md`.
For an Other CI service with an MCP server, use Section C's short shape, not the CLI operation rows.

For Section C's re-setup branch, use the existing rows and facts as directed there instead of replacing hand edits with seed-template text. The two drafts are the new `ci.md` and the revised existing `code-host.md`. Leave every other existing config file out of the draft and write set, apart from Section B's default End state line and Landing method changes.

In Private mode, change two drafts so that they point under the vstack root by absolute path:

- `issue-tracker.md` for local markdown: replace every `.scratch/` path, the Wayfinding map, ticket, and frontier paths included, with `<vstack_root>/artifacts/`.
- `domain.md`: the domain docs live in `<vstack_root>/domain/`, as `GLOSSARY.md` (or `GLOSSARY-MAP.md`) and `adr/`, in place of the repo-root files. Add one line saying that the repo's own tracked `GLOSSARY.md` and `docs/adr/` are read as well when they exist.

Publish each complete draft and, in Standard mode, the `## vstack` block changes (see step 7) as Results with one complete confirmation round for the whole write set. Call `ask` with the receipt's generated question under flow-page's "Every ask in a Flow" contract. Its question offers Write it (Recommended) and Change something. On Change something, make the user's edits and re-ask with `again`, publishing the revised drafts with the linked round before `ask`. A section choice is not write approval. Until this confirmation, keep the project files unchanged.

### 7. Write

Standard mode:

1. When `block_file_dirty` from step 1 is true, tell the user that `<block_file>` has uncommitted changes and that the setup commit is going to include them. Call `ask` with the options Go on and include them, and Stop so I can commit them first. On Stop, stop.
2. Write each config file that this run drafted: `docs/vstack/issue-tracker.md`, `docs/vstack/code-host.md`, `docs/vstack/ci.md`, `docs/vstack/triage-labels.md`, and `docs/vstack/domain.md`, or only the missing ones on a re-run plus Section C's confirmed `code-host.md` cutover and the confirmed default End state line and Landing method changes in an existing `code-host.md`.
3. Pick the file for the block. When `CLAUDE.md` exists, edit it. Else when `AGENTS.md` exists, edit it. When neither exists, call `ask` with the options `CLAUDE.md` and `AGENTS.md` and no recommended option, and create the one the user picks. Never create `AGENTS.md` when `CLAUDE.md` exists, or the other way round.
4. When the file already has a `## vstack` block, update it in place instead of adding a second one, and leave the other sections as they are. On a CI-only re-run, preserve its existing subsections and add only a missing CI service subsection. A re-run that only adds the default End state or the Landing method leaves the block unchanged. The block:

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

1. Write each drafted config file to `<vstack_root>/config/`: `issue-tracker.md`, `code-host.md`, `ci.md`, `triage-labels.md`, and `domain.md`, or only the missing ones on a re-run plus Section C's confirmed `code-host.md` cutover and the confirmed default End state line and Landing method changes in an existing `code-host.md`. Creating that directory turns Private mode on for every worktree of this repo.
2. Write no `## vstack` block, change no tracked file and no ignore file, and commit nothing.

In both modes, check each config that this run or its Migration wrote. For a CLI config, run its read-only Check command once. For an MCP config, call its pinned read-only Check tool exactly once with the recorded arguments. A config with no tool or an unsupported Check gets a reported gap, not an invented call.

On failure, print `WARN <config name>: <named tool or command and observed failure>. Remedy: <log in to the CLI, or connect the named MCP server>.` Keep the written file. An MCP connection check is one tool call, not a fallback sequence.

### 8. Done

Publish the Result described above. Tell the user whether setup is complete, in which mode, and where the config is. Repeat every machine line that still fails unchanged. Report the Migration result: applied and skipped items, remaining manual hits, and notices. When the user set up beside the Matt files, name the Matt files that remain.

List the skills that read the config:

- `issue-tracker.md`: to-spec, to-tickets, triage, wayfinder, code-review, why, implement-spec, and session.
- `code-host.md`: implement and its PR chain (open-pr, babysit, and ship), implement-spec, hillclimb, code-review, blast-radius, why, and session. Without it, implement offers only End state commit, and code-review and blast-radius cannot review a PR. Its default End state is the End state that implement, implement-spec, and hillclimb take when the user's words and the ticket name none. Its Landing method is how ship lands each PR.
- `ci.md`: implement, babysit, and wizard. Without it, implement offers only End state commit. Logs, build reruns, secrets, and variables use this file.
- `triage-labels.md`: triage, to-spec, and to-tickets.
- `domain.md` and the domain docs: domain-modeling, grill-with-docs, improve-codebase-architecture, codebase-design, diagnosing-bugs, tdd, and wait-what.

Say that the user can edit these files directly later. Re-running this skill adds only missing config files, with one cutover when `ci.md` is missing: it also removes the moved CI rows from `code-host.md` and reduces an MCP Code host to its short shape after confirmation. When `code-host.md` has no default End state or no Landing method, a re-run asks only the missing questions and adds their lines after confirmation. Every other existing config stays unchanged. To switch a choice, edit its file, or delete the file and run this skill again.

Then name the next step. setup-app-verification creates this project's Verify skill. implement, hillclimb, and forensics use it for their own checks, and the final Verifier drives it at every End state. Tell the user to start a new session (`/new`) and run `/skill:grill-with-docs` to plan verification. implement uses `skill://setup-app-verification` to create the Verify skill in that run.

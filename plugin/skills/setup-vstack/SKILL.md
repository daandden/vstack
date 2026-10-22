---
name: setup-vstack
description: Check this machine's omp settings for vstack, then configure this repo for the vstack skills (its issue tracker, Code host, triage label vocabulary, and domain doc layout) in Standard or Private mode. Offers to migrate a repo set up for Matt Pocock's skills first. Run once before first use of the other vstack skills, and again to add a config file that is missing.
disable-model-invocation: true
---

# Setup vstack

Two parts, in this order. The machine section checks the omp settings vstack needs. The project section writes this repo's vstack config:

- Issue tracker: where issues live (GitHub by default; local markdown also works out of the box).
- Code host: the service that holds the remote and its PRs, and the tool that runs each PR operation.
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
- `missing_config`: the config files that the mode's config directory does not have yet, from `issue-tracker.md`, `code-host.md`, `triage-labels.md`, and `domain.md`.
- `block_file`: `CLAUDE.md` when it exists, else `AGENTS.md` when it exists, else null. `block_exists`: that file already holds a `## vstack` block. `block_file_dirty`: that file has uncommitted changes.

Keep `block_file_dirty` from this first read for step 7. Edits that this run's Migration makes to the block file do not count.

### 2. Matt check

Read `skill://vstack-tmp` and resolve the project Scratch dir once. Every worktree of the repo shares that dir, so this run needs its own entry. Run `mkdir -p <Scratch dir>/setup-vstack && mktemp -d <Scratch dir>/setup-vstack/run-XXXXXX`. Keep the path it prints as the run entry. Run `migrate.ts plan > <run entry>/plan-1.json`. The plan reads this repo and changes nothing. When its `items` list is empty, go on to step 3. Otherwise read [references/migration.md](references/migration.md) and follow it. The Matt files are the `from` paths of the plan's items inside `root` or `common_dir`. A `code-host` item's `from` is a shipped template, not a Matt file. The reference returns here in one of three ways:

- The user set up beside the Matt files, through the first question or Cancel. Keep the Matt files for step 8 and go on to step 3.
- The Migration is incomplete. Stop the run after showing the failure.
- The Migration applied. Run `project.ts state` again. Use its facts from here on, except `block_file_dirty`. Keep the Migration paths and the mode that Migration settled.

### 3. Mode

When `mode` is set, or Migration settled the mode, tell the user the mode and keep it. Then take the first branch that applies:

- `missing_config` is empty and this run's Migration changed nothing: tell the user that every config file exists and that they can edit any of them directly. Skip to step 8.
- `missing_config` is empty and this run's Migration changed files, in Standard mode: skip steps 4 and 5. Draft only the `## vstack` block in step 6. Go on to the commit in step 7.
- `missing_config` is empty and this run's Migration changed files, in Private mode: skip to step 8.
- Otherwise: run only the sections for the missing files in step 5. Draft and write only those files in steps 6 and 7. A repo set up before the Code host existed misses only `code-host.md`, so it gets one section.

When `mode` is null, call `ask` with two options:

- Standard (Recommended): the config is tracked in `docs/vstack/`, with a `## vstack` block in `CLAUDE.md` or `AGENTS.md`, and setup-vstack commits it.
- Private: the config lives in `<vstack_root>/config/`, inside the git common dir, so every worktree of this repo shares it and git never tracks it. Nothing is committed. The `vstack-private-mode` rule then sends every vstack skill there.

### 4. Explore

Look at the repo to understand its starting state. Read whatever exists; do not assume:

- `git remote -v` and `.git/config`: does a remote point at GitHub, GitLab, Bitbucket, or another host, and at which repo?
- The MCP servers this session reaches (tools named `mcp__<server>_<tool>`, top-level or under `xd://`), when the remote is not GitHub or GitLab. A server for the Code host is a likely tool for it.
- `CLAUDE.md` and `AGENTS.md` at the repo root, and the `## vstack` block in one of them.
- `GLOSSARY.md` and `GLOSSARY-MAP.md` at the repo root, and in Private mode also under `<vstack_root>/domain/`.
- `docs/adr/` and any `src/*/docs/adr/` directories.
- The config from an earlier run: `docs/vstack/` in Standard mode, `<vstack_root>/config/` in Private mode.
- `.scratch/`: a sign that a local-markdown issue tracker is already in use.
- Monorepo signals: a `pnpm-workspace.yaml`, a `workspaces` field in `package.json`, or a populated `packages/*` with its own `src/`. Only a large multi-package repo has them. Without them the repo is single-context, which is almost every repo.

### 5. Present findings and settle each section

Summarize what is present and what is missing. Then take the sections in order, one `ask` per section. Put the recommended answer first and mark it Recommended, so the user can accept it in one pick. Add a one-line explainer only when the choice really branches.

Section A, issue tracker.

> Explainer: The issue tracker is where issues live for this repo. Skills like to-tickets, triage, and to-spec read from it and write to it. They need to know whether to call `gh issue create`, write a markdown file, or follow some other workflow you describe. Pick the place where you actually track work for this repo.

Recommend GitHub when a remote points at GitHub, GitLab when a remote points at GitLab (`gitlab.com` or a self-hosted host), and local markdown otherwise. The `ask` options:

- GitHub: issues live in the repo's GitHub Issues (uses the `gh` CLI).
- GitLab: issues live in the repo's GitLab Issues (uses the [`glab`](https://gitlab.com/gitlab-org/cli) CLI).
- Local markdown: issues live as files under `.scratch/<feature>/` in Standard mode, or `<vstack_root>/artifacts/<feature>/` in Private mode. Good for solo projects or repos without a remote.
- Other (Jira, Linear, and so on): the user describes the workflow in one paragraph through the Other answer of `ask`, and that goes into the file as prose.

The GitHub and GitLab templates carry a "PRs as a request surface" flag, off by default. Leave it off and do not raise it. A user who wants external PRs in the triage queue can change the flag in the file later.

Section B, Code host.

> Explainer: The Code host is the service that holds this repo's remote and its PRs. implement's PR chain (open-pr, babysit, ship), code-review, blast-radius, why, session, and wizard run every PR operation through `code-host.md`. A repo without it can only commit, and code-review and blast-radius cannot review a PR. The Code host is a separate choice from the issue tracker. For example, a Bitbucket repo can track its issues in Jira.

Recommend GitHub when a remote points at `github.com`, GitLab when a remote points at GitLab (`gitlab.com` or a self-hosted host), and no option otherwise. The `ask` options:

- GitHub: PRs live on GitHub (uses the `gh` CLI).
- GitLab: merge requests live on GitLab (uses the `glab` CLI).
- Other (Bitbucket Cloud, Bitbucket Data Center, and so on): the user names, through the Other answer of `ask`, the MCP server or CLI that is already set up for this project.

For Other, draft the operation rows yourself. Read the named MCP server's tool list or the CLI's `--help` output for each command group. Write one row per operation id in [code-host-github.md](./code-host-github.md), in the same order, with the tool or command and the arguments it needs. Write `unsupported` for each id with no matching tool or command. Never write a tool or command that the list or the help does not show. The user checks the rows in step 6.

Section C, triage labels. This section runs whenever `triage-labels.md` is missing, whatever the tracker, because triage always ships. Call `ask` with one question, whether to keep the default triage labels, and the options Keep the defaults (Recommended) and Use other names. The defaults are the five canonical roles, each label string equal to its name: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. Only on Use other names (usually because the tracker already uses other names, such as `bug:triage` for `needs-triage`), call `ask` once more with one question per role to collect the names, so triage applies the existing labels instead of creating duplicates.

Section D, domain docs. Default to single-context: one `GLOSSARY.md` plus `docs/adr/` at the repo root. This fits almost every repo; write it without a question. Only when exploration found monorepo signals, call `ask` with single-context and multi-context (a root `GLOSSARY-MAP.md` that points to one `GLOSSARY.md` per context).

### 6. Draft and confirm

Write the drafts from the seed templates in this skill's directory:

- [issue-tracker-github.md](./issue-tracker-github.md): GitHub issue tracker
- [issue-tracker-gitlab.md](./issue-tracker-gitlab.md): GitLab issue tracker
- [issue-tracker-local.md](./issue-tracker-local.md): local-markdown issue tracker
- [code-host-github.md](./code-host-github.md): GitHub Code host
- [code-host-gitlab.md](./code-host-gitlab.md): GitLab Code host
- [triage-labels.md](./triage-labels.md): label mapping
- [domain.md](./domain.md): domain doc consumer rules and layout

For an Other issue tracker, write `issue-tracker.md` from scratch from the user's description. For an Other Code host, write `code-host.md` in the shape of `code-host-github.md`, with the host, the repo, the tool, a read-only check, the review reference, and the drafted rows. In every `code-host.md`, fill in the repo from the remote and, for a self-hosted GitLab, the host.

In Private mode, change two drafts so that they point under the vstack root by absolute path:

- `issue-tracker.md` for local markdown: replace every `.scratch/` path, the Wayfinding map, ticket, and frontier paths included, with `<vstack_root>/artifacts/`.
- `domain.md`: the domain docs live in `<vstack_root>/domain/`, as `GLOSSARY.md` (or `GLOSSARY-MAP.md`) and `adr/`, in place of the repo-root files. Add one line saying that the repo's own tracked `GLOSSARY.md` and `docs/adr/` are read as well when they exist.

Show the user each draft and, in Standard mode, the `## vstack` block (see step 7). Then call `ask` with the options Write it (Recommended) and Change something. On Change something, make the user's edits, show the new drafts, and call `ask` again.

### 7. Write

Standard mode:

1. When `block_file_dirty` from step 1 is true, tell the user that `<block_file>` has uncommitted changes and that the setup commit is going to include them. Call `ask` with the options Go on and include them, and Stop so I can commit them first. On Stop, stop.
2. Write each config file that this run drafted: `docs/vstack/issue-tracker.md`, `docs/vstack/code-host.md`, `docs/vstack/triage-labels.md`, and `docs/vstack/domain.md`, or only the missing ones on a re-run.
3. Pick the file for the block. When `CLAUDE.md` exists, edit it. Else when `AGENTS.md` exists, edit it. When neither exists, call `ask` with the options `CLAUDE.md` and `AGENTS.md` and no recommended option, and create the one the user picks. Never create `AGENTS.md` when `CLAUDE.md` exists, or the other way round.
4. When the file already has a `## vstack` block, update that block in place instead of adding a second one, and leave the other sections as they are. The block:

   ```markdown
   ## vstack

   ### Issue tracker

   [one-line summary of where issues are tracked]. See `docs/vstack/issue-tracker.md`.

   ### Code host

   [one-line summary of the Code host and its tool]. See `docs/vstack/code-host.md`.

   ### Triage labels

   [one-line summary of the label vocabulary]. See `docs/vstack/triage-labels.md`.

   ### Domain docs

   [one-line summary of the layout: "single-context" or "multi-context"]. See `docs/vstack/domain.md`.
   ```

5. Commit. Take the title from the repo's convention: read `git log --format=%s -n 20` on the default branch (`git symbolic-ref --short refs/remotes/origin/HEAD`, else the current branch) and follow the pattern you see there. When no convention is visible, use Conventional Commits: `chore: set up vstack config`. Run `project.ts commit --title "<title>"`, with one `--migration-path <path>` per Migration path from step 2. It stages the four config files, the block file, and the Migration paths, deletions and both sides of a move included, never `-A` on the whole repo. It commits them alone on the current branch; anything else the user had staged stays staged. It prints `commit`, `title`, and `paths` as JSON, with `commit` null when nothing changed since the last setup commit. Exit 2 means it refused: show its message.

Private mode:

1. Write each drafted config file to `<vstack_root>/config/`: `issue-tracker.md`, `code-host.md`, `triage-labels.md`, and `domain.md`, or only the missing ones on a re-run. Creating that directory turns Private mode on for every worktree of this repo.
2. Write no `## vstack` block, change no tracked file and no ignore file, and commit nothing.

In both modes, when this run or its Migration wrote `code-host.md`, check its tool once with a read-only call. Run the file's Check command for a CLI. For an MCP server, call one read-only tool from the drafted rows, such as `list-prs`. If the call fails, print `WARN code-host: <what failed>. Remedy: <log in to the CLI, or connect the MCP server>.` Keep the written file either way.

### 8. Done

Tell the user the setup is complete, in which mode, and where the config is. Repeat every machine line that still fails. Report the Migration result: applied and skipped items, remaining manual hits, and notices. When the user set up beside the Matt files, name the Matt files that remain.

List the skills that read the config:

- `issue-tracker.md`: to-spec, to-tickets, triage, wayfinder, code-review, and why.
- `code-host.md`: implement and its PR chain (open-pr, babysit, and ship), implement-spec, hillclimb, code-review, blast-radius, why, session, and wizard. Without it, implement offers only End state commit, and code-review and blast-radius cannot review a PR.
- `triage-labels.md`: triage, to-spec, and to-tickets.
- `domain.md` and the domain docs: domain-modeling, grill-with-docs, improve-codebase-architecture, codebase-design, diagnosing-bugs, tdd, and wait-what.

Say that the user can edit these files directly later. Re-running this skill adds only the config files that are missing. To switch a choice, edit its file, or delete the file and run this skill again.

Then name the next step. setup-app-verification creates this project's Verify skill, which gives live proof to implement, forensics, hillclimb, and ship's verifiers. Tell the user to start a new session (`/new`) and run `/skill:grill-with-docs` to plan live proof. implement uses `skill://setup-app-verification` to create the Verify skill in that run.

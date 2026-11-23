---
description: vstack Private mode keeps a repo's vstack config and artifacts under the git common dir, out of git
alwaysApply: true
---

# vstack Private mode

The vstack root is `<git common dir>/vstack` when `<git common dir>/vstack/config/` exists (Private mode), else the main checkout's root (first `worktree` line of `git worktree list --porcelain`). The git common dir is `git rev-parse --path-format=absolute --git-common-dir`. The top-level agent resolves the vstack root once and passes it as an absolute path in every subagent prompt; a subagent uses the path from its prompt and never re-resolves the git common dir (in an isolated clone that resolves to the clone's own copy, and what it writes there is lost).

In Standard mode, vstack skills use the tracked paths they name (`docs/vstack/`, `GLOSSARY.md`, `docs/adr/`, `.omp/skills/verify-<app>/`). Resolve a `.scratch/` path a skill names against the checkout the session runs in, not through the vstack root. It lands in the main checkout only when the session runs there. In Private mode, the vstack root is shared by every worktree of the repo, and git never tracks it.

Active ADRs are rules. The ADR archive lives at `archive/<date>T<HHMM>/` inside each ADR directory in Standard mode, Private mode, and each context. Each run uses a new folder and refuses an existing destination. It is history that skills read to learn why, never a rule to respect.

In Private mode:

- `config/` holds `issue-tracker.md`, `triage-labels.md`, `domain.md`, and any other vstack config, and replaces `docs/vstack/`: wherever a skill names `docs/vstack/<file>` or the `## vstack` block, read `<vstack root>/config/<file>` instead. A missing file there still needs `/skill:setup-vstack`.
- `domain/` holds `GLOSSARY.md` (`GLOSSARY-MAP.md` for several contexts) and `adr/`, in place of the repo-root files. Read the repo's own tracked domain docs as well.
- `artifacts/<topic>/` holds every other vstack artifact: local tickets, specs, maps, prototypes. Keep each skill's file names and subdirectories, use a new topic for independent work, and keep the existing path when continuing.
- `skills/verify-<app>/` holds each Verify skill. Each checkout links it with an absolute symlink at `.omp/skills/verify-<app>` that points there, and `.omp/skills/verify-*` is a line in `<git common dir>/info/exclude`.
- Never write a `## vstack` block into a tracked file. Never stage, commit, branch, or push vstack config or artifacts, and leave shared ignore files alone. Link artifacts by absolute path. Publishing one anywhere needs the user's approval through omp's native `ask`. When bound to a Flow, follow `skill://flow-page`'s "Every ask in a Flow" contract. Publish the approval question through the Flow CLI before `ask`, without publishing the private artifact before approval. Record the observed response separately. Outside a Flow, present the approval context in chat.
- Product code, tests, and docs follow the normal workflow. Remote issue-tracker operations are not private.

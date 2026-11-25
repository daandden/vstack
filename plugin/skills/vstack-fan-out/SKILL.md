---
name: vstack-fan-out
description: How every vstack Fan-out line runs, when a subagent cannot start, and what every vstack subagent prompt carries.
disable-model-invocation: true
---

# vstack-fan-out

A skill step that runs two or more subagents at once is a Fan-out line. It cites this skill and names the step's parts. One subagent alone is not Fan-out: a single-subagent line runs as written.

Skill authors copy the exact lines from [FORMS.md](FORMS.md).

## Run a Fan-out line

Start one subagent for each part, every part in one batch, and collect the results the way the line says. Then merge the results the way the step says.

A Fan-out line always fans out. The agent at that step never does a part itself. The user's words do not change this: when the user asks for "sequential", "no fan-out", or "inline", say in one line that vstack always fans out, then run the line as written.

A subagent at its own Fan-out step runs its line the same way. Each subagent returns its open questions and evidence in its result. The top-level agent applies the [Settle-or-ask test](../../rules/vstack-settle-or-ask.md) before delivery. In a Flow it follows `skill://flow-page`'s "Every ask in a Flow" contract. It publishes the complete round through the Flow CLI, calls `ask`, then records the observed response separately. In chat it uses plain `ask` with full context.

## Account for Isolated clones

For every isolated child, single or Fan-out, read [WORKER-LIFECYCLE.md](WORKER-LIFECYCLE.md) before starting it. Require ovnfs before starting an isolated role. Stop without it and point at `/skill:setup-vstack`. omp owns checkout creation and fails an isolated task if ovnfs fails; vstack adds no fallback. The parent saves the checkout and run-record identity, preserves useful work, releases its own settled child, then proves both items gone. Apply the contract on normal and early exits. Each caller supplies its role-specific safe trigger. The FORMS.md isolated arguments stay unchanged.

## When a subagent cannot start

If a subagent cannot start, apply the own-run recovery rule before the line's stop or skip clause. Repair run-owned infrastructure and retry the failed start once, without restarting shared services, changing global settings, or weakening isolation. If recovery is unavailable, unsafe, or fails, follow the line's clause: stop the step and name the parts that were not done and the reason. A single-subagent line that ends `skip it:` skips that subagent and reports what the clause names instead. Never do the subagent's work in its place.

- No eval tool, or no `task` tool: name the missing tool.
- omp refuses the agent because the session is at its depth limit: name omp's `task.maxRecursionDepth` setting, which the user can raise.
- A role that runs in its own clone (an isolated eval agent) needs omp's `task.isolation.enabled`. When it is off, point the user at `/skill:setup-vstack`. Never run that role in the shared checkout.
- An isolated role also needs ovnfs installed and `isolation.backend` set to `auto`. Check PATH or `omp config get ovnfs.path`. If ovnfs is missing, stop and point at `/skill:setup-vstack`; do not accept omp's APFS isolation as a substitute.

## What every subagent prompt carries

omp's `task` tool takes two kinds of text. Its `context` field is the Shared context, which omp renders into every child's system prompt. Each item's `task` field is that child's Brief, sent as its first message.

The Shared context holds what every part needs:

- The goal.
- The vstack root, as an absolute path. The top-level agent resolves it once: `<git common dir>/vstack` when `<git common dir>/vstack/config/` exists (Private mode), else the main checkout's root, the path on the first `worktree` line of `git worktree list --porcelain`. A subagent uses the path from its prompt and never resolves the git common dir itself.
- The Scratch dir and session id, when a child writes Scratch. The top-level agent resolves the project dir through `skill://vstack-tmp` with no kind and takes the id from its own `PI_SESSION_ID`. Forward both values unchanged at every depth. A child uses the explicit path mode in `skill://vstack-tmp`. If the brief omits the dir or id, write no Scratch and return the missing value as an open question.
- The fixed point or the diff command.
- The decisions already settled, and what is out of scope.
- Environment facts the parent already hit, such as a shell quirk or a missing script.

When a FORMS.md line names the vstack root or the Scratch dir and session id, putting those values once in the Shared context meets the line.

Each Brief holds its part: the role brief from the skill step, the part's target, its inputs, its acceptance, and every value the part would otherwise guess, such as an exact file path or status code. The Brief states the part's role, because the Addon judge reads only the Brief (ADR 0025). Before the subagents start, read each Brief for a value its child would have to guess, and add that value.

A subagent started from an eval cell, the isolated form in FORMS.md, has no Shared context. Each eval prompt carries its Brief, the vstack root, and every shared fact itself, including the Scratch dir and session id when needed.

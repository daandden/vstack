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

A subagent at its own Fan-out step runs its line the same way. Each subagent returns its open questions in its result. In a Flow-bound run, the top-level agent follows `skill://flow-page`'s "Every ask in a Flow" contract. It publishes the complete round through the Flow CLI, calls `ask`, then records the observed response separately. Genuinely unbound runs retain `ask` with full context in chat.

## Account for Isolated clones

For every isolated child, single or Fan-out, read [WORKER-LIFECYCLE.md](WORKER-LIFECYCLE.md) before starting it. The parent records retention or releases its own settled child after preservation, then observes clone disappearance. Apply the contract on normal and early exits. Each caller supplies its role-specific safe trigger. The FORMS.md lines stay unchanged.

## When a subagent cannot start

If a subagent cannot start, follow the line's stop clause: stop the step, and name the parts that were not done and the reason. A single-subagent line that ends `skip it:` skips that subagent and reports what the clause names instead. Never do the subagent's work in its place.

- No eval tool, or no `task` tool: name the missing tool.
- omp refuses the agent because the session is at its depth limit: name omp's `task.maxRecursionDepth` setting, which the user can raise.
- A role that runs in its own clone (an isolated eval agent) needs omp's `task.isolation.enabled`. When it is off, point the user at `/skill:setup-vstack`. Never run that role in the shared checkout.

## What every subagent prompt carries

omp's `task` tool takes two kinds of text. Its `context` field is the Shared context, which omp renders into every child's system prompt. Each item's `task` field is that child's Brief, sent as its first message.

The Shared context holds what every part needs:

- The goal.
- The vstack root, as an absolute path. The top-level agent resolves it once: `<git common dir>/vstack` when `<git common dir>/vstack/config/` exists (Private mode), else the main checkout's root, the path on the first `worktree` line of `git worktree list --porcelain`. A subagent uses the path from its prompt and never resolves the git common dir itself.
- The Scratch dir, when a subagent writes Scratch. The top-level agent runs `bun "$(realpath skill://vstack-tmp/scripts/path.ts)"` once from the repo and passes the dir it prints. A subagent adds its own kind (`<Scratch dir>/<kind>/`) and never runs the script.
- The fixed point or the diff command.
- The decisions already settled, and what is out of scope.
- Environment facts the parent already hit, such as a shell quirk or a missing script.

When a FORMS.md line names the vstack root and the Scratch dir, putting them once in the Shared context meets the line.

Each Brief holds its part: the role brief from the skill step, the part's target, its inputs, its acceptance, and every value the part would otherwise guess, such as an exact file path or status code. The Brief states the part's role, because the Addon judge reads only the Brief (ADR 0025). Before the subagents start, read each Brief for a value its child would have to guess, and add that value.

A subagent started from an eval cell, the isolated form in FORMS.md, has no Shared context. Each eval prompt carries its Brief, the vstack root, the Scratch dir, and every shared fact itself.

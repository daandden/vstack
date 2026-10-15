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

A subagent at its own Fan-out step runs its line the same way. Each subagent returns its open questions in its result, and the top-level agent asks them with `ask`.

## When a subagent cannot start

If a subagent cannot start, follow the line's stop clause: stop the step, and name the parts that were not done and the reason. A single-subagent line that ends `skip it:` skips that subagent and reports what the clause names instead. Never do the subagent's work in its place.

- No eval tool, or no `task` tool: name the missing tool.
- omp refuses the agent because the session is at its depth limit: name omp's `task.maxRecursionDepth` setting, which the user can raise.
- A role that runs in its own clone (an isolated eval agent) needs omp's `task.isolation.enabled`. When it is off, point the user at `/skill:setup-vstack`. Never run that role in the shared checkout.

## What every subagent prompt carries

- The role brief from the skill step.
- The vstack root, as an absolute path. The top-level agent resolves it once: `<git common dir>/vstack` when `<git common dir>/vstack/config/` exists (Private mode), else the main checkout's root, the path on the first `worktree` line of `git worktree list --porcelain`. A subagent uses the path from its prompt and never resolves the git common dir itself.
- The Scratch dir, when the subagent writes Scratch. The top-level agent runs `bun "$(realpath skill://vstack-tmp/scripts/path.ts)"` once from the repo and passes the dir it prints. A subagent adds its own kind (`<Scratch dir>/<kind>/`) and never runs the script.

# Subagent forms

This file is the single source of the lines vstack skill text uses to start subagents. Copy a form, fill each `<…>` slot, and keep every other word. Each form is one line in the skill, because `check-register` reads it line by line (rules `fan-out` and `single-spawn` in `house-style.yaml`). It skips code fences, so the forms below are examples, not live lines.

Slots:

- `<unit>`: what one part is (a file, a review axis, a design, a PR, a hypothesis).
- `vstack-<role>`: an agent the plugin ships. `vstack-explorer` reads, `vstack-worker` writes, `vstack-verifier` runs checks.
- `<role brief>`: what the subagent does and returns, from the skill's text.
- `<reason>`: what the stop reports, beyond the undone parts and why the subagents did not start.
- When the subagent writes Scratch, add `, the Scratch dir and session id` after `the vstack root`. Forward both values unchanged. If the id is missing, the subagent writes no Scratch and returns it as an open question.

## Fan-out

A step that runs two or more subagents at once. It always fans out: skill://vstack-fan-out says how the line runs and what happens when a subagent cannot start. Put the lead-in sentence on the line before it, so that the agent reads that skill first.

```
Before this step, read skill://vstack-fan-out.

Fan-out (skill://vstack-fan-out): parts: one per <unit>. One `task` call; `tasks[]` has one item per part, each with `agent: "vstack-<role>"`. Each `task`: <role brief>, the vstack root. <Wait for every result. | Do not wait; keep working.> If they cannot start, stop: <reason>.
```

Roles that fan out in their own clones (compare-attempts runners, hillclimb workers, implement-spec implementers, wayfinder research runners, final Verifiers) use this eval form:

```
Fan-out (skill://vstack-fan-out): parts: one per <unit>. One eval cell: per part, `agent(<prompt>, agent="vstack-<role>", isolated=True, apply=False, merge=False)`; <collect>. Each prompt: <role brief>, the vstack root. <What the parent does with each `patchPath`.> If they cannot start or isolation is off, stop: <reason>.
```

`<collect>` says how the parent takes the results. A parent that compares the results together uses `` `wait()` on all handles``. A parent that acts on each result as it arrives uses ``no `wait()`, because each handle delivers its own result when it settles``, and runs the line again for each new set of parts.

## Single subagent

One subagent is not Fan-out. A step with one part uses this line, or does the part itself when the skill says so.

```
Spawn one `vstack-<role>` via `task` (`agent: "vstack-<role>"`): <role brief>, the vstack root. <Wait for its result. | Do not wait; keep working.> If it cannot be spawned, stop: <reason>.
```

Only compare-attempts' cross-judge ends another way: `If it cannot be spawned, skip it: <what the step reports instead>.` Its report records `cross-judge: not run`, and the caller still never does the cross-judge's work. Every other single-subagent line stops.

A role that runs in its own clone uses the eval form. If `task.isolation.enabled` is off, the skill stops and points at `/skill:setup-vstack` (ADR 0007).

Before either isolated form, follow skill://vstack-fan-out's ovnfs prerequisite and WORKER-LIFECYCLE proof. Missing ovnfs stops the role at `/skill:setup-vstack`. Keep the isolated arguments below unchanged. omp creates the checkout and supplies no fallback when ovnfs fails.

```
Spawn one `vstack-<role>` via eval `agent(<prompt>, agent="vstack-<role>", isolated=True, apply=False, merge=False)`: <role brief>, the vstack root. <Wait for its result. | Do not wait; keep working.> If it cannot be spawned, stop: <reason>.
```

## What the lint checks

In adapt, merge, and original markdown, outside frontmatter and code fences:

- A Fan-out line follows one of the two forms above. The eval form carries `isolated=True, apply=False, merge=False` and says how it collects. Each form names only vstack agents, carries the vstack root, and ends with a stop clause.
- The judge-gated forms are gone: the old gate line, the old fixed line, and the fan-out and inline branch lines fail.
- A `Spawn one` line names the same vstack agent twice, carries the vstack root, and ends with `If it cannot be spawned, stop:`. Only compare-attempts' cross-judge line, which records `cross-judge: not run`, may end with `If it cannot be spawned, skip it:`.
- Any other line that names an agent names a vstack agent, and a `task` or eval agent call with no agent named fails.
- An agent's `spawns:` lists only vstack agents, never `*`.
- A Headless run (a separate omp process) fails outside skill-creator.

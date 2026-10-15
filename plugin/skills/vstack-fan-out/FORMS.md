# Subagent forms

This file is the single source of the lines vstack skill text uses to start subagents. Copy a form, fill each `<…>` slot, and keep every other word. Each form is one line in the skill, because `check-register` reads it line by line (rules `fan-out` and `single-spawn` in `house-style.yaml`). It skips code fences, so the forms below are examples, not live lines.

Slots:

- `<unit>`: what one part is (a file, a review axis, a design, a PR, a hypothesis, a figure).
- `vstack-<role>`: an agent the plugin ships. `vstack-explorer` reads, `vstack-worker` writes, `vstack-verifier` runs checks, `vstack-diagram-drawer` draws figures.
- `<role brief>`: what the subagent does and returns, from the skill's text.
- `<reason>`: what the stop reports, beyond the undone parts and why the subagents did not start.
- When the subagent writes Scratch, add `, the Scratch dir` after `the vstack root`.

## Fan-out

A step that runs two or more subagents at once. It always fans out: skill://vstack-fan-out says how the line runs and what happens when a subagent cannot start. Put the lead-in sentence on the line before it, so that the agent reads that skill first.

```
Before this step, read skill://vstack-fan-out.

Fan-out (skill://vstack-fan-out): parts: one per <unit>. One `task` call; `tasks[]` has one item per part, each with `agent: "vstack-<role>"`. Each `task`: <role brief>, the vstack root. <Wait for every result. | Do not wait; keep working.> If they cannot start, stop: <reason>.
```

Roles that fan out in their own clones (compare-attempts runners, hillclimb workers, implement-spec implementers, wayfinder research runners, ship verifiers) use this eval form:

```
Fan-out (skill://vstack-fan-out): parts: one per <unit>. One eval cell: per part, `agent(<prompt>, agent="vstack-<role>", isolated=True, apply=False, merge=False)`; <collect>. Each prompt: <role brief>, the vstack root. <What the parent does with each `patchPath`.> If they cannot start or isolation is off, stop: <reason>.
```

`<collect>` says how the parent takes the results. A parent that compares the results together uses `` `wait()` on all handles``. A parent that acts on each result as it arrives uses ``no `wait()`, because each handle delivers its own result when it settles``, and runs the line again for each new set of parts.

## Single subagent

One subagent is not Fan-out. A step with one part uses this line, or does the part itself when the skill says so.

```
Spawn one `vstack-<role>` via `task` (`agent: "vstack-<role>"`): <role brief>, the vstack root. <Wait for its result. | Do not wait; keep working.> If it cannot be spawned, stop: <reason>.
```

When the step has a result without the subagent, the last sentence is `If it cannot be spawned, skip it: <what the step reports instead>.` The caller still never does the subagent's work (today only compare-attempts' cross-judge).

A role that runs in its own clone uses the eval form. If `task.isolation.enabled` is off, the skill stops and points at `/skill:setup-vstack` (ADR 0007).

```
Spawn one `vstack-<role>` via eval `agent(<prompt>, agent="vstack-<role>", isolated=True, apply=False, merge=False)`: <role brief>, the vstack root. <Wait for its result. | Do not wait; keep working.> If it cannot be spawned, stop: <reason>.
```

## What the lint checks

In adapt, merge, and original markdown, outside frontmatter and code fences:

- A Fan-out line follows one of the two forms above. The eval form carries `isolated=True, apply=False, merge=False` and says how it collects. Each form names only vstack agents, carries the vstack root, and ends with a stop clause.
- The judge-gated forms are gone: the old gate line, the old fixed line, and the fan-out and inline branch lines fail.
- A `Spawn one` line names the same vstack agent twice, carries the vstack root, and ends with `If it cannot be spawned, stop:` or `If it cannot be spawned, skip it:`.
- Any other line that names an agent names a vstack agent, and a `task` or eval agent call with no agent named fails.
- An agent's `spawns:` lists only vstack agents, never `*`.
- A Headless run (a separate omp process) fails outside skill-creator.

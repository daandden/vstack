# Subagent forms

This file is the single source of the lines vstack skill text uses to start subagents. Copy a form, fill each `<…>` slot, and keep every other word. Each form is one line in the skill, because `check-register` reads it line by line (rules `fan-out-block`, `single-spawn`, and `fixed-fan-out` in `house-style.yaml`). It skips code fences, so the forms below are examples, not live lines.

Slots:

- `<unit>` and `<countable measure>`: what one part is and how its size is counted (files, lines, diff lines, sources, PRs, hypotheses, review axes).
- `vstack-<role>`: an agent the plugin ships. `vstack-explorer` reads, `vstack-worker` writes, `vstack-verifier` runs checks.
- `<role brief>`: what the subagent does and returns, from the skill's text.
- When the subagent writes Scratch, add `, the Scratch dir` after `the vstack root`.

## Fan-out block

A step that would run two or more subagents at once. The gate line cites `skill://vstack-fan-out`, which decides between the two lines below it. Put the lead-in sentence on the line before the gate: in live runs, agents that saw only the gate line often picked a line without running the gate.

```
Before this step, read skill://vstack-fan-out and run its gate on the block below.

Fan-out gate (skill://vstack-fan-out): parts: one per <unit>; size: <countable measure>.
- fan-out → one `task` call; `tasks[]` has one item per part, each with `agent: "vstack-<role>"`. Each `task`: <role brief>, the user's override words, the vstack root.
- inline → do every part yourself, in order, from the same brief.
```

Roles that fan out in their own clones (hillclimb workers, wayfinder research runners, ship verifiers) keep the gate and the inline line and use this fan-out line:

```
- fan-out → one eval cell: per part, `agent(<prompt>, agent="vstack-<role>", isolated=True, apply=False, merge=False)`; `wait()` on all handles. Each prompt: <role brief>, the user's override words, the vstack root. <What the parent does with each `patchPath`.>
```

When the skill forbids doing the work itself (today only ship), the inline line is one isolated agent that checks every part in order:

```
- inline → Spawn one `vstack-verifier` via eval `agent(<prompt>, agent="vstack-verifier", isolated=True, apply=False, merge=False)` that checks every part in order: <role brief>, the user's override words, the vstack root. If it cannot be spawned, stop: <reason>.
```

## Single subagent

One subagent is not Fan-out and has no gate.

```
Spawn one `vstack-<role>` via `task` (`agent: "vstack-<role>"`): <role brief>, the user's override words, the vstack root. <Wait for its result. | Do not wait; keep working.> If it cannot be spawned, <do the work yourself | stop: <reason>>.
```

A role that runs in its own clone uses the eval form. If `task.isolation.enabled` is off, the skill stops and points at `/skill:setup-vstack` (ADR 0007).

```
Spawn one `vstack-<role>` via eval `agent(<prompt>, agent="vstack-<role>", isolated=True, apply=False, merge=False)`: <role brief>, the user's override words, the vstack root. <Wait for its result. | Do not wait; keep working.> If it cannot be spawned, stop: <reason>.
```

## Fixed Fan-out

Only for a skill whose invocation is the user's request to fan out (today only compare-attempts, the `fixed-fan-out` allowlist). It has no gate line, no judge, and no inline line, and the lint fails it anywhere else.

```
Fan-out (always: <reason>): one eval cell: per part, `agent(<prompt>, agent="vstack-<role>", isolated=True, apply=False, merge=False)`; `wait()` on all handles. Each prompt: <role brief>, the user's override words, the vstack root. <What the parent does with each `patchPath`.> If it cannot spawn or isolation is off, stop: <reason>.
```

## What the lint checks

In adapt, merge, and original markdown, outside frontmatter and code fences:

- A gate line cites `skill://vstack-fan-out` and names `parts:` and `size:`, and its next two non-blank lines are one fan-out line and one inline line, as above. A fan-out or inline line with no gate line above it fails.
- A fan-out line names only vstack agents and carries the user's override words and the vstack root. The eval form carries `isolated=True, apply=False, merge=False` and `wait()`.
- A `Spawn one` line names the same vstack agent twice and carries the user's override words and the vstack root.
- Any other line that names an agent names a vstack agent, and a `task` or eval agent call with no agent named fails.
- An agent's `spawns:` lists only vstack agents, never `*`.
- The fixed form fails outside compare-attempts, and a Headless run (a separate omp process) fails outside skill-creator.

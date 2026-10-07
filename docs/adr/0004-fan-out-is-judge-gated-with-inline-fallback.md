# Fan-out is judge-gated with an inline fallback

A skill step that would run two or more subagents at the same time first asks the omp eval `judge` whether the job is complex enough to fan out. The judge sees the user's request and the step's concrete inputs, applies one shared vstack rubric, and chooses `fan-out` or `inline`. Low confidence or a missing eval tool means `inline`. The user's explicit words override the judge either way ("fan out" or "in parallel" forces Fan-out; "no fan-out" or "sequential" forces inline). On `inline`, the agent at that step does the work itself, with no subagents. We chose this so that small jobs pay neither the cost nor the latency of subagents, and large jobs get Fan-out without the user having to remember to ask for it.

## Considered Options

- **Fan-out only when the user opts in** (the map's original rule): rejected. It puts the complexity call on the user for every invocation, and it leaves complex jobs sequential by default.
- **A config switch per project or per machine**: rejected. One setting cannot fit both a one-line diff and a large refactor in the same repo.
- **On "no Fan-out", run the same subagents one after another**: rejected. It keeps isolated contexts, such as code-review's separate Standards and Spec reviewers, but pays the full subagent cost without the time saving. Inline is cheaper, and we accept that the review axes then share one context.

## Consequences

- The judge runs on its own classifier model (TypeSafe or the smol chat model), not the parent's. This is allowed because it only makes a routing call and does no work as a subagent. Every subagent still runs on the parent's model.
- Skill text spawns only vstack's own agents, which have no `model` field, so they inherit the parent's live model. Skill text never spawns the bundled `task`, `scout`, `sonic`, or `reviewer` agents, which resolve through model roles. Setup warns if `task.agentModelOverrides` targets a vstack agent.
- vstack sets no cap on concurrent subagents. The skill's own width sets the count, and `task.maxConcurrency` is the only hard limit.
- Nesting is allowed, and every nested Fan-out step runs its own judgment. The parent passes the user's override words down in each subagent's prompt. `maxRecursionDepth` bounds the depth. vstack agents therefore need the eval tool and permission to spawn vstack agents.
- A single subagent, such as research's background agent, is not Fan-out and always runs as written.
- A skill the user invokes in order to fan out (today only compare-attempts) runs its batch with no gate, no judge, and no inline fallback, because the invocation already is the user's explicit request. If it cannot spawn, or isolation is off, it stops. If the user also says "sequential" or "no fan-out", the agent says the attempts run at once and asks whether to go ahead. The House style's `fixed-fan-out` rule allowlists the skill by name, and the lint fails on that form anywhere else.

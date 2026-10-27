# Fan-out always uses subagents

> [ADR 0040](0040-figures-are-mermaid-rendered-by-pele.md) amends this decision. A figure step is not a Fan-out: the caller renders each figure itself with Pele, in milliseconds and with no model. Every other step with two or more parts still fans out.

A skill step with two or more parts always starts one subagent per part, all in one batch. No judge weighs the size of the job, and the step has no inline branch, so the agent at that step never does a part itself. The user's words do not turn Fan-out off. When the user says "sequential", "no fan-out", or "inline", the agent says in one line that vstack always fans out, and then it runs the step as written. If the subagents cannot start, the step stops and names the parts that were not done and the reason. When omp's depth limit blocks a spawn, the stop names `task.maxRecursionDepth`, which the user can raise. A step with one part is not Fan-out. We chose this because the user wanted no inline mode. One rule for every step is easier to write, lint, and predict than a judgment per step, and work meant for separate contexts never lands in the caller's context.

## Considered Options

- **Judge-gated Fan-out with an inline fallback** (this ADR's earlier decision): rejected. Before each step, the omp eval `judge` chose `fan-out` or `inline`, and on `inline` the agent at the step did the parts itself. Small jobs paid neither the cost nor the latency of subagents. The user wanted no inline mode, so small jobs now pay that cost. The gate also needed three exceptions, for compare-attempts, implement-spec (ADR 0022), and figure steps (ADR 0023), each one allowlisted by the House style's `fixed-fan-out` rule.
- **Fan-out only when the user opts in** (the map's original rule): rejected. It puts the call on the user for every invocation, and it leaves complex jobs in one context by default.
- **A config switch per project or per machine**: rejected. A switch that turns Fan-out off brings back the inline mode that the user removed.
- **On "sequential", run the same subagents one after another**: rejected. It pays the full subagent cost without the time saving, and the result is the same.
- **On "sequential", ask the user whether to go ahead** (compare-attempts' earlier question): rejected. The answer cannot change how the step runs, so the question only delays the step.

## Consequences

- Skill text spawns only vstack's own agents, which have no `model` field, so they inherit the active model of the session that spawns them. Every subagent runs on the Session model by default. Skill text never spawns the bundled `task`, `scout`, `sonic`, or `reviewer` agents, which resolve through model roles.
- A key the user sets in `task.agentModelOverrides` for a vstack agent wins over the Session model. The override carries down: an overridden agent's own subagents inherit its model unless they have their own key, and its Headless runs read its session file. Setup prints the key as a note, not a warning, and a skill that reports a model names the one that ran. decision-trail's review counts on that model too.
- vstack sets no cap on concurrent subagents. The skill's own width sets the count, and `task.maxConcurrency` is the only hard limit.
- Nesting is allowed. A subagent at its own Fan-out step fans out the same way. `task.maxRecursionDepth` bounds the depth. vstack agents therefore need the eval tool and permission to spawn vstack agents.
- Every subagent prompt carries the vstack root, and the Scratch dir when the subagent writes Scratch. It carries none of the user's words about Fan-out, because those words change nothing.
- Every Fan-out step uses the one Fan-out line in `plugin/skills/vstack-fan-out/FORMS.md`: a `task` call, or an eval cell for roles that run in their own clones (ADR 0007). The House style has no `fixed-fan-out` allowlist, and the lint fails on the old gate and inline lines.
- A single subagent, such as research's background agent, is not Fan-out. It never does its work in its caller either. If it cannot be spawned, the step stops. compare-attempts' cross-judge is the one single spawn that the run skips instead. The parent keeps its own scores and records `cross-judge: not run`.
- A step with one part is not Fan-out. A skill that does that one part itself by design keeps doing so, such as why with one reachable category, or explain with one selected skill.
- A Headless run is not a subagent, so it is not Fan-out (ADR 0010).
- Amended by the Hand edit remove-decision-trail. decision-trail and its fresh-context review are removed, so the sentence that decision-trail's review counts on the override model no longer applies.

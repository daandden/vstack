# Vstack

Vstack combines upstream skill stacks for use through OMP while keeping local adaptations and model preferences explicit.

## Language

**Model role**:
A named capability tier expressing the preferred model capability, reasoning effort, speed, and cost trade-off.
_Avoid_: Responsibility role, job role

**Custom agent**:
A named worker for one responsibility. Approved seven-agent vstack set: `vstack-swift`, `vstack-researcher`, `vstack-coder`, `vstack-reviewer`, `vstack-planner`, `vstack-scribe`, `vstack-candidate` (panel runner). It owns instructions, tools, and permissions; its model binding references a model role.
_Avoid_: Model tier when referring to a worker's responsibility; bare `sonic`, `scout`, `swift`, `coder`, `planner`, `scribe`, `reviewer`, `researcher` as canonical ids

**Agent-model binding**:
The mapping from a custom agent name to one model-role selector in `task.agentModelOverrides`. It selects capability, not responsibility.
_Avoid_: Model assignment when meaning the worker's job

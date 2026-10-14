# implement-spec always fans out, because its main agent only orchestrates

implement-spec follows Matt's nine steps, and its main agent only orchestrates. It reads the task graph, starts subagents, acts on their results, and asks the user through `ask`. It never builds or merges a ticket itself. Isolated `vstack-worker` implementers build the ready tickets, and each one returns a patch. For each finished ticket, one non-isolated `vstack-worker` merger applies that patch onto the integration branch tip in the parent checkout and commits the ticket. A main agent that never builds leaves nothing for an inline branch to do, so implement-spec always fans out, with no Fan-out gate, no judge, and no inline fallback. If isolation is off or isolated workers cannot start, it stops. Scheduling is rolling: the orchestrator acts on each implementer's result when it arrives, has the merger land it, recomputes the frontier, and starts newly ready tickets at once. We chose this because the user wants the main agent to be the orchestrator, as in Matt's skill, with maximum concurrency.

## Considered Options

- **Keep the Fan-out gate**: rejected. ADR 0004 would hold unchanged, but on inline the main agent builds tickets in the shared checkout and is no longer only the orchestrator.
- **Waves with a `wait()` barrier per frontier**: rejected. It is simple and was already tested, but every newly ready ticket idles behind the slowest ticket of its wave.
- **git worktrees**: rejected. The orchestrator would run `git worktree add` from the integration tip, and a non-isolated implementer would commit there and merge the tip, word for word as Matt does. Only the brief would confine the worker, the run would need a cleanup step, and shared step 0b uses no worktree.
- **omp isolation plus fetch**: rejected. Each implementer would commit in its clone and fetch and merge the integration tip before it reports, as Matt's implementer does. omp isolated workers see a snapshot of the refs, so the tip can move before the merge, and `merge=True` cannot force branch mode while `task.isolation.merge` is `patch`.
- **The orchestrator applies each patch itself** (the previous text): rejected. It makes the main agent merge and carry each conflict in its own context.

## Consequences

- The House style's `fixed-fan-out` rule allowlists implement-spec beside compare-attempts. The fixed form in `plugin/skills/vstack-fan-out/FORMS.md` gains a slot for how the parent collects results, so a parent can act on each result as it arrives instead of calling `wait()` on all handles.
- One merger runs at a time, and the orchestrator starts no implementer while a merger runs, because omp clones each isolated worker from the parent's working tree, uncommitted changes included.
- On a conflict, the merger runs `git apply --3way`, resolves the conflict against the ticket and the spec, reruns the ticket's tests, and commits. If it cannot, the ticket goes back once for a fresh implementer from the current tip. A second failure leaves it open.
- Each ticket is one commit on the integration branch before code-review runs. Accepted review fixes get a later commit at shared step 6, as in hillclimb. Stopped slices stay uncommitted in a held patch, so the integration branch tree stays clean for later merges and clones.
- The run has no cleanup step. omp parks and reclaims the implementer workspaces, and the reply cites the patch paths.
- This amends ADR 0004: a skill whose main agent only orchestrates also fans out with no gate, no judge, and no inline fallback.

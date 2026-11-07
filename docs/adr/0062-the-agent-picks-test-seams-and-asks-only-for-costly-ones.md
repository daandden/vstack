# The agent picks test seams and asks only for costly ones

Matt's tdd and to-spec make the user confirm every test seam before a test is written, and vstack kept that rule in to-spec, implement, implement-spec, and tdd. In the user's 50 newest omp sessions, the user picked the agent's recommended seam in 16 of 16 seam questions, with no notes. vstack's history records no run that tested at a wrong seam; its seam issues fixed ordering and consent. So the agent now picks test seams itself, records each pick with what the seam catches and misses, and keeps working. The user's pushback on a recorded pick reopens it.

The agent picks by Matt's rule with a small footprint. A seam is an existing public interface where a caller sees the changed behavior. The agent prefers an existing seam to a new one, the highest seam that shows the behavior, and as few seams as possible. For a bug, the seam is where the real bug pattern happens. Real code runs behind the seam, and stand-ins replace only system boundaries, local before remote.

The agent still asks before it uses a Costly seam. Without the user's answer, it tests at the best seam that is not costly, or proves the change another way, and names the gap.

## Considered Options

- Keep the user's confirmation of every seam, as Matt does. It spends one question per change on a pick the user accepted every time.
- Keep only to-spec's confirmation. It keeps one checkpoint per spec, but that question was also accepted every time.
- pstack's rule: the narrowest existing check for the code path. Narrow tests can miss bugs in how code is called.
- No time limit, or also asking for new test infrastructure. The first lets slow suites land unseen. The second overlaps the approval that installing a dependency already needs.

## Consequences

- A departure from a spec's agreed responsibility or guarantee still needs the user's answer. A seam that needs a new production interface, such as a port or an export only tests use, is such a departure.
- A Headless run's agent-picked seam counts. A costly seam still needs the user's own answer, as [ADR 0047](0047-flow-questions-require-a-live-page-and-recoverable-stages.md) requires for every approval.
- An implement-spec worker that would need a costly seam builds at a seam that is not costly and returns the costly seam as a question, so its patch is not held for it.
- A later Update that brings Matt's confirmation wording back must check it against this decision.

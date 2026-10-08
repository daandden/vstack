# Design It Twice

When the user wants to explore alternative interfaces for a chosen deepening candidate, use this pattern: 3–4 radically different designs, drafted at once by subagents or one after another by you, as step 2's gate decides. Based on "Design It Twice" (Ousterhout) — your first idea is unlikely to be the best.

Uses the vocabulary in [SKILL.md](SKILL.md) — **module**, **interface**, **seam**, **adapter**, **leverage**.

## Process

### 1. Frame the problem space

Before step 2, write a user-facing explanation of the problem space for the chosen candidate:

- The constraints any new interface would need to satisfy
- The dependencies it would rely on, and which category they fall into (see [DEEPENING.md](DEEPENING.md))
- A rough illustrative code sketch to ground the constraints — not a proposal, just a way to make the constraints concrete

Show this to the user, then immediately proceed to Step 2. The user reads and thinks while the designs are drafted.

### 2. Draft the designs

Draft 3–4 designs. Each must produce a **radically different** interface for the deepened module.

Write one technical brief (file paths, coupling details, dependency category from [DEEPENING.md](DEEPENING.md), what sits behind the seam). The brief is independent of the user-facing problem-space explanation in Step 1. Give each design a different design constraint:

- Design 1: "Minimize the interface — aim for 1–3 entry points max. Maximise leverage per entry point."
- Design 2: "Maximise flexibility — support many use cases and extension."
- Design 3: "Optimise for the most common caller — make the default case trivial."
- Design 4 (if applicable): "Design around ports & adapters for cross-seam dependencies."

Include both [SKILL.md](SKILL.md) vocabulary and GLOSSARY.md vocabulary in the brief so each design names things consistently with the architecture language and the project's domain language.

Each design gives:

1. Interface (types, methods, params — plus invariants, ordering, error modes)
2. Usage example showing how callers use it
3. What the implementation hides behind the seam
4. Dependency strategy and adapters (see [DEEPENING.md](DEEPENING.md))
5. Trade-offs — where leverage is high, where it's thin

Fan-out gate (skill://vstack-fan-out): parts: one per design constraint (3–4); size: files and lines the technical brief names.
- fan-out → one `task` call; `tasks[]` has one item per part, each with `agent: "vstack-explorer"`. Each `task`: the technical brief, its design constraint, the five outputs above, the user's override words, the vstack root.
- inline → do every part yourself, in order, from the same brief.

Inline, finish each design under its own constraint before you start the next, and keep each one radically different from the ones before it.

### 3. Screen, present, and compare

Screen every design against [RED-FLAGS.md](RED-FLAGS.md) first. Revise a design that shows a red flag, or drop it, and say which flag it showed.

Present designs sequentially so the user can absorb each one, then compare them in prose. Contrast by **depth** (leverage at the interface), **locality** (where change concentrates), and **seam placement**.

After comparing, give your own recommendation: which design you think is strongest and why. If elements from different designs would combine well, propose a hybrid. Be opinionated — the user wants a strong read, not a menu.

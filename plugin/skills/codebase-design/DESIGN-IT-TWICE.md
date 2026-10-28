# Design It Twice

improve-codebase-architecture runs this pattern for every picked deepening candidate, and a user can ask for it for any module: 3–4 radically different designs, drafted at once by subagents. Based on "Design It Twice" (Ousterhout): your first idea is unlikely to be the best.

Uses the vocabulary in [SKILL.md](SKILL.md): **module**, **interface**, **seam**, **adapter**, **leverage**.

## Process

Read `skill://flow-page` for a result-producing run. Discover the supplied session and agent's binding with `bound`. Use the calling skill's Stage when it owns this run. Otherwise open a codebase-design Stage on the bound Flow, or start a Flow when unbound. Reopen a closed Flow explicitly. Reading this reference alone creates no Stage.

### 1. Frame the problem space

Before step 2, write a user-facing explanation of the problem space for the chosen candidate:

- The constraints any new interface would need to satisfy
- The dependencies it would rely on, and which category they fall into (see [DEEPENING.md](DEEPENING.md))
- A rough illustrative code sketch to ground the constraints, not a proposal, just a way to make the constraints concrete

Publish this framing as a Document Result in the run's Stage, then immediately proceed to Step 2. The user reads while the designs are drafted.

### 2. Draft the designs

Draft designs 1–3 below in every run. Add design 4 when cross-seam dependencies make it useful. Each must produce a radically different interface for the deepened module; “twice” names the method, not a limit of two designs.

Write one technical brief (file paths, coupling details, dependency category from [DEEPENING.md](DEEPENING.md), what sits behind the seam). The brief is independent of the user-facing problem-space explanation in Step 1. Give each design a different design constraint:

- Design 1: "Minimize the interface: aim for 1–3 entry points max. Maximise leverage per entry point."
- Design 2: "Maximise flexibility: support many use cases and extension."
- Design 3: "Optimise for the most common caller: make the default case trivial."
- Design 4 (if applicable): "Design around ports & adapters for cross-seam dependencies."

Include both [SKILL.md](SKILL.md) vocabulary and GLOSSARY.md vocabulary in the brief so each design names things consistently with the architecture language and the project's domain language.

Each design gives:

1. Interface (types, methods, params, plus invariants, ordering, error modes)
2. Usage example showing how callers use it
3. What the implementation hides behind the seam
4. Dependency strategy and adapters (see [DEEPENING.md](DEEPENING.md))
5. Trade-offs: where leverage is high, where it's thin

Before this step, read skill://vstack-fan-out.

Fan-out (skill://vstack-fan-out): parts: one per design (3–4, each with its design constraint). One `task` call; `tasks[]` has one item per part, each with `agent: "vstack-explorer"`. Each `task`: the technical brief, its design constraint, the five outputs above, the vstack root. Wait for every result. If they cannot start, stop: report Design It Twice as not run, with the step 1 explanation as the only output.

### 3. Screen, present, and compare

Screen every design against [RED-FLAGS.md](RED-FLAGS.md) first. Revise a design that shows a red flag, or drop it, and say which flag it showed.

Publish the surviving designs as a Document Result with each interface, usage example, hidden implementation, dependency strategy, and trade-offs. With at least two survivors, publish a Comparison Result with alternatives for the designs, criteria for depth, locality, and seam placement, evidence-backed assessments, and your verdict. Preserve dropped designs and their red flags in the Document's limitations. With one survivor, record its recommendation in the Document. With none, publish the failed screening and an inconclusive verdict there rather than inventing alternatives.

After comparing, give your own recommendation: which design you think is strongest and why. If elements from different designs would combine well, propose a hybrid. Be opinionated: the user wants a strong read, not a menu.

Finish an owned Stage after the Results are committed. A calling skill keeps its Stage open for the decision that follows. Present the receipt's live URL or static fallback. The Results replace sequential chat-only designs and separate report pages.

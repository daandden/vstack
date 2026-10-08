# Design brief

The caller gives you this brief with the task, the Ground artifacts, your design direction, and where your design goes. Return it in your reply, or write files in your own tree, as the caller directs. What matters is independence between designs.

Produce one candidate package for architect's Sketch phase. Read skill://architect for context, but run only the assigned candidate, not its Ground, Stop, Implement, or Scrap phases. Return a type sketch, function signatures, module map, and rationale per [rationale-template.md](rationale-template.md).

Apply this discipline:

- Write caller usage first. Show README-style usage and two or three realistic call sites before the types. Derive the types from that usage. Reconcile the sketch to the usage, not the reverse.
- Design data structures first. Trace each dominant access pattern through them. If an access pattern needs a map, index, or cache, put it in the design now.
- Compare interface depth. Hide more capability behind a smaller public interface. Parse transport and wire data into domain types behind the seam.
- For shared state, trace what happens when two actors both write. Prefer per-actor state with a merge at the read seam, per skill://principle-separate-before-serializing-shared-state.
- Make interfaces visible. Use `not implemented` bodies, pseudocode for tricky logic, and doc comments for intent and invariants. Types and signatures must let a reader trace inputs to outputs.
- Encode invariants in types, per skill://principle-encode-lessons-in-structure. Prefer hard-to-misuse types over runtime checks and prose.
- Validate at interfaces and trust types inside, per skill://principle-boundary-discipline. Keep business logic pure and the shell thin.
- Keep one source of truth per invariant. Derive instead of synchronizing copies.
- Trace repeated calls and halfway crashes. Use idempotent state transitions where applicable, per skill://principle-make-operations-idempotent.
- Keep call chains short. If tracing a flow needs more than three files, flatten it, per skill://principle-laziness-protocol and skill://principle-minimize-reader-load.

Commit to the assigned design direction. Do not blend it with unseen candidates. Differences between designs let architect choose and combine their strongest parts.

---
name: architect
description: Sketch types, signatures, and module structure, then hand the design to implement. Choose sketch, checkpoint, or implement.
disable-model-invocation: true
---

# Architect

Design before implementing. Write the caller's usage first, then derive types, signatures, and module structure with `not implemented` bodies. Compare whole-shape alternatives and synthesize one design. If implementation proves the shape wrong, re-ground and redesign.

## Start

Start the `todo` list with one task per phase: Ground, Sketch, Stop, Implement, and Scrap. Keep a skipped phase as `skip: <reason>`.

Read skill://codebase-design for module, interface, depth, seam, adapter, leverage, and locality vocabulary. Use the project's GLOSSARY.md vocabulary too.

Take the stop from the caller's text or the user's words: `sketch`, `checkpoint`, or `implement`. "Sketch only" means `sketch`. With no named stop, use `implement`. These stops control design handover, not implement's End state. Keep the stop and Sketch mode for the whole run, including after Scrap.

Use the caller's vstack root and absolute project Scratch dir if supplied. Otherwise resolve the root per the Private-mode rule and the Scratch dir through skill://vstack-tmp. Keep figure sources in a distinct `<Scratch dir>/explorer/architect-<run-id>/` entry. Pass the project Scratch dir, not that entry, to children.

## Phase A: Ground the problem

Build the traced model that skill://how prescribes for every subsystem the new code touches. Naming files is not grounding. If the design changes ownership or layering, also run skill://why on the existing shape. Treat its cited rationale as a constraint and preserve its confidence language.

When both run, count touched files and relevant commits, then use this block. Each brief names the design task and touched subsystems. Request why's Preserve / Change / Avoid / Risk tail for this change.

Before this step, read skill://vstack-fan-out and run its gate on the block below.

Fan-out gate (skill://vstack-fan-out): parts: one per skill (how, why); size: files in the touched subsystems (how), commits touching the target (why).
- fan-out → one `task` call; `tasks[]` has one item per part, each with `agent: "vstack-explorer"`. Each `task`: run `skill://how` or `skill://why` on the scoped target and return its output unedited with citations, artifact paths, and confidence language, the user's override words, the vstack root, the Scratch dir.
- inline → do every part yourself, in order, from the same brief.

The inline order is how, then why. Each skill still runs its own gate. If only how is needed, read and run it yourself without the two-part gate. Wait for all Ground results before Sketch. Keep the cited outputs and artifact paths in the design briefs.

Skip Ground only for genuinely greenfield work with no surrounding system to integrate.

## Phase B: Sketch

Read skill://codebase-design/DESIGN-IT-TWICE.md and run its process with at least three briefs. Each brief carries the Ground artifacts and [design-brief.md](references/design-brief.md), plus its distinct design constraint. Candidates return their designs in their replies. Only this agent writes the synthesized type sketch to the working tree.

Require at least two structurally distinct viable candidates before synthesis, even when the first looks sufficient. Use whole-shape alternatives, not small fixes inside one shape, per skill://principle-exhaust-the-design-space. If screening leaves fewer than two, revise or replace rejected designs before synthesizing.

Screen every candidate against skill://codebase-design/RED-FLAGS.md. Reject or revise shallow modules, information leakage, temporal decomposition, and pass-through methods. Compare viable designs on interface depth, locality, and seam placement. Prefer more capability behind a smaller interface, with short call chains.

Synthesize one package per [rationale-template.md](references/rationale-template.md). Write the Synthesis decision yourself. DESIGN-IT-TWICE's comparison and recommendation do not add a checkpoint. Phase C owns whether to pause.

### Explicit compare-attempts request

Only when the user explicitly asks for compare-attempts or several isolated attempts, replace DESIGN-IT-TWICE's candidate run with skill://compare-attempts. Keep its fixed Fan-out and isolation requirements. A conflicting "sequential" or "no fan-out" request goes through that skill's `ask` gate.

Pass these inputs:

- The design-sketch task and real target paths, with artifact kind `tree`.
- The Ground artifacts and [design-brief.md](references/design-brief.md) as the runner brief.
- At least three DESIGN-IT-TWICE directions, one per runner.
- [rationale-template.md](references/rationale-template.md) for each candidate's rationale.
- The user's override words, vstack root, and project Scratch dir.

Each runner writes its type sketch with `not implemented` bodies in its own clone. Keep candidates out of the vstack root. Keep the rubric with the parent: the RED-FLAGS screen, interface depth, and agreement between usage and types. Usage comes first.

Use compare-attempts to apply the base patch and graft the retained parts. Its synthesis note fills the rationale's Synthesis decision. Preserve its cross-judge result, losing patch paths, and sketch-only verification limits. Stop, Implement, and Scrap stay unchanged. After Scrap, use this same mode again.

### Design package and figures

Write the type sketch as code at its real paths in the working tree. For small work, one file holds the new types and signatures. For larger work, include the module map and type definitions. Bodies raise `not implemented`; pseudocode names the logic still to fill. Keep planned breakage explicit, per skill://principle-foundational-thinking and skill://principle-outcome-oriented-execution. A sketch is not a working implementation.

Keep the rationale in the reply and post it on the driving ticket when one exists. Add no design document to the repo. List the sketch's interfaces as proposed seams, with paths, behavior, invariants, ordering, and error modes.

Draw every figure, including the package shown at the `sketch` stop, through skill://diagram-design. Follow its type reference, project profile gate, and plan confirmation through `ask`. Skip the plan pause only when the caller fixes type, size, and content. Store figures under this run's Scratch entry and include their absolute file URLs in the package. Use Python eval for its helpers. If drawing is unavailable, report the prerequisite rather than substitute another medium.

## Phase C: Stop

Honor the named stop:

- `sketch`: return the package and proposed seams. Leave the type sketch in the working tree for the caller to fill. Run no implementation, review, or commit.
- `checkpoint`: show the package and proposed seams through `ask`. Wait for sign-off before Implement. Sign-off covers these seams. An auto-selected timeout is not sign-off; ask once more, then stop without implementing if it times out again.
- `implement`: proceed to Phase D. This is the default, with no design checkpoint.

If the user rejects the shape, treat that feedback as Ground evidence. Re-ground and return to Sketch before writing implementation. Changed seams need fresh checkpoint sign-off.

## Phase D: Implement against the sketch

Read skill://implement and hand it the complete design package as its spec. Pass the proposed seams, checkpoint sign-off, Ground paths, Scratch dir, vstack root, and any existing run record or decision-trail log. State that architect owns the design and that Scrap runs after each tdd slice.

implement owns its shared End state block at skill://implement/END-STATE.md. Read and cite that block rather than maintain a copy here. Let implement copy its shared steps verbatim into the todo list and settle the End state with seam confirmation. A checkpoint sign-off already covers the seams, so implement does not ask about them again. Reuse the same settled End state and branch-ownership record after Scrap.

implement replaces the `not implemented` bodies and pseudocode with real code under tdd at agreed seams. Surface deviations instead of silently changing the sketch. For an unexpected parameter, determine whether the sketch missed a requirement or the implementation exceeds scope. Use `ask` for a human decision that the evidence cannot settle.

After each tdd slice, run Phase E before returning to implement. If Scrap fires, stop implement before code-review, commit, and the End-state chain. If it does not, continue implement's own completion steps.

## Phase E: Scrap when the architecture is wrong

Check the upstream tells after every tdd slice. Scrap on a pattern, not a single instance:

- The same workaround repeats across unrelated code.
- Multiple unrelated edge cases need special-case branches.
- Types need escape hatches such as `any`, casts, or optional fields that are always set in practice.
- Implementation needs a lock when the sketch says the state is not shared.
- Callers need the abstraction's internal rules to use it.
- Two or more independent implementation deviations have the same shape.

A few edge cases do not condemn a design. Separate complexity in the data from complexity in the design. If the pattern shows the shape is wrong, redesign per skill://principle-redesign-from-first-principles and skill://principle-fix-root-causes.

When Scrap fires:

1. Stop implement before code-review and commit. Keep the partial diff in the working tree as evidence.
2. Re-run skill://how over what was built. Preserve the cited model and identify the new constraints.
3. Redesign as if those constraints existed on day one. Subtract before adding, per skill://principle-subtract-before-you-add. Make the replacement smaller before it grows.
4. Return to Sketch in the same mode, then apply the same stop. A checkpoint run needs sign-off again.

Do not erase the evidence with a reset or discard unrelated changes. Report the tells, the partial paths, and what the new design removes.

## Reply

Return the design package, rationale, proposed seams and their agreement status, Ground citations, and figure URLs. Name the stop and Sketch mode. At `sketch`, state that bodies are not implemented and the caller owns fill-in. After implementation, include implement's reached End state and observed proof. Report every Scrap cycle and any missing prerequisite or stopped slice.

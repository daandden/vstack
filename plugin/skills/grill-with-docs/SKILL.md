---
name: grill-with-docs
description: A relentless interview to sharpen a plan or design, agree consequential architecture, and record glossary terms and ADRs as we go.
disable-model-invocation: true
---

# Grill with docs

Follow `skill://flow-page`'s "Stage entry/exit line". Use `skill://grilling` for the interview. grill-with-docs owns the Architecture assessment, agreement, and continuation. Other callers of grilling keep their own procedures.

## Trace and compare two shapes

1. For every change, trace each system it touches. Ground the trace in caller-visible behavior, actual dependencies, constraints, and applicable glossary terms and ADRs. For greenfield work, trace the actors and surrounding systems. Resolve missing facts before treating them as design choices.
2. Sketch two distinct shapes at the owner, module, and contract level. Use `skill://codebase-design` and its `VISUAL-AGREEMENT.md` for vocabulary and visuals. Screen both against [codebase-design's red flags](../codebase-design/RED-FLAGS.md) and for one owner per piece of state, one way per task, and the least knowledge required of callers. Redesign when workarounds repeat. If only one shape is viable, show the constraint the second sketch fails and keep it out of the picks.
3. For a large or contested design, run `skill://compare-attempts` with kind `reply` without asking whether to run it. Give the runners the grounded problem and constraints at the same sketch level. Apply no runner patch. Keep the comparison's Results on the Flow, with no tracker write. Bring the returned synthesis to the design question. If the comparison stops, keep the affected decision open and report why.
4. Put the recommended direction, trade-offs, and necessary visuals in the design question with its Decision brief. Use `ask` under `skill://flow-page`'s "Every ask in a Flow" contract, even when only one shape is viable. Record the user's explicit agreement through grilling's answer rules. If a constraint changes, revise the affected sketches and carry forward the earlier answer and rationale.

For a correction to a sketch or published visual, follow the [Settle-or-ask rule's correction path](../../rules/vstack-settle-or-ask.md#decisions-the-agent-settles) and skill://grilling's Result and Assumed pick procedure. A corrected depiction of an agreed shape needs no new architecture question. An outstanding design question still needs explicit agreement. If the correction changes a consequential choice, agree the changed choice explicitly before dependent work.

See ADR 20261123-every-grill-sketches-two-shapes-and-contested-designs-run-compare-attempts and ADR 0053.

## Record the agreement

Run `skill://domain-modeling` for resolved glossary terms and qualifying ADRs as they crystallize. Its nested Results capture the terms and decisions with canonical file links. Keep their explanations in those canonical records. Do not create an ADR for every choice.

After the user's explicit agreement, publish an Architecture brief as a Flow Document Result with the agreed visuals and:

- Module responsibilities and ownership, interactions, and dependency direction.
- Relevant observable guarantees, constraints, failure and recovery behavior, and quality requirements.
- Accepted trade-offs, the rationale for the direction, and important rejected alternatives.
- The decision provenance, with links to the explicit answers or existing applicable decisions that settle each consequential choice. Link each explicit answer as `[Stage N QM](#<question id>)`, using the question id from the submit receipt or `show`. Cite each applicable existing decision (ADR) as a Document citation of its file.
- Material assumptions, evidence limitations, and any unresolved choice, clearly separate from agreement.

Record only the precision needed to preserve the agreement. Function signatures, local types, private decomposition, file layout, ordinary algorithms, and other coding details belong to implementing agents within those guarantees. Produce no executable sketches, placeholder bodies, source scaffolds, or scaffold commits.

Finish the grill as agreed only when every consequential choice needed by dependent implementation is settled. If evidence or an answer is unavailable, publish what is known and what is held, and do not describe the Architecture brief as agreed. A recoverable blocker leaves the Stage in progress for continuation. Retire unresolved questions honestly only when the work completes or is deliberately abandoned. A headless close remains "Headless, not user-confirmed" and authorizes no dependent action.

On a blocked return, name the missing evidence or decision instead of implying that dependent implementation is ready. A headless, blocked, or incomplete grill never starts to-spec.

## Continue into to-spec

When the caller is a running to-spec resolving a consequential gap, publish the nested grill's agreement and summary close once that gap is settled, then finish only the nested Stage. Restore the caller's binding through flow-page and return the agreement and answer provenance to that running to-spec. It resumes synthesis in its existing Stage. This nested grill starts no new to-spec run.

When a user-started grill-with-docs reaches an empty frontier and shared understanding, publish grilling's summary close and finish the grill's Stage. Keep the Flow open. Continue into to-spec in the same turn. The close asks nothing. Do not wait for the user's next prompt. The skill the user started selects this continuation, not wording that suggests a small or large change. grill-me never chains.

1. Read `skill://to-spec` and gather its intent from the agreement, conversation, source issue and comments, and applicable domain records.
2. Follow flow-page's Stage entry for to-spec. Open `--skill to-spec --flow <flow> --parent <grill-stage>` on the same Flow. This is to-spec's own Stage entry, not an extra Stage before its run. Use the new `open` receipt's Flow and Stage ids for every to-spec contribution and ask, rather than the binding supplied at the start of the turn.
3. Call `inject_addons` with that gathered to-spec intent before synthesis. Reading a skill inline supplies no run-start Addon reminder. Keep session-wide Addon dedup intact, so the grill's already supplied Addons are not selected again.
4. Follow to-spec's steps inline, carrying the agreement, decision provenance, vstack root, and Scratch dir into its run. The skill text drives this one hop. Sending a slash command through the extension does not start it.

The chain ends when to-spec publishes the spec, or returns with an actual blocker. Start neither implement nor to-tickets. Implementation and tracker work beyond the spec remain outside this chain.

A later pushback on the published summary reopens the named grill decisions under grilling's continuation rules. Keep the earlier close intact and carry the corrected agreement into the next spec revision.

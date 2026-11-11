---
name: grill-with-docs
description: A relentless interview to sharpen a plan or design, agree consequential architecture, and record glossary terms and ADRs as we go.
disable-model-invocation: true
---

# Grill with docs

Follow `skill://flow-page`'s "Stage entry/exit line". Use `skill://grilling` as this run's interviewing procedure. This skill owns the Architecture assessment, any expanded design discussion, and the continuation after shared understanding. It does not change the policy of other callers of grilling.

## Ground and assess

Ground the change in caller-visible behavior, affected dependencies, constraints, and relevant existing rationale. Read the project's glossary and applicable ADRs from its configured domain paths. Inspect the actual affected system before proposing alternatives. For greenfield work, ground its actors, surrounding systems, operating context, and requirements rather than explaining nonexistent code.

Give every change an Architecture assessment. Expand into design only when a consequential choice remains unsettled and dependent implementation would commit to an unagreed structure, shared contract, or quality trade-off. Explain the consequence through an affected requirement, shared assumption, guarantee, or dependency.

Inspect responsibility and ownership, dependency direction, shared semantics, trust and data lifecycle, runtime operation, and important quality requirements. These subjects prompt assessment. They do not automatically require design. File count, module count, greenfield status, technology labels, and reversal cost alone do not trigger it. A one-module isolation or durability choice can qualify. A behavior-preserving many-file rename need not.

Check whether existing decisions or applicable patterns already settle the choice, and whether their assumptions still hold. Matching signatures do not establish matching residency, failure, or recovery guarantees. A significant change already settled by a valid decision needs no repeated design exercise. An ordinary feature that preserves an established pattern can stay lightweight.

Separate missing facts from open choices. Use grilling's fact-finding procedure for repository facts or bounded investigation before inventing design forks. Clarify speculative quality needs against a real requirement, credible scenario, analysis, or measurement. Production benchmarks are not universally required. Record a material unknown, why it matters, and what would resolve it. Keep dependent decisions open while its evidence is missing.

If no consequential choice needs expansion, record a brief grounded no-expansion reason in the Stage's existing Result or summary. Cite the applicable decision or pattern and its fit, or the preserved behavior and guarantees. Continue the interview without requiring a new Architecture brief, separate document, or diagram.

## Expand only the open architecture

For an expanded assessment, read `skill://codebase-design` and its `VISUAL-AGREEMENT.md`. Use that reference to frame and screen the smallest useful visual alternatives. This is a conditional architecture discussion, not the fixed detailed-interface exercise in DESIGN-IT-TWICE.md. Leave that exercise and its other callers unchanged.

Bring the surviving direction and consequential trade-offs to grilling's current frontier. Resolve prerequisite choices before dependent ones. Use existing Flow questions, reader needs, captured visuals, and answer-provenance rules. A recommendation does not settle a choice. Missing answers, cancellation, timeout, and headless automatic picks remain non-consent. A consequential unagreed consequence can need a question even when only one shape is viable.

When an answer changes a constraint or invalidates a pattern assumption, re-ground the affected choice and revise its visual comparison. Preserve the earlier rationale and answer rather than silently replacing them.

## Record the agreement

Run `skill://domain-modeling` for resolved glossary terms and qualifying ADRs as they crystallize. Its nested Results capture the terms and decisions with canonical file links. Keep their explanations in those canonical records. Do not create an ADR for every choice.

For expanded design, publish an Architecture brief as a Flow Document Result with the agreed visuals and:

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

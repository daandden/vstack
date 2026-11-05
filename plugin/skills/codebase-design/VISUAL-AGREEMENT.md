# Visual architecture agreement

Use this reference when grill-with-docs's Architecture assessment identifies a consequential unsettled choice. The caller owns activation, interviewing, decision provenance, and the stop. This reference supplies comparison guidance, not another architect workflow. Use [SKILL.md](SKILL.md)'s module, interface, seam, adapter, depth, leverage, and locality vocabulary.

## Frame the affected behavior

Start with what a caller needs to achieve and what it may rely on. Ground affected responsibilities, interactions, dependencies, constraints, and existing rationale. Explain which assumption an existing pattern does or does not preserve. In a greenfield system, ground surrounding actors, integration obligations, data rules, and operating conditions.

Identify the consequence that needs agreement before dependent implementation, not a list of files to create. An interface includes invariants, ordering, failures, configuration, and relevant performance guarantees, not just signatures. Distinguish a fact still to investigate from a trade-off the user can decide. Use credible quality scenarios or analysis when measurements do not exist.

## Compare useful shapes

Consider structurally different ways to satisfy the actual constraints. Keep alternatives at the same abstraction level and compare them against the same requirements. Explain the responsibility each module owns, who depends on whom, and what complexity each interface hides.

Draw the smallest useful visual account through `skill://vstack-figures`. The caller writes Mermaid and captures its source through `skill://flow-page`; the reader draws it with pinned Pele. Use a responsibility/dependency view when ownership or a seam is the choice. Add an interaction view for consequential ordering, acknowledgement, failure, or recovery. Add a deployment view when placement or isolation distinguishes the options. There is no compulsory diagram suite.

For each viable alternative, explain its gains, accepted costs, and effects on observable guarantees. Screen it against [RED-FLAGS.md](RED-FLAGS.md) before recommending it. Revise or drop designs with shallow modules, information leakage, temporal decomposition, or pass-through methods, and record the relevant rejection reason. Compare depth, locality, and seam placement where they distinguish the alternatives. Account for who owns a rule so that a change that appears correct in one module does not violate a guarantee elsewhere.

Recommend a direction with evidence and preserve important rejected alternatives. A hybrid is useful only when it resolves an actual trade-off. If constraints leave only one viable shape, show that shape and explain the constraints and its remaining costs. Do not invent a second viable design or impose an arbitrary candidate count.

Publish the framing and screened comparison as Flow Results. Use a Comparison Result when alternatives survive, with shared criteria, evidence, and a recommendation. With one survivor, use the Document to explain it and the exclusions. Publish a consequential question and its necessary captured visuals together through the Flow CLI, declaring its reader needs. Follow `skill://flow-page`'s "Every ask in a Flow": verify current live content, display the live URL in chat, call ordinary `ask` with the receipt's questions, then record the observed response separately. A visual only in a Result or Background does not satisfy a question's comparison need.

## Preserve agreement, leave coding to implementation

Return the recommendation and open consequences to the caller's grilling frontier. The comparison does not confer user consent. Keep material assumptions and evidence limits visible. A newly discovered constraint changes the affected comparison, not the historical answer.

Describe the agreed responsibilities, interactions, guarantees, constraints, trade-offs, and rationale precisely enough that implementing agents cannot make incompatible consequential choices. Leave signatures, local types, private decomposition, file layout, and ordinary algorithms to them within the agreement. Use prose and visuals rather than executable sketches or placeholder source. The caller records its Architecture brief and stops at shared understanding.

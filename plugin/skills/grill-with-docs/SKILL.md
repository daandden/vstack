---
name: grill-with-docs
description: A relentless interview to sharpen a plan or design, agree consequential architecture, and record glossary terms and ADRs as we go.
disable-model-invocation: true
---

# Grill with docs

Follow `skill://flow-page`'s "Stage entry/exit line". Use `skill://grilling` as this run's interviewing procedure. This skill owns the Architecture assessment, any expanded design discussion, and the shared-understanding stop. It does not change the policy of other callers of grilling.

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

## Record the agreement and stop

Run `skill://domain-modeling` for resolved glossary terms and qualifying ADRs as they crystallize. Its nested Results capture the terms and decisions with canonical file links. Keep their explanations in those canonical records. Do not create an ADR for every choice.

For expanded design, publish an Architecture brief as a Flow Document Result with the agreed visuals and:

- Module responsibilities and ownership, interactions, and dependency direction.
- Relevant observable guarantees, constraints, failure and recovery behavior, and quality requirements.
- Accepted trade-offs, the rationale for the direction, and important rejected alternatives.
- The decision provenance, with links to the explicit answers or existing applicable decisions that settle each consequential choice.
- Material assumptions, evidence limitations, and any unresolved choice, clearly separate from agreement.

Record only the precision needed to preserve the agreement. Function signatures, local types, private decomposition, file layout, ordinary algorithms, and other coding details belong to implementing agents within those guarantees. Produce no executable sketches, placeholder bodies, source scaffolds, or scaffold commits.

Finish the grill as agreed only when every consequential choice needed by dependent implementation is settled. If evidence or an answer is unavailable, preserve grilling's blocked-return behavior. Publish what is known and what is held, retire unresolved questions honestly when finishing the Stage, and do not describe the Architecture brief as agreed. A headless close remains "Headless, not user-confirmed" and authorizes no dependent action.

Preserve the summary-only close. Stop at shared understanding without implementation, automatic invocation of another Matt skill, or tracker/spec publication. After an agreed close, end the reply with one line naming the next skill for the user to type: `/skill:to-spec` for a change that needs more than one session, or `/skill:implement` for one that fits one session. The line asks nothing and invokes nothing. On a blocked return, name the missing evidence or decision instead of implying that dependent implementation is ready.

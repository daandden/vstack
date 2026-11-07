---
status: accepted
---

# Architecture agreement belongs in the grill

> [ADR 0062](0062-the-agent-picks-test-seams-and-asks-only-for-costly-ones.md) ends to-spec's seam confirmation: the agent picks test seams and asks only for a Costly seam. to-spec still asks about real capability-map forks.

We will integrate pstack architect's grounding, alternative-design reasoning, screening, and rationale into `grill-with-docs`, ending at shared understanding rather than implementation. `/to-spec` keeps its synthesis role and existing seam and capability-map confirmations. This preserves the Matt flow while preventing consequential architecture choices from being invented during implementation.

This records the accepted design policy. The skill instructions and Decision register have not been changed by this decision-recording run.

## Assess every change, expand only unsettled choices

Every change gets an Architecture assessment. Expand the grill into architecture design only when a consequential choice remains unsettled and proceeding would commit dependent implementation to an unagreed structure, shared contract, or quality trade-off.

Assess consequences for responsibility and ownership, dependency direction, observable guarantees, trust and data lifecycle, runtime operation, and important quality requirements. These are subjects to inspect, not automatic triggers. Applicable decisions and established patterns can settle a significant choice without another design exercise. Record a brief reason when no expansion is needed.

File count, module count, greenfield status, and technology labels do not determine significance. Difficulty of reversal strengthens the case for early agreement but is not necessary. A one-module tenant-isolation choice can qualify; a many-file behavior-preserving rename need not. Missing facts require grounding or investigation before they are treated as a design fork. A speculative performance concern does not justify an invented scalability requirement.

## Agree visual architecture and trade-offs

Architecture design starts from caller-visible behavior and constraints. Present the smallest useful visual account of responsibilities, interactions, and relevant guarantees. Use a dynamic or deployment view when ordering, failure, or placement is the actual choice. Compare genuine alternatives at the same abstraction level, explain their trade-offs, and recommend a direction. Do not invent a second viable candidate when constraints rule it out.

Reuse `codebase-design` vocabulary and screening. Borrow architect's reasoning, not a competing workflow, fixed model choices, executable scaffolds, or its automatic transition to implementation. Function signatures, local types, private decomposition, file layout, and ordinary coding choices remain with the implementing agent within the agreed contracts and constraints.

The grill finishes when consequential choices needed by dependent work are settled and the Architecture brief records the agreed direction, relevant guarantees, trade-offs, and rationale. It does not implement the design, commit scaffolds, or invoke the next Matt skill. The user starts the next skill.

## Preserve the agreement through synthesis

Publish the Architecture brief as Flow Results. `/to-spec` carries the agreed decisions and necessary visuals into a self-contained canonical spec, with links to glossary terms and qualifying ADRs. A Scratch page alone is not the durable design handoff. Do not introduce a separate required design document or copy canonical glossary and ADR explanations into it.

If `/to-spec` discovers a new consequential architecture fork, pause affected synthesis, expose the evidence and missing choice, and return to user-invoked grilling before publishing a spec that commits to it. Arranging agreed material and the existing confirmation steps do not constitute a new architecture interview. Implementation likewise surfaces a necessary change to an agreed consequential guarantee rather than silently changing it; ordinary coding decisions stay implementation-owned.

## Alternatives and prior decisions

- Import architect as a separate user-invoked flow. Rejected because it adds a competing entry point and its default proceeds into implementation without a human checkpoint.
- Turn `/to-spec` into the architecture interview. Rejected to preserve its synthesis role and avoid deciding the same design twice.
- Require alternatives for every change or every named risk category. Rejected because an established decision may already settle the choice.
- Keep a separate canonical design file for every change. Rejected in favor of existing Flow Results and a self-contained spec.

This refines [ADR 0015](0015-matt-skills-are-the-core-and-addons-supplement-them.md) without replacing its Matt flow. It revisits the rationale for rejecting `pstack/architect` in the Decision register: existing overlap remains useful, but does not by itself define the assessment boundary or the visual agreement required here. The register must be reconciled with the actual adaptation when the workflow change is implemented.

The [canonical research note](../research/architecture-design-in-grilling.md) contains the primary sources, definitions, boundary examples, and limitations. The activation rule is a local policy supported by those distinctions, not a standardized or empirically validated classifier.

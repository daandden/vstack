---
status: accepted
---

# Every grill sketches two shapes, and contested designs run compare-attempts

The maintainer chose this in the Update to pstack `0b46ec399d55f2829e88822998f53b84944837d3`, which cut pstack's architect skill to two sentences: trace every system the change touches, sketch two shapes, and pick the one where each piece of state has one owner, each task has one way to do it, and callers need to know least; run arena for a large or contested design. grill-with-docs follows that workflow for every change instead of expanding into design only when its assessment finds an unsettled consequential choice. For a large or contested design, the grill starts compare-attempts with kind `reply` on its own, as pstack starts arena, and brings the synthesis to its design question.

This amends the activation rule of [ADR 0053](0053-architecture-agreement-belongs-in-the-grill.md). The rest of ADR 0053 holds, including its rule not to invent a second viable candidate when constraints rule it out. Two sketches do not mean two viable choices. When constraints leave one viable shape, the grill still sketches a second one and shows the constraint it fails, but does not offer it as a pick. The sketches stay at owners, modules, and contracts, so function signatures, local types, and file layout remain with the implementing agent. The user still agrees the direction through the grill's questions, and the Architecture brief still records it as a Flow Result before to-spec. It also amends compare-attempts' start rule, which ran only when the user's words asked for several attempts. A grill-started run is the one exception.

## Considered Options

- Keep the assessment-first trigger and add only architect's new screening cues. The maintainer chose the Upstream trigger instead.
- Offer compare-attempts as an option in the design question, so the user's pick is the explicit request. Rejected: the maintainer wanted arena's automatic behavior, accepting three isolated runs and a judge per contested design.
- Sketch types and signatures as Upstream does. Rejected: the agreement stays at owners and contracts, and implementers keep coding details.
- Drop the Architecture brief. Rejected: to-spec carries the agreement from the brief.

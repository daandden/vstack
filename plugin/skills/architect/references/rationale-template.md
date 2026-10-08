# Rationale template

Write one page in the reply and on the driving ticket, not in a design document. Replace the notes below with content. Write Usage first, then derive Shape from it.

## Problem

Name the task and the existing constraints that make the shape non-obvious. Cite Ground findings and confidence levels. Include existing types, callers, and invariants that the design must honor.

## Usage (caller's view)

Show the README or quickstart that the consumer reads, plus two or three realistic call sites. Name imports, calls, and return values. Usage is the spec. Reconcile types to usage when they disagree.

## Shape

Describe data structures first, then trace data through signatures and modules. Name the decisions, invariants in types, validation locations, and deliberate omissions. Judge depth explicitly. State what complexity the interface hides and what callers still need to know. Cite the principle behind each decision without restating it.

List the interfaces as proposed seams, with paths, behavior, invariants, ordering, and error modes. Record whether a checkpoint sign-off covers them.

## Synthesis decision

architect fills this section after comparing candidates. Name the base and why it won, retained parts and their sources, and rejected parts with reasons. For compare-attempts, retain its synthesis note, cross-judge outcome, and losing patch paths.

## Tradeoffs accepted

Name each exchange: "We accept X in exchange for Y." Include choices that a future reader can mistake for oversights.

## Alternatives considered

Name concrete alternative shapes and why they lost. Compare depth, locality, and seam placement. State what each exposes to callers and what it hides. Keep candidate comparison in Synthesis decision; this section covers alternatives within the chosen design.

## Open questions and risks

Name unresolved decisions and risks before implementation. Any question addressed to the user goes through `ask`, not prose alone. Separate evidence from inference.

## Next implementation step

Name the first slice to build and its proposed seam. At the `sketch` stop, the caller fills the bodies. Otherwise implement fills them after seam agreement.

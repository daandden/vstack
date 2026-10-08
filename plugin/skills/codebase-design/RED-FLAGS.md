# Red flags

Screen every design against these flags before you compare designs. A red flag is a reason to revise the design or drop it. Uses the vocabulary in [SKILL.md](SKILL.md).

## Shallow module

Depth is defined in [SKILL.md](SKILL.md). A deep call chain is not a deep module: a chain of layers spreads understanding across modules, while a deep module keeps behaviour behind one interface.

Signs:

- Callers coordinate several methods to complete one operation.
- The interface exposes internal stages or implementation choices as options.
- Learning the interface does not spare the caller from learning the implementation.

## Information leakage

Two or more modules depend on the same decision inside one implementation. A representation, policy, or protocol detail appears in more than one place, so a change to it needs edits in each.

An interface that re-exports transport or wire types leaks. Parse outside data into domain types behind the seam, and keep storage schemas, framework objects, and protocol details inside the implementation.

## Temporal decomposition

Modules follow the order in which code runs, not the knowledge each one owns. Separate load, validate, transform, and save modules often repeat one representation and its invariants across several seams.

Group code by the knowledge and decisions it owns. Methods that run at different times still belong in one module when they guard the same decisions.

## Pass-through method

A method passes the same arguments to another method with the same shape. It adds a layer and hides nothing.

Remove it, or move the work to the module that can finish the operation. Keep a forwarding interface only when it adds policy, adapts one interface to another (an adapter), or gives callers a distinct abstraction.

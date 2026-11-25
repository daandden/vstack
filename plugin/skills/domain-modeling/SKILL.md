---
name: domain-modeling
description: Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing a GLOSSARY.md, or recording or editing an ADR.
---

# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the *active* discipline: challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise. (Merely *reading* `GLOSSARY.md` for vocabulary is not this skill: that's a one-line habit any skill can do. This skill is for when you're changing the model, not just consuming it.)

## File structure

Most repos have a single context:

```
/
├── GLOSSARY.md
├── docs/
│   └── adr/
│       ├── 20261111-event-sourced-orders.md
│       └── 20261111-postgres-for-write-model.md
└── src/
```

If a `GLOSSARY-MAP.md` exists at the root, the repo has multiple contexts. The map points to where each one lives:

```
/
├── GLOSSARY-MAP.md
├── docs/
│   └── adr/                          ← system-wide decisions
├── src/
│   ├── ordering/
│   │   ├── GLOSSARY.md
│   │   └── docs/adr/                 ← context-specific decisions
│   └── billing/
│       ├── GLOSSARY.md
│       └── docs/adr/
```

Create files lazily: only when you have something to write. If no `GLOSSARY.md` exists, create one when the first term is resolved. If no `docs/adr/` exists, create it when the first ADR is needed.

## During the session

Follow `skill://flow-page`'s "Stage entry/exit line" for a domain-modeling run. In a Flow, route questions through `ask` under its "Every ask in a Flow" contract. Outside a Flow, use plain `ask`. A timeout, cancellation, or headless recommendation does not settle a term or a new decision. In a Flow, publish resulting terms, scenarios, and decisions as Document Results linked to the canonical glossary or ADR files.

### Challenge against the glossary

When a term conflicts with `GLOSSARY.md`, check whether the user means the existing concept or is proposing a change. Surface the discrepancy. Apply the [Settle-or-ask test](../../rules/vstack-settle-or-ask.md) before asking about the meaning.

### Sharpen fuzzy language

When a term is vague or overloaded, compare the candidate meanings against the glossary and the user's examples. Apply the shared test before putting competing meanings or a new name to the user.

### Discuss concrete scenarios

Stress-test domain relationships with concrete edge cases. Use the existing domain rules to answer the scenarios they cover. Put only unresolved choices that pass the shared test to the user.

### Cross-reference with code

When the user states how something works, check the code. Distinguish current behavior from a proposal to change it. Report the observed mismatch and apply the shared test to any unresolved product choice.

### Update GLOSSARY.md inline

Reuse existing definitions and carry settled terms into `GLOSSARY.md` without asking again. Apply the shared test to a new concept or preferred public name. Update the glossary when a term is resolved. Use [GLOSSARY-FORMAT.md](./GLOSSARY-FORMAT.md).

`GLOSSARY.md` should be totally devoid of implementation details. Do not treat `GLOSSARY.md` as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Record qualifying decisions

Record a decision the user already made as an ADR without offering it through `ask`, but only when all three are true:

1. **Hard to reverse**: the cost of changing your mind later is meaningful
2. **Surprising without context**: a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off**: there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Record the settled decision, its placement, and any supersession links. Apply the shared test before raising a new fallback, guarantee, or policy choice. Do not record it as an agreed ADR while it is open. In a grill, record the bookkeeping as an Assumed pick with its reason. Use [ADR-FORMAT.md](./ADR-FORMAT.md).

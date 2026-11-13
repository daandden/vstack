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

When the user uses a term that conflicts with the existing language in `GLOSSARY.md`, call it out immediately through `ask`: "Your glossary defines 'cancellation' as X, but you seem to mean Y, so which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term through `ask` with the candidates. "You're saying 'account': do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and put each one to the user through `ask`, so they have to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it through `ask`: "Your code cancels entire Orders, but you just said partial cancellation is possible, so which is right?"

### Update GLOSSARY.md inline

Reuse existing definitions and carry settled terms into `GLOSSARY.md` without asking again. When a term is resolved, update the glossary right there. Don't batch these up: capture them as they happen. Ask about a new product concept or a preferred public name. Use the format in [GLOSSARY-FORMAT.md](./GLOSSARY-FORMAT.md).

`GLOSSARY.md` should be totally devoid of implementation details. Do not treat `GLOSSARY.md` as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Record qualifying decisions

Record a decision the user already made as an ADR without offering it through `ask`, but only when all three are true:

1. **Hard to reverse**: the cost of changing your mind later is meaningful
2. **Surprising without context**: a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off**: there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Record the settled decision, its placement, and any supersession links. Recording never settles a new fallback, guarantee, or policy. Ask about any such open choice before recording it as decided. In a grill, record the bookkeeping as an Assumed pick with its reason under grilling's Bookkeeping list. Use the format in [ADR-FORMAT.md](./ADR-FORMAT.md).

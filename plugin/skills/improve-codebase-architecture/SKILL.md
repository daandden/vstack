---
name: improve-codebase-architecture
description: Scan a codebase for deepening opportunities, publish candidate Results on the Flow page, then draft several interfaces for the one you pick and grill through them.
disable-model-invocation: true
---

# Improve Codebase Architecture

Surface architectural friction and propose deepening opportunities: refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability.

This command is _informed_ by the project's domain model and built on a shared design vocabulary:

- Run the `skill://codebase-design` skill for the architecture vocabulary (module, interface, depth, seam, adapter, leverage, locality) and its principles (the deletion test, "the interface is the test surface", "one adapter = hypothetical seam, two = real"). Use these terms exactly in every suggestion, and don't drift into "component," "service," "API," or "boundary."
- The domain language in `GLOSSARY.md` gives names to good seams; ADRs in `docs/adr/` record decisions this command should not re-litigate.

## Process

### 1. Explore

Scope before you scan: YAGNI. Deepening a module pays off by making future changes to it easier, so put extra weight on the parts of the codebase that have recently changed. Decide *where* to look before you look:

- If the user named a direction (a module, a subsystem, a pain point), take it, and skip the inference below.
- Otherwise, walk back a good stretch of the commit history (`git log --oneline`) to find the codebase's hot spots, the files and areas that keep coming up, and let those paths pull your attention first. If the changes are scattered with no clear hot spot, widen the net.

Read the project's domain glossary (`GLOSSARY.md`) and any ADRs in the area you're touching first.

Resolve the absolute vstack root once: the git common directory's `vstack/` when its `config/` exists (Private mode), otherwise the main checkout root (Standard mode). Read domain documents and ADRs from that mode's configured paths.

Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): walk the scoped codebase using the brief below and return evidence-backed candidates and open questions without editing or asking, the vstack root. Wait for its result. If it cannot be spawned, stop: report the architecture review as not run, with no candidates.

Don't follow rigid heuristics; explore organically and note where you experience friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules shallow, with an interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called (no locality)?
- Where do tightly-coupled modules leak across their seams?
- Which parts of the codebase are untested, or hard to test through their current interface?

Apply the deletion test to anything you suspect is shallow: would deleting it concentrate complexity, or just move it? A "yes, concentrates" is the signal you want.

### 2. Present candidates on the Flow page

Read `skill://flow-page`. Discover the supplied session and agent's binding with `bound`, then open an improve-codebase-architecture Stage on that Flow, or start one when unbound. Reopen a closed Flow explicitly. The candidates, the pick, and the grilling that follows all go in this Stage.

If exploration finds no evidence-backed candidate, publish that outcome as a Document Result with the searched scope, evidence, and limitations. Finish the Stage without an empty candidate Result or pick question.

Draw a before figure and an after figure for each candidate through `skill://vstack-figures`. Write each Figure brief with that skill's fields, layout included, fixed from the evidence. Give both figures the same type and layout so the reader compares them part by part. Label leakage and seams in words as well as color. Keep sources in a distinct project Scratch entry with unique basenames. If drawing cannot run, stop and report the missing prerequisite.

Write one `result` item with `shape: "cards"` while the drawers run. Give each candidate one entry with a stable `ref`:

- `title`: the deepening, named in the domain and architecture vocabulary.
- `label`: the recommendation strength, one of `Strong`, `Worth exploring`, or `Speculative`.
- `blocking`: `false`.
- `evidence`: the files and modules involved, then the problem: why the current architecture causes friction.
- `action`: the solution, a plain English description of what changes.
- `impact`: the benefits in terms of locality and leverage, and how the tests improve.

Capture the before and after SVGs as typed attachments. Publish a companion Document with a section for each candidate and its two `figure` blocks. Name this candidate Result's entries in the pick question's `results`; the script creates reciprocal links. Put the top recommendation in the Result's `summary` line.

Use GLOSSARY.md vocabulary for the domain, and the `skill://codebase-design` vocabulary for the architecture. If `GLOSSARY.md` defines "Order," talk about "the Order intake module," not "the FooBarHandler," and not "the Order service."

ADR conflicts: if a candidate contradicts an existing ADR, only surface it when the friction is real enough to warrant revisiting the ADR. Start the card's `evidence` with the conflict, such as _"Contradicts ADR-0007, but worth reopening because…"_. Don't list every theoretical refactor an ADR forbids.

Do not propose interfaces yet. Submit the candidate Result, figure attachments, Document, and pick round in one contribution. The first round asks which candidate to explore, with one option per entry in entry order and the top recommendation as recommended. Its question's `results` names every candidate entry. Present the receipt's page and pass its `ask` payload to `ask`, then record the response through flow-page.

### 3. Design It Twice

Once the user picks a candidate, read `skill://codebase-design` and run its DESIGN-IT-TWICE.md in this Stage before any other question. Its problem-space Document, screened design Document, and Comparison Result stay on this page. Preserve complete interfaces and usage examples in the Document and compare depth, locality, and seam placement in the Comparison.

The design question is the grilling loop's first question: which design, or which hybrid, to keep. Submit its round after the design Results, with one option per surviving alternative and a hybrid option when proposed. Link the question's `results` to those Results. Its description names each dropped design with its red flag. Present the receipt's `ask` payload and record the response.

If Design It Twice stops at its Fan-out stop clause, or screening drops every design, publish the failed screening with its limitations rather than a fabricated Comparison. Name each dropped design and red flag in the next question's description, then grill the module's shape without designs.

### 4. Grilling loop

Run `skill://grilling` to walk the decision tree with the user. Its rounds continue through the common authoring interface in this Stage, starting from the design question, then constraints, dependencies, hidden implementation, and surviving tests. After its summary, finish the Stage with retirement reasons for unresolved questions. If no candidate is picked, record that outcome and finish the Stage without implying authorization.

Side effects happen inline as decisions crystallize. Run the `skill://domain-modeling` skill to keep the domain model current as you go:

- Naming a deepened module after a concept not in `GLOSSARY.md`? Add the term to `GLOSSARY.md`. Create the file lazily if it doesn't exist.
- Sharpening a fuzzy term during the conversation? Update `GLOSSARY.md` right there.
- User rejects the candidate with a load-bearing reason? Use `ask` to offer recording an ADR so future architecture reviews do not re-suggest it. Only offer when the reason would actually be needed by a future explorer to avoid re-suggesting the same thing. Skip ephemeral reasons ("not worth it right now") and self-evident ones.

Every in-session question, including the pick and ADR offer, goes through flow-page's "Every ask in a Flow" contract. A timed-out choice remains unanswered. For approval gates, re-ask once, then stop without acting if it times out again. A headless run records the recommended assumption honestly, never as the user's answer.

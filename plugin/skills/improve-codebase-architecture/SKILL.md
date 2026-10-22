---
name: improve-codebase-architecture
description: Scan a codebase for deepening opportunities, show them as candidate cards on the flow's Grilling page, then draft several interfaces for the one you pick and grill through them.
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

### 2. Present candidates on the flow's Grilling page

Read `skill://grilling-page`. Find or start the flow's page, as its "Find or start the page" section says. Add an improve-codebase-architecture Stage, as its "Add a Stage" section says. The candidates, the pick, and the grilling that follows all go in this Stage.

Draw a before figure and an after figure for each candidate through `skill://vstack-figures`, with type, size, labels, and content fixed from the evidence. The before figure shows the shallowness, and the after figure shows the deepening. Give both figures of a candidate the same type and layout, so that the reader compares them part by part. Label leakage and seams in words as well as in color. The out dir is the flow folder's `figures/`, and each figure gets a unique basename. Do not hand-draw replacement figures or fall back to Mermaid. If drawing cannot run, stop and report the missing prerequisite.

Write the candidates as one `report` record with shape `cards` while the drawers run. Give each candidate one card:

- `title`: the deepening, named in the domain and architecture vocabulary.
- `label`: the recommendation strength, one of `Strong`, `Worth exploring`, or `Speculative`.
- `blocking`: `false`.
- `evidence`: the files and modules involved, then the problem: why the current architecture causes friction.
- `action`: the solution, a plain English description of what changes.
- `impact`: the benefits in terms of locality and leverage, and how the tests improve.
- `visual`: `{ "svg": "figures/<before file>" }`, then `{ "svg": "figures/<after file>" }`.
- `question`: the id of the pick question.

Put the top recommendation in the report's `summary` line: which candidate to tackle first, and why.

Use GLOSSARY.md vocabulary for the domain, and the `skill://codebase-design` vocabulary for the architecture. If `GLOSSARY.md` defines "Order," talk about "the Order intake module," not "the FooBarHandler," and not "the Order service."

ADR conflicts: if a candidate contradicts an existing ADR, only surface it when the friction is real enough to warrant revisiting the ADR. Start the card's `evidence` with the conflict, such as _"Contradicts ADR-0007, but worth reopening because…"_. Don't list every theoretical refactor an ADR forbids.

Do NOT propose interfaces yet. The pick question is the next question: which candidate to explore. Write it as the first round of the Stage, as grilling-page's "Add a round" section says, with one option per candidate in card order and the top recommendation as the recommended option. Give it `report_entries` with every card. Collect the figures, then append the report, the round, and the pick question in one `append`, because they link to each other. Print the page path, then `ask` the pick question.

### 3. Design It Twice

Once the user picks a candidate, read `skill://codebase-design` and run its DESIGN-IT-TWICE.md for that candidate before any other question. Show its step 1 problem-space explanation in chat while the designs are drafted.

Show the screened designs on the page, not one after another in chat. Write one `report` record with shape `cards` in this Stage, titled after the candidate. Give each design that survived screening one card, in design order:

- `title`: the design, named by its design constraint in the `skill://codebase-design` and GLOSSARY.md vocabulary.
- `label`: `recommended` for the design you recommend, otherwise `design`.
- `blocking`: `false`.
- `evidence`: the interface: types, methods, params, invariants, ordering, and error modes.
- `action`: what the implementation hides behind the seam, and the dependency strategy and adapters.
- `impact`: the trade-offs, where leverage is high and where it is thin.
- `visual`: the usage example as a `{ "text" }` visual.
- `question`: the id of the design question.

Write the report's `summary` as one short paragraph of a sentence or two. It compares the designs by depth, locality, and seam placement, then says which design or hybrid to keep, and why.

The design question is the grilling loop's first question: which design, or which hybrid, to keep. Write it as that loop's first round, as grilling-page's "Add a round" section says. Its `description` says what the choice decides and names each design that screening dropped with its red flag. Give it one option per card in card order, plus one hybrid option when you propose a hybrid, and make the recommendation the recommended option. Give it `report_entries` with every card. Append the report, the round, and the design question in one `append`, because they link to each other.

If Design It Twice stops at its Fan-out stop clause, or screening drops every design, write no design report. Say so, and name each dropped design with its red flag, in chat and in the description of the grilling loop's first question. Then grill the shape of the deepened module without designs.

### 4. Grilling loop

Run the `skill://grilling` skill to walk the decision tree with the user. It starts from the design question, then walks the rest of the tree: constraints, dependencies, what sits behind the seam, what tests survive. Its rounds continue in this skill's Stage on the same page. When grilling closes with its summary, mark the Stage finished. If no candidate is picked, the Stage asks no more: close its session and mark it finished, as grilling-page's "Add a Stage" section says.

Side effects happen inline as decisions crystallize. Run the `skill://domain-modeling` skill to keep the domain model current as you go:

- Naming a deepened module after a concept not in `GLOSSARY.md`? Add the term to `GLOSSARY.md`. Create the file lazily if it doesn't exist.
- Sharpening a fuzzy term during the conversation? Update `GLOSSARY.md` right there.
- User rejects the candidate with a load-bearing reason? Use `ask` to offer recording an ADR so future architecture reviews do not re-suggest it. Only offer when the reason would actually be needed by a future explorer to avoid re-suggesting the same thing. Skip ephemeral reasons ("not worth it right now") and self-evident ones.

Every in-session question, the pick and the ADR offer included, is a question on the flow's Grilling page, as grilling-page's "Every ask in a flow" section says. A timed-out choice remains unanswered. For approval gates, re-ask once, then stop without acting if it times out again. A headless run takes the recommended answer and records it, as grilling-page's "Record answers" section says.

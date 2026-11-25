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

Give the explorer a fresh context window with the scoped brief and its context pointers.

Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): walk the scoped codebase using the brief below and return evidence-backed candidates and open questions without editing or asking, the vstack root. Wait for its result. If it cannot be spawned, stop: report the architecture review as not run, with no candidates.

Don't follow rigid heuristics; explore organically and note where you experience friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules shallow, with an interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called (no locality)?
- Where do tightly-coupled modules leak across their seams?
- Which parts of the codebase are untested, or hard to test through their current interface?

Apply the deletion test to anything you suspect is shallow: would deleting it concentrate complexity, or just move it? A "yes, concentrates" is the signal you want.

### 2. Present candidates on the Flow page

Follow `skill://flow-page`'s "Stage entry/exit line". Publish the candidates and pick here. Use grilling as the interviewing procedure below.

If exploration finds no evidence-backed candidate, publish that outcome as a Document Result with the searched scope, evidence, and limitations. Finish the Stage without an empty candidate Result or pick question.

Draw a before figure and an after figure for each candidate through `skill://vstack-figures`. Write their Mermaid in this caller's context. Give both figures the same type and layout so the reader compares them part by part. Label leakage and seams in words as well as color. Open the marked `improve-codebase-architecture` session folder through `skill://vstack-tmp`. Keep sources in a distinct entry inside it, with unique basenames. If drawing cannot run, stop and report the missing prerequisite.

Write one `result` item with `shape: "cards"`. Give each candidate one entry with a stable `ref`:

- `title`: the deepening, named in the domain and architecture vocabulary.
- `label`: the recommendation strength, one of `Strong`, `Worth exploring`, or `Speculative`.
- `blocking`: `false`.
- `evidence`: only source file and line references for the modules involved.
- `action`: the solution, a plain English description of what changes.
- `impact`: the current architectural problem and its consequences, then the expected benefits in locality and leverage, and how the tests improve.

Capture the before and after Mermaid sources as `mermaid` attachments. Publish a companion Document with a section for each candidate and its two `figure` blocks. Name this candidate Result's entries in the pick question's `results`; the script creates reciprocal links. Put the top recommendation in the Result's `summary` line.

Use GLOSSARY.md vocabulary for the domain, and the `skill://codebase-design` vocabulary for the architecture. If `GLOSSARY.md` defines "Order," talk about "the Order intake module," not "the FooBarHandler," and not "the Order service."

ADR conflicts: if a candidate contradicts an existing ADR, only surface it when the friction is real enough to warrant revisiting the ADR. Start the card's `impact` with the conflict, such as _"Contradicts ADR-0007, but worth reopening because…"_. Don't list every theoretical refactor an ADR forbids.

Apply the [Settle-or-ask test](../../rules/vstack-settle-or-ask.md) to candidate selection. Reuse a selection already settled by the request or evidence. If no question remains, publish the Results without a round and proceed with the selected candidate.

If candidate selection needs a question, publish the candidate Result, figure attachments, Document, and complete pick round with its Decision brief in one Flow CLI contribution. Ask and record the response under `skill://flow-page`'s "Every ask in a Flow". Offer one option per entry in entry order and mark the top recommendation. In `results`, link each candidate entry. The reader needs to compare before and after shapes. Repeat the captured Mermaid references in the question's `figures` in candidate order, with `kind: "before-after"`. Do not propose interfaces yet.

### 3. Design It Twice

Once a candidate is selected, read `skill://codebase-design` and run its DESIGN-IT-TWICE.md in this Stage before any design question. Its problem-space Document, screened design Document, and Comparison Result stay on this page. Preserve complete interfaces and usage examples in the Document and compare depth, locality, and seam placement in the Comparison.

Apply the shared test to the design disposition. If no question remains, record the settled design with its basis and continue the grilling loop at the next open decision.

If the design disposition needs a question, put it first in the grilling loop. Deliver its Decision brief through the same Flow publication and `ask` contract after the design Results. Offer one option per surviving alternative and a hybrid option when proposed. Link the question's `results` to those Results. Name dropped designs and their red flags in its description. Declare the need to see how a caller uses each design, and repeat its actual usage example on each option as `preview: { text: "<usage example>", kind: "option-preview" }`. Record the response through the common contract.

If Design It Twice stops at its Fan-out stop clause, or screening drops every design, publish the failed screening with its limitations rather than a fabricated Comparison. Name each dropped design and red flag in the next question's description, then grill the module's shape without designs.

### 4. Grilling loop

Use `skill://grilling`'s interviewing procedure to walk the decision tree with the user, starting from the design question, then constraints, dependencies, hidden implementation, and surviving tests. Record a no-candidate or no-pick outcome without implying authorization.

For feedback on a before-and-after figure, usage example, or design, follow [grilling's correction path](../grilling/SKILL.md#settle-or-ask). A correction to a candidate does not select it or settle a pending design choice.

Side effects happen inline as decisions crystallize. Run the `skill://domain-modeling` skill to keep the domain model current as you go:

- Naming a deepened module after a concept not in `GLOSSARY.md`? Add the term to `GLOSSARY.md`. Create the file lazily if it doesn't exist.
- Sharpening a fuzzy term during the conversation? Update `GLOSSARY.md` right there.
- If the user rejects a candidate for a lasting trade-off, record it only when it meets skill://domain-modeling's ADR criteria. Recording the decision needs no offer. Apply the shared test to any new policy the rejection leaves open.

Deliver any remaining question under flow-page's "Every ask in a Flow" when enrolled, or plain `ask` in chat. A timed-out choice remains unanswered. For approval gates, re-ask once, then stop without acting if it times out again. A headless run records the recommended assumption as such, never as the user's answer.

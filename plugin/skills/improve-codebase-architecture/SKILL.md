---
name: improve-codebase-architecture
description: Scan a codebase for deepening opportunities, present them as a visual HTML report, then grill through whichever one you pick.
disable-model-invocation: true
---

# Improve Codebase Architecture

Surface architectural friction and propose deepening opportunities — refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability.

This command is _informed_ by the project's domain model and built on a shared design vocabulary:

- Run the `skill://codebase-design` skill for the architecture vocabulary (module, interface, depth, seam, adapter, leverage, locality) and its principles (the deletion test, "the interface is the test surface", "one adapter = hypothetical seam, two = real"). Use these terms exactly in every suggestion — don't drift into "component," "service," "API," or "boundary."
- The domain language in `GLOSSARY.md` gives names to good seams; ADRs in `docs/adr/` record decisions this command should not re-litigate.

## Process

### 1. Explore

Scope before you scan — YAGNI. Deepening a module pays off by making future changes to it easier, so put extra weight on the parts of the codebase that have recently changed. Decide *where* to look before you look:

- If the user named a direction — a module, a subsystem, a pain point — take it, and skip the inference below.
- Otherwise, walk back a good stretch of the commit history (`git log --oneline`) to find the codebase's hot spots — the files and areas that keep coming up — and let those paths pull your attention first. If the changes are scattered with no clear hot spot, widen the net.

Read the project's domain glossary (`GLOSSARY.md`) and any ADRs in the area you're touching first.

Resolve the absolute vstack root once: the git common directory's `vstack/` when its `config/` exists (Private mode), otherwise the main checkout root (Standard mode). Read domain documents and ADRs from that mode's configured paths. Carry the user's override words unchanged.

Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): walk the scoped codebase using the brief below and return evidence-backed candidates and open questions without editing or asking, the user's override words, the vstack root. Wait for its result. If it cannot be spawned, do the work yourself.

Don't follow rigid heuristics — explore organically and note where you experience friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules shallow — interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called (no locality)?
- Where do tightly-coupled modules leak across their seams?
- Which parts of the codebase are untested, or hard to test through their current interface?

Apply the deletion test to anything you suspect is shallow: would deleting it concentrate complexity, or just move it? A "yes, concentrates" is the signal you want.

### 2. Present candidates as an HTML report

Read `skill://vstack-tmp` and resolve the `architecture-review/` kind. Create a fresh `architecture-review-<timestamp>/` entry there. Start from [templates/architecture-review.html](templates/architecture-review.html) and write `index.html` in that entry. Keep the report one-file and usable offline: inline styles and SVG, no CDN scripts, remote fonts, or linked assets.

Draw every candidate's before/after figure through `skill://diagram-design`, with type, size, labels, and content fixed from the evidence. Save each figure's source under this entry. Export each through `skill://diagram-design/scripts/export_svg.py` using eval Python (`runpy.run_path` with `sys.argv` set to the resolved script path, input HTML path, and output SVG path). Inline the exported `<svg>` in the report; use unique figure filenames so their IDs do not collide. Do not hand-draw replacement figures or fall back to Mermaid. If drawing cannot run, stop and report the missing prerequisite.

Open the completed page with the platform opener when available (`open`, `xdg-open`, or `start`). Always print its absolute `file://` URL, even if opening is unavailable.

For each candidate, render a card with:

- Files — which files/modules are involved
- Problem — why the current architecture is causing friction
- Solution — plain English description of what would change
- Benefits — explained in terms of locality and leverage, and how tests would improve
- Before / After diagram — side-by-side, custom-drawn, illustrating the shallowness and the deepening
- Recommendation strength — one of `Strong`, `Worth exploring`, `Speculative`, rendered as a badge

End the report with a Top recommendation section: which candidate you'd tackle first and why.

Use GLOSSARY.md vocabulary for the domain, and the `skill://codebase-design` vocabulary for the architecture. If `GLOSSARY.md` defines "Order," talk about "the Order intake module" — not "the FooBarHandler," and not "the Order service."

ADR conflicts: if a candidate contradicts an existing ADR, only surface it when the friction is real enough to warrant revisiting the ADR. Mark it clearly in the card (e.g. a warning callout: _"contradicts ADR-0007 — but worth reopening because…"_). Don't list every theoretical refactor an ADR forbids.

See [HTML-REPORT.md](HTML-REPORT.md) for the full HTML scaffold, diagram patterns, and styling guidance.

Do NOT propose interfaces yet. After the file is written, use `ask` to select a candidate, with one short option per candidate and the top recommendation marked `recommended`.

### 3. Grilling loop

Once the user picks a candidate, run the `skill://grilling` skill to walk the decision tree with them — constraints, dependencies, the shape of the deepened module, what sits behind the seam, what tests survive.

Side effects happen inline as decisions crystallize — run the `skill://domain-modeling` skill to keep the domain model current as you go:

- Naming a deepened module after a concept not in `GLOSSARY.md`? Add the term to `GLOSSARY.md`. Create the file lazily if it doesn't exist.
- Sharpening a fuzzy term during the conversation? Update `GLOSSARY.md` right there.
- User rejects the candidate with a load-bearing reason? Use `ask` to offer recording an ADR so future architecture reviews do not re-suggest it. Only offer when the reason would actually be needed by a future explorer to avoid re-suggesting the same thing — skip ephemeral reasons ("not worth it right now") and self-evident ones.
- Want to explore alternative interfaces for the deepened module? Run the `skill://codebase-design` skill and use its DESIGN-IT-TWICE Fan-out block.

Every in-session question goes through `ask`. A timed-out choice remains unanswered. For approval gates, re-ask once, then stop without acting if it times out again. If `ask` is absent in a subagent, return open questions to the parent; a headless run takes and reports the recommended answer.

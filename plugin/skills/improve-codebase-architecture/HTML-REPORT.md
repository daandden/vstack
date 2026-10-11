# Architecture report

Start from [templates/architecture-review.html](templates/architecture-review.html). Resolve Scratch through `skill://vstack-tmp`; keep one run in one `architecture-review/` entry. The delivered `index.html` is self-contained and offline, with inline CSS and figures exported through `skill://diagram-design/scripts/export_svg.py` in eval Python. Print its plain absolute path, with no `file://` prefix.

## Cards

Use the domain glossary and `skill://codebase-design` vocabulary: module, interface, implementation, depth, deep, shallow, seam, adapter, leverage, locality.

Each candidate card has a stable anchor, a title naming the deepening, recommendation strength (Strong, Worth exploring, Speculative), dependency category, files, problem, solution, benefits, and before/after figures. Do not propose an interface before the user chooses a candidate through `ask`.

Draw every figure through `skill://diagram-design`. Use architecture delta for dependency changes, sequence for round trips, or a mass diagram for interface versus implementation depth. Fix labels and content from source evidence. Export and inline the SVG; do not embed a hand-built substitute or a Mermaid renderer. The template has no baked-in figure.

Keep diagrams readable on narrow screens and in print. Use a short caption and a legend; identify leakage and seams by labels as well as color. Add a linked ADR warning only when observed friction warrants reopening that decision.

End with a Top recommendation: one linked candidate and one sentence explaining why it comes first. Keep statements evidence-backed, benefits specific to locality, leverage, and testing, and prose short.

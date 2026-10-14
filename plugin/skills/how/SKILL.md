---
name: how
description: Explain how existing code works, where it lives, and which layer owns it. Use why for motivation.
disable-model-invocation: true
---

# How

Trace the mechanism at the level of a senior engineer joining a subsystem. Give cited evidence, not annotated source code.

## 1. Assess the question

If the scope is ambiguous, state your interpretation and explore. The user can redirect.

The top-level agent resolves the vstack root per the Private-mode rule. Read `skill://vstack-tmp` and obtain the project Scratch dir once. Under a caller, use its supplied absolute root and Scratch dir. Create a distinct `how/<run-id>/` entry. Pass both paths to each brief. Read `references/explainer-prompt.md` for the explanation structure.

Split the question into 1–4 exploration angles. Two to four angles go to step 2. When in doubt, take the simple path.

One angle needs no explorers. Build the explainer's brief from `references/explainer-prompt.md` without the explorer-findings section. It explores and explains in one pass.

Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): explain the question from that brief with file and symbol citations and figure briefs, the user's override words, the vstack root, the Scratch dir. Wait for its result. If it cannot be spawned, do the work yourself.

Go to step 4.

## 2. Explore several angles

Count the files and directories for each angle with one quick `glob` or `grep` pass.
Before this step, read skill://vstack-fan-out and run its gate on the block below.

Fan-out gate (skill://vstack-fan-out): parts: one per exploration angle; size: files and directories each angle covers, from one quick glob/grep pass.
- fan-out → one `task` call; `tasks[]` has one item per part, each with `agent: "vstack-explorer"`. Each `task`: explore its angle from `references/explorer-prompt.md` and return cited findings, the user's override words, the vstack root, the Scratch dir.
- inline → do every part yourself, in order, from the same brief.

After fan-out, wait for every finding and go to step 3. After inline exploration, write the explanation yourself from `references/explainer-prompt.md`. Skip step 3 and go to step 4.

## 3. Combine findings

Build the brief from `references/explainer-prompt.md` with every explorer's findings. Reconcile overlaps and resolve contradictions against the code.

Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): write the explanation from every finding and return citations and figure briefs, the user's override words, the vstack root, the Scratch dir. Wait for its result. If it cannot be spawned, do the work yourself.

## 4. Present

Write the explanation into `templates/how.html` under the run's Scratch entry. Draw the figures through `skill://diagram-design` as described below. Print the plain absolute path of the page with the explanation, with no `file://` prefix. For a direct invocation, open the completed page once in the browser. Under a caller, return the output unedited, including citations, figure briefs, and the page path. The caller can blend it into its own page. Light edits for clarity are allowed only for a direct invocation.

## Figures and page

Use Overview, Key concepts, How it works, Where things live, and Gotchas. Drop sections that do not apply. Cite files and symbols beside claims. Include figures that explain component relationships or data flow.

Read `skill://diagram-design` for every figure and follow its selected type reference, profile gate, and plan confirmation. Keep each figure's source HTML and exported SVG in the same `how/<run-id>/` entry. Read `skill://diagram-design/references/export.md` and run `scripts/export_svg.py` through Python eval with `runpy` and `sys.argv`. Read the exported SVG, remove only its XML declaration, and inline its complete `<svg>` and carried style in the page. Use unique figure slugs. Keep the page self-contained, without external image files or diagram renderers. If drawing is unavailable, report the missing prerequisite rather than substitute mermaid or generated images.

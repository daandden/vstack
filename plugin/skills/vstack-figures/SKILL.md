---
name: vstack-figures
description: How a vstack skill gets its diagram-design figures drawn. It settles each figure's plan, writes one brief per figure, starts one vstack-diagram-drawer per figure, and collects the SVGs before they are placed.
disable-model-invocation: true
---

# vstack-figures

A caller is a skill step that shows figures to a person. The caller writes one brief per figure. `vstack-diagram-drawer` agents draw the figures while the caller keeps working (ADR 0023). The user picks the drawing model with the `vstack-diagram-drawer` key in omp's `task.agentModelOverrides`. With no key, the drawers run on the Session model.

## 1. Settle the plan

A drawer has no `ask`, so settle each figure's plan before any drawer starts. Fix each figure's type, size, layout, and content from the caller's rules and evidence. Choose the type with diagram-design's visual-type guide. Draw without the plan pause.

## 2. Write one Figure brief per figure

This list is the one list of a Figure brief's fields, and every caller writes them:

- Slug: a basename that is unique on the page, so that SVG IDs stay unique.
- Type and size preset.
- Layout: the figure's direction, such as left to right or top to bottom, and where each part sits, such as "the three stores in one column on the right".
- Groups, when the figure has zones, lanes, or rows: each group's name, in its order, and the nodes in it.
- Content: every node, edge, and label, and the one or two focal elements.
- Out dir: the caller's Scratch entry, `<Scratch dir>/<kind>/<entry>/`.
- The caller's extra rules for the figure, such as one step of a build-up series.

## 3. Start the drawers

Start the drawers as soon as their briefs are fixed. For two or more figures, use the Fan-out line below.

Before this step, read skill://vstack-fan-out.

Fan-out (skill://vstack-fan-out): parts: one per figure. One `task` call; `tasks[]` has one item per part, each with `agent: "vstack-diagram-drawer"`. Each `task`: draw and export the figure from its brief and return its SVG path, the vstack root, the Scratch dir. Do not wait; keep working. If they cannot start, stop: place no figure, and say in one line which figures were not drawn and why.

For one figure, use this line instead:

Spawn one `vstack-diagram-drawer` via `task` (`agent: "vstack-diagram-drawer"`): draw and export the figure from its brief and return its SVG path, the vstack root, the Scratch dir. Do not wait; keep working. If it cannot be spawned, stop: place no figure, and say in one line which figure was not drawn and why.

## 4. Keep working, then collect

Write the caller's own text while the drawers run. Wait for the drawers only at the caller's collect point, the step that places the figures. Each drawer returns an SVG path or a failure for its brief. If a figure failed, name it and its reason in one line, and place the rest.

## 5. Place the figures

Place the figures in the order of their briefs. To inline a figure, read its exported SVG and remove only the `<?xml …?>` line. Then paste the `<svg>` element with its carried `<style>` exactly as exported. A caller that takes a file, such as grilling-page's `{ "svg": "<path>" }`, gets the SVG path instead.

If no figure can be drawn (no eval tool for the export script), report that missing prerequisite. Show no Mermaid, generated image, or hand-built figure in its place.

## Draw one figure

Only a drawer follows these steps. It runs them for each brief, in order.

1. Read `skill://diagram-design`, its `references/style-guide.md`, the type reference for the brief's type, and `references/export.md`.
2. Draw the figure with the brief's type, size, layout, groups, and content. Add no node, edge, or label that the brief does not give.
3. Save the source as `<out dir>/<slug>.html`. Run diagram-design's taste gate and the eval cells for `scripts/verify-geometry.py`, `scripts/lint-skin.py`, and `scripts/self_check.py` on that file, and fix what fails.
4. Export `<out dir>/<slug>.svg` with the eval cell for `scripts/export_svg.py`.

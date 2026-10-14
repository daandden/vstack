# Figures are a fixed Fan-out of diagram drawers

A skill step that draws figures starts one `vstack-diagram-drawer` agent per figure, all at once, with no judge gate. The hidden helper `vstack-figures` holds this procedure and its one Fixed Fan-out line. explain, how, grilling-page, improve-codebase-architecture, teach, and ketchup call that helper and do not draw figures themselves. The caller settles every diagram-design question first: the skin and each figure's type, size, and content. It keeps working while the drawers run and waits only at the step that places the figures. Each drawer draws the source, exports the SVG under the caller's Scratch kind, and returns the SVG path. The drawer has no `model` field, so the user picks the drawing model through its own `task.agentModelOverrides` key. We chose this so that the user can run all figures on a model chosen for drawing, and so that figures are drawn in parallel with each other and with the caller's own writing.

## Considered Options

- Keep ADR 0004's judge gate with the standard inline line. On inline, the caller draws the figures itself, so the drawing model choice would apply only to fan-out runs.
- Keep the gate and make the inline line one drawer that draws every figure in order. This keeps ADR 0004 unchanged, but the user wanted figures in parallel every time.
- Give the drawer a fixed `model` in its frontmatter. This was the first vstack agent with its own model, against ADR 0004. The override key already gives the user the switch.
- Copy a figure form from FORMS.md into each of the six callers and allowlist all six. This gives six copies of one procedure to keep in sync.
- Let only the top-level session start drawers. This keeps every question in the session that has `ask`, but how under explain could not draw its own figures.

## Consequences

- This is the third exception to ADR 0004's judge gate, after compare-attempts and implement-spec (ADR 0022). The House style `fixed-fan-out` allowlist names `vstack-figures`, and the glossary's Fan-out entry names figure steps.
- When the user says "sequential" or "no fan-out", one drawer draws every figure in order, still on the user's chosen model.
- When no drawer can start, the caller draws the figures itself and says why in one line. Those figures use the caller's model.
- vstack-explorer and vstack-worker list `vstack-diagram-drawer` in `spawns:`, so a skill that runs in a subagent starts its own drawers. Such a caller has no `ask`: it fixes each figure's plan itself. In a project with no `diagram-profile:` line, the drawer uses the `default` skin, and the skin question returns to the top-level agent.
- explain and how no longer pause to confirm a figure's plan. Like the other four callers, they fix the type, size, and content themselves.
- The drawer writes no tracked file and starts no agent. It needs the eval tool for `export_svg.py`.
- pr keeps its Mermaid figures. GitHub does not render inline SVG in a PR body.

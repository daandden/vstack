# Figures are a fixed Fan-out of diagram drawers

> Superseded by [ADR 0040](0040-figures-are-mermaid-rendered-by-pele.md): a figure step is not a Fan-out. The caller writes each figure's Mermaid and renders it with Pele, and `vstack-diagram-drawer` is gone. This ADR stays as history.

> The Update to pstack `e73df47` removed ketchup, so it no longer calls `vstack-figures`. The rest of this ADR still stands.

> The skin-selection provisions are superseded by [ADR 0027](0027-diagram-design-ships-one-fixed-catppuccin-style.md): diagram-design has one fixed style, so the caller settles no skin, and a figure brief names no variant. The rest of this ADR still stands.

A skill step that draws figures starts one `vstack-diagram-drawer` agent per figure, all at once. The hidden helper `vstack-figures` holds this procedure and its one Fan-out line. explain, how, grilling-page, improve-codebase-architecture, teach, and ketchup call that helper and do not draw figures themselves. The caller settles every diagram-design question first: the skin and each figure's type, size, and content. It keeps working while the drawers run and waits only at the step that places the figures. Each drawer draws the source, exports the SVG under the caller's Scratch kind, and returns the SVG path. The drawer has no `model` field, so the user picks the drawing model through its own `task.agentModelOverrides` key. We chose this so that the user can run all figures on a model chosen for drawing, and so that figures are drawn in parallel with each other and with the caller's own writing.

## Considered Options

- Use the judge gate that ADR 0004 had then, with its standard inline line. On inline, the caller drew the figures itself, so the drawing model choice applied only to fan-out runs.
- Use that gate and make its inline line one drawer that draws every figure in order. The user wanted figures in parallel every time.
- Give the drawer a fixed `model` in its frontmatter. This was the first vstack agent with its own model, against ADR 0004. The override key already gives the user the switch.
- Copy a figure Fan-out line from FORMS.md into each of the six callers. This gives six copies of one procedure to keep in sync.
- Let only the top-level session start drawers. This keeps every question in the session that has `ask`, but how under explain could not draw its own figures.

## Consequences

- The glossary's Fan-out entry names figure steps.
- When no drawer can start, the caller draws nothing. It says which figures were not drawn and why.
- When a drawer returns a failure for one figure, the caller names that figure and the reason in one line and places the rest. The caller never draws a figure itself.
- vstack-explorer and vstack-worker list `vstack-diagram-drawer` in `spawns:`, so a skill that runs in a subagent starts its own drawers. Such a caller has no `ask`: it fixes each figure's plan itself. In a project with no `diagram-profile:` line, the drawer uses the `default` skin, and the skin question returns to the top-level agent.
- explain and how no longer pause to confirm a figure's plan. Like the other four callers, they fix the type, size, and content themselves.
- The drawer writes no tracked file and starts no agent. It needs the eval tool for `export_svg.py`.
- pr keeps its Mermaid figures. GitHub does not render inline SVG in a PR body.

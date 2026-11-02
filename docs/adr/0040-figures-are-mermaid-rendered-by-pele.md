# Figures are Mermaid rendered by Pele

> This decision supersedes [ADR 0011](0011-diagram-design-ships-as-the-diagram-upstream.md), [ADR 0023](0023-figures-are-a-fixed-fan-out-of-diagram-drawers.md), and [ADR 0027](0027-diagram-design-ships-one-fixed-catppuccin-style.md). It amends [ADR 0004](0004-fan-out-always-uses-subagents.md) and [ADR 0024](0024-shared-judge-text-goes-in-the-jev-state-once.md).

> [ADR 0042](0042-every-grilling-question-declares-its-reader-needs.md) amends how the executing agent chooses visuals for a Grilling page question. It starts from the reader's needs and picks a Visual kind for each, which replaces the separate decision about each Diagram kind. Rendering through Pele is unchanged.

> [ADR 0044](0044-structured-flow-data-drives-server-rendered-pages.md) changes publication to captured typed Flow attachments. The caller keeps Mermaid/Pele rendering and all type guidance. The helper opens no Stage, and the owning producer captures SVG bytes with the embedded style for its Document, question, Background, or preview. Historical measurements and the superseded page format below remain historical.

> [ADR 0050](0050-the-flow-reader-draws-diagrams-from-mermaid-source-with-pele.md) amends Flow publication again. The owning producer captures the Mermaid source, and the Flow reader draws it with the pinned Pele in Catppuccin Latte on light and Mocha on dark. The render script below keeps making Mocha SVGs for figures outside the Flow.

A skill that shows a figure writes the figure as Mermaid in its own context and runs `plugin/skills/vstack-figures/scripts/render.ts` with Bun. The script renders the Mermaid with the `pele` package, pinned exactly in the root `package.json`, and passes the IosevkaTerm Nerd Font Mono stack to `render()` as `fontFamily`. It inserts one `<style>` into the SVG that sets every `--pele-*` variable to Catppuccin Mocha and marks each focal Mermaid id in mauve. Bad Mermaid exits 1 with Pele's parse error and writes no file. The caller fixes the Mermaid and runs the script again. If it still fails, the caller places no figure and says which figure and why, with no hand-built stand-in. The script needs no browser and no Python. The plugin is linked from the clone, so the script loads `pele` from the clone's `node_modules`, and the install steps run `bun install --frozen-lockfile` before the link.

`diagram-design`, the `vstack-diagram-drawer` agent, and the Diagram upstream go away. The `diagram` Pin leaves `pins.yaml`, and its three register rows leave the register entirely, not as reject. `vstack-maintain prepare` gains an `upstreams` entry that drops a whole Upstream for this.

A figure step is not a Fan-out. A render takes milliseconds and no model, so one figure no longer needs one agent. This is a narrow exception to ADR 0004: ADR 0004 still governs every other step with two or more parts. A step that draws several figures renders them one after another in the caller's own context. `vstack-figures` keeps the styling rules from the comparison and has no Fan-out line, spawn line, or Figure brief.

The agent executing each skill step, including a subagent in its own session, decides separately whether each Diagram kind helps: a Context diagram or an Option diagram. It chooses each Mermaid type itself, without a model judge. `vstack-figures/references/mermaid-types.md` covers all 32 visualization families in pinned Pele 1.12.0, which targets Mermaid 12.1.0 built-ins, with all five C4 views, four railroad notations, aliases, and minimal rendered examples. `info` is a utility, not a figure. The size limits remain: avoid `architecture-beta` above about 10 services, and keep an ER figure under about 15 entities. The Grilling page visual judge, its rubric, and its calibration checker and cases are removed. This amends the visual-judge provisions of ADR 0024 and ADR 0036. Their Addon judge provisions and historical measurements remain.

`pr` keeps its Mermaid as text in the PR body, with no Pele render. GitHub renders Mermaid in a PR body and does not render inline SVG.

We chose this trade from a comparison of 26 figures that both ways drew from the same fictional bookshop briefs, scored by eye from 1 to 5 for clarity, crossings, and label fit:

| | diagram-design | Pele |
|---|---|---|
| 21 standard figures (10 to 24 nodes), score out of 315 | 279 | 261 |
| 5 extreme figures (28 to 40 nodes), score out of 75 | 66 | 45 |
| Model cost for 26 figures | $24.05 | $0 for rendering only |
| Time per figure | 1m27s to 39m33s of agent time | 1.3 to 37.7 ms per render |

diagram-design drew more readable architecture, ER, state, and Wardley figures. Pele won on compact and data-driven figures such as timelines, trees, Sankey diagrams, and sequences. The Pele cost column leaves out writing the Mermaid, which the main session did and did not measure apart. We accept a small loss in layout quality, mostly on large graphs, for figures that render in milliseconds and cost no drawer run.

## Considered Options

- **Keep diagram-design and its drawers** (ADRs 0011, 0023, 0027): rejected. Better layouts on large graphs, but each figure costs a model run of minutes, and the skill is 279 files of Upstream text to merge at each Update.
- **Keep one drawer per figure that writes the Mermaid and renders it**: rejected. The render is free, so the agent's only work is writing Mermaid, which the caller already has the context for. The drawer would add latency and model cost for no layout gain.
- **Render `pr`'s Mermaid with Pele too**: rejected. GitHub renders Mermaid in a PR body, and an inline SVG does not render there.
- **Carry diagram-design's semantic patterns over as Mermaid recipes**: rejected for now. The comparison did not test them, and the styling rules cover the failures it found.
- **Keep the Diagram upstream rows as reject**: rejected. A reject row named `diagram/diagram-design` would keep a dead Pin to update and keep the old name in shipped bookkeeping.

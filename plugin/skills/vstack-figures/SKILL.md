---
name: vstack-figures
description: How a vstack skill draws a figure. The caller writes Mermaid, follows the styling rules, and submits the source to the Flow, whose reader draws it with Pele in Catppuccin Latte or Mocha.
disable-model-invocation: true
---

# vstack-figures

A caller is a skill step that shows figures to a person. The caller writes each figure's Mermaid in its own context. The Flow reader draws it with the pinned Pele in the reader's theme, so a figure step starts no subagent (ADR 0040, ADR 0047).

This is a rendering helper, not a result-producing run. It opens no Stage. The caller follows `skill://flow-page`'s "Stage entry/exit line" and owns publication.

## Draw one figure

1. Choose the Mermaid type from the [Mermaid type reference](references/mermaid-types.md). Read it when choosing a type or writing its syntax.
2. Write the Mermaid to `<slug>.mmd` in the caller's Scratch entry. The slug is a basename that is unique on the page. Follow every rule in [Make Pele figures look good](#make-pele-figures-look-good).
3. Capture the source through a typed `attachment` with `type: "mermaid"`, its actual `path`, a meaningful `caption`, and provenance in `origin`. Add `focus` with the one or two focal Mermaid ids, as [Mark one or two focal elements](#mark-one-or-two-focal-elements) says. The capture refuses Mermaid that Pele cannot render and prints Pele's parse error. The Flow commits nothing then.
4. If the capture is refused, fix the Mermaid and submit again. If it still fails, place no figure, and say in one line which figure was not drawn and why. Never show a hand-built figure, a Mermaid code block, or a generated image in its place.

## Place the figure

Place figures in the order the caller drew them. Put each attachment's reference in a Document `figure` block, a question or Background `figures` list, or an option `preview`, as flow-page's captured-attachment contract says. A question figure or preview also declares its Visual `kind` and satisfies a declared reader need. Write sources in the caller's Scratch entry, not the Flow's managed assets.

A figure outside the Flow, such as an offline lesson export, is an SVG file. Render it with the script, with one `--focus` per focal Mermaid id:

```sh
bun "$(realpath skill://vstack-figures/scripts/render.ts)" <slug>.mmd <out dir>/<slug>.svg --focus <id>
```

`bun` never sees `skill://` paths, so `realpath` turns the URL into the file path. Pass `-` in place of the source path to read the Mermaid from stdin. Exit 0 writes a Catppuccin Mocha SVG and prints its absolute path. Exit 1 prints Pele's parse error and writes nothing. Exit 2 is a usage error. The export may inline that exact SVG with its `<style>`. That does not permit raw markup authoring in the Flow page. On render failure, publish no stale output. A Document can record an unavailable figure and its reason. An unavailable attachment never satisfies a question's visual need.

## Supported Mermaid types

The [Mermaid type reference](references/mermaid-types.md) covers all 32 visualization families rendered by pinned Pele 1.12.0, which targets Mermaid 12.1.0 built-ins. It gives when-to-use lines and minimal examples, including all five C4 views and four railroad notations. Aliases are separate spellings of existing families. `info` is a utility, not a figure.

## Make Pele figures look good

Each rule comes from a comparison of 26 figures that Pele and the earlier drawer drew from the same briefs (issue #260).

### Keep the Catppuccin theme

The reader sets every `--pele-*` variable to Catppuccin Latte in its light theme and Catppuccin Mocha in its dark theme, and a theme switch restyles the figure in place. The render script sets them to Mocha in a `<style>` inside an exported SVG. With Pele's defaults, a figure renders on white. Both measure each label in the figure font, `'IosevkaTerm Nerd Font Mono', ui-monospace, monospace`, so each node fits its label. Write no `classDef` or `style` line: each one fixes a color that the theme can no longer change.

### Mark one or two focal elements

Pele gives each node, edge, and series a `data-id` from its Mermaid id. Each id in an attachment's `focus`, or each `--focus <id>` of an export, gets the theme's mauve stroke and text for that id in this figure only. Timeline events, ishikawa causes, and single xychart bars have no `data-id`, so in those types the focal element stays plain. Name it in the text beside the figure instead.

### Keep a figure inside its width

A page scales a wide figure down to fit, and its text shrinks with it. A 2880px ER figure rendered at about 5px text.

- Set the direction so the long side runs down the page. A 12-state `stateDiagram-v2` with `direction LR` rendered 2420 by 246.
- Group states with composite states (`state "Payment" as Payment { ... }`) and flowchart steps with `subgraph`. Groups gave the best Pele layouts in the comparison.
- Keep an ER figure under about 15 entities. Split a larger schema by zone into two figures.
- Keep labels short. Pele wraps a long label inside its node, and the node grows.

### Draw more than about 10 services as a flowchart

`architecture-beta` overlaps its groups and routes edges through other groups. It scored 6 of 15 at 15 services and 5 of 15 at 33 services. Draw a large architecture as a `flowchart LR` with one `subgraph` per zone. This rule comes from those scores only, and the comparison did not test the flowchart alternative.

### Escape what Mermaid parses

- Write `#` in sequence messages as `#35;`. A bare `#` cuts a message's text.
- Quote a mindmap label that has parentheses: `ab["Audiobook, new in 2026"]`. A bare `(new 2026)` becomes a node shape and loses its text.
- Never use `Note` as a participant id. It is a keyword, and the diagram fails to parse.
- In sequence diagrams, `-)` draws a solid line with an open head. Use `--)` for a dashed async message.

### Put what Mermaid cannot say in the text

Mermaid has no reference lines or annotations in `xychart`, no value labels on bars, no blocked state in `kanban`, and no label for a set's own region in `venn-beta`. When a figure needs one of these, write it in the caption or the text beside the figure.

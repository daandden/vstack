---
name: vstack-figures
description: How a vstack skill draws a figure. The caller writes Mermaid, follows the styling rules, and renders it with Pele to a Catppuccin Mocha SVG.
disable-model-invocation: true
---

# vstack-figures

A caller is a skill step that shows figures to a person. The caller writes each figure's Mermaid in its own context and runs the render script itself. A render takes milliseconds, so a figure step starts no subagent (ADR 0040).

This is a rendering helper, not a result-producing run. It opens no Stage. The caller follows `skill://flow-page`'s "Stage entry/exit line" and owns publication.

## Draw one figure

1. Choose the Mermaid type from the [Mermaid type reference](references/mermaid-types.md). Read it when choosing a type or writing its syntax.
2. Write the Mermaid to `<slug>.mmd` in the caller's Scratch entry. The slug is a basename that is unique on the page. Follow every rule in [Make Pele figures look good](#make-pele-figures-look-good).
3. Render it, with one `--focus` per focal Mermaid id, one or two in all:

   ```sh
   bun "$(realpath skill://vstack-figures/scripts/render.ts)" <slug>.mmd <out dir>/<slug>.svg --focus <id>
   ```

   `bun` never sees `skill://` paths, so `realpath` turns the URL into the file path. Pass `-` to read Mermaid from stdin. Exit 0 writes the SVG and prints its absolute path. Exit 1 refuses invalid Mermaid or semantic coloring and writes nothing. Exit 2 reports usage, malformed bindings, or unreadable input. Failures preserve an existing output without making it current.
4. If the render fails, fix the Mermaid and run the script again. If it still fails, place no figure, and say in one line which figure was not drawn and why. Never show a hand-built figure, a Mermaid code block, or a generated image in its place.

## Place the figure

Place figures in the order the caller drew them. Capture each successful SVG through a typed `attachment` with `type: "svg"`, its actual `path`, a meaningful `caption`, and provenance in `origin`. Put its reference in a Document `figure` block, a question or Background `figures` list, or an option `preview`, as flow-page's captured-attachment contract says. A question figure or preview also declares its Visual `kind` and satisfies a declared reader need. Keep the embedded `<style>` in the captured bytes. Write sources and exports in the caller's Scratch entry, not the Flow's managed assets.

An offline lesson export may inline the exact SVG with its `<style>`. That does not permit raw markup authoring in the Flow page. On render failure, publish no stale output. A Document can record an unavailable figure and its reason. An unavailable attachment never satisfies a question's visual need.

## Supported Mermaid types

The [Mermaid type reference](references/mermaid-types.md) covers all 32 visualization families rendered by pinned Pele 1.12.0, which targets Mermaid 12.1.0 built-ins. It gives when-to-use lines and minimal examples, including all five C4 views and four railroad notations. Aliases are separate spellings of existing families. `info` is a utility, not a figure.

## Make Pele figures look good

Each rule comes from a comparison of 26 figures that Pele and the earlier drawer drew from the same briefs (issue #260).

### Keep the Catppuccin Mocha theme

The render script sets every `--pele-*` variable to Catppuccin Mocha in a `<style>` inside the SVG. With Pele's defaults, a figure renders on white. The script also passes the theme's font, `'IosevkaTerm Nerd Font Mono', ui-monospace, monospace`, to `render()` as `fontFamily`, because Pele measures each label in that font to size its node. The Mermaid sets no color itself. It names a Color role, as [Color elements by role](#color-elements-by-role) says.

### Mark one or two focal elements

Pele exposes supported focal identities through case-sensitive `data-id` values. Each `--focus <id>` paints that target's border and text Mauve `#cba6f7`, while keeping its fill. The renderer colors owned marks, not unrelated descendants of a group. Inline figures sharing ids remain isolated. Timeline events, ishikawa causes, and single xychart bars have no usable focal id. Name their focal point in the accompanying text.

### Color elements by role

Each Color role has one fixed Catppuccin Mocha accent. The renderer uses a solid accent fill and border, with Base text. Neutral backing is Surface0, ordinary labels are Text, and the background is Base. Every authored paint is a literal official Mocha value. Opacity and antialiasing may blend displayed pixels.

| Role | Color | Mark an element that |
|---|---|---|
| `ok` | Green `#a6e3a1` | succeeds, is done, is accepted, or is added |
| `warn` | Yellow `#f9e2af` | is a risk, waits, or needs a decision |
| `bad` | Red `#f38ba8` | fails, is refused, is rejected, or is removed |
| `changed` | Blue `#89b4fa` | is modified by the change the figure explains |
| `actor` | Pink `#f5c2e7` | is a person: the user, a developer, a reviewer |
| `store` | Teal `#94e2d5` | holds data at rest: a file, a state record, a database, a cache |
| `external` | Peach `#fab387` | is a system outside the one the figure explains |

- Mark every element that a role fits, so the same element has the same color in every figure. Leave an element plain when no role fits.
- Give an element one explicit role. An explicit state such as `bad` overrides an intrinsic store kind. Two different explicit roles are refused, even when one comes from bindings and one from Mermaid. Identical repeats are accepted.
- Mark a flowchart node with `:::role` (`Pay[Take payment]:::ok`) or a `class` line (`class Pay,Ship ok`). A `class` line also marks a subgraph or a composite state. State, requirement, and `block-beta` diagrams take a `class` line, ER diagrams `ENTITY:::role`, and class diagrams `class Name:::role`. A mindmap node takes `:::role` on the line under it, and only a node with a shape, such as `a[Label]`, shows the color.
- Flowchart `person` shapes establish `actor`, and cylinder or database shapes establish `store`. Labels such as "failed" or "database" establish no role. Other families retain their existing authored role support while their intrinsic mappings are added separately.
- Mauve is focus-only. Focus replaces the border and text, not the underlying role or category fill.
- Write no `classDef`, `style`, or `linkStyle` line, and no color in a sequence `rect` or `box`. Each sets a color outside the roles. The script refuses it, and an unknown role, with exit 1.

### Bind source identities

The existing command also accepts `--bindings <bindings.json>`. Read [Binding identities and limits](references/mermaid-types.md#binding-identities-and-limits) before choosing a target. A document contains an `elements` array. Each entry has a source `id` and exactly one `role` or nonempty `category` key:

```json
{"elements":[{"id":"Cache","role":"bad"},{"id":"Orders","category":"orders"}]}
```

Callers supply meaning, not CSS selectors or paints. An explicit role wins a category. Otherwise, an explicit category wins an intrinsic kind, then a genuine source category, then neutral paint. Different explicit category keys on one target are refused even when a role would mask them. Identical assignments may repeat.

A category key is an exact identity string. Its color depends on the key alone, not declaration order, other categories, or process. The pool contains all 13 non-Mauve Mocha accents. Colors may repeat, so labels remain authoritative. A green category does not assert success. Use the same key for the same concept across figures.

Missing, ambiguous, or unsupported explicit targets are semantic refusals. Fix the binding or omit it and keep unclassified elements neutral. A semantic source target can own several SVG marks. DOM mark count does not determine identity.

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

# Figure colors are fixed Color roles

> This decision amends [ADR 0040](0040-figures-are-mermaid-rendered-by-pele.md).

> The palette and mapping policy below is confirmed by the grill. Flowchart bindings, literal role fills, and neutral packet and railroad limits are integrated. Family-specific bindings for the remaining types are pending.

Every authored paint color comes directly from the [Catppuccin Mocha palette](https://raw.githubusercontent.com/catppuccin/palette/main/palette.json). The renderer adds no mixed, lightened, or darkened colors. Neutral node backing uses Surface0, the background uses Base, and ordinary text uses Text. Text on a solid accent uses Base.

Seven Color roles keep fixed meanings and accents across diagram types: `ok` uses Green, `warn` Yellow, `bad` Red, `changed` Blue, `actor` Pink, `store` Teal, and `external` Peach. These follow the [Catppuccin style guide](https://github.com/catppuccin/catppuccin/blob/main/docs/style-guide.md). Mauve is reserved for explicit focus, whose border and text take precedence.

Categorical series use the other 13 Mocha accents, including accents also used by semantic roles. Their colors identify category keys, not status or declaration order. The same key keeps its color across types. Labels distinguish categories when colors repeat. This is an explicit exception to giving every hue one semantic meaning: Green in a chart does not itself mean success.

Integration combines source kinds with optional explicit role and category mapping from the caller. Flowcharts accept `--bindings <json>` with an `elements` array of source ids and one role or category per entry. A person or stored-data shape establishes its kind. Unclassified elements stay neutral. The renderer does not infer roles from words in labels. The type reference records supported identities and refusals as family mappings are integrated.

The renderer continues to refuse unknown authored roles, two different authored roles on one element, and colors authored through `classDef`, `style`, `linkStyle`, or sequence `rect` or `box`. Color ownership stays in the renderer. Repeating the same role is harmless.

## Considered Options

- **Let the Mermaid pick any Mocha accent by name** (`:::green`): rejected. Each figure would choose its own meaning for green, so the same color could mean success in one figure and a store in the next.
- **Allow `classDef` with Mocha hex values**: rejected. Pele writes the color into the element's `style` attribute. It overrides the theme, and nothing ties a hex value to a meaning.
- **Reserve the role accents and use only six accents for categories**: rejected. The user chose 13 category accents to give charts more choices, while keeping category identity stable and Mauve reserved for focus.

## Consequences

- Category colors encode identity rather than role. The caption or label carries any status that the color alone cannot establish.
- Types without arbitrary Mermaid role classes can use intrinsic kinds and caller mapping where their source identities permit it. A missing or ambiguous identity is a support limit, not permission to guess.
- This decision replaces the earlier 20% custom tint fills with literal Mocha paint colors. Existing transparency can still blend palette paints when displayed; it does not introduce a new authored paint token.
- Category keys select one of 13 accents deterministically through FNV-1a over their exact UTF-8 bytes. Selection does not depend on declaration order, the set of keys, or render process.

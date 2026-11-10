# Flow figures get their Color roles from the shared role pass

> This decision amends [ADR 0045](0045-figure-colors-are-fixed-color-roles.md) and [ADR 0050](0050-the-flow-reader-draws-diagrams-from-mermaid-source-with-pele.md).

The user chose this design in the `flow-figure-color-roles-6c6c55` Flow on 2026-11-09, after outside research on Mermaid renderers, themes, and docs tools. The Flow reader drew captured Mermaid without any role pass, so 19 of 28 role-marked figures in this project's Flows showed every node neutral. Only `vstack-figures/scripts/render.ts`, the export, applied Color roles.

The Flow reader and the export now call one role pass. The reader asks Pele to parse and draw the source, runs that pass, and maps its palette paints to the reader's Latte or Mocha theme as before. Flow figures therefore show the same Color roles and intrinsic person and store kinds as exports. Flow attachments take no bindings; bindings stay an export option. A stored figure that the pass refuses still draws, without role paints.

A role fill is its accent tinted to about 22% over the background, with a solid accent border and the ordinary label color, in Latte, Mocha, and exports. ADR 0045's solid fills read well in Mocha but give Base text only 2.3:1 to 4.8:1 on Latte accents, and no single text color reaches 4.5:1 on all of them. The tint keeps labels at 4.86:1 or better in both themes. A few Latte borders fall below 3:1, such as Yellow at 2.31:1, and the fill and label carry the meaning there.

Focus is a 2.5px Mauve border on every focal node and never recolors the label. Mauve text on a solid role fill read at 1.04:1 to 1.6:1.

The reader draws flowcharts with step edges and outlines edge and cluster labels, as the export does. This redraws existing Flow flowcharts with new edge routes.

The reader draws a Document code block whose language is `mermaid` through the same pipeline and keeps its text in a Source disclosure. Submit checks such a block with Pele's parser only, because the block is text meant for GitHub and may carry its author's paint lines.

Submit runs the export's full check on `mermaid` attachments: unknown roles, two roles on one element, paint `classDef`, `style`, or `linkStyle` lines, and focus ids with no visible mark. All 32 stored Mermaid figures in this project passed that check when the decision was made.

## Considered Options

- **Reader CSS for role classes**: rejected. Pele copies `:::ok` onto the node group, so CSS can find it. But only class-marked nodes would get colors, intrinsic kinds and charts would differ from exports, and Pele's automatic label contrast applies only to fills written in the source.
- **Render at capture and store the SVG**: rejected. It reverses ADR 0050's page-font measurement, and figures captured before the change would stay neutral.
- **Solid fills in the light theme**: rejected for the text contrast above. Solid in Mocha with tints in Latte was also rejected in favor of one fill rule.
- **Keep the reader's curved edges and boxed labels**: rejected so that a figure looks the same on the page and in an export. Mermaid's own default curve is `basis`, and both Mermaid and Pele box edge labels, so this is a vstack choice, not Mermaid practice.
- **Full check on Document code blocks too**: rejected. It would refuse spec drafts whose Mermaid carries GitHub styling.

## Consequences

- The reader bundle ships the role pass. With Bun 1.4.4, it measures 20,781 bytes minified and 7,645 bytes gzipped. Reproduce both byte counts from the repository root:

	```sh
	bun build plugin/skills/vstack-figures/scripts/palette.ts --minify --target browser --external pele | wc -c
	bun build plugin/skills/vstack-figures/scripts/palette.ts --minify --target browser --external pele | gzip -9c | wc -c
	```

- The reader depends on a module that vstack-figures also uses, so a role rule changes the page and exports together.
- ADR 0045's "Focus replaces the border and text" and its solid accent fills no longer hold. Its Color role accents and category rules stay.
- vstack-figures' statement that the role rules apply to SVG exports only changes with this decision.

# The Flow reader draws diagrams from Mermaid source with Pele

> This decision amends [ADR 0040](0040-figures-are-mermaid-rendered-by-pele.md) and [ADR 0044](0044-structured-flow-data-drives-server-rendered-pages.md) for diagrams. It reverses the Mocha-only figure palette that [ADR 0027](0027-diagram-design-ships-one-fixed-catppuccin-style.md) recorded and ADR 0040 kept.

The user chose this design in Flow questions 26 to 28 of spec #309 on 2026-11-01, after the #315 review found the prototype-review diagram unreadable in the light theme (question 25). The user knowingly accepts that a drawn diagram's layout can change with the pinned Pele version.

An author captures a diagram as its Mermaid source: an attachment with `type: "mermaid"`, an optional `focus` of one or two Mermaid ids, and the usual `caption` and `origin`. The script stores the source bytes under their sha256 like any attachment. It refuses source that is not UTF-8 or that the pinned Pele cannot render, with Pele's parse error, and commits nothing. A question figure, Background figure, option preview, or Document figure may name a `mermaid` attachment, so it meets the Context diagram, Option diagram, Data chart, and Scenario walkthrough reader needs. This is an attachment type, not a Result kind. Captured `svg` attachments stay supported for existing Flows and for figures that Pele did not draw.

The reader draws each `mermaid` attachment in the browser with the Pele version pinned in the root `package.json`. It imports `pele/lazy`, so the shipped reader loads only the code for the diagram types on the page. A page of flowcharts loaded 19 reader scripts, 413 KB raw and 153 KB gzipped, against 218 KB raw for the reader alone. The reader turns Pele's links and images off. It parses the output, keeps only SVG drawing elements and attributes, and drops every script, handler, link, style, image, `foreignObject`, and URL that leaves the document. The drawing sits in a shadow root whose host has role `img` and the caption as its name. The host page's Content Security Policy now allows only the reader's own scripts and its inline bootstrap scripts by hash, and loads images, media, fonts, and data from the host origin only. Flow content cannot run a script or fetch from elsewhere.

Pele's theme colors come from the `--pele-*` variables, which `reader.css` maps to Catppuccin Latte on light and Mocha on dark. At display time, the reader maps explicit Catppuccin Mocha palette paints from the standard diagram styling to the matching variables too. Other authored colors stay as authored. The reader normalizes drawing attributes and inline paint declarations, not label text, ids, or captured bytes. A theme switch restyles the drawn nodes in place without drawing again. Focus marks use the theme's mauve.

A captured Pele SVG from an earlier Flow keeps its stored bytes and sha256. At read time the reader parses those bytes, drops the embedded `<style>` that fixed the Mocha palette, keeps its focus ids, and normalizes explicit palette paints by the same display-time policy. The historical figure shows Latte in the light theme without changing its captured layout or nonpalette paints. An SVG without Pele's root class stays in a sandboxed `<img>`.

Rendering in the page also fixes a WebKit defect. WebKit does not use a user-installed font inside an SVG shown through `<img>`. A probe line set only in IosevkaTerm Nerd Font Mono drew in a serif face there, and the figure stack fell back to `ui-monospace`, about 44% wider, so labels overflowed their nodes. The same bytes inline in the page used the installed font. WebKit's canvas showed a second fault: with a fallback after the first family, it measured in the fallback even though the page drew in IosevkaTerm. The reader therefore measures each label with hidden page text in the figure font. After that change, one source drew to the same 600 by 600 layout in Chromium 150, WebKit (Safari 27), and Firefox 160 on the test machine, with every label inside its node.

`plugin/skills/vstack-figures/scripts/render.ts` stays for figures outside the Flow, such as teach's offline lessons. It still writes a Catppuccin Mocha SVG with its embedded style.

## Implementation and proof status

The #316 candidate proof uses the real CLI, production Bun host, installed reader, and Chromium. It checks captured source/SVG hashes, Latte/Mocha paints, preserved nonpalette colors, and the same drawn nodes across theme changes. The user's first-publication review found the wide comparison unreadable on a phone. The reader now retains intrinsic label size in a locally scrollable, keyboard-focusable figure; it removes Pele's display-time `max-width` constraint without changing captured bytes or source semantics. Focused browser regression covers both Mermaid and historical Pele SVGs, both themes, panning, focus, and contained page overflow. The user accepted the repaired mobile comparison in both themes and separately reclassified the current over-wide control as wide-but-legible. The old failed mobile captures, historical negative judgment, and repaired-reader views remain separate. Fresh final-input authoring trials and their new user judgments are recorded in the evaluation's `judging.json`; none of these later views changes an earlier first-publication score.

Use the Verify recipe's `flow-diagram-reading` and `flow-t4` procedures to repeat these checks, and the authoring evaluation's `PROCEDURE.md` to freeze and review first publications. A general readability fix can change an over-wide judging control; record that later rendering separately rather than carry an obsolete tiny-label verdict forward. This candidate run does not repeat the earlier WebKit and Firefox probes above or certify the final integrated commit.

## Diagram text matches the page text

The user chose this in the `flow-diagram-fit-width-d865de` interview on 2026-11-06. The reader passes Pele a `fontSize` equal to the page's computed body font size, 13px at the default size, instead of leaving Pele at its 16px default. Pele keeps its own ratio for smaller text, so sequence message labels draw at about 11px. A diagram still keeps the size it is drawn at and scrolls when it is wider than the column. The Flow page column grows from 54rem to 64rem. [ADR 0057](0057-figure-captions-are-short-titles-with-source-behind-a-disclosure.md) records the caption and background box that sit around the diagram.

The user again rejected scaling every diagram down to the column width. In the typst Flow, a 1747px sequence diagram would draw its labels at about 6.7px in an 840px column, and a 2592px flowchart at about 5px. The user also rejected a middle option that shrinks a diagram to at most 85% before it scrolls. Captured Pele SVGs from earlier Flows keep the layout and font size they were captured with.

## Cost

- The captured bytes are the source, not the figure. The figure a reader sees depends on the pinned Pele, the reader's fonts, and the browser. A Pele upgrade redraws every source-based figure, and a font change can rewrap labels. Spec #309's frozen first-publication evidence keeps its captured bytes, but a diagram's screenshot is evidence of one reader revision in one browser, not of the bytes alone.
- The reader ships about 717 KB of raw Pele code across lazy chunks. A page loads and runs the chunks for the diagram types it shows.
- Flow-supplied drawing now runs in the reader's origin. Safety rests on Pele's own escaping, the reader's element and attribute allowlist, the shadow root, and the stricter page policy, not on the `<img>` sandbox.
- A historical figure keeps the layout Pele measured when it was captured. Its drawing changes only in color.

## Considered Options

- **Keep publish-time capture and embed a Latte palette in each SVG, selected by a URL fragment.** The investigation for spec #309 recommended this. It keeps rendered bytes frozen and the `<img>` sandbox. The user chose drawing in the reader instead. This option also leaves the WebKit font fallback in place and cannot re-theme historical figures without a separate backdrop rule.
- **Render the source on the host at read time.** The host's Bun output is deterministic, but Bun has no page fonts, so WebKit labels would still overflow inside `<img>`. A theme change needs no re-render, so it gains nothing over drawing in the browser.
- **Give historical Mocha SVGs a Mocha backdrop on light pages.** Legible, but the figure would not follow the theme, and the user asked for the Latte palette.
- **Keep figures in `<img>` and embed the font in each SVG.** ADR 0027 rejected embedded fonts for size, and the figure would still not follow the theme.

## Consequences

- ADR 0044's "Captured Pele SVGs supply diagrams" now reads: captured Mermaid source supplies new diagrams, and captured Pele SVGs remain valid diagrams for existing Flows.
- ADR 0040's render script no longer produces Flow figures. The caller still writes the Mermaid in its own context, follows the styling rules, and starts no subagent.
- vstack-figures, flow-page's attachment and reader-needs references, explain, how, teach, and improve-codebase-architecture tell authors to capture Mermaid source. The flow-page evaluation controls capture their sources the same way. Captures recorded before this change stay as recorded.

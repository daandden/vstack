# Figure render

vstack-figures has callers write Mermaid. Flow authoring captures the Mermaid source, and the reader draws it with the pinned Pele inside the page, in Catppuccin Latte on light and Mocha on dark, with theme-mauve focal marks. For exports outside the Flow, the render script writes a Catppuccin Mocha SVG with its embedded theme and scoped mauve focal rules. A captured Pele SVG from an earlier Flow keeps its bytes and shows in the reader's theme (ADR 0047).

## Sub-features

- `figure-render`: `render.ts <source.mmd | -> <out.svg> [--focus <id>]...` writes the SVG, prints its absolute path, and exits 0.
- `figure-focus`: focal shape and text rules target the case-sensitive Mermaid `data-id` under a `pele-f<8 hex>` root class, without marking other figures.
- `figure-refuse`: bad Mermaid exits 1 with the parse error and creates no output. Usage errors exit 2. An older existing output is not deleted or made fresh by failure. A `mermaid` attachment with bad Mermaid is refused with Pele's parse error and commits nothing.
- `figure-page`: a `mermaid` attachment keeps its source bytes by SHA-256. The reader draws it in the page in a shadow root named by its caption, with labels inside their nodes in Chromium, WebKit, and Firefox, and re-themes it in place on a theme switch. It runs no script, loads nothing from another origin, and shows markup in labels as text. A historical Pele SVG shows the Latte palette in light mode while its stored SHA-256 stays the same. Any other SVG loads through an image element.

## How to get to it (user POV)

- A result-producing caller such as explain, how, architecture improvement, or teach writes Mermaid and captures it as a `mermaid` attachment. teach also runs vstack-figures' render script for its offline lesson.
- The caller owns the Flow Stage and captures the source. The rendering helper opens no empty Stage.

## Driving it with bash and the omp browser

Preconditions:

- Follow the baseline in `README.md` and run Doctor.
- Pele 1.12.0 from the checkout's pinned dependencies must resolve. Report a missing dependency and obtain approval before provisioning in a restricted run.
- Set `R="$VERIFY_RUN_DIR/figure-render"`, `H="$VERIFY_RUN_DIR/data/figure-home"`, `RENDER="$CHECKOUT/plugin/skills/vstack-figures/scripts/render.ts"`, and `PAGE="$CHECKOUT/plugin/skills/flow-page/scripts/flow-page.ts"`.
- Use the checkout's scripts, pinned Bun, explicit `--home "$H" --session figure-proof`, and the checkout as cwd. Keep persistent proof outside `data/` and capture generated media from the isolated project's Scratch dir.

1. Open a proof Flow with `open --skill grill-with-docs --title "Verify figure"` and save its receipt. From the same checkout cwd, run `bun "$CHECKOUT/plugin/skills/vstack-tmp/scripts/path.ts" --home "$H"` to obtain the isolated project's Scratch directory. The receipt supplies `live.url`, not a `page` path. Write an order-flow `.mmd` in a fresh proof-assets directory under that Scratch directory. It shows Cart, Stock, Wait, and Split, with a stock branch and short labels.
2. Run `bun "$RENDER" <order.mmd> <order.svg> --focus Stock`. Capture command, stdout, stderr, and exit code. Expect exit 0, empty stderr, and the SVG's absolute path.
3. Read the SVG bytes. Its root has `pele pele-flowchart pele-f<8 hex>` classes and its first child is a style. Inspect every `--pele-*` theme variable, the IosevkaTerm Nerd Font Mono family, disabled text ligatures, eight series colors, and scoped shape/text focus selectors for `Stock`. Preserve these bytes and their SHA-256.
4. Render a malformed source into a distinct nonexistent `bad.svg`. Expect exit 1, a Pele parse error, and no new output. Capture exact directory listings before and after. Run with the output argument missing and expect usage exit 2. Do not publish an earlier SVG after a failed render.
5. Submit this contribution, substituting the actual paths. `order.svg` stands in for a historical capture:

   ```json
   {"version":1,"items":[{"kind":"attachment","ref":"order","type":"mermaid","caption":"Stock check with wait and split shipment paths","origin":"Mermaid source of the order-flow proof","path":"<absolute order.mmd>","focus":["Stock"]},{"kind":"attachment","ref":"old","type":"svg","caption":"The same flow as a captured Pele SVG","origin":"render.ts output of the order-flow proof source","path":"<absolute order.svg>"},{"kind":"round","questions":[{"ref":"choose","title":"Where does a split order wait?","description":"Choose the shipping policy.","needs":[{"need":"Follow the stock check and the split-shipment path.","kind":"context-diagram"}],"figures":[{"attachment":"order","kind":"context-diagram"},{"attachment":"old","kind":"context-diagram"}],"options":[{"label":"Wait","does":"Hold the order.","gains":["One shipment"],"costs":["Slower"]},{"label":"Split","does":"Ship what is in stock.","gains":["Faster"],"costs":["Two shipments"]}]}]}]}
   ```

   Submit the malformed source as another `mermaid` attachment and expect exit 1 with Pele's parse error and an unchanged `show`.
6. Read `show`. The question retains its exact needs and figure kinds. Fetch both registered assets and compare the source's SHA-256 to `order.mmd` and the SVG's to step 3. Edit both source files and read the page again. The captured bytes remain unchanged.
7. Open the live URL in Chromium and in WebKit (a Tern browser block), and in Firefox when available. Select the question using its receipt id and wait until each `.diagram` has `data-render="drawn"`. Each has role `img` named by its caption. In its shadow root every node label lies inside its shape, and Stock is mauve. Pick Light, Dark, then Light with the theme control: the same drawn nodes switch between Latte and Mocha fills without a redraw, and the historical SVG follows the theme too. Capture ARIA and full-resolution lossless WebP at 1280 and 360px. Page-level overflow is zero.
8. Publish a `mermaid` attachment whose labels hold `<script>`, `<img onerror>`, `foreignObject`, and `javascript:` text with a `click` link. The drawn figure contains no `script`, `img`, `foreignObject`, `a`, event handler, or outside URL, no dialog opens, and no request leaves the host origin. The labels show as text.
9. Refuse a question whose need has no matching figure, a figure without a declared need, and a question that relies only on a Background figure. Compare authored-state and page hashes before and after. Stop only this proof's host and preserve the export before scoped Verify cleanup.

## Gotchas

- Run the checkout script, not the copy loaded by the current omp session.
- A missing Pele import is a dependency failure, not a Mermaid parse error.
- Timeline events, ishikawa causes, and individual xychart bars have no usable focal `data-id`. Explain their focal point in accompanying text.
- Focus ids are case-sensitive. A selector that matches nothing does not prove a visible accent.
- The reader draws a `mermaid` figure in a shadow root. Inspect it through `.diagram`'s `shadowRoot`. A captured non-Pele SVG still loads through an image element, which isolates its style from the page.
- WebKit uses no user-installed font inside an SVG image document, so a Pele SVG shown through `<img>` overflows its nodes there. The reader therefore draws Pele figures in the page and measures labels with page text, not a canvas.

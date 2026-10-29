# Figure render

vstack-figures renders caller-written Mermaid with Pele under Bun. The Catppuccin Mocha SVG keeps its embedded theme and scoped mauve focal rules. Flow authoring captures those real bytes safely and displays them on a complete question with declared reader needs.

## Sub-features

- `figure-render`: `render.ts <source.mmd | -> <out.svg> [--focus <id>]...` writes the SVG, prints its absolute path, and exits 0.
- `figure-focus`: focal shape and text rules target the case-sensitive Mermaid `data-id` under a `pele-f<8 hex>` root class, without marking other figures.
- `figure-refuse`: bad Mermaid exits 1 with the parse error and creates no output. Usage errors exit 2. An older existing output is not deleted or made fresh by failure.
- `figure-page`: a captured SVG passes the Flow safety check, retains its style byte for byte, and loads through an image element rather than raw markup in the page.

## How to get to it (user POV)

- A result-producing caller such as explain, how, architecture improvement, or teach writes Mermaid and runs vstack-figures' render script.
- The caller owns the Flow Stage and captures its output. The rendering helper opens no empty Stage.

## Driving it with bash and the omp browser

Preconditions:

- Follow the baseline in `README.md` and run Doctor.
- Pele 1.12.0 from the checkout's pinned dependencies must resolve. Report a missing dependency and obtain approval before provisioning in a restricted run.
- Set `R="$VERIFY_RUN_DIR/figure-render"`, `H="$VERIFY_RUN_DIR/data/figure-home"`, `RENDER="$CHECKOUT/plugin/skills/vstack-figures/scripts/render.ts"`, and `PAGE="$CHECKOUT/plugin/skills/flow-page/scripts/flow-page.ts"`.
- Use the checkout's scripts, pinned Bun, explicit `--home "$H" --session figure-proof`, and the checkout as cwd. Keep persistent proof outside `data/` and capture generated media from the isolated project's Scratch dir.

1. Open a proof Flow with `open --skill grill-with-docs --title "Verify figure"`. Save its receipt and derive the project's Scratch path from the returned page path. Write an order-flow `.mmd` in a fresh proof-assets directory there. It shows Cart, Stock, Wait, and Split, with a stock branch and short labels.
2. Run `bun "$RENDER" <order.mmd> <order.svg> --focus Stock`. Capture command, stdout, stderr, and exit code. Expect exit 0, empty stderr, and the SVG's absolute path.
3. Read the SVG bytes. Its root has `pele pele-flowchart pele-f<8 hex>` classes and its first child is a style. Inspect every `--pele-*` theme variable, the IosevkaTerm Nerd Font Mono family, disabled text ligatures, eight series colors, and scoped shape/text focus selectors for `Stock`. Preserve these bytes and their SHA-256.
4. Render a malformed source into a distinct nonexistent `bad.svg`. Expect exit 1, a Pele parse error, and no new output. Capture exact directory listings before and after. Run with the output argument missing and expect usage exit 2. Do not publish an earlier SVG after a failed render.
5. Submit this contribution, substituting the actual SVG path:

   ```json
   {"version":1,"items":[{"kind":"attachment","ref":"order","type":"svg","caption":"Stock check with wait and split shipment paths","origin":"Pele render of the order-flow proof source","path":"<absolute order.svg>"},{"kind":"round","questions":[{"ref":"choose","title":"Where does a split order wait?","description":"Choose the shipping policy.","needs":[{"need":"Follow the stock check and the split-shipment path.","kind":"context-diagram"}],"figures":[{"attachment":"order","kind":"context-diagram"}],"options":[{"label":"Wait","does":"Hold the order.","gains":["One shipment"],"costs":["Slower"]},{"label":"Split","does":"Ship what is in stock.","gains":["Faster"],"costs":["Two shipments"]}]}]}]}
   ```

6. Read `show`. The question retains its exact needs and figure kind. Fetch the registered captured SVG and compare its SHA-256 to step 3. Edit the source file and render the Flow again. The captured bytes remain unchanged.
7. Open the live URL and select the question using its receipt id. The Reader needs list follows the description, the image loads with meaningful alternative text, its background is dark, and Stock is mauve. Capture ARIA and full-resolution lossless WebP at 1280 and 360px. Page-level overflow is zero.
8. Refuse a question whose need has no matching figure, a figure without a declared need, and a question that relies only on a Background figure. Compare authored-state and page hashes before and after. Stop only this proof's host and preserve the export before scoped Verify cleanup.

## Gotchas

- Run the checkout script, not the copy loaded by the current omp session.
- A missing Pele import is a dependency failure, not a Mermaid parse error.
- Timeline events, ishikawa causes, and individual xychart bars have no usable focal `data-id`. Explain their focal point in accompanying text.
- Focus ids are case-sensitive. A selector that matches nothing does not prove a visible accent.
- Flow images isolate the SVG's style from the page. Inspect focal rules in the captured SVG and visible image, not a nonexistent inline `svg` element.

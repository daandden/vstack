# Figure render

vstack-figures renders caller-written Mermaid with Pele under Bun. The Catppuccin Mocha SVG keeps its embedded theme, fixed Color role rules, and scoped mauve focal rules. Bad Mermaid, an unknown Color role, two different Color roles on one element, or a color the Mermaid sets itself exits 1 without writing output. Flow authoring captures those real bytes safely and displays them on a complete question with declared reader needs.

## Sub-features

- `figure-render`: `render.ts <source.mmd | -> <out.svg> [--focus <id>]... [--bindings <bindings.json>]` writes the SVG, prints its absolute path, and exits 0.
- `figure-focus`: focal geometry and text use Mauve while preserving fills. Owned marks keep focus isolated from group descendants and other inline figures sharing ids.
- `figure-roles`: a Mermaid role or supported explicit binding receives its fixed solid Mocha accent and Base text. Flowchart person and stored-data shapes establish intrinsic kinds.
- `figure-bindings`: declared flowchart nodes, subgraphs, and explicit edges support roles or exact category keys. Identical assignments repeat, different assignments conflict, roles beat categories, and explicit meanings beat intrinsic kinds. Packet and all four railroad notations retain neutral rendering and explicitly refuse bindings.
- `figure-refuse`: invalid Mermaid, unknown roles, conflicting roles or categories, unresolved targets, and authored paints exit 1. Malformed bindings, usage, and unreadable inputs exit 2. Every refusal writes nothing and preserves an older output without making it current.
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

1. Open a proof Flow with `open --skill grill-with-docs --title "Verify figure"`. Save its receipt and derive the project's Scratch path from the returned page path. Write an order-flow `.mmd` in a fresh proof-assets directory there. It shows Cart, Stock, Pay, Wait, and Split, with a stock branch and short labels. Mark Stock and Wait `warn`, Pay `ok`, and Split `changed`.
2. Run `bun "$RENDER" <order.mmd> <order.svg> --focus Stock`. Capture command, stdout, stderr, and exit code. Expect exit 0, empty stderr, and the SVG's absolute path.
3. Read the SVG bytes. Its root has `pele pele-flowchart pele-f<8 hex>` classes and its first child is a style. Inspect the font, scoped theme, and actual geometry paints. Pay has a solid Green fill and Base text, Split has Blue, and focal Stock keeps Yellow under a Mauve border and text. Audit all authored paints against the 26 official Mocha values, including inherited paints and nested groups. No custom tint or `color-mix` remains. Preserve the bytes and their SHA-256.
4. Exercise malformed Mermaid, unknown and conflicting roles, authored colors, missing ids, an id shared by a source node and edge, and unsupported packet or railroad bindings. Expect exit 1 and no new output. Exercise malformed JSON, invalid binding entries, missing arguments, and unreadable inputs. Expect exit 2. Repeat each refusal against a prior successful output and confirm identical bytes and empty stdout. Verify identical role and category repeats succeed, but different category keys still conflict when a role masks them.
5. Submit this contribution, substituting the actual SVG path:

   ```json
   {"version":1,"items":[{"kind":"attachment","ref":"order","type":"svg","caption":"Stock check with wait and split shipment paths","origin":"Pele render of the order-flow proof source","path":"<absolute order.svg>"},{"kind":"round","questions":[{"ref":"choose","title":"Where does a split order wait?","description":"Choose the shipping policy.","needs":[{"need":"Follow the stock check and the split-shipment path.","kind":"context-diagram"}],"figures":[{"attachment":"order","kind":"context-diagram"}],"options":[{"label":"Wait","does":"Hold the order.","gains":["One shipment"],"costs":["Slower"]},{"label":"Split","does":"Ship what is in stock.","gains":["Faster"],"costs":["Two shipments"]}]}]}]}
   ```

6. Read `show`. The question retains its exact needs and figure kind. Fetch the registered captured SVG and compare its SHA-256 to step 3. Edit the source file and render the Flow again. The captured bytes remain unchanged.
7. Open the live URL and select the question using its receipt id. Check the Reader needs, image alternative text, dark background, and Mauve focus. Open the captured SVG in its own browser context to inspect actual computed geometry and text paints, not nonexistent inline SVG in the Flow. Capture ARIA and full-resolution lossless WebP at 1280 and 360px. Page-level overflow is zero.
8. Refuse a question whose need has no matching figure, a figure without a declared need, and a question that relies only on a Background figure. Compare authored-state and page hashes before and after. Stop only this proof's host and preserve the export before scoped Verify cleanup.
9. Render two flowcharts with shared ids and different output names. Bind one node to a role and another to a category, focus their group, and inline both exact SVGs in a throwaway consumer. Inspect computed fills and text on group and child marks to prove no descendant or cross-figure leakage. Compare category keys under reorder and insertion in separate render processes, and inspect two distinct labels sharing one accent. Retain the standalone and inline browser audits. Keep this consumer outside the product patch.

## Gotchas

- Run the checkout script, not the copy loaded by the current omp session.
- A missing Pele import is a dependency failure, not a Mermaid parse error.
- Timeline events, ishikawa causes, and individual xychart bars have no usable focal `data-id`. Explain their focal point in accompanying text.
- Focus ids are case-sensitive. A selector that matches nothing does not prove a visible accent.
- Flow images isolate the SVG's style from the page. Inspect focal rules in the captured SVG and visible image, not a nonexistent inline `svg` element.

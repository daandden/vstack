# Figure render

vstack-figures' render script turns one Mermaid source into a Catppuccin Mocha SVG with Pele, under Bun alone. The SVG holds one `<style>` that sets every `--pele-*` variable and a mauve rule for each focal id. Bad Mermaid exits 1 with Pele's parse error and writes no file. The Grilling page takes the SVG as a `{ "svg": "figures/<file>" }` visual.

## Sub-features

- `figure-render`: `render.ts <source.mmd | -> <out.svg> [--focus <id>]...` writes the SVG, prints its absolute path, and exits 0.
- `figure-focus`: each `--focus <id>` adds a mauve `stroke` rule and a mauve `text` rule for `[data-id="<id>"]`, scoped to a `pele-f<8 hex>` class on the figure's own root, so the rule never marks another figure on the same page.
- `figure-refuse`: bad Mermaid exits 1, prints Pele's parse error on stderr, and writes nothing. A usage error exits 2.
- `figure-page`: the Grilling page script accepts the SVG through its safety check and inlines it with its `<style>`.

## How to get to it (user POV)

- A skill that shows figures (explain, how, improve-codebase-architecture, ketchup, teach, or the Grilling page) writes Mermaid and runs `bun "$(realpath skill://vstack-figures/scripts/render.ts)" ...`, as skill://vstack-figures says.
- The user sees the SVG inline on that skill's page, or as a question visual on the flow's Grilling page.

## Driving it with bash and the omp browser

Preconditions:

- Follow the baseline in `README.md` and run Doctor.
- `$CHECKOUT/node_modules/pele` exists. If not, run `bun install --frozen-lockfile` in `$CHECKOUT` first.
- Set `R="$VERIFY_RUN_DIR/figure-render"`, `F="$R/grilling/vstack-verify-figure"`, `RENDER="$CHECKOUT/plugin/skills/vstack-figures/scripts/render.ts"`, and `PAGE="$CHECKOUT/plugin/skills/grilling-page/scripts/grilling-page.ts"`. Use a fresh directory. Keep proof outside `data/`.
- Run every command with the bash tool's `cwd` set to `CHECKOUT`.

1. Write `$R/order.mmd`:

   ```mermaid
   flowchart TD
     Cart([Cart submitted]) --> Stock{In stock?}
     Stock -- Yes --> Pay[Take payment]
     Stock -- No --> Split[Split shipment]
     Split --> Pay
   ```

   Run `bun "$RENDER" "$R/order.mmd" "$F/figures/order.svg" --focus Stock`. Expect exit 0, empty stderr, and only the absolute path of `$F/figures/order.svg` on stdout. Save stdout, stderr, and the exit code to `$R/render.txt`.
2. Read `$F/figures/order.svg`. The root tag starts `<svg` with `class="pele pele-flowchart pele-f<8 hex>"`, and its first child is a `<style>`. The style sets `--pele-bg: #1e1e2e;`, `--pele-fg: #cdd6f4;`, `--pele-accent: #cba6f7;`, `--pele-font` and `--pele-font-mono` to `'IosevkaTerm Nerd Font Mono', ui-monospace, monospace`, and `--pele-series-1` through `--pele-series-8`. With `S` set to that `pele-f…` class, it holds `.S [data-id="Stock"]:is(rect, path, polygon, circle, ellipse), .S [data-id="Stock"] :is(rect, path, polygon, circle, ellipse) { stroke: #cba6f7; stroke-width: 2.5px; }` and `.S [data-id="Stock"] text { fill: #cba6f7; }`, and no rule for `Pay`. Save the style text to `$R/style.css`.
3. Write `$R/bad.mmd` with `flowchart TD` and the line `  A[Cart --> `. Save a listing of `$R` and `$F/figures`. Run `bun "$RENDER" "$R/bad.mmd" "$F/figures/bad.svg"`. Expect exit 1, empty stdout, and stderr that starts `Parse error on line 2:`. List both directories again: `bad.svg` does not exist. Save the command, both streams, the exit code, and both listings to `$R/refuse.txt`.
4. Run `bun "$RENDER" "$R/order.mmd"`. Expect exit 2 and stderr that holds `Usage: bun render.ts`. Append it to `$R/refuse.txt`.
5. Write `$R/records.jsonl`:

   ```jsonl
   {"type":"page","id":"page","title":"Verify figure"}
   {"type":"flow","id":"flow","slug":"verify-figure","key":"verify-figure","state":"open"}
   {"type":"stage","id":"docs","skill":"grill-with-docs","state":"in-progress"}
   {"type":"round","id":"s1-r1","stage":"docs"}
   {"type":"question","id":"s1-r1-q1","title":"Where does a split order wait?","description":"The figure shows the stock check.","visual":{"svg":"figures/order.svg"},"options":[{"label":"A. Wait","does":"Hold the order.","gains":["One shipment"],"costs":["Slower"]},{"label":"B. Split","does":"Ship what is in stock.","gains":["Faster"],"costs":["Two shipments"]}]}
   ```

   Run `bun "$PAGE" append "$F/page.jsonl" "$R/records.jsonl"`. Expect exit 0 and only `$F/page.html` on stdout. The page holds `class="pele pele-flowchart pele-f` and `--pele-bg: #1e1e2e;`.
6. Open `$F/page.html#q-s1-r1-q1` in the browser. The figure sits on a dark background, `Stock` and its label are mauve, and no label overflows its box. Save an ARIA snapshot and a lossless WebP screenshot of the question as `$R/page.webp`.

## Gotchas

- Run the checkout's script, not `skill://vstack-figures/scripts/render.ts`, which resolves to the plugin that your own session loaded.
- `render.ts` resolves `pele` from the checkout's `node_modules`. A missing install fails at import with exit 1, not with a parse error.
- Pele gives no `data-id` to timeline events, ishikawa causes, or single xychart bars, so a `--focus` on those ids adds a rule that matches nothing. Use a flowchart id for this recipe.
- Mermaid ids are case-sensitive. `--focus stock` matches nothing in step 1.

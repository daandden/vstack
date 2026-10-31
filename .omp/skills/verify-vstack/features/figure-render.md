# Figure render

A caller renders Mermaid with the Bun CLI and receives a literal Catppuccin Mocha SVG. Roles, exact category keys, and explicit focus retain their meanings across supported families. Refusals publish nothing and preserve an older output. A Flow captures successful SVG bytes and displays them as an isolated image.

## Sub-features

- `figure-render`: file or stdin input writes an SVG, prints its absolute path, and exits 0.
- `figure-focus`: one stable source identity owns its visible marks. Mauve borders and text preserve the target's fill without affecting children or other figures.
- `figure-roles`: seven fixed roles override explicit categories, eligible intrinsic kinds, and genuine source categories in that order. Labels establish no role.
- `figure-bindings`: supported source ids accept roles or exact category keys. Identical repeats succeed. Conflicting assignments refuse even behind a higher-precedence role.
- `figure-chart-colors`: category keys retain their accent across types, order, insertion, and processes. Labels distinguish collisions among the 13 non-Mauve accents. Sankey source, target, and gradient modes use actual endpoints.
- `figure-entities`: native C4, ER, class, architecture, block, requirement, use-case, and tree identities retain their documented kind and geometry limits.
- `figure-schedules`: timeline, Gantt, journey, Kanban, and Git identities preserve source categories without deriving status from scores or names.
- `figure-spatial`: mindmap, Ishikawa, Wardley, and Cynefin assignments affect their owned geometry rather than unrelated children.
- `figure-workflows`: sequence headers and footers share one participant identity. State, swimlane, visible agent-flow, and event-model targets keep documented generated-id and collapsed-child limits.
- `figure-refuse`: semantic failures exit 1. Malformed bindings, usage, and unreadable input exit 2. Neither failure creates or replaces output.
- `figure-readability`: fixed-cell labels preserve common wide and combining text. Sub/Sup use explicit 75% sizing. Step edges and a light Base outline improve presentation without claiming fewer crossings or fixing text overlap.
- `figure-page`: captured SVG bytes and embedded styles survive source edits and load through an image element.

## How to get to it (user POV)

- A caller writes Mermaid and runs `plugin/skills/vstack-figures/scripts/render.ts`.
- The caller captures the successful SVG in its owning Flow Stage. The renderer itself opens no Stage.
- An offline consumer can inline the exact SVG, including its embedded style.

## Driving it with bash and the omp browser

Preconditions:

- Follow `README.md` and the parent skill's Doctor and Cleanup instructions.
- Use the checkout's pinned Bun and Pele 1.12.0. Obtain approval before provisioning missing dependencies.
- Set `SKILL_DIR`, `CHECKOUT`, and a fresh `VERIFY_RUN_DIR` as the parent skill defines them.
- Set `FLOW_SESSION` and `FLOW_AGENT` to this caller's extension-supplied identity. Never reuse another agent's binding.
- Run commands from `CHECKOUT`. All helper paths below are relative to `SKILL_DIR`.

1. Run Doctor, then generate the concrete CLI and browser fixtures:

   ```sh
   bash "$SKILL_DIR/scripts/doctor.sh" "$CHECKOUT" "$VERIFY_RUN_DIR"
   bun "$SKILL_DIR/scripts/figures.ts" "$CHECKOUT" "$VERIFY_RUN_DIR/figures"
   ```

   Expect `ok: true`. The helper refuses an existing output directory. It retains every Mermaid source, bindings document, SVG, command, stdout, stderr, and exit code. Read `figures/commands.json` and `figures/summary.json`. Every successful command reports its absolute SVG path with empty stderr. Each refusal runs against both a prior successful SVG and a nonexistent output. Prior bytes remain identical and no new SVG appears.

2. Exercise the remaining precise consumer regression scenarios through their real CLI calls:

   ```sh
   bun run test tests/figure-render.test.ts tests/figure-readability.test.ts tests/figure-bindings.test.ts tests/figure-entities.test.ts tests/figure-schedules.test.ts tests/figure-spatial.test.ts tests/figure-chart-colors.test.ts tests/figure-workflows.test.ts tests/figure-types.test.ts
   ```

   Expect no failures. The inputs are the literal sources in each named test, not workstation-only research files. Use these scenario names to locate a source for an individual replay:

   - `figure-bindings.test.ts`: "category colors depend only on exact keys", "identical explicit assignments repeat", "an id shared by a source node and edge", "malformed bindings", and the packet and four railroad notation rows.
   - `figure-entities.test.ts`: "native C4 kinds", "a failing C4 store", "a group colors its own backing", "architecture store icons", "tree basenames", and "entity authored paint". The example-driven rows name each native C4 and entity-family target.
   - `figure-schedules.test.ts`: "Gantt source states", "journey people", "category identities survive declaration and branch reordering", "Kanban priority", "Git histories keep branch identity", and every unavailable-identity row. The named `GANTT` and `FAMILIES` sources supply task, participant, period, card, and branch ids.
   - `figure-spatial.test.ts`: "category names match across families", "colors only the category header", "Wardley source strategies", "Cynefin domains", "unresolvable or conflicting spatial binding", and "mindmap text-only roles". The named `MINDMAP` source includes a child whose meaning must survive a parent assignment.
   - `figure-chart-colors.test.ts`: "exact category names stay stable", all `CHARTS` rows, "Venn intersections", "unnamed xy bars", "a source target with no emitted marks", "Sankey link concatenations", "Sankey refuses authored nodeColors", and "Sankey accepts a configuration without node paint".
   - `figure-workflows.test.ts`: the named `SEQUENCE`, `AGENT`, and `EVENT` inputs and all unsupported-target rows. These cover participant header/footer ownership, software neutrality, state aliases, open swimlane frames, collapsed children, generated edges, pseudostates, frame ids, and entity-name refusals.
   - `figure-readability.test.ts`: "labels use fixed-font cell widths", "wrapping follows visible cells", "default flowchart edges", and prior-output preservation.
   - `figure-types.test.ts`: every documented keyword and alias uses `plugin/skills/vstack-figures/references/examples/<keyword>.mmd`.

3. Open `figures/consumer.html` in a named browser tab with `app: { tern: false }` and a 1280 by 900 viewport. Evaluate the complete text of `scripts/figure-audit.js` in that page:

   ```js
   const audit = await tab.evaluate(await Bun.file(`${SKILL_DIR}/scripts/figure-audit.js`).text());
   ```

   Expect `ok: true`, 13 category accents, literal computed Mocha paints, and 12px Sub/Sup at a 16px base. Save the returned JSON. The audit checks group and figure isolation, multi-mark participant ownership, all three native Sankey modes, cross-family category stability under reorder and insertion, fixed-cell geometry, wrapping, and outline independence. It removes the first figure's style temporarily and restores it before returning.

   Inspect the named sections `one`, `two`, `sequence`, `pie`, `sankey-source`, `sankey-target`, `sankey-gradient`, `readability`, and each `*-plain`/`*-bound` pair. Inspect ordinary node text separately from loose outlined text. In the tree pair, the icon-disabled `README.md` gains no icon; the existing `index.ts` icon keeps its source-kind distinction. Inspect architecture icon contrast, Gantt outside labels, journey dots and legend, Git cutouts, Wardley open routes and loose labels, Venn text-only intersections, and child meanings in spatial and workflow groups. All example SVGs also remain available as standalone files. Open representative files in their own SVG context, not only the inline page.

4. Read `figures/revisions.json`. The historical comparison starts at `9a3a54bbb269732d548c0cc00af18497657d6933`. The after revision is the recorded checkout HEAD plus the recorded working renderer SHA-256. For this feature's review-fix wave, the parent is `da4dea5027f0871b7c97a652ed735a4dabddf481` plus the review patch. Compare `before-9a3a54b.svg` with `after-working-tree.svg` using their identical retained `comparison.mmd` input. This comparison includes intentional typography, step routing, outline, and palette changes. It does not prove any one change caused all visible differences.

   Palette-only comparisons instead use each `*-plain.svg` and `*-bound.svg` pair from the same current renderer and unchanged source. The helper compares coordinates, path data, dimensions, and viewBox for those pairs. Do not demand layout equality across the historical typography/routing change. Compare explicit source configurations or temporarily remove only the outline in the browser when judging routing or outline alone. Native Pele `smaller` previously displayed about 13.33px at a 16px base. The confirmed output is explicitly 12px, not a promise to retain native keyword sizing. Record fallback-font and unverified Unicode limits.

5. Drive a clearly labelled disposable Flow fixture:

   ```sh
   bash "$SKILL_DIR/scripts/doctor.sh" "$CHECKOUT" "$VERIFY_RUN_DIR"
   bun "$SKILL_DIR/scripts/figure-flow.ts" "$CHECKOUT" "$VERIFY_RUN_DIR" "$FLOW_SESSION" "$FLOW_AGENT"
   ```

   Expect `ok: true` in `figure-flow/summary.json`. This uses only `data/figure-home`, creates a disposable Stage, captures `figures/one.svg` in both a Document and a question with reader needs, and saves receipts and raw commands. The captured bytes and SHA-256 remain unchanged after the original source changes. A question missing its required figure refuses without changing the page. Open the summary's live URL, select the question, and inspect Reader needs, meaningful image alternative text, and the visible focused group. Inspect the saved `figure-flow/captured.svg` in its own browser tab for computed SVG paints. Flow images are not inline SVG.

6. Save ARIA and full-resolution lossless WebP proof at 1280 and 360px. Capture PNG silently, convert losslessly, and read the resulting WebP as the parent skill requires. Record page overflow and visible readability separately from the computed-paint audit. Keep the raw outputs and revision record beside the screenshots.

7. Preserve the disposable Flow export before cleanup. Stop only its authenticated isolated-home host, close owned tabs, and run scoped cleanup:

   ```sh
   bun "$CHECKOUT/plugin/skills/flow-page/scripts/flow-page.ts" host stop --home "$VERIFY_RUN_DIR/data/figure-home" --session "$FLOW_SESSION" --agent "$FLOW_AGENT"
   bash "$SKILL_DIR/scripts/cleanup.sh" "$VERIFY_RUN_DIR"
   ```

   Keep `figures/`, `figure-flow/`, screenshots, ARIA, and `notes.md` outside `data/`. Record every failed attempt, Doctor retry, correction, re-drive, and teardown. Do not publish this disposable fixture to the real Flow.

## Gotchas

- Run checkout scripts, not the plugin already loaded in the current omp session.
- A missing Pele import is a dependency failure, not a Mermaid parse error.
- Focus is case-sensitive and requires one stable source identity with visible owned marks. Multiple SVG marks can belong to one semantic target.
- Timeline events, Ishikawa causes, and individual xy bars have no supported focus id. Generated ids, hidden children, and missing geometry remain unsupported.
- Used or unused paint declarations are refused, including theme-variable paints and Sankey `nodeColors`. Empty color configuration remains valid.
- Authored palette values differ from pixels blended by opacity, gradients, and antialiasing. Audit gradient stops rather than sampling interpolated pixels.
- Browser `paint-order: stroke fill` can serialize as `stroke`; both mean the outline precedes the fill.
- A combined historical before/after is not palette-only evidence. Keep intended typography and routing differences separate.

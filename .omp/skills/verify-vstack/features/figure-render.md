# Figure render

vstack-figures has callers write Mermaid. Flow authoring captures the source, and the reader draws it with the pinned Pele in Catppuccin Latte on light and Mocha on dark. The reader and export share Color roles, step edges, and outlined edge and cluster labels. A Document `mermaid` code block uses that same reader pipeline and retains its text in a Source disclosure. Exports outside the Flow embed the Mocha theme. A captured Pele SVG from an earlier Flow keeps its bytes and follows the reader theme (ADR 0050 and ADR 0065-flow-figures-get-color-roles-from-the-shared-role-pass).

## Sub-features

- `figure-render`: file or stdin input writes an SVG, prints its absolute path, and exits 0.
- `figure-focus`: one stable source identity owns its visible borders. Focus paints a 2.5px Mauve border, preserves the fill and ordinary label text, and leaves children and other figures unchanged. A text-only target without a visible border refuses focus.
- `figure-roles`: seven fixed roles override explicit categories, eligible intrinsic kinds, and genuine source categories in that order. Role fills use the accent at `fill-opacity: 0.22`, with a solid accent border and ordinary Text labels. Focus changes only that border. Labels establish no role.
- `figure-bindings`: supported source ids accept roles or exact category keys. Identical repeats succeed. Conflicting assignments refuse even behind a higher-precedence role.
- `figure-chart-colors`: category keys retain their accent across types, order, insertion, and processes. Labels distinguish collisions among the 13 non-Mauve accents. Sankey source, target, and gradient modes use actual endpoints.
- `figure-entities`: native C4, ER, class, architecture, block, requirement, use-case, and tree identities retain their documented kind and geometry limits.
- `figure-schedules`: timeline, Gantt, journey, Kanban, and Git identities preserve source categories without deriving status from scores or names.
- `figure-spatial`: mindmap, Ishikawa, Wardley, and Cynefin assignments affect their owned geometry rather than unrelated children.
- `figure-workflows`: sequence headers and footers share one participant identity. State, swimlane, visible agent-flow, and event-model targets keep documented generated-id and collapsed-child limits.
- `figure-refuse`: semantic failures exit 1. Malformed bindings, usage, and unreadable input exit 2. Neither failure creates or replaces output.
- `figure-readability`: fixed-cell labels preserve common wide and combining text. Sub/Sup use explicit 75% sizing. Step edges and a light Base outline improve presentation without claiming fewer crossings or fixing text overlap.
- `figure-page`: a `mermaid` attachment retains source bytes by SHA-256. The reader draws it in a caption-named shadow root with Color roles, step edges, outlined labels, theme changes in place, no script, and no outside requests. Document `mermaid` code blocks also draw and expose their exact text through Source. Historical Pele SVGs keep captured bytes while following the reader theme; other SVGs remain isolated images. Exported SVG bytes and embedded styles survive source edits.

## How to get to it (user POV)

- A result-producing caller such as explain, how, architecture improvement, or teach writes Mermaid and captures it as a `mermaid` attachment. teach also runs vstack-figures' render script for its offline lesson.
- A Document author supplies a code block with language `mermaid`. The reader draws it and keeps the code and optional source attribution in a keyboard-operable Source disclosure.
- The caller owns the Flow Stage and captures the source. The rendering helper opens no empty Stage.

## Driving it with bash and the omp browser

Preconditions:

- Follow `README.md` and the parent skill's Doctor and Cleanup instructions.
- Use the checkout's pinned Bun and Pele 1.12.0. Obtain approval before provisioning missing dependencies.
- Set `SKILL_DIR`, `CHECKOUT`, and a fresh `VERIFY_RUN_DIR` as the parent skill defines them.
- Set `FLOW_SESSION` and `FLOW_AGENT` to this caller's extension-supplied identity. Never reuse another agent's binding.
- Run commands from `CHECKOUT`. All helper paths below are relative to `SKILL_DIR`.

1. Step `figure-render-cli`: Run Doctor, then generate the concrete CLI and browser fixtures:

   ```sh
   bash "$SKILL_DIR/scripts/doctor.sh" "$CHECKOUT" "$VERIFY_RUN_DIR"
   bun "$SKILL_DIR/scripts/figures.ts" "$CHECKOUT" "$VERIFY_RUN_DIR/figures"
   ```

   Expect `ok: true`. The helper refuses an existing output directory. It retains every Mermaid source, bindings document, SVG, command, stdout, stderr, and exit code. Read `figures/commands.json` and `figures/summary.json`. Every successful command reports its absolute SVG path with empty stderr. Each refusal runs against both a prior successful SVG and a nonexistent output. Prior bytes remain identical and no new SVG appears.

2. Step `figure-render-tests`: Exercise the remaining precise consumer regression scenarios through their real CLI calls:

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

3. Step `figure-render-consumer-audit`: Open `figures/consumer.html` in a named browser tab with `app: { tern: false }` and a 1280 by 900 viewport. Follow the parent skill's browser policy for every open, including diagnostics, retries, recovery, and delegated verification. Evaluate the complete text of `scripts/figure-audit.js` in that page:

   ```js
   const audit = await tab.evaluate(await Bun.file(`${SKILL_DIR}/scripts/figure-audit.js`).text());
   ```

   Expect `ok: true`, 13 category accents, literal computed Mocha paints, and 12px Sub/Sup at a 16px base. Save the returned JSON. The audit checks all seven role fills at opacity 0.22, ordinary label text, 2.5px border-only focus, group and figure isolation, multi-mark participant ownership, all three native Sankey modes, cross-family category stability, fixed-cell geometry, wrapping, and outline independence. It removes the first figure's style temporarily and restores it before returning.

   Inspect the named sections `one`, `two`, `sequence`, `roles`, `pie`, `sankey-source`, `sankey-target`, `sankey-gradient`, `readability`, and each `*-plain`/`*-bound` pair. Inspect ordinary node text separately from loose outlined text. In the tree pair, `README.md` receives its role without gaining an icon, and the existing `index.ts` icon receives the focal border. The text-only `README.md` focus refusal preserves old output and creates no new SVG. Inspect architecture icon contrast, Gantt outside labels, journey dots and legend, Git cutouts, Wardley open routes and loose labels, Venn text-only intersections, and child meanings in spatial and workflow groups. Open representative SVG files in their own context, not only the inline page.

4. Step `figure-render-revisions`: Read `figures/revisions.json`. The historical comparison starts at `9a3a54bbb269732d548c0cc00af18497657d6933`. The after revision is the recorded checkout HEAD plus the recorded working renderer SHA-256. Compare `before-9a3a54b.svg` with `after-working-tree.svg` using their identical retained `comparison.mmd` input. This comparison includes intentional typography, step routing, outline, and palette changes. It does not prove any one change caused all visible differences.

   Palette-only comparisons instead use each `*-plain.svg` and `*-bound.svg` pair from the same current renderer and unchanged source. The helper compares coordinates, path data, dimensions, and viewBox for those pairs. Do not demand layout equality across the historical typography/routing change. Compare explicit source configurations or temporarily remove only the outline in the browser when judging routing or outline alone. Native Pele `smaller` previously displayed about 13.33px at a 16px base. The confirmed output is explicitly 12px, not a promise to retain native keyword sizing. Record fallback-font and unverified Unicode limits.

5. Step `figure-render-flow`: Drive a clearly labelled disposable Flow fixture:

   ```sh
   bash "$SKILL_DIR/scripts/doctor.sh" "$CHECKOUT" "$VERIFY_RUN_DIR"
   bun "$SKILL_DIR/scripts/figure-flow.ts" "$CHECKOUT" "$VERIFY_RUN_DIR" "$FLOW_SESSION" "$FLOW_AGENT"
   ```

   Expect `ok: true` in `figure-flow/summary.json`. This uses only `data/figure-home` and a labelled disposable Stage. It captures `figures/one.svg` as a historical Pele attachment, the retained seven-role Mermaid source with `cart` focus, and that same source as a Document `mermaid` code block. Both attachments appear on a question with Reader needs. Source and SVG hashes remain unchanged after the originals change. The missing-visual question, unknown role, authored paint, and text-only focus refuse with empty success stdout and unchanged stored state. Inspect their raw refusals. Open the live URL and inspect the question's Reader needs. Inspect `figure-flow/captured.svg` separately for export paints.

   Select Light, Dark, then Light. Evaluate the complete text of `scripts/figure-reader-audit.js` after each selection and save its returned JSON:

   ```js
   const readerAudit = await tab.evaluate(await Bun.file(`${SKILL_DIR}/scripts/figure-reader-audit.js`).text());
   ```

   Expect `ok: true`. Captured Mermaid and Document code show all seven 22% role fills and ordinary Text labels in both themes. Only the attachment's `cart` border is 2.5px Mauve. Edges use step segments and rounded corners, not cubic curves. Edge and cluster labels have a Base outline. Keep references to the SVG nodes across the theme toggles and confirm they survive without a redraw. Open the Document's Source disclosure by pointer, then close and reopen it with keyboard Enter. Its code matches `figure-flow/roles.mmd` and its source attribution remains visible. At narrow widths, use ArrowRight on a focused diagram and confirm local scrolling, not page overflow. Historical Pele SVGs follow the theme without changing their captured bytes. Do not infer source-kind or role behavior from the historical attachment alone.

6. Step `figure-render-captures`: Save ARIA and full-resolution lossless WebP proof at 1280 and 360px. Capture PNG silently, convert losslessly, and read the resulting WebP as the parent skill requires. Record page overflow and visible readability separately from the computed-paint audit. Keep the raw outputs and revision record beside the screenshots.

7. Step `figure-render-webkit`: WebKit coverage is required for the browser checks in steps 3, 5, and 6. Repeat them through a permitted, non-disruptive, non-Tern WebKit route only if one is available, and record the actual backend and engine. Do not open a Tern browser block to obtain this proof. If no permitted route is available, report WebKit proof as unavailable or unmet, with the reason. Required figure-render browser coverage remains unmet in that case. Chromium proof is not WebKit proof.

8. Step `figure-render-cleanup`: Preserve the disposable Flow export before cleanup. Stop only its authenticated isolated-home host, close owned tabs, and run scoped cleanup:

   ```sh
   bun "$CHECKOUT/plugin/skills/flow-page/scripts/flow-page.ts" host stop --home "$VERIFY_RUN_DIR/data/figure-home" --session "$FLOW_SESSION" --agent "$FLOW_AGENT"
   bash "$SKILL_DIR/scripts/cleanup.sh" "$VERIFY_RUN_DIR"
   ```

   Keep `figures/`, `figure-flow/`, screenshots, ARIA, and `notes.md` outside `data/`. Record every failed attempt, Doctor retry, correction, re-drive, and teardown. Do not publish this disposable fixture to the real Flow.

### Source-based and historical reader figures

1. Step `figure-render-source-capture`: In an isolated proof Flow, capture the same short order-flow drawing as a `mermaid` attachment with focal id `Stock`, and as an earlier Pele SVG. Put both on one complete question with matching reader needs and Visual kinds. Save the source and captured SVG hashes.
2. Step `figure-render-source-refusals`: Submit malformed Mermaid and expect Pele's parse error, no committed content, and unchanged `show`. Refuse a question with missing matching figures, a figure with no declared need, and a question relying only on a Background figure. Compare stored state and captured bytes before and after.
3. Step `figure-render-source-reader`: Open the live URL through the explicit non-Tern backend. Select the receipt's question id and wait for each `.diagram` to have `data-render="drawn"`. Each has role `img` named by its caption. Inspect labels inside shapes and the visible Stock focus in its shadow root. Pick Light, Dark, then Light. The same nodes change Latte and Mocha fills without a redraw, and the historical SVG follows the theme.
4. Step `figure-render-source-sanitize`: Publish a source figure with labels containing script tags, image handlers, `foreignObject`, and `javascript:` text plus a click link. Labels remain text. The drawing has no script, image, foreign object, link element, event handler, or outside URL. No dialog opens and no request leaves the host origin.
5. Step `figure-render-source-hashes`: Edit original source files after capture. Served source and historical SVG hashes remain unchanged. Capture ARIA and full-resolution lossless WebP at 1280 and 360px, and record page overflow and label readability. Use the same required non-Tern WebKit policy as step 7 above. An unavailable engine remains unmet proof, not a reason to open Tern.
6. Step `figure-render-source-cleanup`: Stop only the proof host, close owned tabs, and preserve stored Flow data and captured evidence. These CLI reader fixtures prove publication and drawing, not an ordinary user's custom-picker answer.


## Gotchas

- Run checkout scripts, not the plugin already loaded in the current omp session.
- A missing Pele import is a dependency failure, not a Mermaid parse error.
- Focus is case-sensitive and requires one stable source identity with a visible owned border. Multiple borders can belong to one semantic target. Text-only targets refuse even when their labels accept a role.
- Timeline events, Ishikawa causes, and individual xy bars have no supported focus id. Generated ids, hidden children, and missing borders remain unsupported.
- Used or unused paint declarations are refused, including theme-variable paints and Sankey `nodeColors`. Empty color configuration remains valid.
- Authored palette values differ from pixels blended by opacity, gradients, and antialiasing. Audit gradient stops rather than sampling interpolated pixels.
- Document Mermaid code blocks receive parser validation at submit, not the attachment's full role and authored-paint check. If the shared role pass refuses a stored source, the reader still draws it without role paints.
- Browser `paint-order: stroke fill` can serialize as `stroke`; both mean the outline precedes the fill.
- A combined historical before/after is not palette-only evidence. Keep intended typography and routing differences separate.

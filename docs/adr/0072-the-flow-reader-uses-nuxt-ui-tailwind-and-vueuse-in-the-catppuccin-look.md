# The Flow reader uses Nuxt UI, Tailwind, and VueUse in the Catppuccin look

> [ADR 20261123-the-repo-drops-the-nuxt-ui-reader-development-skill](20261123-the-repo-drops-the-nuxt-ui-reader-development-skill.md) removes `nuxt-ui` from the repo dev skills that the last Consequences bullet lists. The other five skills stay installed.

The user chose this in the `ak-render-flow-page-75092c` interview on 2026-11-10. It amends [ADR 0049](0049-flow-reader-uses-nuxt-with-vite-plus-on-bun.md). These are accepted design decisions, not a claim that the implementation is complete.

The Flow reader adds Nuxt UI 4, Tailwind 4, and VueUse on top of its existing Nuxt and Vue, the component layer side's workspace app uses. Every existing reader component and `reader.css` moves onto Nuxt UI components and Tailwind utilities in the same change; the reader does not keep a second hand-written styling system. Vite+ stays the tooling and Bun stays the production host, as ADR 0049 chose. The reader keeps its approved look: Catppuccin Latte and Mocha, IosevkaTerm, and the compact layout, mapped into Nuxt UI's theme tokens, so Pele diagrams and Color roles keep their colors ([ADR 0050](0050-the-flow-reader-draws-diagrams-from-mermaid-source-with-pele.md)). Nuxt UI's fonts, icons, and color mode use local assets and run under the host's CSP.

The interview started from integrating ak-render. ak-render compiles a Page Spec into a standalone HTML document, not reader components, and ships no diagram layout engine, so the Flow page borrows its ideas natively instead of depending on it.

## Considered Options

- **Depend on ak-render**, as captured artifacts, a host-compiled Result kind, or an offline export: rejected. Each adds a Node package to a Bun host or puts content in a separate frame outside structured Flow records.
- **Match side exactly, replacing Vite+ with plain Vite**: rejected. It changes ADR 0049's tooling for no reader gain.
- **Tailwind and VueUse without Nuxt UI**: rejected. Sortable tables and comment popovers would be built and made accessible by hand.
- **Take side's monochrome Geist look**: rejected. It would redo the approved look and the diagram palette mapping.
- **Migrate only new features, or shared pieces first**: rejected. The Catppuccin colors would live in two theming systems until the last component moved.

## Consequences

- Browser tests that select old CSS classes and the Verify readability and diagram proofs are redone for the whole reader.
- vstack installs side's generic frontend skills (nuxt-ui, vue-best-practices, vue-debug-guides, vue-testing-best-practices, vueuse-functions, create-adaptable-composable) as repo dev skills in `.omp/skills` with `npx skills`, recorded in `skills-lock.json`. They are not shipped in the plugin.

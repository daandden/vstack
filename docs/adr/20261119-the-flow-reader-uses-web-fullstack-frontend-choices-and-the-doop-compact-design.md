# The Flow reader uses web-fullstack's frontend choices and the Doop compact design

> Amended by [ADR 20261126-web-fullstack-recommends-ui-sdk-and-the-reader-keeps-reka-for-now](20261126-web-fullstack-recommends-ui-sdk-and-the-reader-keeps-reka-for-now.md). web-fullstack now recommends UI SDK; the reader keeps its copied reka-ui controls as a named exception until a later spec migrates it.

> Amended by [ADR 20261127-vstack-designs-with-openpencil-and-the-reader-theme-holds-the-compact-design](20261127-vstack-designs-with-openpencil-and-the-reader-theme-holds-the-compact-design.md). vstack no longer uses Doop. `reader/app/assets/theme.css` and the reader's components define the compact design, and the Doop canvas is no longer a reference.

The user chose this while triaging and grilling daandden/vstack#532 on 2026-11-19. It replaces the component and styling choices of [ADR 0072](0072-the-flow-reader-uses-nuxt-ui-tailwind-and-vueuse-in-the-catppuccin-look.md) and keeps its Catppuccin Latte and Mocha look, IosevkaTerm type, local assets, and CSP rules. These are accepted design decisions, not a claim that the implementation is complete.

The Flow reader drops Nuxt UI and Tailwind for the frontend stack web-fullstack recommends: shadcn-vue components copied into the reader and adapted to UnoCSS presetWind4, UnoCSS presetIcons with the local Lucide collection, TanStack Form with omptype schemas for the comment form and quiz answers, `@tanstack/vue-table` for Result tables, `@unovis/vue` for Metrics charts, `@nuxtjs/color-mode`, and VueUse. In the same change the reader adopts the compact design on the Doop canvas "flow page" (DC6Hzugx8b) and its style guide "Flow reader compact design": the canvas tokens become the UnoCSS theme, with a 4px spacing scale, 16px entry padding, and a 28px minimum control height. The Flow page is desktop only, so there are no coarse-pointer or mobile variants. Inputs, textareas, and select triggers show focus and the open state by their border alone, with no outline ring.

The server stays as [ADR 20261116-the-flow-page-is-a-fullstack-nuxt-app-on-local-sqlite](20261116-the-flow-page-is-a-fullstack-nuxt-app-on-local-sqlite.md) chose. web-fullstack's Cloudflare choices do not apply. ADR 0072's rejections of ak-render and of matching side's tooling still stand.

## Considered Options

- **Keep Nuxt UI and Tailwind**: rejected. The reader would be the only app on a second frontend stack, and ADR 0072's reason, hand-built sortable tables and popovers, no longer holds with Reka-based copied controls and `@tanstack/vue-table`.
- **Keep `@tanstack/charts`**: the agent recommended it because the chart had no Nuxt UI or Tailwind coupling. The user chose `@unovis/vue` to match web-fullstack.
- **presetWind3**, the recipe's conservative start: rejected because the templates use Tailwind 4 utility names, which Wind4 carries over.
- **Stack only, keep today's look**: rejected. The Doop compact design had been agreed and never implemented.
- **Workspace's mono Geist look**: rejected. The reader keeps Catppuccin, as the Doop style guide says.
- **44px touch targets on coarse pointers**: rejected because the Flow page is desktop only.

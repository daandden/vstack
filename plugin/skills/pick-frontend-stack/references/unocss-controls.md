# Adapt copied controls to UnoCSS

shadcn-vue's [official setup](https://www.shadcn-vue.com/docs/installation/manual) uses Tailwind. UnoCSS is not a drop-in replacement. Own the copied source and adapt the components actually needed, including their popup states. Check the current registry and dependencies before copying. Preserve applicable component-source notices.

## Install one CSS pipeline

For a new UnoCSS project, use compatible `unocss` and the required Iconify collection as development dependencies. In Nuxt, add and register `@unocss/nuxt`. In Vite, add `UnoCSS()` from `unocss/vite` to the existing Vite plugins and import `virtual:uno.css` once in the app entry. Keep the Vue plugin.

Copy the required controls from the official shadcn-vue registry. Manual registry copying avoids a Tailwind-oriented initializer rewriting the app. Install only the copied components' actual runtime dependencies, such as `reka-ui`, `class-variance-authority`, and `@vueuse/core` where imported. Do not keep unused registry components or install every registry dependency blindly.

A conservative compatibility starting point is `presetWind3`, with explicit token mapping. Wind4 is another version-specific option, not permission to paste Tailwind directives unchanged:

```ts
import { defineConfig, presetIcons, presetWind3 } from 'unocss'

export default defineConfig({
	presets: [presetWind3(), presetIcons()],
	content: {
		pipeline: {
			include: [/\.(vue|[jt]sx?|html)($|\?)/],
		},
		filesystem: ['components/**/*.{vue,ts}', 'app/**/*.{vue,ts}', 'src/**/*.{vue,ts}'],
	},
	theme: {
		colors: {
			background: 'var(--background)',
			foreground: 'var(--foreground)',
			primary: { DEFAULT: 'var(--primary)', foreground: 'var(--primary-foreground)' },
			secondary: { DEFAULT: 'var(--secondary)', foreground: 'var(--secondary-foreground)' },
			muted: { DEFAULT: 'var(--muted)', foreground: 'var(--muted-foreground)' },
			accent: { DEFAULT: 'var(--accent)', foreground: 'var(--accent-foreground)' },
			popover: { DEFAULT: 'var(--popover)', foreground: 'var(--popover-foreground)' },
			destructive: { DEFAULT: 'var(--destructive)', foreground: 'var(--destructive-foreground)' },
			border: 'var(--border)', input: 'var(--input)', ring: 'var(--ring)',
		},
	},
})
```

Adjust extraction paths to the actual app. Include TypeScript variant files, not only `.vue` templates. Keep complete literal utility and icon names in source, or safelist the finite names used dynamically. Do not construct names such as `i-${collection}-${name}` and expect extraction to discover them.

## Translate the copied styling

1. Replace Tailwind imports, plugins, `@theme`, `@custom-variant`, and Tailwind `@apply` with UnoCSS configuration or ordinary CSS. Remove the Tailwind pipeline and unused animation dependencies in a new UnoCSS setup. Preserve an existing CSS system unless its migration was requested.
2. Define every token referenced by the selected controls. Use complete CSS colors for the mapping above, not bare HSL channels. A light and dark pair can use `light-dark(oklch(...), oklch(...))` with `color-scheme` switched by the app's theme attribute. Include background, foreground, popover, accent, border, input, ring, and variant foreground tokens. Adapt the theme hook if using Nuxt color mode. Theme tokens must apply to portalled content too.
3. Audit every variant actually used: `data-[state=open]`, disabled, highlighted, side, responsive, arbitrary selectors, and focus. Wind3 supports data-attribute utilities, but does not supply every Tailwind plugin rule. Replace unsupported rules with named component CSS or an explicit UnoCSS rule. Check generated CSS and computed styles in production, including variants in `.ts` files.
4. Replace `animate-in`, `animate-out`, `fade-in-*`, `zoom-*`, and `slide-*` plugin utilities with explicit CSS or remove motion deliberately. Do not leave inert class names. Frequent keyboard dialogs and menus can open instantly. If occasional pointer motion is useful, use component-owned state selectors, short keyframes, and a reduced-motion branch. Preserve Reka's mounting and exit behavior. A duration utility alone creates no animation.
5. Adapt class composition. Tailwind merge utilities understand Tailwind conflicts, not arbitrary UnoCSS shortcuts. For a controlled copied component, use Vue class arrays or `clsx`, with explicit variant choices that avoid conflicting utilities. If retaining a merger, verify the actual UnoCSS classes it removes or keeps. Preserve props, emits, slots, Reka focus handling, portal, title, and description semantics.
6. Apply skill://good-css to copied styles too. Replace removed focus outlines with visible outlines, use logical spacing, provide press states, and gate hover. Adapt copied no-wrap and nonshrinking button styles so action labels fit at narrow widths and with enlarged text. Resize dialogs against available inline size and keep their body scrollable rather than clipping actions.

## Replace copied icon code

Install the local collection, for example `@iconify-json/lucide`. Replace copied Lucide component imports with literal UnoCSS icon spans:

```vue
<button type="button" aria-label="Close">
	<span class="i-lucide-x inline-block size-4 shrink-0" aria-hidden="true" />
</button>
```

Keep the original icon artwork when an app has a chosen set. An informative icon needs accessible text. Decorative icons stay hidden from assistive technology. Update copied selectors that style only `svg` so they also size the new icon spans. Verify an actual CSS mask or background and dimensions, not merely the presence of a class. Do not add `@nuxt/icon` automatically alongside this renderer.

## Observe the controls

Build and typecheck the real application. Open the copied dialog and menu with keyboard input, navigate menu items, press Escape, and observe focus return. Observe light and dark portalled content, disabled and invalid states, a 320px viewport, and long realistic content. Keep screenshots and ARIA evidence through the existing Verify owner. A styled button alone proves neither popup behavior nor the other copied components.

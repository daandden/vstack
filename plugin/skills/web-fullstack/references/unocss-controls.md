# Style UI SDK controls with UnoCSS

Use the project's existing CSS system when it fits. In the curated UnoCSS setup, use the app's tokens for presentation and UI SDK for behavior. Use one CSS pipeline.

## Set up UnoCSS

For a new UnoCSS setup, add `unocss` as a development dependency with the app's package manager. In Nuxt, add and register `@unocss/nuxt`. In Vite, keep the Vue plugin, add `UnoCSS()` from `unocss/vite`, and import `virtual:uno.css` once in the app entry.

Keep the project's UnoCSS preset. For a fresh setup, check which preset supports the utilities the app uses. Map utility colors to existing CSS custom properties under `theme.colors`. Select opens in the browser's top layer without a portal by default. If the app's `container` setting moves a popup, make its theme tokens available in that container.

Include the app's templates and any TypeScript files that hold utility names in extraction. Use complete literal utility and icon names, or safelist the finite set chosen dynamically.

## Style the rendered parts

Declare `@layer ui-sdk;` at the top of the global stylesheet so the app controls the cascade relative to UI SDK's behavior styles. Keep `@ui-sdk/core/web.css` out of the stylesheet, app imports, and Nuxt CSS configuration. The app provides the presentation and icon artwork.

Read the installed component's Styling and Data Attributes sections. Match the rendered `data-slot` and the state attributes that part documents. Use UnoCSS attribute variants or ordinary CSS for those selectors. Use `[data-open]` or `[data-pressed]` only where the part exposes them. Use a value selector for an attribute such as `[data-side="top"]`.

For example, map `control-active` to `var(--control-active)` in UnoCSS `theme.colors`. Put the literal utility `data-[checked]:bg-control-active` on the Switch root, which renders `data-slot="switch"` and exposes `data-checked`. For Select, size the documented content part using its placement variables:

```css
@layer ui-sdk;

[data-slot="select-content"] {
	inline-size: min(var(--anchor-width), var(--available-width));
	max-block-size: var(--available-height);
	overflow-y: auto;
	background: var(--control-popover);
}
```

Define the example's tokens in the project theme or substitute existing tokens. Apply Select's non-inherited available dimensions on the content part itself. Use the documented placeholder and highlighted states to distinguish the trigger and items where needed.

If app display styles would reveal a hidden, server-rendered part before hydration, add the behavior layer's hidden rule to the global stylesheet. Leave `hidden="until-found"` available to find-in-page:

```css
@layer ui-sdk {
	:where([data-slot][hidden]:not([hidden="until-found"])) {
		display: none !important;
	}
}
```

If the app limits inline styles, read the installed UI SDK Styling and Animation guide's Content Security Policy section. Follow its instructions for the app's nonce or for constructed stylesheets when the policy has no style nonce. Keep the app's policy intact. Verify that behavior styles and popup placement work under that policy.

Use skill://good-css for focus, press, and reduced-motion styling. Check those states without replacing UI SDK's keyboard or focus behavior.

Let the trigger's parent flex item or grid track shrink at narrow widths. Let control labels wrap and move a Switch to the next line if its row runs out of room. Measure the open popup and the page's scroll width with enlarged text. Fix the layout rather than hiding horizontal overflow.

## Keep the project's icons

Use UnoCSS `presetIcons()` with the local `@iconify-json/<collection>` development dependency for the artwork the app uses. Keep existing artwork. Use a complete class such as `i-lucide-chevron-down` with the Lucide collection. Hide decorative indicators from assistive technology and give icon-only controls accessible names. Check the icon's computed mask or background and dimensions in the built app, not just its class name.

## Observe the controls

Exercise the actual controls in the built app. For Select, open and navigate by keyboard, dismiss with Escape, observe focus return, then make a selection. For Switch, toggle with Space. Submit named controls and inspect the form values the consumer receives. In Nuxt, check the initial server HTML and the hydrated interaction.

Check visible focus, disabled and invalid states where used, themes, narrow layouts, and realistic content. For the repository proof recipe, see Verify's `frontend-stack` feature, `stack-controls`. Its browser checks and the UI SDK agent-ready test prove different paths.

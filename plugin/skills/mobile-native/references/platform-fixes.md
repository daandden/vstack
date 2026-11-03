# Mobile platform fixes

Read the matching section before changing touch, viewport, safe-area, hover, input, scrolling, or browser chrome behavior. Apply fixes where their reason holds rather than pasting a global reset.

## Hover and press

Gate hover by both primary-input capabilities:

```css
@media (hover: hover) and (pointer: fine) {
  button:hover { background: var(--hover-background); }
}
```

Some Tailwind versions gate `hover:` by hover capability alone. Inspect the actual dependency version and generated CSS before assuming it also checks pointer precision. Add the missing capability condition in the project's existing authoring system.

Every pressable control needs immediate `:active` feedback and an independent `:focus-visible` outline. Keep actions on semantic click or release so moving away can cancel a press. A subtle scale can suit occasional pointer interaction; use nonmoving color feedback for reduced motion or frequent keyboard actions. Start suitable press transitions near 100–160ms with ease-out, following the existing design guidance rather than inventing another timing system.

Browsers may paint a tap highlight. `-webkit-tap-highlight-color: transparent` can remove it where it conflicts with explicit press feedback, but keep equivalent feedback on every affected control. `touch-action: manipulation` on ordinary tappable controls permits panning and pinch zoom while avoiding double-tap delay where supported. Do not promise a universal 300ms improvement in modern browsers.

Use `user-select: none` and `-webkit-user-select: none` only on controls whose labels should not be selected. A supported `-webkit-touch-callout: none` can suppress callouts on control-like links or images when justified. Keep addresses, messages, identifiers, body text, and input content selectable.

## Viewport and keyboard

Use a viewport declaration that preserves zoom:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

Never add `user-scalable=no` or `maximum-scale=1` to fix input focus zoom. A font below 16 CSS pixels can trigger iOS focus zoom. Use a suitable minimum input font size rather than preventing the user's zoom.

An app shell or drawer can track available browser-chrome height with `100dvh`. A stable hero can use `100svh`. `100vh` commonly uses the large mobile viewport, so bottom actions can be hidden while chrome is visible. Add a fallback only for the project's browser support requirements. Prefer a minimum height and a usable scroll region when content can grow rather than clipping a fixed-height shell.

Dynamic viewport units do not universally solve software-keyboard occlusion. In supported Chromium browsers, `interactive-widget=resizes-content` can ask the virtual keyboard to resize the layout viewport. It is not a cross-browser guarantee and does not make all iOS keyboard behavior equivalent. Test the actual browser and keyboard. Use a Visual Viewport API adjustment only if an observed problem and the existing stack require it.

Set actual field semantics before keyboard hints. Use `type="email"` or `type="tel"` for those fields. Use `inputmode="numeric"` for genuinely numeric codes, and `decimal` for amounts. Postal codes can contain letters and leading zeros, so do not assume a numeric field. Set appropriate `autocomplete`, `autocapitalize`, `autocorrect`, and `enterkeyhint` values. Keyboard hints do not replace validation or prove that a software keyboard appeared.

## Safe areas

`viewport-fit=cover` permits edge-to-edge content on supporting platforms. Protect edge-attached headers, fixed bottom bars, toasts, and sheets with the relevant insets:

```css
.app-header {
  padding-block-start: calc(1rem + env(safe-area-inset-top, 0px));
}
.bottom-bar {
  padding-block-end: calc(1rem + env(safe-area-inset-bottom, 0px));
  padding-inline-start: calc(1rem + env(safe-area-inset-left, 0px));
  padding-inline-end: calc(1rem + env(safe-area-inset-right, 0px));
}
```

The platform names left and right insets physically. Map them deliberately when using logical CSS properties and bidirectional layouts. Keep base spacing when an inset is zero. Avoid double-counting insets already applied by a surrounding shell. Test landscape because side insets can matter too.

A desktop or emulated browser can report zero for every inset. That establishes the zero-inset fallback only. A browser-supported safe-area override can exercise nonzero geometry, but report it as synthetic inset evidence, not a real notch. Real devices and standalone PWA mode need separate proof.

## Scroll and gesture ownership

For an app whose nested scroll containers must not chain to the page, `overscroll-behavior: none` on the root can suppress unwanted overscroll behavior where supported. Keep normal document pull-to-refresh when it is useful. Inner sheet or chat scroll regions can use `overflow-y: auto` with `overscroll-behavior: contain` to stop chaining while retaining local scrolling. Do not install a blanket `touchmove` handler with `preventDefault` that blocks scrolling.

For custom horizontal dragging, `touch-action: pan-y` leaves vertical panning to the browser. A vertical drag handle can use `pan-x`. Restrict `none` to a surface that truly handles every axis and does not block needed scrolling or zoom. A native scrolling carousel should normally use scroll snap rather than custom gesture interception.

## Browser chrome and installed apps

Where the design follows system themes, provide supported theme colors for both schemes:

```html
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0a0a0a">
<meta name="color-scheme" content="light dark">
```

Match the actual top background, not an unrelated brand color. Declare both color schemes only if the page supports them. A class-driven theme may need to update the matching tag. For an installed PWA, inspect its real manifest theme and background colors and supported Apple status-bar metadata. Framework metadata APIs depend on the installed framework version. Inspect that version and its documentation before choosing an API.

Observe scroll, resizing, keyboard, safe-area geometry, and theme appearance on the actual target platform where available. Device emulation does not settle physical touch, browser chrome, real keyboard, or installed-PWA claims.

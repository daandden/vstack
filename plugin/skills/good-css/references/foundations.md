## Scoped base styles

Apply a base declaration to the elements that need it.

```css
.article { text-wrap: pretty; }
.article :is(h1, h2, h3, h4) { text-wrap: balance; }
.editor { text-wrap: stable; }
.page { scrollbar-gutter: stable; }
.disclosure { interpolate-size: allow-keywords; }
```

Rules:

- Load every weight and style before setting `font-synthesis: none`. A missing bold otherwise renders as regular.
- Use `text-wrap: stable` when wrapping changes distract from typing in a textarea or contenteditable element.
- A reserved scrollbar gutter can put centered content slightly off-center on a page too short to scroll.

Support: `text-wrap: pretty` in Chrome 117 and Safari 26, ignored by Firefox. `scrollbar-gutter` in Chrome 94, Firefox 97, Safari 18.2. `interpolate-size` in Chrome 129 only.

## Logical spacing

Logical spacing and borders follow the writing direction.

```css
.card {
  padding-inline: 1.5rem;
  margin-block-end: 2rem;
  border-inline-start: 4px solid;
  text-align: start;
}
```

Support: Chrome 87, Firefox 66, Safari 14.1.


## OKLCH color

Write colors in `oklch()` and derive every related color from a base with `color-mix(in oklch, …)`. Never hardcode a second hex or an `rgba()` for a hover, tint or transparent version.

```css
:root {
  --primary: oklch(55% 0.15 250);
  --primary-hover: color-mix(in oklch, var(--primary), black 15%);
  --primary-subtle: color-mix(in oklch, var(--primary) 12%, transparent);
}
```

Rules:

- Write grays, white and black with `none` as the hue, as in `oklch(98% 0 none)`. A written hue of `0` is red, and it pulls every mix toward red. Half white `oklch(1 0 0)` and half a blue at hue 264 came out at hue 312 in Chrome and Safari. With `none`, or with the keyword `white`, it stayed at 264.

## One set of color tokens for light and dark

Use it on any site with a dark mode. Each token holds both values, so there is no second block of variables under a media query or a `.dark` class.

```css
:root {
  color-scheme: light dark;
  --background: light-dark(oklch(1 0 none), oklch(0.145 0 none));
  --foreground: light-dark(oklch(0.145 0 none), oklch(0.985 0 none));
}

[data-theme="light"] { color-scheme: light; }
[data-theme="dark"] { color-scheme: dark; }
```

Rules:

- Switch themes by setting `color-scheme`. Never redefine the tokens.
- The grays use `none` for the hue, so they can be mixed with a color later without drifting toward red. "OKLCH color" has the measurement.
- `light-dark()` takes two colors. Anything else that differs by theme, such as an image, needs its own rule.
- Add `<meta name="color-scheme" content="light dark">` so the browser paints the right background before the CSS loads.

Support: Chrome 123, Firefox 120, Safari 17.5. Baseline since May 2024.

## Fluid sizes with `clamp()`

Use it for section spacing and other layout sizes that grow with the screen. One declaration replaces a ladder of breakpoint overrides.

```css
:root {
  --space-section: clamp(3rem, 1rem + 6vw, 8rem);
}
```

Rules:

- For these layout tokens, use a preferred value such as `1rem + 6vw` so both a fixed contribution and viewport growth affect the size.
- Work the preferred value out from two points. The slope is `(max - min) / (wide - narrow)`, in px over px, and times 100 it is the `vw` number. The `rem` part is `min - slope × narrow`.
- Put fluid values in tokens. Components use the token and never repeat the math.
- For more than two or three sizes, derive a spacing scale as "One fluid spacing scale" does.

## One fluid spacing scale

Use it when a design needs more than two or three spacing sizes. Six numbers describe the scale, and the browser derives the steps without a breakpoint table or an external generator.

```css
:root {
  --narrow: 20;
  --wide: 77.5;
  --size-narrow: 1.125;
  --size-wide: 1.25;
  --ratio-narrow: 1.2;
  --ratio-wide: 1.25;

  --fluid: clamp(0rem, (100vw - var(--narrow) * 1rem) / (var(--wide) - var(--narrow)), 1rem);
  --at-narrow: calc(var(--size-narrow) * (1rem - var(--fluid)));
  --at-wide: calc(var(--size-wide) * var(--fluid));

  --step--1: calc(var(--step-0) / var(--ratio-narrow));
  --step-0: calc(var(--at-narrow) + var(--at-wide));
  --step-1: calc(var(--at-narrow) * var(--ratio-narrow) + var(--at-wide) * var(--ratio-wide));
  --step-2: calc(var(--at-narrow) * pow(var(--ratio-narrow), 2) + var(--at-wide) * pow(var(--ratio-wide), 2));
  --step-3: calc(var(--at-narrow) * pow(var(--ratio-narrow), 3) + var(--at-wide) * pow(var(--ratio-wide), 3));
  --step-4: calc(var(--at-narrow) * pow(var(--ratio-narrow), 4) + var(--at-wide) * pow(var(--ratio-wide), 4));

  --space-s: var(--step-0);
  --space-m: calc(1.5 * var(--step-0));
  --space-l: calc(2 * var(--step-0));
  --space-s-l: calc(var(--at-narrow) + 2 * var(--at-wide));
}

.card {
  display: grid;
  gap: var(--space-s);
  padding: var(--space-s-l);
}
```

Rules:

- Write the inputs as plain numbers. With `20rem` and `77.5rem` the `--fluid` line divides a length by a length, and Firefox does not support that.
- Change an input in the rule that declares the steps. A step takes its value where it is declared, so a ratio set on a descendant changes nothing below it.
- Derive sizes below step 0 from step 0 and the narrow ratio, as `--step--1` does. With both ratios a small size shrinks as the screen grows.
- For a scale that follows the container, write `100cqi` in place of `100vw`. "Container queries with container units" (`layout.md`) has the rules.
- Components use the tokens and never repeat the math.

Support: Chrome 120, Firefox 118, Safari 15.4, set by `pow()`. Tested in Chrome 150 and real Safari 27 on 2026-10-01, where every step came out within 0.001px of the formula.

## Left out on purpose

Decided on 2026-10-01. Do not add these back.

- **The layout half of Travis Arnold's reset.** `* { grid-area: 1 / 1 / 1 / 1 }`, a 12-column grid on `body`, and `display: contents` on `div` and every sectioning element. It stacks everything in one cell and removes the box of every container, which breaks "Content grid with breakouts" (`layout.md`) and any component that styles a `div`.
- **`* { text-box: trim-both cap alphabetic }`** globally. It shrinks every text block. A one-line paragraph at 16px/1.5 went from 25px tall to 11px and a button from 40px to 27px. "Label centered on its letters with `text-box`" (`text-and-media.md`) is the scoped version, for labels only.
- **`text-rendering: optimizeLegibility`.** MDN recommends `auto` for body text.

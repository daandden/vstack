## Long text that wraps, truncates or clamps

Use these declarations to implement an already-chosen wrapping, ellipsis, or line-clamp treatment.

```css

.name {
  white-space: nowrap;
  overflow: clip;
  text-overflow: ellipsis;
}

.excerpt {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: clip;
}
```

Rules:

- Put the truncation on the element that holds the text. On a flex or grid container the text is cut and no ellipsis appears.
- Every flex item between the row and truncated text must be able to shrink. Set `min-inline-size: 0` on those items.
- The clamp needs all four declarations. Unprefixed `line-clamp` is in no browser yet.
- Put padding on a wrapper, never on the clamped element. The next line shows through the bottom padding.

Support: `text-overflow` and `-webkit-line-clamp` work everywhere. With `overflow: clip` the ellipsis and clamp draw in Chrome 150 and Safari 27, tested on 2026-10-01. Firefox is untested, and `overflow: hidden` is the form to fall back to.

## Image box that holds any upload

An aspect-ratio box reserves space before an image loads. The declarations below cover ratio-based media and fixed-size avatars.

```css
.thumb {
  inline-size: 100%;
  block-size: auto;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  background-color: var(--surface-muted, oklch(0.9 0 none));
}

.avatar {
  flex: none;
  inline-size: 3.5rem;
  block-size: 3.5rem;
  border-radius: 50%;
  object-fit: cover;
  outline: 1px solid light-dark(oklch(0 0 none / 0.1), oklch(1 0 none / 0.1));
  outline-offset: -1px;
}
```

Rules:

- One axis must be `auto`. A `height` attribute or fixed height wins over the ratio. `block-size: auto` also applies to an `iframe`.
- `object-fit` does nothing until the box has both sizes or a ratio.
- Leave the background color off an image that has transparent areas. It shows through them.
- A fixed-size image in a flex row needs both sizes, as the avatar has. With only a width it stretches to the height of the row.
- In Safari a failed image ignores `aspect-ratio` and draws a square box. Where a failed load must not move the layout, put the ratio on a wrapper and give the image `inline-size: 100%` and `block-size: 100%`.
- `light-dark()` needs the `color-scheme` from "One set of color tokens for light and dark" (`foundations.md`). Without it the outline stays black on a dark page.

Support: `aspect-ratio` in Chrome 88, Firefox 89, Safari 15. An outline that follows the radius in Chrome 94, Firefox 88, Safari 16.4. `light-dark()` in Chrome 123, Firefox 120, Safari 17.5. The square box of a failed image is from real Safari 27, tested on 2026-10-01. Chrome 150 keeps the ratio.

## Tabular numbers

Use it on any number that changes or sits in a column, such as prices, tables, timers and counters.

```css
.price,
td,
time { font-variant-numeric: tabular-nums; }
```

Rules:

- The font must ship tabular figures, or nothing changes.

Support: Chrome 52, Firefox 34, Safari 9.1.

## Label centered on its letters with `text-box`

Use it on single-line labels in buttons, badges and chips, so equal padding looks equal in any font.

```css
.button {
  display: inline-block;
  padding: 0.75rem 1.25rem;
  text-box: trim-both cap alphabetic;
}

.button-with-icon {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
}

.button-with-icon > span { text-box: trim-both cap alphabetic; }
```

Rules:

- It does nothing on a flex or grid container. A button that is `inline-flex` because it holds an icon needs the declaration on the element that wraps the text, as in the second rule of the block.
- The button gets shorter, because the padding now starts at the letters. With `0.75rem` of padding it went from 48px tall to 35px in Chrome and Safari. Raise the padding to keep the height.
- Use it for one line. Descenders hang into the bottom padding, which is the intent.
- Scope it to labels. Never set it on `*`, because it shrinks every text block. A one-line paragraph at 16px/1.5 went from 25px tall to 11px.
- Write no fallback. Without support the label keeps its normal line box.

Support: Chrome 133, Firefox 154, Safari 18.2.

## Icon sized by the text beside it

Use it on every icon that sits next to a label, in buttons, links, list rows and notices. The icon takes its size from the font, so it follows the text and never needs a size per variant.

```css
.with-icon {
  display: inline-flex;
  align-items: baseline;
  gap: 0.5em;
}

.with-icon > svg {
  flex: none;
  block-size: 1cap;
  inline-size: auto;
}

.notice {
  display: flex;
  align-items: start;
  gap: 0.5em;
}

.notice > svg {
  flex: none;
  inline-size: 1em;
  block-size: 1lh;
}
```

Rules:

- Never size an icon in `px`. A 16px icon that matches 16px text is 5px to 7px shorter than the capitals of 32px text.
- Keep `flex: none`. Without it a long label squeezes the icon.
- The `svg` needs a `viewBox`. `inline-size: auto` then follows the drawing's ratio.
- Many icon sets leave padding inside the drawing, and `1cap` looks small on those. Raise the number and keep the unit, as in `1.2cap`.
- Do not use `align-items: center` on a label that can wrap. The icon then sits beside the middle line.
- With "Label centered on its letters with `text-box`" the trimmed label is `1cap` tall, so `align-items: center` lines the icon up with it at both edges.

Support: `cap` in Chrome 118, Firefox 97, Safari 17.2. `lh` in Chrome 109, Firefox 120, Safari 16.4. Tested in Chrome 150 and real Safari 27 on 2026-10-01, where the icon came out within 0.01px of the capital height at 16px and at 32px.

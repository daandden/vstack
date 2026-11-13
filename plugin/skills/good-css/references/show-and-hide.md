## Enter and exit transitions from `display: none`

For an existing display-toggled component, `allow-discrete` retains its box during an exit transition. Use this when the target browser and component lifecycle support it.

```css
dialog,
[popover] {
  opacity: 0;
  transition:
    opacity 0.2s var(--ease-out, ease-out),
    display 0.2s allow-discrete,
    overlay 0.2s allow-discrete;
}

dialog::backdrop {
  opacity: 0;
  transition:
    opacity 0.2s var(--ease-out, ease-out),
    display 0.2s allow-discrete,
    overlay 0.2s allow-discrete;
}

dialog[open],
dialog[open]::backdrop { opacity: 1; }

[popover]:popover-open { opacity: 1; }

@starting-style {
  dialog[open],
  [popover]:popover-open,
  dialog[open]::backdrop { opacity: 0; }
}

```

Rules:

- Put `@starting-style` after the open-state rule. It has no extra weight in the cascade.
- The dialog's `::backdrop` needs the same three states and its own transition, as in the block. Without them it snaps while the dialog fades.
- Write no fallback. Where the exit is not supported the element closes at once.
- Keep `[popover]:popover-open` out of the selector list that opens the dialog. A browser that does not know one selector in a list drops the whole rule, and the dialog would open at `opacity: 0`. Inside `@starting-style` the shared list is safe, because every browser that reads the block knows the selector.

Support: both directions in Chrome 117. In Safari 27 the entry animates and `<dialog>` and popovers close at once, tested in real Safari on 2026-10-01. An element toggled with a class animates both ways there. Firefox 129 animates the entry only.

## Popover anchored to its trigger

For a native popover already used by the project, anchor positioning can place it relative to its trigger without measuring its rectangle in a script.

```html
<button popovertarget="menu">Options</button>
<div id="menu" popover>
  <button>Rename</button>
  <button>Delete</button>
</div>
```

```css
@supports (position-area: block-end) {
  [popover] {
    margin: 0;
    margin-block-start: 0.5rem;
    position-area: block-end span-inline-end;
    position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;
  }
}
```

Rules:

- Use `span-*` values, not `center`. Adam Argyle found that `center` stops the flips when the popover is wider than its grid cell.
- `margin-block-start` is the gap between trigger and popover. The flip mirrors it, so the gap stays on the trigger's side.
- A popover opened by a script has no anchor and lands in the top-left corner. Pass the trigger, as in `menu.showPopover({ source: button })`.
- Write no fallback. Without support the `@supports` block is skipped and the popover opens centered in the viewport.

Support: Chrome 133, Firefox 147, Safari 26.

## Accordion that animates its height

For an existing `<details>` disclosure, `::details-content` and intrinsic-size interpolation can animate its content height.

```css
:root { interpolate-size: allow-keywords; }

details::details-content {
  height: 0;
  overflow: clip;
}

details[open]::details-content { height: auto; }

details::details-content {
  transition:
    height var(--motion-duration) var(--motion-easing),
    content-visibility var(--motion-duration) allow-discrete;
}
```

Rules:

- Put padding on an element inside, never on `::details-content`. Padding there stays visible when the accordion is closed.
- Give sibling `<details>` the same `name` attribute to keep one open at a time.
- Hide the marker with `summary { list-style: none; }` plus `summary::-webkit-details-marker { display: none; }` for Safari.
- Write no fallback. Safari and Firefox do not support `interpolate-size` yet, so they open and close without the animation.

Support: `::details-content` in Chrome 131, Safari 18.4, Firefox 143. `interpolate-size` in Chrome 129 only.

## Reveal with `clip-path`

For an overlapping panel whose height is unknown, `clip-path` can reveal its content without changing its dimensions.

```css
.menu {
  clip-path: inset(0 -3rem 100%);
  visibility: hidden;
}

.menu.is-open {
  clip-path: inset(0 -3rem -3rem);
  visibility: visible;
}

.menu {
  transition:
    clip-path var(--motion-duration) var(--motion-easing),
    visibility var(--motion-duration);
}
```

Rules:

- The negative inset must be larger than the shadow's blur plus its offset.
- Use it for panels that overlap the page. A closed panel in the normal flow leaves a gap, so an accordion uses "Accordion that animates its height".
- Add `round` with a radius inside `inset()` only when the clip itself should have round corners. The element's own `border-radius` still applies.

Support: every browser.

## Transition a custom property with `@property`

Use a registered property when CSS needs to interpolate a typed value. This example uses the project's existing timing tokens on one element.

```css
@property --progress {
  syntax: "<number>";
  inherits: false;
  initial-value: 0;
}

.indicator {
  rotate: calc(var(--progress) * 90deg);
  opacity: calc(0.5 + var(--progress) * 0.5);
  transition: --progress var(--motion-duration) var(--motion-easing);
}

.indicator.is-complete { --progress: 1; }
```

Rules:

- `initial-value` is required for every syntax except `"*"`.
- `rotate`, `scale` and `translate` do nothing on an inline element. Give the element `display: inline-block` or another box type first.
- A registration is global. Register each name once and keep the names specific.
- Other useful types are `<length-percentage>` for a gradient position and `<angle>` for a conic gradient.

Support: Chrome 85, Firefox 128, Safari 16.4.

## Cross-document view transitions

On a multi-page site, this rule enables the browser's cross-document transition without a client-side router.

```css
@view-transition { navigation: auto; }
```

Rules:

- Both pages must include the rule.

Support: Chrome 126, Safari 18.2. Firefox navigates as normal.

## Indicator that slides to the active item

Use it for the underline on a tab row or the bar beside a side nav. It replaces a script that measures the active item and writes a `transform` and a width.

```html
<nav class="tabs">
  <ul>
    <li><a href="/overview" aria-current="page">Overview</a></li>
    <li><a href="/pricing">Pricing and billing</a></li>
    <li><a href="/docs">Docs</a></li>
  </ul>
</nav>
```

```css
.tabs { anchor-scope: --active; }

.tabs ul {
  position: relative;
  display: flex;
}

.tabs [aria-current="page"] { anchor-name: --active; }

.tabs ul::after {
  content: "";
  position: absolute;
  position-anchor: --active;
  inset-block-end: 0;
  inset-inline-start: anchor(start);
  inline-size: anchor-size(inline);
  block-size: 2px;
  background: currentColor;
}

.tabs ul::after {
  transition:
    inset-inline-start var(--motion-duration) var(--motion-easing),
    inline-size var(--motion-duration) var(--motion-easing);
}
```

Rules:

- Keep `anchor-scope` on the component root. Without it an anchor name is global, and two navs on one page both follow the last active item.
- The list needs `position: relative`, so the bar is positioned against the box that holds the items.
- For a vertical list swap the axes. Use `inset-block-start: anchor(top)` and `block-size: anchor-size(height)`, and transition those two.
- Give the active item a second cue such as weight or color. A browser without anchor positioning drops the `anchor()` declarations and the bar has no width.

Support: Chrome 131, Firefox 147, Safari 26. Firefox places the bar and does not slide it.

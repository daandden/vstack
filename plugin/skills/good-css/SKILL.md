---
name: good-css
description: Modern CSS techniques that replace breakpoint ladders, wrapper elements and scripts. Use whenever you write, edit or review styles in any form, including plain CSS, Tailwind classes, StyleX, CSS-in-JS and inline styles, and whenever you build or restyle a page or component, even if the user never mentions CSS.
---

# Good CSS

Use these CSS techniques where they fit the project's layout, component lifecycle, and browser targets.

Each technique is a set of properties and values, so it works in any authoring system. Class names in the examples are placeholders. Write the declarations in what the project already uses, whether that is a stylesheet, Tailwind utilities, or StyleX objects. Where that system has no shorthand for a declaration, use a Tailwind arbitrary property or a rule in the project's CSS file.

## In all CSS

These need no file.

- Write colors in `oklch()`, with `none` as the hue of a gray, white or black. Derive a hover, tint or transparent version with `color-mix(in oklch, …)`.
- Put sizes that grow with the screen in one `clamp()` token.

## Read the entry before you write

Each file holds entries with the CSS and its rules. The rules are the conditions the CSS needs to work, so keep all of them. Read only the files whose row matches what you are about to write. One component matches two or three, and a whole page matches most of them.

| Read | Before you write |
| --- | --- |
| `references/foundations.md` | scoped base styles, color tokens, dark mode, or a fluid spacing scale |
| `references/layout.md` | a page or section container or any centered `max-width` wrapper, whether or not anything goes edge to edge, a grid of cards, cards whose parts line up, a sidebar, a component placed in slots of different widths, overlapping layers, centered content that can overflow |
| `references/spacing-and-shape.md` | spacing between sections, elements stacked one above another, one item pushed to the far end of a row or column, nested rounded corners |
| `references/text-and-media.md` | text or images that come from a user or a CMS, such as names, titles, excerpts, thumbnails, avatars and embeds, an icon next to a label, a label that looks off-center, numbers in a column |
| `references/interaction.md` | an enlarged hit area, a clickable card, form validation, a textarea, a parent styled by what it contains, or page scroll locked behind a modal |
| `references/motion.md` | a registered custom property, a cross-document view transition, or an anchor-positioned active indicator |
| `references/show-and-hide.md` | a dialog, popover, dropdown menu or accordion |
| `references/scroll-and-viewport.md` | carousel controls and snap alignment, a scroll area between a header and footer, overflow-dependent styling, or in-page links under a sticky header |

## Left out on purpose

Never add `text-box` trim on `*`, `text-rendering: optimizeLegibility`, or a reset that puts `display: contents` or one shared grid cell on every element. `references/foundations.md` has the reasons.

## Browser support

Most entries end with a `Support:` line. This skill sets no browser floor. Weigh the line against the browsers the project targets, and tell the user when something you used is missing from one of them.

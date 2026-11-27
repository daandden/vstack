# vstack drops Doop, and the reader theme holds the compact design

The user chose this in chat on 2026-11-27. vstack designs with OpenPencil through the open-pencil Utility, as [ADR 20261126-the-open-pencil-utility-hands-over-a-design-baseline-kept-in-pikpak](20261126-the-open-pencil-utility-hands-over-a-design-baseline-kept-in-pikpak.md) describes. Doop is no longer part of vstack. This amends [ADR 20261119-the-flow-reader-uses-web-fullstack-frontend-choices-and-the-doop-compact-design](20261119-the-flow-reader-uses-web-fullstack-frontend-choices-and-the-doop-compact-design.md). It also amends the statements about the Doop compact design in ADR 20261126-the-open-pencil-utility-hands-over-a-design-baseline-kept-in-pikpak and [ADR 20261126-web-fullstack-recommends-ui-sdk-and-the-reader-keeps-reka-for-now](20261126-web-fullstack-recommends-ui-sdk-and-the-reader-keeps-reka-for-now.md).

The Flow reader keeps the compact design that ADR 20261119-the-flow-reader-uses-web-fullstack-frontend-choices-and-the-doop-compact-design adopted. `reader/app/assets/theme.css` and the reader's components now define that design. The Doop canvas "flow page" (DC6Hzugx8b) and its style guide "Flow reader compact design" are no longer references. A later change to the reader's design goes through the open-pencil Utility and a Design baseline.

## Consequences

- Verify drops the step `flow-page-styling-doop`, because it compared the shipped reader with Doop frames. `flow-page-styling-keys` takes over its captures in both themes: Select open, form errors, Metrics, and the other reader views, each saved as a lossless WebP screenshot with its ARIA snapshot.
- Specs and tickets that name Doop frames, such as #542 and #555, stay unchanged as history.

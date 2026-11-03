# Materials and typography

Read when choosing translucent layers, depth, text hierarchy, or multimodal feedback. Apply the reason for a treatment, not an Apple-like appearance by itself.

## Materials and depth

Translucent toolbars and sheets can explain a floating layer while content scrolls beneath it. Use a semi-transparent background and `backdrop-filter` only where that hierarchy helps. Keep a legible solid fallback for unsupported engines and user preferences.

Material weight conveys hierarchy. Heavier, darker surfaces can separate structural regions. Lighter layers can emphasize an interactive element. Avoid stacking light translucent surfaces because text contrast becomes unpredictable. A larger surface may need stronger separation than a chip. Judge shadow and blur against the actual content behind them.

A modal task needs a scrim and proper modal semantics. A parallel panel can preserve context without a scrim. Stacked sheets need increasing separation between layers. Use higher-contrast text and a suitable weight over changing backgrounds. Put color that must remain stable on a solid layer.

Where floating chrome overlaps scrolling content, a small gradient or blur at the scroll edge can explain that overlap. An ordinary non-overlapping header does not need it. For material entry, coordinated scale and blur can convey thickness, but reduced motion and measured rendering cost constrain the effect. ADR 0051 requires browser-qualified judgment rather than an automatic prohibition or approval of blur animation.

Respect `prefers-reduced-transparency` with a more opaque or solid surface and no blur. Respect `prefers-contrast: more` with legible backgrounds and defined borders. Check engine support and provide a readable default when a preference query is unavailable.

## Typography

Use the platform's system font unless the project has a reason for another face. Optical sizing depends on the chosen font's capabilities. Do not assume `font-optical-sizing: auto` supplies an optical-size axis to every font.

Treat size, weight, leading, and tracking as one hierarchy. Large headings often benefit from tighter leading and slightly negative tracking, such as `-0.02em`. Leave body tracking near zero, with comfortable leading such as 1.5. Small text can need more tracking. Adjust for the actual font and writing system rather than applying one value globally.

Use relative units for text and surrounding spacing. Exercise larger text and zoom so controls and labels remain usable. A display heading can start at `clamp(2rem, 5vw, 4rem)` with leading near 1.05, while body text remains readable. These examples are starting points, not a replacement for good-css's layout and accessibility rules.

## Multimodal feedback

Match feedback to the causal event, keep visual and supported audio or haptic feedback synchronized, and reserve extra signals for meaningful events. Success, errors, a committed action, or a snap can earn feedback. Routine decorative sound or vibration trains users to ignore it.

Browser audio policies, Vibration API support, device capabilities, and permission requirements differ. Inspect the application and target platform before claiming sound or haptics work. Do not substitute a JavaScript call for observing the actual device. Provide visible feedback without depending on sound or vibration.

Under reduced motion, use static state changes or brief opacity or color feedback instead of springs, slides, scaling, and parallax. Avoid slow oscillating loops, large moving backgrounds, and abrupt brightness changes. Observe the resulting content and focus, not just the CSS preference declarations.

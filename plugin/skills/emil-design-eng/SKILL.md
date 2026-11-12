---
name: emil-design-eng
description: "Use when building, polishing, or reviewing frontend controls, component interactions, immediate feedback, or purposeful UI motion."
---

# Design engineering

Apply Emil Kowalski's design-engineering guidance to the frontend task already in progress. This is reference knowledge, not another entry flow. The running vstack skill and its workers retain edits, planning, review, verification, and evidence ownership. Keep the project's stack and the user's scope.

Adapted from [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/7cdf99421429c0a47d2cf9fbf40497b7ee0a3e5c/skills/emil-design-eng). The [MIT notice](LICENSE) ships with this skill.

## Decide before adding motion

Explain the interaction's frequency and purpose before choosing an effect. A functional state change must remain immediate and usable while an effect runs.

| Frequency | Default |
| --- | --- |
| Hundreds of times daily, such as keyboard shortcuts and command palettes | Instant. Omit opening and closing motion. |
| Tens of times daily, such as list navigation and hover | Omit or greatly reduce motion. |
| Occasional dialogs, drawers, and notifications | Short motion can explain the change. |
| Rare onboarding or explanatory moments | More expressive motion can help when it serves the content. |

Keep keyboard-initiated actions instant. Decoration alone does not justify delaying a repeated action. Useful purposes include spatial continuity, a changed state, an explanation, and feedback confirming a press. For example, a toast should enter and leave from a consistent direction, and a drag dismissal should continue that direction.

### Easing and timing

When choosing easing or duration, read the Easing and Duration sections of skill://review-animations/STANDARDS.md. Apply their shared curves, component budgets, and qualified exceptions to the actual interaction.

- Once a tooltip is open, adjacent tooltips should appear without the first tooltip's delay or animation. Avoid accidental activation on the first hover.
- A deliberate hold can take longer than its release. A hold-to-delete fill might take 2s linear, with a 200ms ease-out reset. Provide an accessible keyboard alternative to a pointer hold.

A fast effect cannot make a slow operation complete sooner. Keep real pending state visible and controls honest. Perceived responsiveness comes from immediate feedback and avoiding unnecessary waits.

## Build the whole interaction

Read [component details](references/components.md) when implementing controls, popovers, enter/exit states, clipping, or coordinated motion. Read [gestures and rendering](references/gestures-and-rendering.md) for springs, drag, performance, or animation diagnosis. These are conditional references, not extra workflows.

Polish includes reliable behavior users rarely notice. Preserve focus, input, cancellation, empty states, and interrupted interactions. Choose useful defaults rather than exposing every visual parameter. Keep visual rhythm, timing, and component personality consistent. A professional dashboard usually benefits from crisp responses; an occasional playful interaction can tolerate bounce.

For touch-facing web controls, viewport height, safe areas, hover gating, or mobile inputs, read skill://mobile-native. For direct manipulation, interruptible motion, materials, or Apple-derived typography and feedback, read skill://apple-design. Apply only the guidance relevant to the current interaction.

Study a relevant working interface when the design is uncertain. Inspect what makes its interaction effective rather than copying its appearance wholesale. Test the actual result, including rapid reversal and keyboard use. A fresh look or slow playback can reveal defects, but do not delay the current delivery waiting for a next-day review.

## Accessibility and authority

Emil-derived guidance takes precedence wherever it conflicts with good-css, for CSS and animation under ADR 0074-emil-derived-skills-are-visible-utility-skills-and-hold-over-good-css, which amends ADR 0051. Resolve disagreements within Emil's guidance with browser-specific behavior and observed evidence. Preserve skill://review-animations' blocking verdicts when the applicable rule and evidence justify them. Transform and opacity are preferred starting points, not proof that every other animated property is forbidden or that every transform is composited.

- Under `prefers-reduced-motion: reduce`, remove movement, positional effects, decorative stagger, and scaling feedback. A brief opacity or color change can remain when it helps comprehension and respects the user's preference. An instant change is valid.
- Gate hover effects with `@media (hover: hover) and (pointer: fine)`.
- Give pressable controls immediate feedback. A subtle `scale(0.95)` to `scale(0.98)` is useful only where motion is appropriate; provide nonmoving feedback for reduced-motion and repeated keyboard use.
- Keep controls operable during effects. Preserve semantic controls, focus-visible indication, accessible names, and status announcements.

Before using a library API, inspect the application's installed dependency and version, then consult documentation for that version. The references describe patterns, not a requirement to install Motion, Base UI, Sonner, or another library. Check browser support against the project's target engines. A successful observation proves only that browser and scenario.

## Review and proof

Use the existing review owner's finding format and severity rules. For a suggested UI change, a `Before | After | Why` table can make the comparison concrete. Attach file locations and observed behavior. A blocking motion finding needs an applicable rule and evidence, not just an unqualified transform-and-opacity-only claim.

Exercise the resulting UI through the project's Verify workflow. Observe the ordinary path, keyboard path, reduced motion, and relevant interruption or touch behavior. Retain actions and outcomes with the owner's browser evidence. Code inspection and a loaded skill alone do not prove the interaction works.

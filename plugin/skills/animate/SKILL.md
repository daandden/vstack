---
name: animate
description: "Use when building web animations, choosing purposeful motion, or defining timing, interruption, and reduced-motion behavior."
---

# Build motion

Apply this knowledge inside the frontend task already in progress. The running vstack skill and its workers own implementation, planning, review, verification, and evidence. Keep the existing stack and scope. This Utility skill starts no separate flow or animation-plan file.

Adapted from [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/a81dbca07f2217b7103e510c0f13f8d5b017afc9/skills/animate). The [MIT notice](LICENSE) ships here.

## Decide in this order

1. Decide whether the interaction should animate. Keyboard shortcuts, command palettes, and actions repeated hundreds of times daily should be instant. Tens of daily uses warrant little or no movement. Occasional disclosures, drawers, and notifications can use short motion. Reserve expressive celebration for rare events. A request can correctly produce a nonmoving state change.
2. Name the purpose: feedback, spatial continuity, state indication, avoiding a jarring change, or explanation. Decoration does not justify moving data the user is reading or acting on.
3. Choose the least complex tool that fits. Use CSS transitions for state toggles, hover, and press. Use `@starting-style` for supported entry lifecycles. CSS keyframes suit predetermined playback. WAAPI adds programmatic control without a library. Springs and gesture-driven values can justify an existing motion library. CSS and WAAPI can offload eligible properties, not all animations.
4. Choose properties with the same visual and semantic result. Start with transform and opacity. Scaling text or a whole panel is not equivalent to reflowing content. Height can be appropriate for a disclosure. Clip-path can reveal content without changing its dimensions. Check support and observe cost in the target browser before rejecting or approving a technique.
5. Reuse the project's motion tokens and choose timing and easing from the guidance below. Do not add a parallel token system.
6. Define reversal, cancellation, exit, and unmount behavior. A CSS transition retargets from its current value, unlike restarting keyframes. A gesture spring should preserve velocity. Exit through the same direction as entry. Keep functional state and controls usable during the effect.
7. Ship the reduced-motion and pointer behavior with the interaction. Observe the result through the existing Verify owner before claiming success.

Use the project's existing accessible component or native semantic control. Retain focus management, keyboard behavior, accessible names, announcements, and cancellation. This guidance does not require a new component library.

## Timing and properties

When choosing easing or duration, read the Easing and Duration sections of skill://review-animations/STANDARDS.md for the shared curves, component budgets, and qualified exceptions. Reuse the project's motion tokens rather than creating a parallel set.

A spring can suit momentum and reversal. With an installed library supporting these options, `{ type: 'spring', duration: 0.5, bounce: 0.2 }` is a starting point, not a stack-independent API contract. Avoid bounce in routine UI.

- Name transition properties rather than `all`.
- Start scale entrances near 0.9–0.97 with opacity, not `scale(0)`.
- Anchor a popover's transform origin at its trigger. A centered modal is different. Confirm how the actual component exposes the origin.
- Percentage translation uses the element's own dimensions and suits variable-height drawers.
- Write a dragged element's transform directly when an inherited custom property would recalculate a large descendant tree.
- Motion shorthand transforms and full transform strings can take different rendering paths. Inspect the installed version and measure under load before asserting acceleration. Read skill://animation-performance when choosing a driver or investigating stutter.

## Component recipes

Read [RECIPES.md](RECIPES.md) when building a press state, popover, tooltip, modal, drawer, toast, disclosure, stagger, hold, tab indicator, reveal, drag dismissal, crossfade, or programmatic playback. Adapt the recipe to the actual component lifecycle and browser. Its examples are not permission to discard accessibility or install dependencies.

Under `prefers-reduced-motion: reduce`, remove positional movement, scaling, and decorative stagger. An instant state change is valid. A brief opacity or color change may help comprehension. Gate hover with `@media (hover: hover) and (pointer: fine)`. Keep repeated keyboard actions instant even when pointer activation uses motion.

## Authority and hand-back

Emil-derived guidance takes precedence over skill://good-css for CSS and animation under ADR 0074, which amends ADR 0051. Good-css still covers other styling and accessibility requirements where Emil guidance does not conflict. Reconcile conflicts within Emil guidance using browser-specific behavior and observed evidence. Preserve skill://review-animations' blocking verdicts when the applicable rule and evidence justify them. A transform-and-opacity-only statement alone cannot block a supported clip-path or intrinsic-size technique. Neither property spelling nor a library name proves smoothness or compositor execution.

Before using library APIs, inspect the runnable application's installed dependencies and version, then consult matching documentation. Scope engine claims to the observed engine and scenario.

Return the frequency and purpose, chosen driver, properties, timing, interruption behavior, and reduced-motion result to the existing owner. Include file locations and remaining browser checks. Observe ordinary, keyboard, rapid-reversal, cancellation, and reduced-motion paths. Where feel needs comparison, slow playback or inspect frames, then restore production timings. A loaded reference and code inspection are not UI proof.

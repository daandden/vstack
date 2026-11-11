---
name: apple-design
description: "Use when building or reviewing Apple-inspired web interactions, direct manipulation, interruptible motion, translucent materials, typography, or physical feedback. Not native Swift or Expo development."
---

# Apple design for the web

Apply this knowledge to the frontend task already in progress. The running vstack skill and its workers own edits, planning, review, verification, and evidence. Keep the project's stack and scope. This Utility skill does not start a design flow or a native-app implementation.

Adapted from [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/a81dbca07f2217b7103e510c0f13f8d5b017afc9/skills/apple-design), drawing on Apple's WWDC interface-design talks. The [MIT notice](LICENSE) ships with this skill.

## Response and control

Make the interface respond immediately and remain predictable. Give press feedback on pointer-down through `:active` or Pointer Events, but commit a button action on release so the user can cancel. Preserve semantic click and keyboard activation. Audit unnecessary debounce, timers, transition waits, and tap delays before adding effects.

For a drag, update continuously with the pointer rather than waiting for a final swipe event. Keep input available during transitions. An interrupted effect starts from its current on-screen value, not its old target. Reversal must not jump or wait for an exit animation to finish.

Read [physical interaction](references/physical-interaction.md) when implementing drag, swipe, a spring, momentum, or an interruptible sheet. It covers capture, release velocity, projection, resistance, and gesture arbitration. Use springs where continuity and velocity matter, not as a requirement to animate every control. For high-frequency or keyboard actions, follow skill://emil-design-eng's instant-response guidance.

## Space, materials, and type

Enter and exit along the same path. Anchor a popover or menu to its trigger and use an origin that explains the relationship. A reversible transition should preserve spatial continuity in both directions. Intermediate motion should indicate the destination rather than obscure the user's next action.

Read [materials and typography](references/materials-and-type.md) when choosing translucent chrome, visual depth, text hierarchy, or multimodal feedback. Materials serve hierarchy and legibility, not a requirement to make every surface glass.

## Design decisions

Use these principles to judge the existing task:

- Purpose. Keep only features that earn the user's time and attention.
- Agency. Keep people in control. Offer cancellation or undo, and reserve confirmation for genuinely irreversible actions.
- Responsibility. Protect privacy and safety. Request only necessary information at the relevant moment and expose meaningful risk before commitment.
- Familiarity. Use recognizable controls and consistent placement. A familiar appearance should predict familiar behavior.
- Flexibility. Support touch, precise pointers, keyboard use, larger text, and the actual platform's capabilities.
- Simplicity. Show the common path first. Useful context can simplify a task more than hiding controls does.
- Craft. Choose spacing, hierarchy, timing, and alignment deliberately. Exercise rotation, scrolling, and interrupted input rather than inspecting only a still image.
- Delight. Aim for confidence, calm, or another purposeful response. Decoration is not a substitute for the preceding principles.

Provide status, completion, warning, and error feedback where each applies. Validate at a useful time without showing premature errors. Make location, available actions, and a way out clear. Put related controls near the content they affect, with direct and specific labels. Keep text labels where accessibility or unfamiliar controls require them.

## Accessibility and authority

For mobile-web viewport, safe-area, touch, hover, or input work, read skill://mobile-native. Retain zoom, keyboard operation, focus restoration, accessible names, and status announcements.

Under reduced motion, replace movement, elastic overshoot, scaling, and parallax with instant changes or brief nonmoving feedback. For reduced transparency, use solid or more opaque surfaces. For increased contrast, provide legible near-solid backgrounds and defined borders. Check support for each preference in the target engine. Avoid full-screen moving backgrounds, slow looping oscillations, and abrupt brightness changes.

Emil-derived guidance takes precedence over good-css for CSS and animation under ADR 0074, which amends ADR 0051. Prefer transform and opacity where appropriate, but a blanket compositor-only rule is not a blocking verdict. Reconcile disagreements within the UI guidance using browser-specific behavior and observed evidence. Preserve skill://review-animations' blocking verdicts when the applicable rule and evidence justify them. Add `will-change` only when an imminent effect and measurement justify it, then release it. Browser-supported blur or other properties need scenario-specific performance evidence.

Before using a spring or component library, inspect the application's installed version and consult its applicable documentation. The references explain patterns, not a dependency installation requirement. Do not claim Apple's damping ratio is the same parameter as a library's physical damping constant or that all libraries preserve velocity automatically.

## Apply and observe

Design interaction and visuals together within the existing implementation or prototype owner. Preserve that owner's retained-evidence contract. Exercise the resulting UI through the project's Verify workflow, including interruption, cancellation, keyboard, reduced motion, and applicable touch behavior. A slower playback or frame inspection can reveal jumps that normal playback hides.

Return findings in the existing review owner's format with file locations and observed consequences. Report the actual engine, dependencies, and unavailable hardware checks. An observed web scenario is not proof of native iOS, Expo, Swift, or every browser.
